# Spike #293: Isometric/3D View Research

**Issue:** #293 (parent: #289)
**Time box:** 2-4 hours
**Date:** 2025-12-30

## Research Question

How can we implement an isometric or 3D view of rack layouts, both in the live canvas and in exports (PNG/PDF)?

---

## Executive Summary

After researching CSS 3D transforms, export pipeline architecture, and isometric asset availability, I recommend **Approach B: Isometric Export Mode** as the most feasible path forward. CSS 3D transforms on a live canvas are technically possible but introduce significant UX complexity, while export-only isometric rendering is cleaner and more valuable for the "shareable rack diagram" use case.

---

## 1. CSS 3D Transform Approach

### How It Works

CSS 3D transforms can create an isometric projection using combinations of:

```css
.isometric-view {
  perspective: 8000px; /* Almost-isometric with slight natural distortion */
  transform-style: preserve-3d;
}

.rack-container {
  transform: rotateX(60deg) rotateZ(-45deg);
  /* or: rotateX(65deg) rotate(45deg) for classic isometric */
}
```

**Key properties:**

- `perspective`: Creates depth; larger values = more isometric (less vanishing point)
- `rotateX()`: Tilts toward/away from viewer
- `rotateZ()`: Rotates in the XY plane
- `preserve-3d`: Ensures children maintain 3D positioning

### Current Architecture Impact

**Rackula's rendering:**

1. Canvas uses SVG (`Rack.svelte`) with internal `<g transform="translate()">` for positioning
2. Export builds SVG programmatically in `export.ts`, converts to canvas, then to PNG/PDF
3. **No html2canvas** - uses native Canvas API to rasterize SVG

**Critical finding:** CSS transforms applied to an HTML wrapper around the SVG would NOT affect the exported image because:

- Export generates a fresh SVG from scratch (not from DOM)
- The `svgToCanvas()` function draws the SVG directly, ignoring parent CSS

### Canvas (Live View) Feasibility

| Aspect             | Assessment                                                      |
| ------------------ | --------------------------------------------------------------- |
| Visual rendering   | **Possible** - CSS transforms on wrapper work                   |
| Device interaction | **Problematic** - Click coordinates need inverse transform math |
| Drag-and-drop      | **Complex** - Needs coordinate space conversion for placement   |
| Pan/zoom           | **Tricky** - panzoom library may conflict with 3D transforms    |
| Performance        | **Good** - CSS transforms are GPU-accelerated                   |

**Effort estimate:** Medium-High (2-3 days) to get basic display, additional work for interactions.

### Export Feasibility

| Aspect                  | Assessment                                        |
| ----------------------- | ------------------------------------------------- |
| html2canvas             | **Does NOT support** CSS 3D transforms properly   |
| Native SVG→Canvas       | **Won't capture** CSS transforms on wrapper       |
| Server-side (Puppeteer) | **Would work** but requires server infrastructure |

**Conclusion:** CSS 3D transforms are NOT viable for current export pipeline without architectural changes.

---

## 2. Isometric Device Images Approach

### Concept

Instead of CSS transforms, render devices using pre-made isometric artwork:

- Each device type has an isometric PNG/SVG variant
- Export builds an isometric composition by positioning these assets

### Asset Availability

Isometric server/network assets are available from:

