# Spike #20: Branded Rack Support - Codebase Exploration

## Files Examined

**Core Rack Components:**
- `src/lib/components/Rack.svelte` - Main SVG rack rendering component
- `src/lib/components/RackDevice.svelte` - Individual device rendering within rack
- `src/lib/components/RackDualView.svelte` - Dual front/rear view component
- `src/lib/components/Canvas.svelte` - Canvas container with panzoom

**Data Types & Schemas:**
- `src/lib/types/index.ts` - Core type definitions (Rack, DeviceType, PlacedDevice)
- `src/lib/schemas/index.ts` - Zod validation schemas
- `src/lib/types/constants.ts` - Constants and category colors

**Rack Configuration & Utilities:**
- `src/lib/utils/rack.ts` - Rack utility functions
- `src/lib/constants/layout.ts` - Visual dimension constants
- `src/lib/stores/layout.svelte.ts` - Layout state management

**NetBox Integration:**
- `src/lib/utils/netbox-import.ts` - NetBox YAML import parser
- `src/lib/data/brandPacks/` - Pre-defined brand device packs (18 manufacturers)

**Export & Visualization:**
- `src/lib/utils/export.ts` - SVG/PNG/PDF export generation
- `src/lib/components/ExportDialog.svelte` - Export UI

---

## Existing Rack Rendering Architecture

**Rack Structure (SVG-based):**
The rack is rendered as an SVG with the following layered components:
1. **Rails (mounting structure):** Four rectangles forming the frame (left/right vertical rails, top/bottom horizontal bars)
2. **Interior background:** Alternating light/dark U slots for visual distinction
3. **Grid lines:** Horizontal dividers between each U, half-U lines shown with Shift key for fine positioning
4. **Mounting holes:** 3 holes per U on each rail (3D-like appearance)
5. **U labels:** Row numbers on left rail (1-indexed, with highlighting every 5 units)
6. **Devices:** Individual device components placed at specific U positions
7. **Drop preview:** Visual feedback during drag-and-drop operations
8. **Rack name & view labels:** "FRONT" or "REAR" text displayed at top

