# Rackula Brand Assets

Canonical brand assets for the Rackula project.

## Logo Mark

The Rackula logo mark is a **rack frame with vampire fangs** - two triangular points extending downward from the top edge, with three horizontal device slots inside. The design represents a server rack with a Dracula-inspired twist.

### Design Origin

The canonical design comes from `assets/rackula-icon-dark.svg` (512x512 app icon). The 32x32 versions here are scaled from that source while maintaining visual clarity at small sizes.

### Key Features

- **Fangs**: Two triangular points extending **downward** from the top edge
- **Device slots**: Three thin horizontal lines representing rack unit spaces
- **Clean geometry**: Geismar-style minimalism

### Canonical Source

`logo-mark.svg` — 32x32 viewBox, the source for all derivatives.

Path geometry:

```svg
<path d="M7 0L14 0L16 3L19 0L26 0L26 32L7 32Z"/>  <!-- Frame with fangs -->
<rect x="9" y="7" width="15" height="3"/>          <!-- Slot 1 -->
<rect x="9" y="14" width="15" height="3"/>         <!-- Slot 2 -->
<rect x="9" y="21" width="15" height="3"/>         <!-- Slot 3 -->
```

### Colour Variants

| File                  | Colour         | Hex       | Usage                     |
| --------------------- | -------------- | --------- | ------------------------- |
| `logo-mark.svg`       | Dracula Purple | `#BD93F9` | Default/canonical         |
| `logo-mark-dark.svg`  | Dracula Purple | `#BD93F9` | Dark theme                |
| `logo-mark-light.svg` | Alucard Purple | `#644AC9` | Light theme               |
| `logo-mark-mono.svg`  | currentColor   | —         | CSS-controlled, versatile |

## Favicons

### ICO (Multi-resolution)

`favicon.ico` contains four sizes for browser compatibility:

- 16×16 (browser tabs)
- 32×32 (browser tabs @2x)
- 48×48 (Windows taskbar)
- 256×256 (Windows high-DPI)

### PNG Favicons

| File             | Size  | Usage               |
| ---------------- | ----- | ------------------- |
| `favicon-16.png` | 16×16 | Standard browser    |
| `favicon-32.png` | 32×32 | Retina browser tabs |
| `favicon-48.png` | 48×48 | Windows taskbar     |

## Icons (Larger Sizes)

| File           | Size    | Usage                 |
| -------------- | ------- | --------------------- |
| `icon-64.png`  | 64×64   | Small app icons       |
| `icon-128.png` | 128×128 | App icons             |
| `icon-256.png` | 256×256 | High-resolution icons |
| `icon-512.png` | 512×512 | App store / marketing |

## Apple Touch Icon

`apple-touch-icon.png` — 180×180 with Dracula background (`#282A36`).

Used for iOS "Add to Home Screen" and Safari bookmarks. iOS automatically applies rounded corners.

## Regenerating Assets

All raster assets are generated from the canonical SVGs:

```bash
# PNG from SVG (using rsvg-convert)
rsvg-convert -w 256 -h 256 logo-mark-dark.svg -o icon-256.png

# ICO from PNGs (using ImageMagick)
magick favicon-16.png favicon-32.png favicon-48.png icon-256.png favicon.ico

# Apple Touch Icon (from source SVG with background)
rsvg-convert -w 180 -h 180 apple-touch-icon-source.svg -o apple-touch-icon.png
```

## Colour Reference

| Name           | Hex       | RGB                | Usage             |
| -------------- | --------- | ------------------ | ----------------- |
| Dracula Purple | `#BD93F9` | rgb(189, 147, 249) | Dark theme brand  |
| Alucard Purple | `#644AC9` | rgb(100, 74, 201)  | Light theme brand |
| Dracula BG     | `#282A36` | rgb(40, 42, 54)    | Dark backgrounds  |
| Alucard BG     | `#FFFBEB` | rgb(255, 251, 235) | Light backgrounds |

## Design Specifications

- **ViewBox:** 0 0 32 32
- **Content bounds:** x: 7-26, y: 0-32 (19×32 actual content)
- **Fang depth:** 3 units from top edge
- **Slot height:** 3 units (optimized for small size clarity)
- **Minimum size:** 16×16 (below this, slots become indistinct)
- **Clear space:** 25% of width around logo
- **Border radius:** None (sharp geometric aesthetic)

---

See also: [`docs/reference/BRAND.md`](../../docs/reference/BRAND.md) for the complete design system.
