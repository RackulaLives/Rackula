# Spike #426: SvelteFlow Evaluation - External Research

**Date:** 2026-01-14
**Sources:** svelteflow.dev, xyflow GitHub, npm registry

---

## SvelteFlow Overview

SvelteFlow is a customizable Svelte component for building node-based editors and interactive diagrams. It's part of the xyflow monorepo alongside React Flow, sharing a common foundation library (@xyflow/system).

### Package Information

| Attribute          | Value            |
| ------------------ | ---------------- |
| Package            | `@xyflow/svelte` |
| Latest Version     | 1.5.0            |
| License            | MIT              |
| Weekly Downloads   | ~36K             |
| Svelte Requirement | ^5.25.0          |
| Rackula Svelte     | 5.46.3 ✓         |

### Dependencies

```json
{
  "peerDependencies": {
    "svelte": "^5.25.0"
  },
  "dependencies": {
    "@svelte-put/shortcut": "^4.1.0",
    "@xyflow/system": "0.0.74"
  }
}
```

---

## Core Architecture

### Rendering Approach

SvelteFlow uses **SVG-based rendering** for edges and **DOM-based rendering** for nodes:

- **Edges**: Rendered as SVG paths within a dedicated SVG layer
- **Nodes**: Rendered as positioned DOM elements (divs) with CSS transforms
- **Handles**: Connection points rendered within node components

This hybrid approach differs from Rackula's pure SVG rendering.

### Coordinate System

SvelteFlow operates on a **viewport-based coordinate system**:

- **Flow coordinates**: Absolute positions within the graph space (node.x, node.y)
- **Screen coordinates**: Pixel positions relative to the viewport
- **Viewport state**: Tracks zoom level and pan offset separately

**Conversion utilities:**

- `screenToFlowPosition(pos)`: Screen → flow coordinates
- `flowToScreenPosition(pos)`: Flow → screen coordinates

### Pan/Zoom Implementation

Built-in viewport controls:

- `zoomIn()` / `zoomOut()`: 1.2x multiplier with animation
- `setZoom(level)`: Explicit zoom level
- `setCenter(x, y)`: Center viewport on coordinates
- `fitView()`: Auto-fit all content
- `fitBounds(rect)`: Fit to specific rectangle

---

## Edge Rendering System

### Built-in Edge Types

| Type         | Description                        |
| ------------ | ---------------------------------- |
| `bezier`     | Curved cubic bezier (default)      |
| `straight`   | Direct linear paths                |
| `step`       | Right-angle orthogonal paths       |
| `smoothstep` | Stepped paths with rounded corners |

### Path Calculation Functions

```typescript
// Available from @xyflow/svelte
getBezierPath({ sourceX, sourceY, targetX, targetY, ...options });
getSmoothStepPath({ sourceX, sourceY, targetX, targetY, ...options });
getStraightPath({ sourceX, sourceY, targetX, targetY });
```

These functions return SVG path `d` attribute strings compatible with `<path>` elements.

### Custom Edge Implementation

```svelte
<script lang="ts">
  import { BaseEdge, getBezierPath } from "@xyflow/svelte";

  export let sourceX, sourceY, targetX, targetY;

  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY });
</script>

<BaseEdge {path} />
```

Custom SVG paths can also be manually constructed using standard SVG commands (M, L, C, Q).

---

## Handle System

Handles define connection points on nodes:

```svelte
<Handle type="source" position={Position.Right} />
<Handle type="target" position={Position.Left} />
```

### Handle Features

- **Positioning**: `Position.Left`, `Right`, `Top`, `Bottom`
- **Types**: `source` (outgoing) or `target` (incoming)
- **Validation**: `isValidConnection` callback for custom rules
- **Multiple handles**: Unique IDs via `sourceHandle`/`targetHandle`

### Dynamic Handles

Use `useUpdateNodeInternals()` hook when programmatically changing handle positions or quantities.

---

## State Management

### Available Hooks

| Hook                   | Purpose                            |
| ---------------------- | ---------------------------------- |
| `useNodes()`           | Reactive nodes array store         |
| `useEdges()`           | Reactive edges array store         |
| `useStore()`           | Internal state access              |
| `useConnection()`      | Active connection data during drag |
| `useNodeConnections()` | Connected edges for a node         |
| `useSvelteFlow()`      | Viewport and utility functions     |

### Reactivity Model

SvelteFlow uses Svelte stores internally:

- Node/edge changes trigger reactive updates
- Custom stores can sync with external state
- Compatible with Svelte 5 runes ($state, $derived)

---

## Integration Considerations

### What SvelteFlow Provides

