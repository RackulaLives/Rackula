# Toolbar Geismar Refinements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement timeless Geismar-inspired toolbar refinements

**Architecture:** Four sequential changes - proportions, solid icons, hover states, inline dropdowns. Each change is independently testable and reversible.

**Tech Stack:** Svelte 5, CSS custom properties, Iconify, bits-ui

---

## Task 1: Align Proportions to 8pt Grid

Update toolbar dimensions to follow clean 8pt grid alignment.

**Files:**

- Modify: `src/lib/styles/tokens.css:324`
- Modify: `src/lib/components/Toolbar.svelte:326-327,342-343`

**Step 1: Update toolbar height token**

In `src/lib/styles/tokens.css`, change:

```css
/* Before */
--toolbar-height: 44px;

/* After */
--toolbar-height: 40px;
```

**Step 2: Update icon size to use --icon-size-lg (24px)**

In `src/lib/components/Toolbar.svelte`, the CSS already references tokens. Update the icon sizing rule:

```css
/* Before */
.toolbar-icon-btn :global(svg),
:global(.toolbar-icon-btn svg) {
  width: var(--icon-size-xl);
  height: var(--icon-size-xl);
}

/* After */
.toolbar-icon-btn :global(svg),
:global(.toolbar-icon-btn svg) {
  width: var(--icon-size-lg);
  height: var(--icon-size-lg);
}
```

**Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 4: Visual verification**

Run: `npm run dev`
Check: Toolbar is 40px tall, icons are 24px, buttons are 32px

**Step 5: Commit**

```bash
git add src/lib/styles/tokens.css src/lib/components/Toolbar.svelte
git commit -m "style: align toolbar to 8pt grid (40/24/32)"
```

---

## Task 2: Switch to Solid Icons

Replace outline Iconoir icons with solid variants for more visual weight.

**Files:**

- Modify: `src/lib/components/Toolbar.svelte:167,183,199,215,217,231`
- Modify: `src/lib/components/FileMenu.svelte:32`
- Modify: `src/lib/components/SettingsMenu.svelte:33`

**Step 1: Research solid icon availability**

Check which solid icons are available in Iconify:

- `iconoir:plus` → Try `iconoir:plus-solid` or `ph:plus-fill` (Phosphor)
- `iconoir:undo` → Try `ph:arrow-counter-clockwise-fill`
- `iconoir:redo` → Try `ph:arrow-clockwise-fill`
- `iconoir:text` → Try `ph:text-t-fill`
- `iconoir:media-image` → Try `ph:image-fill`
- `iconoir:compress` → Try `ph:arrows-in-fill`
- `iconoir:folder` → Try `ph:folder-fill`
- `iconoir:settings` → Try `ph:gear-fill`

**Step 2: Update Toolbar.svelte icons**

Replace each icon with its solid/fill equivalent:

```svelte
<!-- Before -->
<Icon icon="iconoir:plus" />

<!-- After (using Phosphor Fill) -->
<Icon icon="ph:plus-bold" />
```

Use Phosphor Bold weight for solid appearance with geometric precision.

**Step 3: Update FileMenu.svelte icon**

```svelte
<!-- Before -->
<Icon icon="iconoir:folder" />

<!-- After -->
<Icon icon="ph:folder-fill" />
```

**Step 4: Update SettingsMenu.svelte icon**

```svelte
<!-- Before -->
<Icon icon="iconoir:settings" />

<!-- After -->
<Icon icon="ph:gear-fill" />
```

**Step 5: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Visual verification**

Run: `npm run dev`
Check: Icons appear solid/filled, more visual weight

**Step 7: Commit**

```bash
git add src/lib/components/Toolbar.svelte src/lib/components/FileMenu.svelte src/lib/components/SettingsMenu.svelte
git commit -m "style: switch to Phosphor solid icons for visual weight"
```

---

## Task 3: Implement Multi-layered Hover States

Replace background rectangle hover with color shift + underline + weight change.

**Files:**

- Modify: `src/lib/components/Toolbar.svelte:346-349`

**Step 1: Update hover CSS**

Replace the current hover styles:

```css
/* Before */
.toolbar-icon-btn:hover:not(:disabled),
:global(.toolbar-icon-btn:hover:not(:disabled)) {
  background: var(--colour-surface-hover);
  color: var(--colour-text);
}

/* After */
.toolbar-icon-btn:hover:not(:disabled),
:global(.toolbar-icon-btn:hover:not(:disabled)) {
  color: var(--colour-accent, var(--dracula-cyan));
  filter: brightness(1.1);
  box-shadow: inset 0 -2px 0 currentColor;
}
```