**Rendering Constants (from constants/layout.ts):**
- U_HEIGHT_PX: 22px (industry standard 1.75" representation)
- RAIL_WIDTH: 17px (for both vertical and horizontal rails)
- BASE_RACK_WIDTH: 220px (19" rack baseline; 10"=116px, 21"=242px, 23"=264px)
- BASE_RACK_PADDING: 18px (for rack name display)
- RACK_PADDING_HIDDEN: 4px (in dual-view mode)

**Rack Type Definition:**
```typescript
interface Rack {
  id?: string;
  name: string;
  height: number;
  width: 10 | 19 | 21 | 23;  // Supported widths in inches
  desc_units: boolean;         // Descending or ascending unit labels
  show_rear: boolean;          // Whether to show rear view
  form_factor: FormFactor;     // '2-post', '4-post', '4-post-cabinet', 'wall-mount', 'open-frame'
  starting_unit: number;       // Custom starting unit number
  position: number;            // Order position (for multi-rack)
  devices: PlacedDevice[];
  notes?: string;
  view?: RackView;             // Current view ('front' | 'rear'), runtime only
}
```

**FormFactor Support (from NetBox):**
Rackula supports 5 form factors:
- `2-post` - Open frame, minimal rails
- `4-post` - Standard 4-post cabinet
- `4-post-cabinet` - Enclosed cabinet with doors
- `wall-mount` - Wall-mounted enclosure
- `open-frame` - Minimal support structure

Currently, the form_factor is **stored but not used for visual differentiation**. All racks render identically regardless of form factor.

---

## Current Rack Configuration Options

The Rack type supports:
1. **Width variants:** 10", 19", 21", 23" (with proportional scaling)
2. **Height:** 1-100 U (validated in schemas)
3. **Unit labeling:** Ascending (U1 at bottom) or descending (U1 at top)
4. **Starting unit:** Customizable starting number (default: 1)
5. **Form factor:** 5 options (not visually differentiated)
6. **Dual-view mode:** Simultaneous front/rear visualization
7. **View toggle:** Can switch between front/rear on single-view canvas

**Not currently configurable:**
- Mounting hole size/spacing
- Rail thickness/appearance
- Interior material/texture
- Brand-specific branding/logos
- Custom color schemes (uses fixed design tokens)

---

## Integration Points for Branded Racks

### High-Priority Integration Points

1. **Extend FormFactor enum to include manufacturer prefixes** (e.g., `dell-4-post-cabinet`, `hp-4-post`)
   - Location: `src/lib/types/index.ts` (FormFactor type definition)

2. **Add manufacturer field to Rack type**
   ```typescript
   export interface Rack {
     // ... existing fields ...
     manufacturer?: string;  // 'Dell', 'HP', 'Eaton', 'Vertiv', etc.
     branding_enabled?: boolean;  // Toggle branded visuals
   }
   ```
   - Location: `src/lib/types/index.ts`

3. **Create BrandedRack data structure**
   - Similar to existing DeviceType brand packs (`src/lib/data/brandPacks/`)
   - Pattern: `/src/lib/data/rackBrands/dell.ts`, `/src/lib/data/rackBrands/hpe.ts`, etc.

4. **Modify Rack.svelte rendering logic**
   - Add conditional rendering for branded rail styles
   - Inject manufacturer-specific SVG elements after existing rail structure
   - Support logo/nameplate rendering

5. **Add brand styling layers to SVG**
   - Logo overlays on top rail
   - Custom rail texture patterns
   - Manufacturer nameplate below rack name
   - Custom mounting hole patterns

6. **Export integration**
   - `src/lib/utils/export.ts` - Add branded rack support

### Medium-Priority Integration Points

7. **NetBox integration** (`src/lib/utils/netbox-import.ts`)
   - Map manufacturer field during import

8. **NewRackForm dialog** - Add brand selector UI

9. **RackEditSheet component** - Add brand editing option

10. **Brand pack indexing** - Create `/src/lib/data/rackBrands/index.ts`

---

## Constraints and Dependencies

### Visual Constraints

1. **Tight spatial budget:** Base rack width is only 220px for 19" rack
   - Logos/branding must be small or positioned outside the main rail structure

2. **SVG rendering performance:** Complex SVG with:
   - ~43 mounting holes
   - ~rack.height grid lines
   - Full-depth device transparency calculations

3. **Dual-view mode complexity:** RackDualView renders two Rack instances
   - Branded elements must work at reduced width

4. **Mobile viewport:** Racks scale down significantly
   - Brand elements must remain visible

5. **Export quality:** Brand elements in exports must maintain clarity

### Data/Schema Constraints

1. **Storage format:** YAML-based `.Rackula.zip` archive format
   - Adding fields requires schema consideration

2. **NetBox compatibility:** May have different branding fields

3. **Backward compatibility:** Existing layouts without brand data must still render

### Architectural Constraints

1. **Single-rack mode:** Currently MAX_RACKS = 1

2. **Component hierarchy:** Canvas → RackDualView → Rack (2x for front/rear)

3. **Panzoom integration:** Expects precise SVG dimensions

4. **TypeScript strict mode:** All type changes must pass validation

---

## Design Patterns for Implementation

**Existing patterns to follow:**

1. **Form factors** (types/index.ts):
   ```typescript
   export type FormFactor = "2-post" | "4-post" | "4-post-cabinet" | "wall-mount" | "open-frame";
   ```

2. **Category color mapping** (constants.ts):
   ```typescript
   export const CATEGORY_COLOURS: Record<DeviceCategory, string> = { ... };
   ```
   - Could create `MANUFACTURER_STYLES` mapping

3. **Brand pack structure** (brandPacks/apc.ts):
   ```typescript
   export const apcDevices: DeviceType[] = [{ /* device configs */ }];
   ```

4. **Conditional SVG rendering** (Rack.svelte):
   ```svelte
   {#if showChristmasHats && effectiveFaceFilter === "front"}
     <!-- SVG elements -->
   {/if}
   ```

5. **foreignObject embedding** for complex UI inside SVG

---

## NetBox Compatibility Notes

NetBox supports these rack-related fields:
- `manufacturer` - Brand name
- `model` - Rack model identifier
- `slug` - URL-safe identifier
- `form_factor` - Physical form factor
- `comments` - General notes

Could extend Rackula's Rack type:
```typescript
interface Rack {
  manufacturer?: string;  // New
  model?: string;         // New
  // ... existing fields
}
```
