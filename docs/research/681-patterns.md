# Spike #681 Pattern Analysis: Bayed Rack Annotations

## Key Insights

### From Codebase Analysis

1. **Annotation column is tightly coupled to single rack layout**
   - AnnotationColumn uses `rack.height` directly
   - Positioned LEFT of front view with balancing spacer on RIGHT
   - SVG height matched to rack dimensions

2. **Bayed racks have fundamentally different structure**
   - Stacked rows (FRONT above REAR) vs side-by-side views
   - U-labels already occupy flanking positions (LEFT of front, RIGHT of rear)
   - Bays touch (gap: 0) vs 24px gap in dual-view

3. **Device face filtering is already in place**
   - Each row filters devices by `faceFilter="front"` or `faceFilter="rear"`
   - Annotations would need the same filtering

4. **Height normalization exists**
   - `maxHeight` computed as tallest bay
   - U-labels already use this for consistency

### From External Research

1. **Industry favors edge placement**
   - Labels on left or right edge of rack
   - Consistent placement across all racks

2. **Multi-rack views prefer simplicity**
   - Toggle between front/rear rather than showing both
   - 5-7 racks max before switching to overview
   - "Avoid clutter" is a recurring theme

3. **Color coding and grouping are secondary features**
   - Nice-to-have for future enhancement
   - Not critical for initial implementation

---

## Implementation Approaches

### Option A: Per-Bay Annotations (Recommended MVP)

```
┌──────────────────────────────────────────────────────────────────┐
│                        [Group Name]                              │
├──────────────────────────────────────────────────────────────────┤
│                          FRONT                                   │
│ [U-labels] [Ann1][Bay 1] [Ann2][Bay 2] [Ann3][Bay 3] [Spacer?]  │
├──────────────────────────────────────────────────────────────────┤
│                          REAR                                    │
│ [Spacer?] [Bay 3][Ann3] [Bay 2][Ann2] [Bay 1][Ann1] [U-labels]  │
└──────────────────────────────────────────────────────────────────┘
```

**Implementation:**

- Wrap each bay in a sub-component with optional annotation column
- Front row: annotations LEFT of each bay
- Rear row: annotations RIGHT of each bay (mirrored)
- Each AnnotationColumn filters devices by bay AND face

**Pros:**

- Mirrors single-rack UX (consistent mental model)
- Minimal code changes (reuse existing AnnotationColumn)
- Per-bay data is already available (each bay is a separate rack)

**Cons:**

- Increases total width significantly (100px × N bays)
- May be visually noisy with many bays

### Option B: Per-Row Annotations

```
┌──────────────────────────────────────────────────────────────────┐
│                        [Group Name]                              │
├──────────────────────────────────────────────────────────────────┤
│                          FRONT                                   │
│ [AnnFront] [U-labels] [Bay 1] [Bay 2] [Bay 3]           [Spacer]│
├──────────────────────────────────────────────────────────────────┤
│                          REAR                                    │
│ [Spacer]            [Bay 3] [Bay 2] [Bay 1] [U-labels] [AnnRear]│
└──────────────────────────────────────────────────────────────────┘
```

**Implementation:**

- Single annotation column per row
- Aggregates devices from all bays in that row
- Positioned on the opposite side from U-labels

**Pros:**

- More compact (2 annotation columns total vs N×2)
- Cleaner visual appearance
- Natural symmetry with U-labels

**Cons:**

- Requires aggregating devices across bays
- Device positions may not align vertically across bays
- Loss of per-bay device context

### Option C: Toggle-Based (Deferred)

Only show annotations when:

- Zoomed in sufficiently
- A specific bay is selected
- User enables via button/toggle

**Implementation:**

- Add interaction state for "annotation mode"
- Conditionally render based on selection or zoom level

**Pros:**

- Zero width impact when disabled
- Progressive disclosure

**Cons:**

- More complex interaction design
- Deferred decision-making

---

## Trade-offs Analysis

| Factor           | Option A (Per-Bay)     | Option B (Per-Row)   |
| ---------------- | ---------------------- | -------------------- |
| Width impact     | High (+100px × N)      | Low (+200px total)   |
| Code complexity  | Low (reuse existing)   | Medium (aggregation) |
| Visual alignment | Perfect                | Approximate          |
| Conceptual fit   | 1:1 with single rack   | New mental model     |
| Device context   | Per-bay                | Aggregated           |
| Mirroring logic  | Mirror annotations too | Simpler positioning  |

---

## Recommendation

**Option A (Per-Bay Annotations)** for MVP with enhancements:

### Phase 1: Core Implementation

1. Wrap each bay with conditional AnnotationColumn
2. Pass `faceFilter` to AnnotationColumn (new prop)
3. Mirror positioning for rear row (annotations on right side)
4. No balancing spacer needed (U-labels already provide visual anchor)

### Phase 2: Width Management

1. Add `annotationWidth` prop to AnnotationColumn (default: 100px)
2. For bayed racks, use smaller width (e.g., 60-80px)
3. Consider truncation strategy for narrow columns

### Phase 3: Optional Enhancements

1. Collapse annotations when bayed rack count exceeds threshold
2. Show annotations only on selected/active bay
3. Hover-to-reveal annotation mode

---

## Visual Mockup

### 2-Bay Bayed Rack with Per-Bay Annotations

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

**Key observations:**

- Front row: Annotations LEFT of each bay
- Rear row: Annotations RIGHT of each bay (mirrored with bays)
- U-labels still flank each row (LEFT for front, RIGHT for rear)
- Annotations filter by face to show only relevant devices

---

## Technical Requirements

### New Props for AnnotationColumn

```typescript
interface Props {
  rack: RackType;
  deviceLibrary: DeviceType[];
  annotationField: AnnotationField;
  width?: number;
  /** Filter to show only front or rear mounted devices */
  faceFilter?: "front" | "rear"; // NEW
}
```

### BayedRackView Changes

1. Accept `showAnnotations` and `annotationField` props (already defined, just unused)
2. Create `BayedBayContainer` sub-component that wraps each bay
3. Conditionally render AnnotationColumn with appropriate props

### CSS Considerations

1. Annotations should not affect `--bay-label-block-height` calculation
2. Rear row annotation columns need `order: 1` or explicit positioning
3. May need smaller font size for compact width option
