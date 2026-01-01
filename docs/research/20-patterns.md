# Spike #20: Branded Rack Support - Pattern Analysis

## Overview

This document synthesizes findings from codebase exploration and external research to identify implementation patterns for branded rack support in Rackula.

---

## Pattern 1: Extend Existing Type System

**Source:** Codebase (types/index.ts) + External (NetBox RackType)

The current `Rack` interface already includes `form_factor` which is stored but not visually differentiated. Extending this pattern:

```typescript
// Current Rack type
interface Rack {
  name: string;
  height: number;
  width: 10 | 19 | 21 | 23;
  form_factor: FormFactor;
  // ...
}

// Proposed extension (minimal)
interface Rack {
  // ... existing fields ...
  manufacturer?: string;  // 'APC', 'Vertiv', 'HPE', 'Tripp Lite', etc.
  model?: string;         // 'NetShelter SX AR3100', 'SmartRack SR42UB'
}
```

**Why this pattern:**
- Follows existing optional field conventions (`notes?: string`)
- NetBox compatible (same field names)
- Backward compatible (existing layouts without these fields still work)
- No schema migration needed (optional fields)

---

## Pattern 2: Brand Pack Structure for Rack Types

**Source:** Codebase (brandPacks/apc.ts, brandPacks/hpe.ts, etc.)

Rackula already has 18+ manufacturer brand packs for devices. Apply same pattern for racks:

```
src/lib/data/
├── brandPacks/          # Device brand packs (existing)
│   ├── apc.ts
│   ├── hpe.ts
│   └── index.ts
└── rackBrands/          # Rack brand packs (new)
    ├── apc.ts           # APC NetShelter series
    ├── hpe.ts           # HPE G2 Advanced series
    ├── tripplite.ts     # Tripp Lite SmartRack series
    └── index.ts         # Aggregator
```

**RackBrand interface:**
```typescript
interface RackBrand {
  manufacturer: string;
  models: RackModel[];
}

interface RackModel {
  model: string;           // 'NetShelter SX AR3100'
  slug: string;            // 'netshelter-sx-ar3100'
  form_factor: FormFactor;
  u_height: number;
  width: 10 | 19 | 21 | 23;
  // Visual customization
  style?: RackStyle;
}

interface RackStyle {
  railColor?: string;      // CSS color for rails
  frameColor?: string;     // CSS color for frame
  accentColor?: string;    // Brand accent color
  logoUrl?: string;        // Optional manufacturer logo
}
```

**Why this pattern:**
- Consistent with existing brand pack architecture
- Easy to add new manufacturers
- Enables community contributions
- Keeps data separate from rendering logic

---

## Pattern 3: Form Factor Visual Differentiation

**Source:** Codebase (Rack.svelte) + External (NetBox form factors)

Current `form_factor` is stored but all racks render identically. Implement visual differences:

| Form Factor | Visual Treatment |
|-------------|-----------------|
| `2-post` | Minimal rails only, no side panels, transparent interior |
| `4-post` | Standard rails + rear rails visible, no enclosure |
| `4-post-cabinet` | Full enclosure with side panel indicators |
| `wall-mount` | Mounting brackets at top, compact styling |
| `open-frame` | Skeletal frame, maximum transparency |

**Implementation approach:**
```svelte
<!-- Rack.svelte -->
{#if form_factor === '2-post'}
  <!-- Minimal rail rendering -->
{:else if form_factor === '4-post-cabinet'}
  <!-- Full enclosure with side panels -->
{:else}
  <!-- Default 4-post rendering -->
{/if}
```

**Why this pattern:**
- Uses existing stored data (no schema changes)
- Provides immediate value without requiring manufacturer selection
- Low complexity, high impact

---

## Pattern 4: Conditional SVG Layer Rendering

**Source:** Codebase (Rack.svelte Christmas hats example)

Existing pattern for conditional visual elements:
```svelte
{#if showChristmasHats && effectiveFaceFilter === "front"}
  <!-- Christmas hat SVG elements -->
{/if}
```

Apply same pattern for branding:
```svelte
{#if rack.manufacturer && brandingEnabled}
  <BrandedRackOverlay
    manufacturer={rack.manufacturer}
    model={rack.model}
    style={getRackStyle(rack.manufacturer, rack.model)}
  />
{/if}
```

