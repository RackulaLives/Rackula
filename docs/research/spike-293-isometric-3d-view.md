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

## Implementation Details & Edge Cases

### A. SVG Transform Mathematics

**Isometric projection matrix:**

```
True isometric: 30° angles from horizontal
- cos(30°) = 0.866025...
- sin(30°) = 0.5

SVG matrix(a, b, c, d, e, f) maps to:
  x' = a*x + c*y + e
  y' = b*x + d*y + f

For isometric: matrix(cos30, sin30, -cos30, sin30, tx, ty)
```

**ViewBox calculation after transform:**

```
Original dimensions: W × H
After isometric transform:
  New width  = W * cos30 + H * cos30 = (W + H) * 0.866
  New height = W * sin30 + H * sin30 = (W + H) * 0.5

Example: 220px × 968px rack (42U)
  Transformed width  = (220 + 968) * 0.866 ≈ 1029px
  Transformed height = (220 + 968) * 0.5   = 594px
```

**Transform origin:**

- SVG transforms apply from (0,0) by default
- Must translate content AFTER transform to position correctly
- Or wrap in group with pre-translation

**Decision needed:** Use true isometric (30°) or slightly adjusted angle for aesthetics?

---

### B. Device Depth Visualization

**Full-depth devices (is_full_depth: true or undefined):**

