# Carrier-First Sub-U Devices

Date: 2026-06-12 Status: Approved direction, pending plan Related: #2152 (regression), #1248, #1602 (prior slot_position regressions), M03 Data Format & Interop

## Problem

Rackula currently allows devices to mount at 1/3U and 1/2U rail offsets (UNITS_PER_U = 6 internal units). Per EIA-310, rails register equipment only at whole-U boundaries; the three holes per U locate boundaries, they are not alternative mounting positions. The fractional offset machinery models a physical fiction and produced the #2152 scatter (two RB5009 placed at "U5 1/3" and "U4 2/3").

Real sub-U devices (MikroTik RB5009 at roughly 0.5U half-width, AV half-rack units at full-U half-width) mount via a carrier: a bracket, tray, or shelf that registers to the rails at a whole U, while the devices register to the carrier. Examples: MikroTik K-79 (2x2 grid in 1U), AV joining trays (width-only pairs).

## Core rule

A device with u_height less than 1, a non-integer u_height, or less than full width cannot mount directly to rails. It must be a child of a container device. Rail positions are whole-U only.

## Decisions

1. Existing layouts and share links: import-time adaptation. On load, snap fractional rail positions to the nearest whole U and synthesize a generic carrier for any sub-U or paired half-width placements. One-time read-path adapter, not an ongoing compatibility layer.
2. The slot_position left/right placement pathway is deleted, including the pair recovery logic (source of #1248 and #1602). A half-width pair becomes a 1-row, 2-col carrier. slot_width survives only as a device size descriptor used for cell-fit checks.
3. Auto-created carriers self-remove when their last child is removed. User-placed carriers persist when empty.
4. Rail-mountable devices must have integer u_height. Fractional heights of any size, including 1.5U and above, require a carrier. Revisit if real 1.5U rail gear is requested; the starter library contains none.
5. Sequencing: a narrow #2152 patch ships first on the existing slot machinery (restores pair-keeping, fits M02 stability). Carrier-first lands in M03 and deletes that machinery.

## Data model

Existing pieces that carry the design (already implemented):

- DeviceType.slots[] with Slot { id, position: {row, col}, width_fraction, height_units, accepts }
- PlacedDevice.container_id + slot_id for children
- ContainerSlots.svelte, placeInContainer(), detectContainerDropTarget(), child exclusion from rack-level collision, atomic cross-rack moves with children

Changes:

- Rail positions become integer U. The factor-3 and factor-2 position offsets are removed: fraction glyphs in formatPosition, 1/3-step fine movement in device-movement.ts, fractional rail collision math.
- PlacedDevice.slot_position is removed. Children are located by slot_id alone.
- u_height keeps 0.5 steps as a device size; it no longer affects rail position math.
- Schema version bump; share-link format revision.

## Enforcement points

The core rule is enforced in three layers so it cannot leak:

1. Zod schema: sub-U or non-integer-height placement requires container_id and slot_id; rail placements require integer-U position; slot_id must exist in the parent DeviceType.slots; one child per slot; child must fit cell dimensions (u_height <= height_units, width <= width_fraction).
2. Store actions: placeDevice rejects rail placement of sub-U devices.
3. Drag and drop: sub-U devices get no valid rail drop zones; drop targeting prefers an existing carrier with a free cell at the target U, else synthesizes a generic carrier sized to the device (1U; 2-col for half-width; 2x2 for half-width plus half-height).

## Lifecycle rules

- Deleting a container cascades to children, with confirm. Undo restores the whole subtree using the children-snapshot pattern already used by cross-rack move (device-actions.ts).
- Duplicating a container deep-copies children. Duplicating a child targets the next free cell in the same container; if full, toast and do nothing.
- Dragging a child out of a container onto bare rack follows the same synthesize rule as palette drops.
- Arrow keys on a container move it whole-U with children. Arrow keys on a child move between cells within its container only.
- Children inherit the container face. Rear-mounted carriers work without special casing because a carrier is a normal device with a face.

## Library

- K-79 as a branded 2x2 container (RB5009, L009).
- Generic 1U carrier, 2x2.
- AV joining tray: 1 row, 2 cols, full-height cells. The AV case never sees a height grid; the MikroTik grid is not assumed universal.
- Existing 2-slot and 3-slot shelf containers remain.
- accepts stays empty by default; fit is dimensional, not category-based.

## Import and interop

- Legacy Rackula JSON and share links: snap rail positions to whole U; wrap sub-U and paired half-width placements in synthesized generic carriers.
- NetBox import: NetBox permits half-U mounting positions. Imported elevations with fractional positions get the same snap-and-synthesize treatment. NetBox child devices (subdevice_role) map to container children; this completes the currently unmapped import path.
- NetBox export: a carrier maps to a parent device with device_bays; children map to subdevice_role child.

## Labelling

Child placements display as container slot references (for example "U5, slot 1/2"), which matches the labelling requested in #2152. Position fraction glyphs are removed.

## Testing

High-value behavioural tests only, per testing policy:

- Sub-U rail placement is rejected.
- Palette drop on bare rack synthesizes a carrier; drop near a carrier with a free cell fills the cell.
- One child per cell; oversized child rejected.
- Cascade delete then undo restores container and children.
- Deep duplicate copies children; child duplicate fills next free cell.
- Import adapter snaps fractional positions and synthesizes carriers.

No count assertions, no schema re-testing, factories from src/tests/factories.ts.

## Sequencing

1. M02: narrow #2152 patch restoring pair-keeping on existing slot machinery.
2. M03: carrier-first as specified here, deleting the slot_position pathway and the fractional rail position machinery.

## Future consumers

Drive bay mapping (discussion #1678: Storinator and JBOD chassis with interior drive grids) will reuse the same slot primitives: a parent device with an N x M grid of cells holding child items, child metadata via notes, serial, and custom_fields, and the same NetBox device_bays mapping. It is out of scope for this design, but two constraints here exist so it is not foreclosed:

1. Slot rendering is keyed off the slot definition (face-visible vs interior), not assumed. Carriers use the face-visible case only; interior grids (drive bays behind covers or top-loading) will render in a detail view instead of the rack elevation.
2. The grid model assumes no maximum dimensions. Carriers are 2x2; a drive chassis grid may be 4x15 or larger. Slot naming stays free-form so cell labels like "Bay A7" work the same way as "slot 1/2".

## Out of scope

- Cross-container keyboard movement.
- Category-based accepts whitelists.
- 1.5U rail mounting (revisit on demand).
- Stacking multiple devices within a single cell.
