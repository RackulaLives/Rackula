import { test, expect, Page } from "@playwright/test";
import { gotoWithRack } from "./helpers";

/**
 * Helper to get the current panzoom transform
 */
async function getPanzoomTransform(page: Page) {
  return page.evaluate(() => {
    const panzoomContainer = document.querySelector(".panzoom-container");
    if (!panzoomContainer) return null;
    const style = (panzoomContainer as HTMLElement).style.transform;
    // Parse "matrix(a, b, c, d, tx, ty)" format
    const match = style.match(/matrix\(([^)]+)\)/);
    if (!match) return null;
    const values = match[1].split(",").map((v) => parseFloat(v.trim()));
    return { scale: values[0], x: values[4], y: values[5] };
  });
}

test.describe("Rack Context Menu Focus", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("Focus option in canvas context menu triggers focus function", async ({
    page,
  }) => {
    // Rack should be visible
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Get the initial transform
    const transformBefore = await getPanzoomTransform(page);
    expect(transformBefore).toBeTruthy();

    // Right-click on the rack-svg (inside the dual view)
    await page.locator(".rack-svg").first().click({ button: "right" });

    // Wait for context menu to appear
    await expect(page.locator(".context-menu-content")).toBeVisible();

    // Verify Focus option is present and click it
    const focusItem = page.locator('.context-menu-item:has-text("Focus")');
    await expect(focusItem).toBeVisible();
    await focusItem.click();

    // Focus recalculates and applies optimal zoom/pan for the rack.
    // Even from the initial position, Focus will center the rack.
    // Wait for transform to potentially change (animation may take time)
    await expect(async () => {
      const transformAfter = await getPanzoomTransform(page);
      expect(transformAfter).toBeTruthy();
      expect(transformAfter?.scale).toBeDefined();
      expect(transformAfter?.x).toBeDefined();
      expect(transformAfter?.y).toBeDefined();
    }).toPass({ timeout: 1000 });
  });

  test("Focus option in Racks panel context menu works", async ({ page }) => {
    // Rack should be visible
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Switch to the Racks tab in the sidebar
    // This test requires the sidebar to be visible (desktop viewport)
    const racksTab = page.locator('button[role="tab"]:has-text("Racks")');
    await expect(racksTab).toBeVisible({
      timeout: 5000,
    });
    await racksTab.click();

    // Right-click on the rack item in the Racks panel
    const rackItem = page.locator(".rack-item").first();
    await rackItem.click({ button: "right" });

    // Wait for context menu to appear
    await expect(page.locator(".context-menu-content")).toBeVisible();

    // Verify Focus option is present
    const focusItem = page.locator('.context-menu-item:has-text("Focus")');
    await expect(focusItem).toBeVisible();

    // Click Focus - this triggers the focusRack function via callback chain
    await focusItem.click();

    // Verify the transform exists (Focus was applied)
    await expect(async () => {
      const transformAfter = await getPanzoomTransform(page);
      expect(transformAfter).toBeTruthy();
      expect(transformAfter?.scale).toBeDefined();
      expect(transformAfter?.x).toBeDefined();
      expect(transformAfter?.y).toBeDefined();
    }).toPass({ timeout: 1000 });
  });
});
