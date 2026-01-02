# Spike #248: Port Layout Algorithm for High-Density Devices

**Date:** 2026-01-01
**Parent Epic:** #71 (Network Interface Visualization and Connectivity)

---

## Executive Summary

This spike researched how to render ports on high-density network devices (48+ ports) within the constrained width of rack elevation diagrams. The core problem: 48 ports × 8px spacing = 384px needed, but the interior width of a 19" rack is only 186px.

**Key Finding:** The industry-standard solution is **multi-row layout** (2 rows of 24 ports), which physical hardware universally uses. This matches user mental models and provides adequate spacing (7.75px per port).

**Recommended Approach:** Implement a zoom-aware hybrid algorithm that:
1. Uses multi-row layout for individual port rendering
2. Falls back to grouped badges at low zoom or extreme density
3. Provides touch-accessible overlays for mobile interaction

---

## The Problem

### Current Prototype Limitations

The existing `prototype-port-indicators.svelte` uses:
- PORT_RADIUS = 3px
- PORT_SPACING = 8px
- Single-row layout

This works for ≤24 ports but fails for high-density devices:

| Device | Ports | Space Needed | Available (19") | Fit? |
|--------|-------|--------------|-----------------|------|
| 24-port switch | 24 | 184px | 186px | ✓ |
| 48-port switch | 48 | 376px | 186px | ✗ |
| 96-port patch panel | 96 | 760px | 186px | ✗ |

### Device Width Calculations

From `layout.ts`:
```
interior_width = (BASE_RACK_WIDTH × nominal_width / 19) - RAIL_WIDTH × 2
```

| Rack Width | Interior Width |
|------------|----------------|
| 10" | 82px |
| 19" | 186px |
| 23" | 230px |

---

## Research Findings

### 1. Industry Hardware Standards

Physical 48-port switches universally use **2 rows of 24 ports**:
- Ubiquiti USW-48: 48 RJ45 (2 rows of 24) + 4 SFP+
- Cisco Catalyst 3560: 48 RJ45 (2 rows) + uplinks
- 48-port patch panels: 2U with 2 rows, or 1U high-density with 2 rows

Standard keystone jack dimensions: 14.5mm × 16.0mm face.

### 2. DCIM Software Patterns

| Tool | Approach |
|------|----------|
| NetBox | 220px rack width, no port visualization in elevation |
| Device42 | Port maps for smaller devices, lists for high-density |
| NetZoom | Customizable port properties, 2D/3D views |
| Sunbird | Interactive 3D, click-to-expand details |

Common patterns:
- Zoom-level rendering (hide/badge/show)
- Grouping by port type
- Click-to-expand for details

### 3. Accessibility Requirements (WCAG)

| Standard | Level | Minimum Touch Target |
|----------|-------|---------------------|
| WCAG 2.5.8 | AA | 24×24 CSS pixels |
| WCAG 2.5.5 | AAA | 44×44 CSS pixels |
| Apple iOS | HIG | 44×44 points |

Research shows targets <44px have 3× higher error rates.

**Solution:** Invisible touch zone overlays via `<foreignObject>` that don't affect visual density.

---

## Algorithm Design

### Multi-Row Layout Strategy

With 2 rows in a 19" rack (186px interior):
- 24 ports per row
- 186px ÷ 24 = **7.75px per port**
- With 3px port radius: 7.75 - 6 = 1.75px gap

This is achievable for visual rendering.

### Zoom-Aware Render Modes

| Zoom | Port Count ≤24 | Port Count 25-48 | Port Count >48 |
|------|----------------|------------------|----------------|
| <0.5x | Hidden | Hidden | Hidden |
| 0.5-1.0x | Individual | Grouped badges | Grouped badges |
| 1.0-1.5x | Individual | Individual (2 rows) | Grouped badges |
| >1.5x | Individual | Individual (2 rows) | Individual (3+ rows) |

### Algorithm Pseudocode

```typescript
function calculatePortLayout(config) {
  const { deviceWidth, deviceHeight, portCount, zoom, rackWidth } = config;

  // Hide at very low zoom
  if (zoom < 0.5) return { mode: 'hidden' };

  // Calculate available row capacity
  const availableHeight = deviceHeight - PORT_Y_OFFSET;
  const maxRows = Math.floor(availableHeight / (PORT_RADIUS * 2 + 2));

  // Calculate ports per row if using multi-row
  const portsPerRow = Math.ceil(portCount / maxRows);
  const spacing = (deviceWidth - portsPerRow * PORT_DIAMETER) / (portsPerRow + 1);

  // Determine if grouping is needed
  if (spacing < MIN_SPACING && zoom < 1.5) {
    return { mode: 'grouped', groups: groupByType(interfaces) };
  }

  // Multi-row individual layout
  return {
    mode: 'individual',
    rows: Math.ceil(portCount / portsPerRow),
    positions: calculatePositions(...)
  };
}
```

### Special Handling for 10" Racks

10" racks have only 82px interior width:
- 82px ÷ 24 = 3.4px per port (overlapping with 3px radius!)
- Always use grouped badges for >10 ports
- Or reduce port radius to 2px

---

## Recommendations

### Recommended Approach

Implement **Option C: Zoom-Aware Hybrid** from the pattern analysis:
1. Multi-row layout as the primary rendering strategy
2. Grouped badges as fallback for low zoom or extreme density
3. Touch overlays for mobile accessibility

### Implementation Phases

**Phase 1: Core Algorithm**
- `calculatePortLayout()` function
- Port position calculation
- Export from `src/lib/utils/port-layout.ts`
- Unit tests

**Phase 2: Render Modes**
- Individual port SVG rendering
- Grouped badge rendering with type colors
- Mode switching logic

**Phase 3: Zoom Integration**
- Pass zoom from Canvas → Rack → RackDevice → PortIndicators
- Implement zoom thresholds

**Phase 4: Touch Accessibility**
- ForeignObject overlay with 44×44px touch targets
- Port selection mode for mobile

**Phase 5: 10" Rack Support**
- Adjusted thresholds for narrow racks
- More aggressive grouping

### Constants to Define

```typescript
// Port rendering
const PORT_RADIUS_DEFAULT = 3;
const PORT_RADIUS_MIN = 2;
const PORT_SPACING_DEFAULT = 8;
const PORT_SPACING_MIN = 2;
const PORT_Y_OFFSET = 8;

// Zoom thresholds
const ZOOM_HIDE_THRESHOLD = 0.5;
const ZOOM_GROUP_THRESHOLD = 1.0;
const ZOOM_DETAIL_THRESHOLD = 1.5;

// Port count thresholds
const SINGLE_ROW_MAX = 24;
const DOUBLE_ROW_MAX = 48;
```

---

## Dependencies

This spike informs but does not block:
- **#249: PortIndicators SVG Component** - Can begin with simple single-row
- **#261: Cable Data Model** - Independent (already complete)
- **#318: Port Detail Panel** - Needs port positions from this algorithm

---

## Related Documents

- [248-codebase.md](248-codebase.md) - Codebase exploration
- [248-external.md](248-external.md) - External research
- [248-patterns.md](248-patterns.md) - Pattern analysis
- [spike-237-network-interface-visualization.md](spike-237-network-interface-visualization.md) - Prior spike

---

## Appendix: Port Type Color Scheme

From the existing prototype:

| Type | Speed | Color |
|------|-------|-------|
| 1000base-t | 1GbE | Emerald |
| 10gbase-t | 10GbE copper | Blue |
| 10gbase-x-sfpp | SFP+ | Purple |
| 25gbase-x-sfp28 | SFP28 | Amber |
| 40gbase-x-qsfpp | QSFP+ | Red |
| 100gbase-x-qsfp28 | QSFP28 | Pink |
