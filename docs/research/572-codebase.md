# Spike #572: Codebase Exploration

## Files Examined

- `src/lib/utils/archive.ts`: Main ZIP archive handling (createFolderArchive, extractFolderArchive, downloadArchive)
- `src/lib/utils/yaml.ts`: YAML serialization/deserialization for layout data
- `src/lib/utils/file.ts`: File picker and text reading utilities
- `src/lib/utils/export.ts`: Export functionality (SVG, PNG, JPEG, PDF, CSV)
- `src/lib/utils/imageUpload.ts`: Image validation, resizing, and data URL conversion
- `src/lib/stores/layout.svelte.ts`: Store functions for loadLayout
- `src/App.svelte`: Main component that calls downloadArchive
- `src/lib/types/constants.ts`: Constants (image sizes, formats)
- `e2e/export.spec.ts`: Export tests showing usage patterns

## Current Implementation

The `.rackula` file is a **ZIP archive** with a folder-based internal structure:

```
[layout-name]/
  ├── [layout-name].yaml      # Layout data in YAML format
  └── assets/
      ├── [device-slug-1]/
      │   ├── front.png
      │   └── rear.webp
      └── [device-type-2]/
          └── front.jpg
```

### Save Flow

1. `downloadArchive(layout, images)` called from App.svelte
2. Layout serialized to YAML using js-yaml
3. Images converted from data URLs to blobs
4. JSZip creates folder structure and bundles everything
5. Archive downloaded as `[layout-name].Rackula.zip`

### Load Flow

1. User selects .rackula file via file picker
2. `extractFolderArchive()` uses JSZip to extract contents
3. YAML parsed back to layout object
4. Images converted to data URLs for in-memory storage
5. Returns `{layout, images, failedImages}` tuple
6. `loadLayout()` in store applies the extracted data

## Image Handling

| Aspect        | Details                                                             |
| ------------- | ------------------------------------------------------------------- |
| **Formats**   | PNG, JPEG, WebP                                                     |
| **Max size**  | 5 MB per image                                                      |
| **Storage**   | Only user-uploaded images saved; bundled device images not included |
| **Paths**     | `assets/[device-slug]/[face].[ext]` for device types                |
| **In-memory** | Stored as data URLs (base64 encoded)                                |
| **Archive**   | Converted to blobs when saving to ZIP                               |

### Typical Image Sizes (estimated)

- Device images: 50-500 KB each (depends on resolution and compression)
- Typical layout: 0-10 custom images
- Worst case: Could be several MB if many high-res custom images

## Integration Points

| Component          | Dependency                                                        |
| ------------------ | ----------------------------------------------------------------- |
| `layout.svelte.ts` | Consumes extracted layout via `loadLayout()`                      |
| `imageStore`       | Provides images for save, receives images on load                 |
| `App.svelte`       | Triggers save via toolbar/keyboard shortcut                       |
| Export functions   | Independent (SVG, PNG, PDF, CSV exports don't use archive format) |
| Schema validation  | Layout YAML validated against LayoutSchema on load                |

## Constraints

### Libraries

- **JSZip** (v3.10.1): Dynamically imported to reduce bundle size
- **js-yaml** (v4.1.1): Dynamically imported for YAML serialization

### Browser APIs Required

- `File` and `FileReader` for file reading
- `Blob` for binary data handling
- `URL.createObjectURL` for download triggers
- No server-side processing; all operations run in browser

### Technical Limitations

- ZIP is treated as binary by git (no meaningful diffs)
- Archive must be extracted to view/edit YAML
- No streaming support (entire archive loaded into memory)
- Browser-only; no Node.js/CLI access without modifications

### Migration Considerations

- Current folder structure within ZIP maps well to a flat file approach
- Image paths already use predictable slugified names
- YAML format is stable and human-readable
- Schema validation already in place for load-time checks
