# Simplify Bayed Rack UX

**Date:** 2026-01-17
**Status:** Approved

## Problem

The current "rack group" UX implies that bayed racks are collections of independent racks that can be dynamically grouped/ungrouped. This is confusing and unnecessary. A bayed rack should be a single atomic unit created with N bays that can be resized but not decomposed.

## Solution

Remove the group management UX entirely. Bayed racks appear as single entries in the rack list with editable bay count.

## Terminology

- **Column rack** = single rack (1 column) - standard server rack
- **Bayed rack** = 2+ bays side-by-side sharing a frame

## Changes

### Remove

- `RackGroupPanel.svelte` - delete entire component
- "Row" vs "Bayed" preset toggle
- Concept of "adding/removing racks to/from groups"

### Modify

#### RackList.svelte

- Show bayed racks as single entries: "Bayoncé (2-bay)"
- Filter out individual racks that belong to a group from flat list
- Clicking selects entire bayed rack (not individual bay)
- Context menu: Add Device, Edit, Rename, Duplicate, Delete

#### EditRackDialog.svelte

- Detect if editing a bayed rack
- Add bay count field (2, 3, etc.)
- Changing bay count:
  - **Reducing:** Check for devices in removed bays → toast warning
  - **Adding:** Instant (creates new empty bay)
- Same collision UX pattern as height changes

#### Sidebar.svelte (or parent)

- Remove RackGroupPanel import and usage

#### layout.svelte.ts (store)

- Verify/add functions:
  - `addBayToGroup(groupId)` - create new rack, add to group
  - `removeBayFromGroup(groupId, bayIndex)` - check devices, remove rack

### Keep Unchanged

- `BayedRackView.svelte` - rendering works correctly
- `NewRackWizard.svelte` - creation flow is fine
- Underlying `RackGroup` + `Rack[]` data model
- Canvas interaction with individual bays

## User Mental Model

Before: "I have a group containing 3 racks"
After: "I have a bayed rack with 3 bays"

## Files Summary

| File                    | Action                                       |
| ----------------------- | -------------------------------------------- |
| `RackGroupPanel.svelte` | DELETE                                       |
| `RackList.svelte`       | Modify - single entries for bayed racks      |
| `EditRackDialog.svelte` | Modify - add bay count field                 |
| `Sidebar.svelte`        | Modify - remove RackGroupPanel               |
| `layout.svelte.ts`      | Modify - add/verify bay management functions |
