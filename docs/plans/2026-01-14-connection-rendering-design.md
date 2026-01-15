# Connection Rendering System Design

**Date:** 2026-01-14
**Epic:** #362 (Connection Graph Model)
**Status:** Approved

---

## Overview

A rack-scoped connection rendering system for visualizing cable connections between device ports. Designed for documentation workflows where users create connections via a panel form and export diagrams.

### Scope

**In scope (MVP):**

- Same-face connections only (front-to-front, rear-to-rear)
- Panel form for connection creation
- 20-100 connections at 60fps
- SVG export compatibility

**Out of scope (future phases):**

- Cross-face connections (front-to-rear)
- Cross-rack connections
- Drag-to-connect UX
- Context menu creation

---

## Architecture

### Approach: Rack-Scoped ConnectionLayer

Each `Rack.svelte` contains its own `ConnectionLayer` that renders connections between ports within that rack. This avoids coordinate bridging issues and ensures connections export naturally with the rack SVG.

```
Rack.svelte
├── <g class="connection-layer">  ← renders before devices
│   └── ConnectionPath (for each connection)
├── <g class="devices-layer">
│   └── RackDevice → PortIndicators
```

### Component Structure

**1. ConnectionLayer.svelte** (Container)

```
src/lib/components/ConnectionLayer.svelte
```

- Renders as `<g class="connection-layer">` inside Rack.svelte
- Positioned before devices layer (connections render behind)
- Filters connections to only those where both ports exist in this rack
- Builds port lookup map for O(1) position queries

**2. ConnectionPath.svelte** (Single connection)

```
src/lib/components/ConnectionPath.svelte
```

- Renders single SVG `<path>` with cubic bezier curve
- Handles hover state (opacity/width change)
- Includes ARIA label for accessibility

**3. connection-routing.ts** (Utility)

```
src/lib/utils/connection-routing.ts
```

- `getPortPosition(device, port, rackHeight)` → `{x, y}`
- `calculateConnectionPath(source, target, rackWidth, index)` → SVG path string
- Uses external channel routing algorithm

---

## Data Flow

### State Management

No new store. Connections live in existing layout store at `layout.connections[]`.

**Layout Store Additions:**

```typescript
addConnection(connection: Connection): void
removeConnection(connectionId: string): void
getConnectionsForRack(rackId: string): Connection[]
getConnectionsForPort(portId: string): Connection[]
```

### Derived State

ConnectionLayer filters connections to its rack:

```typescript
let rackConnections = $derived(
  connections.filter((c) => {
    const portA = findPortInRack(c.a_port_id, devices);
    const portB = findPortInRack(c.b_port_id, devices);
    return portA && portB;
  }),
);
```

### Port Lookup

Build map once per render to avoid O(n²):

```typescript
let portMap = $derived(
  new Map(
    devices.flatMap((d) => d.ports.map((p) => [p.id, { port: p, device: d }])),
  ),
);
```

---

## Algorithms

### Port Position Calculation

```typescript
function getPortPosition(
  device: PlacedDevice,
  port: PlacedPort,
  rackHeight: number,
): Point {
  const deviceType = getDeviceType(device.slug);
  const portIndex = device.ports.findIndex((p) => p.id === port.id);
  const portCount = device.ports.length;

  // Device Y: Convert U-position to SVG coords
  const deviceY =
    (rackHeight - device.position - deviceType.u_height + 1) * U_HEIGHT_PX;

  // Device dimensions
  const deviceWidth = BASE_RACK_WIDTH - RAIL_WIDTH * 2;
  const deviceHeight = deviceType.u_height * U_HEIGHT_PX;

  // Ports centered horizontally at device bottom
  const totalPortWidth = (portCount - 1) * PORT_SPACING;
  const portStartX = RAIL_WIDTH + (deviceWidth - totalPortWidth) / 2;

  return {
    x: portStartX + portIndex * PORT_SPACING,
    y: deviceY + deviceHeight - PORT_Y_OFFSET + BASE_RACK_PADDING,
  };
}
```

### External Channel Path

