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

    // Drag the shelf by name. The palette default first item is a half-width
    // carrier-required device, so naming the device keeps the helper placeable.
    await dragDeviceToRack(page, { deviceName: "Shelf" });

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

  test("placed device is a shelf and has a fill colour", async ({ page }) => {
    // Filter to shelf
    const searchInput = page.locator('[data-testid="search-devices"]');
    await searchInput.fill("shelf");

    // Add the shelf by name so a placeable shelf is placed, not whatever the
    // palette happens to list first.
    await dragDeviceToRack(page, { deviceName: "Shelf" });

    const placedDevice = page.locator(locators.rack.device).first();
    await expect(placedDevice).toBeVisible({ timeout: 5000 });

    // Assert the placed device is actually a shelf, not merely that some fill is
    // set. The rack device's accessible name carries its category in the form
    // "<name>, <n>U <category> at U<pos>", so a shelf announces "... U shelf ...".
    await expect(placedDevice).toHaveAttribute(
      "aria-label",
      /,\s*\d+U shelf\b/i,
    );

    // And it renders with a fill colour (asserted without a hardcoded literal,
    // which the design tokens can change and ESLint blocks).
    const deviceRect = placedDevice.locator("rect").first();
    const fill = await deviceRect.getAttribute("fill");
    expect(fill?.trim()).toBeTruthy();
  });
});
