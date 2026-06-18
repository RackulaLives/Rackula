# Carrier-First Sub-U Devices: Epic Decomposition Plan (v2)

> **For agentic workers:** This is the EPIC-level decomposition for #2158, not a single bite-sized task plan. Each child below is a coherent, independently mergeable slice. When a child is executed, write its own detailed step plan (via `/dev-issue <n>` or a per-child `superpowers:writing-plans` pass) before touching code. v2 folds in an architect's adversarial pass (see "What changed in v2").

**Goal:** Replace fractional rail positioning (1/3U, 1/2U offsets) with a carrier-first model: rails register equipment at whole-U boundaries only; sub-U / half-width gear mounts inside a container device that registers to the rails.

**Architecture:** The container/slot infrastructure already exists (`DeviceType.slots[]`, `PlacedDevice.container_id`/`slot_id`, `ContainerSlots.svelte`, `placeInContainer()`, cross-rack moves with children, child exclusion from rack collision). So this epic ENFORCES the carrier-first rule (schema + store + drag/drop), DELETES the fractional rail machinery and the `slot_position` left/right pathway, and ADAPTS legacy data on load. Frozen design record: `docs/superpowers/specs/2026-06-12-carrier-first-sub-u-design.md`.

**Tech stack:** Svelte 5 runes, TypeScript strict, Zod (`src/lib/schemas/index.ts`), Vitest + Playwright. `UNITS_PER_U = 6` is kept (device heights still use 0.5U = 3 units).

---

## What changed in v2 (architect adversarial pass)

Verified in code, not hypothetical:

1. The legacy adapter must live at the SINGLE STORE INGRESS (`loadLayout`/`clearThenLoad`), NOT at `load-pipeline.ts:65`. The M14 browser-workspace lazy-restore path (`browser-launch.ts` -> `loadLayoutBody()`) and the share decode (`share.ts:356`, returns `fromMinimalLayoutV2` without a full-schema pass) both BYPASS `load-pipeline`. One chokepoint at the store ingress covers file, API, archive, share, and browser-restore.
2. Share links cannot encode carrier children today: `MinimalDeviceSchema` (share.ts:72) has no `container_id`/`slot_id`. C2 must add container fields to the minimal schema + the v1/v2 expanders
   - carrier-type inclusion, not just bump a version string.
3. The "stop creating invalid placements" deletions (keyboard fine-move, `moveDeviceSlot`, EditPanel half-width/fine UI) move from C5 INTO C3, so enforcement (C4) never faces a live create-path that can still produce invalid data. C5 shrinks to dead-code removal.
4. The migration is irreversible (first load adapts -> autosave overwrites the original). C2 gains a one-time pre-migration backup AND a golden-corpus round-trip regression test.
5. `recoverSlotPositions` removal moves into C2 (the adapter supersedes it).
6. C1 defines the synthesized-carrier FAMILY (1x2 and 2x2) plus the auto-created placement flag, so the schema field lands once before C2/C3 consume it.

---

## Hard sequencing constraints

1. The legacy adapter (C2, at store ingress) MUST be on main before schema enforcement (C4), or existing layouts with sub-U / fractional / half-width placements fail validation on load.
2. The adapter (C2) and drag/drop (C3) both synthesize a generic carrier, so the carrier family (C1) lands first.
3. C3 deletes every live create-path for fractional/half-width placements, so C4 enforcement is safe.
4. Deleting dead fractional code (C5) comes after C3 + C4.
5. C5 and C6 BOTH edit `KeyboardHandler.svelte` -> serialize them (no parallel).

