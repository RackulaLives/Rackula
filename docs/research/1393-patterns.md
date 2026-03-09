# Spike #1393: Pattern Analysis

**Date:** 2026-03-08
**Scope:** Synthesise codebase findings + external research into recommended patterns with trade-off analysis

---

## 1. Helper Organisation: Class POM vs Functional Helpers

### Current State

Rackula uses **functional helpers** organised by domain:
- `device-actions.ts` — drag, select, deselect, delete
- `rack-setup.ts` — wizard completion
- `toolbar-actions.ts` — toolbar button interactions
- `mobile-navigation.ts` — mobile-specific navigation

### Trade-off Analysis

| Dimension | Class-Based POM | Functional Helpers (current) |
|-----------|----------------|------------------------------|
| Discoverability | IDE autocomplete on `rack.` | File/barrel imports |
| Composition | Inheritance (brittle) | Import individual functions |
| Fit for SPA | Designed for multi-page flows | Natural for single-page actions |
| Selector ownership | Encapsulated in class fields | Scattered across functions |
| Test readability | `rack.dragDevice(...)` | `dragDeviceToRack(page, ...)` |
| Maintenance | God Object risk | Flat, independent functions |

### Recommendation: **Keep Functional Helpers, Add Locator Centralisation**

Rackula is a single-page app. There's no "login page" → "dashboard page" flow. The functional pattern fits perfectly. The one improvement: **centralise selectors into `locators.ts`** so CSS class references live in one file.

```
e2e/helpers/
  locators.ts          ← NEW: all selector strings
  base-test.ts         ← unchanged
  test-layouts.ts      ← unchanged
  device-actions.ts    ← import from locators.ts
  rack-setup.ts        ← import from locators.ts
  toolbar-actions.ts   ← already uses data-testid (model)
  mobile-navigation.ts ← already uses getByRole (model)
  index.ts             ← add locators re-export
```

---

## 2. Selector Strategy: data-testid Everywhere vs Role/Aria Mix

### Trade-off Analysis

| Approach | Stability | Accessibility Testing | Effort | Risk |
|----------|-----------|----------------------|--------|------|
| `data-testid` everywhere | High | None (tests pass even if a11y breaks) | Low (mechanical) | Tests silently ignore a11y regressions |
| `getByRole()` everywhere | Medium | High (catches a11y bugs) | High (needs ARIA markup) | SVG elements have no roles |
| **Hybrid** (recommended) | High | Partial | Medium | Best balance |

### Recommended Hybrid Strategy

**Use `getByRole()` for interactive elements:**
- Buttons: `page.getByRole('button', { name: 'Save' })`
- Form inputs: `page.getByLabel('Rack name')`
- Dialogs: `page.getByRole('dialog')`
- Menu items: `page.getByRole('menuitem', { name: 'Export' })`

**Use `getByTestId()` for structural/SVG elements:**
- Rack canvas: `page.getByTestId('rack-canvas')`
- Device slots: `page.getByTestId('rack-device')`
- Panels: `page.getByTestId('drawer-device-edit')`
- Drop zones: `page.getByTestId('rack-drop-zone')`

**Use chaining for scoped queries:**
```typescript
// Instead of a unique testid per device:
page.getByTestId('rack-front').locator('[data-testid="rack-device"]').nth(0)
```

### Naming Convention

Format: `{scope}-{element}-{qualifier}` in kebab-case.

```
rack-canvas           — SVG canvas container
rack-device           — device rectangle in rack (repeating)
rack-front            — front face container
rack-rear             — rear face container
drawer-device-edit    — right-side device edit panel
palette-search        — device palette search input
palette-item          — device palette list item (repeating)
dialog-new-rack       — new rack dialog
ctx-menu              — context menu container
toast-message         — toast notification
```

---

## 3. Migration Path: Incremental vs Big-Bang

### Trade-off Analysis

| Approach | Risk | Effort | Disruption | Time to Value |
|----------|------|--------|------------|---------------|
| Big-bang rewrite | High (all tests break simultaneously) | 1-2 weeks | High | Delayed |
| **Incremental** (recommended) | Low (one file at a time) | 3-4 weeks | Low | Immediate |

### Recommended 4-Phase Incremental Migration

**Phase 1: Centralise selectors** (no component changes)
- Create `e2e/helpers/locators.ts`
- Move all CSS class strings from helpers and specs into named constants
- Tests continue working identically
- **Gate:** All class selectors in helpers reference `locators.ts`

**Phase 2: Add data-testid to components** (component changes, no test changes)
- Add `data-testid` to ~15 structural elements (rack canvas, device slots, drawers, dialogs, context menus)
- Update `locators.ts` to use testid selectors instead of class selectors
- Tests automatically pick up new selectors via locators
- **Gate:** Zero CSS class selectors in `locators.ts` for structural elements

