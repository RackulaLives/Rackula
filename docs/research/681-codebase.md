# Spike #681 Codebase Exploration: Annotations for Bayed Racks

## Files Examined

| File                                         | Purpose                                        |
| -------------------------------------------- | ---------------------------------------------- |
| `src/lib/components/AnnotationColumn.svelte` | SVG-based annotation column component          |
| `src/lib/components/RackDualView.svelte`     | Single rack with FRONT/REAR side-by-side views |
| `src/lib/components/BayedRackView.svelte`    | Bayed rack with stacked FRONT/REAR rows        |
| `src/lib/types/index.ts`                     | Type definitions for AnnotationField           |

---

## Current Annotation System

### AnnotationColumn Component

**Location:** `src/lib/components/AnnotationColumn.svelte`

The annotation column is an SVG-based component that:

- Displays device metadata aligned with U positions
- Default width: 100px
- Positioned to the LEFT of the rack view
- Supported annotation fields: `name`, `ip`, `notes`, `asset_tag`, `serial`, `manufacturer`

**Key implementation details:**

```typescript
// Y position calculation (line 65-73)
function getAnnotationY(position: number, uHeight: number): number {
  const topOffset = RACK_PADDING_HIDDEN + RAIL_WIDTH;
  const deviceTopY =
    (rack.height - position - uHeight + 1) * U_HEIGHT_PX + topOffset;
  const deviceHeight = uHeight * U_HEIGHT_PX;
  return deviceTopY + deviceHeight / 2; // Center vertically
}
```

The SVG height is calculated to match the rack:

```typescript
const svgHeight =
  RACK_PADDING_HIDDEN + RAIL_WIDTH * 2 + rack.height * U_HEIGHT_PX;
```

### Integration with RackDualView (Single Rack)

**Location:** `src/lib/components/RackDualView.svelte`

Current layout structure for single racks:

```
┌─────────────────────────────────────────────────────┐
│                   [Rack Name]                       │
├─────────────────────────────────────────────────────┤
│ [Annotation] [Front View] ... [Rear View] [Spacer]  │
└─────────────────────────────────────────────────────┘
```

Key observations:

- Annotation column is placed LEFT of the front view only (lines 221-223)
- A balancing spacer is added on the RIGHT when annotations are shown (lines 283-286)
- This keeps the rack visually centered under the name heading
- The container uses `display: flex` with `gap: 24px` between views

**Props for annotations:**

```typescript
showAnnotations?: boolean;        // Toggle visibility
annotationField?: AnnotationField; // Which field to display
```

---

## Bayed Rack Structure

### BayedRackView Component

**Location:** `src/lib/components/BayedRackView.svelte`

Bayed racks have a fundamentally different layout:

```
┌───────────────────────────────────────────────────────┐
│                   [Group Name]                        │
├───────────────────────────────────────────────────────┤
│                       FRONT                           │
│ [U-labels] [Bay 1] [Bay 2] [Bay 3] ...               │
├───────────────────────────────────────────────────────┤
│                       REAR                            │
│ ... [Bay 3] [Bay 2] [Bay 1] [U-labels]               │
└───────────────────────────────────────────────────────┘
```

**Key differences from single racks:**

1. **Stacked rows vs side-by-side:** FRONT and REAR are vertically stacked, not horizontally adjacent
2. **U-labels positioning:** U-labels flank each row (LEFT of front, RIGHT of rear)
3. **Bay mirroring:** Rear row bays are rendered in reverse order (Bay 1 on right)
4. **No gap between bays:** `.bayed-row { gap: 0; }` - bays touch each other
5. **Per-bay labels:** Each bay has its own "Bay N" label above it

**Current annotation status (lines 96-97):**

```typescript
showAnnotations: _showAnnotations = false, // Reserved for future annotation support
annotationField: _annotationField = "name", // Reserved for future annotation support
```

The props exist but are explicitly marked as "reserved for future annotation support" and are unused.

### Height Synchronization

All bays share the same U-labels based on the tallest rack (line 114):

```typescript
const maxHeight = $derived(Math.max(...racks.map((r) => r.height), 0));
```

This means annotations would need to match this shared height.

---

## Layout Differences Summary

| Aspect                 | Single Rack (RackDualView)           | Bayed Rack (BayedRackView)    |
| ---------------------- | ------------------------------------ | ----------------------------- |
| FRONT/REAR orientation | Side-by-side (horizontal)            | Stacked (vertical)            |
| U-labels               | Hidden (uses Rack's internal labels) | Flanking columns (LEFT/RIGHT) |
| Annotation placement   | LEFT of front view                   | Not implemented               |
| Balance mechanism      | Right-side spacer                    | N/A                           |
| Gap between views      | 24px                                 | 0 (bays touch)                |
| View structure         | Single container                     | Two separate rows             |

---

## Integration Points

### 1. Height Calculation

- `AnnotationColumn` uses `rack.height` directly
- `BayedRackView` uses `maxHeight` (tallest bay) for U-labels
- Annotations must align with `maxHeight` for consistency

### 2. Y-Coordinate System

- Both use `U_HEIGHT_PX = 22` and `RAIL_WIDTH = 17` constants
- Same coordinate formula can be reused
- `ULabels` component calculates: `i * U_HEIGHT + U_HEIGHT / 2 + RAIL_WIDTH`

### 3. Face Filtering

- Single rack: Front devices on left, rear on right
- Bayed rack: Front devices in top row, rear in bottom row
- Annotations should filter by `device.face` to show relevant devices per row

---

## Constraints

### 1. Layout Symmetry

The current bayed layout has U-labels on opposite sides:

- Front row: U-labels on LEFT
- Rear row: U-labels on RIGHT

Adding annotations would break this symmetry if placed identically.

### 2. Device Face Assignment

Devices are filtered by `faceFilter="front"` or `faceFilter="rear"` props passed to each `<Rack>` component. Annotations would need to respect the same filtering.

### 3. Per-Bay vs Per-Row Annotations

Two possible approaches:

- **Per-bay:** Each bay gets its own annotation column (mirrors single-rack UX)
- **Per-row:** Shared annotation column for entire front/rear row (aggregates across bays)

### 4. Viewport Width Considerations

Bayed racks can be very wide (3+ bays). Adding per-bay annotations would further increase width. Per-row annotations would be more compact.

### 5. Bay Label Alignment

The `--bay-label-block-height` CSS variable ensures U-labels align with bay content. Annotations would need to account for this offset.

---

## Questions for Design Phase

1. **Per-bay or per-row annotations?** Per-bay is simpler but wider; per-row is compact but requires aggregation.

2. **Symmetry handling:** Should annotations appear on both sides of each row, or just one side with balancing spacer?

3. **Rear row mirroring:** Should rear annotations also be mirrored (right-aligned instead of left)?

4. **Different bay heights:** If bays have different heights, how should annotations handle the gaps?

5. **Face-specific annotations:** Should front and rear rows show different annotation values (e.g., front IPs vs rear IPs)?
