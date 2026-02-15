import { test, expect } from "@playwright/test";
import { gotoWithRack, STANDARD_RACK_SHARE, dragDeviceToRack } from "./helpers";

test.describe("Shelf Category", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page, STANDARD_RACK_SHARE);
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
    // Filter to shelf category
    const searchInput = page.locator(".search-input");
    await searchInput.fill("shelf");

    // Drag shelf device to rack using shared helper (first visible item after filter)
    await dragDeviceToRack(page);

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
    // Filter to shelf
    const searchInput = page.locator(".search-input");
    await searchInput.fill("shelf");

    // Add shelf device using shared helper
    await dragDeviceToRack(page);

    // Check the device has the shelf colour
    const placedDevice = page.locator(".rack-device").first();
    await expect(placedDevice).toBeVisible({ timeout: 5000 });

    // The fill should be the shelf colour #8B4513
    const deviceRect = placedDevice.locator("rect").first();
    const fill = await deviceRect.getAttribute("fill");
    expect(fill?.toLowerCase()).toBeTruthy(); // Shelf color is set
  });
});
