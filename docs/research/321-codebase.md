# Spike #321: Isometric Rendering Service - Codebase Analysis

**Issue:** #321  
**Date:** 2025-12-30  
**Context:** Research for extracting isometric rendering POC from spike #300 as a standalone backend API service  

---

## Files Examined

### Isometric Rendering (Spike #300 POC)
- `/Users/gvns/code/projects/Rackula/Rackula/scripts/isometric-poc.ts` - Full 3D isometric SVG generation script (v2 POC)
- `/Users/gvns/code/projects/Rackula/Rackula/docs/research/isometric-poc-notes.md` - Visual assessment and technical parameters
- `/Users/gvns/code/projects/Rackula/Rackula/docs/research/spike-293-isometric-3d-view.md` - Pre-spike #300 research document
- `/Users/gvns/code/projects/Rackula/Rackula/docs/research/isometric-poc-single.svg` - Generated single rack example
- `/Users/gvns/code/projects/Rackula/Rackula/docs/research/isometric-poc-dual.svg` - Generated dual-view example

### Export Infrastructure
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/utils/export.ts` - Main export SVG generation (1,492 lines)
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/components/ExportDialog.svelte` - Export UI component
- `/Users/gvns/code/projects/Rackula/Rackula/src/tests/export.test.ts` - Export test suite
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/utils/canvas.ts` - Canvas positioning and zoom calculations

### Type Definitions
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/types/index.ts` - Core data types (Rack, DeviceType, ExportOptions, etc.)

### Supporting Utilities
- `/Users/gvns/code/projects/Rackula/Rackula/package.json` - Project dependencies

---

## Isometric Rendering Implementation

### Current POC Architecture (spike-poc.ts)

The POC is a **self-contained Node.js script** that generates realistic 3D isometric SVG cabinet graphics. Key design:

**Core Components:**

1. **Isometric Projection Math**
   - True isometric angles: 30° (ISO_ANGLE = π/6)
   - Projection function: `isoProject(x, y, z) → {x, y}`
   - Formula: `x' = (x - y) * cos(30°)`, `y' = (x + y) * sin(30°) - z`
   - Constants: COS_30 = 0.866025, SIN_30 = 0.5

2. **3D Box Drawing (Fundamental Primitive)**
   - `draw3DBox()` - Creates isometric boxes with front/top/side faces
   - Takes origin (x,y,z), dimensions (w,d,h), and color
   - Generates 8 vertices and renders 3 visible faces as polygons
   - Supports custom colors for top/side with auto-darkening
   - Face order: back-to-front for correct occlusion

3. **Cabinet Enclosure (300+ lines)**
   - `drawRackCabinet()` - Complete 3D cabinet frame
   - Components:
     - Bottom/top panels (8px frame thickness)
     - Left/right side panels with vent slots
     - Back panel (dark interior)
     - Mounting rails with holes (6px rails, 12px inset)
     - Status LEDs with glow effect

4. **Device Rendering**
   - `drawDevice()` - Mount devices inside cabinet
   - `drawDeviceFrontDetails()` - Bezel lines, LEDs, drive bays
   - Supports:
     - Full-depth devices (90px depth = RACK_DEPTH - 10)
     - Half-depth devices (40px depth = RACK_DEPTH * 0.4)
     - Device color + darkened side panel
     - Front panel decorative details (horizontal lines, indicators)
     - Optional LED indicators and drive bay visualization

5. **Visual Effects**
   - Color utilities: `hexToRgb()`, `rgbToHex()`, `darkenColor()`, `lightenColor()`
   - SVG filters: LED glow with feGaussianBlur (stdDeviation=2)
   - Device side panels rendered with 30% darkening

6. **Layout & Composition**
   - Single-view: Isometric cabinet with legend below
   - Dual-view: Front and rear side-by-side (80px gap) with shared legend
   - Canvas padding: 60px around content
   - Legend: Device swatches with device names and U heights

### Technical Parameters (from POC)

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Rack Width (front) | 160px | Cabinet width |
| Rack Depth | 100px | Cabinet depth |
| U Height | 18px | Pixels per rack unit |
| Sample Rack Size | 12U | Demo rack |
| Frame Thickness | 8px | Cabinet frame |
| Rail Width | 6px | Mounting rails |
| Rail Inset | 12px | Distance from edge to rails |
| Side Darkening | 30% | RGB multiplication for depth |
| Top Lightening | 20% | RGB interpolation for highlights |
| Dracula Color Scheme | 10 colors | Dark theme matching app |

### Rendering Pipeline (POC)

