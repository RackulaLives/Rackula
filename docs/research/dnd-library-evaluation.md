# Drag-and-Drop & Collision Research for Rackula

**Date**: 2026-01-05
**Purpose**: Evaluate external DnD libraries and open source projects for patterns applicable to Rackula

---

## Open Source Projects with Similar Technical Context

These projects share Rackula's technical challenges (SVG/Canvas, drag-drop, collision, grid placement).

### Whiteboard/Canvas Editors

#### tldraw

**URL**: https://github.com/tldraw/tldraw
**Tech**: React, TypeScript, DOM-based rendering

| Relevance   | Details                                               |
| ----------- | ----------------------------------------------------- |
| Hit Testing | Full geometry system with lazy reactivity (signia)    |
| Collision   | Bounding box + precise geometry checks                |
| Coordinate  | Infinite canvas with zoom/pan                         |
| Packages    | `@tldraw/vec`, `@tldraw/intersect` for geometry utils |

**Key Pattern**: Computed scene graph for hit testing that doesn't trigger re-renders on pointer-move. Uses logical clocks instead of dirty flags.

**Source to Study**: `/packages` directory, `CONTEXT.md` files throughout repo.

#### Excalidraw

**URL**: https://github.com/excalidraw/excalidraw
**Tech**: React, TypeScript, Canvas rendering

| Relevance   | Details                                                  |
| ----------- | -------------------------------------------------------- |
| Hit Testing | BBox first, then precise iteration                       |
| Collision   | `elementsOverlappingBBox`, `isElementInsideBBox` helpers |
| Bounds      | `getCommonBounds` for multi-select                       |

**Key Pattern**: Two-phase hit testing - cheap bounding box check first, expensive precise check only if bbox hit. Exports collision helpers as public API.

**Source to Study**: PR #3512 (improved freedraw hit testing), bounds-related exports.

### Node-Based Editors (Svelte)

#### Svelvet

**URL**: https://github.com/open-source-labs/Svelvet
**Tech**: Svelte, TypeScript

| Relevance | Details                                      |
| --------- | -------------------------------------------- |
| Snap Grid | Toggle between free and snap modes           |
| Z-Index   | Stacking logic during drag                   |
| Edges     | Anchor-based connections with directionality |
| State     | Svelte stores, localStorage persistence      |

