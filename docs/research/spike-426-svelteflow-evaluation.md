# Spike #426: Evaluate SvelteFlow for Connection/Cable Rendering

**Date:** 2026-01-14
**Parent Epic:** #362 (Connection Graph Model)
**Status:** Complete - No-Go Recommendation

---

## Executive Summary

This spike evaluated whether SvelteFlow (@xyflow/svelte) could accelerate implementation of cable/connection rendering for Rackula's network connectivity visualization.

**Recommendation: No-Go.** SvelteFlow introduces significant architectural friction without solving Rackula's actual requirements. The custom SVG approach documented in Spike #262 is faster to implement, better aligned with project architecture, and delivers superior export capabilities.

### Key Findings

| Criterion         | Result    | Detail                                                 |
| ----------------- | --------- | ------------------------------------------------------ |
| Coordinate System | **No-Go** | SVG viewBox vs. flow coordinates requires bridge layer |
| Export Support    | **No-Go** | SvelteFlow's DOM nodes don't export to SVG/PNG/PDF     |
| Pan/Zoom          | **No-Go** | Conflicts with existing panzoom library                |
| Bundle Size       | **No-Go** | 40-60KB vs. <30KB threshold                            |
| Development Time  | **No-Go** | 7-10 days vs. 3-5 days for custom                      |
| Prior Research    | N/A       | Spike #262 provides complete algorithm design          |

---

## 1. Problem Statement

### What We Need

- Visual edge/cable rendering between ports
- Cross-face routing (front → rear)
- Same-face connections (port to port within rack)
- SVG export for quality diagrams
- Integration with existing coordinate system and panzoom

### What SvelteFlow Offers

- Node-based graph editor library
- Built-in edge path calculations (bezier, step, smoothstep)
- Handle components for connection points
- Viewport management with coordinate conversion
- Connection validation callbacks

---

## 2. Technical Evaluation

### 2.1 Rendering Model Mismatch

| Aspect | SvelteFlow          | Rackula            |
| ------ | ------------------- | ------------------ |
| Nodes  | DOM elements (divs) | SVG elements       |
| Edges  | SVG paths           | SVG paths          |
| Canvas | Single viewport     | Multiple rack SVGs |

**Impact:** SvelteFlow's hybrid rendering (DOM nodes + SVG edges) cannot be exported to pure SVG. Rackula requires SVG export for PNG/PDF generation.

### 2.2 Coordinate System Conflict

```
SvelteFlow:
  Screen coords ←→ Flow coords (single space)
  Pan/zoom managed internally

Rackula:
  Screen coords → CSS transform → SVG viewBox → Device transform → Port position
  Pan/zoom via panzoom library (external)
```

**Impact:** Would require a coordinate bridge layer with position sync on every device change. Risk of jitter at different zoom levels.

### 2.3 Pan/Zoom Conflict

SvelteFlow has built-in viewport controls (zoomIn, setCenter, fitView). Rackula uses the panzoom library with CSS transforms. Running both would create:

- Conflicting gesture handlers
- Inconsistent zoom behavior
- State synchronization complexity

### 2.4 Export Incompatibility

Rackula's export requirements:

- PNG/PDF/SVG exports must include connections
- Uses different render constants for export quality
- Expects pure SVG hierarchy for serialization

SvelteFlow's limitations:

- DOM nodes cannot be serialized to SVG
- No built-in static export capability
- Would require custom export layer

---

## 3. Evaluation Against Go/No-Go Criteria

### Go Criteria (from Issue #426)

| Criterion                         | Result      | Evidence                                  |
| --------------------------------- | ----------- | ----------------------------------------- |
| Coordinate sync without jitter    | **No**      | Bridge layer required; zoom sync unproven |
| Cross-face connections achievable | **Partial** | Custom edges possible but adds complexity |
| 60fps with 50+ connections        | **Likely**  | SvelteFlow handles large graphs           |
| Bundle size < 30KB gzipped        | **No**      | Estimated 40-60KB                         |
| Integration < 2 sprints           | **No**      | 7-10 days for bridge + export layers      |

**Verdict: No-Go** - 4 of 5 criteria fail.

### No-Go Indicators (from Issue #426)

| Indicator                              | Found   |
| -------------------------------------- | ------- |
| Fundamental coordinate incompatibility | **Yes** |
| Cross-face connections require fork    | No      |
| Performance worse than pure SVG        | No      |
| Would require forking SvelteFlow       | No      |