1. Create JSDOM document with SVG namespace
2. Create SVG with viewBox and dark background
3. Create main group with translation to center content
4. Draw cabinet frame first (back-to-front)
5. Draw devices sorted by U position (lower U first = painted first)
6. Draw legend with color swatches
7. Add SVG filters (LED glow)
8. Serialize to string via `svg.outerHTML`
9. Write to disk

**Output:** Valid SVG string, exportable as PNG/PDF

---

## Current Export Infrastructure (export.ts)

### Function Architecture

**Main Entry Point:**
- `generateExportSVG(racks, deviceLibrary, options, images?)` - Creates SVG element for export
  - Returns: `SVGElement` (native DOM element)
  - Supports: multiple racks, dual-view (front+rear), QR codes, legends

**Export Formats:**
- `exportAsSVG(svg)` - Returns SVG string
- `exportAsPNG(svg, options)` - Canvas rasterization (dynamic html2canvas + canvas.toBlob)
- `exportAsJPEG(svg, options)` - Canvas rasterization with quality
- `exportAsPDF(svg, options)` - Uses jsPDF (lazy-loaded to avoid bundle bloat)
- `exportToCSV(rack, deviceTypes)` - Data export
- `downloadBlob(blob, filename)` - Trigger browser download

**Supporting Functions:**
- `generateExportFilename()` - Creates timestamped filenames
- `filterDevicesByFace()` - Filter devices for front/rear views
- `createCategoryIconElements()` - Render device category icons (12 categories)

### Data Types

From `/src/lib/types/index.ts`:

```typescript
export interface Rack {
  id?: string;
  name: string;
  height: number;            // 1-100U
  width: 10 | 19 | 23;       // Inches
  desc_units: boolean;       // Descending units
  show_rear: boolean;        // Show rear view
  form_factor: FormFactor;
  starting_unit: number;
  position: number;
  devices: PlacedDevice[];
  notes?: string;
  view?: RackView;           // Runtime only
}

export interface PlacedDevice {
  id: string;
  device_type: string;       // Slug reference
  position: number;          // Starting U
  face: "front" | "rear" | "both";
}

export interface DeviceType {
  slug: string;
  name: string;
  u_height: number;
  category: DeviceCategory;  // 12 categories
  colour: string;            // Hex color
  is_full_depth?: boolean;   // Default: true
  is_powered?: boolean;
  airflow?: Airflow;
  // ... 15+ more optional fields
}

export interface ExportOptions {
  format: "png" | "jpeg" | "svg" | "pdf" | "csv";
  scope: "all" | "selected";
  includeNames: boolean;
  includeLegend: boolean;
  background: "dark" | "light" | "transparent";
  exportView?: "front" | "rear" | "both";
  displayMode?: "label" | "image";
  includeQR?: boolean;
  qrCodeDataUrl?: string;
  // ... annotation fields
}
```

### Export Constants (export.ts, lines 34-68)

```typescript
const U_HEIGHT = 18;
const RACK_WIDTH = 220;        // Display rack width
const RACK_PADDING = 32;       // Hidden padding
const RACK_GAP = 40;           // Between dual-view racks
const LEGEND_PADDING = 20;
const LEGEND_ITEM_HEIGHT = 24;
const EXPORT_PADDING = 20;
const RACK_NAME_HEIGHT = 18;
const VIEW_LABEL_HEIGHT = 15;

const QR_SIZE = 150;
const QR_PADDING = 10;
const QR_LABEL_HEIGHT = 20;

// Dark/light theme colors
const DARK_BG = "#1a1a1a";
const LIGHT_BG = "#f5f5f5";
const DARK_RACK_INTERIOR = "#2d2d2d";
const LIGHT_RACK_INTERIOR = "#e0e0e0";
// ... etc
```

### SVG Generation Flow (export.ts, line 360+)

1. Filter devices by face (front/rear/both)
2. Calculate canvas dimensions based on:
   - Max rack height
   - Number of racks and dual-view settings
   - Legend presence
   - QR code presence
3. Create SVG element with calculated viewBox
4. Add background rect (or transparent marker)
5. Create main content group
6. For each rack: call `renderRackView()`
   - Draw rack frame (rails, padding, interior)
   - Draw devices as rectangles with colors
   - Draw category icons or device images
   - Add optional labels
7. Add legend (if enabled)
8. Add QR code (if enabled)
9. Return SVG element

---

## Dependencies for Server-Side Extraction

### NPM Dependencies (Current Frontend Stack)

