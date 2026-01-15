# Rackula Brand & Design System

**Version:** 0.6.0
**Last Updated:** 2025-12-15
**Source:** Derived from `01-PROJECTS/Rackula/brand-guide.md` with accessibility improvements

---

## Design Philosophy

**Geismar-style geometric minimalism** — strip to pure geometry, timeless, works at any size. No tricks, no hidden meanings, just honest form.

The visual identity is rooted in the **Dracula colour scheme** but adapted for data visualisation needs. Dracula accents are reserved for small UI elements; muted variants are used for large fills.

---

## Conventions

**Spelling:** Use British/Canadian English throughout:

- `colour` not `color`
- `grey` not `gray`
- `centre` not `center`
- `organisation` not `organization`
- `visualisation` not `visualization`

CSS custom properties use `--colour-*` prefix for consistency with the codebase.

---

## Colour System Overview

Rackula uses a **three-tier colour hierarchy**:

| Tier                | Purpose              | Saturation  | Example Use                            |
| ------------------- | -------------------- | ----------- | -------------------------------------- |
| **Dracula Accents** | Small UI highlights  | High (neon) | Focus rings, icons, links, button text |
| **Muted Variants**  | Large area fills     | Medium      | Device backgrounds, charts, data viz   |
| **Neutral/Comment** | Backgrounds, passive | Low         | Surfaces, borders, muted text          |

**Rule:** Never use Dracula accents (`#8BE9FD`, `#50FA7B`, etc.) as backgrounds for text. They're designed for syntax highlighting, not fills.

---

## Core Palette: Dracula (Dark Theme)

### Backgrounds

| Token                 | Hex       | Usage                                 |
| --------------------- | --------- | ------------------------------------- |
| `--colour-bg-darkest` | `#191A21` | Canvas, deepest background            |
| `--colour-bg-darker`  | `#21222C` | Page background, sidebars             |
| `--colour-bg`         | `#282A36` | Card/panel background                 |
| `--colour-bg-light`   | `#343746` | Elevated surfaces                     |
| `--colour-bg-lighter` | `#424450` | Hover states                          |
| `--colour-selection`  | `#44475A` | Selection highlight (background only) |

### Text

| Token                    | Hex       | Contrast | Usage                            |
| ------------------------ | --------- | -------- | -------------------------------- |
| `--colour-text`          | `#F8F8F2` | 11.6:1   | Primary text                     |
| `--colour-text-muted`    | `#9A9A9A` | 5.1:1    | Secondary text (WCAG AA)         |
| `--colour-text-disabled` | `#6272A4` | 3.3:1    | Disabled only (exempt from WCAG) |

**Note:** Original Dracula comment (`#6272A4`) fails WCAG AA at 3.3:1. Use `#9A9A9A` for muted text that must be readable.

### Accent Colours (Small UI Only)

| Token             | Hex       | Usage                                          |
| ----------------- | --------- | ---------------------------------------------- |
| `--colour-cyan`   | `#8BE9FD` | Links, info icons, primary CTAs                |
| `--colour-purple` | `#BD93F9` | Network devices (data only)                    |
| `--colour-pink`   | `#FF79C6` | **Selection, focus rings, interactive states** |
| `--colour-green`  | `#50FA7B` | Success icons, valid states                    |
| `--colour-orange` | `#FFB86C` | Warning icons                                  |
| `--colour-red`    | `#FF5555` | Error icons, destructive actions               |
| `--colour-yellow` | `#F1FA8C` | Caution highlights                             |

### Semantic Tokens

```css
:root {
	/* Interactive (changed: selection now uses pink) */
	--colour-selection: var(--colour-pink);
	--colour-focus-ring: var(--colour-pink);
	--colour-link: var(--colour-cyan);
	--colour-link-hover: var(--colour-pink);

	/* Feedback */
	--colour-success: var(--colour-green);
	--colour-warning: var(--colour-orange);
	--colour-error: var(--colour-red);
	--colour-info: var(--colour-cyan);
}
```

---

## Device Visualization Palette (Muted Dracula)

For device backgrounds and data visualization, use these muted variants. They maintain Dracula hue identity but are darkened/desaturated for:

- WCAG AA contrast with white text (4.5:1 minimum)
- Reduced visual fatigue at scale
- Professional appearance

### Active Device Categories