- Render front face (current rectangle)
- Add right-side panel to show depth
- Side panel width: ~20px in isometric space (representing ~24" physical depth)

**Half-depth devices (is_full_depth: false):**

- Same front face
- Side panel width: ~10px (half the depth)
- Visually distinguishes from full-depth

**Side panel rendering:**

```svg
<!-- Device front face (existing) -->
<rect x="..." y="..." width="186" height="44" fill="#3498db"/>

<!-- Device side panel (new for isometric) -->
<polygon points="x1,y1 x2,y2 x3,y3 x4,y4" fill="#2980b9"/>
```

**Side panel color:**

- Darken device color by 20-25%
- Use HSL manipulation: reduce lightness by 20%
- Or multiply RGB by 0.8

**Decision needed:** Exact depth pixels? (suggests: full=20px, half=10px)

---

### C. Device Labels in Isometric

**Problem:** Text becomes skewed and hard to read in isometric projection.

**Options:**

1. **Omit labels in isometric** - Cleanest, rely on legend
2. **Counter-rotate labels** - Apply inverse transform to text only
3. **Callout lines** - Flat labels with lines pointing to devices

**Recommendation:** Option 1 (omit) for MVP, add callouts in polish phase if requested.

**Device images:**

- Currently rendered on device front faces
- In isometric: images would be skewed/distorted
- **Recommendation:** Fall back to category icons in isometric mode (simpler, consistent)

---

### D. Rack Frame 3D Representation

**Current flat rendering:**

- Rectangle for rail on each side
- Horizontal bars top and bottom
- Interior background color

**Isometric enhancement:**

- Render rack as 3D "box frame"
- Show: front rails, top bar, right side depth
- Creates visual context for devices

**Rack frame components:**

```
┌─────────────────────┐ ← Top bar (front edge)
│  ╱─────────────────╱│
│ ╱                 ╱ │ ← Top surface (subtle)
│╱_________________╱  │
│█               █│   │ ← Left rail │ Interior │ Right rail
│█               █│  ╱
│█               █│ ╱  ← Right side depth
│█_______________█│╱
└─────────────────────┘ ← Bottom bar
```

**Color scheme for frame:**

- Front rails: current rail color
- Top surface: slightly lighter
- Right side: slightly darker
- Floor shadow: subtle gray gradient below rack

**Decision needed:** How much visual complexity? (suggests: start simple, add top surface in polish)

---

### E. Dual-View Layout

**Front + Rear side-by-side:**

```
┌──────────────┐  GAP  ┌──────────────┐
│   FRONT      │  ←→   │    REAR      │
│   (depth     │       │   (depth     │
│   extends    │       │   extends    │
│   RIGHT)     │       │   LEFT)      │
└──────────────┘       └──────────────┘
```

**Key considerations:**

- Front view: devices' depth extends to the RIGHT
- Rear view: devices' depth extends to the LEFT (mirrored)
- Gap between views: increase from 40px to ~60px to prevent overlap
- Both racks share same legend below

**Alternative layout:** Staggered (rear offset above-right of front)

- More compact but potentially confusing
- **Recommendation:** Keep side-by-side for consistency with flat export

---

### F. Half-Depth Device Special Cases

**Mounted face visualization:**

- Front-mounted device in front view: full visibility, normal depth
- Rear-mounted device in front view: show as "phantom" (reduced opacity) or hidden?

**Blocked slots:**

- When half-depth device on one face blocks placement on other face
- Current flat export: diagonal stripes
- Isometric: could show blocked area as crosshatched depth region

**Decision needed:** Show rear-mounted devices in front view? (suggests: no, keep clean)

---

### G. Export Format Considerations

**PNG/JPEG:**

- SVG transforms rasterize correctly to canvas
- Consider higher default resolution (2x) for isometric due to diagonal aliasing
- May need anti-aliasing hints

**PDF:**

- SVG embedded in jsPDF preserves transforms
- Page orientation: landscape likely better for wide isometric layout
- Test page size calculations with transformed dimensions

**SVG export:**

- Transform matrix preserved in output
- Compatible with all modern tools (Figma, Illustrator, browsers)
- File size similar to flat (no bitmap data)

**Filename convention:**

- Append `-isometric` to export filename
- e.g., `my-rack-2025-12-30-isometric.png`

---

### H. Edge Cases Checklist

| Scenario                  | Consideration                          | Resolution                                                 |
| ------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| **Empty rack**            | Rack frame only, no devices            | Should still render 3D frame correctly                     |
| **Single 1U device**      | Very small visual                      | Renders fine, legend provides context                      |
| **42U fully populated**   | Many overlapping side panels           | Depth sorting ensures correct overlap                      |
| **0.5U device**           | Very thin (11px height)                | May need minimum visual height for side panel              |
| **Custom devices**        | No images, only colors                 | Works same as library devices (color rectangle)            |
| **Device images**         | Would be distorted                     | Fall back to category icons in isometric mode              |
| **10" rack**              | Narrower (116px)                       | Isometric proportions scale down correctly                 |
| **Mixed half/full depth** | Adjacent devices with different depths | Each device renders its own depth independently            |
| **Device at U1**          | Bottom of rack                         | Side panel may extend below rack frame—clip to rack bounds |
| **Device at U42**         | Top of rack                            | Side panel must not exceed top bar                         |

---

### I. UI/UX Specifications

**Export panel additions:**

```
View Style
○ Flat (current)
● Isometric

[existing export options...]
```

- Radio buttons or toggle switch
- Default: Flat (preserve existing behavior)
- Remember preference in localStorage? (suggest: yes)

**Preview:**

- No live preview in export panel (too complex)
- User clicks "Export" and sees result
- Could add small static icon showing flat vs isometric

---

### J. Performance Considerations

**SVG complexity increase:**

- Each device adds 1 additional polygon (side panel)
- 42 devices → 42 extra shapes
- Negligible impact on modern devices

**Canvas conversion:**

- Larger viewBox dimensions due to isometric projection
- ~1.7x larger canvas area
- May need to cap maximum resolution for very large exports

**Batch rendering:**

- Export is one-shot operation
- No real-time rendering concerns
- Memory usage scales with device count (acceptable)

---

### K. Testing Strategy

**Unit tests:**

- [ ] Isometric transform matrix calculation
- [ ] ViewBox dimension calculation for various rack sizes
- [ ] Side panel color darkening algorithm
- [ ] Depth sorting logic (higher U = rendered first)

**Integration tests:**

- [ ] Export generates valid SVG with transform attribute
- [ ] PNG export produces correct dimensions
- [ ] PDF export fits on page with correct orientation

**Visual regression tests:**

- [ ] Create golden images for reference configurations:
  - Empty 12U rack
  - 42U with mixed devices
  - Dual-view front+rear
  - Half-depth device at various positions
- [ ] Compare against snapshots after code changes

**Manual testing checklist:**

- [ ] All export formats (PNG, JPEG, PDF, SVG)
- [ ] Both themes (light/dark background)
- [ ] 10" and 19" rack widths
- [ ] Device library items with images
- [ ] Custom user-created devices
- [ ] QR code positioning in isometric
- [ ] Legend readability

---

### L. Refined Implementation Phases

**Phase 1: MVP Isometric Export (2 days)**

1. Add "Isometric" toggle to ExportPanel component
2. Create `applyIsometricTransform()` in export.ts
3. Calculate new viewBox for transformed SVG
4. Apply matrix transform to rack content group
5. Adjust legend positioning (below, flat)
6. Add device side panels (simple darker rectangle)
7. Implement depth sorting (reverse U order)
8. Test all export formats

**Phase 2: Visual Polish (1 day)**

1. Rack frame depth (top surface, right side)
2. Drop shadow under rack
3. Refine side panel proportions
4. Half-depth device visual distinction
5. Filename suffix for isometric exports

**Phase 3: Edge Cases & Testing (1 day)**

1. Handle 0.5U device minimum visibility
2. Clip side panels to rack bounds
3. Dual-view gap adjustment
4. Write comprehensive tests
5. Visual regression snapshots

**Phase 4: Optional Enhancements (if needed)**

- Device callout labels
- Floor/ground plane
- Alternative projection angles (cavalier, dimetric)
- Export resolution multiplier option

---

### M. Open Technical Questions

1. **Exact transform values:** True isometric (30°) or adjusted for rack proportions?
2. **Side panel pixel depth:** 20px full, 10px half—or proportional to rack width?
3. **Transform application point:** Before or after legend generation?
4. **QR code positioning:** Keep in corner, or move to avoid overlap with isometric rack?
5. **Airflow indicators:** Skip in isometric, or attempt to render arrows?

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