```json
{
  "jspdf": "^3.0.4",          // PDF generation (lazy-loaded)
  "jszip": "^3.10.1",         // ZIP archive handling
  "qrcode": "^1.5.4",         // QR code generation
  "zod": "^4.1.13",           // Data validation
  "pako": "^2.1.0",           // Compression (for YAML in archives)
  "js-yaml": "^4.1.1"         // YAML parsing/generation
}
```

**Not included (browser-only):**
- `html2canvas` - DOM to canvas (lazy-imported in exportAsPNG)
- `panzoom` - Canvas interaction library
- `svelte` - UI framework

### What Would Be Needed for Server Service

**Required Additions (for Node.js backend):**
1. **SVG → Image Conversion:**
   - Option A: Puppeteer/Playwright (headless browser rendering)
   - Option B: Sharp + svg2png (lightweight native C++ binding)
   - Option C: Librsvg (system dependency)

2. **PDF Generation:**
   - jsPDF ✓ (already npm available)
   - Or: PDFKit (Node.js alternative)

3. **Runtime Environment:**
   - Node.js 18+ (for modern async/await)
   - TypeScript (optional, can compile to JS)

4. **Data Validation:**
   - Zod ✓ (already npm available)
   - Optional: joi, ajv, or Hono validators

5. **Extraction Requirements:**
   - The POC uses `jsdom` (Node.js DOM implementation) ✓
   - SVG generation uses `document.createElementNS()` → fully compatible
   - No browser APIs used (Canvas API is only in exportAsPNG client-side)

**Dependency Graph for Isometric Service:**

```
isometric-service/
├── Core Dependencies
│   ├── zod ^4.1.13 (validation)
│   ├── jsdom ^23+ (DOM implementation - ADDED)
│   └── js-yaml ^4.1.1 (YAML serialization)
├── Image Export Options
│   ├── puppeteer ^20+ OR
│   ├── playwright ^1.40+ OR
│   └── sharp ^0.33+ with custom SVG→PNG
└── Optional
    ├── jspdf ^3.0.4 (PDF generation)
    └── winston/pino (logging)
```

---

## Refactoring Requirements

### Phase 1: Extract Isometric Math & SVG Generation

**What Can Be Extracted Directly:**
1. All math utilities from isometric-poc.ts can be moved as-is:
   - `isoProject()` - Pure function, no dependencies
   - Color utilities - Pure functions
   - Box/polygon creation using DOM API (via jsdom)

2. Cabinet/device drawing functions work in Node.js:
   - `drawRackCabinet()` - Uses only DOM API
   - `drawDevice()` - Uses only DOM API
   - All SVG element creation via `document.createElementNS()`

**Refactoring Needed:**
1. Decouple from JSDOM initialization:
   - Move JSDOM creation to service setup, not per-call
   - Pass document/svg as parameters or class state

2. Create abstraction layer:
   ```typescript
   interface IsometricRenderContext {
     document: Document;
     svg: SVGSVGElement;
     ns: string; // "http://www.w3.org/2000/svg"
   }
   
   function createRenderContext(): IsometricRenderContext {
     // Initialize once per service
   }
   
   function drawDevice(
     ctx: IsometricRenderContext,
     device: PlacedDevice,
     deviceType: DeviceType,
     position: { x: number; y: number; z: number }
   ): void {
     // Render to ctx.svg
   }
   ```

3. Accept domain model objects (from Rackula types):
   - Input: `Rack`, `DeviceType[]`, `PlacedDevice[]`
   - Currently POC uses hardcoded sample devices
   - Need: Dynamic device list from API input

### Phase 2: Integrate with Export.ts Architecture

**Compatibility Layer:**
- Export.ts already creates SVG DOM elements
- Could call `generateExportSVG()` from Node.js backend if refactored
- Would need to abstract browser-specific code paths

**Option A: Unified codebase**
- Share `generateExportSVG()` between browser and backend
- Conditional imports for browser-only features
- Export.ts has ~1,000 LOC for flat export logic
- Would need to extract isometric as optional branch

**Option B: Separate isometric service**
- Dedicated Node.js module
- Input: Rack + DeviceType data (JSON/protobuf)
- Output: SVG string
- Simpler to deploy/scale independently

### Phase 3: Configuration & Parameters

**Extractable Parameters:**
- Rack dimensions (U_HEIGHT, RACK_WIDTH, RACK_DEPTH, etc.)
- Frame dimensions (FRAME_THICKNESS, RAIL_WIDTH, RAIL_INSET)
- Colors (cabinet, rail, interior, text)
- Device depth ratios (full-depth = 90px, half = 40px)

