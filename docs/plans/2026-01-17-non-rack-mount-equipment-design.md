# Non-Rack Mount Equipment Design

**Issue:** #143 - Add Non-Rack Mount Equipment
**Date:** 2026-01-17
**Status:** Approved

## Overview

Support shelves with mini PCs, NUCs, Raspberry Pis, and other non-rack-mount equipment using the existing container/slot model from #452 and #372.

## Design Decisions

| Decision           | Choice              | Rationale                                               |
| ------------------ | ------------------- | ------------------------------------------------------- |
| Slot configuration | Preset layouts      | Matches real shelves (fixed dividers), no UI complexity |
| Visual style       | Shelf-specific CSS  | Lighter borders than enclosed bays, differentiated UX   |
| Device library     | Generic + specifics | Flexible default + popular models, expandable later     |
| Fit validation     | Dimension check     | Prevents impossible placements (device > slot)          |
| Multi-row support  | Single-row only     | Simpler, covers core use case, defer vertical stacking  |

## Implementation

### 1. Shelf Device Types

Add to `src/lib/data/starterLibrary.ts`:

```typescript
// 1U Shelf - 2 slots (half-width each)
{
  slug: "shelf-1u-2slot",
  manufacturer: "Generic",
  model: "Shelf (2 Slot)",
  u_height: 1,
  category: "shelf",
  colour: CATEGORY_COLOURS.shelf,
  slots: [
    { id: "left", name: "Left", position: { row: 0, col: 0 }, width_fraction: 0.5, height_units: 1 },
    { id: "right", name: "Right", position: { row: 0, col: 1 }, width_fraction: 0.5, height_units: 1 }
  ]
}

// 1U Shelf - 3 slots (third-width each)
{
  slug: "shelf-1u-3slot",
  manufacturer: "Generic",
  model: "Shelf (3 Slot)",
  u_height: 1,
  category: "shelf",
  colour: CATEGORY_COLOURS.shelf,
  slots: [
    { id: "left", name: "Left", position: { row: 0, col: 0 }, width_fraction: 0.33, height_units: 1 },
    { id: "center", name: "Center", position: { row: 0, col: 1 }, width_fraction: 0.34, height_units: 1 },
    { id: "right", name: "Right", position: { row: 0, col: 2 }, width_fraction: 0.33, height_units: 1 }
  ]
}

// 2U Shelf - 2 slots
{
  slug: "shelf-2u-2slot",
  manufacturer: "Generic",
  model: "Shelf (2 Slot)",
  u_height: 2,
  category: "shelf",
  colour: CATEGORY_COLOURS.shelf,
  slots: [
    { id: "left", name: "Left", position: { row: 0, col: 0 }, width_fraction: 0.5, height_units: 2 },
    { id: "right", name: "Right", position: { row: 0, col: 1 }, width_fraction: 0.5, height_units: 2 }
  ]
}

// 2U Shelf - 3 slots
{
  slug: "shelf-2u-3slot",
  manufacturer: "Generic",
  model: "Shelf (3 Slot)",
  u_height: 2,
  category: "shelf",
  colour: CATEGORY_COLOURS.shelf,
  slots: [
    { id: "left", name: "Left", position: { row: 0, col: 0 }, width_fraction: 0.33, height_units: 2 },
    { id: "center", name: "Center", position: { row: 0, col: 1 }, width_fraction: 0.34, height_units: 2 },
    { id: "right", name: "Right", position: { row: 0, col: 2 }, width_fraction: 0.33, height_units: 2 }
  ]
}
```

### 2. Mini Device Types

Add to `src/lib/data/starterLibrary.ts`:

```typescript
// slot_width: 1 = narrow (~1/3 shelf), 2 = medium (~1/2 shelf), 3 = wide (~2/3 shelf)

// Generic placeholder
{
  slug: "generic-mini-pc",
  manufacturer: "Generic",
  model: "Mini PC",
  u_height: 1,
  category: "server",
  colour: CATEGORY_COLOURS.server,
  slot_width: 2
}

// Intel NUC
{
  slug: "intel-nuc",
  manufacturer: "Intel",
  model: "NUC",
  u_height: 1,
  category: "server",
  colour: CATEGORY_COLOURS.server,
  slot_width: 1
}

// Beelink Mini S12 Pro
{
  slug: "beelink-mini-s12-pro",
  manufacturer: "Beelink",
  model: "Mini S12 Pro",
  u_height: 1,
  category: "server",
  colour: CATEGORY_COLOURS.server,
  slot_width: 1
}

// Raspberry Pi 5
{
  slug: "raspberry-pi-5",
  manufacturer: "Raspberry Pi",
  model: "Pi 5",
  u_height: 0.5,
  category: "server",
  colour: CATEGORY_COLOURS.server,
  slot_width: 1
}

// Raspberry Pi 4
{
  slug: "raspberry-pi-4",
  manufacturer: "Raspberry Pi",
  model: "Pi 4",
  u_height: 0.5,
  category: "server",
  colour: CATEGORY_COLOURS.server,
  slot_width: 1
}

// Zimaboard
{
  slug: "zimaboard",
  manufacturer: "IceWhale",
  model: "Zimaboard",
  u_height: 0.5,
  category: "server",
  colour: CATEGORY_COLOURS.server,
  slot_width: 2
}

// Mac Mini
{
  slug: "apple-mac-mini",
  manufacturer: "Apple",
  model: "Mac Mini",
  u_height: 1,
  category: "server",
  colour: CATEGORY_COLOURS.server,
  slot_width: 2
}
```

### 3. Shelf-Specific Visual Styling

Modify `src/lib/components/ContainerSlots.svelte`:

```svelte
<script>
  // Add prop or derive from device
  const isShelf = $derived(deviceType?.category === "shelf");
</script>

<g class="container-slots" class:shelf-style={isShelf}>
  <!-- existing slot rendering -->
</g>

<style>
  /* Default (enclosed bay) style */
  .slot-empty {
    stroke: var(--slot-border);
    stroke-dasharray: 4 2;
    stroke-width: 1;
  }

  /* Shelf style - lighter, more subtle */
  .shelf-style .slot-empty {
    stroke: var(--slot-border-muted, var(--color-border-muted));
    stroke-dasharray: 2 4;
    stroke-width: 0.5;
    opacity: 0.7;
  }

  /* Enhance visibility on hover for shelves */
  .shelf-style:hover .slot-empty {
    opacity: 1;
  }
</style>
```

### 4. Dimension Validation

Add to `src/lib/utils/collision.ts`:

```typescript
/**
 * Check if a device type fits within a slot's dimensions.
 * @param childType - The device type to place
 * @param slot - The target slot
 * @returns true if device fits, false otherwise
 */
export function canPlaceInSlot(childType: DeviceType, slot: Slot): boolean {
  // Convert slot_width to fraction (1=0.33, 2=0.5, 3=0.67)
  // Default: full width (takes entire slot)
  const childWidthFraction = childType.slot_width
    ? childType.slot_width / 3
    : 1.0;

  // Check width fits
  const slotWidth = slot.width_fraction ?? 1.0;
  if (childWidthFraction > slotWidth) {
    return false;
  }

  // Check height fits (child u_height <= slot height_units)
  const slotHeight = slot.height_units ?? 1;
  if (childType.u_height > slotHeight) {
    return false;
  }

  return true;
}
```

Integrate into existing `canPlaceInContainer()`:

```typescript
export function canPlaceInContainer(
  container: PlacedDevice,
  containerType: DeviceType,
  child: PlacedDevice,
  childType: DeviceType,
): boolean {
  // ... existing slot existence checks ...

  const slot = containerType.slots?.find((s) => s.id === child.slot_id);
  if (!slot) return false;

  // Add dimension check
  if (!canPlaceInSlot(childType, slot)) {
    return false;
  }

  // ... rest of existing logic ...
}
```

## Files to Modify

| File                                       | Changes                                    |
| ------------------------------------------ | ------------------------------------------ |
| `src/lib/data/starterLibrary.ts`           | Add 4 shelf types + 7 mini device types    |
| `src/lib/components/ContainerSlots.svelte` | Add shelf-style CSS variant                |
| `src/lib/utils/collision.ts`               | Add `canPlaceInSlot()` function            |
| `src/lib/utils/dragdrop.ts`                | Integrate dimension validation (if needed) |

## Out of Scope

- Multi-row slot layouts (vertical stacking)
- User-configurable slot counts
- Additional mini device models beyond the 7 listed

## Test Plan

- [ ] Shelf device types render with slot grid
- [ ] Mini devices can be placed on shelf slots
- [ ] Dimension validation prevents oversized devices
- [ ] Shelf styling is visually distinct from enclosed bays
- [ ] Drag-drop works for shelf → slot placement
