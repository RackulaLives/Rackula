# Spike #681: Design Annotations Placement for Bayed Racks

**Date:** 2026-01-16
**Status:** Complete

---

## Executive Summary

This spike investigated how to position annotations for bayed/touring racks, which have a different layout structure than single racks. After analyzing the codebase, external industry practices, and trade-offs between approaches, we recommend **per-bay annotations** as the MVP approach.

Key findings:

- Current annotations work only for single racks (positioned left of front view)
- Bayed racks have stacked FRONT/REAR rows with U-labels flanking each row
- Per-bay annotations provide the best balance of simplicity and consistency
- Width management is the main concern for multi-bay configurations

---

## Background

### Current Annotation System

For single racks (`RackDualView`), annotations are:

- Positioned LEFT of the front view as a 100px-wide SVG column
- A balancing spacer is added on the RIGHT to keep the rack centered
- Annotations display device metadata (name, IP, notes, etc.) aligned with U positions

### Bayed Rack Layout

Bayed racks (`BayedRackView`) have a fundamentally different structure:

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

Key differences:

- FRONT/REAR are vertically stacked (not side-by-side)
- U-labels flank each row (LEFT of front, RIGHT of rear)
- Bays touch each other (no gap)
- Rear row bays are visually reversed (Bay 1 on right)

---

## Design Recommendation

### Per-Bay Annotations (Option A)

Each bay gets its own annotation column, mirrored appropriately:

**Front Row:**

```
[U-labels] [Ann1][Bay 1] [Ann2][Bay 2] [Ann3][Bay 3]
```

**Rear Row:**

```
[Bay 3][Ann3] [Bay 2][Ann2] [Bay 1][Ann1] [U-labels]
```

### Rationale

1. **Consistency:** Mirrors single-rack UX where annotations are adjacent to the rack view
2. **Simplicity:** Reuses existing `AnnotationColumn` component with minimal changes
3. **Accuracy:** Per-bay data is already available (each bay is a separate `Rack` object)
4. **Face filtering:** Natural extension of existing `faceFilter` pattern

### Trade-offs

| Pro                              | Con                                |
| -------------------------------- | ---------------------------------- |
| Familiar mental model            | Increases total width (+100px × N) |
| Reuses existing code             | May be visually noisy with 3+ bays |
| Perfect vertical alignment       | More DOM elements to render        |
| Per-bay device context preserved |                                    |

---

## Implementation Phases

### Phase 1: Core Implementation

**Goal:** Basic per-bay annotations working for bayed racks

1. Add `faceFilter?: "front" | "rear"` prop to `AnnotationColumn`
2. Filter `annotations` derived value by device face
3. Create `BayedBayContainer` sub-component in `BayedRackView`:
   - Wraps each bay with optional annotation column
   - Handles positioning (left for front, right for rear)
4. Wire up `showAnnotations` and `annotationField` props (currently unused)

**Files to modify:**

- `src/lib/components/AnnotationColumn.svelte`
- `src/lib/components/BayedRackView.svelte`

### Phase 2: Width Management

**Goal:** Handle width concerns for multi-bay configurations

1. Add `width` prop to allow narrower annotation columns
2. Default to 80px for bayed racks vs 100px for single racks
3. Adjust truncation threshold for narrower columns
4. Consider smaller font size option

### Phase 3: Polish (Optional)

**Goal:** Enhanced UX for complex configurations

1. Collapse/hide annotations when bay count exceeds threshold
2. Show annotations only on selected/active bay
3. Add hover-to-reveal mode for compact display

---

## Visual Mockup

### 2-Bay Configuration with Annotations

```
                    [Touring Case A]

                        FRONT
    ┌──────────────────────────────────────────────┐
    │ U42│ name1 │▓▓▓▓▓▓│ name3 │▓▓▓▓▓▓│          │
    │ U41│       │▓▓▓▓▓▓│       │▓▓▓▓▓▓│          │
    │ U40│ name2 │▓▓▓▓▓▓│       │▓▓▓▓▓▓│          │
    │ ...│       │      │       │      │          │
    │  U1│       │▓▓▓▓▓▓│       │▓▓▓▓▓▓│          │
    └──────────────────────────────────────────────┘
         ↑    ↑    ↑       ↑       ↑
       U-lbl Ann1 Bay1   Ann2    Bay2

                        REAR
    ┌──────────────────────────────────────────────┐
    │          │▓▓▓▓▓▓│ rear3 │▓▓▓▓▓▓│ rear1 │ U42│
    │          │▓▓▓▓▓▓│       │▓▓▓▓▓▓│       │ U41│
    │          │▓▓▓▓▓▓│       │▓▓▓▓▓▓│ rear2 │ U40│
    │          │      │       │      │       │ ...│
    │          │▓▓▓▓▓▓│       │▓▓▓▓▓▓│       │  U1│
    └──────────────────────────────────────────────┘
                  ↑      ↑       ↑      ↑       ↑
                Bay2   Ann2    Bay1   Ann1   U-lbl
```

---

## Technical Specification

### AnnotationColumn Changes

```typescript
interface Props {
  rack: RackType;
  deviceLibrary: DeviceType[];
  annotationField: AnnotationField;
  width?: number; // Already exists (default: 100)
  faceFilter?: "front" | "rear"; // NEW - filter devices by face
}
```

**Device filtering logic:**

```typescript
const filteredDevices = $derived(
  faceFilter ? rack.devices.filter((d) => d.face === faceFilter) : rack.devices,
);
```

### BayedRackView Changes

```svelte
<!-- Front row bay container -->
{#if showAnnotations}
  <AnnotationColumn
    rack={bay}
    {deviceLibrary}
    {annotationField}
    faceFilter="front"
    width={80}
  />
{/if}
<Rack ... faceFilter="front" />

<!-- Rear row bay container (mirrored order) -->
<Rack ... faceFilter="rear" />
{#if showAnnotations}
  <AnnotationColumn
    rack={bay}
    {deviceLibrary}
    {annotationField}
    faceFilter="rear"
    width={80}
  />
{/if}
```

### CSS Requirements

```css
/* Narrower width for bayed rack annotations */
.bayed-annotation-column {
  width: 80px;
}

/* Smaller font for compact mode */
.bayed-annotation-column .annotation-text {
  font-size: var(--font-size-3xs, 9px);
}
```

---

## Alternatives Considered

### Per-Row Annotations (Option B)

Single annotation column per row, aggregating devices from all bays.

**Rejected because:**

- Requires complex device aggregation logic
- Device positions won't align across bays of different heights
- Loses per-bay context (can't tell which bay a device is in)

### No Annotations for Bayed Racks (Option C)

Leave bayed racks without annotation support.

**Rejected because:**

- Users expect consistent feature availability
- Annotations are valuable for touring/AV racks with complex setups

---

## Questions Resolved

| Question                                 | Resolution                                        |
| ---------------------------------------- | ------------------------------------------------- |
| Per-bay or per-row?                      | Per-bay (Option A)                                |
| Where positioned relative to FRONT/REAR? | Adjacent to each bay, mirrored for rear           |
| How scale with different bay counts?     | Use narrower width; consider collapse threshold   |
| Should they be interactive/editable?     | Same as single rack (not in scope for this spike) |

---

## Research Files

- `docs/research/681-codebase.md` - Codebase exploration findings
- `docs/research/681-external.md` - External research and industry practices
- `docs/research/681-patterns.md` - Pattern analysis and trade-offs

---

## Next Steps

1. Create implementation issues for each phase
2. Prioritize Phase 1 for MVP
3. Defer Phase 3 enhancements based on user feedback