**Phase 3: Migrate interactive selectors to getByRole()** (test changes)
- Replace `:has-text()` button selectors with `getByRole('button', { name: ... })`
- Replace `#id` form selectors with `getByLabel()`
- Update helpers to use Playwright semantic locators
- **Gate:** No `:has-text()` selectors in helpers

**Phase 4: Clean up spec files** (test changes)
- Remaining inline CSS selectors in spec files → use helpers or locators
- Add ESLint rule to warn on `.locator('.')` in E2E files
- **Gate:** ESLint rule passes, no new CSS class selectors

### Migration Priority (by impact)

1. `device-actions.ts` — used by ~15 spec files, heavy CSS class usage, contains `page.evaluate()` with raw `querySelector`
2. `rack-setup.ts` — wizard selectors, `:has-text()` patterns
3. `toolbar-actions.ts` — already partially migrated, quick win
4. Individual spec files — in order of selector count

---

## 4. Fixture Strategy Evolution

### Current State Assessment

The share-link fixture system is **excellent** and should remain the primary approach. No change needed to the core pattern.

### Recommended Addition: Factory Builder

```typescript
// e2e/helpers/test-layouts.ts — add alongside existing fixtures
export function createTestLayout(overrides?: {
  name?: string;
  rackName?: string;
  rackHeight?: number;
  rackWidth?: 10 | 19;
  devices?: Array<{ type: string; position: number; face: 'front' | 'rear' }>;
  customTypes?: Array<{ slug: string; height: number; colour: string; category: string }>;
}): string {
  const layout: MinimalLayout = {
    v: APP_VERSION,
    n: overrides?.name ?? 'Test Layout',
    r: {
      n: overrides?.rackName ?? 'Test Rack',
      h: overrides?.rackHeight ?? 42,
      w: overrides?.rackWidth ?? 19,
      d: (overrides?.devices ?? []).map(d => ({ t: d.type, p: d.position, f: d.face })),
    },
    dt: (overrides?.customTypes ?? []).map(t => ({ s: t.slug, h: t.height, c: t.colour, x: t.category })),
  };
  return encodeMinimal(layout);
}
```

This enables tests to create specific configurations without opaque encoded strings:

```typescript
await gotoWithRack(page, createTestLayout({
  rackHeight: 12,
  devices: [
    { type: 'dell-r750', position: 1, face: 'front' },
    { type: 'dell-r750', position: 3, face: 'front' },
  ],
}));
```

### Optional: Playwright Fixture Wrapping

Wrap common scenarios in `test.extend()` for declarative test setup:

```typescript
export const test = base.extend<{ emptyRack: void; rackWithDevice: void }>({
  emptyRack: [async ({ page }, use) => {
    await gotoWithRack(page, EMPTY_RACK_SHARE);
    await use();
  }, { auto: false }],
  rackWithDevice: [async ({ page }, use) => {
    await gotoWithRack(page, RACK_WITH_DEVICE_SHARE);
    await use();
  }, { auto: false }],
});
```

---

## 5. Disabled Test Triage

### Category 1: File Chooser (3 tests) — **Investigate**

Root cause: Playwright's file chooser API is unreliable in headless mode. The `base-test.ts` fixture already deletes File System Access API, but the fallback `<input type="file">` path may not trigger Playwright's `page.on('filechooser')` consistently.

**Recommended fix:** Use `page.setInputFiles()` on the hidden file input rather than clicking the Load button. This bypasses the file chooser entirely.

### Category 2: Unimplemented UI (3 tests) — **Keep Skipped**

These rack configuration features (descending units, custom starting unit, form factor) genuinely don't exist yet. Tests should remain `test.skip()` until the features are implemented.

### Category 3: UX Redesign (#903) (3 tests) — **Review and Update**

Issue #903 has been open since v0.2. The rack replacement flow may have evolved. These tests should be reviewed against current UX and either updated or removed.

### Category 4: Complex UI (1 test) — **Fix with Better Selectors**

The multi-rack metadata test fails due to fragile sidebar navigation. Adding `data-testid` to rack list items (`rack-item-{id}`) and using stable selectors should unblock this.

### Category 5: Undo/Redo (1 test) — **Investigate**

Likely blocked by the same save/load mechanism. Should work once file chooser issue is resolved.

---

## 6. Documentation Gap: TESTING.md

The current `docs/guides/TESTING.md` lists `data-testid` values that don't exist in the codebase:
- `btn-save` — doesn't exist (save is in File menu dropdown)
- `btn-help` — doesn't exist

This documentation should be updated as part of the migration to reflect actual testid values.