**Verdict:** Fundamental coordinate incompatibility is a No-Go indicator.

---

## 4. Alternative: Custom SVG Implementation

Spike #262 (Cable Path Rendering Algorithm) provides complete algorithm research for custom implementation:

### Recommended Approach

**External channel routing with cubic bezier curves:**

1. Connections exit horizontally from port to gutter
2. Route vertically in gutter (left/right load balancing)
3. Enter horizontally to destination port
4. Cubic bezier for smooth curves

### Component Structure

```
src/lib/components/
├── ConnectionLayer.svelte      # Container for all connections
├── ConnectionPath.svelte       # Single connection rendering
├── ConnectionBundle.svelte     # Grouped connections (Phase 3)
└── utils/
    └── connection-routing.ts   # Path calculation (from #262)
```

### Implementation Phases

| Phase         | Scope                               | Effort       |
| ------------- | ----------------------------------- | ------------ |
| Phase 1 (MVP) | Basic cubic bezier, same-face only  | 2-3 days     |
| Phase 2       | External routing, cross-face, hover | 2 days       |
| Phase 3       | Bundling, optimization              | 1-2 days     |
| **Total**     |                                     | **5-7 days** |

### Benefits

- Native SVG → automatic export support
- Uses existing coordinate system
- Works with existing panzoom
- Minimal bundle impact (~5-10KB)
- Aligned with project architecture

---

## 5. Patterns Worth Porting

While SvelteFlow integration is not recommended, these concepts can inform custom implementation:

### 5.1 Handle State Machine

```typescript
type HandleState =
  | "idle"
  | "connecting"
  | "hovering"
  | "valid-target"
  | "invalid-target";
```

Apply to port indicators during connection creation.

### 5.2 Connection Validation

```typescript
function isValidConnection(source: PlacedPort, target: PlacedPort): boolean {
  // Same interface type?
  // Not same device?
  // Not already connected?
}
```

### 5.3 Edge Label Positioning

```typescript
function getPathMidpoint(path: SVGPathElement, t = 0.5): Point {
  const length = path.getTotalLength();
  return path.getPointAtLength(length * t);
}
```

---

## 6. Decision Log

| Date       | Decision                   | Rationale                                                |
| ---------- | -------------------------- | -------------------------------------------------------- |
| 2026-01-14 | No-Go for SvelteFlow       | Coordinate mismatch, export incompatibility, bundle size |
| 2026-01-14 | Proceed with custom SVG    | Prior research (#262), architectural alignment           |
| 2026-01-14 | Defer interactive creation | Start with panel-based connections                       |

---

## 7. Next Steps

### Immediate

1. Update epic #362 with findings
2. Create implementation issues per Phase 1/2/3
3. Close this spike with recommendation

### Implementation Priorities

1. **ConnectionLayer.svelte** - Container component
2. **ConnectionPath.svelte** - Cubic bezier rendering
3. **Port position calculation** - Use Spike #262 algorithm
4. **Hover highlighting** - CSS transitions
5. **Cross-face visualization** - Tunnel/bridge patterns

---

## 8. References

### Internal Research

- [Spike #262: Cable Path Rendering Algorithm](spike-262-cable-path-algorithm.md)
- [Reference Implementation](connection-routing.ts)
- [Visual Prototype](prototype-connection-paths.html)

### External Sources

- https://svelteflow.dev/ - SvelteFlow documentation
- https://github.com/xyflow/xyflow - xyflow monorepo
- https://reactflow.dev/ - React Flow (similar patterns)

---

## 9. Appendices

### A. SvelteFlow Package Details

```
Package: @xyflow/svelte@1.5.0
Svelte requirement: ^5.25.0
Rackula Svelte: 5.46.3 ✓
Dependencies: @xyflow/system, @svelte-put/shortcut
```

### B. Codebase Integration Points

- `src/lib/schemas/index.ts` - Connection, PlacedPort schemas (ready)
- `src/lib/components/Rack.svelte` - Connection layer insertion point
- `src/lib/components/PortIndicators.svelte` - Port positioning reference
- `src/lib/stores/canvas.svelte.ts` - Coordinate conversion utilities

### C. Files in This Research

- `426-codebase.md` - Codebase analysis
- `426-external.md` - SvelteFlow documentation research
- `426-patterns.md` - Pattern analysis and comparison
- `spike-426-svelteflow-evaluation.md` - This document (main findings)

---

**End of Spike Research Document**