| Category   | Muted Colour | Original  | Contrast | Rationale                              |
| ---------- | ------------ | --------- | -------- | -------------------------------------- |
| `server`   | `#4A7A8A`    | `#8BE9FD` | 4.8:1    | Core infrastructure — teal/cyan family |
| `network`  | `#7B6BA8`    | `#BD93F9` | 4.6:1    | Primary accent — purple family         |
| `storage`  | `#3D7A4A`    | `#50FA7B` | 5.2:1    | Data/growth — green family             |
| `power`    | `#A84A4A`    | `#FF5555` | 5.1:1    | Critical/energy — red family           |
| `kvm`      | `#A87A4A`    | `#FFB86C` | 4.5:1    | Control/interactive — orange family    |
| `av-media` | `#A85A7A`    | `#FF79C6` | 4.7:1    | Media/entertainment — pink family      |
| `cooling`  | `#8A8A4A`    | `#F1FA8C` | 4.6:1    | Environmental — yellow/olive family    |

### Passive Device Categories

| Category           | Colour    | Contrast | Rationale                       |
| ------------------ | --------- | -------- | ------------------------------- |
| `shelf`            | `#6272A4` | 5.7:1    | Utility — fades into background |
| `blank`            | `#44475A` | 8.2:1    | Empty space — nearly invisible  |
| `cable-management` | `#6272A4` | 5.7:1    | Utility                         |
| `patch-panel`      | `#6272A4` | 5.7:1    | Passive infrastructure          |
| `other`            | `#6272A4` | 5.7:1    | Generic fallback                |

### Implementation

```typescript
// src/lib/types/constants.ts
export const CATEGORY_COLOURS: Record<DeviceCategory, string> = {
	// Active — Muted Dracula
	server: '#4A7A8A',
	network: '#7B6BA8',
	storage: '#3D7A4A',
	power: '#A84A4A',
	kvm: '#A87A4A',
	'av-media': '#A85A7A',
	cooling: '#8A8A4A',

	// Passive — Comment/Selection tones
	shelf: '#6272A4',
	blank: '#44475A',
	'cable-management': '#6272A4',
	'patch-panel': '#6272A4',
	other: '#6272A4'
} as const;
```

### HSL Derivation Method

To create muted variants from Dracula accents:

1. Extract HSL: `#8BE9FD` → `hsl(187, 95%, 77%)`
2. Reduce saturation to 25-35%
3. Reduce lightness to 38-45%
4. Verify contrast ≥ 4.5:1 against `#FAFAFA`
5. Result: `hsl(187, 30%, 42%)` → `#4A7A8A`

---

## Core Palette: Alucard (Light Theme)

### Backgrounds

| Token                 | Hex       | Usage                   |
| --------------------- | --------- | ----------------------- |
| `--colour-bg-darkest` | `#BCBAB3` | Deepest (inverted)      |
| `--colour-bg-darker`  | `#CECCC0` | Page background         |
| `--colour-bg`         | `#FFFBEB` | Card/panel — warm cream |
| `--colour-bg-light`   | `#DEDCCF` | Elevated surfaces       |
| `--colour-bg-lighter` | `#ECE9DF` | Hover states            |
| `--colour-floating`   | `#EFEDDC` | Floating elements       |
| `--colour-selection`  | `#CFCFDE` | Selection background    |

### Text

| Token                    | Hex       | Contrast | Usage                    |
| ------------------------ | --------- | -------- | ------------------------ |
| `--colour-text`          | `#1F1F1F` | 18.5:1   | Primary text             |
| `--colour-text-muted`    | `#5C5647` | 6.8:1    | Secondary text (WCAG AA) |
| `--colour-text-disabled` | `#6C664B` | 5.0:1    | Disabled/hint text       |

### Accent Colours (Alucard variants)

| Token             | Hex       | Usage            |
| ----------------- | --------- | ---------------- |
| `--colour-cyan`   | `#036A96` | Links, info      |
| `--colour-purple` | `#644AC9` | Network devices  |
| `--colour-pink`   | `#A3144D` | Selection, focus |
| `--colour-green`  | `#14710A` | Success          |
| `--colour-orange` | `#A34D14` | Warnings         |
| `--colour-red`    | `#CB3A2A` | Errors           |
| `--colour-yellow` | `#846E15` | Caution          |

### Device Colours (Light Theme)

| Category   | Light Colour | Contrast |
| ---------- | ------------ | -------- |
| `server`   | `#5A8A9A`    | 4.6:1    |
| `network`  | `#8B7BB8`    | 4.5:1    |
| `storage`  | `#4D8A5A`    | 4.8:1    |
| `power`    | `#B85A5A`    | 4.7:1    |
| `kvm`      | `#B88A5A`    | 4.5:1    |
| `av-media` | `#B86A8A`    | 4.6:1    |
| `cooling`  | `#9A9A5A`    | 4.5:1    |