1. **Edge path calculation**: Built-in bezier/step path functions
2. **Handle-to-handle connections**: Drag-based connection creation
3. **Connection validation**: Custom validation callbacks
4. **Viewport management**: Pan/zoom with coordinate conversion
5. **Minimap/controls**: Optional UI components

### What SvelteFlow Assumes

1. **Nodes are primary**: Edges connect nodes, not arbitrary points
2. **DOM-based nodes**: Nodes render as positioned divs, not SVG
3. **Single viewport**: One SvelteFlow instance = one coordinate space
4. **Self-contained canvas**: The flow renders in its own container

### Architectural Mismatches with Rackula

| SvelteFlow            | Rackula                           | Conflict             |
| --------------------- | --------------------------------- | -------------------- |
| DOM nodes + SVG edges | Pure SVG                          | Rendering model      |
| Single viewport       | Multiple racks (SVGs)             | Coordinate spaces    |
| Built-in panzoom      | panzoom library                   | Dual control systems |
| Nodes have positions  | Ports derive from device position | Position management  |
| Canvas-first          | SVG-first (for export)            | Export compatibility |

---

## Export Considerations

### SvelteFlow's Approach

- Nodes are DOM elements → not directly SVG-exportable
- Edges are SVG → exportable but in SvelteFlow's coordinate space
- No built-in static export (PNG/PDF/SVG)
- SSR support for pre-computing dimensions, not rendering

### Rackula's Requirements

- SVG export for quality diagrams
- PNG/PDF export for sharing
- Consistent rendering across canvas and export
- Connection paths must be part of exported SVG

**Verdict**: SvelteFlow's hybrid rendering doesn't align with Rackula's export-first requirements.

---

## Performance Characteristics

### Stated Capabilities

- Built-in virtualization for large graphs (1000+ nodes)
- Efficient reactive updates via Svelte stores
- CSS containment for isolation

### Rackula Context

- Target: 100+ connections at 60fps (from Spike #262)
- Pure SVG approach already benchmarked
- No virtualization currently needed at Rackula's scale

---

## Bundle Size

**Note**: Bundlephobia data unavailable during research.

Based on xyflow architecture:

- `@xyflow/svelte`: Main package with components
- `@xyflow/system`: Shared ~30KB (estimated from React Flow)
- Total: Estimated 40-60KB gzipped

Spike #426 Go Criteria specifies: < 30KB gzipped increase

---

## Alternative: Porting Patterns

If SvelteFlow integration is not recommended, these patterns can be ported:

### 1. Edge Path Calculation

```typescript
// Can be extracted or reimplemented
function getBezierPath({ sourceX, sourceY, targetX, targetY, curvature }) {
  const controlX = sourceX + (targetX - sourceX) * curvature;
  return `M ${sourceX},${sourceY} C ${controlX},${sourceY} ${controlX},${targetY} ${targetX},${targetY}`;
}
```

### 2. Handle State Machine

```typescript
type HandleState = "idle" | "connecting" | "hovering" | "connected";

// Visual states based on connection status
handleState = isConnecting && isValidTarget ? "connecting" : "idle";
```

### 3. Connection Validation

```typescript
function isValidConnection(connection: Connection): boolean {
  const sourcePort = getPort(connection.a_port_id);
  const targetPort = getPort(connection.b_port_id);
  return sourcePort.type === targetPort.type; // Same interface type
}
```

### 4. Edge Label Positioning

```typescript
function getEdgeLabelPosition(path: SVGPathElement, t = 0.5): Point {
  const length = path.getTotalLength();
  return path.getPointAtLength(length * t);
}
```

---

## Key Findings

### Strengths for Rackula

1. **Proven edge path algorithms**: getBezierPath, getSmoothStepPath
2. **Handle concept**: Maps to PlacedPort connection points
3. **Connection validation**: Pattern for port type constraints
4. **Active maintenance**: Regular releases, MIT license

### Weaknesses for Rackula

1. **Hybrid rendering**: DOM nodes don't fit pure SVG requirement
2. **Coordinate mismatch**: Would need bridge layer for SVG viewBox
3. **Dual panzoom**: Conflict with existing panzoom library
4. **Export incompatibility**: DOM nodes can't be exported to SVG
5. **Overhead**: Would add complexity without solving core rendering

### Verdict

**SvelteFlow is not recommended for Rackula integration**, but its edge path calculation patterns and handle state machine concepts are worth adapting for custom implementation.

---

## Sources

- https://svelteflow.dev/ - Official documentation
- https://svelteflow.dev/learn/customization/custom-edges - Edge rendering
- https://svelteflow.dev/api-reference/components/handle - Handle components
- https://svelteflow.dev/api-reference/hooks - Available hooks
- https://github.com/xyflow/xyflow - Monorepo
- npm registry - Package metadata
