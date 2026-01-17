# Fit-to-Screen Audit and Improvements

**Date:** 2026-01-17
**Status:** Design Complete

## Problem Statement

The fit-to-screen functionality has several issues with bayed racks, multi-rack layouts, and the paneforge side panel:

1. **Bayed rack dimensions are wrong** - `racksToPositions()` treats each bay as a separate dual-view rack, but `BayedRackView` renders as a stacked component (front row + rear row vertically)
2. **Selection highlight clipping** - The bounding box doesn't account for the 6px selection highlight (2px outline + 4px offset), causing the bottom of tall racks to be cut off
3. **No viewport recalculation on resize** - When sidebar collapses/expands or paneforge handle is dragged, fitAll isn't called despite viewport dimensions changing
4. **Centering uses stale dimensions** - The math is correct but operates on incorrect measurements

## Design

### 1. Selection Highlight Padding

Add a new constant to account for selection highlight visual footprint:

```typescript
// src/lib/constants/layout.ts
export const SELECTION_HIGHLIGHT_PADDING = 8; // 2px outline + 4px offset + 2px buffer
```

### 2. Correct Bayed Rack Measurements

Update `racksToPositions()` to:

- Accept rack groups as a parameter: `racksToPositions(racks, rackGroups)`
- Calculate bayed groups as single entries:
  - Width: `bay_count * rack_width` (bays touch, no gap)
  - Height: `2 * rack_height + labels` (front row stacked above rear row)
- Calculate ungrouped racks with current dual-view logic
- Add `SELECTION_HIGHLIGHT_PADDING` to all measurements

### 3. Auto-Fit on Viewport Changes

Add a ResizeObserver in `Canvas.svelte`:

```typescript
// In Canvas.svelte onMount
const resizeObserver = new ResizeObserver(
  debounce(() => {
    canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
  }, 300),
);
resizeObserver.observe(canvasElement);

// In onDestroy
resizeObserver.disconnect();
```

**Why ResizeObserver:**

- Catches all resize sources (sidebar, paneforge, window, dev tools)
- Single source of truth vs multiple event handlers
- Standard browser API with good support

**Debounce at 300ms:**

- Groups rapid changes during drag into single fitAll
- Prevents visual jank
- Fast enough to feel responsive after discrete actions

### 4. Edge Cases

**Initial load:** Skip first ResizeObserver callback within 100ms of mount (RAF fitAll already handled it).

**Manual zoom:** Always auto-fit on resize. Users can re-zoom if needed. Keeps behavior simple and predictable.

## Files to Modify

| File                               | Changes                                         |
| ---------------------------------- | ----------------------------------------------- |
| `src/lib/constants/layout.ts`      | Add `SELECTION_HIGHLIGHT_PADDING = 8`           |
| `src/lib/utils/canvas.ts`          | Update `racksToPositions()` signature and logic |
| `src/lib/components/Canvas.svelte` | Add ResizeObserver with debounced fitAll        |

## Not Changing

- Centering math in `calculateFitAll()` (correct, just needs right inputs)
- Panzoom library integration
- FitAll animation/reduced-motion handling

## Testing Scenarios

1. Single rack - verify no clipping of selection highlight
2. Multi-rack (ungrouped) - verify all racks visible with margin
3. Bayed rack (2-bay, 3-bay) - verify stacked layout measured correctly
4. Sidebar collapse/expand - verify auto-fit triggers
5. Paneforge drag resize - verify debounced auto-fit
6. 42U rack selected - verify bottom highlight not clipped