---

## Colour Usage Rules (Strict Hierarchy)

### When to Use Each Tier

| Element                 | Colour Tier             | Examples                     |
| ----------------------- | ----------------------- | ---------------------------- |
| Focus rings, outlines   | Dracula Accent (Pink)   | Button focus, input focus    |
| Icons (16-24px)         | Dracula Accent          | Category icons, action icons |
| Links, interactive text | Dracula Accent (Cyan)   | Hyperlinks, clickable text   |
| Button backgrounds      | Dracula Accent (subtle) | Primary buttons only         |
| Device fills            | **Muted Variant**       | RackDevice backgrounds       |
| Chart areas             | **Muted Variant**       | Data visualization           |
| Toast/badge backgrounds | Muted or Functional     | Feedback states              |
| Page backgrounds        | Neutral                 | Sidebar, canvas, panels      |
| Borders                 | Neutral (Selection)     | Card borders, dividers       |
| Disabled states         | Comment                 | Disabled buttons, inputs     |

### Decision Tree

```
Is the coloured area > 100px²?
├── YES → Use Muted Variant or Neutral
│         (Device fills, chart areas, backgrounds)
└── NO  → Is it interactive?
          ├── YES → Use Dracula Accent
          │         (Focus rings, icons, links)
          └── NO  → Use Neutral/Comment
                    (Decorative, disabled)
```

### Examples

| Scenario                 | Correct                 | Incorrect                          |
| ------------------------ | ----------------------- | ---------------------------------- |
| Server device (2U block) | `#4A7A8A` (muted)       | `#8BE9FD` (too bright)             |
| Category icon (16px)     | `#8BE9FD` (accent)      | `#4A7A8A` (too dull)               |
| Selected device outline  | `#FF79C6` (pink)        | `#BD93F9` (conflicts with network) |
| Success toast            | `#3D7A4A` (muted green) | `#50FA7B` (too bright)             |
| Link text                | `#8BE9FD` (cyan)        | `#4A7A8A` (not prominent enough)   |

---

## Typography

### Font Stack

```css
:root {
	--font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
	--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}
```

### Type Scale

| Token              | Size | Usage                   |
| ------------------ | ---- | ----------------------- |
| `--font-size-2xs`  | 10px | Rack U labels           |
| `--font-size-xs`   | 11px | Device labels, captions |
| `--font-size-sm`   | 13px | Secondary text, buttons |
| `--font-size-base` | 14px | Body text               |
| `--font-size-md`   | 16px | Section headers         |
| `--font-size-lg`   | 18px | Page headers            |
| `--font-size-xl`   | 20px | Dialog titles           |
| `--font-size-2xl`  | 24px | Hero text               |

### Font Weights

| Weight   | Value | Usage                |
| -------- | ----- | -------------------- |
| Normal   | 400   | Body text            |
| Medium   | 500   | UI labels, buttons   |
| Semibold | 600   | Headers              |
| Bold     | 700   | Brand name, emphasis |

---

## Spacing System

### Base Unit: 4px

| Token       | Value | Usage                         |
| ----------- | ----- | ----------------------------- |
| `--space-1` | 4px   | Tight gaps, icon padding      |
| `--space-2` | 8px   | Button padding, input padding |
| `--space-3` | 12px  | Card padding                  |
| `--space-4` | 16px  | Section gaps                  |
| `--space-5` | 20px  | Large gaps                    |
| `--space-6` | 24px  | Section margins               |
| `--space-8` | 32px  | Page margins                  |

---

## Border & Radius

### Border Radius

| Token           | Value  | Usage                             |
| --------------- | ------ | --------------------------------- |
| `--radius-none` | 0      | Logo mark (Geismar sharp)         |
| `--radius-sm`   | 4px    | Device rectangles, small elements |
| `--radius-md`   | 6px    | Buttons, inputs, cards            |
| `--radius-lg`   | 8px    | Dialogs, panels                   |
| `--radius-full` | 9999px | Pills, avatars                    |

**Note:** Consider `--radius-sm` (4px) for most UI to align with Geismar's sharp aesthetic.

---

## Shadows & Glow

### Glow Effects (Dark Theme)

