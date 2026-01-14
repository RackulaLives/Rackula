# Pattern Analysis: File Format Accessibility (#572)

Synthesized findings from codebase and external research, tailored to Rackula's specific constraints and user needs.

## Key Insights

### From Codebase Analysis

1. **Current format is well-structured:** The ZIP archive uses a sensible folder hierarchy (`layout.yaml` + `assets/` folder) that maps naturally to any alternative format
2. **Images are optional:** Only user-uploaded custom images are stored; bundled device library images are not included in archives
3. **YAML is already human-readable:** The structured data portion (layout, devices, racks) is already in an accessible text format
4. **Schema validation exists:** Load-time validation means format changes can be detected and handled gracefully

### From External Research

1. **Dual-format is industry standard:** ODF, Godot, Krita, and others all offer both compressed and flat formats for different use cases
2. **Git-friendliness drives adoption:** Godot's text-based TSCN format is widely praised specifically because it enables collaboration
3. **Base64 embedding works for lightweight use:** Excalidraw successfully uses embedded base64 for diagrams with few images
4. **Folder-as-package is platform-specific:** macOS bundles are elegant but don't translate to Windows/Linux

### Rackula-Specific Considerations

- **Typical layout:** Few or no custom images (most users rely on bundled device library)
- **Power user workflow:** Git repositories for homelab documentation (alongside Ansible, docker-compose, etc.)
- **Sharing context:** Discord, Reddit, forums - single-file attachment is critical
- **Browser-only constraint:** All operations run client-side; no server processing available

## Implementation Approaches

### Option A: Single YAML with Embedded Base64 Images

Replace the ZIP format entirely with a single YAML file. Custom images are embedded as base64 data URLs inline.

**File Structure:**

```yaml
# layout.rackula.yaml
version: 1
metadata:
  name: "Home Server Rack"
  created: "2026-01-14T10:00:00Z"
layout:
  racks:
    - id: rack-1
      name: "Main Rack"
      # ... rack configuration
  devices:
    - id: server-1
      device_type: dell-poweredge-r720
      position: 10
      # ... device configuration
images:
  # Only present if user has uploaded custom images
  custom-device-1:
    front: "data:image/png;base64,iVBORw0KGgo..."
```

**Pros:**

- Single file solves both sharing and VCS use cases
- Fully git-trackable with meaningful diffs for layout changes
- Human-readable and editable in any text editor
- Zero configuration - one format for everyone
- Preserves existing YAML serialization logic

**Cons:**

- Base64 encoding adds ~37% size overhead to images
- Image sections create noisy diffs if images change
- Large files (>1MB) become unwieldy in editors
- May hit paste/copy limits in some contexts

**Mitigation:**

- Images section at end of file - most diffs won't include it
- Compression (gzip) can reduce size for download if needed
- Image embedding is optional - layouts without custom images stay small

**Implementation Complexity:** Low

- Modify `archive.ts` to write/read YAML directly
- Add image serialization to existing YAML handling
- Remove JSZip dependency (simplifies bundle)

---

### Option B: Dual Format with User Choice

Maintain the current ZIP format for sharing but add a "folder mode" for version control. User explicitly chooses format on save.

**ZIP Format (for sharing):**

```
layout.rackula (ZIP)
├── layout.yaml
└── assets/
    └── custom-device-1/
        └── front.png
```

**Folder Format (for VCS):**

```
layout.rackula/
├── layout.yaml
└── assets/
    └── custom-device-1/
        └── front.png
```

**Pros:**

- ZIP format unchanged - no migration needed
- Folder format is perfectly git-trackable
- Assets stored as native files (no encoding overhead)
- Clear separation of concerns

**Cons:**

- Two formats to maintain, test, and document
- User must understand when to use which format
- Folder format requires explicit zipping for sharing
- "Open" action must handle both file and folder inputs

**Implementation Complexity:** Medium

- Add folder read/write alongside existing ZIP logic
- Modify file picker to accept both files and folders
- Add "Save As Folder" option in UI
- Document usage guidance for each format

---

### Option C: Smart Hybrid with Threshold

Single YAML by default, automatic ZIP conversion when file exceeds size threshold. The application handles format selection automatically.

**Small Layout (no images or small images):**

```yaml
# layout.rackula.yaml
version: 1
layout: { ... }
images:
  small-icon: "data:image/png;base64,..." # Under threshold
```

**Large Layout (many/large images):**

```
layout.rackula (ZIP)
├── layout.yaml
└── assets/
    └── large-image.png
```

**Pros:**

- Automatic optimization - users don't choose
- Small layouts stay git-friendly by default
- Large layouts get efficient compression
- Single logical format with transparent implementation

**Cons:**

- Threshold behavior may surprise users
- Format can change on re-save if images added/removed
- Harder to document ("sometimes it's YAML, sometimes ZIP")
- Git workflows disrupted if format flips

**Implementation Complexity:** Medium-High

- Threshold logic for format selection
- Both ZIP and YAML codepaths required
- Format detection on load
- UX for communicating current format state

---

### Option D: YAML with External Asset References

