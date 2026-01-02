# Spike #248 Pattern Analysis: Port Layout Algorithm

**Date:** 2026-01-01
**Inputs:** 248-codebase.md, 248-external.md

---

## Key Insights

### 1. Multi-Row Layout is the Industry Standard

Physical 48-port switches universally use **2 rows of 24 ports**. This matches user mental models from real hardware and is the correct approach for Rackula.

**Math for 19" rack (186px interior):**
- 24 ports per row
- 186px ÷ 24 = **7.75px per port**
- With 3px port radius: 7.75 - 6 = 1.75px gap (tight but visible)

**Math for 10" rack (82px interior):**
- 24 ports per row
- 82px ÷ 24 = **3.4px per port**
- With 3px port radius: overlapping! Need 2px radius or grouping

### 2. Device Height Provides Row Capacity

Each U = 22px. With 8px bottom offset for port indicators:
- 1U device: 22 - 8 = 14px for port rows → 2 rows max (7px each)
- 2U device: 44 - 8 = 36px for port rows → 4 rows max (9px each)

### 3. Existing Patterns to Reuse

From `text-sizing.ts`:
- Adaptive scaling algorithm (max → min with constraints)
- Fallback to ellipsis when content doesn't fit

From `prototype-port-indicators.svelte`:
- High-density grouping (>24 ports → type badges)
- PORT_RADIUS=3, PORT_SPACING=8 as starting values

### 4. Touch Accessibility via Overlay

WCAG requires 44×44px touch targets, but ports are 6×6px visual.
Solution: Invisible `<foreignObject>` overlay with larger hit zones.
This decouples visual density from interaction density.

---

## Implementation Approaches

### Option A: Multi-Row with Dynamic Spacing

**Strategy:** Use rows based on port count, calculate spacing dynamically.

```typescript
interface PortLayoutConfig {
  deviceWidth: number;      // Interior width (186px for 19")
  deviceHeight: number;     // u_height × 22px
  portCount: number;        // Total ports to render
  portRadius: number;       // Visual radius (2-3px)
}

function calculateLayout(config: PortLayoutConfig): PortLayout {
  const { deviceWidth, deviceHeight, portCount, portRadius } = config;

  // Calculate optimal row count
  const maxRows = Math.floor((deviceHeight - 8) / (portRadius * 2 + 2));
  const portsPerRow = Math.ceil(portCount / maxRows);
  const rows = Math.ceil(portCount / portsPerRow);

  // Calculate spacing
  const portDiameter = portRadius * 2;
  const spacing = (deviceWidth - portsPerRow * portDiameter) / (portsPerRow + 1);

  return { rows, portsPerRow, spacing, portRadius };
}
```

**Pros:**
- Matches real hardware layouts
- Always shows individual ports
- Predictable visual appearance

**Cons:**
- Spacing can get very tight on narrow racks
- Many ports = small spacing = hard to distinguish

### Option B: Adaptive Grouping by Density

**Strategy:** Switch between individual ports and grouped badges based on available space.

```typescript
type RenderMode = 'individual' | 'grouped' | 'hidden';

function determineRenderMode(
  portCount: number,
  deviceWidth: number,
  zoom: number
): RenderMode {
  const effectiveWidth = deviceWidth * zoom;
  const minSpacing = 4; // Minimum px between ports
  const portDiameter = 6;

  const requiredWidth = portCount * (portDiameter + minSpacing);

  if (effectiveWidth < 50) return 'hidden';
  if (requiredWidth > effectiveWidth * 2) return 'grouped';  // >2 rows needed
  return 'individual';
}
```

**Pros:**
- Gracefully degrades at high density
- Grouped badges are clickable and informative
- Works well with zoom levels

**Cons:**
- Grouped view doesn't show port positions
- Mode switching could be jarring

### Option C: Zoom-Aware Hybrid (Recommended)

**Strategy:** Combine multi-row layout with zoom-level awareness.

| Zoom Level | Port Count ≤24 | Port Count 25-48 | Port Count >48 |
|------------|----------------|------------------|----------------|
| <0.5x | Hidden | Hidden | Hidden |
| 0.5-1.0x | Individual (1 row) | Grouped badges | Grouped badges |
| 1.0-1.5x | Individual (1 row) | Individual (2 rows) | Grouped badges |
| >1.5x | Individual (1 row) | Individual (2 rows) | Individual (3-4 rows) |

**Pros:**
- Best of both worlds
- High zoom = high detail, low zoom = clean overview
- Matches DCIM industry patterns

**Cons:**
- More complex implementation
- Need to pass zoom level through component tree

---

## Trade-offs Analysis

### Visual Fidelity vs. Usability

| Approach | Visual Fidelity | Usability | Implementation Complexity |
|----------|-----------------|-----------|---------------------------|
| Multi-row only | High | Medium | Low |
| Adaptive grouping | Medium | High | Medium |
| Zoom-aware hybrid | High | High | High |

### Rack Width Considerations

| Rack Width | Interior | Max Ports/Row (3px radius, 2px gap) | Recommendation |
|------------|----------|-------------------------------------|----------------|
| 10" | 82px | 10 ports | Always use grouping for >10 ports |
| 19" | 186px | 23 ports | Multi-row for >23 ports |
| 23" | 230px | 28 ports | Multi-row for >28 ports |

### Accessibility