**Brand overlay elements:**
1. **Logo placement:** Small manufacturer logo in top rail area
2. **Nameplate:** Model name below rack name heading
3. **Rail styling:** Custom colors via CSS variables
4. **Frame accents:** Brand-specific trim colors

**Why this pattern:**
- Proven approach (Christmas hats work)
- Additive (doesn't modify base rack structure)
- Easy to toggle on/off
- Export-compatible

---

## Pattern 5: Style Token System for Brands

**Source:** Codebase (tokens.css, CATEGORY_COLOURS)

Existing category colors pattern:
```typescript
export const CATEGORY_COLOURS: Record<DeviceCategory, string> = {
  server: 'var(--color-category-server)',
  network: 'var(--color-category-network)',
  // ...
};
```

Apply for rack brands:
```typescript
export const RACK_BRAND_STYLES: Record<string, RackStyle> = {
  'apc': {
    railColor: '#1a1a1a',      // APC black
    accentColor: '#00a651',    // APC green
  },
  'hpe': {
    railColor: '#2d2d2d',      // HPE dark gray
    accentColor: '#01a982',    // HPE green
  },
  'vertiv': {
    railColor: '#333333',
    accentColor: '#00629b',    // Vertiv blue
  },
  'tripplite': {
    railColor: '#1f1f1f',
    accentColor: '#e31937',    // Tripp Lite red
  },
};
```

**Why this pattern:**
- Consistent with existing design token system
- Easy to extend
- CSS variable compatible
- Works with dark theme

---

## Pattern 6: Preset Selection UI

**Source:** Codebase (NewRackForm height presets)

Existing height preset buttons in NewRackForm:
```svelte
<button onclick={() => height = 42}>42U</button>
<button onclick={() => height = 24}>24U</button>
```

Apply same pattern for rack presets:
```svelte
<fieldset>
  <legend>Rack Model</legend>
  <button onclick={() => selectPreset('apc-ar3100')}>
    APC NetShelter 42U
  </button>
  <button onclick={() => selectPreset('tripplite-sr42ub')}>
    Tripp Lite SmartRack 42U
  </button>
  <button onclick={() => selectPreset('custom')}>
    Custom
  </button>
</fieldset>
```

**Preset selection flow:**
1. User clicks preset → auto-fills height, width, form_factor, manufacturer, model
2. User can still customize any field after selection
3. "Custom" option leaves fields blank for manual entry

**Why this pattern:**
- Familiar UX (same as height presets)
- Reduces manual data entry
- Ensures consistent configurations
- Easy to add new presets

---

## Implementation Phases

### Phase 1: Form Factor Visualization (Low Effort, High Value)
- Implement visual differences for existing `form_factor` field
- No data model changes required
- Immediate differentiation between 2-post, 4-post, cabinet, wall-mount

### Phase 2: Manufacturer/Model Fields (Low Effort)
- Add optional `manufacturer` and `model` fields to Rack type
- Update schema with optional fields
- Update NewRackForm with text inputs
- Display in rack header (below name)

### Phase 3: Brand Style System (Medium Effort)
- Create `RACK_BRAND_STYLES` mapping
- Apply rail/accent colors based on manufacturer
- CSS variable integration

### Phase 4: Preset Library (Medium Effort)
- Create `rackBrands/` data structure
- Populate with common homelab racks
- Implement preset selection UI in NewRackForm

### Phase 5: Visual Branding Elements (Higher Effort)
- Optional manufacturer logo rendering
- Model nameplate display
- Export compatibility verification

---

## Recommendations

1. **Start with Phase 1** (form factor visualization) - uses existing data, no schema changes
2. **Prioritize homelab brands** - Tripp Lite, StarTech, NavePoint, APC (common in homelab)
3. **Keep branding optional** - not everyone wants branded visuals
4. **Ensure export fidelity** - brand elements must render correctly in PNG/PDF
5. **Consider mobile** - brand elements must remain visible at small scales

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| SVG performance with logos | Use small, optimized SVG logos; make optional |
| Visual clutter | Subtle styling (rail colors) over prominent branding |
| Brand accuracy | Start with generic styling, allow community corrections |
| Backward compatibility | All new fields optional; default styling for unbranded |

---

## Questions for User

1. Should branded racks show manufacturer logo, or just styled colors?
2. Priority: form factor visualization vs manufacturer presets?
3. Any specific rack manufacturers to prioritize for homelab audience?
