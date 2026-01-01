# Research Spike #20: Branded Rack Support - Findings

**Issue:** #20 - Branded rack support
**Date:** 2025-12-30
**Status:** Complete

---

## Executive Summary

This spike investigated how to add manufacturer and model support for racks in Rackula, drawing on NetBox's data model and industry practices. The research identified a phased implementation approach that starts with form factor visualization (zero schema changes) and builds toward a full branded rack preset system.

**Key Finding:** Rackula already stores `form_factor` but doesn't use it visually. Implementing form factor visualization provides immediate value with no data model changes.

---

## Research Artifacts

| Document | Purpose |
|----------|---------|
| [20-codebase.md](./20-codebase.md) | Rackula rack rendering architecture analysis |
| [20-external.md](./20-external.md) | NetBox RackType model, industry standards, manufacturer catalog |
| [20-patterns.md](./20-patterns.md) | Implementation patterns and phasing strategy |

---

## Recommended Data Model

Extend the existing `Rack` type with optional manufacturer/model fields:

```typescript
interface Rack {
  // ... existing fields ...
  manufacturer?: string;  // e.g., 'APC', 'Tripp Lite', 'HPE'
  model?: string;         // e.g., 'NetShelter SX AR3100'
}
```

This aligns with NetBox's RackType model and maintains backward compatibility.

---

## Implementation Phases

### Phase 1: Form Factor Visualization
**Effort:** Low | **Value:** High | **Issues:** 1

Use existing `form_factor` field for visual differentiation:
- `2-post`: Minimal rails only
- `4-post`: Standard with visible rear rails
- `4-post-cabinet`: Full enclosure indicators
- `wall-mount`: Mounting bracket styling
- `open-frame`: Skeletal frame

**No schema changes required.**

### Phase 2: Manufacturer/Model Fields
**Effort:** Low | **Value:** Medium | **Issues:** 2

- Add optional `manufacturer` and `model` fields
- Text inputs in NewRackForm
- Display in rack header

### Phase 3: Brand Styling
**Effort:** Medium | **Value:** Medium | **Issues:** 2

- `RACK_BRAND_STYLES` color mapping
- Rail/accent colors by manufacturer
- CSS variable integration

### Phase 4: Rack Presets
**Effort:** Medium | **Value:** High | **Issues:** 2

- `rackBrands/` data structure (like `brandPacks/`)
- Preset selection in NewRackForm
- Auto-fill height, width, form_factor, manufacturer

### Phase 5: Visual Branding
**Effort:** Higher | **Value:** Medium | **Issues:** 2

- Optional manufacturer logo
- Model nameplate
- Export compatibility

---

## Proposed Issues

Based on this research, the following implementation issues are recommended:

### Issue A: Form Factor Visual Differentiation
**Priority:** High
**Labels:** `feature`, `ready`

Implement visual differences for the 5 form factors already stored in rack data. This requires no schema changes and provides immediate value.

**Acceptance Criteria:**
- 2-post racks render with minimal rails only
- 4-post-cabinet shows enclosure indicators
- Wall-mount shows mounting bracket styling
- Visual differences visible in both front/rear views
- Changes reflect in exports (PNG/PDF)

### Issue B: Add Manufacturer/Model Fields to Rack
**Priority:** Medium
**Labels:** `feature`, `enhancement`

Add optional `manufacturer` and `model` text fields to the Rack type and NewRackForm.

**Acceptance Criteria:**
- New optional fields in Rack type
- Text inputs in NewRackForm
- Manufacturer/model shown below rack name
- Fields included in save/load
- NetBox YAML import maps manufacturer field

### Issue C: Rack Brand Style System
**Priority:** Medium
**Labels:** `feature`, `design`

Create color mappings for major rack manufacturers (APC, HPE, Vertiv, Tripp Lite).

**Acceptance Criteria:**
- `RACK_BRAND_STYLES` mapping with rail/accent colors
- Colors applied when manufacturer is set
- Graceful fallback for unknown manufacturers
- Works with existing dark theme

### Issue D: Rack Preset Library
**Priority:** Medium
**Labels:** `feature`, `enhancement`

Create preset buttons for common homelab rack models (similar to height presets).

**Acceptance Criteria:**
- `rackBrands/` data structure with common models
- Preset buttons in NewRackForm
- Clicking preset fills all related fields
- Include: Tripp Lite SmartRack, APC NetShelter, StarTech

### Issue E: Manufacturer Logo Rendering (Optional)
**Priority:** Low
**Labels:** `feature`, `polish`

Optional manufacturer logo display in rack header area.

**Acceptance Criteria:**
- Small logo in top rail area (optional)
- User toggle to enable/disable
- Logos included in exports
- Performance acceptable with multiple racks

---

## Priority Manufacturers for Homelab

Based on external research, prioritize these for initial preset library:

1. **Tripp Lite** (SmartRack SR-series) - Budget-friendly, popular in homelab
2. **StarTech** - Lower cost, open frame options
3. **NavePoint** - Budget homelab, wall-mount options
4. **APC** (NetShelter SX) - Enterprise grade, used in homelab
5. **HPE** (G2 Advanced) - Common in enterprise surplus

---

## Technical Constraints

1. **SVG Performance:** Complex SVG already; logos must be optimized
2. **Spatial Budget:** Only 220px width for 19" rack; branding must be subtle
3. **Mobile:** Brand elements must remain visible at small scales
4. **Dual View:** Branding works at reduced widths
5. **Export Quality:** Brand elements must maintain clarity in PNG/PDF

---

## Decision Points for Implementation

1. **Logo vs Colors Only:** Should branded racks show manufacturer logos, or just styled colors? (Recommend: colors first, logos optional later)

2. **Form Factor Priority:** Implement form factor visualization before or after manufacturer fields? (Recommend: form factor first, uses existing data)

3. **Preset Scope:** How many rack models to include in initial preset library? (Recommend: 5-8 most common homelab models)

---

## Conclusion

Branded rack support can be implemented incrementally with Phase 1 (form factor visualization) requiring zero schema changes. The recommended approach follows existing Rackula patterns (brand packs, conditional rendering, design tokens) ensuring consistency.

The phased approach allows shipping value quickly while building toward a complete branded rack system.