**Recommended Approach:**
```typescript
interface IsometricConfig {
  // Dimensions (pixels)
  uHeightPx: number;              // Default: 18
  rackWidthPx: number;            // Default: 160
  rackDepthPx: number;            // Default: 100
  frameThicknessPx: number;       // Default: 8
  
  // Colors
  colorScheme: "dracula" | "light" | "dark";
  customColors?: {
    cabinetFrame: string;
    cabinetInterior: string;
    rail: string;
    // ... etc
  };
  
  // Features
  includeMountingHoles: boolean;   // Default: true
  includeStatusLeds: boolean;      // Default: true
  includeDeviceDetails: boolean;   // Default: true (bezel lines, etc)
  
  // Output
  dualView: boolean;               // Front+rear
  includeLegend: boolean;
  canvasPaddingPx: number;         // Default: 60
}
```

---

## Constraints & Challenges

### Technical Constraints

1. **Coordinate System Dependency:**
   - POC uses hardcoded U position and full/half-depth logic
   - Server must map from Rackula's placement model:
     - `PlacedDevice.position` = starting U (1-based)
     - `DeviceType.u_height` = height in units
     - `DeviceType.is_full_depth` = boolean
   - Need validation: devices can't overlap on same face

2. **Image Asset Handling:**
   - Current export.ts optionally renders device images
   - POC only uses category icons (smaller, scalable)
   - Service must decide: include device images or icons only?
   - Images add complexity (bundling, caching, URL resolution)

3. **Color Management:**
   - POC uses Dracula theme (fixed colors)
   - Current export.ts supports light/dark/transparent
   - Service should accept:
     - Predefined themes OR
     - Custom color per device (from DeviceType.colour field)

4. **Dual-View Rendering:**
   - Requires two instances of cabinet + devices
   - Front view: devices extend RIGHT
   - Rear view: devices extend LEFT (mirrored)
   - Challenge: Rear devices only visible if `show_rear: true` on Rack

5. **Device Blocking Logic:**
   - Half-depth devices can block opposite face placement
   - Current export shows diagonal stripes for blocked slots
   - Isometric view complicates visualization
   - Recommendation: Show rear-mounted devices as "ghost" (reduced opacity) in front view OR skip

### Architectural Constraints

1. **No Browser APIs:**
   - Canvas API (native browser) not available in Node.js
   - Only DOM API available via jsdom
   - SVG → PNG/PDF requires external tool (Puppeteer, Sharp, etc.)

2. **Performance Considerations:**
   - JSDOM initialization is slow (~200-500ms per call)
   - Should pool/cache instances
   - SVG generation for 42U fully-populated rack: ~1,000 SVG elements
   - jsPDF conversion of large SVG may be slow

3. **Storage & Caching:**
   - Generated SVGs should be cached (immutable if input is immutable)
   - Consider CDN for common rack configurations
   - QR code generation adds time (separate step in frontend currently)

### Data Constraints

1. **NetBox Compatibility:**
   - Spike #321 mentions "NetBox-compatible data model"
   - Current Rackula uses field naming: `u_height`, `device_type`, `is_full_depth` (already compatible)
   - Server must validate against Rackula/NetBox schema
   - Zod schema can enforce constraints

2. **Device Type Lookup:**
   - Service must have access to `DeviceType[]` library
   - Cannot render unknown device types
   - Options:
     - Accept device types in request
     - Maintain server-side library (sync overhead)
     - Hybrid: allow override/patch device specs

3. **Layout Validation:**
   - Overlapping devices → undefined rendering
   - Invalid U positions → rendering errors
   - Service should validate before rendering

---

## Service Architecture Recommendations

### API Design

```typescript
POST /api/render/isometric
Content-Type: application/json

{
  "rack": {
    "name": "Server Room A",
    "height": 42,
    "width": 19,
    "devices": [
      {
        "id": "dev-1",
        "device_type": "server-2u",
        "position": 1,
        "face": "front"
      },
      // ...
    ]
  },
  "deviceTypes": [
    {
      "slug": "server-2u",
      "name": "Dell PowerEdge R640",
      "u_height": 2,
      "colour": "#4A90D9",
      "category": "server",
      "is_full_depth": true
    },
    // ...
  ],
  "options": {
    "format": "svg" | "png" | "pdf",
    "theme": "dracula" | "light" | "dark",
    "dualView": false,
    "includeLegend": true,
    "resolution": 2  // For PNG: 1x, 2x, 3x
  }
}

Response:
{
  "format": "svg",
  "contentType": "image/svg+xml",
  "data": "<svg>...</svg>",
  "metadata": {
    "width": 400,
    "height": 800,
    "generatedAt": "2025-12-30T12:34:56Z"
  }
}
```

