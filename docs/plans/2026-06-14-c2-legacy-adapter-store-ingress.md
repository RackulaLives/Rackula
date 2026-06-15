# C2 - Legacy adapter at store ingress + share carrier-encoding + migration safety

Issue: #2290. Epic: #2158. Plan: docs/plans/2026-06-14-carrier-first-sub-u-decomposition.md.

## Confirmed architecture (verified in code)

Single store ingress: `loadLayout` in `src/lib/stores/layout/layout-lifecycle.ts`.
Every layout-ingestion path funnels through it:

1. File/API/archive: `load-pipeline.ts:65` `finalizeLayoutLoad` -> `loadLayout`.
2. Share decode: `App.svelte:284` -> `loadLayout` (decode is NOT Zod-full-validated).
3. Browser restore: `workspace.svelte.ts:189` `hydrateTab` (`loadLayoutBody` -> `migrateLayout`) -> `loadLayout`.
4. `clearThenLoad`: `workspace.svelte.ts:284` -> `loadLayout`.
5. YAML editor apply: `DialogOrchestrator.svelte:297` `handleYamlApply` -> `loadLayout`.
6. openTab / restoreWorkspace: `workspace.svelte.ts:169/312` -> `loadLayout`.

Decision: place `adaptLegacyLayout` at the TOP of `loadLayout`, transforming `layoutData`
before the existing ID-dedup pass. It runs on a typed `Layout` (all paths produce one), and
`slot_position`/fractional positions/container fields all survive as valid schema fields.

The adapter MUST be idempotent: `loadLayout` re-runs on every restore, so an already
carrier-first layout must pass through unchanged (no double-wrapping, no re-snap drift).

## Transform rules (per rack, rack-level devices only; children pass through)

A device is "rack-level" iff `container_id`/`parent_device`/`device_bay` are all unset.

1. Snap fractional rail position: rack-level `position` (internal units, UNITS_PER_U=6)
   that is not a whole-U multiple snaps to nearest whole U: `round(position/6)*6`, min 6 (U1).
2. Half-width pair (legacy `slot_position` left/right, or two co-located full devices missing
   slot_position - the recoverSlotPositions case): two rack-level devices at the same
   (snapped position, face) become a `carrier-1u-2col` carrier with two children in `col-1`/`col-2`.
3. Sub-U single device (device type u_height < 1 or non-integer, OR a lone half-width device):
   wrapped in a synthesized carrier sized to it:
   - half-width + half-height (u_height <= 0.5 and slot_width-ish half) -> `carrier-1u-2x2`, child in `r0-c0`.
   - half-width full-height (u_height >= 1 effectively, slot_width half) -> `carrier-1u-2col`, child in `col-1`.
   We size by device type dims; half-height when `u_height < 1`.
4. Synthesized carrier: `auto_created: true`, fresh id, `position` = the snapped whole-U,
   `face` inherited from the wrapped device(s). Children get `container_id`=carrier id,
   `slot_id`=explicit slot, `position`=0 (data transform, not interactive drop), `slot_position`
   cleared.
5. Ensure the synthesized carrier's DeviceType is present in `layout.device_types` (from
   `findStarterDevice(slug)`); inject once if missing.

Idempotency: if a rack already has the carrier-first shape (children with container_id, no
rack-level sub-U/half-width/fractional placements), the transform is a no-op for that rack.

## Share encoding (D2)

`schemas/share.ts` `MinimalDeviceSchema`: add `ci` (container_id), `si` (slot_id), `a`
(auto_created) optional fields. `utils/share.ts`:
- `convertDevices` (encode): emit `ci`/`si`/`a` when present; encode child positions raw
  (children use 0-indexed integer position, not human-U), rack-level as human-U.
- `convertMinimalDevices` (decode): map `ci`/`si`/`a` back; preserve container child ids by
  building a short-id -> uuid map within a rack so `ci` references resolve.
- Include synthesized carrier DeviceTypes in `dt` (they are already in `layout.device_types`,
  so the existing used-slug filter picks them up once children reference them - verify).
- Bump share version constant.

## recoverSlotPositions removal

Delete `recoverSlotPositions` (`schemas/index.ts` ~902-965) and its call site (~1024-1026)
plus the slot_width recovery block it fed (~1037-1046, `allRecoveredSlugs`). The adapter
supersedes it. Delete `slot-position-recovery.test.ts` (tests removed behaviour; the new
golden-corpus adapter test covers the pair case as a carrier).

## Pre-migration backup (D3)

`src/lib/storage/pre-carrier-backup.ts`: before the FIRST carrier-first write, snapshot the
current browser workspace (the `Rackula:workspace` index + every `Rackula:layout:<id>` body,
and legacy `Rackula:autosave`) to `Rackula:pre-carrier-backup` once. A `restorePreCarrierBackup()`
affordance writes the snapshot back. Guard with a sentinel so it runs exactly once. Use
`safeGetItem`/`safeSetItem` (quota-safe, never throws). Reject prototype-polluting keys.

Hook: invoke `ensurePreCarrierBackup()` from `loadLayout` adapter when an adaptation actually
changed something (so we only back up when there is legacy data to lose), guarded by the
one-time sentinel.

## Files

- NEW `src/lib/storage/adapt-legacy-layout.ts` - `adaptLegacyLayout(layout): Layout`.
- NEW `src/lib/storage/pre-carrier-backup.ts` - backup + restore.
- EDIT `src/lib/stores/layout/layout-lifecycle.ts` - call adapter at top of loadLayout.
- EDIT `src/lib/schemas/share.ts` - MinimalDeviceSchema fields + version bump.
- EDIT `src/lib/utils/share.ts` - encode/decode container fields.
- EDIT `src/lib/schemas/index.ts` - remove recoverSlotPositions.
- DELETE `src/tests/slot-position-recovery.test.ts`.
- NEW `src/tests/adapt-legacy-layout.test.ts` - golden-corpus round trip.

## Test (high value): golden-corpus round trip

Representative legacy fixtures (fractional rail, half-width pair via slot_position,
sub-U single) -> adaptLegacyLayout -> save (yaml/share) -> reload -> adapt again -> assert
stable (idempotent), carrier-first, no data loss. Factories from src/tests/factories.ts.
