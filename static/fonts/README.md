# Rackula Fonts

Self-hosted fonts for the Dracula/Alucard design system.

## Required Font Files

### Space Grotesk (Display - Logo Wordmark)

| File                        | Weight | Usage         |
| --------------------------- | ------ | ------------- |
| `SpaceGrotesk-Medium.woff2` | 500    | Logo wordmark |

**Download Source:** https://github.com/floriankarsten/space-grotesk
**License:** SIL Open Font License v1.1 (see `OFL-SpaceGrotesk.txt`)

### JetBrains Mono (Monospace - UI/Headings)

| File                           | Weight | Usage       |
| ------------------------------ | ------ | ----------- |
| `JetBrainsMono-Regular.woff2`  | 400    | Body text   |
| `JetBrainsMono-Medium.woff2`   | 500    | Labels      |
| `JetBrainsMono-SemiBold.woff2` | 600    | Subheadings |
| `JetBrainsMono-Bold.woff2`     | 700    | Headings    |

**Download Source:** https://github.com/JetBrains/JetBrainsMono/releases

### Inter (Sans-serif - Body Text)

| File                   | Weight | Usage           |
| ---------------------- | ------ | --------------- |
| `Inter-Regular.woff2`  | 400    | Body text       |
| `Inter-Medium.woff2`   | 500    | Emphasized text |
| `Inter-SemiBold.woff2` | 600    | Subheadings     |
| `Inter-Bold.woff2`     | 700    | Headings        |

**Download Source:** https://rsms.me/inter/ or https://fonts.google.com/specimen/Inter

## Installation

1. Download the `.woff2` files from the sources above
2. Place them in this directory (`static/fonts/`)
3. Ensure file names match exactly as listed above

## File Naming Convention

- Use exact weight names: `Regular`, `Medium`, `SemiBold`, `Bold`
- Use `.woff2` format only (best compression + browser support)
- No spaces in file names

## Verification

After adding fonts, run `npm run dev` and check the browser console for any 404 errors on font files.

## Fallback Behaviour

If fonts are missing, the app falls back to system fonts:

- JetBrains Mono -> SF Mono, Consolas, monospace
- Inter -> system-ui, -apple-system, sans-serif
