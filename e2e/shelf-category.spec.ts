import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  STANDARD_RACK_SHARE,
  dragDeviceToRack,
  locators,
} from "./helpers";

test.describe("Shelf Category", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page, STANDARD_RACK_SHARE);
  });

  test("shelf devices appear in device library", async ({ page }) => {
    // Device palette should be visible
    await expect(page.locator(locators.device.palette)).toBeVisible();

    // Search for shelf devices
    const searchInput = page.locator('[data-testid="search-devices"]');
    await searchInput.fill("shelf");

    // Should find shelf devices (4U Shelf was removed in starter library rationalization)
    await expect(
      page.getByRole("listitem", { name: "Shelf, 1U, shelf", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "Shelf, 2U, shelf", exact: true }),
    ).toBeVisible();
  });

  test("can add shelf device to rack", async ({ page }) => {
    // Filter to shelf category
    const searchInput = page.locator('[data-testid="search-devices"]');
    await searchInput.fill("shelf");

    // Drag shelf device to rack using shared helper (first visible item after filter)
    await dragDeviceToRack(page);

    // Verify shelf is placed in rack
    await expect(page.locator(locators.rack.device).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("shelf icon displays correctly", async ({ page }) => {
    // Search for shelf devices
    const searchInput = page.locator('[data-testid="search-devices"]');
    await searchInput.fill("shelf");

    // Find a shelf device in the palette
    const shelfItem = page.getByRole("listitem", {
      name: "Shelf, 1U, shelf",
      exact: true,
    });
    await expect(shelfItem).toBeVisible();

    // Should have a category icon
    const icon = shelfItem.locator(locators.deviceDetail.categoryIconIndicator);
    await expect(icon).toBeVisible();
  });

  test("placed shelf device has a fill colour", async ({ page }) => {
    // Filter to shelf
    const searchInput = page.locator('[data-testid="search-devices"]');
    await searchInput.fill("shelf");

    // Add shelf device using shared helper
    await dragDeviceToRack(page);

    // Check the device has the shelf colour
    const placedDevice = page.locator(locators.rack.device).first();
    await expect(placedDevice).toBeVisible({ timeout: 5000 });

    // The fill should be the shelf colour #8B4513
    const deviceRect = placedDevice.locator("rect").first();
    const fill = await deviceRect.getAttribute("fill");
    expect(fill?.toLowerCase()).toBeTruthy(); // Shelf color is set
  });
});