- [Vecteezy](https://www.vecteezy.com/free-png/isometric-server) - 686+ free isometric server PNGs
- [IconScout](https://iconscout.com/icons/server-rack?styles%5B%5D=isometric) - 1,743 isometric rack icons (SVG/PNG)
- [Freepik](https://www.freepik.com/free-photos-vectors/isometric-server-rack) - Various isometric rack graphics

### Implementation Approach

1. Create isometric rack frame template (or generate via CSS transform + snapshot)
2. Map device positions to isometric coordinates
3. Stack isometric device images at correct positions
4. Generate composite image

### Trade-offs

| Aspect         | Assessment                                            |
| -------------- | ----------------------------------------------------- |
| Visual quality | **High** - Hand-crafted assets look polished          |
| Custom devices | **Problem** - How do we render user-created devices?  |
| Maintenance    | **Ongoing** - Need isometric variant for every device |
| Bundle size    | **Impact** - Additional image assets                  |
| Consistency    | **Challenge** - Matching art style across sources     |

**Effort estimate:** High (1+ week) to build comprehensive isometric asset library.

---

## 3. Hybrid Approach: CSS Transform for Export Image Generation

### Concept

Use CSS 3D transforms with a **server-side or headless browser snapshot**:

1. Render the rack SVG in a hidden DOM element with CSS transforms
2. Use Puppeteer/Playwright to screenshot the transformed view
3. Return as PNG

### Feasibility

**Option A: Client-side with OffscreenCanvas** (experimental)

- Apply CSS transforms to a temporary DOM element
- Use experimental APIs to capture
- **Status:** Not reliable across browsers

**Option B: Server-side Puppeteer**

- Requires backend server infrastructure
- Rackula is currently client-only (GitHub Pages)
- Would need Cloudflare Worker, Vercel Function, or similar
- **Status:** Possible but architectural change

**Option C: Pre-generate on build**

- Not applicable - racks are user-generated at runtime

---

## 4. Alternative: SVG Skew/Transform in Export

### Concept

Apply SVG transforms directly in the `generateExportSVG()` function:

```xml
<svg viewBox="0 0 500 600">
  <g transform="matrix(0.866, 0.5, -0.866, 0.5, 300, 0)">
    <!-- rack content -->
  </g>
</svg>
```

### Feasibility

**Isometric projection matrix:**

- True isometric uses specific skew angles (30°)
- SVG `matrix()` transform can achieve this
- Works directly in export without html2canvas

### Prototype Transform

```javascript
// Isometric projection via SVG matrix
// Angles: 30° from horizontal for both axes
const cos30 = Math.cos(Math.PI / 6); // 0.866
const sin30 = Math.sin(Math.PI / 6); // 0.5

// SVG transform matrix: matrix(a, b, c, d, e, f)
// For isometric: matrix(cos30, sin30, -cos30, sin30, tx, ty)
const isoTransform = `matrix(0.866, 0.5, -0.866, 0.5, ${offsetX}, ${offsetY})`;
```

### Assessment

| Aspect         | Assessment                                        |
| -------------- | ------------------------------------------------- |
| Visual result  | **Good** - Proper isometric projection            |
| Export support | **Yes** - SVG transforms are rasterized correctly |
| Canvas display | **Possible** - Same transform in live Rack.svelte |
| Interactions   | **Still complex** - Coordinates need conversion   |
| Implementation | **Medium** - Modify generateExportSVG()           |

**Effort estimate:** Medium (1-2 days) for export, additional work for live canvas.

---

## 5. WebGL/Three.js (Stretch Goal)

### Assessment

| Aspect         | Assessment                                     |
| -------------- | ---------------------------------------------- |
| Visual quality | **Excellent** - True 3D with lighting, shadows |
| Bundle impact  | **Large** - Three.js is ~150KB gzipped         |
| Learning curve | **High** - Different paradigm than SVG         |
| Export         | **Complex** - Need to render WebGL to canvas   |
| Overkill?      | **Probably** - Racks are fundamentally 2D data |

**Recommendation:** Not worth pursuing for isometric view. Reserve for future "virtual datacenter walkthrough" feature if ever.

---

## Recommendations

### Recommended: Approach B - Export-Only Isometric Mode

**Implementation path:**

1. **Phase 1: SVG Transform Export** (1-2 days)
   - Add "Isometric" export option in ExportPanel
   - Modify `generateExportSVG()` to apply SVG matrix transform
   - Adjust viewBox dimensions for isometric layout
   - Add subtle drop shadow for depth perception

2. **Phase 2: Polish** (1 day)
   - Depth sorting (devices at higher U positions render "behind")
   - Optional: Device side panels (show depth with color gradient)
   - Consider adding floor/ground shadow

3. **Phase 3: Optional Live Canvas** (2-3 days, if demanded)
   - Add view toggle (Flat / Isometric)
   - Implement coordinate transform for interactions
   - May need to disable some interactions in isometric mode

### Why Not Live Canvas First?

1. **Primary use case is export** - Users want cool shareable images
2. **Interactions are complex** - Drag-drop in skewed space is confusing UX
3. **Export validates concept** - Test user interest before deeper investment

### Deferred: Isometric Device Assets

Not recommended for initial implementation because:

- Custom devices would look inconsistent
- Large asset maintenance burden
- SVG transform achieves 80% of visual goal

Could revisit for "premium" polished look if isometric export proves popular.

---

## Implementation Sketch

```typescript
// In export.ts

function applyIsometricTransform(svg: SVGElement, isIsometric: boolean): void {
  if (!isIsometric) return;

  const content = svg.querySelector(".export-content");
  if (!content) return;

  // Isometric projection matrix
  // 30° angles create true isometric view
  const cos30 = 0.866;
  const sin30 = 0.5;

  // Calculate offset to keep content visible after transform
  const bounds = content.getBoundingClientRect();
  const offsetX = bounds.height * cos30;
  const offsetY = 0;

  content.setAttribute(
    "transform",
    `matrix(${cos30}, ${sin30}, -${cos30}, ${sin30}, ${offsetX}, ${offsetY})`,
  );

  // Update viewBox to fit transformed content
  // ... viewBox calculation
}
```

---

## Design Decisions (Clarified)

1. **Dual-view (front+rear) in isometric?**
   - **Decision:** Toggle for front-only, rear-only, or both views
   - When "both" is selected, render two separate isometric views side-by-side
   - Matches current flat export behavior

2. **Half-depth devices?**
   - **Decision:** Yes, visually represent half-depth in isometric view
   - Half-depth devices should appear with less "thickness" in the isometric projection
   - This reinforces the mounted face concept and adds visual accuracy

3. **Legend placement?**
   - **Decision:** Keep legend flat (not transformed)
   - Place below the isometric rack(s)
   - Maintains readability and follows convention for technical diagrams

---

## References

- [Envato Tuts+ - Isometric Layout with CSS 3D](https://webdesign.tutsplus.com/create-an-isometric-layout-with-3d-transforms--cms-27134t)
- [Polypane CSS 3D Transform Examples](https://polypane.app/css-3d-transform-examples/)
- [Codrops - Crafting Generative CSS Worlds](https://tympanus.net/codrops/2025/11/10/crafting-generative-css-worlds/)
- [MDN - CSS perspective()](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/perspective)
- [html2canvas Issues - 3D Transform Limitations](https://github.com/niklasvh/html2canvas/issues/2240)

---

## Deliverables Checklist

- [x] Document CSS 3D transform approach
- [x] Evaluate feasibility of isometric view in live canvas
- [x] Evaluate feasibility in PNG/PDF exports
- [x] Compare hand-crafted isometric PNGs vs CSS-transformed approach
- [x] Identify blockers or complexity for each approach
- [x] Recommendation: SVG matrix transform for export-only isometric mode
