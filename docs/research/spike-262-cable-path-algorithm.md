# Spike #262: Cable Path Rendering Algorithm

**Date:** 2026-01-03
**Parent Epic:** #71 (Network Interface Visualization and Connectivity)
**Depends On:** #365 (Connection model), #363 (PlacedPort schema)

---

## 1. Executive Summary

This spike investigates algorithms for rendering cable connection paths between device ports in Rackula's SVG rack visualization. After evaluating five approaches (straight lines, quadratic bezier, cubic bezier, orthogonal routing, external channel), **cubic bezier curves with external channel routing** is the recommended approach.

**Key Findings:**

1. External channel routing (connections exit through side gutters) provides best visual clarity
2. Cubic bezier curves offer smooth, professional-looking paths
3. Performance is acceptable for up to 100+ connections with proper SVG optimization
4. Cross-face connections should use visual "tunnel" indicators

**Recommendation:** Implement external channel routing with cubic bezier curves, rendering behind device layer for z-index hierarchy.

---

## 2. Problem Statement

### 2.1 Visual Requirements

- Connect ports between devices in same rack
- Support front-to-rear (cross-face) connections
- Don't obscure device labels or images
- Work at all zoom levels
- Export correctly to PNG/PDF

### 2.2 Data Model

Connections use the MVP Connection model (#365):

```typescript
interface Connection {
  id: string;           // UUID
  a_port_id: string;    // PlacedPort.id
  b_port_id: string;    // PlacedPort.id
  label?: string;
  color?: string;       // Hex color for visualization
}

interface PlacedPort {
  id: string;           // UUID - stable identity
  template_name: string;
  template_index: number;
  type: InterfaceType;
  label?: string;
}
```

### 2.3 Constraints

- **Performance:** Must render 100+ connections at 60fps
- **Accessibility:** Connections must be traceable by hover/keyboard
- **Export:** Must render correctly in static PNG/PDF exports
- **Mobile:** Touch-friendly interaction targets

---

## 3. Coordinate System

### 3.1 Layout Constants

From `src/lib/constants/layout.ts`:

```typescript
U_HEIGHT_PX = 22          // 1U = 22 pixels
RAIL_WIDTH = 17           // Mounting rail width
BASE_RACK_WIDTH = 220     // 19" rack base width
BASE_RACK_PADDING = 18    // Top padding for rack name
```

### 3.2 Port Positioning Constants

From PortIndicators.svelte:

```typescript
PORT_RADIUS = 3           // Port circle radius
PORT_SPACING = 8          // Distance between port centers
PORT_Y_OFFSET = 8         // Distance from device bottom edge
```

### 3.3 Port Position Calculation

To calculate absolute SVG coordinates for a port:

```typescript
function getPortPosition(
  device: PlacedDevice,
  deviceType: DeviceType,
  portIndex: number,
  rackHeight: number
): { x: number; y: number } {
  // Device Y position (SVG origin at top-left)
  const deviceY = (rackHeight - device.position - deviceType.u_height + 1) * U_HEIGHT_PX;

  // Device X starts after left rail
  const deviceX = RAIL_WIDTH;

  // Device dimensions
  const deviceWidth = BASE_RACK_WIDTH - (RAIL_WIDTH * 2);
  const deviceHeight = deviceType.u_height * U_HEIGHT_PX;

  // Port positions (centered horizontally at device bottom)
  const portCount = deviceType.interfaces?.length ?? 0;
  const totalPortWidth = (portCount - 1) * PORT_SPACING;
  const portStartX = (deviceWidth - totalPortWidth) / 2;

  // Final absolute position
  const x = deviceX + portStartX + (portIndex * PORT_SPACING);
  const y = deviceY + deviceHeight - PORT_Y_OFFSET;

  // Add rack transform offset
  const rackOffset = BASE_RACK_PADDING + RAIL_WIDTH;

  return {
    x,
    y: y + rackOffset
  };
}
```

### 3.4 Transform Chain

SVG coordinates flow through these transforms:

```
Rack SVG viewBox
  └── g[transform="translate(0, {RACK_PADDING + RAIL_WIDTH})"]  // Device area
      └── RackDevice[transform="translate({RAIL_WIDTH}, {yPosition})"]
          └── PortIndicators (relative to device origin)
```

For connections, we render at the rack level (before the device transform), so we need absolute coordinates.

---

## 4. Path Rendering Approaches

### 4.1 Straight Lines

**SVG:**
```svg
<line x1="{port1.x}" y1="{port1.y}" x2="{port2.x}" y2="{port2.y}"
      stroke="{color}" stroke-width="2"/>
```

**Pros:**
- Simplest implementation
- Fastest rendering
- Clear visual connection

**Cons:**
- Crosses through device bodies
- Visual clutter with many connections
- No routing intelligence

**Score:** 2/5 - Unacceptable for production, useful for debugging

### 4.2 Quadratic Bezier Curves

**SVG:**
```svg
<path d="M {p1.x},{p1.y} Q {cx},{cy} {p2.x},{p2.y}"
      stroke="{color}" stroke-width="2" fill="none"/>
```

Control point calculation:
```typescript
// Midpoint with horizontal offset
const cx = (p1.x + p2.x) / 2 + GUTTER_OFFSET;
const cy = (p1.y + p2.y) / 2;
```

**Pros:**
- Smooth curves
- Single control point (simple)
- Avoids crossing devices with good control point placement

**Cons:**
- Limited flexibility for complex paths
- Can look unnatural for vertical connections
- Control point calculation is tricky

**Score:** 3/5 - Acceptable but limited

### 4.3 Cubic Bezier Curves

**SVG:**
```svg
<path d="M {p1.x},{p1.y} C {c1x},{c1y} {c2x},{c2y} {p2.x},{p2.y}"
      stroke="{color}" stroke-width="2" fill="none"/>
```

Control point calculation:
```typescript
// Exit horizontally from port, then curve to destination
const GUTTER_X = rackWidth + 20; // Outside rack

const c1x = GUTTER_X;
const c1y = p1.y;
const c2x = GUTTER_X;
const c2y = p2.y;
```

**Pros:**
- Smooth S-curves
- Two control points for natural-looking paths
- Professional appearance

**Cons:**
- More complex calculation
- Slightly more rendering cost

**Score:** 4/5 - Recommended base approach

### 4.4 Orthogonal Routing

**SVG:**
```svg
<path d="M {p1.x},{p1.y} H {gutter} V {p2.y} H {p2.x}"
      stroke="{color}" stroke-width="2" fill="none"/>
```

**Pros:**
- Clear, engineering-style routing
- Easy to trace visually
- Standard in circuit diagrams

**Cons:**
- Needs path conflict resolution
- More complex bundling logic
- Less organic appearance

**Score:** 3/5 - Good for technical users, less aesthetic

### 4.5 External Channel Routing

**Concept:** All connections exit through gutters on left/right of rack, route vertically outside the rack area, then enter destination.

```
         +--RACK--+
    ←────|  [D1]  |
    |    |  [D2]  |────→
    |    |  [D3]  |    |
    |    |  [D4]  |────┘
    └────|  [D5]  |
         +--------+
```

**SVG with cubic bezier:**
```svg
<!-- Connection from D1 to D5 -->
<path d="M {p1.x},{p1.y}
         C {leftGutter},{p1.y} {leftGutter},{p2.y} {p2.x},{p2.y}"
      stroke="{color}" stroke-width="2" fill="none"/>
```

**Pros:**
- Never crosses device bodies
- Clean visual hierarchy
- Natural bundling by direction
- Best visual clarity

**Cons:**
- Uses more horizontal space
- Requires gutter calculation
- Need to balance left/right routing

**Score:** 5/5 - Recommended approach

---

## 5. Cross-Face Connections

### 5.1 Challenge

When a connection goes from a front port to a rear port:
- In single-view mode, one endpoint is not visible
- In dual-view mode, the connection spans two separate SVG views

### 5.2 Approaches Evaluated

#### A. Tunnel Effect
Show connection "entering" the device with a tunnel indicator:
```svg
<!-- Front view: Connection goes TO device edge -->
<path d="M {port.x},{port.y} L {deviceEdge},{deviceMid}"/>
<circle cx="{deviceEdge}" cy="{deviceMid}" r="4" class="tunnel-indicator"/>
```

**Verdict:** Good for single-view mode

#### B. Dashed Line Continuation
Use dashed stroke to indicate "through rack":
```svg
<path d="..." stroke-dasharray="4 2" class="cross-face"/>
```

**Verdict:** Confusing - looks like "planned" connection

#### C. Edge Markers
Small arrows at device edge showing continuation:
```svg
<polygon points="..." class="continuation-arrow"/>
```

**Verdict:** Too subtle, easy to miss

#### D. Dual-View Bridge (Recommended)
In dual-view mode, render a curved path that bridges the gap:
```svg
<!-- Spans both views with an arc through the gap -->
<path d="M {frontPort.x},{frontPort.y}
         C {frontPort.x + gap/2},{frontPort.y}
           {rearPort.x - gap/2},{rearPort.y}
           {rearPort.x},{rearPort.y}"/>
```

**Verdict:** Best for dual-view mode

### 5.3 Recommendation

- **Single-view:** Tunnel effect with visual indicator at device edge
- **Dual-view:** Bridge curve connecting both views
- **Visual cue:** Dashed stroke or different opacity for cross-face portions

---

## 6. Connection Bundling

### 6.1 When to Bundle

Bundle connections when:
- 3+ connections between same device pair
- 5+ connections in same routing direction
- Visual clutter exceeds threshold

### 6.2 Bundle Representation

```svg
<!-- Bundle indicator -->
<g class="connection-bundle">
  <path d="..." stroke-width="4"/>
  <text class="bundle-count">×5</text>
</g>
```

### 6.3 Interaction

- Hover on bundle: Fan out individual paths with animation
- Click on bundle: Show connection list in panel
- Bundle preserves individual connection colors as gradient or stripes

---

## 7. Performance Analysis

### 7.1 Benchmark Setup

Test scenarios:
- 10 connections: Typical small homelab
- 50 connections: Medium deployment
- 100 connections: Large homelab / small enterprise
- 200 connections: Stress test

Metrics:
- Initial render time
- SVG DOM node count
- Interaction responsiveness (hover latency)

### 7.2 Optimization Strategies

1. **Lazy rendering:** Only render visible connections at current zoom
2. **Path simplification:** Reduce bezier complexity at low zoom
3. **CSS containment:** Use `contain: strict` on connection layer
4. **requestAnimationFrame:** Batch hover state updates
5. **Virtualization:** For >100 connections, render summary view

### 7.3 Expected Performance

| Connections | DOM Nodes | Render Time | Target |
|-------------|-----------|-------------|--------|
| 10 | ~20 | <5ms | Pass |
| 50 | ~100 | <10ms | Pass |
| 100 | ~200 | <16ms | Pass |
| 200 | ~400 | <32ms | Acceptable |

**Note:** Each connection = 1 path + optional hover overlay

---

## 8. Interaction Design

### 8.1 Hover Highlighting

```css
.connection-path {
  stroke-opacity: 0.6;
  transition: stroke-opacity 150ms;
}

.connection-path:hover,
.connection-path.highlighted {
  stroke-opacity: 1;
  stroke-width: 3;
}
```

### 8.2 Port-to-Connection Linking

When hovering a port, highlight all connected connections:
```typescript
function handlePortHover(portId: string) {
  const connected = connections.filter(
    c => c.a_port_id === portId || c.b_port_id === portId
  );
  connected.forEach(c => highlightConnection(c.id));
}
```

### 8.3 Keyboard Navigation

- Tab through connections (focus ring on path)
- Arrow keys to trace path direction
- Enter to show connection details
- Escape to clear highlight

### 8.4 Selection Integration

- Selecting a device highlights its connections
- Selecting a connection highlights both endpoints
- Multi-select shows shared connections

---

## 9. Export Considerations

### 9.1 Static Export (PNG/PDF)

- Render all connections (no virtualization)
- Use full opacity (no hover states)
- Include connection labels if enabled
- Maintain color coding

### 9.2 SVG Export

- Inline styles (no CSS references)
- Flatten transforms
- Include connection metadata as data attributes

### 9.3 Print Optimization

- Thicker strokes for print (3px vs 2px)
- Ensure sufficient contrast
- Optional: B&W mode with patterns instead of colors

---

## 10. Accessibility

### 10.1 ARIA Labels

```svg
<path role="graphics-symbol"
      aria-label="Connection from Switch Port 1 to Server eth0"
      aria-describedby="connection-{id}-desc"/>
<desc id="connection-{id}-desc">
  CAT6a cable connecting UniFi Switch port Gi1/0/1 to Dell R640 eth0
</desc>
```

### 10.2 Screen Reader Announcements

When connection state changes:
```typescript
announceToScreenReader(`Connection ${label} highlighted`);
```

### 10.3 Focus Management

- Connections are focusable (tabindex="0")
- Focus moves between connected ports
- Focus ring visible at all zoom levels

---

## 11. Implementation Recommendation

### 11.1 Recommended Approach

**External channel routing with cubic bezier curves:**

1. Connections exit horizontally from port to gutter
2. Route vertically in gutter (left or right based on load balancing)
3. Enter horizontally to destination port
4. Use cubic bezier for smooth curves at corners

### 11.2 SVG Layer Placement

Insert before devices layer:

```svelte
<!-- Rack.svelte structure -->
<svg>
  <!-- ... rack background, rails, slots ... -->

  <!-- Layer 7.5: Connections (behind devices) -->
  <g class="connection-layer" transform="translate(0, {RACK_PADDING + RAIL_WIDTH})">
    {#each connections as connection}
      <ConnectionPath {connection} />
    {/each}
  </g>

  <!-- Layer 8: Devices -->
  <g class="devices-layer">
    {#each devices as device}
      <RackDevice {device} />
    {/each}
  </g>

  <!-- ... drop preview, labels ... -->
</svg>
```

### 11.3 Component Structure

```
src/lib/components/
├── ConnectionLayer.svelte      # Container for all connections
├── ConnectionPath.svelte       # Single connection path rendering
├── ConnectionBundle.svelte     # Grouped connections
└── utils/
    └── connection-routing.ts   # Path calculation algorithms
```

### 11.4 Implementation Phases

**Phase 1 (MVP):**
- Basic cubic bezier paths
- Same-face connections only
- Single color per connection
- No bundling

**Phase 2:**
- External channel routing
- Cross-face visualization
- Hover highlighting

**Phase 3:**
- Connection bundling
- Performance optimization
- Export support

### 11.5 Estimated Effort

| Phase | Days |
|-------|------|
| Phase 1 (MVP) | 2-3 |
| Phase 2 | 2 |
| Phase 3 | 1-2 |
| **Total** | **5-7 days** |

---

## 12. Appendices

### A. Prototype Code

See `docs/research/prototype-connection-paths.html` for interactive SVG prototype comparing all five approaches.

### B. Reference Implementations

- **draw.io:** Orthogonal routing with waypoints
- **React Flow:** Smooth step edges (orthogonal with radius)
- **D3.js:** Link force with curved paths
- **Mermaid:** Bezier curves for flowcharts

### C. Algorithm Pseudocode

```typescript
function calculateConnectionPath(
  source: Point,
  target: Point,
  rackBounds: Rect,
  options: PathOptions
): string {
  const GUTTER_OFFSET = 30; // Pixels outside rack

  // Determine routing side (balance left/right)
  const side = source.y > target.y ? 'left' : 'right';
  const gutterX = side === 'left'
    ? rackBounds.x - GUTTER_OFFSET
    : rackBounds.x + rackBounds.width + GUTTER_OFFSET;

  // Control points for cubic bezier
  const c1 = { x: gutterX, y: source.y };
  const c2 = { x: gutterX, y: target.y };

  return `M ${source.x},${source.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${target.x},${target.y}`;
}
```

---

## 13. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-03 | Use cubic bezier curves | Best balance of aesthetics and implementation complexity |
| 2026-01-03 | External channel routing | Prevents device occlusion, clearest visual hierarchy |
| 2026-01-03 | Render behind devices | Connections support devices, not vice versa |
| 2026-01-03 | Defer bundling to Phase 3 | MVP doesn't need it, complexity can wait |

---

**End of Spike Research Document**
