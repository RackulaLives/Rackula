# Rackula Brand Assets

Canonical brand assets for the Rackula project.

## Logo Mark

The Rackula logo mark is a **widow's-peak rack frame** with three device slots, representing a server rack. The design follows Geismar-style geometric minimalism.

### Canonical Source

`logo-mark.svg` — 32x32 viewBox, clean paths, the source for all derivatives.

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

All raster assets are generated from the canonical SVGs using standard tools:

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

## Logo Path

The canonical SVG path for the logo mark:

```svg
<path d="M6 4L13 4L16 7L19 4L26 4L26 28L6 28ZM10 9h12v4H10zM10 15h12v4H10zM10 21h12v4H10z" fill-rule="evenodd"/>
```

## Design Specifications

- **ViewBox:** 0 0 32 32
- **Fill Rule:** evenodd (for correct cutout rendering)
- **Minimum Size:** 16×16 (below this, slots become indistinct)
- **Clear Space:** 25% of width around logo
- **Border Radius:** None (Geismar sharp aesthetic)

---

See also: [`docs/reference/BRAND.md`](../../docs/reference/BRAND.md) for the complete design system.
