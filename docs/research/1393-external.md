# E2E Testing Best Practices Research

**Date:** 2026-03-08
**Scope:** Playwright selector strategy, test architecture, fixture patterns, Svelte considerations, migration path
**Applicability:** Rackula (Svelte 5 SPA, client-side only, SVG-heavy rack layout designer)

---

## 1. Playwright Selector Best Practices

### 1.1 Official Priority Order

Playwright's documentation defines a clear hierarchy. Use the highest-priority locator that works for your element:

| Priority | Locator | Use When | Example |
|----------|---------|----------|---------|
| 1 (best) | `getByRole()` | Interactive elements with ARIA roles | `page.getByRole('button', { name: 'Save' })` |
| 2 | `getByLabel()` | Form controls with `<label>` | `page.getByLabel('Rack name')` |
| 3 | `getByText()` | Non-interactive elements with visible text | `page.getByText('42U Standard Rack')` |
| 4 | `getByPlaceholder()` | Inputs with placeholder (no label) | `page.getByPlaceholder('Search devices...')` |
| 5 | `getByAltText()` | Images and `<area>` elements | `page.getByAltText('Dell PowerEdge')` |
| 6 | `getByTitle()` | Elements with `title` attribute | `page.getByTitle('Zoom to fit')` |
| 7 | `getByTestId()` | No semantic way to locate element | `page.getByTestId('rack-canvas')` |
| 8 (worst) | CSS/XPath | Absolute last resort | `page.locator('.rack-device')` |

