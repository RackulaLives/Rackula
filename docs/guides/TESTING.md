# Testing Guidelines

This document describes the testing patterns, conventions, and best practices for the Rackula project.

---

## ⚠️ MANDATORY Testing Rules

**BEFORE writing any test**, read the mandatory testing rules in **[CLAUDE.md - Testing Rules (MANDATORY)](../../CLAUDE.md#testing-rules-mandatory)**.

### Quick Summary

**NEVER write tests that:**

- Assert exact lengths on data arrays (breaks on data additions) - see [exception below](#exact-length-assertions)
- Assert hardcoded color values (breaks on design changes)
- Check if a function exists (TypeScript does this)
- Assert CSS class names (tests implementation details)
- Test that a component renders (TypeScript ensures this)
- Test DOM structure with querySelector (fragile, implementation-specific)
- Duplicate schema validation (Zod already validates)

#### Exact Length Assertions

**The rule:** Avoid `expect(array).toHaveLength(literal)` on data arrays.

**Why:** Adding a device to a brand pack shouldn't break tests.

**Exception:** Behavioral invariants are okay with inline justification:

```typescript
// ✅ GOOD - Behavioral invariant with justification
it("removes duplicate devices from selection", () => {
  const devices = [device1, device1, device2];
  const result = deduplicateDevices(devices);
  // eslint-disable-next-line no-restricted-syntax -- deduplication should leave exactly 2 unique devices
  expect(result).toHaveLength(2);
});

// ✅ GOOD - Pagination behavior
it("returns exactly 10 items per page", () => {
  const items = Array(25)
    .fill(null)
    .map((_, i) => createItem(i));
  const page1 = paginate(items, { page: 1, pageSize: 10 });
  // eslint-disable-next-line no-restricted-syntax -- pagination invariant: 10 items per page
  expect(page1).toHaveLength(10);
});

// ❌ BAD - Data array assertion
it("loads all Dell devices", () => {
  const devices = loadDellDevices();
  expect(devices).toHaveLength(68); // Breaks when Dell adds a new device
});

// ✅ BETTER - Test existence, not count
it("loads Dell devices", () => {
  const devices = loadDellDevices();
  expect(devices.length).toBeGreaterThan(0);
  expect(devices.every((d) => d.manufacturer === "Dell")).toBe(true);
});
```

### Why These Rules Exist

In January 2026, the project had:

- **136 unit test files** (45,997 LOC)
- **Test:source ratio of 1.24:1** (more test code than source code)
- **OOM crashes** during test execution
- **High token usage** in Claude Code sessions

We deleted **78 low-value test files** (57% reduction) that tested implementation details rather than behavior. The remaining **58 test files** focus on:

- Store logic (pure functions, stable API)
- Core algorithms (collision detection, schemas)
- E2E user flows (real user behavior)

**Enforcement:** See [CLAUDE.md - Enforcement](../../CLAUDE.md#enforcement) for ESLint hard-blocks that prevent anti-patterns.

---

## Environments

| Environment | URL                  | Purpose                                  |
| ----------- | -------------------- | ---------------------------------------- |
| **Local**   | `localhost:5173`     | Development with HMR (`npm run dev`)     |
| **Dev**     | https://dev.racku.la | Preview production builds before release |
| **Prod**    | https://app.racku.la | Live production environment              |

### Dev Environment

The dev environment auto-deploys on every push to `main`:

```
Push to main → Lint → Test → Build → Deploy to GitHub Pages
```

Use it to:

- Test production builds in a real environment
- Share preview links with stakeholders
- Catch build-time issues before releasing

**Note:** Dev deployment only succeeds if lint and tests pass.

### Required CI Checks

Branch protection should require the core CI validation check from `.github/workflows/test.yml`:

- **Check name:** `Test / validate`

This check runs on:

- Pull requests targeting `main` (pre-merge gate)
- Pushes to `main` (post-merge validation)

## Philosophy

We follow the **Testing Trophy** approach:

- **E2E tests** (few) - Critical user journeys only
- **Integration tests** (most) - Component behavior with stores
- **Unit tests** (some) - Pure functions and utilities
- **Static analysis** (base) - TypeScript + ESLint

Tests should be **behavior-driven**, focusing on what the user sees and experiences rather than implementation details.

## Running Tests

```bash
# Unit tests (watch mode)
npm run test

# Unit tests (CI mode)
npm run test:run

# Unit tests with coverage
npm run test:coverage

# E2E tests
npm run test:e2e
```

## Project Structure

```
src/tests/                    # Centralized unit/integration tests
├── factories.ts              # Shared test data factories
├── mocks/
│   └── browser.ts            # Browser API mocks (Canvas, FileReader, etc.)
├── helpers/
│   └── TestAccordion.svelte  # Test wrapper components
├── setup.ts                  # Vitest setup (jsdom, matchers)
├── setup.test.ts             # Verify test environment
├── *.test.ts                 # Test files
e2e/                          # Playwright E2E tests
├── *.spec.ts                 # E2E test specs
```

## Test File Naming

- **Unit/Integration tests**: `*.test.ts` in `src/tests/`
- **E2E tests**: `*.spec.ts` in `e2e/`

## Writing Tests

### Test Structure (AAA Pattern)

```typescript
it("adds device to rack when placed", () => {
  // Arrange
  const store = getLayoutStore();
  const deviceType = createTestDeviceType({ u_height: 2 });

  // Act
  store.addDeviceTypeRecorded(deviceType);
  store.placeDeviceRecorded(deviceType.slug, 10);

  // Assert
  expect(store.rack.devices).toHaveLength(1);
  expect(store.rack.devices[0]?.position).toBe(10);
});
```

### Using Test Factories

Always use the centralized factories instead of inline mocks:

```typescript
import { createTestRack, createTestDeviceType, createTestDevice, createMockCommand } from './factories';

// Good - uses factory
const deviceType = createTestDeviceType({ u_height: 2, category: 'server' });

// Avoid - inline mock
const deviceType = { slug: 'test', u_height: 2, ... };
```

Available factories:

- `createTestRack(overrides?)` - Creates a test Rack
- `createTestDeviceType(overrides?)` - Creates a test DeviceType
- `createTestDevice(overrides?)` - Creates a test PlacedDevice
- `createMockCommand(description, type?)` - Creates a mock Command
- `createTestLayout(overrides?)` - Creates a complete Layout
- `createTestDeviceLibrary()` - Creates multiple test DeviceTypes

### Testing Svelte 5 Runes

For components using `$state`, `$derived`, or `$effect`:

```typescript
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import MyComponent from "$lib/components/MyComponent.svelte";

it("updates state when button clicked", async () => {
  const user = userEvent.setup();
  render(MyComponent, { props: { initialCount: 0 } });

  await user.click(screen.getByRole("button", { name: "Increment" }));

  expect(screen.getByText("Count: 1")).toBeInTheDocument();
});
```

### Testing Command Pattern (Undo/Redo)

Commands should have symmetrical execute/undo:

```typescript
it("can be undone after execution", () => {
  const store = createMockStore();
  const command = createAddDeviceTypeCommand(deviceType, store);

  command.execute();
  expect(store.addDeviceTypeRaw).toHaveBeenCalledWith(deviceType);

  command.undo();
  expect(store.removeDeviceTypeRaw).toHaveBeenCalledWith(deviceType.slug);
});
```

### Using Browser Mocks

For tests requiring browser APIs:

```typescript
import { setupBrowserMocks, createMockFile } from "./mocks/browser";

describe("Image Upload", () => {
  beforeEach(() => {
    setupBrowserMocks();
  });

  it("handles file upload", async () => {
    const file = createMockFile("test.png", "image/png");
    // ... test file handling
  });
});
```

## E2E Testing

### Browser Projects

The Playwright configuration supports multiple browser projects:

| Project          | Browser                  | Use Case                      |
| ---------------- | ------------------------ | ----------------------------- |
| `chromium`       | Chrome                   | Default desktop testing       |
| `webkit`         | Safari                   | Desktop Safari testing        |
| `ios-safari`     | WebKit (iPhone 14)       | iOS Safari viewport tests     |
| `ipad`           | WebKit (iPad Pro 11)     | iPad viewport tests           |
| `android-chrome` | Chromium (Pixel 7)       | Android Chrome viewport tests |
| `android-tablet` | Chromium (Galaxy Tab S4) | Android tablet viewport tests |

Run specific projects:

```bash
npx playwright test --project=chromium        # Desktop Chrome only
npx playwright test --project=ios-safari      # iOS Safari tests
npx playwright test --project=android-chrome  # Android Chrome tests
npx playwright test ios-safari.spec.ts        # Run specific test file
npx playwright test android-chrome.spec.ts    # Run Android test file
```

### CI tiers (two-tier E2E model)

E2E coverage in CI has three layers (spike #1994):

| Tier     | Runner          | Browsers       | When                      | Approval        |
| -------- | --------------- | -------------- | ------------------------- | --------------- |
| Baseline | `ubuntu-latest` | chromium smoke | Every PR (`validate` job) | None            |
| Trusted  | `ci-runner`     | full suite     | Main-repo PRs (auto)      | None            |
| Approval | `ci-runner`     | full suite     | Fork PRs                  | `ggfevans` gate |

The baseline chromium smoke runs on GitHub-hosted runners for all PRs. The
`e2e-self-hosted` job runs the full browser suite on the self-hosted `ci-runner`
only after the baseline passes (`needs: validate`). The job selects its
environment from the PR source:

```yaml
environment: ${{ github.event.pull_request.head.repo.full_name == 'RackulaLives/Rackula' && 'e2e-trusted' || 'e2e-approval' }}
```

PRs from a branch in `RackulaLives/Rackula` resolve to `e2e-trusted` and run
without delay. Fork PRs (including forks owned by org members) resolve to
`e2e-approval`, which pauses until `ggfevans` reviews the diff and approves.
This keeps untrusted code off the homelab runner without an explicit human OK.

Maintainer prerequisites (one-time, in repo settings):

- GitHub Environment `e2e-trusted`: no required reviewers, deployment branch
  policy restricted to `main`.
- GitHub Environment `e2e-approval`: `ggfevans` as the required reviewer, no
  branch restriction (fork PRs run from arbitrary branches).
- Self-hosted runner online advertising the `ci-runner` label.

### iOS Safari Testing

The `e2e/ios-safari.spec.ts` tests mobile Safari functionality:

- FAB button visibility and 48px touch targets
- Bottom sheet open/close behavior
- Device label positioning
- No horizontal scroll on all iOS viewports

**Note:** Playwright WebKit is a desktop build. For real iOS device testing, use BrowserStack.

### Android Chrome Testing

The `e2e/android-chrome.spec.ts` tests Android Chrome functionality:

- FAB button visibility and touch targets across device fragmentation
- Bottom sheet behavior (swipe-to-dismiss without triggering back gesture)
- Device label positioning across different DPI densities
- Haptic feedback (Android supports `navigator.vibrate()`)
- Touch interaction accuracy on various OEM devices
- Long-press gesture without triggering system context menu
- WebView compatibility smoke tests
- Foldable device support (Galaxy Z Fold/Flip)

**Android-Specific Considerations:**
| Aspect | iOS | Android |
|--------|-----|---------|
| Haptic API | Not supported | Supported ✓ |
| Device fragmentation | Low (Apple only) | High (many OEMs) |
| WebView versions | Safari-based, unified | Varies by device/OS |
| DPI densities | Limited (1x, 2x, 3x) | ldpi to xxxhdpi |

**Note:** Playwright Chromium is a desktop build. For real Android device testing, use BrowserStack.

### Accessibility Scans (axe-core)

`e2e/axe.spec.ts` runs axe-core (via `@axe-core/playwright`) against the key
surfaces and fails CI on any WCAG 2.2 AA violation. It is a guard rail for the UX
overhaul (epic #2017): the shell rework touches keyboard navigation extensively,
and these scans catch static, machine-detectable regressions (contrast, names,
roles, attributes) that manual review would miss.

This is the automated-scan layer. Behavioural a11y (keyboard paths, focus
trapping, landmark naming) lives in `e2e/accessibility.spec.ts`; axe cannot
observe those, so the two suites are complementary.

The scans run on their own config (`e2e/playwright.a11y.config.ts`, Chromium
only, no retries) and their own CI job (`a11y (axe-core)` in `test.yml`):

```bash
npm run test:e2e:a11y
```

Current scans: populated canvas with a selected device, the sidebar's Devices
and Racks tabs, and the Export and Share dialogs.

Adding a scan when a new surface lands:

1. Open the surface in a test (reuse the shared `e2e/helpers`), then scope a scan
   to it:

   ```typescript
   import { expectNoA11yViolations } from "./helpers/a11y";

   test("side panel has no WCAG 2.2 AA violations", async ({ page }) => {
     await gotoWithRack(page);
     const selector = '[data-testid="side-panel"]';
     await expect(page.locator(selector)).toBeVisible();
     // expectNoA11yViolations takes a CSS selector string, not a Locator;
     // omit the second argument to scan the whole page.
     await expectNoA11yViolations(page, selector);
   });
   ```

2. Run `npm run test:e2e:a11y` and fix any violation it reports.
3. If a violation genuinely cannot be fixed in the same slice, baseline the rule
   in `e2e/helpers/a11y.ts` (`BASELINED_RULES`) with a tracking issue link, and
   open that issue. A baseline disables that rule for every scan, so a fresh
   violation of a baselined rule will not be caught until the rule is re-enabled:
   keep the list short and remove each entry as soon as its issue closes.

### Real Device Testing (BrowserStack)

For comprehensive mobile testing on real iOS and Android devices, use BrowserStack integration.

**Setup:**

1. Set environment variables: `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`
2. Configuration is in `browserstack.yml`

**Running tests on real devices:**

```bash
# iOS Safari on real devices
npx browserstack-node-sdk playwright test ios-safari.spec.ts

# Android Chrome on real devices
npx browserstack-node-sdk playwright test android-chrome.spec.ts

# All mobile tests on all devices
npx browserstack-node-sdk playwright test
```

**Configured devices:**

| Platform   | Devices                                          |
| ---------- | ------------------------------------------------ |
| iOS 17     | iPhone 15, iPhone 15 Pro Max, iPad Pro 12.9 2022 |
| Android 14 | Google Pixel 8, Samsung Galaxy S24               |
| Android 13 | Samsung Galaxy Tab S9                            |

**GitHub Actions:** Secrets `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` are configured for CI.

### Selector Strategy

Locate elements by what the user perceives (role, label, text), not by how they
are styled. CSS class selectors are brittle: a styling rename silently breaks the
test. Prefer, in this order:

1. `getByRole()` with an accessible name, e.g.
   `page.getByRole("dialog", { name: "About Rackula" })`. This doubles as an
   accessibility check.
2. `getByLabel()` / `getByText()` for form fields and visible copy.
3. `getByTestId()` (`data-testid`) for structural anchors that have no natural
   role or label, e.g. the rack canvas or a toast container.

```typescript
// Good - role/label/testid
await page.getByRole("button", { name: "New Rack" }).click();
await page.getByLabel("IP Address/Hostname").fill("192.168.1.1");
await page.getByTestId("btn-new-rack").click();

// Avoid - CSS class selector (breaks on styling changes)
await page.locator(".toolbar-action-btn").click();
```

Reusable selector strings (structural anchors and the few intentional class
selectors that have no role) live in `e2e/helpers/locators.ts`. Reference that
registry rather than hard-coding `data-testid` lists here, which drift as the UI
changes. Interactive controls are not listed there: reach them with
`getByRole`/`getByLabel` at the call site.

`label:has-text("...")` is a Playwright text-engine locator, not a CSS class
selector, and is fine to use.

#### Selecting palette devices by name

The Devices palette is virtualized (#2094): lists over 30 rows window their
content, so off-screen rows unmount, and a pinned device renders twice (once in
the favourites section, once in its category). Positional indexing
(`.nth(index)`) is therefore unreliable. Select a palette device by its visible
name instead:

```typescript
import { dragDeviceToRack, paletteItemByName } from "./helpers";

// Drag a specific device by name (preferred over deviceIndex)
await dragDeviceToRack(page, { deviceName: "Test Server" });

// Locate a palette item by name (scope to favourites first if pinned)
await expect(paletteItemByName(page, "Test Server")).toBeVisible();
```

#### Multi-context tests (twin-tab, restore)

The M14 shell adds layout tabs (#2079), so some flows need more than one page on
the same origin: the twin-tab guard (#2044) and lazy tab restore (#2080). The
`e2e/helpers/multi-context.ts` helpers wrap that: `openSecondTab` opens a second
page in the same browser context (shared localStorage and `storage` events),
`collectStorageEvents` records the cross-tab events the guard reacts to, and
`snapshotStorage` captures `storageState` so a relaunch can be modelled with a
fresh context. See `e2e/multi-context.spec.ts` for worked examples.

The full carry-over audit, naming convention for new testids, the multi-context
harness design, and the per-slice rewrite-or-delete decisions live in
[`docs/research/spike-2183-e2e-shell-strategy.md`](../research/spike-2183-e2e-shell-strategy.md).

#### Lint enforcement

ESLint blocks new CSS class selectors in `e2e/**/*.ts`. A string literal passed
to `.locator()` that starts with `.` (e.g. `page.locator(".rack-header")`) fails
lint. The rule does not flag the `locators` registry, `getByRole`/`getByTestId`/
`getByLabel`/`getByText`, attribute/id/tag selectors, or `:has-text()`. To fix a
violation, switch to a role/label/testid locator, or add the selector to
`e2e/helpers/locators.ts` if it is a genuine structural anchor.

### E2E Test Structure

```typescript
import { test, expect } from "@playwright/test";

test.describe("Feature", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Common setup
  });

  test("user can complete workflow", async ({ page }) => {
    // Arrange
    await page.getByTestId("btn-new-rack").click();

    // Act
    await page.getByLabel("Rack Name", { exact: true }).fill("Test Rack");
    await page.getByTestId("btn-create-rack").click();

    // Assert
    await expect(page.getByText("Test Rack")).toBeVisible();
  });
});
```

### E2E Test Helpers

All E2E tests should use the shared helpers in `e2e/helpers/`:

#### Loading a Test Rack

**DO NOT** manipulate localStorage/sessionStorage directly. Use the share link pattern:

```typescript
import { gotoWithRack, EMPTY_RACK_SHARE } from "./helpers";

test.beforeEach(async ({ page }) => {
  // Loads app with pre-built 42U rack via ?l= share param
  await gotoWithRack(page);
});
```

Available fixtures:

- `EMPTY_RACK_SHARE` - 42U standard rack, empty
- `SMALL_RACK_SHARE` - 12U rack, empty
- `RACK_WITH_DEVICE_SHARE` - 42U with one 1U server

#### Device Actions

```typescript
import {
  dragDeviceToRack,
  selectDevice,
  deselectDevice,
  deleteSelectedDevice,
} from "./helpers";

// Drag first palette device to rack at 10% from top
await dragDeviceToRack(page);

// Drag to specific position
await dragDeviceToRack(page, { yOffsetPercent: 80 });

// Select device (handles dual-view mode)
await selectDevice(page, 0);

// Deselect with Escape
await deselectDevice(page);

// Remove selected device from rack
await deleteSelectedDevice(page);
```

#### Wizard Completion

For tests that specifically test the wizard:

```typescript
import {
  completeWizardWithKeyboard,
  completeWizardWithClicks,
} from "./helpers";

// Keyboard-driven (fast)
await completeWizardWithKeyboard(page, { name: "My Rack", heightPreset: 4 });

// Click-driven (when testing specific UI elements)
await completeWizardWithClicks(page, { name: "My Rack", height: 42 });
```

### Visual Regression Tests

`e2e/visual-regression.spec.ts` is a tripwire suite: a small, stable set of
screenshot snapshots of key UI states (welcome canvas, populated rack in light
and dark themes, display modes, sidebar tabs, and the export, share, import,
file, and settings surfaces). It catches unintended visual drift while the shell
is rebuilt in slices (epic #2017). It is not pixel-perfect coverage; keep the
set small.

The suite has its own config, `e2e/playwright.visual.config.ts`, with a fixed
1280x720 viewport, reduced motion, frozen animations, and pinned theme. It runs
chromium-only as the `visual` job in `.github/workflows/test.yml` on every pull
request.

Run it locally:

```bash
npm run test:e2e:visual          # compare against committed baselines
npm run test:e2e:visual:update   # regenerate baselines
```

Baselines are OS-specific: font hinting and anti-aliasing differ between Linux,
macOS, and Windows, so a macOS baseline will never match the Linux CI runner.
The committed baselines are therefore Linux-only, generated in CI. Snapshot
filenames are suffixed with the platform, and `.gitignore` excludes the
`-darwin` and `-win32` copies a local run produces, so running
`test:e2e:visual:update` on your machine is safe: it cannot clobber the
committed Linux set.

Update flow for an intentional visual change:

1. Push your change. The `visual` CI job fails and uploads the diff images
   (`-actual`, `-expected`, `-diff`) as the `visual-regression-diff` artifact.
2. Review the diff to confirm the change is intended.
3. Run the "Update Visual Snapshots" workflow (Actions tab, "Run workflow", pick
   your branch). It regenerates the Linux baselines and uploads them as the
   `visual-baselines` artifact.
4. Download `visual-baselines`, replace `e2e/__screenshots__` in your branch
   with its contents, then commit and push. Committing yourself (rather than a
   bot push) keeps the workflow read-only and retriggers the `visual` check.

Dynamic regions (the app version string and "last saved" timestamps) are masked
so they never trip the diff.

### Performance Budget

`scripts/check-bundle-budget.ts` is a guard rail for the UX overhaul (epic #2017,
issue #2185): the shell rework adds UI surface (side panel, tab strip, the
dialog system, command and app menus), and this gate keeps the initial-load
bundle from regressing as those slices land. It is the performance counterpart
to the visual-regression and axe-core guard rails.

It measures the gzipped size of the initial-load graph, the entry script plus
every modulepreloaded chunk plus the linked stylesheet, read straight from the
built `dist/index.html` so it stays correct as content hashes and chunk
boundaries change. Gzip is used because production is served compressed, so
transfer size is what blocks first paint.

It runs chromium-free as the `bundle budget` job in
`.github/workflows/performance-budget.yml` on every pull request. Run it locally:

```bash
npm run build && npm run check:bundle-budget
```

The budget lives in `performance-budget.json`:

| Field            | Meaning                                                   |
| ---------------- | --------------------------------------------------------- |
| `baseline`       | Raw gzipped size of the recorded build, per entry         |
| `headroom`       | Room each entry may grow over its baseline before failing |
| `toleranceBytes` | Extra slack absorbing minifier and dependency noise       |

The enforced threshold for an entry is `baseline + headroom`; a build fails only
when a measurement exceeds that threshold by more than `toleranceBytes`. The
recorded baseline is the initial-load graph measured before the M14 shell work
(`initialJs` ~321 KiB, `initialCss` ~23 KiB, `initialTotal` ~345 KiB gzipped).
Headroom (`initialJs` ~30 KiB, `initialCss` ~8 KiB) is deliberate: it lets the
shell grow within a known envelope while still catching a runaway regression.
The decision logic lives in `src/lib/utils/bundle-budget.ts` and is unit tested
in `src/tests/bundle-budget.test.ts`.

When a shell slice legitimately grows the bundle past budget, justify the growth
in the PR and rebaseline:

```bash
npm run build && npm run check:bundle-budget -- --update
```

`--update` rewrites only `baseline` from the current build; it keeps `headroom`
and `toleranceBytes`, so an intentional increase is recorded explicitly in the
diff rather than slipping in silently.

#### Runtime Performance Baseline

The bundle budget is the automated, deterministic gate. Runtime timings (initial
render, palette scroll with a large library, tab switch, dialog open) are
recorded as a manual baseline rather than enforced in CI, because frame timings
on shared CI runners are too noisy to gate on without false failures.

Capture them locally against a production build using the test-data generators
in `scripts/performance-benchmark.ts` and the Chrome DevTools Performance panel
(method and current numbers: `docs/research/performance-baseline.md`). Targets:
initial render under 16 ms (60 fps), pan and zoom under 16 ms per frame, and
under 50 MB heap for a full rack with ports. Re-measure when a shell slice
changes rendering or interaction, and update the baseline doc if the envelope
shifts intentionally.

## Coverage

Coverage thresholds are configured in `vitest.config.ts`:

```
Statements: 75%
Branches: 70%
Functions: 75%
Lines: 75%
```

Run coverage report:

```bash
npm run test:coverage
```

## Test Economics

Not all tests provide equal value. Focus testing effort where bugs are likely and costly.

### High-Value Tests (Write More)

| Area               | Why                  | Example                                    |
| ------------------ | -------------------- | ------------------------------------------ |
| Complex algorithms | High bug density     | Collision detection, coordinate transforms |
| State machines     | Many edge cases      | Undo/redo, drag-drop state                 |
| User flows         | User-facing impact   | Place device → move → delete               |
| Error recovery     | Often untested       | Invalid file load, network failure         |
| Integration points | Interface mismatches | Store ↔ component sync                     |

### Data format and persistence regression coverage

Save and load are user-facing workflows where a silent format change can lose
data. The following suites guard the YAML save/reload and legacy ZIP load paths
and run in CI with every test run:

| File                                       | Covers                                                          |
| ------------------------------------------ | -------------------------------------------------------------- |
| `src/tests/yaml-roundtrip.test.ts`         | Field-level YAML round-trips (auto_created, container linkage) |
| `src/tests/yaml-archive-regression.test.ts` | Representative-layout save/reload and legacy ZIP load (#1114)  |
| `src/tests/archive-format.test.ts`         | ZIP format detection (new folder, old flat)                   |
| `src/tests/archive-guardrails.test.ts`     | ZIP size, entry count, and compression-ratio limits           |
| `src/tests/adapt-legacy-layout.test.ts`    | Carrier-first adaptation of legacy half-width placements      |

When changing the serializer (`src/lib/utils/yaml.ts`), the archive reader
(`src/lib/utils/archive.ts`), or the legacy adapter
(`src/lib/storage/adapt-legacy-layout.ts`), run these first. They drive the
public load entrypoint with the byte shapes the export path and older builds
produce, so a dropped section fails loudly.

The git-sync half of #1114 (happy path, auth/network/missing-file failures,
baseline conflicts) is out of scope until sync code exists; it is tracked
against #627 in M08.

### Low-Value Tests (Write Fewer or None)

| Area                    | Why                 | Better Alternative      |
| ----------------------- | ------------------- | ----------------------- |
| Static data             | No logic to test    | Schema validation       |
| Hardcoded counts        | Breaks on additions | `length > 0` or none    |
| Schema-validated fields | Redundant           | One schema test         |
| Simple getters          | Trivial             | TypeScript types        |
| CSS/styling             | Visual, not logical | Visual regression tools |

### The Zero-Change Rule

**Adding data should require zero test changes.**

If adding a device to a brand pack breaks tests, those tests are testing _data_, not _behavior_. Refactor to:

```typescript
// ❌ Bad: Breaks when you add a device
it("exports 68 devices", () => {
  expect(dellDevices).toHaveLength(68);
});

// ✅ Good: Validates behavior, not count
it("all devices pass schema validation", () => {
  for (const device of dellDevices) {
    expect(() => DeviceTypeSchema.parse(device)).not.toThrow();
  }
});

// ✅ Better: Parameterized, one test per device
it.each(dellDevices)("$slug validates against schema", (device) => {
  expect(() => DeviceTypeSchema.parse(device)).not.toThrow();
});
```

### Trust the Schema

Zod schemas already validate:

- Required fields exist
- Types are correct
- Enums match allowed values
- Patterns match (slugs, colors)

**Don't duplicate this in tests.** One test that runs `Schema.parse()` on all data is sufficient.

### Consolidation Patterns

**Multiple similar test files → One parameterized file:**

```typescript
// ❌ Bad: 6 files with identical structure
// brandpacks-dell.test.ts, brandpacks-ubiquiti.test.ts, ...

// ✅ Good: One file, all brands
const ALL_BRAND_PACKS = [
  { name: "Dell", devices: dellDevices },
  { name: "Ubiquiti", devices: ubiquitiDevices },
  // ...
];

describe.each(ALL_BRAND_PACKS)("$name brand pack", ({ devices }) => {
  it("all devices validate", () => {
    /* ... */
  });
  it("no duplicate slugs", () => {
    /* ... */
  });
});
```

---

## Best Practices

### Do

- Test behavior, not implementation
- Use factories for test data
- Follow AAA pattern (Arrange-Act-Assert)
- Test edge cases and error states
- Keep tests focused and independent
- Prefer role/label/text locators for E2E, with `data-testid` for structural anchors
- Trust schema validation for data correctness
- Use parameterized tests for similar cases

### Don't

- Test implementation details
- Couple tests to CSS classes or DOM structure
- Share state between tests
- Skip cleanup in `beforeEach`/`afterEach`
- Over-mock - prefer real implementations when practical
- Assert exact counts on data arrays
- Duplicate schema validation logic in tests
- Create one test file per data source (consolidate instead)

## Adding New Tests

1. Create test file in `src/tests/` with `.test.ts` extension
2. Import factories and mocks as needed
3. Structure tests using `describe` blocks for grouping
4. Follow AAA pattern in each test case
5. Run tests locally before committing

## Code Review Lessons

These patterns emerged from code reviews and should be followed to avoid common issues:

### Always Use Shared Factories

Don't duplicate factory functions in test files. Always import from `factories.ts`:

```typescript
// Good - import shared factory
import { createTestRack, createTestDeviceLibrary } from "./factories";

// Avoid - local duplicate
function createTestRack() {
  /* ... */
}
```

### Use Design Tokens for Colors

Never use hardcoded color values. Always use CSS custom properties:

```css
/* Good - uses token */
color: var(--colour-text-on-primary);

/* Avoid - hardcoded */
color: white;
color: #ffffff;
```

### Test Both Success and Failure Paths

For validation logic, add tests for rejection scenarios:

```typescript
it("shows error when validation fails", async () => {
  // Set up scenario that triggers validation failure
  layoutStore.placeDevice("rack-0", deviceType.slug, 20, "front");

  // Try action that should fail
  await fireEvent.click(screen.getByRole("button", { name: "12U" }));

  // Verify error feedback
  expect(screen.getByText(/cannot resize/i)).toBeInTheDocument();
});
```

### Test Gesture Cancellation Paths

For gesture handlers, test both completion and cancellation:

```typescript
// Test successful completion
it("fires callback after duration", async () => {
  /* ... */
});

// Test movement cancellation
it("cancels when pointer moves beyond threshold", async () => {
  /* ... */
});

// Test early release cancellation
it("cancels when pointer released early", async () => {
  /* ... */
});
```

### Lint Rules Trump Refactoring Suggestions

When code review suggests a refactor that conflicts with lint rules, prefer the lint-passing approach. Document the decision in the commit message:

```
Note: Kept single $effect for prop sync (granular effects conflict with
svelte/prefer-writable-derived lint rule)
```

### Always Invoke Callback Props

If a component accepts callback props like `onclose`, `onconfirm`, etc., ensure they are invoked at the appropriate time:

```typescript
function confirmClearRack() {
  layoutStore.clearRackDevices(RACK_ID);
  showClearConfirm = false;
  onclose?.(); // Don't forget to invoke!
}
```

### Ensure Progress Callbacks Complete

For progress-tracking callbacks, ensure the final value is delivered before completion:

```typescript
timeoutId = setTimeout(() => {
  // Cancel animation frame first
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  // Deliver final progress value
  onProgress?.(1);

  // Then invoke completion callback
  callback();
}, duration);
```
