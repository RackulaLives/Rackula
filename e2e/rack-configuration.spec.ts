import { test, expect } from "./helpers/base-test";
import type { Page } from "@playwright/test";
import { gotoWithRack, clickNewRack } from "./helpers";

/**
 * Helper to open the New Rack form via the replace flow.
 * With a rack already loaded via share link, clicking New Rack shows replace dialog.
 */
async function openNewRackForm(page: Page) {
  await clickNewRack(page);
  await page.click('button:has-text("Replace")');
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
    await page.click('.height-btn:has-text("24U")');

    // Select 10" width using radio button
    await page.click('.width-option:has-text("10")');

    await page.click('button:has-text("Create")');

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
    await page.click('.height-btn:has-text("42U")');
    // 19" is default, no need to change

    await page.click('button:has-text("Create")');

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

  test.skip("rack with descending units shows U1 at top", async ({
    page: _page,
  }) => {
    // SKIP: Descending units checkbox not yet implemented in NewRackForm
  });

  test("rack with ascending units shows U1 at bottom (default desc_units=false, starting_unit=1)", async ({
    page,
  }) => {
    await openNewRackForm(page);

    await page.fill("#rack-name", "Ascending Rack");
    await page.click('.height-btn:has-text("Custom")');
    await page.fill("#custom-height", "10");

    // Uses defaults: desc_units=false (ascending), starting_unit=1
    await page.click('button:has-text("Create")');

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

  test.skip("rack with custom starting unit displays correct labels", async ({
    page: _page,
  }) => {
    // SKIP: Starting unit input not yet implemented in NewRackForm
  });

  test.skip("form factor selection is available", async ({ page: _page }) => {
    // SKIP: Form factor dropdown not yet implemented in NewRackForm
  });
});