### Module Structure

```
isometric-service/
├── src/
│   ├── types.ts                    # Rackula type definitions + API types
│   ├── config.ts                   # IsometricConfig interface
│   ├── render/
│   │   ├── context.ts              # RenderContext initialization
│   │   ├── math.ts                 # isoProject(), color utilities
│   │   ├── primitives.ts           # draw3DBox(), createPolygon()
│   │   ├── cabinet.ts              # drawRackCabinet()
│   │   ├── device.ts               # drawDevice(), drawDeviceDetails()
│   │   └── index.ts                # Main renderIsometric() orchestrator
│   ├── export/
│   │   ├── svg.ts                  # SVG serialization
│   │   ├── png.ts                  # SVG → PNG via Puppeteer/Sharp
│   │   ├── pdf.ts                  # SVG → PDF via jsPDF
│   │   └── formats.ts              # Format routing
│   ├── validation/
│   │   ├── schema.ts               # Zod schemas
│   │   └── index.ts                # Validation functions
│   ├── cache.ts                    # Optional: LRU cache for configs
│   └── index.ts                    # Main export function
├── tests/
│   ├── render.test.ts
│   ├── integration.test.ts
│   └── fixtures/
│       ├── sample-rack.json
│       ├── expected-output.svg
├── package.json
└── tsconfig.json
```

### Extract Strategy (Minimum Viable Changes)

1. **Copy isometric-poc.ts → src/render/isometric.ts**
   - Remove JSDOM initialization (move to context module)
   - Remove fs.writeFileSync() calls
   - Remove sample data (use function parameters)
   - Keep all math and drawing functions

2. **Create wrapper for Rackula domain model:**
   ```typescript
   function renderRackIsometric(
     rack: Rack,
     deviceTypes: DeviceType[],
     config: IsometricConfig
   ): SVGElement {
     const context = createRenderContext();
     
     // Validate
     validateRack(rack, deviceTypes);
     
     // Initialize SVG
     const svg = initializeSvg(context, config);
     
     // Draw
     drawRackCabinet(context, svg, config);
     
     // Render devices
     for (const device of rack.devices) {
       const deviceType = deviceTypes.find(d => d.slug === device.device_type);
       drawDevice(context, svg, device, deviceType, config);
     }
     
     // Add legend if needed
     if (config.includeLegend) {
       drawLegend(context, svg, rack.devices, deviceTypes);
     }
     
     return svg;
   }
   ```

3. **Export formats:**
   - `exportSvg()` - Return outerHTML string
   - `exportPng()` - Use Puppeteer for headless render (slower but reliable)
   - `exportPdf()` - Use jsPDF with embedded SVG

---

## Summary & Next Steps

### What's Production-Ready (from POC)

- **Isometric projection math**: Fully tested, working
- **Cabinet drawing**: Complete with frame, rails, vents, LEDs
- **Device rendering**: Supports full/half-depth, colors, details
- **Dual-view layout**: Front + rear side-by-side
- **Legend generation**: Device swatches with metadata
- **SVG output**: Valid, exports to PNG/PDF via jsPDF

### What Needs Development

1. **Data Model Integration**
   - Decouple from hardcoded sample data
   - Accept Rackula Rack + DeviceType[] objects
   - Validate for overlaps, invalid U positions

2. **Server-Side Extraction**
   - Refactor to accept DOM context
   - Create Node.js service wrapper
   - Add jsPDF + image export backends

3. **Performance & Caching**
   - Pool JSDOM instances
   - Cache configuration objects
   - Benchmark SVG → PNG conversion

4. **Testing & Validation**
   - Unit tests for isometric math
   - Integration tests with export.ts logic
   - Visual regression tests (golden images)

### Effort Estimate

| Phase | Task | Est. Hours |
|-------|------|-----------|
| 1 | Extract & refactor isometric math | 4-6 |
| 2 | Server wrapper + API design | 6-8 |
| 3 | Image export (PNG/PDF) backends | 8-12 |
| 4 | Testing & validation | 6-10 |
| 5 | Documentation & deployment | 4-6 |
| **Total** | | **28-42 hours** |

### Recommended Path Forward

1. **Short term:** Extract isometric-poc.ts math to standalone module, verify it works with Rackula data types
2. **Medium term:** Build minimal Node.js HTTP service (svg-only output)
3. **Long term:** Add image export backends (Puppeteer for initial MVP, optimize with Sharp later)
4. **Future:** Consider asset caching, per-device customization, alternative projection angles

