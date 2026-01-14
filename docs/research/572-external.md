# Research: File Format Accessibility (Issue #572)

Research spike for evaluating file format patterns for applications that need to balance single-file sharing with version control friendliness.

## Industry Practices

### How Different Industries Approach This Problem

**Office Documents (Microsoft, LibreOffice, Google):**

- All major office suites use ZIP-based formats (OOXML, ODF)
- Optimized for single-file sharing, not version control
- Binary inside compressed archives means no meaningful git diffs
- Some tools offer "flat" XML alternatives for version control use cases

**Design Tools (Sketch, Figma, Adobe):**

- Sketch pioneered the "open" ZIP+JSON format in design tools
- Figma uses proprietary binary format, cloud-first (not git-friendly)
- Adobe formats are largely binary/proprietary

**CAD Tools (FreeCAD, KiCad):**

- FreeCAD uses ZIP with XML+binary shapes inside
- KiCad uses plain text S-expression format (fully git-trackable)
- Trade-off: KiCad's approach enables collaboration, FreeCAD's is more compact

**Game Engines (Unity, Godot):**

- Unity traditionally used binary scene formats (merge nightmares)
- Godot chose text-based TSCN format specifically for version control
- Godot's approach widely praised by teams using git workflows

**Note-Taking Apps (Obsidian, Logseq):**

- Both use plain folders with Markdown files
- Images stored in adjacent folders, referenced by relative path
- Fully git-trackable, can sync with any cloud service
- Trade-off: "Sharing" requires zipping or syncing entire vault

**Diagram Tools (draw.io, Excalidraw):**

- draw.io supports compressed and uncompressed XML modes
- Excalidraw embeds scene data in SVG exports for round-trip editing
- Both prioritize editability over compactness

## Similar Implementations

### Sketch (.sketch files)

**Format:** ZIP archive containing JSON + binary assets
**Structure:**

```
document.sketch (renamed .zip)
├── meta.json           # Document metadata, version info
├── document.json       # Shared styles, colors
├── user.json           # User-specific settings
├── pages/
│   └── *.json          # One JSON file per page
├── images/             # Original-scale bitmap assets
└── previews/           # Thumbnail previews (max 2048x2048)
```

**Key Features:**

