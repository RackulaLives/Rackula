# Spike #572: File Format Accessibility (ZIP vs Alternatives)

**Date:** 2026-01-14
**Parent Epic:** #570 (Developer-Friendly Data Format)

---

## Executive Summary

This spike evaluated the current ZIP-based `.rackula` file format against alternatives that better serve power users who want to hand-edit layouts and track them in version control.

**Key Finding:** The current ZIP format creates unnecessary friction for the majority use case. Most Rackula layouts contain few or no custom images (users rely on bundled device images), yet all users pay the cost of ZIP's opaqueness.

**Recommendation:** Replace ZIP with a **single YAML file with embedded base64 images** (`.rackula.yaml`). This format:

- Is git-trackable with meaningful diffs
- Can be shared as a single file (Discord, email, forums)
- Is human-readable and editable in any text editor
- Requires less implementation code than the current ZIP approach

The base64 encoding overhead (~37%) is acceptable because custom images are rare and typically small. Industry precedent (Excalidraw, draw.io) validates this approach for diagram-like applications.

---

## Research Summary

### Current Implementation

The `.rackula` file is a ZIP archive containing:

```
[layout-name]/
  ├── [layout-name].yaml      # Layout data
  └── assets/
      └── [device-slug]/
          └── front.png       # Custom images only
```

**Key characteristics:**

- Uses JSZip (dynamically imported) for creation/extraction
- YAML data already human-readable inside the ZIP
- Only user-uploaded custom images stored; bundled device images excluded
- Schema validation on load ensures format compatibility

**Pain points confirmed:**

- Git tracks ZIP as binary blob (no diffs)
- Must extract to view/edit YAML
- External editors can't validate without extraction

### Format Options Evaluated

| Option                        | Git-friendly | Single File | Human-editable | Complexity |
| ----------------------------- | ------------ | ----------- | -------------- | ---------- |
| A: Single YAML + base64       | Good         | Excellent   | Excellent      | Low        |
| B: Dual format (ZIP + folder) | Excellent    | Good        | Good           | Medium     |
| C: Smart hybrid (auto-switch) | Varies       | Excellent   | Varies         | High       |
| D: YAML + external refs       | Excellent    | Poor        | Excellent      | Medium     |

### Industry Research

Similar tools' approaches:

- **Excalidraw:** Single JSON with embedded base64 - works well for lightweight diagrams
- **ODF/OOXML:** Dual format (ZIP + flat XML) - more complexity than Rackula needs
- **Godot:** Text-based TSCN format - praised for git-friendliness
- **Obsidian:** Plain text + external assets - requires manual bundling to share

---

## Recommendation

### Adopt Option A: Single YAML with Embedded Base64

**Rationale:**

1. **Matches reality:** Most layouts have few/no custom images
2. **Simplifies codebase:** One format, one codepath, removes JSZip dependency
3. **Both shareable AND git-friendly:** Unlike alternatives that sacrifice one
4. **Low risk:** Builds on existing YAML serialization

**New format:**

```yaml
# layout.rackula.yaml
version: 1
metadata:
  name: "Home Server Rack"
  created: "2026-01-14T10:00:00Z"
layout:
  racks: [...]
  devices: [...]
images:
  custom-device-1:
    front: "data:image/png;base64,iVBORw0KGgo..."
```

### Implementation Strategy

**Phase 1: Add YAML Export**

- Add "Save as YAML" option
- Validate round-trip: save → load → compare

**Phase 2: Add YAML Import**

- Detect format on open (YAML vs ZIP by extension/content)
- Support both formats seamlessly

**Phase 3: Default Switch**

- Make YAML default save format
- Keep ZIP as legacy load support

**Phase 4: Deprecate ZIP (optional)**

- Remove ZIP save option
- Remove JSZip from bundle
- Announce deprecation

### Edge Cases

| Scenario                   | Handling                                   |
| -------------------------- | ------------------------------------------ |
| Large images (>500KB each) | Warning on save with optimization guidance |
| Many images (>10)          | Same warning approach                      |
| Very large layouts (>5MB)  | Allow but warn                             |

### Migration Path

1. Detect ZIP format (magic bytes or extension)
2. Extract using existing JSZip logic
3. Convert to in-memory representation
4. Optionally prompt user to re-save as YAML

**No data loss:** YAML can represent everything ZIP can.

### File Extension

**Recommended:** `.rackula.yaml`

- Clear that it's YAML (human-readable)
- Retains `.rackula` branding
- Distinct from old `.rackula` ZIP files

**Future:** Consolidate to `.rackula` (YAML-only) after ZIP support removed.

---

## Deliverables

### Research Files

- `docs/research/572-codebase.md` - Current implementation analysis
- `docs/research/572-external.md` - Industry research
- `docs/research/572-patterns.md` - Pattern analysis and trade-offs

### Implementation Issues (to be created)

1. **feat: Add YAML save format with embedded images** - Phase 1
2. **feat: Add YAML file loading alongside ZIP** - Phase 2
3. **feat: Make YAML the default save format** - Phase 3
4. **chore: Remove JSZip dependency** - Phase 4 (optional)

---

## Related

- Discussion #569 - Original request for schema publication
- Issue #571 - JSON Schema publication (complementary)
- Issue #573 - In-app YAML viewer/editor research
