# Spike #426: SvelteFlow Evaluation - Codebase Analysis

**Date:** 2026-01-14
**Parent Epic:** #362 (Connection Graph Model)

---

## Files Examined

- `src/lib/schemas/index.ts` - Connection and PlacedPort schema definitions
- `src/lib/types/index.ts` - Type definitions (Connection, PlacedPort, Cable interfaces)
- `src/lib/utils/port-utils.ts` - Port instantiation utilities
- `src/lib/stores/cables.svelte.ts` - Legacy cable store (CRUD operations)
- `src/lib/stores/canvas.svelte.ts` - Canvas/panzoom state management
- `src/lib/utils/coordinates.ts` - Coordinate transformation (screen↔SVG)
- `src/lib/utils/canvas.ts` - Fit-all and rack positioning calculations
- `src/lib/constants/layout.ts` - Rendering constants (U_HEIGHT_PX, RAIL_WIDTH, etc.)
- `src/lib/components/Canvas.svelte` - Main canvas component with panzoom integration
- `src/lib/components/Rack.svelte` - Rack SVG rendering
- `src/lib/components/PortIndicators.svelte` - Port visualization component
- `docs/research/spike-262-cable-path-algorithm.md` - Cable path algorithm research
- `docs/research/spike-237-network-interface-visualization.md` - Port visualization research
- `package.json` - Tech stack and dependencies

---

## Existing Port/Connection Infrastructure

### Connection Model (MVP)

```typescript
interface Connection {
  id: string; // UUID
  a_port_id: string; // PlacedPort.id
  b_port_id: string; // PlacedPort.id
  label?: string;
  color?: string; // Hex color for visualization
}

interface PlacedPort {
  id: string; // UUID - stable identity
  template_name: string;
  template_index: number;
  type: InterfaceType;
  label?: string;
}
```

- Located in schema v1.0.0 with NetBox compatibility
- Port instantiation creates stable UUIDs via `instantiatePorts()` function
- Connections stored in `layout.connections[]` array
- PlacedPort instances created and stored on each PlacedDevice

### Legacy Cable Store

- Full CRUD operations via `getCableStore()` with validation
- Uses fragile device+interface name references (deprecated in favor of Connections)
- Includes duplicate checking, cross-face validation, cascade deletion
- Raw operations for undo/redo support

---

## Rendering Architecture

### SVG Layer Structure

```
Rack SVG (viewBox="{width} {viewBoxHeight}")
├── Background/grid (layers 1-2)
├── Rails (top/bottom bars)
├── Connection layer (behind devices) - PROPOSED
│   └── ConnectionPath components (cubic bezier curves)
├── Devices layer
│   └── RackDevice (each with PortIndicators)
└── Selection/overlays
```

### Current Rendering Patterns

- Layered SVG with transform chains
- RackDevice uses nested transforms: `translate(RAIL_WIDTH, yPosition)`
- Port indicators positioned at device bottom with 8px offset
- High-density mode uses grouped badges for >24 ports
- All rendering via Svelte 5 runes ($state, $derived, $effect)

### Canvas Transformation

- Canvas.svelte wraps SVG in panzoom container
- panzoom applies CSS scale() transforms
- Coordinate transforms use getBoundingClientRect() (not getScreenCTM) due to Safari bug #424
- Two helper functions: `screenToSVG()` and `svgToScreen()` for coordinate conversion

---

## Coordinate System Details

### Layout Constants

```typescript
// From layout.ts
U_HEIGHT_PX = 22; // pixels per rack unit
BASE_RACK_WIDTH = 220; // pixels (19" rack)
RAIL_WIDTH = 17; // pixels per side
BASE_RACK_PADDING = 18; // pixels (top, for rack name)
DUAL_VIEW_GAP = 24; // pixels (front/rear spacing)
```

### Port Positioning

```typescript
// From PortIndicators.svelte
PORT_RADIUS = 3;
PORT_SPACING = 8; // Distance between port centers
PORT_Y_OFFSET = 8; // Distance from device bottom edge
```

### SVG Coordinate Space

- Origin at top-left
- Device Y = `(rackHeight - device.position - u_height + 1) * U_HEIGHT_PX`
- Port X = device center + `(portIndex - count/2) * PORT_SPACING`
- Port Y = device bottom - PORT_Y_OFFSET
- Transform chain: rack viewBox → device translate → port positions (relative)

---

## Integration Points for SvelteFlow

### 1. Data Model Compatibility

- Connection/PlacedPort types map to SvelteFlow's Node/Edge concepts
- `a_port_id`/`b_port_id` reference PlacedPort UUIDs (stable identifiers)
- Color and label properties align with edge customization
- No breaking changes needed to schema

### 2. Coordinate System Integration

