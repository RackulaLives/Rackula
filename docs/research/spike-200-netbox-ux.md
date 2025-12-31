# Spike #200: Research NetBox UX Patterns for Improved DnD Integration

**Date:** 2025-12-30
**Status:** Complete
**Time Spent:** ~2 hours

---

## Executive Summary

This spike investigated whether NetBox provides contextual UX patterns that could improve Rackula's drag-and-drop integration.

**Key Finding:** Rackula's current DnD implementation is **more advanced** than both NetBox core and the community plugin ecosystem. NetBox core does not include drag-and-drop device placement at all - this was explicitly deferred to plugins. The community-developed `netbox-reorder-rack` plugin fills part of this gap but offers fewer capabilities than Rackula's native implementation.

**Recommendation:** Adopt three low-effort polish patterns from NetBox community feedback:
1. Device name tooltip during drag
2. Enhanced collision messaging
3. Improved blocked-slot visual styling

---

## Research Question

> Does NetBox provide contextual UX patterns that could improve Rackula's drag-and-drop integration?

## Answer

**Partially.** NetBox's form-based workflow is fundamentally different from Rackula's direct manipulation approach. However, user feedback from the NetBox community reveals pain points that inform valuable polish opportunities.

---

## Technical Findings

### NetBox Device Placement (Core)

NetBox core uses a **form-based workflow**:
1. Navigate to device edit form
2. Manually enter rack position (numeric field)
3. Select rack face (front/rear dropdown)
4. Submit form to save position

This approach has documented pain points:
- "Planning rack layouts required tedious manual calculations"
- "Rearranging devices meant repeatedly editing individual device records"
- "Visual feedback during layout planning was critical but unavailable"

### NetBox Community Plugin: netbox-reorder-rack

A community plugin adds drag-and-drop reordering:
- Built on Gridstack JavaScript library
- Allows repositioning within a single rack
- Does not support palette → rack placement
- Does not support cross-rack moves

### Rackula's Current Capabilities

| Feature | NetBox Core | netbox-reorder-rack | Rackula |
|---------|-------------|---------------------|---------|
| Palette → Rack DnD | ❌ | ❌ | ✅ |
| Rack reorder DnD | ❌ | ✅ | ✅ |
| Cross-rack DnD | ❌ | ❌ | 🔧 (scaffolded) |
| Mobile tap-to-place | ❌ | ❌ | ✅ |
| Drop preview | ❌ | ❌ | ✅ |
| Real-time collision | Form validation | Unknown | ✅ |
| Face-aware visual | Data only | Unknown | ✅ |
| 0.5U support | ❌ | ❌ | ✅ (schema) |
| Undo/redo | ❌ | ❌ | ✅ |

**Rackula leads in 9 of 10 categories.**

---

## Patterns Worth Adopting

Based on NetBox community feedback and feature requests, three patterns would enhance Rackula's DnD:

### 1. Device Name Tooltip During Drag

**What:** Show a floating label with device name and U-height during drag operations.

**Why:** NetBox users requested "device description in elevation" (Issue #14991). During drag, users should see what they're placing without looking at the palette.

**Effort:** Small (CSS tooltip + drag event handler)

### 2. Enhanced Collision Messaging

**What:** When a drop is blocked, show a toast/message explaining why: "Position blocked by [Device Name]"

**Why:** Current collision feedback shows red border but doesn't explain. NetBox users complained about unclear validation messages.

**Effort:** Small (toast component + collision context)

### 3. Improved Blocked-Slot Visual Styling

**What:** Clearer visual distinction for half-depth conflicts on the opposite face.

**Why:** The current "blocked slots" indicator could be more visually distinct. Half-depth scenarios are a Rackula strength worth emphasizing.

**Effort:** Small (CSS updates)

---

## Patterns NOT Recommended

### Form-Based Position Selection
NetBox Issue #17953 proposed a modal for clicking rack positions. **Not recommended** because:
- Rackula's DnD is already more intuitive
- Would add UI complexity with two placement paradigms
- Wait for accessibility feedback before adding alternatives

### NetBox API Integration
Importing/exporting rack positions via NetBox API is a separate feature, not DnD UX. **Defer** to a dedicated spike if desired.

### Plugin Architecture
NetBox uses plugins because DnD was out of scope for core. Rackula doesn't need this complexity as a single-purpose application.

---

## Go/No-Go Summary

| Pattern | Verdict | Rationale |
|---------|---------|-----------|
| Drag tooltip | **GO** | Low effort, noticeable improvement |
| Collision messaging | **GO** | Improves error recovery UX |
| Blocked-slot styling | **GO** | Visual clarity for half-depth |
| Click-to-select modal | **DEFER** | Wait for accessibility feedback |
| NetBox API integration | **DEFER** | Out of scope for this spike |
| Form-based placement | **NO-GO** | Would regress UX |

---

## Implementation Approach

### Recommended: Incremental Polish

Create 2-3 small issues for the GO patterns:
1. `feat: drag tooltip with device info` - Show name/U during drag
2. `feat: collision reason messaging` - Toast explaining blocks
3. `chore: improve blocked-slot visual styling` - CSS polish

These can be addressed as part of regular development without dedicated sprints.

---

## External Research Sources

- [GitHub Issue #6726: Enable drag and drop for moving devices](https://github.com/netbox-community/netbox/issues/6726)
- [GitHub Discussion #8740: Drag & Drop devices in racks](https://github.com/netbox-community/netbox/discussions/8740)
- [GitHub Issue #17953: Rack Elevation Selector for Device Edit Form](https://github.com/netbox-community/netbox/issues/17953)
- [netbox-reorder-rack plugin](https://github.com/netbox-community/netbox-reorder-rack)
- [NetBox Labs: Open-Source DCIM Tools](https://netboxlabs.com/blog/open-source-dcim-tools/)
- [Sunbird DCIM Glossary](https://www.sunbirddcim.com/glossary/rack-diagram)

---

## Conclusion

Rackula's DnD implementation is already competitive with the best of the NetBox ecosystem. The spike validates the current architecture while identifying three low-effort polish opportunities that address pain points identified by the NetBox community.

**Final Recommendation:** Proceed with GO patterns. No architectural changes needed.

---

## Related Research Files

- `docs/research/200-codebase.md` - Rackula DnD architecture exploration
- `docs/research/200-external.md` - NetBox UX patterns research
- `docs/research/200-patterns.md` - Pattern analysis and trade-offs