**Step 2: Update focus-visible to match**

Keep focus-visible distinct but harmonious:

```css
.toolbar-icon-btn:focus-visible,
:global(.toolbar-icon-btn:focus-visible) {
  outline: none;
  color: var(--colour-accent, var(--dracula-cyan));
  box-shadow:
    inset 0 -2px 0 currentColor,
    0 0 0 2px var(--colour-focus-ring);
}
```

**Step 3: Update disabled state opacity**

Ensure disabled icons don't get hover effects (already handled by `:not(:disabled)`).

**Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Visual verification**

Run: `npm run dev`
Check:

- Hover shows color shift to cyan
- Subtle brightness increase
- Underline appears at bottom
- No background rectangle

**Step 6: Commit**

```bash
git add src/lib/components/Toolbar.svelte
git commit -m "style: multi-layered hover feedback (color + underline + brightness)"
```

---

## Task 4: Convert Dropdowns to Inline Expansion

Replace floating portal dropdowns with inline expansion. This is the most complex change.

**Files:**

- Modify: `src/lib/components/FileMenu.svelte`
- Modify: `src/lib/components/SettingsMenu.svelte`
- Modify: `src/lib/components/Toolbar.svelte` (layout changes)

**Step 1: Update FileMenu to inline expansion**

Remove Portal wrapper and adjust positioning:

```svelte
<!-- Before -->
<DropdownMenu.Portal>
  <DropdownMenu.Content class="menu-content" sideOffset={8} align="end">
    ...
  </DropdownMenu.Content>
</DropdownMenu.Portal>

<!-- After -->
<DropdownMenu.Content
  class="menu-content menu-inline"
  sideOffset={0}
  align="start"
>
  ...
</DropdownMenu.Content>
```

**Step 2: Add inline menu CSS to FileMenu**

```css
:global(.menu-inline) {
  position: relative;
  z-index: var(--z-dropdown);
  margin-top: var(--space-1);
  box-shadow: none;
  border: 1px solid var(--colour-border);
  animation: none;
}
```

**Step 3: Update toolbar layout to accommodate expansion**

The toolbar needs to allow content to expand below. Update Toolbar.svelte:

```css
.toolbar {
  /* Add */
  position: relative;
  overflow: visible;
}

.toolbar-right {
  /* Add */
  position: relative;
}
```

**Step 4: Apply same changes to SettingsMenu**

Mirror the FileMenu changes.

**Step 5: Test mobile behavior**

Run: `npm run dev`
Check on narrow viewport:

- Menu still accessible
- Doesn't overflow screen
- Can close by clicking outside

**Step 6: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 7: Run full test suite**

Run: `npm run test:run`
Expected: All tests pass

**Step 8: Commit**

```bash
git add src/lib/components/FileMenu.svelte src/lib/components/SettingsMenu.svelte src/lib/components/Toolbar.svelte
git commit -m "feat: inline dropdown expansion (no floating cards)"
```

---

## Task 5: Update Design Doc Status

Mark implementation complete in the design doc.

**Files:**

- Modify: `docs/plans/2026-01-14-toolbar-geismar-refinements.md:130-136`

**Step 1: Update status checkboxes**

```markdown
## Status

- [x] Design exploration complete
- [x] Proportions implemented
- [x] Solid icons tested
- [x] Hover states implemented
- [x] Inline dropdowns prototyped
```

**Step 2: Commit**

```bash
git add docs/plans/2026-01-14-toolbar-geismar-refinements.md
git commit -m "docs: mark Geismar refinements complete"
```

---

## Task 6: Push and Update PR

**Step 1: Push all commits**

```bash
git push
```

**Step 2: Update PR description**

Add Geismar refinements to the PR summary.

---

## Rollback Plan

If any change causes issues:

1. **Proportions**: Revert tokens.css `--toolbar-height` to 44px
2. **Solid icons**: Change `ph:*-fill` back to `iconoir:*`
3. **Hover states**: Restore `background: var(--colour-surface-hover)`
4. **Inline dropdowns**: Re-add `DropdownMenu.Portal` wrapper

Each change is isolated and can be reverted independently.
