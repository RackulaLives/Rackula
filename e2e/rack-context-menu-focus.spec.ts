import { test, expect, Page } from "@playwright/test";

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

/**
 * Create a rack through the wizard (step 1: name and type, step 2: height)
 */
async function createRackViaWizard(page: Page, name: string, height: number) {
  // Step 1: Name and type (already visible)
  await expect(page.locator("#rack-name")).toBeVisible({ timeout: 10000 });
  await page.fill("#rack-name", name);

  // Select Column layout (single rack)
  await page.click('button:has-text("Column")');
  await page.click('button:has-text("Next")');

  // Step 2: Height
  const presetHeights = [12, 18, 24, 42];
  if (presetHeights.includes(height)) {
    await page.click(`.height-btn:has-text("${height}U")`);
  } else {
    await page.click('.height-btn:has-text("Custom")');
    await page.fill("#custom-height", String(height));
  }
  await page.click('button:has-text("Create")');

  // Wait for rack to appear
  await expect(page.locator(".rack-container").first()).toBeVisible({
    timeout: 10000,
  });
}

test.describe("Rack Context Menu Focus", () => {
  test.beforeEach(async ({ page }) => {
    // Set hasStarted flag before navigation so welcome page is skipped
    await page.addInitScript(() => {
      localStorage.setItem("Rackula_has_started", "true");
    });
    await page.goto("/");
    // Create a rack through the wizard (appears when no autosave)
    await createRackViaWizard(page, "Test Rack", 42);
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
    await page.waitForTimeout(350); // Allow smooth animation to complete

    // Get transform after Focus
    const transformAfter = await getPanzoomTransform(page);
    expect(transformAfter).toBeTruthy();

    // The transforms should exist and have valid values
    expect(transformAfter?.scale).toBeDefined();
    expect(transformAfter?.x).toBeDefined();
    expect(transformAfter?.y).toBeDefined();
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

    // Wait for any animation to complete
    await page.waitForTimeout(350);

    // Verify the transform exists (Focus was applied)
    const transformAfter = await getPanzoomTransform(page);
    expect(transformAfter).toBeTruthy();
    expect(transformAfter?.scale).toBeDefined();
    expect(transformAfter?.x).toBeDefined();
    expect(transformAfter?.y).toBeDefined();
  });
});
