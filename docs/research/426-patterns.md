# Spike #426: SvelteFlow Evaluation - Pattern Analysis

**Date:** 2026-01-14

---

## Key Insights

### 1. Architectural Incompatibility

The fundamental mismatch between SvelteFlow and Rackula is **rendering model**:

| Aspect           | SvelteFlow                | Rackula                          | Verdict          |
| ---------------- | ------------------------- | -------------------------------- | ---------------- |
| Node rendering   | DOM elements (divs)       | SVG elements                     | **Incompatible** |
| Edge rendering   | SVG paths                 | SVG paths                        | Compatible       |
| Coordinate space | Single canvas viewport    | Multiple SVG viewBoxes per rack  | **Incompatible** |
| Pan/zoom         | Built-in (internal state) | panzoom library (CSS transforms) | **Conflict**     |
| Export           | No native static export   | SVG/PNG/PDF required             | **Incompatible** |

### 2. What SvelteFlow Solves vs. What Rackula Needs

**SvelteFlow excels at:**

- Interactive node-based editors (like draw.io, Figma)
- Drag-and-drop node creation
- Dynamic graph layouts
- Canvas-first applications

**Rackula needs:**

- SVG rendering for quality exports
- Connections between ports within existing SVG racks
- Integration with existing panzoom system
- Minimal bundle size impact

**Conclusion:** SvelteFlow is designed for a different use case. It would add complexity without solving Rackula's actual requirements.

### 3. Prior Research Advantage

Spike #262 already provides:

- Complete cable path algorithm research
- Cubic bezier + external channel routing recommendation
- Reference implementation (`docs/research/connection-routing.ts`)
- Performance benchmarks (100+ connections at 60fps)
- Cross-face connection strategies (tunnel effect, dual-view bridge)
- Component structure proposal

This prior work eliminates the need for SvelteFlow's edge routing - the algorithms are already designed and tested for Rackula's SVG coordinate system.

---

## Implementation Approaches

### Option A: SvelteFlow Integration

**Approach:** Overlay SvelteFlow canvas on top of rack SVGs, map PlacedPorts to SvelteFlow handles.

**Required work:**

1. Create coordinate bridge layer (SVG viewBox ↔ SvelteFlow flow coords)
2. Sync positions on every device placement/move
3. Handle panzoom conflict (disable one system or create adapter)
4. Build custom edge export for PNG/PDF
5. Style customization to match design tokens

**Estimated effort:** 7-10 days

**Risks:**

- Coordinate sync jitter at zoom levels
- Panzoom conflicts during pan/drag
- Export quality degradation
- Ongoing maintenance of bridge layer

### Option B: Custom SVG Implementation

**Approach:** Build ConnectionLayer component using Spike #262 algorithms, render directly in Rack SVG.

**Required work:**

1. Create ConnectionLayer.svelte container
2. Create ConnectionPath.svelte (cubic bezier paths)
3. Implement port position calculation (already documented)
4. Add hover/selection states
5. Integrate with existing export flow

