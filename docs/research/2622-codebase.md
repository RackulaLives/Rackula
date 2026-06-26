# Spike #2622: Codebase Map of Current Depth Model

Source: Explore agent sweep of the Rackula codebase, 2026-06-26. Captures the current (categorical) depth model so the spike can plan the move to accurate physical depth.

## Files Examined

- `src/lib/schemas/index.ts:472-558` (`DeviceTypeSchema`), `:645-703` (rack schema): device + rack schema.
- `src/lib/types/index.ts:558-627` (`PlacedDevice`), `:74-82` (`DisplayMode`): placement + display types.
- `src/lib/stores/layout/device-actions.ts:~95` : default-face assignment on placement.
- `src/lib/utils/collision.ts:95-106` (`doFacesCollide`): face-based collision.
- `src/lib/utils/blocked-slots.ts:34-70` : opposite-face hatching for half-depth devices.
- `src/lib/components/Rack.svelte`, `RackDevice.svelte:118`, `RackDualView.svelte`: SVG rendering.
- `src/lib/components/ViewControls.svelte`, `EditPanelRack.svelte`: per-rack `show_rear` control.
- `src/lib/data/starterLibrary.ts:35-189`: actual device data.
- `src/lib/types/constants.ts`: `UNITS_PER_U = 6`.
- `docs/reference/SPEC.md:77-96` (Mounting Model), `:132-139` (face-authoritative principle).

## Existing Patterns

### Depth is categorical, not measured
- `is_full_depth?: boolean` on `DeviceTypeSchema` (`schemas/index.ts:472`). `undefined`/`true` = full-depth; `false` = half-depth. No `depth_mm` / numeric depth anywhere.
- Width is also categorical: `slot_width: 1 | 2`. The entire physical model is half/full on two axes.

### Face is authoritative for collision; is_full_depth only sets the default
- `PlacedDevice.face: "front" | "rear" | "both"` (`types/index.ts:558`) drives collision.
- Default-face logic (`device-actions.ts:95`): `face ?? (is_full_depth !== false ? "both" : (device.face ?? "front"))`.
- `doFacesCollide` (`collision.ts:95`): `both` collides with everything; same face collides; opposite faces (front/rear) never collide.
- SPEC `:132-139`: explicit `face` overrides `is_full_depth`; `is_full_depth` only determines the default face.

### Rack has no depth dimension
- Rack fields: `height` (U), `width: 10 | 19 | 21 | 23` (enum inches), `show_rear: boolean` (default true). No depth.
- `show_rear` toggles dual front/rear rendering, not a physical depth.

### Rendering is 2D elevation only
- Front elevation standalone; `RackDualView.svelte` renders front + rear side-by-side. No side, top, or isometric view.
- `DisplayMode = "label" | "image" | "image-label"` (the `I` key) controls device artwork, unrelated to depth.
- `blocked-slots.ts:34-70`: half-depth devices already render hatching on the opposite face. Full-depth (`is_full_depth !== false`) are skipped (visible from both sides). This is the existing visual vocabulary for depth occupancy.

### Carrier-first mounting
- SPEC `:77-96`: sub-U-height, non-integer height, or sub-width devices mount inside a carrier, not on the rails. Full-width integer-U devices mount on rails.
- Positions stored in internal units (`UNITS_PER_U = 6`); depth/face are categorical, not position-based.

### Starter library uses half/full only
- `is_full_depth: false` on `1u-pdu`, `2u-pdu`, `1u-fiber-patch-panel`, `1u-fan-panel`, `1u-cantilever-shelf`; omitted (full) on `1u-server`, `1u-switch`. No mm values anywhere.

## Integration Points (where M021 lands)

- `schemas/index.ts`: add device `depth_mm` and rack `depth_mm` (+ datum semantics). Zod 4.
- `device-actions.ts:95`: depth is additive to existing `face` datum (front grows rearward, rear grows frontward, both spans).
- `collision.ts:95`: refine the front/rear branch to an mm middle-collision (front extent + rear extent > rack usable depth).
- `blocked-slots.ts:34`: extend the existing hatching into a front-elevation overhang / "exceeds depth" cue.
- `RackDualView.svelte` + sibling: home for a new side/top depth view.
- `starterLibrary.ts`: seed real per-device depth values.
- `src/tests/fixtures/upgrade-corpus/`: migration fixture for prior-release layouts.

## Constraints

- Backward compatibility is a tested, first-class requirement (upgrade-safety harness). Any schema change is backward-compatible or ships a migration + a new upgrade-corpus fixture.
- Rail positions stay whole-U integers; never reintroduce fractional rail positions.
- Categorical -> mm is lossy on magnitude (cannot reconstruct 350mm from "full"), but direction is preserved by `face`. Migration must default magnitude without raising false warnings on previously-valid layouts.
- Mixed units: `depth_mm` would be the first continuous physical measurement in a model where width is an enum of inches. Decide the unit policy deliberately.
