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
<path d="M5 0L12 0L16 6L20 0L27 0L27 32L5 32Z"/>  <!-- Frame with fangs -->
<rect x="8" y="7" width="16" height="5"/>          <!-- Slot 1 -->
<rect x="8" y="15" width="16" height="5"/>         <!-- Slot 2 -->
<rect x="8" y="23" width="16" height="5"/>         <!-- Slot 3 -->
```

### Colour Variants

| File                       | Colour         | Hex       | Usage                        |
| -------------------------- | -------------- | --------- | ---------------------------- |
| `logo-mark.svg`            | Dracula Purple | `#BD93F9` | Default/canonical            |
| `logo-mark-alucard.svg`    | Alucard Purple | `#644AC9` | Light theme                  |
| `logo-mark-mono-black.svg` | Black          | `#000000` | For light backgrounds        |
| `logo-mark-mono-white.svg` | White          | `#FFFFFF` | For dark backgrounds         |

## Favicons

### ICO (Multi-resolution)

`favicon.ico` contains six sizes for browser compatibility:

- 16×16 (browser tabs)
- 32×32 (browser tabs @2x)
- 48×48 (Windows taskbar)
- 64×64 (Windows icons)
- 128×128 (High-DPI icons)
- 256×256 (Windows high-DPI)

### PNG Assets

| File                 | Size    | Usage                   |
| -------------------- | ------- | ----------------------- |
| `logo-mark-16.png`   | 16×16   | Standard browser tabs   |
| `logo-mark-32.png`   | 32×32   | Retina browser tabs     |
| `logo-mark-48.png`   | 48×48   | Windows taskbar         |
| `logo-mark-64.png`   | 64×64   | Small app icons         |
| `logo-mark-128.png`  | 128×128 | App icons               |
| `logo-mark-192.png`  | 192×192 | Android home screen     |
| `logo-mark-256.png`  | 256×256 | High-resolution icons   |
| `logo-mark-512.png`  | 512×512 | App store / marketing   |

## Apple Touch Icon

`apple-touch-icon.png` — 180×180 with Dracula background (`#282A36`).

Used for iOS "Add to Home Screen" and Safari bookmarks. iOS automatically applies rounded corners.

## Regenerating Assets

All raster assets are generated from the canonical SVGs:

```bash
# PNG from SVG (using rsvg-convert)
for size in 16 32 48 64 128 192 256 512; do
  rsvg-convert -w $size -h $size logo-mark.svg > "logo-mark-${size}.png"
done

# ICO from PNGs (using ImageMagick 7+)
magick logo-mark-16.png logo-mark-32.png logo-mark-48.png \
       logo-mark-64.png logo-mark-128.png logo-mark-256.png favicon.ico

# Apple Touch Icon (180x180 with background)
# Edit apple-touch-icon source SVG, then:
rsvg-convert -w 180 -h 180 apple-touch-icon.svg -o apple-touch-icon.png
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
- **Content bounds:** x: 5-27, y: 0-32 (22×32 actual content)
- **Fang depth:** 6 units from top edge (tip at y=6)
- **Fang span:** 8 units total (shoulders at x=12 and x=20, center at x=16)
- **Slot height:** 5 units
- **Slot gaps:** 3 units between slots
- **Top margin:** 1 unit (fang tip to first slot)
- **Bottom margin:** 4 units (last slot to frame bottom)
- **Minimum size:** 16×16 (below this, slots become indistinct)
- **Clear space:** 25% of width around logo
- **Border radius:** None (sharp geometric aesthetic)

---

See also: [`docs/reference/BRAND.md`](../../docs/reference/BRAND.md) for the complete design system.
