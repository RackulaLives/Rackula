# Edit Tab Contextual Properties (#2077)

Date: 2026-06-14 Issue: #2077 (feat: side panel Edit tab contextual properties) Epic: #2017 (Canvas UX Overhaul, M14) Base: #2076 (side panel architecture) merged to main

## Problem

The Edit tab in `SidePanelContent.svelte` should show properties contextual to the current selection, with a clear empty state when nothing is selected. The acceptance criteria read:

- Properties reflect the current single or multi selection.
- Clear empty state when nothing is selected.

## Current state (landed by #2076)

`SidePanelContent.svelte` already:

- Resolves a selected rack, a selected device (`SelectedDeviceInfo`), and a selected group (bayed rack) from the shared selection store.
- Renders `EditPanelRack` for a rack or group, the four device sections for a device, and an empty-state paragraph (`side-panel-edit-empty`) when nothing is selected.
- `EditPanelRack` already handles the group case fully: group name editing, group-wide rear-view toggle, group-aware height rejection, and a "Delete Bayed Rack" action.

## The multi-select constraint

The shared selection store (`src/lib/stores/selection.svelte.ts`) is strictly single-select: one `selectedType` and one id at a time. There is no array of selected ids, no marquee, no shift-click, and no other M14 issue currently owns building a multi-select selection model. The scope guard for this slice forbids touching the shared selection store, canvas interaction, or the View tab.

The only multi-entity selection the live model supports is a **bayed rack group**: a single selection that resolves to multiple racks. That is the "multi selection" this slice can honestly represent. Per-device marquee multi-select has no backing state, so the panel must not fabricate it; it lands when a future issue builds the selection model.

## Decision

Make the Edit tab's contextual properties legible and complete for every selection the model supports today, without inventing a multi-select model.

1. **Contextual heading.** Replace the static "Edit" heading with a heading that names the selection kind: "Device", "Rack", "Bayed Rack" (the multi-rack group case), or "Edit" when nothing is selected. This makes "properties reflect the current selection" legible and gives screen-reader users the panel's context. The heading remains the programmatic focus target (`tabindex="-1"`, `editHeadingId`) from #2076.

2. **Empty state stays a paragraph**, unchanged in markup id (`side-panel-edit-empty`), with its copy kept clear and actionable.

3. **No new selection state.** The group (bayed rack) case is the multi-entity case; it is already wired through `selectedGroup` to `EditPanelRack`. No changes to the selection store, canvas, or View tab.

### Selection -> heading resolution

| Selection | Heading | Body |
| --- | --- | --- |
| Device selected | Device | metadata / position / image / actions |
| Bayed rack group selected | Bayed Rack | `EditPanelRack` (group properties) |
| Single rack selected | Rack | `EditPanelRack` (rack properties) |
| Nothing selected | Edit | empty-state paragraph |

The resolution is pure derived state over the already-resolved `selectedDeviceInfo`, `selectedGroup`, and `selectedRack`.

## Out of scope

- A multi-select selection model (selection-store array, shift-click, marquee). No issue owns this yet; it is a milestone-sized change that the scope guard excludes.
- The View tab (#2078) and the rail chrome (#2076).
- Per-device group actions ("Bay together" etc.) belong to the verb-bar work (#2075).

## Testing

The selection -> heading/body resolution is real logic worth a test: render `SidePanelContent` with `activeTab: "edit"` and assert the contextual heading and that the right body renders for each selection kind (device, single rack, bayed group, nothing). This complements the existing `edit-panel-name-edit-selection-switch.test.ts`, which must stay green.

Thin presentational wrapping (the heading text itself) is covered by the resolution test; no separate low-value render test is added.
