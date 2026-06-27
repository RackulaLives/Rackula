# Full-depth devices in the rear view: policy and visual treatment

Date: 2026-06-26 Status: Approved design, revised after devil's-advocate review, ready for implementation plan Related: Issue #2337 (rear rack view shows nothing for full-depth devices)

## Problem

A full-depth device physically occupies the entire depth of the rack, so it is visible from both the front and the rear. In the current app a full-depth device can end up rendered only on the front, leaving the rear view empty. This was observed with a 4U "NAS" device that has Depth: Full but appears only in the front panel.

## Diagnosis

The rear view rendering is correct in the common case. The face filter in `Rack.svelte:256-266` includes a device on a given face when `placedDevice.face === "both"` or it matches the current face. Full-depth devices are meant to receive `face: "both"` at placement time (`recorded-device-actions.ts:133-139`), and a regression test already covers the both-faces case (`src/tests/rear-view-full-depth.test.ts`, Issue #2337).

The NAS is empty on the rear because its stored `face` is `"front"`, not `"both"`. The edit panel confirms this: Mounted Face is set to Front, with the note "Overriding default full-depth setting" (rendered only when a full-depth device is pinned to a single face). The device is in a physically impossible state: a full-depth chassis that is invisible from the back.

Root cause: the Mounted Face control (`EditPanelMetadata.svelte:448-468`) lets a user set a full-depth device to Front or Rear, and `updateDeviceFace` (`recorded-device-actions.ts` around 429-463) writes that value with no guard. The app actively permits the inconsistency, and stored or imported data can carry it in.

There is a second, separate gap. Even when a full-depth device appears on the rear with `face: "both"`, today it renders as an identical clone of the front: same colour, same label, same icon. The back of a real device looks nothing like its front, so the rear view reads as a confusing duplicate.

### Why stored face cannot be trusted (the load-bearing finding)

Collision is face-authoritative. `collision.ts` (lines 95-104, 168-172, 226-229) decides overlap purely from the stored `face` value: `doFacesCollide` treats `"both"` as colliding with everything, the same explicit face as colliding, and opposite explicit faces as never colliding, with the explicit comment "Face is authoritative: only the explicit face value matters for collision."

Two consequences follow:

1. A full-depth device stored as `face: "front"` does not collide on the rear. So a prior-release or imported layout can legitimately hold a full-depth device at U10 front and a half-depth device at U10 rear, with no collision today. Any scheme that mutates the full-depth device to `"both"` would make it collide ("both collides with everything") and manufacture an overlap the rest of the app assumes is impossible.
2. The app is already internally inconsistent: collision treats a full-depth front-pinned device as not occupying the rear, while rendering and blocked-slots treat full-depth as occupying both. The override and legacy data expose this split.

Because of (1), data migration is the wrong correctness mechanism. Because of (2), the fix should reconcile every face-consuming site on a single definition of where a full-depth device sits.

## Goals

- A full-depth device always appears on both the front and the rear, regardless of its stored `face` value.
- A full-depth device cannot be pinned to a single face through the UI, and the control explains why and where depth is set.
- Prior-release and imported data render correctly without a migration step that can create overlaps.
- The rear view visually distinguishes the back of a full-depth device from its front.
- An empty rear view reads as informative, not broken.

## Non-goals

- No change to half-depth rear-mounted devices. They already render correctly on the rear, showing the face the user actually accesses.
- No change to cabling or port rendering in this iteration (named as a follow-up below).
- No horizontal mirroring of the rear view in this iteration (named as a follow-up below).
- No schema change. The `face` and `is_full_depth` fields are sufficient.

## Decisions

1. Face policy: full-depth means always both. The front/rear-only override is removed for full-depth devices. Front and rear remain meaningful only for half-depth devices.
2. Correctness mechanism: derive, do not migrate. A single helper computes the effective face of a placed device from its type's depth, and every face-consuming site reads through it. Stored `face` is non-authoritative for full-depth devices.
3. Rear visual: distinct rear treatment. The rear of a full-depth device uses the device rear image when present, and otherwise a differentiated colour/label treatment. Whether differentiation is desaturation, a badge, or both is settled in the frontend-design pass.

## Design

### Effective face: the single source of truth

Add a pure helper:

```text
effectiveFace(placedDevice, deviceType): DeviceFace
  // full-depth (is_full_depth !== false) -> "both"
  // otherwise -> placedDevice.face
```

Route every face-consuming site through it, so a full-depth device is treated as occupying both faces by derivation, never by trusting stored data:

- Render filter, `Rack.svelte:256-266` (currently keys on `placedDevice.face`).
- SVG export filter, `utils/svg.ts` (currently keys on `d.face`).
- Blocked-slots hatching, `utils/blocked-slots.ts` (already keys on `is_full_depth` in spirit; switch to the shared helper for consistency).
- Collision, `utils/collision.ts`: callers pass `effectiveFace(...)` into `doFacesCollide` instead of raw `placedDevice.face`. This reconciles the collision-versus-render split noted in the diagnosis.
- Annotation column, `AnnotationColumn.svelte:62`, which today filters `d.face === faceFilter` with no `"both"` handling at all, so full-depth annotations are currently dropped. Routing through the helper and including `"both"` fixes that latent bug too.

Result: a physically-invisible full-depth device is unrepresentable, and a full-depth device blocks and annotates on both faces, no matter what `face` value its stored or imported data carries. The reported NAS renders on the rear immediately, with no load-time mutation.

### Behaviour and policy

Placement. Retain `recorded-device-actions.ts:133-139` forcing `face: "both"` for full-depth. It keeps newly written data clean. It is no longer load-bearing for correctness, since derivation covers it.

Update path. `updateDeviceFace` (`recorded-device-actions.ts` around 429-463) only ever stores `"both"` for a full-depth device. With derive-on-read this is about keeping stored data clean and the UI honest, not about correctness.

Edit panel control (`EditPanelMetadata.svelte:448-468`). Replace the fixed three-way dropdown with face-aware controls:

- Full-depth device: a read-only "Both (full-depth)" indicator with a short reason ("set by device depth") and, for editable custom device types, a pointer to where depth is changed. This gives a user who genuinely wants front-only the correct lever instead of a dead end. The misleading "Overriding default full-depth setting" note is removed.
- Half-depth device: a Front and Rear control only. The "Both" option is dropped for half-depth, because a half-depth device occupies only one side.

Runtime depth changes. Because depth is a device-type property, a custom type flipped from half to full mid-session would otherwise break the invariant until reload. Derive-on-read covers this with no extra hook: the next render reads the new depth and treats existing placements as both.

Stored-data cleanup (optional, cosmetic). Stored `face` values are corrected opportunistically when a layout is next saved, not via a dedicated load-time migration. Nothing is mutated on open. This deliberately avoids the dirty-on-open and undo hazards below.

### Visual: rear treatment

All changes are scoped to `RackDevice.svelte`, which already computes `currentFace` (line 158) and already swaps to the rear image when present (lines 177-191).

New derived flag:

```text
isRearTreatment = currentFace === "rear" && device.is_full_depth !== false
```

Keying on full-depth, not on the view alone, is deliberate. A rear-mounted half-depth device shows its real front from the back, so it must not be differentiated. "Shown in the rear view and full-depth" is exactly "the back of a full-depth device."

Rendering rules when `isRearTreatment` is true:

- Real rear image present (placement rear image, or device-type rear image): render the image, already wired, and add the small "rear" affordance for consistency. The image already differentiates front from back.
- Image display mode with no rear image: fall back to the colour/label treatment below, not the bare image placeholder (`showImagePlaceholder`, `RackDevice.svelte:199`). Most device types have no rear image, so without this rule the rear in image mode becomes a wall of placeholders, which is worse than the original bug.
- Colour/label fallback: a differentiated treatment plus the "rear" affordance, keeping the label legible within the project's WCAG 2.2 AA tokens.

Open visual question for the frontend-design pass: desaturation risks reading as "disabled" and demoting the rear to a second-class surface, and colour is identity (recognising "that green NAS" from both sides matters). The candidates to compare are colour-identity plus a clear REAR badge, light desaturation plus a badge, or desaturation reserved only for the no-image label case. The design fixes behaviour and the structural hooks; it does not prescribe the final styling here.

### Empty-view feedback

The reported symptom was half data bug and half feedback gap: an empty rear gave no signal whether it meant "broken" or "nothing rear-facing here". A rack of shallow front-mounted gear has a legitimately empty rear even after this fix. Add an empty-state hint to a face panel that renders no devices, for example "No rear-facing or full-depth devices". This addresses the user's actual confusion more directly than the data fix alone, and applies symmetrically to an empty front.

## Component responsibilities

- `effectiveFace` helper: the single definition of where a placed device sits, given its type's depth.
- `recorded-device-actions.ts`: writes clean data (placement forces both for full-depth; update never stores a single face for full-depth). No longer the correctness mechanism.
- `EditPanelMetadata.svelte`: presents face controls that cannot express an invalid state, and explains the lock with an exit to the depth setting.
- `RackDevice.svelte`: owns the rear visual treatment and the image-mode fallback, derived from `currentFace` and `is_full_depth`.
- Face-consuming sites (render filter, export, blocked-slots, collision, annotations): consume `effectiveFace`, not raw stored `face`.
- Face panel container: owns the empty-state hint.

## Data model

No schema change.

- `PlacedDevice.face: "front" | "rear" | "both"` (`types/index.ts:572`).
- `DeviceType.is_full_depth?: boolean`, undefined or true means full-depth (`types/index.ts:485`).

Invariant, enforced by derivation rather than stored state: a full-depth device's effective face is always `"both"`. Stored `face` for a full-depth device is non-authoritative and treated as legacy noise until cleaned on save.

## Backward compatibility

Per the project's prior-release data policy, reading data written by a prior release is a tested requirement.

- Derive-on-read makes any prior-release or imported layout render correctly on both faces with no mutation on open, so there is no migration step that can create an overlap (the manufactured-collision hazard is avoided by construction).
- No dirty-on-open: opening a file does not mutate it, so it does not appear unsaved, and server storage mode does not trigger an unexpected write on open.
- No undo hazard: there is no recorded normalization action that a user could undo back into a broken state.
- The prior-release guard is the legacy-shaped render and collision tests: a full-depth device stored as `face: "front"` must render on both faces and collide as occupying both. These tests are the required backward-compatibility check. A formal upgrade-corpus YAML fixture in `src/tests/fixtures/upgrade-corpus/` is an optional follow-up; derive-on-read changes no load path, so the existing test coverage is sufficient.

## Edge cases addressed

- Manufactured collisions from migration: avoided, since derive-on-read mutates nothing.
- Runtime device-type depth change (half to full): covered by derivation; no reload required.
- Dirty-on-open and undo-into-broken-state: avoided, since nothing mutates on load.
- Image mode with no rear image: falls back to the colour/label treatment, not a placeholder wall.
- Collision-versus-render inconsistency for full-depth devices: reconciled by routing collision through `effectiveFace`.
- Annotation column dropping `"both"` devices: fixed by routing through `effectiveFace` and including both.
- Cross-panel interaction (select, delete, move, duplicate a full-depth device from the rear panel acts on the one entity and reflects in the front): already exercised by today's `face: "both"` devices, now the common path. Verified during implementation, not assumed.
- Bayed racks: `BayedRackView` shares `RackDevice`, so the rear treatment should follow for free. Confirmed during implementation.

## Named follow-ups (out of scope here, tracked separately)

- Horizontal mirroring of the rear view. The rear view swaps the image but does not flip left-to-right (`RackDevice.svelte:158`; no `scaleX` or column reversal). A left-side half-width device renders left on the rear, though physically it is on the right when viewed from behind. Rare, since most half-width devices are also half-depth, and pre-existing, but "always both" exposes it to more layouts. File a follow-up issue.
- Rear ports and power for cable planning. For a homelabber the rear view earns its keep by showing rear I/O and PSUs, not a differentiated chassis. The rear treatment here should be judged by whether it helps plan the back of the rack, with port rendering as the deliberate next step. File a follow-up issue so the rear view has a roadmap beyond cosmetics.

## Testing

- Unit: `effectiveFace` returns `"both"` for a full-depth device irrespective of stored `face`, and returns the stored face for a half-depth device.
- Unit: collision treats a full-depth device stored as `face: "front"` as occupying both faces (a rear placement at the same U is rejected).
- Rendering behaviour: a full-depth device stored as `face: "front"` renders on the rear filter (the tightest regression guard for the reported bug); a rear-mounted half-depth device does not receive the rear differentiation.
- Rendering behaviour: in image mode with no rear image, a full-depth device on the rear shows the colour/label treatment rather than a placeholder.
- Annotations: a full-depth device's annotation appears on both faces.
- Empty-state: a face panel with no devices renders the hint; a populated panel does not.
- Prior-release guard: a full-depth device stored as `face: "front"` renders on both faces and collision treats it as occupying both (required). A formal upgrade-corpus YAML fixture is an optional follow-up.
- Existing: `src/tests/rear-view-full-depth.test.ts` continues to pass.

Tests assert behaviour, not exact colours or class names, per the project testing rules. The edit-panel control structure is presentational and does not get DOM-structure tests.

## Open items deferred to planning

- Confirm the exact call sites that consume `placedDevice.face` so all of them route through `effectiveFace` (render filter, export, blocked-slots, collision, annotations, and any drag or placement preview path).
- frontend-design pass on the rear differentiation (badge versus desaturation versus both) and the empty-state hint against the design tokens.
- Decide where opportunistic stored-`face` cleanup-on-save lives, ensuring it is not a recorded action.
