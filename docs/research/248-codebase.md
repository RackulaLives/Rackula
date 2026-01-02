# Spike #248 Codebase Exploration: Port Layout Algorithm

**Date:** 2026-01-01
**Related:** Spike #237, Epic #71

---

## Files Examined

**Device Rendering Components:**
- `src/lib/components/RackDevice.svelte`: Renders individual devices with width calculation, label sizing, image overlay, and drag-drop handling
- `src/lib/components/Rack.svelte`: Rack container managing device placement, U positioning, and interaction handlers
- `src/lib/components/Canvas.svelte`: Main viewport with panzoom, rack selection, and canvas management

**Layout Constants and Utilities:**
- `src/lib/constants/layout.ts`: Core dimension constants (U_HEIGHT_PX=22, RAIL_WIDTH=17, BASE_RACK_WIDTH=220)
- `src/lib/utils/canvas.ts`: Viewport calculations, fit-all zoom logic, bounds computation
- `src/lib/utils/text-sizing.ts`: Adaptive font sizing algorithm (CHAR_WIDTH_RATIO=0.58, minFontSize=9px, maxFontSize=13px)
- `src/lib/utils/viewport.svelte.ts`: Mobile/desktop viewport detection (breakpoint: 1024px)

**Prototype and Research:**
- `docs/research/prototype-port-indicators.svelte`: Working prototype demonstrating PORT_RADIUS=3px, PORT_SPACING=8px, high-density grouping (>24 ports)
- `docs/research/spike-237-network-interface-visualization.md`: Phase 1 planning, NetBox compatibility research

**Type and Schema Definitions:**
- `src/lib/types/constants.ts`: Device category colors, rack width constants (NARROW_RACK_WIDTH=10, STANDARD_RACK_WIDTH=19)
- `src/lib/types/index.ts`: DeviceType interface with u_height, category, colour fields

---

## Device Width Calculations

**Formula (from RackDevice.svelte line 127):**
```typescript
const deviceWidth = rackWidth - RAIL_WIDTH * 2;
```