- Open specification with [JSON Schema](https://github.com/sketch-hq/sketch-file-format)
- TypeScript types auto-generated from schema
- Can be manipulated with standard CLI tools (`unzip`, `zip`)
- Images stored at original scale in dedicated folder

**Relevance to Rackula:** Very similar use case - structured data with optional embedded images.

### ODF (Open Document Format)

**Format:** ZIP archive containing XML + binary assets (ISO 26300)
**Structure:**

```
document.odt (renamed .zip)
├── mimetype            # Must be first, uncompressed
├── META-INF/
│   └── manifest.xml    # File manifest
├── content.xml         # Document content
├── styles.xml          # Style definitions
├── meta.xml            # Metadata (uses Dublin Core)
├── settings.xml        # Application settings
└── Pictures/           # Embedded images (PNG/SVG recommended)
```

**Key Features:**

- Also supports "Flat ODF" - single uncompressed XML file
- Flat format used when version control needed
- Standard recommends PNG for bitmaps, SVG for vectors
- Well-documented with RELAX NG schemas

**Relevance to Rackula:** The "two formats" approach (zip for sharing, flat for VCS) is worth considering.

### Godot Engine (.tscn files)

**Format:** Plain text S-expression-like format
**Structure:**

```
scene.tscn
├── [gd_scene] header with format version
├── [ext_resource] external file references
├── [sub_resource] inline resource definitions
└── [node] scene tree hierarchy
```

**Key Features:**

- Explicitly designed for version control friendliness
- Text-based, human-readable, meaningful diffs
- External resources (images, etc.) referenced by path, not embedded
- Binary .scn format available when text overhead unacceptable

**Relevance to Rackula:** Strong precedent for prioritizing git-friendliness over compactness.

### Excalidraw

**Format:** JSON with embedded base64 images
**Structure:**

```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [...],
  "appState": {...},
  "files": {
    "fileId": {
      "mimeType": "image/png",
      "dataURL": "data:image/png;base64,..."
    }
  }
}
```

**Key Features:**

- Embeds scene data in SVG exports for round-trip editing
- Uses compression (65-80% reduction) for embedded data
- Single-file format works for sharing and basic VCS
- JSON schema published for validation

**Relevance to Rackula:** Demonstrates embedded base64 can work for lightweight use cases.

### draw.io

**Format:** XML with optional compression
**Key Features:**

- Supports both compressed and uncompressed XML
- Configuration option: `compressXml=true/false`
- Uncompressed recommended for git repositories
- Can embed images as base64 or reference external files

**Relevance to Rackula:** User-configurable compression is a good middle ground.

### FreeCAD (.FCStd files)

**Format:** ZIP containing XML + binary BREP shapes
**Structure:**

```
project.FCStd (renamed .zip)
├── Document.xml        # Geometric/parametric definitions
├── GuiDocument.xml     # Visual properties (colors, etc.)
├── thumbnails/
│   └── Thumbnail.png   # 128x128 preview
├── Shape1.brp          # Binary B-rep geometry
└── templates/          # SVG templates
```

**Key Features:**

- XML for metadata, binary for geometry (unavoidable for CAD)
- Can embed arbitrary files via scripted properties
- GUI and data separation enables headless operation

### Krita (.kra files)

**Format:** ZIP containing XML metadata + binary layer data
**Key Features:**

- Based on ODF structure
- Layers stored as compressed binary (LZF algorithm)
- Also supports OpenRaster (.ora) - ZIP with PNG layers for interoperability
- Two-format approach: .kra (full fidelity), .ora (exchange format)

### Apple Bundles (.app, .xcodeproj)

**Format:** Folder that appears as single file in Finder
**Key Features:**

- macOS treats folders with specific extensions as "packages"
- Contents accessible via "Show Package Contents" or terminal
- Xcode .xcodeproj contains text-based project.pbxproj file
- Enables single-entity sharing while maintaining folder structure

**Relevance to Rackula:** Could use `.rackula/` folder that appears as single file on macOS.

## Format Patterns

### Pattern 1: ZIP with Structured Contents

**Examples:** ODF, OOXML, Sketch, Krita, FreeCAD

**Structure:**

```
file.ext (ZIP)
├── metadata.json/xml
├── content.json/xml
├── assets/
│   ├── image1.png
│   └── image2.png
└── previews/thumbnail.png
```

**Pros:**

- Single file for sharing (email, Discord, cloud storage)
- Efficient compression for large assets
- Well-understood pattern with extensive tooling
- Can include preview thumbnails

**Cons:**

- Git tracks as binary blob - no meaningful diffs
- Requires extraction to view/edit content
- Merge conflicts impossible to resolve manually

**When to Use:**

- Primary use case is sharing/distribution
- Binary assets dominate file size
- Version control is secondary concern

### Pattern 2: Plain Text with External Assets

**Examples:** Godot TSCN, KiCad, Obsidian/Logseq vaults

**Structure:**

```
project/
├── layout.yaml         # Main structured data
├── assets/
│   ├── image1.png
│   └── image2.png
└── .meta/              # Optional metadata
```

**Pros:**

- Full git diff/merge support for structured data
- Human-readable and editable without special tools
- Individual assets cacheable/trackable separately
- Works with any text editor

**Cons:**

- Multiple files to share (must zip for transfer)
- No single "file" to double-click and open
- Asset references can break if moved incorrectly

**When to Use:**

- Version control is primary use case
- Collaboration via git workflows
- Power users who edit files directly

### Pattern 3: Single File with Embedded Base64

**Examples:** Excalidraw, SVG with embedded images, Inkscape

**Structure:**

```yaml
# layout.yaml
metadata:
  name: "My Rack Layout"
devices:
  - id: server-1
    image: "data:image/png;base64,iVBORw0KGgo..."
```

**Pros:**

- Single file (easy sharing)
- Git-trackable (text-based)
- Human-readable structure
- No broken references

**Cons:**

- ~37% size increase from base64 encoding (33% theoretical, more in practice)
- Large images make diffs noisy
- File becomes unwieldy with many images
- Slower parsing/rendering

**When to Use:**

- Few/small images (icons, thumbnails)
- Simplicity valued over efficiency
- Images change infrequently

### Pattern 4: Dual Format Support

**Examples:** ODF (zip + flat), Godot (tscn + scn), Krita (kra + ora)

**Approach:**

- Primary format for typical use (often compressed/binary)
- Alternative format for special use cases (VCS, interchange)
- Application reads/writes both transparently

**Implementation Options:**

**Option A: File Extension Toggle**

- `.rackula` = ZIP format (sharing)
- `.rackula.yaml` = Flat YAML (VCS)

**Option B: Save Mode Toggle**

- "Save" vs "Save for Version Control"
- Same extension, different internal format

**Option C: Folder vs File**

- `.rackula/` folder = unpackaged (VCS)
- `.rackula` file = ZIP package (sharing)

**Pros:**

- Best of both worlds
- Users choose appropriate format for context
- Migration path between formats

**Cons:**

- Two formats to maintain/test
- Potential for format drift
- User education required

### Pattern 5: Folder-as-Package (macOS Bundle)

**Examples:** .app bundles, .xcodeproj, .playground

**Structure:**

```
layout.rackula/         # Folder with custom extension
├── Contents/
│   ├── layout.yaml
│   ├── images/
│   └── Info.plist      # Optional metadata
```

**Pros:**

- Appears as single file in macOS Finder
- Fully git-trackable
- Direct file access via terminal
- No zip/unzip overhead

**Cons:**

- macOS-specific behavior (Windows/Linux see folder)
- Must zip explicitly for sharing
- File managers may not hide folder structure

**When to Use:**

- Primary users are on macOS
- Git workflow is common
- Acceptable to zip for sharing

## Relevant Standards

### ISO 26300 - Open Document Format (ODF)

- International standard for office documents
- Defines ZIP structure, XML schemas, manifest format
- Well-documented package specification
- [OASIS ODF TC](https://www.oasis-open.org/committees/tc_home.php?wg_abbrev=office)

### ECMA-376 / ISO 29500 - Office Open XML (OOXML)

- Microsoft's office document standard
- Similar ZIP+XML approach to ODF
- More complex but widely deployed

### OpenRaster (.ora)

- Interchange format for layered raster images
- ZIP with PNG layers + XML metadata
- Designed for tool interoperability
- [OpenRaster Specification](https://www.freedesktop.org/wiki/Specifications/OpenRaster/)

### Data URI Scheme (RFC 2397)

- Standard for embedding binary data in URIs
- Format: `data:[<mediatype>][;base64],<data>`
- Size overhead: ~37% for base64 encoding
- With gzip compression, overhead reduced to ~5%

### Property List (PLIST)

- Apple's configuration format
- Supports XML, binary, and JSON representations
- `plutil` command converts between formats
- Model for "same data, multiple representations"

### Git Large File Storage (LFS)

- Extension for tracking large files in git
- Replaces large files with pointer files
- Actual content stored separately on LFS server
- Requires server support (GitHub, GitLab, etc.)

**LFS Considerations:**

- Adds setup complexity for users
- Requires compatible hosting
- Works well for binary assets that change rarely
- Pointer files enable meaningful diffs for text content

## External Resources

### Specifications & Documentation

- [Sketch File Format Specification](https://developer.sketch.com/file-format/)
- [ODF Package Format (ISO 26300-3)](https://www.loc.gov/preservation/digital/formats/fdd/fdd000425.shtml)
- [How ODT Files Are Structured](https://opensource.com/article/22/8/odt-files)
- [FreeCAD FCStd File Format](https://wiki.freecad.org/Fcstd_file_format)
- [Godot TSCN File Format](https://docs.godotengine.org/en/4.4/contributing/development/file_formats/tscn.html)
- [Excalidraw JSON Schema](https://docs.excalidraw.com/docs/codebase/json-schema)

### Tools & Libraries

- [sketch-file-format (npm)](https://github.com/sketch-hq/sketch-file-format) - JSON Schema for Sketch files
- [Git LFS Tutorial (Atlassian)](https://www.atlassian.com/git/tutorials/git-lfs)
- [draw.io Uncompressed XML](https://j2r2b.github.io/2019/08/01/drawio-decompressed-xml.html)

### Analysis & Best Practices

- [Base64 Encoding Overhead Analysis](https://lemire.me/blog/2019/01/30/what-is-the-space-overhead-of-base64-encoding/)
- [Data URIs Performance Impact](https://www.debugbear.com/blog/base64-data-urls-html-css)
- [Obsidian + Git Workflow](https://itsfoss.com/git-with-obsidian/)
- [Logseq Git Sync Guide](https://hub.logseq.com/integrations/aV9AgETypcPcf8avYcHXQT/logseq-sync-with-git-and-github/krMyU6jSEN8jG2Yjvifu9i)

### Related Discussions

- [Figma File Format Discussion](https://forum.figma.com/t/figma-file-format/84126)
- [FreeCAD New File Formats Discussion](https://github.com/FreeCAD/FreeCAD/discussions/18532)
- [Godot Text Format Decision](https://github.com/godotengine/godot/issues/3996)

## Summary for Rackula

Based on this research, the key considerations for Rackula's file format are:

1. **Current State:** ZIP-based format (.rackula) is good for sharing but poor for VCS
2. **User Needs:** Power users want git-trackable files; casual users want single-file sharing
3. **Image Reality:** Most Rackula layouts likely have few/no custom images

**Recommended Investigation:**

- Analyze actual image usage in existing layouts
- If images are rare/small, Pattern 3 (embedded base64) could work
- If images are common/large, Pattern 4 (dual format) is likely necessary
- Consider Pattern 5 (folder-as-package) for macOS-primary users

**Next Steps:**

- Survey users about current image usage
- Prototype each pattern with representative layouts
- Measure file sizes and diff quality
- Document migration path from current ZIP format