**Estimated effort:** 3-5 days (as per Spike #262)

**Benefits:**

- Native SVG rendering → automatic export support
- Uses existing coordinate system (no bridge)
- Works with existing panzoom (no conflicts)
- Smaller bundle impact
- Aligned with project architecture

### Option C: Hybrid (Port Patterns Only)

**Approach:** Use SvelteFlow only for edge path calculation functions, not the full library.

**Analysis:** SvelteFlow's path functions (`getBezierPath`, etc.) are straightforward and can be reimplemented in ~50 lines of code. The existing reference implementation in `connection-routing.ts` already provides equivalent functionality optimized for Rackula's coordinate system.

**Verdict:** Not worth the dependency for path math alone.

---

## Trade-offs Analysis

### Bundle Size

| Option                                       | Estimated Impact |
| -------------------------------------------- | ---------------- |
| SvelteFlow (@xyflow/svelte + @xyflow/system) | ~40-60KB gzipped |
| Custom SVG (ConnectionLayer + utils)         | ~5-10KB gzipped  |
| Go criteria threshold                        | < 30KB increase  |

Custom SVG clearly wins on bundle size.

### Development Velocity

| Option                 | Initial                 | Maintenance          |
| ---------------------- | ----------------------- | -------------------- |
| SvelteFlow integration | Slower (bridge layer)   | Higher (sync issues) |
| Custom SVG             | Faster (prior research) | Lower (native fit)   |

Custom SVG leverages Spike #262 research for faster delivery.

### Feature Completeness

| Feature                | SvelteFlow           | Custom SVG                |
| ---------------------- | -------------------- | ------------------------- |
| Same-face connections  | ✓                    | ✓                         |
| Cross-face connections | Complex (dual views) | Documented in #262        |
| Connection bundling    | Not built-in         | Phase 3 in #262           |
| Interactive creation   | Built-in             | Would need implementation |
| Export support         | No                   | Native                    |

The primary trade-off is **interactive connection creation** (drag port → port). SvelteFlow provides this, but the complexity cost outweighs the benefit given the other mismatches.

---

## Patterns Worth Porting

From SvelteFlow's design, these patterns can inform custom implementation:

### 1. Handle State Machine

```typescript
type HandleState =
  | "idle"
  | "connecting"
  | "hovering"
  | "valid-target"
  | "invalid-target";

// Apply to port indicators during connection creation
```

### 2. Connection Validation Architecture

```typescript
interface ConnectionValidation {
  isValidConnection: (conn: { source: Port; target: Port }) => boolean;
  onConnectStart: (portId: string) => void;
  onConnectEnd: (conn: Connection | null) => void;
}
```

### 3. Edge Path Calculation (Already in Spike #262)

```typescript
// Spike #262 provides externalChannelPath for Rackula's coordinate system
// No need to port SvelteFlow's getBezierPath
```

### 4. Edge Label Positioning

```typescript
function getPathMidpoint(pathElement: SVGPathElement, t = 0.5): Point {
  const length = pathElement.getTotalLength();
  const point = pathElement.getPointAtLength(length * t);
  return { x: point.x, y: point.y };
}
```

---

## Recommendation

**Proceed with custom SVG-based connection rendering (Option B).**

### Rationale

1. **Prior research investment**: Spike #262 provides complete algorithm design
2. **Architectural alignment**: Pure SVG fits Rackula's export-first design
3. **No bridge complexity**: Direct integration with existing coordinate system
4. **No panzoom conflict**: Works within existing canvas architecture
5. **Bundle efficiency**: Minimal size impact vs. 40-60KB for SvelteFlow
6. **Faster delivery**: 3-5 days vs. 7-10 days

### What to Defer

- **Interactive connection creation**: Start with programmatic connections via panel/form
- **Drag-to-connect**: Can be added later as enhancement
- **Connection bundling**: Phase 3 per Spike #262

### Implementation Phases (from Spike #262)

**Phase 1 (MVP): 2-3 days**

- Basic cubic bezier paths
- Same-face connections only
- Single color per connection
- No bundling

**Phase 2: 2 days**

- External channel routing
- Cross-face visualization (tunnel/bridge)
- Hover highlighting

**Phase 3: 1-2 days**

- Connection bundling (optional)
- Performance optimization
- Export support verification

---

## Decision Summary

| Criterion            | SvelteFlow | Custom SVG | Winner     |
| -------------------- | ---------- | ---------- | ---------- |
| Architectural fit    | Poor       | Excellent  | **Custom** |
| Export support       | None       | Native     | **Custom** |
| Bundle size          | 40-60KB    | 5-10KB     | **Custom** |
| Development time     | 7-10 days  | 3-5 days   | **Custom** |
| Prior research reuse | None       | Full       | **Custom** |
| Maintenance burden   | High       | Low        | **Custom** |
| Interactive creation | Built-in   | Deferred   | SvelteFlow |

**Final verdict: No-Go for SvelteFlow integration. Proceed with custom SVG implementation.**