```css
:root {
	--glow-pink-sm: 0 0 12px rgba(255, 121, 198, 0.3);
	--glow-pink-md: 0 0 20px rgba(255, 121, 198, 0.3);
	--glow-cyan-sm: 0 0 12px rgba(139, 233, 253, 0.3);
	--glow-green-sm: 0 0 12px rgba(80, 250, 123, 0.3);
}
```

### Focus Ring

```css
:root {
	--focus-ring: 0 0 0 2px var(--colour-bg), 0 0 0 4px var(--colour-pink), var(--glow-pink-sm);
}
```

---

## Z-Index Layers

| Token                 | Value | Usage                       |
| --------------------- | ----- | --------------------------- |
| `--z-sidebar`         | 10    | Fixed sidebars              |
| `--z-drawer-backdrop` | 99    | Drawer overlay              |
| `--z-drawer`          | 100   | Slide-out drawers           |
| `--z-modal`           | 200   | Dialog overlays             |
| `--z-toast`           | 300   | Toast notifications         |
| `--z-tooltip`         | 400   | Tooltips (above everything) |

---

## Animation

### Timing

| Token               | Value | Usage                        |
| ------------------- | ----- | ---------------------------- |
| `--duration-fast`   | 100ms | Hover states, colour changes |
| `--duration-normal` | 200ms | Transitions, drawer slides   |
| `--duration-slow`   | 300ms | Dialog animations            |

### Easing

| Token           | Value                                     | Usage               |
| --------------- | ----------------------------------------- | ------------------- |
| `--ease-out`    | `cubic-bezier(0, 0, 0.2, 1)`              | Exit animations     |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)`            | General transitions |
| `--ease-spring` | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | Playful bounces     |

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
	*,
	*::before,
	*::after {
		animation-duration: 0.01ms !important;
		transition-duration: 0.01ms !important;
	}
}
```

### Semantic Animation Tokens

For complex, celebratory, or loading animations that extend beyond simple UI transitions:

| Token                   | Value | Usage                       |
| ----------------------- | ----- | --------------------------- |
| `--anim-breathe`        | 4s    | Slow breathing pulse (rest) |
| `--anim-rainbow`        | 6s    | Rainbow wave celebration    |
| `--anim-loading`        | 2s    | Slot reveal loading cycle   |
| `--anim-shimmer`        | 2s    | Light sweep effect          |
| `--anim-party`          | 0.5s  | Party mode colour cycle     |
| `--anim-party-duration` | 5s    | Total party mode time       |

```css
:root {
	/* Semantic animation durations */
	--anim-breathe: 4s;
	--anim-rainbow: 6s;
	--anim-loading: 2s;
	--anim-shimmer: 2s;
	--anim-party: 0.5s;
	--anim-party-duration: 5s;
}
```

### Animation Types

| Name          | Token            | Duration   | Colours                  | Trigger             |
| ------------- | ---------------- | ---------- | ------------------------ | ------------------- |
| Breathe       | `--anim-breathe` | 4s cycle   | Purple glow              | Logo at rest        |
| Rainbow Wave  | `--anim-rainbow` | 6s cycle   | Full Dracula (7 accents) | Success actions     |
| Loading State | `--anim-loading` | 2s cycle   | Purple + BG              | Export dialog       |
| Shimmer       | `--anim-shimmer` | 2s sweep   | White highlight          | Preview placeholder |
| Party Mode    | `--anim-party`   | 0.5s cycle | Full Dracula             | Konami code         |

### Animation UX Applications

| Animation     | Location       | Behaviour                                         |
| ------------- | -------------- | ------------------------------------------------- |
| Breathe       | LogoLockup     | Slow glow pulse at rest (4s cycle)                |
| Loading State | Export dialog  | Logo with slot reveal during export generation    |
| Shimmer       | Export preview | Light sweep while preview renders                 |
| Rainbow Wave  | LogoLockup     | 3s celebration on export/save/load success        |
| Toast Glow    | Success toasts | Green glow pulse on appear                        |
| Party Mode    | Logo + racks   | 5s fast rainbow + wobble (easter egg)             |
| Drag Feedback | RackDevice     | Scale 1.02 on pickup, drop shadow, settle on drop |

### Rainbow Wave Gradient

The rainbow wave uses all Dracula accent colours in a cycling gradient:

```css
/* SVG SMIL animation — 6s infinite cycle */
<linearGradient id="rainbow-wave">
	<stop offset="0%">
		<animate
			attributeName="stop-color"
			values="#BD93F9;#FF79C6;#8BE9FD;#50FA7B;#FFB86C;#FF5555;#F1FA8C;#BD93F9"
			dur="6s"
			repeatCount="indefinite"
		/>
	</stop>
	<!-- Additional stops at 50% and 100% with offset values -->
</linearGradient>
```