```typescript
function calculateConnectionPath(
  source: Point,
  target: Point,
  rackWidth: number,
  connectionIndex: number,
): string {
  const GUTTER_OFFSET = 30;

  // Alternate left/right to distribute visual load
  const side = connectionIndex % 2 === 0 ? "right" : "left";
  const gutterX = side === "right" ? rackWidth + GUTTER_OFFSET : -GUTTER_OFFSET;

  // Cubic bezier: exit horizontal, curve through gutter, enter horizontal
  return `M ${source.x},${source.y} C ${gutterX},${source.y} ${gutterX},${target.y} ${target.x},${target.y}`;
}
```

---

## Interaction Design

### Hover States

```css
.connection-path {
  fill: none;
  stroke-width: 2;
  stroke-opacity: 0.7;
  stroke-linecap: round;
  transition:
    stroke-opacity 150ms,
    stroke-width 150ms;
}

.connection-path:hover,
.connection-path.highlighted {
  stroke-opacity: 1;
  stroke-width: 3;
}
```

### Port-to-Connection Linking

Hovering a port highlights all its connections:

```typescript
let isHighlighted = $derived(
  highlightedConnectionId === connection.id ||
    highlightedPortId === connection.a_port_id ||
    highlightedPortId === connection.b_port_id,
);
```

### Accessibility

```svelte
<path
  role="graphics-symbol"
  aria-label="Connection from {sourceLabel} to {targetLabel}"
  tabindex="0"
/>
```

---

## Connection Creation Panel

### Form Design

```
┌─ Add Connection ─────────────────────┐
│  Source Device    [Dropdown ▼]       │
│  Source Port      [Dropdown ▼]       │
│  Target Device    [Dropdown ▼]       │
│  Target Port      [Dropdown ▼]       │
│  Label (optional) [____________]     │
│  Color            [● Default ▼]      │
│  [Cancel]              [Add Connection]
└──────────────────────────────────────┘
```

### Validation Rules

- Source and target cannot be same port
- Both ports must be on same face (MVP)
- Port must not already have a connection
- Cascading dropdowns filter based on selection

### Connections List

```
┌─ Connections (3) ────────────────────┐
│  Switch:eth0 → Server:eth0     [🗑]  │
│  Switch:eth1 → NAS:eth0        [🗑]  │
│  PDU:out1 → Server:psu0        [🗑]  │
└──────────────────────────────────────┘
```

---

## Edge Cases

### Orphaned Connections

When device deleted, cascade delete its connections:

```typescript
// In layoutStore.removeDevice()
const devicePorts = device.ports.map((p) => p.id);
layout.connections = layout.connections.filter(
  (c) =>
    !devicePorts.includes(c.a_port_id) && !devicePorts.includes(c.b_port_id),
);
```

### Invalid Port References

Skip rendering with warning, don't crash:

```typescript
if (!portA || !portB) {
  console.warn(`Connection ${connection.id} has invalid port reference`);
  return null;
}
```

### Duplicate Prevention

Validate before adding:

```typescript
const existing = connections.find(
  (c) =>
    (c.a_port_id === a && c.b_port_id === b) ||
    (c.a_port_id === b && c.b_port_id === a),
);
if (existing) throw new Error("Connection already exists");
```

---

## Implementation Phases

### Phase 1: Core Rendering (MVP)

- `connection-routing.ts` utilities
- `ConnectionPath.svelte` with hover
- `ConnectionLayer.svelte` container
- Integration into `Rack.svelte`
- Layout store functions + cascade delete

### Phase 2: Creation UX

- Connection panel UI
- Cascading dropdowns with validation
- Same-face filtering
- Undo/redo integration

### Phase 3: Polish

- Port hover → connection highlight
- Keyboard navigation
- ARIA labels
- Export verification

---

## Issue Mapping

| Issue | Title                             | Phase | Status             |
| ----- | --------------------------------- | ----- | ------------------ |
| #609  | ConnectionLayer container         | 1     | Keep               |
| #610  | ConnectionPath rendering          | 1     | Keep               |
| #611  | Port position utility             | 1     | Keep               |
| #612  | Cross-face visualization          | -     | Defer (out of MVP) |
| #613  | Hover highlighting                | 1, 3  | Keep               |
| NEW   | Layout store connection functions | 1     | Create             |
| NEW   | Cascade delete on device removal  | 1     | Create             |
| NEW   | Connection panel UI               | 2     | Create             |

---

## References

- Spike #262: Cable path rendering algorithm
- Spike #426: SvelteFlow evaluation (No-Go)
- `docs/research/connection-routing.ts`: Reference implementation
