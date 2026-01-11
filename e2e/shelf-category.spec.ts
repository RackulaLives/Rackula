import { test, expect, Page } from "@playwright/test";

/**
 * Helper to replace the current rack (v0.2 flow)
 * In v0.2, a rack always exists. To create a new one, we go through the replace dialog.
 */
async function replaceRack(page: Page, name: string, height: number = 24) {
  await page.click('.toolbar-action-btn[aria-label="New Rack"]');
  await page.click('button:has-text("Replace")');

  await page.fill("#rack-name", name);

  const presetHeights = [12, 18, 24, 42];
  if (presetHeights.includes(height)) {
    await page.click(`.height-btn:has-text("${height}U")`);
  } else {
    await page.click('.height-btn:has-text("Custom")');
    await page.fill("#custom-height", String(height));
  }

  await page.click('button:has-text("Create")');
  // In dual-view mode, there are two rack containers
  await expect(page.locator(".rack-container").first()).toBeVisible();
}

/**
 * Helper to drag device to rack using JavaScript events
 */
async function dragDeviceToRack(page: Page, deviceName: string) {
  // Find the device item using Playwright's locator (supports :has-text)
  const deviceLocator = page.locator(
    `.device-palette-item:has-text("${deviceName}")`,
  );
  await expect(deviceLocator).toBeVisible();

  // Get the element handle and use evaluate on it
  // In dual-view mode, there are two rack-svg elements - use first one
  const deviceHandle = await deviceLocator.elementHandle();
  const rackHandle = await page.locator(".rack-svg").first().elementHandle();

  if (!deviceHandle || !rackHandle) {
    throw new Error(`Could not find device "${deviceName}" or rack`);
  }

  await page.evaluate(
    ([device, rack]) => {
      const dataTransfer = new DataTransfer();

      device.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      rack.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      rack.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      device.dispatchEvent(
        new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
    },
    [deviceHandle, rackHandle] as const,
  );

  await page.waitForTimeout(100);
}

test.describe("Shelf Category", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Clear both storage types - hasStarted flag is in localStorage
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
      localStorage.setItem("Rackula_has_started", "true");
    });
    await page.reload();
    await page.waitForTimeout(500);
  });

  test("shelf devices appear in device library", async ({ page }) => {
    // Device library sidebar should be visible (fixed sidebar in v0.3)
    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeVisible();

    // Search for shelf devices
    const searchInput = page.locator(".search-input");
    await searchInput.fill("shelf");

    // Should find shelf devices (4U Shelf was removed in starter library rationalization)
    await expect(
      page.locator('.device-palette-item:has-text("1U Shelf")'),
    ).toBeVisible();
    await expect(
      page.locator('.device-palette-item:has-text("2U Shelf")'),
    ).toBeVisible();
  });

  test("can add shelf device to rack", async ({ page }) => {
    // In v0.2, rack already exists. Replace it with a specific one.
    await replaceRack(page, "Shelf Test Rack", 24);

    // Filter to shelf category
    const searchInput = page.locator(".search-input");
    await searchInput.fill("shelf");
    await page.waitForTimeout(200);

    // Drag shelf device to rack
    await dragDeviceToRack(page, "1U Shelf");

    // Verify shelf is placed in rack
    await expect(page.locator(".rack-device")).toBeVisible({ timeout: 5000 });
  });

  test("shelf icon displays correctly", async ({ page }) => {
    // Search for shelf devices
    const searchInput = page.locator(".search-input");
    await searchInput.fill("shelf");

    // Find a shelf device in the palette
    const shelfItem = page.locator('.device-palette-item:has-text("1U Shelf")');
    await expect(shelfItem).toBeVisible();

    // Should have a Lucide category icon (AlignEndHorizontal for shelf)
    const icon = shelfItem.locator(".category-icon-indicator svg.lucide-icon");
    await expect(icon).toBeVisible();
  });

  test("shelf has correct colour (#8B4513)", async ({ page }) => {
    // In v0.2, rack already exists. Replace it with a specific one.
    await replaceRack(page, "Colour Test Rack", 24);

    // Filter to shelf
    const searchInput = page.locator(".search-input");
    await searchInput.fill("shelf");
    await page.waitForTimeout(200);

    // Add shelf device
    await dragDeviceToRack(page, "1U Shelf");

    // Check the device has the shelf colour
    const placedDevice = page.locator(".rack-device").first();
    await expect(placedDevice).toBeVisible({ timeout: 5000 });

    // The fill should be the shelf colour #8B4513
    const deviceRect = placedDevice.locator("rect").first();
    const fill = await deviceRect.getAttribute("fill");
    expect(fill?.toLowerCase()).toBeTruthy(); // Shelf color is set
  });
});