**Critical Challenge:** SvelteFlow uses absolute screen/canvas coordinates; Rackula uses SVG viewBox coordinates with nested transforms.

- SvelteFlow nodes would need to represent PlacedPort positions (not devices)
- Port positions are derived from: device position + port index + device u_height
- Requires either:
  - Recalculating port positions at every device change
  - Storing pre-calculated absolute positions
  - Custom coordinate bridge layer

### 3. SVG Rendering Integration

- **SvelteFlow Target:** Browser default is Canvas-based rendering (performant for many nodes)
- **Rackula Requirement:** SVG rendering (for export to PNG/PDF/SVG with quality)
- SvelteFlow does support custom SVG rendering via component slots
- However, this bypasses SvelteFlow's core optimization benefits

### 4. Panzoom Compatibility

- Rackula uses panzoom library (CSS transforms + DOM manipulation)
- SvelteFlow has built-in pan/zoom with mouse wheel, drag, keyboard
- **Conflict Risk:** Two independent pan/zoom systems could interfere
- Would need to disable one or create unified control

### 5. Component Structure

- SvelteFlow renders in a container with its own viewport
- Rackula SVGs render inside Rack.svelte
- Integration would require either:
  - SvelteFlow container as sibling to racks (separate rendering system)
  - SvelteFlow nodes _inside_ Rack SVG (custom rendering, limited benefits)

---

## Technical Constraints

### 1. Current Tech Stack

- Svelte 5 (runes-based, no Svelte Store API)
- Vite bundler
- CSS custom properties for theming (tokens.css)
- panzoom library for canvas manipulation
- No graph/node-link libraries currently in use

### 2. CSS/Styling Approach

- Design tokens via CSS custom properties (--spacing-_, --colour-_, etc.)
- No CSS-in-JS or Tailwind
- SvelteFlow uses Tailwind by default; would need custom styling

### 3. Performance Constraints

- Spike #262 documents: 100+ connections at 60fps is target
- SVG DOM preferred for static exports
- No virtualization currently in place (may be needed at scale)

### 4. Export Requirements

- PNG/PDF/SVG exports must include connections
- Export layer (export.ts) uses different constants than canvas
- SvelteFlow's Canvas rendering doesn't export well to static formats

### 5. Mobile/Touch Support

- Custom gesture handling for mobile placement
- Panzoom handles pinch zoom
- No touch-optimized graph interaction library

---

## Key Findings

### 1. SvelteFlow Fit Assessment

| Aspect                   | Fit Level | Notes                                  |
| ------------------------ | --------- | -------------------------------------- |
| Data model (nodes/edges) | Fair      | PlacedPort/Connection map conceptually |
| Coordinate system        | Poor      | SVG viewBox vs. absolute coords        |
| SVG rendering            | Poor      | Canvas-first design, SVG is secondary  |
| Panzoom integration      | Poor      | Dual systems would conflict            |
| Export capabilities      | Poor      | Canvas doesn't export to SVG/PDF well  |

### 2. Existing Research Assets

- **Spike #262** provides complete cable path algorithm research
- **Spike #237** covers port visualization (already implemented)
- Cubic bezier curves with external channel routing recommended
- Cross-face connections use dual-view bridge or tunnel indicators
- Reference implementation: `docs/research/connection-routing.ts`

### 3. Alternative Architecture - Custom SVG Rendering

```
src/lib/components/
├── ConnectionLayer.svelte         // Container for all connections
├── ConnectionPath.svelte          // Single connection path (cubic bezier)
├── ConnectionBundle.svelte        // Grouped connections (Phase 3)
└── utils/
    └── connection-routing.ts      // Path calculation (documented in #262)
```

### 4. Current Implementation State

- Schemas and types ready (PlacedPort, Connection)
- Port indicators rendering (PortIndicators.svelte working)
- Port/device positioning calculations documented
- Cable store exists but uses deprecated Cable model
- No connection rendering layer yet implemented

### 5. Integration Complexity

| Approach               | Estimated Effort | Risk Level                           |
| ---------------------- | ---------------- | ------------------------------------ |
| SvelteFlow integration | 7-10 days        | High (architectural friction)        |
| Custom SVG rendering   | 3-5 days         | Low (aligned with existing patterns) |

---

## Preliminary Recommendation

**Proceed with custom SVG-based connection rendering, NOT SvelteFlow integration.**

**Rationale:**

1. Spike #262 already provides complete algorithm research
2. SvelteFlow introduces architectural friction (coordinate systems, canvas vs. SVG, panzoom)
3. Rackula's SVG rendering requirement (exports, precision, styling) is fundamental
4. Custom approach delivers faster with better project alignment
5. PortIndicators component provides proven pattern for SVG rendering

**Note:** This recommendation will be validated against external research in Phase 2b.
