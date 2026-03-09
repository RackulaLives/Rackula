# E2E Testing Architecture Design Doc

**Date:** 2026-03-08
**Spike:** [#1393](https://github.com/RackulaLives/Rackula/issues/1393)
**Status:** Proposed

---

## 1. Selector Convention

### Priority Order

1. `getByRole()` — buttons, inputs, dialogs, menu items, navigation
2. `getByLabel()` — form controls with labels
3. `getByTestId()` — SVG elements, structural containers, drop zones, repeated elements
4. Locator chaining — scoping within a parent testid

CSS class selectors (`.class-name`) and `:has-text()` should be eliminated from E2E tests.

### Naming Scheme

Format: `{scope}-{element}-{qualifier}` in kebab-case.

| TestId | Component | Purpose |
|--------|-----------|---------|
| `rack-canvas` | RackCanvas.svelte | SVG canvas container |
| `rack-device` | RackDevice.svelte | Device rectangle in rack (repeating) |
| `rack-front` | RackView.svelte | Front face container |
| `rack-rear` | RackView.svelte | Rear face container |
| `rack-drop-zone` | RackCanvas.svelte | Drop target for drag operations |
| `drawer-device-edit` | DeviceEditPanel.svelte | Right-side device edit drawer |
| `drawer-left` | Sidebar.svelte | Left sidebar container |
| `palette-search` | DevicePalette.svelte | Search input (alias existing `search-devices`) |
| `palette-item` | DevicePaletteItem.svelte | Palette list item (repeating) |
| `dialog-new-rack` | NewRackDialog.svelte | New rack creation dialog |
| `ctx-menu` | ContextMenu.svelte | Context menu container |
| `ctx-menu-item` | ContextMenuItem.svelte | Context menu item (repeating) |
| `toast-message` | Toast.svelte | Toast notification |
| `mobile-bottom-nav` | MobileBottomNav.svelte | Mobile bottom navigation bar |
| `mobile-bottom-sheet` | MobileBottomSheet.svelte | Mobile bottom sheet |

### Examples

```typescript
// Interactive elements → getByRole()
await page.getByRole('button', { name: 'Save' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
await page.getByLabel('Rack name').fill('Main Rack');

// Structural/SVG elements → getByTestId()
await expect(page.getByTestId('rack-canvas')).toBeVisible();
const devices = page.getByTestId('rack-front').getByTestId('rack-device');
await expect(devices).toHaveCount(3);

// Scoped queries → chaining
const editPanel = page.getByTestId('drawer-device-edit');
await editPanel.getByLabel('Display name').fill('My Server');
```

---

## 2. Helper Organisation

### Keep: Functional Helper Pattern

No change to the core pattern. Rackula's functional helpers (`dragDeviceToRack`, `selectDevice`, `gotoWithRack`) are the right abstraction for a single-page app.

### Add: Centralised Locator File

```typescript
// e2e/helpers/locators.ts
import type { Page } from '@playwright/test';

export const locators = {
  rack: {
    canvas: (page: Page) => page.getByTestId('rack-canvas'),
    device: (page: Page) => page.getByTestId('rack-device'),
    front: (page: Page) => page.getByTestId('rack-front'),
    rear: (page: Page) => page.getByTestId('rack-rear'),
    dropZone: (page: Page) => page.getByTestId('rack-drop-zone'),
  },
  palette: {
    search: (page: Page) => page.getByTestId('palette-search'),
    item: (page: Page, name: string) =>
      page.getByTestId('palette-item').filter({ hasText: name }),
  },
  drawer: {
    deviceEdit: (page: Page) => page.getByTestId('drawer-device-edit'),
  },
  toolbar: {
    undo: (page: Page) => page.getByTestId('btn-undo'),
    redo: (page: Page) => page.getByTestId('btn-redo'),
    export: (page: Page) => page.getByTestId('btn-export'),
    fileMenu: (page: Page) => page.getByRole('button', { name: 'File menu' }),
  },
} as const;
```

This gives a single source of truth for selectors while keeping the functional composition pattern. Helpers import from `locators.ts` instead of hardcoding CSS classes.

### Add: Missing Helper Modules

Priority helpers to create:

1. **metadata-actions.ts** — editing device name, IP, notes, colour
2. **context-menu-actions.ts** — opening and clicking context menu items
3. **assertion-helpers.ts** — common "wait for X" patterns (device count, drawer open, toast visible)

---

## 3. Fixture Strategy

### Keep: Share-Link Fixtures

The current share-link fixture system (`test-layouts.ts`) is the primary fixture mechanism. No changes to existing fixtures.

### Add: Factory Builder

```typescript
export function createTestLayout(overrides?: {
  name?: string;
  rackName?: string;
  rackHeight?: number;
  rackWidth?: 10 | 19;
  devices?: Array<{ type: string; position: number; face: 'front' | 'rear' }>;
  customTypes?: Array<{ slug: string; height: number; colour: string; category: string }>;
}): string
```

Enables tests to create specific configurations without manually encoding share links. Complements (not replaces) the 5 existing static fixtures.

### Consider: Playwright Fixture Wrapping

Wrap `gotoWithRack()` in `test.extend()` for declarative test setup. This is optional and can be adopted later without breaking changes.

---

## 4. Migration Path

### Phase 1: Centralise Selectors

**Scope:** E2E test files only (no component changes)
**Effort:** Small
**Related issue:** New issue (selector centralisation)

1. Create `e2e/helpers/locators.ts` with all CSS class selectors as named constants
2. Update `device-actions.ts`, `rack-setup.ts`, `toolbar-actions.ts` to import from locators
3. Update spec files that use inline CSS selectors

**Gate:** All CSS class strings in helpers reference `locators.ts`

### Phase 2: Add data-testid to Components

**Scope:** Svelte components + locators.ts
**Effort:** Medium
**Related issues:** #1228, #1264

1. Add `data-testid` to ~15 structural elements (see naming scheme table above)
2. Update `locators.ts` to use `getByTestId()` instead of CSS class selectors
3. Update `device-actions.ts` `page.evaluate()` calls to use `data-testid` for DOM queries

**Gate:** Zero CSS class selectors in `locators.ts` for structural elements

### Phase 3: Migrate Interactive Selectors

**Scope:** Helpers and spec files
**Effort:** Medium
**Related issue:** #1228

1. Replace `:has-text()` button selectors with `getByRole('button', { name: ... })`
2. Replace `#id` form selectors with `getByLabel()`
3. Replace `.menu-item:has-text()` with `getByRole('menuitem', { name: ... })`

**Gate:** No `:has-text()` or `#id` selectors in helpers

### Phase 4: Clean Up and Enforce

**Scope:** E2E test files + ESLint config
**Effort:** Small

1. Remove remaining inline CSS selectors from spec files
2. Add ESLint rule to warn on `.locator('.')` patterns in E2E files
3. Update `docs/guides/TESTING.md` to reflect actual testid values
4. Remove stale testid documentation (e.g., `btn-save`, `btn-help`)

**Gate:** ESLint rule passes on all E2E files

### Phase Sequencing

```
Phase 1 (Centralise)
  └─→ Phase 2 (Add testids to components)
        ├─→ Phase 3 (Migrate interactive selectors)
        └─→ Phase 4 (Clean up and enforce)
```

Phases 3 and 4 can be done in parallel after Phase 2.

---

## 5. Disabled Test Strategy

| Category | Tests | Action | Linked To |
|----------|-------|--------|-----------|
| File chooser | 3 | Fix with `page.setInputFiles()` | #1226 |
| Unimplemented UI | 3 | Keep skipped | Feature backlog |
| UX redesign (#903) | 3 | Review against current UX | #903, #1226 |
| Complex UI | 1 | Fix with stable selectors | Phase 2 |
| Undo/redo | 1 | Fix with file chooser fix | #1226 |

---

## 6. Relationship to Open Issues

| Issue | Title | How This Design Addresses It |
|-------|-------|------------------------------|
| #1228 | Selector reliability | Phases 1-4 replace CSS selectors with stable alternatives |
| #1226 | Disabled test triage | Root causes identified; file chooser fix + selector migration unblocks most |
| #1264 | Workflow/dialog selectors | Phase 2 adds testids to dialogs, drawers, context menus |
| #1262 | Responsive test rewrite | Independent but benefits from stable selectors in Phases 1-2 |

---

## Appendix: Implementation Issues

The following issues should be created to track implementation:

1. **Centralise E2E selectors into locators.ts** (Phase 1)
2. **Add data-testid to structural components** (Phase 2)
3. **Migrate helpers to getByRole/getByTestId** (Phase 3)
4. **Add createTestLayout() factory builder** (Fixture improvement)
5. **Fix file chooser tests with page.setInputFiles()** (Disabled test fix)
6. **Add ESLint rule for CSS class selectors in E2E** (Phase 4)