**Base Constants (from layout.ts):**
- U_HEIGHT_PX = 22px (per rack unit, 1.75" industry standard)
- RAIL_WIDTH = 17px (mounting rails on left/right)
- BASE_RACK_WIDTH = 220px (base for 19" rack)
- getRackWidth(nominalWidth) = Math.round((BASE_RACK_WIDTH * nominalWidth) / 19)

**Calculated Interior Values:**

| Rack Width | Total Width | Interior Width | Notes |
|------------|-------------|----------------|-------|
| 10" | ~116px | ~82px | Narrow rack |
| 19" | 220px | 186px | Standard |
| 21" | ~242px | ~208px | Wide |
| 23" | ~264px | ~230px | Wide |

**Key Formula:**
```
interior_width = (BASE_RACK_WIDTH * nominal_width / 19) - RAIL_WIDTH * 2
```

---

## The Core Problem

**48-port device on 19" rack:**
- Available width: 186px
- Current approach: 8px spacing × 47 gaps = 376px needed
- **Deficit: 190px (more than 2× available space!)**

**48-port device on 10" rack:**
- Available width: 82px
- Current approach: 8px spacing × 47 gaps = 376px needed
- **Deficit: 294px (4.6× available space!)**

---

## Existing Layout Patterns

### 1. Adaptive Font Sizing (text-sizing.ts)
- Uses character width estimation with CHAR_WIDTH_RATIO = 0.58
- Scales font from maxFontSize (13px) down to minFontSize (9px)
- Applies truncation with ellipsis when text still doesn't fit
- Pattern: `fitTextToWidth(text, {maxFontSize, minFontSize, availableWidth})`

### 2. Device Height Scaling
```typescript
const deviceHeight = device.u_height * U_HEIGHT_PX;  // Scales with U count
```
Supports 0.5U increments (MIN_DEVICE_HEIGHT=0.5, MAX_DEVICE_HEIGHT=42)

### 3. Responsive Viewport Detection
- MOBILE_BREAKPOINT = '(max-width: 1024px)'
- Desktop: full UI, mobile: simplified/view-only

### 4. SVG Rendering Stack (RackDevice.svelte)
1. Device rectangle (colored background)
2. Selection outline (optional)
3. Content layer (image or label, with auto-sizing)
4. **Port indicators layer (where ports would insert)**
5. Foreign object overlay (drag/click handling)

### 5. High-Density Grouping (prototype)
- Groups >24 ports into type-based badges
- Badge width: 24px, spacing: 4px
- Shows count, click to expand

---

## Integration Points

### 1. PortIndicators Component Location
- Insert after content layer, before drag overlay in RackDevice.svelte
- Access to: `deviceWidth`, `deviceHeight`, `rackView`, `device.interfaces`

### 2. Props Available
```typescript
// From parent component
deviceWidth: number;      // Interior width (186px for 19" rack)
deviceHeight: number;     // u_height × 22px
rackView: "front" | "rear";
interfaces: InterfaceTemplate[];
```

### 3. Zoom-Level Awareness
- ZOOM_MIN = 0.25, ZOOM_MAX = 2.0
- Can pass zoom level as prop from Canvas
- Suggested thresholds: hide <0.5x, badges 0.5-1.0x, individual >1.0x

### 4. Export Integration
- Uses RAIL_WIDTH, U_HEIGHT_PX from layout.ts
- Different spacing (RACK_GAP=40 for export vs 24 for canvas)

---

## Constraints

### 1. Space Limitations
- 19" rack interior: 186px
- 10" rack interior: 82px
- Cannot achieve 8px spacing for 48+ ports without multi-row layout

### 2. Device Height Usage
- 1U = 22px (fixed)
- Port Y offset: 8px from bottom edge
- Content area needs icons (28px left + 20px right for labels)

### 3. Accessibility Requirements
- Touch targets minimum 44×44px on mobile
- Current prototype uses 12×12px (below minimum!)
- Screen reader support required

### 4. Performance
- Target: <16ms render for 192+ port elements (60fps)
- Multiple high-density devices common in homelabs

### 5. Dual-View Mode
- Front and rear rendered side-by-side
- DUAL_VIEW_GAP = 24px between views
- Ports must respect position field ("front" vs "rear")

---

## Key Numbers for Algorithm

| Device Type | Typical Ports | Current Space Needed | Available (19") | Available (10") |
|-------------|---------------|----------------------|-----------------|-----------------|
| 24-port switch | 24 | 184px (fits!) | 186px | 82px |
| 48-port switch | 48 | 376px | 186px | 82px |
| 48-port patch panel | 48 | 376px | 186px | 82px |
| 96-port patch panel | 96 | 760px | 186px | 82px |

---

## Prototype Constants (from spike-237)

```typescript
const PORT_RADIUS = 3;      // Visual port circle radius
const PORT_SPACING = 8;     // Spacing between ports
const PORT_PADDING = 4;     // Edge padding
const PORT_Y_OFFSET = 8;    // Distance from device bottom
```

**Color Scheme:**
- 1000base-t: Emerald (1GbE)
- 10gbase-t: Blue (10GbE copper)
- 10gbase-x-sfpp: Purple (SFP+)
- 25gbase-x-sfp28: Amber (SFP28)
- 40gbase-x-qsfpp: Red (QSFP+)
- 100gbase-x-qsfp28: Pink (QSFP28)

---

## Questions for Algorithm Design

1. **How many rows are available per U height?**
   - 1U = 22px, port radius = 3px, port spacing = 8px
   - With 8px Y offset at bottom, could fit 2 rows in 1U
   - Could fit more rows in 2U+ devices

2. **Should ports scale down or use rows?**
   - Scaling: smaller ports, harder to click
   - Rows: stacked layout, industry-standard approach

3. **What's the minimum readable port size?**
   - 3px radius works at 1.0x zoom
   - At 0.5x zoom, 3px becomes 1.5px (too small)

4. **How to handle 10" vs 19" differently?**
   - 10" rack has ~44% of 19" interior space
   - May need more aggressive grouping on 10"

---

## End of Codebase Exploration
