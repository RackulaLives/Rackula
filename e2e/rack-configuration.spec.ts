import { test, expect } from "./helpers/base-test";
import type { Page } from "@playwright/test";
import { gotoWithRack, clickNewRack } from "./helpers";

/**
 * Helper to open the New Rack form via the replace flow.
 * With a rack already loaded via share link, clicking New Rack shows replace dialog.
 */
async function openNewRackForm(page: Page) {
  await clickNewRack(page);
  await page.click('[data-testid="btn-replace-rack"]');
  await expect(page.locator(".dialog")).toBeVisible();
}

test.describe("Rack Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("can create 10-inch rack with narrower render", async ({ page }) => {
    await openNewRackForm(page);

    // Fill in rack details
    await page.fill("#rack-name", "Narrow Rack");
    await page.click('[data-testid="btn-height-24"]');

    // Select 10" width using radio button
    await page.click('[data-testid="radio-width-10"]');

    await page.click('[data-testid="btn-wizard-next"]');

    // Rack should be visible (dual-view has 2 containers)
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // The rack SVG should have a narrower viewBox for 10" rack
    const rackSvg = page.locator(".rack-svg").first();
    const viewBox = await rackSvg.getAttribute("viewBox");
    expect(viewBox).toBeDefined();

    if (viewBox) {
      const parts = viewBox.split(" ");
      const width = parseFloat(parts[2] || "0");
      // 10" rack should be narrower (roughly half of 19")
      expect(width).toBeLessThan(200);
    }
  });

  test("can create 19-inch rack with standard render", async ({ page }) => {
    await openNewRackForm(page);

    await page.fill("#rack-name", "Standard Rack");
    await page.click('[data-testid="btn-height-42"]');
    // 19" is default, no need to change

    await page.click('[data-testid="btn-wizard-next"]');

    // Rack should be visible (dual-view has 2 containers)
    await expect(page.locator(".rack-container").first()).toBeVisible();

    const rackSvg = page.locator(".rack-svg").first();
    const viewBox = await rackSvg.getAttribute("viewBox");
    expect(viewBox).toBeDefined();

    if (viewBox) {
      const parts = viewBox.split(" ");
      const width = parseFloat(parts[2] || "0");
      // 19" rack should be standard width
      expect(width).toBeGreaterThan(200);
    }
  });

  // Descending units, custom starting unit, and form factor tests
  // are tracked by #1402. Stubs removed by #1226 triage.

  test("rack with ascending units shows U1 at bottom (default desc_units=false, starting_unit=1)", async ({
    page,
  }) => {
    await openNewRackForm(page);

    await page.fill("#rack-name", "Ascending Rack");
    await page.click('[data-testid="btn-height-custom"]');
    await page.fill("#custom-height", "10");

    // Uses defaults: desc_units=false (ascending), starting_unit=1
    await page.click('[data-testid="btn-wizard-next"]');

    // Rack should be visible (dual-view has 2 containers)
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // In dual-view mode, each view has its own U labels - scope to first view
    const firstRackSvg = page.locator(".rack-svg").first();
    const uLabels = firstRackSvg.locator(".u-label");
    const count = await uLabels.count();
    expect(count).toBe(10);

    // First label (top) should be "10", last label (bottom) should be "1"
    const firstLabel = uLabels.first();
    const lastLabel = uLabels.last();
    await expect(firstLabel).toHaveText("10");
    await expect(lastLabel).toHaveText("1");
  });

});
