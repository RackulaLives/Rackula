import { test, expect, Page } from "@playwright/test";

/**
 * Smoke tests to catch JavaScript initialization errors in production builds.
 *
 * These tests exist because:
 * 1. Dev server uses native ESM (no chunking) - different behavior than production
 * 2. Unit tests run against source files, not bundled output
 * 3. ESM chunk initialization order bugs only manifest in production builds
 *
 * @see https://github.com/RackulaLives/Rackula/issues/479 - ESM initialization bug
 */

/**
 * Options for configuring error collection behavior.
 */
interface ErrorCollectionOptions {
  /** Filter function to select which errors to collect. Default: collect all. */
  filter?: (message: string) => boolean;
  /** Whether to also collect console.error messages. Default: true. */
  includeConsole?: boolean;
}

/**
 * Collects page errors during test execution with configurable filtering.
 * Returns the list of errors for assertion.
 *
 * @example
 * // Collect all errors (default behavior)
 * const errors = setupErrorCollection(page);
 *
 * // Collect only unhandled promise rejections
 * const rejections = setupErrorCollection(page, {
 *   filter: (m) => m.includes("Unhandled"),
 *   includeConsole: false,
 * });
 */
function setupErrorCollection(
  page: Page,
  options: ErrorCollectionOptions = {},
): string[] {
  const { filter = () => true, includeConsole = true } = options;
  const errors: string[] = [];

  page.on("pageerror", (error) => {
    if (filter(error.message)) {
      errors.push(error.message);
    }
  });

  if (includeConsole) {
    page.on("console", (msg) => {
      if (msg.type() === "error" && filter(msg.text())) {
        errors.push(`Console error: ${msg.text()}`);
      }
    });
  }

  return errors;
}

test.describe("Smoke Tests - JavaScript Initialization", () => {
  test.beforeEach(async ({ page }) => {
    // Set hasStarted flag before navigation so main app UI is displayed (skips welcome page)
    await page.addInitScript(() => {
      localStorage.setItem("Rackula_has_started", "true");
    });
  });

  test("app loads without JavaScript errors", async ({ page }) => {
    const errors = setupErrorCollection(page);

    // Navigate to the app (will show main UI due to hasStarted flag set in init script)
    await page.goto("/");

    // Wait for the app to fully initialize
    // The rack container appears when Svelte components have mounted
    await expect(page.locator(".rack-container").first()).toBeVisible({
      timeout: 10000,
    });

    // Assert no JavaScript errors occurred during initialization
    // eslint-disable-next-line no-restricted-syntax -- behavioral test: verifying zero errors is the requirement
    expect(
      errors,
      "Expected no JavaScript errors during app load",
    ).toHaveLength(0);
  });

  test("bits-ui accordion component renders in device palette", async ({
    page,
  }) => {
    const errors = setupErrorCollection(page);

    // Navigate to app (hasStarted is set via addInitScript in beforeEach)
    await page.goto("/");

    // bits-ui Accordion is used in the device palette for category sections
    // Look for the accordion trigger (category header) - they use data-accordion-trigger
    const accordionTrigger = page.locator("[data-accordion-trigger]").first();
    await expect(accordionTrigger).toBeVisible({ timeout: 10000 });

    // Verify accordion is interactive - click should toggle content
    await accordionTrigger.click();

    // Check for any ESM initialization errors
    const esmErrors = errors.filter(
      (e) =>
        e.includes("before initialization") ||
        e.includes("is not defined") ||
        e.includes("Cannot access") ||
        e.includes("ReferenceError"),
    );
    // eslint-disable-next-line no-restricted-syntax -- behavioral test: verifying zero ESM errors is the requirement
    expect(esmErrors, "Expected no ESM initialization errors").toHaveLength(0);
  });

  test("all critical UI components render", async ({ page }) => {
    const errors = setupErrorCollection(page);

    // Navigate to app (hasStarted is set via addInitScript in beforeEach)
    await page.goto("/");

    // Verify critical components are present
    // Toolbar
    await expect(page.locator(".toolbar")).toBeVisible({ timeout: 10000 });

    // Rack view (dual-view has two containers)
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Device palette (sidebar)
    await expect(page.locator(".device-palette")).toBeVisible();

    // At least one device category should be rendered (using bits-ui accordion)
    await expect(
      page.locator("[data-accordion-trigger]").first(),
    ).toBeVisible();

    // No critical errors should have occurred
    // eslint-disable-next-line no-restricted-syntax -- behavioral test: verifying zero critical errors is the requirement
    expect(
      errors.filter(
        (e) => e.includes("ReferenceError") || e.includes("TypeError"),
      ),
      "Expected no critical JavaScript errors",
    ).toHaveLength(0);
  });
});

test.describe("Smoke Tests - Console Warnings", () => {
  test.beforeEach(async ({ page }) => {
    // Set hasStarted flag before navigation so main app UI is displayed (skips welcome page)
    await page.addInitScript(() => {
      localStorage.setItem("Rackula_has_started", "true");
    });
  });

  test("no unhandled promise rejections during load", async ({ page }) => {
    const rejections = setupErrorCollection(page, {
      filter: (m) => m.includes("Unhandled"),
      includeConsole: false,
    });

    await page.goto("/");
    await expect(page.locator(".rack-container").first()).toBeVisible({
      timeout: 10000,
    });

    // eslint-disable-next-line no-restricted-syntax -- behavioral test: verifying zero rejections is the requirement
    expect(rejections, "Expected no unhandled promise rejections").toHaveLength(
      0,
    );
  });
});