Single YAML file that references external images by URL or relative path. Images stored separately (user's responsibility).

**File Structure:**

```yaml
# layout.rackula.yaml
version: 1
layout: { ... }
images:
  custom-device-1:
    front: "./assets/custom-device-1-front.png"  # Relative path
    # or
    front: "https://example.com/my-image.png"    # External URL
```

**Directory Structure:**

```
my-homelab-docs/
├── layout.rackula.yaml
└── assets/
    └── custom-device-1-front.png
```

**Pros:**

- Maximum git-friendliness (YAML + binary assets separate)
- Follows Obsidian/Logseq vault pattern
- No encoding overhead
- Images can be managed independently
- Supports external URLs (cloud storage, CDN)

**Cons:**

- Not a single file - sharing requires manual zipping
- Broken references if files moved incorrectly
- User must manage asset organization
- Load failures if external URLs unavailable

**Implementation Complexity:** Medium

- Asset resolution logic (relative paths, URLs)
- Reference validation on load
- Export helper to bundle as ZIP for sharing
- Documentation for folder organization

## Trade-offs Matrix

| Criterion                     | A: Single YAML                | B: Dual Format          | C: Smart Hybrid | D: External Refs       |
| ----------------------------- | ----------------------------- | ----------------------- | --------------- | ---------------------- |
| **Git-friendliness**          | Good (noisy if images change) | Excellent (folder mode) | Varies          | Excellent              |
| **Single-file sharing**       | Excellent                     | Good (ZIP mode)         | Excellent       | Poor (must zip)        |
| **Human editability**         | Excellent                     | Good                    | Varies          | Excellent              |
| **Migration effort**          | Low                           | Low                     | Medium          | Medium                 |
| **Implementation complexity** | Low                           | Medium                  | Medium-High     | Medium                 |
| **User experience**           | Simple                        | Requires choice         | Opaque          | Requires understanding |
| **Image size handling**       | Poor for large                | Excellent               | Good            | Excellent              |
| **Bundle size impact**        | Removes JSZip                 | Keeps JSZip             | Keeps JSZip     | Removes JSZip          |

### Scoring (1-5, higher is better)

| Criterion (weight)              | A       | B       | C       | D       |
| ------------------------------- | ------- | ------- | ------- | ------- |
| Git-friendliness (25%)          | 4       | 5       | 3       | 5       |
| Single-file sharing (25%)       | 5       | 4       | 5       | 2       |
| Human editability (15%)         | 5       | 4       | 3       | 5       |
| Migration simplicity (15%)      | 5       | 5       | 4       | 4       |
| Implementation complexity (10%) | 5       | 3       | 2       | 3       |
| User experience (10%)           | 5       | 3       | 2       | 3       |
| **Weighted Total**              | **4.6** | **4.1** | **3.4** | **3.6** |

## Recommendation

**Preferred Approach: Option A (Single YAML with Embedded Base64)**

### Rationale

1. **Matches actual usage patterns:** Based on the codebase analysis, most Rackula layouts contain few or no custom images. Users primarily rely on the bundled device library. This makes the base64 overhead a non-issue for the majority of use cases.

2. **Simplifies everything:** One format means one codepath to maintain, one behavior to document, one thing for users to understand. The current ZIP format adds complexity (JSZip dependency, extraction logic, folder structure) that isn't justified for the typical payload.

3. **Maximizes shareability AND git-friendliness:** Unlike Option B (which forces users to choose) or Option D (which sacrifices easy sharing), Option A provides both benefits simultaneously. A `.rackula.yaml` file can be:
   - Attached to Discord/Reddit/email
   - Committed to a git repository with meaningful diffs
   - Opened in any text editor
   - Pasted into a GitHub issue

4. **Low implementation risk:** The change is additive - YAML serialization already exists, file I/O is simpler without ZIP, and the migration path is clear (load ZIP, save as YAML).

5. **Aligns with industry direction:** Excalidraw, draw.io, and other modern tools have demonstrated that embedded base64 is acceptable for diagram-like applications where images are supplementary rather than primary content.

### Implementation Strategy

**Phase 1: Add YAML Export**

- Add "Save as YAML" option alongside existing ZIP save
- YAML format includes embedded base64 images
- Validate round-trip: save YAML -> load YAML -> compare

**Phase 2: Add YAML Import**

- Detect format on file open (YAML vs ZIP based on extension/content)
- Support loading both formats seamlessly
- Display format type in status bar (informational)

**Phase 3: Default Switch**

- Make YAML the default save format
- Keep ZIP as legacy load support
- Update documentation and tutorials

**Phase 4: Deprecate ZIP (optional)**

- Remove ZIP save option (keep load for backward compatibility)
- Remove JSZip from production bundle
- Announce deprecation in release notes

### Edge Case Handling

**Large images (>500KB per image):**

- Display warning on save: "This layout contains large images. Consider optimizing before sharing."
- Provide link to image optimization guidance

**Many images (>10 custom images):**

- Same warning approach
- Suggest using external image hosting for large libraries

**Very large layouts (>5MB total):**

- Allow save but warn about file size
- Most layouts will be under 100KB without custom images

### Migration Path

**Loading old .rackula files:**

1. Detect ZIP format (magic bytes or extension)
2. Extract using existing JSZip logic
3. Convert to in-memory representation
4. Optionally prompt user to re-save as YAML

**No data loss:** The YAML format can represent everything the ZIP format can - it's a serialization change, not a data model change.

### File Extension

Use `.rackula.yaml` for the new format:

- Clear that it's YAML (human-readable)
- Retains `.rackula` branding
- Distinct from old `.rackula` ZIP files
- Standard YAML tooling recognizes the extension

Alternative: Use `.rackula` for YAML and detect format by content. This is cleaner but potentially confusing during transition period.

**Recommendation:** Start with `.rackula.yaml` for clarity, consider consolidating to `.rackula` (YAML-only) after ZIP support is removed.
