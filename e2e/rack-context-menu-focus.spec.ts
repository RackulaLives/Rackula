import { test, expect } from "./helpers/base-test";
import type { Page } from "@playwright/test";
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

async function setPanzoomTransform(page: Page, transform: string) {
  await page.evaluate((nextTransform) => {
    const panzoomContainer = document.querySelector(".panzoom-container");
    if (panzoomContainer) {
      (panzoomContainer as HTMLElement).style.transform = nextTransform;
    }
  }, transform);
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

    // Force a non-focused transform so Focus must change it.
    await setPanzoomTransform(page, "matrix(0.4, 0, 0, 0.4, 0, 0)");
    const transformBefore = await getPanzoomTransform(page);
    expect(transformBefore).toBeTruthy();
    expect(transformBefore?.scale).toBe(0.4);

    // Open the canvas context menu directly on the rack element.
    await page.evaluate(() => {
      const rack = document.querySelector(".rack-svg");
      if (!rack) throw new Error("Could not find rack svg");
      rack.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    // Wait for context menu to appear
    await expect(page.locator(".context-menu-content")).toBeVisible();

    // Verify Focus option is present and click it
    const focusItem = page.locator('[data-testid="ctx-menu-focus"]');
    await expect(focusItem).toBeVisible();
    await focusItem.click();

    await expect
      .poll(async () => {
        const transformAfter = await getPanzoomTransform(page);
        if (!transformBefore || !transformAfter) return false;

        return (
          transformAfter.scale !== transformBefore.scale ||
          transformAfter.x !== transformBefore.x ||
          transformAfter.y !== transformBefore.y
        );
      })
      .toBe(true);
  });

  test("Focus option in Racks panel context menu works", async ({ page }) => {
    // Rack should be visible
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Force a non-focused transform so Focus must change it.
    await setPanzoomTransform(page, "matrix(0.4, 0, 0, 0.4, 0, 0)");
    const transformBefore = await getPanzoomTransform(page);
    expect(transformBefore).toBeTruthy();
    expect(transformBefore?.scale).toBe(0.4);

    // Switch to the Racks tab in the sidebar
    // This test requires the sidebar to be visible (desktop viewport)
    const racksTab = page.locator('[data-testid="sidebar-tab-racks"]');
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
    const focusItem = page.locator('[data-testid="ctx-menu-focus"]');
    await expect(focusItem).toBeVisible();

    // Click Focus - this triggers the focusRack function via callback chain
    await focusItem.click();

    await expect
      .poll(async () => {
        const transformAfter = await getPanzoomTransform(page);
        if (!transformBefore || !transformAfter) return false;

        return (
          transformAfter.scale !== transformBefore.scale ||
          transformAfter.x !== transformBefore.x ||
          transformAfter.y !== transformBefore.y
        );
      })
      .toBe(true);
  });
});
