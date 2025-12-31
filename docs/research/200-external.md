# NetBox UX Patterns External Research - Spike #200

**Date:** 2025-12-30
**Author:** Claude (automated research)

---

## Executive Summary

NetBox's core application does **not** include drag-and-drop rack device placement - this was explicitly deferred to the plugin ecosystem. The community-developed `netbox-reorder-rack` plugin fills this gap using the Gridstack library. Meanwhile, a separate feature request for a "Rack Elevation Selector" modal was proposed but not implemented.

---

## NetBox Core Device Placement

### Current Workflow (Without Plugins)
1. Navigate to device edit form
2. Manually enter rack position (numeric field)
3. Select rack face (front/rear dropdown)
4. Submit form to save position

### Data Model
- **Position**: Base rack unit number (lowest U for multi-U devices)
- **Rack Face**: Front or rear mounting
- **Height**: Device U-height (including 0U for PDUs)
- **Full Depth**: Boolean - blocks opposite face if true

### UX Pain Points (from community discussions)
- "Planning rack layouts required tedious manual calculations of unit positions"
- "Rearranging devices during capacity planning meant repeatedly editing individual device records"
- "Visual feedback during layout planning was critical but unavailable in the UI"
- "Most people who day-to-day manage data centers won't have the skills necessary" for scripted alternatives

**Sources:**
- [GitHub Discussion #8740](https://github.com/netbox-community/netbox/discussions/8740)
- [GitHub Issue #6726](https://github.com/netbox-community/netbox/issues/6726)

---

## netbox-reorder-rack Plugin

### Overview
Community plugin by Alex Gittings that provides drag-and-drop reordering within a rack.

### Technical Implementation
- Built on **Gridstack** JavaScript library
- Bootstrap-styled interface matching NetBox design system
- Interactive rack visualization for device rearrangement

### Key Limitations
- Single-rack context only
- Reorder existing devices (not placement from library)
- No cross-rack moves mentioned
- Limited documentation on specific UX behaviors

### Takeaway for Rackula
The plugin validates demand for DnD in rack management, but its scope (reordering within rack) is narrower than Rackula's current capabilities (palette-to-rack, rack-to-rack).

**Source:** [netbox-reorder-rack GitHub](https://github.com/netbox-community/netbox-reorder-rack)

---

## Proposed Rack Elevation Selector

### Feature Request (Issue #17953)
Modal dialog for selecting rack position visually:
1. Button adjacent to rack position field
2. Opens modal with SVG rack elevation
3. User clicks to select position
4. Position auto-populates form field

### Status
- Closed without implementation
- Labeled "needs an owner" + "medium complexity"

### Relevance to Rackula
Rackula already implements this pattern via:
- Visual drop targets in rack
- Real-time position preview
- Direct manipulation (vs. form-based)

**Source:** [GitHub Issue #17953](https://github.com/netbox-community/netbox/issues/17953)

---

## Industry Patterns (DCIM Tools)

### Common UI Patterns Across Tools

| Tool | Key Pattern | Notes |
|------|-------------|-------|
| Sunbird DCIM | Drag-and-drop between racks | Commercial, 3D views |
| DCImanager | Visual rack maps | Color-coded status |
| OpenDCIM | Drag-and-drop interface | Open source |
| RackTables | Form-based | Simpler UX |
| Lucidchart/Creately | Diagramming tools | Not DCIM |

### Emerging Patterns
1. **3D Rack Visualization**: Sunbird offers AR overlays
2. **Color-coded Status**: Visual indicators for capacity/health
3. **Search/Filter in Racks**: Find assets across locations
4. **Multi-rack Views**: Side-by-side comparison

**Sources:**
- [NetBox Labs: Open-Source DCIM Tools](https://netboxlabs.com/blog/open-source-dcim-tools/)
- [Sunbird DCIM Glossary](https://www.sunbirddcim.com/glossary/rack-diagram)

---

## NetBox Device Type Library

### Device Images for Rack Elevations
- Front/rear panel illustrations supported
- File naming: `<slug>.front.<format>`
- Renders in rack elevation diagrams

### Relevance
Rackula already supports device images (front/rear) with higher fidelity than NetBox's basic integration. This is an area of strength.

**Source:** [devicetype-library GitHub](https://github.com/netbox-community/devicetype-library)

---

## Key Findings

### What NetBox Does Well
1. **Structured Data Model**: Clear position/face/depth semantics
2. **API-First**: Everything accessible programmatically
3. **Extensibility**: Plugin architecture for DnD features
4. **Community Library**: Extensive device type definitions

### What NetBox Lacks (that Rackula has)
1. **Native DnD**: Core NetBox requires plugin for drag-and-drop
2. **Mobile Support**: No tap-to-place equivalent
3. **Real-time Preview**: No ghost/preview during drag
4. **Collision Visualization**: No blocked-slot indicators
5. **Offline-First**: Rackula works entirely locally

### Patterns Worth Considering
1. **Click-to-select position** (like proposed Issue #17953)
2. **Gridstack-style constraints** (prevent overlaps)
3. **Device description in elevation** (Issue #14991)

---

## Comparison Matrix

| Feature | NetBox Core | netbox-reorder-rack | Rackula |
|---------|-------------|---------------------|---------|
| Palette → Rack DnD | ❌ | ❌ | ✅ |
| Rack reorder DnD | ❌ | ✅ | ✅ |
| Cross-rack DnD | ❌ | ❌ | 🔧 (scaffolded) |
| Mobile tap-to-place | ❌ | ❌ | ✅ |
| Drop preview | ❌ | ❌ | ✅ |
| Collision detection | Form validation | Unknown | ✅ (real-time) |
| Face-aware (half-depth) | ✅ (data) | Unknown | ✅ (visual) |
| Device images | ✅ | ✅ | ✅ |
| 0.5U positioning | ❌ | ❌ | ✅ (schema) |
| Undo/redo | ❌ | ❌ | ✅ |

---

## Recommendations Preview

Based on this research:

### GO - Patterns to Consider
1. **Device name tooltip during drag** - NetBox shows device descriptions
2. **Rack selector modal** - For scenarios needing precision
3. **Enhanced collision messages** - Explain why drop is blocked

### NO-GO - Not Applicable
1. **API-first architecture** - Rackula is offline-first
2. **Server-side validation** - Already have client-side
3. **Plugin architecture** - Overkill for single app

### Key Insight
Rackula's current DnD implementation is **more advanced** than NetBox core and comparable to the plugin ecosystem. The focus should be on polish and discoverability, not architectural changes.
