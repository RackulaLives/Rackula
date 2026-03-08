import { test, expect } from "./helpers/base-test";
import { gotoWithRack, dragDeviceToRack } from "./helpers";

/**
 * E2E Tests for Custom Device Creation and Placement (Issue #166)
 * Tests that custom multi-U devices preserve their height after placement
 */

test.describe("Custom Device Height (Issue #166)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("custom 4U device renders with correct height after placement", async ({
    page,
  }) => {
    // 1. Open Add Device form
    const addDeviceButton = page.locator('[data-testid="btn-create-custom-device"]');
    await addDeviceButton.click();

    // 2. Fill in custom device details
    await page.fill("#device-name", "RACKOWL 4U Server");
    await page.fill("#device-height", "4");
    await page.selectOption("#device-category", "server");

    // 3. Submit the form
    await page.click('button:has-text("Add")');

    // 4. Verify custom device appears in palette
    const customDevice = page.locator(
      '.device-palette-item:has-text("RACKOWL 4U Server")',
    );
    await expect(customDevice).toBeVisible();

    // 5. Drag device to rack using shared helper (new device is last in list)
    const deviceCount = await page.locator(".device-palette-item").count();
    await dragDeviceToRack(page, { deviceIndex: deviceCount - 1 });

    // 6. Verify device appears in rack
    const rackDevice = page.locator(".rack-device").first();
    await expect(rackDevice).toBeVisible({ timeout: 5000 });

    // 7. CRITICAL: Verify device has correct height (4U = 4 * 22px = 88px)
    const deviceRect = page.locator(".rack-device .device-rect").first();
    const height = await deviceRect.getAttribute("height");

    // U_HEIGHT constant is 22px
    expect(parseFloat(height || "0")).toBe(4 * 22); // 4U = 88px
  });

  test("custom 2U device blocks correct number of rack positions", async ({
    page,
  }) => {
    // 1. Open Add Device form
    const addDeviceButton = page.locator('[data-testid="btn-create-custom-device"]');
    await addDeviceButton.click();

    // 2. Create a custom 2U device
    await page.fill("#device-name", "Test 2U Storage");
    await page.fill("#device-height", "2");
    await page.selectOption("#device-category", "storage");

    // 3. Submit the form
    await page.click('button:has-text("Add")');

    // 4. Drag device to rack (new device is last in list)
    const deviceCount = await page.locator(".device-palette-item").count();
    await dragDeviceToRack(page, { deviceIndex: deviceCount - 1 });

    // 5. Verify device renders with 2U height
    const deviceRect = page.locator(".rack-device .device-rect").first();
    const height = await deviceRect.getAttribute("height");

    // U_HEIGHT constant is 22px
    expect(parseFloat(height || "0")).toBe(2 * 22); // 2U = 44px
  });
});