**Source:** [Playwright Locators docs](https://playwright.dev/docs/locators), [Playwright Best Practices](https://playwright.dev/docs/best-practices)

**Key insight:** The priority is not arbitrary. `getByRole()` simultaneously tests accessibility and finds elements. If `getByRole('button', { name: 'Save' })` stops working, it means the button lost its accessible name -- which is a real bug worth catching.

### 1.2 When `getByTestId()` Is the Right Call

`getByTestId()` is the correct choice in these specific situations:

- **SVG elements** that have no ARIA role or text (e.g., a rack canvas, a U-slot drop zone)
- **Structural containers** with no visible text (layout panels, wrappers)
- **Repeated identical elements** that need unique identification beyond what role + name provides
- **Dynamic content** where text/labels change based on state (counts, timestamps)
- **Icon-only buttons** without accessible names (though adding `aria-label` is better)

**For Rackula specifically:** The SVG rack grid, device rectangles, and drop zones are prime `getByTestId()` candidates because they lack semantic roles. The toolbar buttons, form inputs, and dialog elements should use `getByRole()`.

### 1.3 `data-testid` Naming Convention

**Recommendation: kebab-case with component-scope prefix.**

Format: `{scope}-{element}-{qualifier}`

Examples:
```
data-testid="rack-canvas"
data-testid="rack-slot-15"
data-testid="device-palette-item-dell-r750"
data-testid="toolbar-btn-export"
data-testid="sidebar-tab-racks"
data-testid="drawer-device-name-input"
```

**Rationale:**
- kebab-case matches HTML attribute conventions and Rackula's existing file naming
- Scope prefix prevents collisions (e.g., `rack-name` in the sidebar vs `rack-name` in the header)
- Qualifiers go last for natural reading order

**Anti-patterns to avoid:**
- `data-testid="RackCanvas"` -- camelCase feels foreign in HTML
- `data-testid="test-rack-canvas"` -- the `test-` prefix is redundant; it is already a test ID
- `data-testid="1"` -- meaningless without context
- `data-testid="rack_canvas"` -- snake_case inconsistent with kebab-case codebase

### 1.4 Combining Locators for Precision

Playwright's locator chaining is extremely powerful and often eliminates the need for test IDs:

```typescript
// Instead of data-testid="front-rack-device-3":
page.getByTestId('rack-front').locator('.rack-device').nth(2)

// Instead of data-testid="file-menu-save":
page.getByRole('button', { name: 'File menu' })
  .locator('..') // parent menu
  .getByText('Save')

// Filter by containing text:
page.getByRole('listitem').filter({ hasText: 'Dell PowerEdge' })
```

**Source:** [Playwright Locators - Filtering](https://playwright.dev/docs/locators), [BrowserStack Selectors Guide](https://www.browserstack.com/guide/playwright-selectors-best-practices)

---

## 2. Page Object Model vs Functional Helpers

### 2.1 What Playwright Officially Says

Playwright documents POM as a valid pattern but does **not** mandate it. The [official POM page](https://playwright.dev/docs/pom) shows class-based examples but describes them as one approach to "structure your test suite." The best practices page focuses on locator strategy and test isolation, not on POM specifically.

### 2.2 Class-Based POM

```typescript
// Traditional POM
class RackPage {
  readonly page: Page;
  readonly canvas: Locator;
  readonly devicePalette: Locator;

  constructor(page: Page) {
    this.page = page;
    this.canvas = page.getByTestId('rack-canvas');
    this.devicePalette = page.getByTestId('device-palette');
  }

  async dragDeviceToSlot(slug: string, position: number) { /* ... */ }
  async selectDevice(index: number) { /* ... */ }
}

// Usage in test
test('can place device', async ({ page }) => {
  const rack = new RackPage(page);
  await rack.dragDeviceToSlot('dell-r750', 10);
});
```

**Pros:**
- Clear ownership: one class per page/component
- IDE autocomplete on instance methods
- Encapsulates locators and actions together

**Cons:**
- Inheritance hierarchies get brittle (`BasePage -> AuthenticatedPage -> RackPage`)
- Classes accumulate methods over time (God Object)
- Harder to share individual actions across unrelated page objects
- Modern web apps are component-based, not page-based

### 2.3 Functional Helpers (What Rackula Already Uses)

```typescript
// Functional approach (current Rackula pattern)
export async function dragDeviceToRack(page: Page, options?: { ... }): Promise<number> { /* ... */ }
export async function selectDevice(page: Page, index?: number): Promise<void> { /* ... */ }
export async function clickNewRack(page: Page): Promise<void> { /* ... */ }
```

**Pros:**
- Composition over inheritance: import only what you need
- Each function is independently testable and understandable
- Natural fit for Playwright's `page` parameter pattern
- No class instantiation boilerplate
- Easy to share cross-cutting concerns (a `dragDeviceToRack` helper doesn't "belong" to a page class)

**Cons:**
- No namespace grouping (mitigated by file organisation)
- Discoverability depends on good file naming and barrel exports
- Teams can scatter functions across files inconsistently

### 2.4 The Functional Page Model (Hybrid)

A structured middle ground organises functional helpers by component:

```
e2e/
  models/
    rack/
      rack.locators.ts    // Locator factories
      rack.actions.ts     // User interactions
      rack.assertions.ts  // Domain-specific expects
    device-palette/
      palette.locators.ts
      palette.actions.ts
```

Each file exports pure functions that take `Page` (or `Locator`) as the first argument. This gives the organisational benefits of POM without the rigidity of classes.

**Source:** [Functional Page Model for Playwright](https://medium.com/@jameskip/functional-page-model-for-playwright-a-scalable-alternative-to-classic-pom-007d8ec26333), [Page Objects vs Functional Helpers (Murat Ozcan)](https://dev.to/muratkeremozcan/page-objects-vs-functional-helpers-2akj)

### 2.5 Recommendation for Rackula

**Keep the functional helper pattern. Rackula already uses it and it is the right fit.**

Rationale:
1. Rackula is a single-page app, not a multi-page site. There is no "login page" -> "dashboard page" flow that POM was designed for.
2. The existing helpers (`dragDeviceToRack`, `selectDevice`, `gotoWithRack`) are exactly the right granularity.
3. The functional approach composes naturally with Playwright's fixture system via `test.extend()`.
4. The team is small enough that a `e2e/helpers/` directory with barrel exports provides sufficient discoverability.

**One improvement to consider:** Split the helpers directory into domain-based files more granularly as the test suite grows. The current `device-actions.ts` / `rack-setup.ts` / `toolbar-actions.ts` split is already good. Adding a `locators.ts` file to centralise the CSS class selectors would make migration easier (see Section 5).

---

## 3. Test Fixture Strategies

### 3.1 Pre-Encoded Share Links (What Rackula Uses Now)

Rackula's `test-layouts.ts` builds `MinimalLayout` objects, compresses them with pako, and encodes them as URL-safe base64 share parameters. Tests navigate to `/?l={encoded}` to load a known state.

```typescript
const EMPTY_RACK_MINIMAL: MinimalLayout = { v: APP_VERSION, n: "Test Layout", r: { n: "Test Rack", h: 42, w: 19, d: [] }, dt: [] };
export const EMPTY_RACK_SHARE = encodeMinimal(EMPTY_RACK_MINIMAL);

// In test:
await gotoWithRack(page, EMPTY_RACK_SHARE);
```

**This is an excellent pattern for a client-side SPA.** It is:

- **Fast:** No API calls, no wizard flow, instant state hydration
- **Deterministic:** The exact same layout loads every time
- **Self-contained:** No external database or server state
- **Production-accurate:** Uses the same share-link mechanism users use

### 3.2 Programmatic Factory Builders

For tests that need varied data, factory functions create layouts on the fly:

```typescript
// Could extend current pattern
function createTestLayout(overrides?: Partial<MinimalLayout>): string {
  const layout: MinimalLayout = {
    v: APP_VERSION,
    n: overrides?.n ?? "Test Layout",
    r: { n: "Rack", h: 42, w: 19, d: [], ...overrides?.r },
    dt: overrides?.dt ?? [],
  };
  return encodeMinimal(layout);
}

// Usage
await gotoWithRack(page, createTestLayout({
  r: { n: "Full Rack", h: 42, w: 19, d: [
    { t: "dell-r750", p: 1, f: "front" },
    { t: "dell-r750", p: 3, f: "front" },
  ]},
}));
```

Rackula's `test-layouts.ts` already does a lightweight version of this with spread operators. A dedicated factory function would make it more flexible for tests that need specific device configurations.

### 3.3 Playwright `test.extend()` Fixtures

Playwright's built-in fixture system can wrap the share-link pattern:

```typescript
// e2e/helpers/base-test.ts (extend existing)
type TestFixtures = {
  emptyRack: void;       // navigates to empty rack
  rackWithDevice: void;  // navigates to rack with one device
};

export const test = base.extend<TestFixtures>({
  context: async ({ context }, use) => {
    await context.addInitScript(`delete window.showOpenFilePicker; ...`);
    await use(context);
  },
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

This would replace the `beforeEach` pattern in each test file with a declarative fixture:

```typescript
test('can select device', async ({ page, rackWithDevice }) => {
  // page is already at the rack-with-device URL
  await selectDevice(page, 0);
});
```

**Source:** [Playwright Fixtures docs](https://playwright.dev/docs/test-fixtures), [Checkly Fixtures Guide](https://www.checklyhq.com/docs/learn/playwright/test-fixtures/)

### 3.4 API Seeding

Not applicable to Rackula. The app is a client-side SPA with no backend database. The share-link approach is the SPA equivalent of API seeding.

### 3.5 Trade-off Summary for Client-Side SPAs

| Strategy | Speed | Flexibility | Maintenance | Best For |
|----------|-------|-------------|-------------|----------|
| Pre-encoded share links | Fastest | Limited | Low | Standard scenarios |
| Factory builders | Fast | High | Medium | Varied configurations |
| Playwright fixtures | Fast | High | Medium | Declarative test setup |
| Wizard interaction | Slowest | Highest | High | Testing the wizard itself |

**Recommendation:** Keep pre-encoded share links as the primary strategy. Add a `createTestLayout()` factory for tests that need non-standard configurations. Consider wrapping both in Playwright fixtures for cleaner test declarations.

---

## 4. Svelte E2E Patterns

### 4.1 Svelte's Official Stance

Svelte's testing documentation is deliberately framework-agnostic for E2E tests. The official position: "E2E tests are unaware of Svelte as a framework -- you interact with the DOM and write assertions." This means there are no Svelte-specific Playwright APIs or patterns to follow.

**Source:** [Svelte Testing docs](https://svelte.dev/docs/svelte/testing), [Svelte CLI Playwright docs](https://svelte.dev/docs/cli/playwright)

### 4.2 Svelte-Specific Considerations

**Reactivity timing:** Svelte 5's runes (`$state`, `$derived`) batch updates. After triggering an action, always use Playwright's built-in auto-waiting rather than manual timeouts:

```typescript
// Good: Playwright auto-waits for visibility
await expect(page.getByTestId('rack-device')).toBeVisible();

// Bad: Manual wait
await page.waitForTimeout(500);
await expect(page.getByTestId('rack-device')).toBeVisible();
```

**Component boundaries are invisible:** Unlike React (where you might query by component name), Svelte compiles components into vanilla DOM. You cannot locate "the RackCanvas component." You locate the DOM elements it produces. This makes `data-testid` and ARIA roles even more important as stable anchors.

**`{#if}` blocks and transitions:** Svelte's conditional rendering and transitions mean elements may be in the DOM but transitioning. Playwright's `toBeVisible()` handles this correctly (waits for opacity, display, etc.).

### 4.3 How SvelteKit Projects Structure E2E Tests

The SvelteKit template (from `create-svelte`) places Playwright tests in a top-level `e2e/` or `tests/` directory with `playwright.config.ts` at the root. This is exactly what Rackula does. The common patterns are:

- `e2e/*.spec.ts` for test files
- `e2e/helpers/` or `e2e/fixtures/` for shared utilities
- `playwright.config.ts` with `webServer` pointing to `npm run dev` or `npm run preview`

Rackula's structure already follows established Svelte community conventions.

### 4.4 Notable Svelte Projects Using Playwright

SvelteKit itself uses Playwright for its own E2E test suite. The tests interact purely with the DOM and use locators like `page.getByText()`, `page.locator()`, and `page.getByRole()` -- confirming that no special Svelte adapter is needed.

**Source:** [E2E Testing with SvelteKit and Playwright (Okupter)](https://www.okupter.com/blog/e2e-testing-with-sveltekit-and-playwright), [Mock Database in Svelte E2E Tests (Mainmatter)](https://mainmatter.com/blog/2025/08/21/mock-database-in-svelte-tests/)

---

## 5. Migration Strategy: CSS Classes to data-testid / Accessible Selectors

### 5.1 Current State in Rackula

Rackula's E2E tests use a mix of selector strategies:

| Current Pattern | Count (approx.) | Risk Level |
|-----------------|-----------------|------------|
| `.class-name` CSS selectors | High (primary pattern) | High -- breaks on CSS refactors |
| `page.click('button[aria-label="..."]')` | Medium | Good -- accessible |
| `page.getByTestId('...')` | Low (toolbar only) | Good -- stable |
| `page.locator('[data-accordion-trigger]')` | Low | Medium -- coupled to bits-ui internals |

Examples of fragile selectors currently in use:
- `.rack-container`, `.rack-device`, `.rack-svg`, `.rack-front`
- `.device-palette`, `.device-palette-item`
- `.toolbar`, `.rack-dual-view-name`
- `aside.drawer-right.open`
- `.menu-item:has-text("Save")`

### 5.2 Incremental Migration Strategy

**Phase 1: Centralise selectors (no component changes needed)**

Create a single `e2e/helpers/locators.ts` file that maps all CSS selectors to named constants:

```typescript
// e2e/helpers/locators.ts
export const LOCATORS = {
  rack: {
    container: '.rack-container',
    device: '.rack-device',
    svg: '.rack-svg',
    front: '.rack-front',
    dualViewName: '.rack-dual-view-name',
  },
  palette: {
    root: '.device-palette',
    item: '.device-palette-item',
  },
  toolbar: {
    root: '.toolbar',
  },
  drawer: {
    open: 'aside.drawer-right.open',
  },
} as const;
```

**Why this first:** It creates a single file to update when selectors change, without touching any components. All existing tests continue to work.

**Phase 2: Add `data-testid` to SVG/structural elements**

For elements that cannot use `getByRole()` (SVG containers, canvas areas, structural dividers), add `data-testid` attributes to the Svelte components:

```svelte
<!-- Before -->
<div class="rack-container">

<!-- After -->
<div class="rack-container" data-testid="rack-container">
```

Then update `locators.ts` to use the test IDs:

```typescript
rack: {
  container: '[data-testid="rack-container"]',  // was: '.rack-container'
  // or better, update helpers to use:
  // page.getByTestId('rack-container')
}
```

**Phase 3: Replace CSS selectors with accessible locators where possible**

For interactive elements (buttons, inputs, links), replace CSS selectors with `getByRole()`:

```typescript
// Before
await page.locator('.menu-item:has-text("Save")').click();

// After
await page.getByRole('menuitem', { name: 'Save' }).click();
```

```typescript
// Before
await expect(page.locator('aside.drawer-right.open')).toBeVisible();

// After
await expect(page.getByRole('complementary', { name: 'Device details' })).toBeVisible();
```

**Phase 4: Remove CSS class selectors from test code**

Once `data-testid` and `getByRole()` cover all elements, remove the CSS class selectors. This is when you can freely refactor CSS classes without test breakage.

### 5.3 Migration Order (What to Tackle First)

Prioritise by brittleness and frequency of use:

1. **Helpers first** -- `device-actions.ts`, `toolbar-actions.ts`, `rack-setup.ts` use the most selectors and are imported by many tests. Migrating these has the highest leverage.
2. **Structural containers** -- `.rack-container`, `.device-palette`, `.toolbar` break on any CSS reorganisation. Add `data-testid`.
3. **Interactive elements** -- Buttons and form inputs should migrate to `getByRole()`.
4. **Spec files last** -- Most spec files use helpers, so they get migrated transitively.

### 5.4 Tooling

**No off-the-shelf codemod exists** for this specific migration. However:

- **eslint-plugin-playwright** (`plugin:playwright/recommended`) can enforce best practices and flag deprecated patterns.
- **Custom ESLint rule:** You could write a rule (or use `no-restricted-syntax`) to warn on `page.locator('.')` patterns (CSS class selectors in test files):

```javascript
// .eslintrc additions for e2e files
'no-restricted-syntax': ['warn', {
  selector: 'CallExpression[callee.property.name="locator"][arguments.0.value=/^\\./]',
  message: 'Prefer getByTestId() or getByRole() over CSS class selectors in E2E tests.',
}]
```

- **ast-grep** could find and report all CSS class selectors across E2E files for tracking migration progress.
- **grep-based progress tracking:** A simple `grep -c '\\.locator.*\\.' e2e/` before and after gives migration metrics.

### 5.5 Common Migration Pitfalls

| Pitfall | Mitigation |
|---------|------------|
| Adding `data-testid` to every element | Only add where no semantic locator works |
| Breaking tests during migration | Migrate one helper file at a time, run tests after each |
| `data-testid` in production builds | Keep them; they cost ~0 bytes gzipped and aid debugging. Stripping is premature optimisation |
| Over-relying on `getByText()` | Text changes with copy updates; prefer `getByRole()` with `{ name: }` |
| Forgetting `page.evaluate()` selectors | The `dragDeviceToRack` helper uses `document.querySelectorAll('.device-palette-item')` inside `page.evaluate()`. These cannot use Playwright locators and need `data-testid` attributes in the DOM |

**Source:** [Playwright Other Locators](https://playwright.dev/docs/other-locators), [BrowserStack Playwright Selectors 2026](https://www.browserstack.com/guide/playwright-selectors), [Houseful Playwright Standards](https://www.houseful.blog/posts/2023/playwright-standards/)

---

## 6. Concrete Recommendations for Rackula

### Decision Matrix

| Question | Recommendation | Confidence |
|----------|---------------|------------|
| POM or functional helpers? | **Functional helpers** (keep current approach) | High |
| Primary selector strategy? | **`getByRole()` for interactive, `getByTestId()` for SVG/structural** | High |
| `data-testid` naming? | **kebab-case with scope prefix** (`rack-canvas`, `sidebar-tab-racks`) | High |
| Test fixture approach? | **Keep share-link fixtures, add factory builder** | High |
| Centralise locators first? | **Yes, `locators.ts` file before adding test IDs** | High |
| Strip `data-testid` in prod? | **No, keep them** | High |
| Migrate all at once? | **No, incremental (helpers first, spec files last)** | High |

### Priority Actions

1. Create `e2e/helpers/locators.ts` to centralise all CSS class selectors
2. Add `data-testid` to SVG structural elements (rack canvas, device slots, drop zones)
3. Migrate `toolbar-actions.ts` fully to `getByRole()` / `getByTestId()` (it already partially uses `getByTestId`)
4. Migrate `device-actions.ts` (highest impact helper)
5. Add `createTestLayout()` factory function to `test-layouts.ts`
6. Add ESLint rule to warn on new CSS class selectors in E2E files

---

## Sources

- [Playwright Locators Documentation](https://playwright.dev/docs/locators)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Page Object Models](https://playwright.dev/docs/pom)
- [Playwright Test Fixtures](https://playwright.dev/docs/test-fixtures)
- [Playwright Other Locators](https://playwright.dev/docs/other-locators)
- [BrowserStack: 15 Playwright Selector Best Practices 2026](https://www.browserstack.com/guide/playwright-selectors-best-practices)
- [BrowserStack: Playwright Selectors Types and Best Practices 2026](https://www.browserstack.com/guide/playwright-selectors)
- [Momentic: Playwright Locators Guide](https://momentic.ai/blog/playwright-locators-guide)
- [Better Stack: 9 Playwright Best Practices](https://betterstack.com/community/guides/testing/playwright-best-practices/)
- [Cam McHenry: How I Write Accessible Playwright Tests](https://camchenry.com/blog/how-i-write-accessible-playwright-tests)
- [Murat Ozcan: Page Objects vs Functional Helpers (DEV Community)](https://dev.to/muratkeremozcan/page-objects-vs-functional-helpers-2akj)
- [James Kip: Functional Page Model for Playwright (Medium)](https://medium.com/@jameskip/functional-page-model-for-playwright-a-scalable-alternative-to-classic-pom-007d8ec26333)
- [Houseful: Playwright Testing Standards](https://www.houseful.blog/posts/2023/playwright-standards/)
- [Checkly: Reuse Code with Custom Test Fixtures](https://www.checklyhq.com/docs/learn/playwright/test-fixtures/)
- [Svelte Testing Documentation](https://svelte.dev/docs/svelte/testing)
- [Svelte CLI Playwright](https://svelte.dev/docs/cli/playwright)
- [Okupter: E2E Testing with SvelteKit and Playwright](https://www.okupter.com/blog/e2e-testing-with-sveltekit-and-playwright)
- [Mainmatter: Mock Database in Svelte E2E Tests](https://mainmatter.com/blog/2025/08/21/mock-database-in-svelte-tests/)
- [Kyrre Gjerstad: Pragmatic Guide to Playwright Testing](https://www.kyrre.dev/blog/the-pragmatic-guide-to-playwright-testing)
- [Mark Noonan: Why I Rarely Use getByRole (DEV Community)](https://dev.to/marktnoonan/why-i-rarely-use-getbyrole-testing-library-and-the-first-rule-of-aria-4581)
- [Shopware: E2E Testing Best Practices](https://developer.shopware.com/frontends/best-practices/testing/e2e-testing.html)
