# Toolbar Geismar Refinements Design

> **For Claude:** Use superpowers:executing-plans to implement these refinements.

**Goal:** Refine the toolbar toward timeless design principles inspired by Tom Geismar's work.

**Philosophy:** Geismar's logos (Chase, PBS, Mobil) use bold geometric forms, negative space, and mathematical precision. Designs that avoid trends age better.

---

## Design Decisions

### 1. Icon Style: Outline → Solid

**Current:** Iconoir outline icons (thin strokes)
**Problem:** Outline icons are a 2020s trend that may date quickly
**Solution:** Switch to solid/filled icons for more presence and timelessness

**Implementation:**

- Use Iconify's solid icon variants
- Options: `iconoir:*-solid`, Heroicons Solid, or Phosphor Fill
- Solid icons have more visual weight and feel less "of the moment"

### 2. Dropdown Design: Floating Cards → Inline Expansion

**Current:** Floating card with shadow, rounded corners, portal rendering
**Problem:** This is the dominant 2015-2025 design pattern - very "Material/Apple"
**Solution:** Inline expansion where menu content pushes layout down

**Implementation:**

- Remove `DropdownMenu.Portal` wrapper
- Menu expands in place below trigger button
- No shadow, simple border or background shift
- More grounded, less "floating UI"

**Tradeoffs:**

- Requires layout accommodation for expanded state
- May need to rethink toolbar overflow behavior
- More complex but more timeless

### 3. Hover States: Background Rectangle → Multi-layered Feedback

**Current:** Filled background rectangle appears on hover
**Problem:** Ubiquitous pattern that's functional but generic
**Solution:** Combine subtle signals without adding shapes

**Implementation:**

```css
.toolbar-icon-btn:hover:not(:disabled) {
  /* Color shift */
  color: var(--colour-accent);

  /* Slight boldness via filter or stroke-width */
  filter: contrast(1.1);

  /* Underline indicator */
  box-shadow: inset 0 -2px 0 currentColor;
}
```

**Feedback layers:**

1. Color brightens/shifts
2. Icon gains subtle weight
3. Underline appears

### 4. Proportions: Align to 8pt Grid

**Current:** 44px toolbar, 28px icons, 32px buttons (breaks grid)
**Proposed:** 40px toolbar, 24px icons, 32px buttons (clean 8pt)

| Element        | Current | Proposed | Grid |
| -------------- | ------- | -------- | ---- |
| Toolbar height | 44px    | 40px     | 8×5  |
| Icon size      | 28px    | 24px     | 8×3  |
| Button size    | 32px    | 32px     | 8×4  |
| Gap            | 8px     | 8px      | 8×1  |
| Padding        | 16px    | 16px     | 8×2  |

**Ratios:**

- Icon:Button = 24:32 = 3:4 (clean ratio)
- Button:Toolbar = 32:40 = 4:5 (clean ratio)
- Icon has 4px breathing room in button

---

## Token Updates

```css
/* tokens.css updates */
--toolbar-height: 40px; /* was 44px */
--icon-size-toolbar: 24px; /* new specific token */
```

---

## Visual Reference

**Geismar principles applied:**

- **Bold over delicate:** Solid icons instead of thin outlines
- **Grounded over floating:** Inline menus instead of floating cards
- **Subtle over obvious:** Multi-signal hover instead of shape change
- **Mathematical over arbitrary:** 8pt grid for all proportions

---

## Implementation Order

1. **Proportions first** - Easy, low risk, immediate improvement
2. **Solid icons** - Medium effort, test visual weight
3. **Hover states** - CSS only, reversible
4. **Inline dropdowns** - Highest effort, most architectural change

---

## Open Questions

- Which solid icon set looks best? (Test Heroicons Solid vs Phosphor Fill)
- Does inline dropdown work on mobile/narrow screens?
- Should the logo also get Geismar treatment? (Already minimal, probably fine)

---

## Status

- [x] Design exploration complete
- [x] Proportions implemented (40/24/32 on 8pt grid)
- [x] Solid icons tested (Phosphor Bold)
- [x] Hover states implemented (color + underline + brightness)
- [x] Inline dropdowns prototyped (removed Portal wrappers)