### Party Mode Easter Egg

| Property      | Value                                                       |
| ------------- | ----------------------------------------------------------- |
| Trigger       | Konami code (↑↑↓↓←→←→BA)                                    |
| Scope         | Toolbar logo + rack frames                                  |
| Duration      | 5 seconds, auto-disable                                     |
| Effect        | Fast rainbow cycle (0.5s) + wobble                          |
| Accessibility | Respects `prefers-reduced-motion`, explicit activation only |

---

## Logo Mark

The Rackula logo mark is a **rack frame with vampire fangs** — two triangular points extending downward from the top edge, with three horizontal device slots inside.

### Design

```svg
<!-- Canonical 32x32 logo mark -->
<path d="M5 0L12 0L16 6L20 0L27 0L27 32L5 32Z"/>  <!-- Frame with fangs -->
<rect x="8" y="7" width="16" height="5"/>          <!-- Slot 1 -->
<rect x="8" y="15" width="16" height="5"/>         <!-- Slot 2 -->
<rect x="8" y="23" width="16" height="5"/>         <!-- Slot 3 -->
```

### Specifications

| Property        | Value                      |
| --------------- | -------------------------- |
| ViewBox         | `0 0 32 32`                |
| Content bounds  | x: 5-27, y: 0-32 (22×32)   |
| Frame           | Sharp corners (radius: 0)  |
| Fang depth      | 6 units (tip at y=6)       |
| Fang span       | 8 units total (shoulders at x=12,20, center at x=16) |
| Slot height     | 5 units                    |
| Slot gaps       | 3 units between slots      |
| Top margin      | 1 unit (fang to slot)      |
| Bottom margin   | 4 units (slot to frame)    |
| Colour (dark)   | `#BD93F9` (Dracula purple) |
| Colour (light)  | `#644AC9` (Alucard purple) |
| Minimum size    | 16x16px                    |
| Clear space     | 25% of width               |

### Colour Variants

| File                              | Colour         | Hex       | Usage                |
| --------------------------------- | -------------- | --------- | -------------------- |
| `static/brand/logo-mark.svg`      | Dracula Purple | `#BD93F9` | Default/canonical    |
| `static/brand/logo-mark-alucard.svg` | Alucard Purple | `#644AC9` | Light theme          |
| `static/brand/logo-mark-mono-black.svg` | Black     | `#000000` | Light backgrounds    |
| `static/brand/logo-mark-mono-white.svg` | White     | `#FFFFFF` | Dark backgrounds     |

### Raster Assets

| File                          | Size    | Usage                 |
| ----------------------------- | ------- | --------------------- |
| `static/brand/logo-mark-16.png`  | 16×16   | Browser tabs          |
| `static/brand/logo-mark-32.png`  | 32×32   | Retina tabs           |
| `static/brand/logo-mark-48.png`  | 48×48   | Windows taskbar       |
| `static/brand/logo-mark-64.png`  | 64×64   | Small icons           |
| `static/brand/logo-mark-128.png` | 128×128 | App icons             |
| `static/brand/logo-mark-192.png` | 192×192 | Android home screen   |
| `static/brand/logo-mark-256.png` | 256×256 | High-res icons        |
| `static/brand/logo-mark-512.png` | 512×512 | App store / marketing |
| `static/brand/favicon.ico`       | Multi   | 16-256px ICO bundle   |
| `static/brand/apple-touch-icon.png` | 180×180 | iOS home screen    |

### Files (Root)

| File                        | Usage                        |
| --------------------------- | ---------------------------- |
| `/static/favicon.svg`       | Dark mode favicon            |
| `/static/favicon-light.svg` | Light mode favicon           |
| `/static/favicon.ico`       | Multi-size ICO (copy)        |
| `/static/apple-touch-icon.png` | iOS Add to Home Screen    |

---

## Logo Lockup

The logo lockup combines the logo mark with the "Rackula" wordmark as a unified branding element.

### Component

**File:** `src/lib/components/LogoLockup.svelte`

### Props

| Prop   | Type     | Default | Description                       |
| ------ | -------- | ------- | --------------------------------- |
| `size` | `number` | 36      | Height of the logo mark in pixels |

### Behaviour

