# Full-depth devices in the rear view: policy and visual treatment

Date: 2026-06-26
Status: Approved design, ready for implementation plan
Related: Issue #2337 (rear rack view shows nothing for full-depth devices)

## Problem

A full-depth device physically occupies the entire depth of the rack, so it is visible from both the front and the rear. In the current app a full-depth device can end up rendered only on the front, leaving the rear view empty. This was observed with a 4U "NAS" device that has Depth: Full but appears only in the front panel.

## Diagnosis

The rear view rendering is correct. The face filter in `Rack.svelte:256-266` includes a device on a given face when `placedDevice.face === "both"` or it matches the current face. Full-depth devices are meant to receive `face: "both"` at placement time (`recorded-device-actions.ts:133-139`), and a regression test already covers the both-faces case (`src/tests/rear-view-full-depth.test.ts`, Issue #2337).

The NAS is empty on the rear because its stored `face` is `"front"`, not `"both"`. The edit panel confirms this: Mounted Face is set to Front, with the note "Overriding default full-depth setting" (rendered only when a full-depth device is pinned to a single face). The device is in a physically impossible state: a full-depth chassis that is invisible from the back.

Root cause: the Mounted Face control (`EditPanelMetadata.svelte:448-468`) lets a user set a full-depth device to Front or Rear, and `updateDeviceFace` (`recorded-device-actions.ts` around 429-463) writes that value with no guard. The app actively permits the inconsistency, and stored or imported data can carry it in.

There is a second, separate gap. Even when a full-depth device does appear on the rear with `face: "both"`, today it renders as an identical clone of the front: same colour, same label, same icon. The back of a real device looks nothing like its front, so the rear view reads as a confusing duplicate.

## Goals

- A full-depth device always appears on both the front and the rear.
- A full-depth device cannot be pinned to a single face through the UI.
- Existing layouts that carry a front-pinned or rear-pinned full-depth device are corrected on load, including prior-release data.
- The rear view visually distinguishes the back of a full-depth device from its front.

## Non-goals

- No change to half-depth rear-mounted devices. They already render correctly on the rear, showing the face the user actually accesses.
- No change to cabling or port rendering.
- No change to the front view.
- No schema change. The `face` and `is_full_depth` fields are sufficient.

## Decisions

1. Face policy: full-depth means always both. The front/rear-only override is removed for full-depth devices. Front and rear remain meaningful only for half-depth devices.
2. Rear visual: distinct rear treatment. The rear of a full-depth device gets a muted fill and a small "rear" affordance, and it uses the device rear image when one exists.
3. Enforcement strategy: hybrid. Normalize on hydrate, guard the edit path, and apply the visual treatment. This is the smallest change that is correct across every consumer (canvas, SVG export, annotations, collision), rather than re-normalizing at each render site.

## Design

### Behaviour and policy

Placement. No change. `recorded-device-actions.ts:133-139` already forces `face: "both"` when `is_full_depth !== false`.

Update guard. `updateDeviceFace` (`recorded-device-actions.ts` around 429-463) rejects any attempt to set a full-depth device to a value other than `"both"`. The function looks up the placed device's type to read `is_full_depth`. Half-depth devices keep their existing Front and Rear behaviour.

Edit panel control (`EditPanelMetadata.svelte:448-468`). Replace the fixed three-way dropdown with face-aware controls:

- Full-depth device: a read-only "Both (full-depth)" indicator. No override. The misleading "Overriding default full-depth setting" note is removed, since the override no longer exists.
- Half-depth device: a Front and Rear control only. The "Both" option is dropped for half-depth, because a half-depth device occupies only one side.

Normalization on hydrate. When a layout is loaded into the store, any placed device whose type is full-depth is coerced to `face: "both"`. Half-depth devices are left untouched. This is a legacy-data adapter and required code, not a dead-code hack: it lets prior-release layouts load correctly and fixes the observed NAS the moment its layout is reopened. The exact hydrate seam (store hydration versus YAML import path) is identified during planning; the normalization lives at the single point where placed devices first enter the store so every downstream consumer sees the corrected value.

### Visual: rear treatment

All changes are scoped to `RackDevice.svelte`, which already computes `currentFace` (line 158) and already swaps to the rear image when present (lines 177-191).

New derived flag:

```
isRearTreatment = currentFace === "rear" && device.is_full_depth !== false
```

Keying on full-depth, not on the view alone, is deliberate. A rear-mounted half-depth device shows its real front from the back, so it must not be muted. Because policy enforces full-depth equals both, "shown in the rear view and full-depth" is exactly "the back of a full-depth device."

Rendering rules when `isRearTreatment` is true:

- Real rear image present: render the image (already happens) and add the small "rear" affordance for consistency. Do not mute, since the image already differentiates front from back.
- Colour and label fallback (no real rear image): apply a muted, desaturated fill and the "rear" affordance, while keeping the label legible. Text contrast stays within the project's WCAG 2.2 AA design tokens; the muted fill must not push the label below the contrast floor.

The exact visual polish (badge shape and placement, desaturation versus a hatch overlay, token choices) is refined with the frontend-design skill during planning and implementation. The design fixes the behaviour and the structural hooks; it does not prescribe pixel-level styling here.

### Areas explicitly unchanged

- Face filter (`Rack.svelte:256-266`) already includes `"both"` on both faces.
- SVG export face filter (`utils/svg.ts`) already includes `"both"` on both faces.
- Annotation column face filter already handles face correctly.

## Component responsibilities

- `recorded-device-actions.ts`: owns the face invariant. Placement forces both for full-depth; the update action guards against breaking it.
- Store hydration seam: owns legacy-data normalization, coercing full-depth placements to both as they enter the store.
- `EditPanelMetadata.svelte`: presents face controls that cannot express an invalid state. Full-depth is read-only both; half-depth is front or rear.
- `RackDevice.svelte`: owns the rear visual treatment, derived purely from `currentFace` and the device type's `is_full_depth`.

## Data model

No schema change.

- `PlacedDevice.face: "front" | "rear" | "both"` (`types/index.ts:572`).
- `DeviceType.is_full_depth?: boolean`, undefined or true means full-depth (`types/index.ts:485`).

The invariant added by this design: when a placed device's type is full-depth, its `face` is always `"both"`.

## Backward compatibility and migration

Per the project's prior-release data policy, reading data written by a prior release is a tested requirement.

- Normalization on hydrate makes any prior-release layout with a front-pinned or rear-pinned full-depth device load as both. No destructive change; the corrected value persists on the next save.
- Add an upgrade-corpus fixture (`src/tests/fixtures/upgrade-corpus/`) representing a prior-release layout that contains a full-depth device stored with `face: "front"`, asserting it loads as `face: "both"` and renders on both faces.

## Testing

- Unit: the update guard rejects setting a full-depth device to front or rear and accepts both; it leaves half-depth devices free to be front or rear.
- Unit: hydrate normalization coerces a full-depth placement from front to both and leaves half-depth placements untouched.
- Existing: `src/tests/rear-view-full-depth.test.ts` continues to pass.
- Rendering behaviour: a full-depth device with no rear image renders the muted rear treatment under the rear filter; a rear-mounted half-depth device does not get the muted treatment. Tests assert behaviour, not exact colours or class names, per the project testing rules.
- Upgrade corpus: the new fixture loads and renders on both faces.

Edit-panel control structure is presentational; following the project testing policy it does not get DOM-structure tests.

## Open items deferred to planning

- Pin the exact hydrate seam for normalization (store hydration versus YAML and other import paths) so normalization sits at a single chokepoint.
- Confirm whether any non-UI write path can still set a full-depth face to a single value, and guard it if so.
- frontend-design pass on the rear affordance and muted fill against the design tokens.