**Key Pattern**: Drawer component for drag-and-drop from palette to canvas (similar to Rackula's DevicePalette → Rack flow).

#### Svelte Flow (xyflow)

**URL**: https://github.com/xyflow/xyflow
**Tech**: Svelte/React, TypeScript

| Relevance | Details                       |
| --------- | ----------------------------- |
| Built-in  | Drag, zoom, pan, multi-select |
| Nodes     | Custom Svelte components      |
| Ecosystem | Shared with React Flow        |

### Floor Plan Editors

#### FloorspaceJS (NREL)

**URL**: https://github.com/nrel/floorspace.js
**Tech**: Vanilla JavaScript, custom JSON format

| Relevance | Details                                 |
| --------- | --------------------------------------- |
| Grid      | Customizable grid spacing               |
| Snap      | Snap-to-grid drawing                    |
| Format    | Custom JSON (similar to Rackula's YAML) |

**Key Pattern**: Pure JS for portability, custom file format for easy integration.

#### Floor Plan Lab

**URL**: https://github.com/dcarubia/floor-plan-lab
**Tech**: React

| Relevance | Details                               |
| --------- | ------------------------------------- |
| Snap Grid | Auto-sizes objects (doors, furniture) |
| Scale     | Customizable snap-to-grid scale       |

### Game Inventory Systems

#### CanvasInventory

**URL**: https://github.com/Oen44/CanvasInventory
**Tech**: TypeScript, Canvas

| Relevance | Details                          |
| --------- | -------------------------------- |
| Grid      | Diablo-style grid slots          |
| Collision | Items occupy multiple grid cells |
| Tooltip   | Hover tooltips on items          |

**Key Pattern**: Grid-cell collision (item occupies NxM cells) - similar to Rackula's U-height + half-width slots.

#### grid-based-inventory-system (Godot)

**URL**: https://github.com/Hexadotz/grid-based-inventory-system
**Tech**: Godot (GDScript), but patterns applicable

| Relevance | Details                     |
| --------- | --------------------------- |
| Style     | Resident Evil / Diablo grid |
| Collision | Multi-cell item placement   |

---

## Rackula's Current Implementation

**Strengths of existing approach:**

- Custom Pointer Events API (unified mouse/touch)
- BBox-based coordinate conversion (Safari-compatible)
- U-position grid snapping
- Half-width slot collision detection
- Cross-container dragging (palette → rack)

**Files involved:**

- `src/lib/components/RackDevice.svelte` - Pointer event handlers
- `src/lib/components/Rack.svelte` - Drop target handling
- `src/lib/utils/coordinates.ts` - Screen↔SVG conversion
- `src/lib/utils/dragdrop.ts` - Drag data management
- `src/lib/utils/collision.ts` - Placement validation

---

## Libraries Evaluated

### 1. Pragmatic Drag and Drop (Atlassian)

**URL**: https://github.com/atlassian/pragmatic-drag-and-drop

| Aspect    | Details                  |
| --------- | ------------------------ |
| Size      | ~4.7kB core              |
| Framework | Any (vanilla TS)         |
| API       | Native HTML5 DnD         |
| Used by   | Trello, Jira, Confluence |

**Architecture patterns worth noting:**

- Modular: core + optional packages (visual, a11y)
- Adapters: element, text-selection, external (files)
- Monitors: observe drag operations without being a drop target
- Headless: no opinions on visuals

**Relevance**: Low for direct adoption (DOM-focused), but monitor pattern and accessibility toolchain are excellent references.

### 2. interact.js

**URL**: https://interactjs.io/

| Aspect        | Details            |
| ------------- | ------------------ |
| Size          | Medium             |
| Framework     | Vanilla JS         |
| SVG Support   | Yes, explicit      |
| Grid Snapping | Built-in modifiers |

**Key features:**

- "Doesn't do any moving" - just provides pointer data
- Modifier system: `snap`, `restrict`, `aspectRatio`
- Grid snapper: `interact.snappers.grid({ x: 30, y: 30 })`
- Drop zones with overlap detection

**Relevance**: Medium. Modifier/snapping architecture is well-designed. Could inform future refactoring.

### 3. PlainDraggable

**URL**: https://github.com/anseki/plain-draggable

| Aspect        | Details        |
| ------------- | -------------- |
| Size          | Small, no deps |
| Framework     | Vanilla JS     |
| SVG Support   | Yes            |
| Grid Snapping | `step` option  |

**Key features:**

- Explicit SVG element support
- Simple snapping: `{ step: 40 }` for grid
- Containment boundaries
- Lifecycle hooks: `onDrag`, `onMove`, `onDragStart`

**Relevance**: Low. Simpler than what Rackula needs, but clean API.

### 4. Muuri

**URL**: https://muuri.dev/

| Aspect    | Details                 |
| --------- | ----------------------- |
| Size      | Medium                  |
| Framework | Vanilla JS              |
| Focus     | Responsive grid layouts |

**Key features:**

- Cross-grid dragging
- Bin-packing algorithms for layout
- Filtering and sorting
- Batched DOM operations

**Relevance**: Low. Layout-focused, not placement-constrained.

### 5. GoJS Planogram (Commercial)

**URL**: https://gojs.net/latest/samples/planogram.html

| Aspect   | Details              |
| -------- | -------------------- |
| License  | Commercial           |
| Use Case | Items onto racks (!) |

**Key patterns:**

- Groups = racks, Nodes = items
- `memberValidation` for drop constraints
- Grid snap via `DraggingTool.isGridSnapEnabled`
- Visual feedback on invalid drops

**Relevance**: Highest conceptual match, but commercial license.

### 6. fluid-dnd

**URL**: https://fluid-dnd.netlify.app/

| Aspect    | Details              |
| --------- | -------------------- |
| Size      | ~8kB gzipped         |
| Framework | Vue, React, Svelte 5 |
| Focus     | List reordering      |

**Key features:**

- Smooth animations inspired by react-beautiful-dnd
- Zero dependencies
- Framework agnostic core

**Relevance**: Low for current use case (list sorting, not grid placement), but good for future sortable list features.

---

## Assessment

### Verdict: Keep Custom Implementation

Rackula's constraints are too specific for off-the-shelf adoption:

1. **SVG + viewBox + CSS zoom** - Most libraries assume DOM elements
2. **U-position grid** - Not arbitrary pixel snapping
3. **Half-width slots** - Custom collision rules
4. **Cross-face placement** - Domain-specific logic

The current implementation is battle-tested and works well.

### Patterns Worth Stealing

| Pattern                     | From          | Application                                                       |
| --------------------------- | ------------- | ----------------------------------------------------------------- |
| **Monitor pattern**         | Pragmatic DnD | Observe drags without being drop target (analytics, global state) |
| **Modifier composition**    | interact.js   | Chain constraints (snap → restrict → aspectRatio)                 |
| **Accessibility toolchain** | Pragmatic DnD | Keyboard-based drag alternatives                                  |
| **Adapter pattern**         | Pragmatic DnD | Different drag sources (element, file, text)                      |

### Future Use Cases

| Scenario                       | Recommended Library            |
| ------------------------------ | ------------------------------ |
| Sortable device favorites list | fluid-dnd or Pragmatic DnD     |
| Palette category reordering    | fluid-dnd                      |
| File drop imports              | Pragmatic DnD external adapter |
| Diagramming/connections        | interact.js or custom          |

---

## Recommendation

**No action needed now.** Current implementation is solid.

**Consider for future:**

1. Extract drag/drop logic into dedicated utils (if complexity grows)
2. Add keyboard-based device placement (a11y improvement)
3. Adopt Pragmatic DnD if adding file drop imports

---

## Actionable Takeaways

### Patterns to Study (Priority Order)

| Priority | Project             | What to Study                                       | Why                                       |
| -------- | ------------------- | --------------------------------------------------- | ----------------------------------------- |
| 1        | **tldraw**          | Geometry utils (`@tldraw/vec`, `@tldraw/intersect`) | Mature hit-testing, works at scale        |
| 2        | **Excalidraw**      | Two-phase collision (BBox → precise)                | Performance pattern for many elements     |
| 3        | **Svelvet**         | Drawer → Canvas pattern, Svelte stores              | Same framework, similar palette flow      |
| 4        | **CanvasInventory** | Grid-cell collision                                 | NxM cell occupancy (like U-height + slot) |

### Code Worth Reading

```
# tldraw geometry
https://github.com/tldraw/tldraw/tree/main/packages/tldraw/src/lib/primitives

# Excalidraw bounds helpers
https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/element/bounds.ts

# Svelvet Drawer component
https://github.com/open-source-labs/Svelvet/tree/main/src/lib/components/Drawer
```

### Potential Future Adoptions

| If Adding...               | Consider...                        |
| -------------------------- | ---------------------------------- |
| Cable/connection rendering | Svelvet edge system or Svelte Flow |
| Complex hit-testing        | tldraw's geometry primitives       |
| File drop import           | Pragmatic DnD external adapter     |
| Keyboard-based placement   | Pragmatic DnD a11y toolchain       |

---

## Sources

- [tldraw](https://github.com/tldraw/tldraw)
- [Excalidraw](https://github.com/excalidraw/excalidraw)
- [Svelvet](https://github.com/open-source-labs/Svelvet)
- [Svelte Flow](https://github.com/xyflow/xyflow)
- [FloorspaceJS](https://github.com/nrel/floorspace.js)
- [CanvasInventory](https://github.com/Oen44/CanvasInventory)
- [Pragmatic Drag and Drop](https://github.com/atlassian/pragmatic-drag-and-drop)
- [interact.js](https://interactjs.io/)
- [PlainDraggable](https://github.com/anseki/plain-draggable)
- [Muuri](https://muuri.dev/)
- [GoJS Planogram](https://gojs.net/latest/samples/planogram.html)
- [fluid-dnd](https://fluid-dnd.netlify.app/)
