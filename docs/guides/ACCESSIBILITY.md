# Rackula Accessibility Checklist

This document tracks accessibility compliance for the Rackula application.

## Standards

These are the accessibility gates every UI pull request must meet. They are named here so PRs do not re-litigate or forget them. The PR template carries a self-certification block that points back to this section.

- WCAG 2.2 AA is the conformance target.
- Interactive controls on mobile surfaces have a minimum touch target of 44x44 CSS pixels.
- `prefers-reduced-motion` is respected for all animations and transitions.
- Every interactive element has a visible focus state.
- Focus is managed, not dropped, on open and close of panels, dialogs, and sheets.

Automated enforcement comes from the axe-core CI check (#2099). This document and the PR self-certification are the manual backstop.

## ARIA Labels

- [x] All toolbar buttons have `aria-label` or visible text
- [x] All form inputs have associated labels (via `for`/`id` or `aria-label`)
- [x] All images have alt text (SVGs use `aria-label` or `aria-hidden`)
- [x] All dialogs have `aria-labelledby` pointing to title
- [x] All close buttons have `aria-label`
- [x] All interactive SVG elements have appropriate roles

## Focus Management

- [x] Focus order is logical (follows DOM order)
- [x] Focus indicators are visible (custom focus-visible styles)
- [x] Focus trap implemented for modal dialogs
- [x] Focus returns to trigger element when dialog closes

## Keyboard Navigation

- [x] All interactive elements are keyboard accessible
- [x] Escape key closes dialogs
- [x] Tab key navigates between focusable elements
- [x] Enter/Space activates buttons and links

## Visual Design

- [x] Color is not the sole indicator of state (icons/text accompany colors)
- [x] Contrast ratios meet WCAG AA (verified via automated tests)
- [x] Reduced motion preference is respected (CSS media query + JS utilities)

### Contrast Ratios (Dark Theme on #09090b)

| Element    | Color   | Ratio | Requirement |
| ---------- | ------- | ----- | ----------- |
| Body text  | #fafafa | 18:1+ | 4.5:1 AA    |
| Muted text | #a1a1aa | 7:1+  | 4.5:1 AA    |
| Selection  | #3b82f6 | 5.8:1 | 4.5:1 AA    |
| Error      | #ef4444 | 5.6:1 | 4.5:1 AA    |
| Focus ring | #3b82f6 | 5.8:1 | 3:1 AA      |

### Contrast Ratios (Light Theme on #fafafa)

| Element    | Color   | Ratio | Requirement |
| ---------- | ------- | ----- | ----------- |
| Body text  | #09090b | 18:1+ | 4.5:1 AA    |
| Muted text | #52525b | 7:1+  | 4.5:1 AA    |
| Selection  | #2563eb | 4.6:1 | 4.5:1 AA    |
| Error      | #dc2626 | 4.8:1 | 4.5:1 AA    |
| Focus ring | #2563eb | 4.6:1 | 3:1 AA      |

## Component Checklist

### Toolbar (`Toolbar.svelte`)

- [x] Library toggle: `aria-label`, `aria-expanded`, `aria-controls`
- [x] All action buttons: `aria-label` via `ToolbarButton`
- [x] Separators: `aria-hidden="true"`

### ToolbarButton (`ToolbarButton.svelte`)

- [x] `aria-label` from `label` prop
- [x] `aria-pressed` for toggle states
- [x] `aria-expanded` for expandable buttons
- [x] `disabled` attribute properly applied

### Dialog (`Dialog.svelte`)

- [x] `role="dialog"`
- [x] `aria-modal="true"`
- [x] `aria-labelledby` linked to title
- [x] Close button: `aria-label="Close dialog"`
- [x] Close icon: `aria-hidden="true"`
- [x] Focus trap via `use:trapFocus`
- [x] Focus management via `createFocusManager()`

### Drawer (`Drawer.svelte`)

- [x] `aria-label` matching title
- [x] `aria-hidden` when closed

### DrawerHeader (`DrawerHeader.svelte`)

- [x] Close button: `aria-label="Close drawer"`
- [x] Close icon: `aria-hidden="true"`

### DevicePalette (`DevicePalette.svelte`)

- [x] Search input: `aria-label="Search devices"`
- [x] File input: `aria-label="Import device library file"`
- [x] Import button: `aria-label="Import device library"`
- [x] Add device button: visible text label

### EditPanel (`EditPanel.svelte`)

- [x] Rack name input: `<label for="rack-name">`
- [x] Rack height input: `<label for="rack-height">`
- [x] Delete rack button: `aria-label="Delete rack"`
- [x] Remove device button: `aria-label="Remove from rack"`
- [x] Face selector: `<fieldset aria-label="Mounted face">`

### Canvas (`Canvas.svelte`)

- [x] `role="application"`
- [x] `aria-label="Rack layout canvas"`

### Rack (`Rack.svelte`)

- [x] Container: `role="option"`, `aria-selected`, `tabindex="0"`
- [x] SVG: `role="img"`, `aria-label` with rack name and details

### RackDevice (`RackDevice.svelte`)

- [x] Drag handle: `role="button"`, `aria-label`, `aria-pressed`, `tabindex="0"`

## Testing

Automated tests for accessibility are in:

- `src/tests/AriaAudit.test.ts` - Comprehensive ARIA audit
- `src/tests/DialogA11y.test.ts` - Dialog accessibility
- `src/tests/focus.test.ts` - Focus management utilities
- `src/tests/contrast.test.ts` - Color contrast verification

## Manual Testing Recommendations

1. **Screen Reader Testing**: Test with VoiceOver (macOS), NVDA (Windows), or Orca (Linux)
2. **Keyboard Navigation**: Navigate entire app using only keyboard
3. **High Contrast Mode**: Test in Windows High Contrast Mode
4. **Zoom Testing**: Test at 200% browser zoom
5. **Mobile Screen Reader**: Test with TalkBack (Android) or VoiceOver (iOS)