**This run (critical path to unblock M14):** C1 (#2289) -> {C2 (#2290), C3 (#2291)} -> C4 (#2292) -> C5 (#2294). **Deferred to their own issues:** C6 (#2295, lifecycle), C8 (#2296, NetBox), C9 (#2165, docs).

---

## CRITICAL PATH (this run) - sub-issues of #2158

### C1 - Carrier device types + auto-created placement flag [Feature, size:M]

**Files:** `src/lib/data/starterLibrary.ts` (existing shelves ~209-426 are the pattern); `src/lib/types/index.ts` + `src/lib/schemas/index.ts` (add the placement flag).

**Scope:**

- Synthesized-carrier FAMILY (stable slugs the adapter/drag-drop reuse): a 1-row x 2-col carrier (half-width full-height) and a 2x2 carrier (half-width + half-height). Plus the K-79 branded 2x2 (RB5009, L009) and the AV joining tray (1 row x 2 cols, full-height). Existing 2-slot/3-slot shelves stay; `accepts` empty (dimensional fit only).
- Add an "auto-created" boolean to `PlacedDevice` (type + Zod, default false, serialized + share- encoded) so C6 can self-remove auto-synthesized carriers while user-placed carriers persist.

**Acceptance:** the carrier family + branded types pass `DeviceTypeSchema`; the auto-created flag round-trips through save/load/share.

**Tests:** schema validation already covers library data (Zero-Change Rule); one round-trip test for the auto-created flag.

**Deps:** none. **Risk:** low.

---

### C2 - Legacy adapter at the store ingress + share container-encoding + migration safety [Feature, size:L]

**Files:**

- New `adaptLegacyLayout(raw)` module under `src/lib/storage/` (pattern: `migrate-layout.ts:55-78`).
- Wire it at the SINGLE store ingress (`loadLayout`/`clearThenLoad` in `src/lib/stores/...workspace`), so file/api/archive (`load-pipeline.ts`), share (`share.ts`), AND browser-restore (`browser-workspace.ts:loadLayoutBody`) all pass through it.
- Share encoding: add `container_id`/`slot_id` + auto-created flag to `MinimalDeviceSchema` (`schemas/share.ts:72`) and to `fromMinimalLayoutV1`/`fromMinimalLayoutV2`/`toMinimalLayout` (`utils/share.ts`); ensure synthesized carrier DeviceTypes are included in `dt`. Bump the format.
- Remove `recoverSlotPositions` (`schemas/index.ts:898-961, 1019-1041`); the adapter supersedes it.

**Scope:** on ingress, snap fractional rail positions to nearest whole U; wrap any sub-U or paired half-width (legacy `slot_position` left/right) placement in a synthesized carrier (C1), marked auto-created. Reads raw input BEFORE Zod enforcement. Before the first carrier-first write, save a one-time pre-migration backup to a dedicated `Rackula:pre-carrier-backup` localStorage key (decision D3), with a restore affordance.

Decisions locked: D1 adapter at store ingress; D2 full carrier support in share links; D3 dedicated backup key; D4 explicit `auto_created` schema field; D5 block-live enforcement; D6 create-paths deleted in C3.

**Acceptance:** a legacy 1/3U placement snaps to whole U; two co-located half-width devices become a 1x2 carrier with two children; a share link with carrier children round-trips; a pre-migration backup exists after first adaptation.

**Tests (high-value):** GOLDEN-CORPUS round trip - representative legacy fixtures (fractional rail, half-width pair, legacy `slot_position`) -> adapt -> save -> reload -> assert stable, no data loss (factories from `src/tests/factories.ts`).

**Deps:** C1. **Risk:** medium-high (read-path correctness on live data; covers ALL ingress paths).

---

### C3 - Drag/drop carrier-first + remove all live create-paths [Feature, size:M]

**Files:**

- `src/lib/utils/dragdrop.ts`: remove `snapHalfU` (~75-86); extend `detectContainerDropTarget` (~314-353) to not require pre-selection + scan a free cell; synthesize a generic carrier (marked auto-created) when a sub-U device drops on bare rack.
- `src/lib/stores/layout/device-actions.ts:placeInContainer` (~152-236): auto-place in next free cell; add `findNextFreeChildPosition` (collision.ts).
- DELETE the live create-paths (moved here from C5): keyboard fine-move handlers + `moveDeviceSlot` (`KeyboardHandler.svelte` ~102-107, 180-220), their action-registry entries (`actions/registry.ts` ~244-256), and the EditPanel half-width + fine-step UI (`EditPanelPosition.svelte`).

**Scope:** sub-U devices get no rail drop zones; drop prefers an existing carrier free cell at the target U, else synthesizes a carrier sized to the device. After this slice, NO interactive path can create a sub-U rail or half-width-pair placement.

**Acceptance:** palette drop on bare rack synthesizes a carrier; drop near a carrier with a free cell fills it; full carrier rejects; no keyboard/edit-panel path creates a fractional rail placement.

**Tests (high-value):** palette drop synthesizes a carrier; drop near a free cell fills it; one child per cell; oversized child rejected.

**Deps:** C1. **Risk:** medium.

---

### C4 - Schema + store enforcement (keystone) [Feature, size:M]

**Files:** `src/lib/schemas/index.ts` (`PlacedDeviceSchema` ~572-642; `LayoutSchema.superRefine` ~1140-1208); `src/lib/stores/layout/device-actions.ts` (`placeDevice`).

**Scope (3-layer):** Zod requires `container_id`+`slot_id` for sub-U / non-integer-height / half- width placement; integer-U position for rail placements; `slot_id` exists in parent `DeviceType.slots`; one child per slot; child fits cell (`u_height <= height_units`, width `<= width_fraction`). Store `placeDevice` rejects sub-U rail placement. Save-rejection UX: enforcement blocks the bad operation LIVE (store/drag layer); it must never leave a user unable to SAVE a layout they already have on screen.

**Acceptance:** sub-U rail placement is rejected at the store and schema layers; missing-slot, occupied-slot, and oversized-child placements are rejected; saving a valid carrier-first layout always succeeds.

**Tests (high-value):** sub-U rail placement rejected; one child per cell; oversized child rejected.

**Deps:** C2 (adapter on main first), C3 (no live create-paths). **Risk:** high.

---

### C5 - Delete dead fractional code + whole-U / slot-ref labelling [Task, size:M]

**Files (delete/simplify; create-paths already gone in C3):**

- `src/lib/utils/position.ts:formatPosition` (~67-83): drop fraction glyphs -> whole-U + slot refs ("U5, slot 1/2"); update callers `export/data.ts`, `EditPanelPosition.svelte`, `DeviceDetails.svelte`.
- `src/lib/utils/device-movement.ts`: drop `stepOverride` + `isHalfU` factor-2/3 logic (~82-87).
- `src/lib/utils/collision.ts`: delete `isSlotOccupied` (~144-162); drop rack-level half-width `doSlotsOverlap` usage.
- `src/lib/types/index.ts`: delete `PlacedDevice.slot_position` (~575) and tidy its schema field.
- Update `UNITS_PER_U` comment (keep value 6). Delete obsolete tests `half-u-stacking.test.ts`, `slot-position-recovery.test.ts`; update `dragdrop.test.ts` for whole-U.

**Acceptance:** no fraction glyphs anywhere; child placements label as slot references; build + suite green with the machinery gone.

**Deps:** C3, C4. **Risk:** medium (smaller now that create-paths left in C3). Folds in labelling.

> When C5 merges, the M14 palette chain parked behind #2158 reopens: #2075 -> #2212/#2213/#2214.

---

## DEFERRED - each gets its own dedicated issue (NOT this run)

### C6 - Container lifecycle: cascade delete + undo, deep duplicate, child cell movement [Feature, size:M]

Cascade delete container -> children with confirm; undo restores the subtree (children-snapshot pattern, `commands/device.ts` ~349-520); deep-copy container duplication; child duplicate fills next free cell (toast if full); arrow keys move a container whole-U with children and a child between cells in its container only; auto-created carriers self-remove on last-child removal (Decision 3). SERIALIZE with C5 (both touch `KeyboardHandler.svelte`). Deferred: doesn't gate the M14 unblock.

### C8 - NetBox interop: subdevice_role import + device_bays export [Feature, size:L]

NetBox import maps `subdevice_role` children to container children and snaps fractional positions (reuse C2); export maps a carrier to a parent device with `device_bays` and children to `subdevice_role`. Files: `netbox-import.ts`, likely a new `netbox-elevation-import.ts`, `yaml.ts` (~126-127, 169-176). Independent of C5/C6. Deferred: large, gates nothing.

### C9 - User documentation (existing sub-issue #2165) [already filed]

Document the carrier-first model (whole-U rails, carriers for sub-U gear). Spec says docs land with implementation. Use `/technical-writing`. Deferred to after the critical path.

---

## Out of scope (per spec)

Cross-container keyboard movement; category-based accepts whitelists; 1.5U rail mounting; stacking multiple devices in one cell. The narrow #2152 patch already shipped in M02 (commit 6e5d69a7), and C5 deletes the machinery it restored.