| State          | Appearance                                  |
| -------------- | ------------------------------------------- |
| Rest           | Purple with slow breathing glow (4s cycle)  |
| Hover          | Animated rainbow gradient (Dracula accents) |
| Celebrate      | 3s rainbow wave on success actions          |
| Party Mode     | Fast rainbow (0.5s) + wobble                |
| Reduced motion | Static purple, no animations                |

### Animated Gradient

The hover animation cycles through Dracula accent colours:

```css
/* 6-second cycle, infinite loop */
values="#BD93F9;#FF79C6;#8BE9FD;#50FA7B;#BD93F9"  /* purple → pink → cyan → green → purple */
```

### Responsive

| Breakpoint | Display         |
| ---------- | --------------- |
| > 600px    | Logo + wordmark |
| ≤ 600px    | Logo only       |

### Usage

```svelte
<script>
	import LogoLockup from './LogoLockup.svelte';
</script>

<!-- Toolbar branding -->
<LogoLockup size={28} />
```

### Accessibility

- Logo mark uses `aria-hidden="true"` (decorative)
- Title SVG uses `role="img"` with `aria-label="Rackula"`
- Animation respects `prefers-reduced-motion: reduce`

---

## Environment Badge

Visual indicator for non-production environments, displayed inline with the LogoLockup.

### Component

**File:** `src/lib/components/EnvironmentBadge.svelte`

### Display States

| Environment | Badge Text | Visibility |
| ----------- | ---------- | ---------- |
| Production  | —          | Hidden     |
| Development | `DEV`      | Visible    |
| Local       | `LOCAL`    | Visible    |

### Cylon Animation

The badge text features a "cylon-style" animated gradient sweep — a subtle red glow that moves left-to-right across the text.

| Property | Value                         |
| -------- | ----------------------------- |
| Duration | 6s (very slow, subtle)        |
| Colours  | Red gradient sweep on text    |
| Target   | Text only (background static) |
| Token    | `--anim-env-cylon`            |

```css
/* Cylon text gradient animation */
@keyframes cylon-text {
	0%,
	100% {
		background-position: 200% center;
	}
	50% {
		background-position: 0% center;
	}
}

.env-badge__text {
	background: linear-gradient(
		90deg,
		var(--env-badge-text) 0%,
		var(--env-badge-gradient-start) 50%,
		var(--env-badge-text) 100%
	);
	background-size: 200% 100%;
	background-clip: text;
	-webkit-background-clip: text;
	color: transparent;
	animation: cylon-text var(--anim-env-cylon) ease-in-out infinite;
}
```

### Design Tokens

| Token                        | Dark Theme             | Light Theme            |
| ---------------------------- | ---------------------- | ---------------------- |
| `--env-badge-bg`             | `rgba(255,85,85,0.15)` | `rgba(203,58,42,0.15)` |
| `--env-badge-text`           | `#FF5555`              | `#CB3A2A`              |
| `--env-badge-gradient-start` | `#FF79C6`              | `#A3144D`              |
| `--anim-env-cylon`           | `6s`                   | `6s`                   |

### Accessibility

- Uses `role="status"` for screen reader announcement
- `aria-label` provides context ("Development environment" / "Local environment")
- Animation respects `prefers-reduced-motion: reduce` (static text)

---

## Voice & Tone

- **Direct:** Say what it does, no marketing fluff
- **Technical:** Assume competence, use proper terminology
- **Helpful:** Guide without hand-holding
- **Dry wit:** Understated, never try-hard

---

## Brand Links

Official URLs for use throughout the application:

| Token        | URL                                        | Usage                 |
| ------------ | ------------------------------------------ | --------------------- |
| `GITHUB_URL` | `https://github.com/RackulaLives/Rackula`  | Repository link, Help |
| `DEMO_URL`   | `https://app.racku.la/`                    | Live demo link        |

---

## Changelog

### v0.6.17 (2026-01-15)

- Refined logo mark design with deeper fangs (6px) and wider shoulders
- Added comprehensive brand asset suite in `static/brand/`
- Added SVG colour variants (Dracula, Alucard, mono-black, mono-white)
- Added PNG exports at 8 sizes (16-512px)
- Added multi-size ICO and Apple Touch Icon
- Updated logo mark specifications with exact geometry

### v0.6.0 (2025-12-15)

- Added muted device colour palette for WCAG AA compliance
- Changed selection/focus from purple to pink (resolves network conflict)
- Added strict colour usage hierarchy
- Improved muted text contrast (`#9A9A9A` instead of `#6272A4`)
- Added z-index layer tokens
- Added colour decision tree

---

_Based on official Dracula Theme specification: https://draculatheme.com/spec_