**Mobile (touch):**
- Individual ports at 7.75px spacing are NOT touch-accessible
- Solution: Port selection mode with larger touch targets
- Alternative: Tap device → bottom sheet with port list

**Screen readers:**
- Grouped badges announce: "24 Ethernet ports, 4 SFP+ ports"
- Individual ports announce: "Port 1, Ethernet, connected" (on focus)

---

## Recommended Algorithm

Based on research, here's the recommended port layout algorithm:

### Step 1: Calculate Base Layout

```typescript
const PORT_RADIUS_DEFAULT = 3;
const PORT_RADIUS_MIN = 2;
const PORT_SPACING_DEFAULT = 8;
const PORT_SPACING_MIN = 2;
const PORT_Y_OFFSET = 8;

function calculatePortLayout(
  deviceWidth: number,
  deviceHeight: number,
  interfaces: InterfaceTemplate[],
  zoom: number,
  rackWidth: 10 | 19 | 21 | 23
): PortLayoutResult {
  const portCount = interfaces.length;

  // Step 1: Determine render mode based on zoom
  if (zoom < 0.5) {
    return { mode: 'hidden' };
  }

  // Step 2: Calculate available height for rows
  const availableHeight = deviceHeight - PORT_Y_OFFSET;
  const maxRows = Math.floor(availableHeight / (PORT_RADIUS_DEFAULT * 2 + 2));

  // Step 3: Determine if grouping needed
  const portsPerRow = Math.ceil(portCount / maxRows);
  const requiredWidth = portsPerRow * (PORT_RADIUS_DEFAULT * 2 + PORT_SPACING_MIN);

  if (requiredWidth > deviceWidth && zoom < 1.5) {
    return {
      mode: 'grouped',
      groups: groupInterfacesByType(interfaces)
    };
  }

  // Step 4: Calculate optimal row distribution
  const optimalRows = Math.min(
    maxRows,
    Math.ceil(portCount / Math.floor(deviceWidth / 8))
  );

  // Step 5: Calculate spacing
  const portsPerRowFinal = Math.ceil(portCount / optimalRows);
  let portRadius = PORT_RADIUS_DEFAULT;
  let spacing = (deviceWidth - portsPerRowFinal * portRadius * 2) / (portsPerRowFinal + 1);

  // Step 6: Scale down if needed
  if (spacing < PORT_SPACING_MIN) {
    portRadius = PORT_RADIUS_MIN;
    spacing = (deviceWidth - portsPerRowFinal * portRadius * 2) / (portsPerRowFinal + 1);
  }

  return {
    mode: 'individual',
    rows: optimalRows,
    portsPerRow: portsPerRowFinal,
    portRadius,
    spacing,
    positions: calculatePositions(interfaces, optimalRows, portsPerRowFinal, spacing, portRadius)
  };
}
```

### Step 2: Position Calculation

```typescript
function calculatePositions(
  interfaces: InterfaceTemplate[],
  rows: number,
  portsPerRow: number,
  spacing: number,
  radius: number
): PortPosition[] {
  return interfaces.map((iface, index) => {
    const row = Math.floor(index / portsPerRow);
    const col = index % portsPerRow;

    return {
      interface: iface,
      x: spacing + col * (radius * 2 + spacing) + radius,
      y: row * (radius * 2 + 2) + radius,
      radius
    };
  });
}
```

### Step 3: Touch Target Overlay

```svelte
{#if mode === 'individual'}
  <foreignObject width={deviceWidth} height={deviceHeight}>
    <div class="port-touch-overlay">
      {#each positions as pos}
        <button
          class="port-touch-target"
          style:left="{pos.x - 22}px"
          style:top="{pos.y - 22}px"
          aria-label="Port {pos.interface.name}"
          on:click={() => selectPort(pos.interface)}
        />
      {/each}
    </div>
  </foreignObject>
{/if}

<style>
  .port-touch-target {
    position: absolute;
    width: 44px;
    height: 44px;
    background: transparent;
    border: none;
    cursor: pointer;
  }
</style>
```

---

## Thresholds Summary

| Metric | Threshold | Action |
|--------|-----------|--------|
| Zoom < 0.5x | Always | Hide ports entirely |
| Zoom 0.5-1.0x AND ports > 24 | Always | Use grouped badges |
| Zoom ≥ 1.0x AND ports ≤ 48 | Always | Individual ports (multi-row) |
| Ports > 48 AND zoom < 1.5x | Always | Use grouped badges |
| 10" rack AND ports > 10 | Always | Use grouped badges |
| Spacing < 2px | Always | Reduce port radius to 2px |
| Spacing still < 2px | Always | Switch to grouped mode |

---

## Implementation Phases

Based on analysis, recommend breaking into these implementation issues:

### Phase 1: Core Algorithm (Issue)
- `calculatePortLayout()` function with multi-row support
- Port position calculation
- Export as utility from `src/lib/utils/port-layout.ts`

### Phase 2: Render Modes (Issue)
- Individual port rendering (SVG circles)
- Grouped badge rendering (count + type color)
- Mode switching logic

### Phase 3: Zoom Integration (Issue)
- Pass zoom level from Canvas to PortIndicators
- Implement zoom-aware render mode selection

### Phase 4: Touch Accessibility (Issue)
- ForeignObject overlay for touch targets
- Port selection mode for mobile

### Phase 5: 10" Rack Support (Issue)
- Adjust thresholds for narrow racks
- More aggressive grouping on 10" racks

---

## End of Pattern Analysis
