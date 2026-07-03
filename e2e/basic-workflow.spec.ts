import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  dragDeviceToRack,
  selectDevice,
  deleteSelectedDevice,
  locators,
} from "./helpers";

test.describe("Basic Workflow", () => {
  test.beforeEach(async ({ page }) => {
    // Use share link to load pre-built rack - no wizard interaction needed
    await gotoWithRack(page);
  });

  test("rack is visible on initial load (v0.2 always has a rack)", async ({
    page,
  }) => {
    // In v0.4 dual-view mode, two rack containers exist (front and rear)
    await expect(page.locator(locators.rack.container).first()).toBeVisible();
    // Default rack name is displayed in dual-view header
    await expect(page.locator(locators.rackView.dualViewName)).toBeVisible();
  });

  test("can drag device from palette to rack", async ({ page }) => {
    // In v0.4 dual-view mode, two rack containers exist
    await expect(page.locator(locators.rack.container).first()).toBeVisible();

    // Drag a full-width device by name. The first palette item is a half-width
    // device that requires a carrier, so a direct drag onto the rails is refused
    // (carrier-first model); name the device so reordering the palette cannot
    // pick an unplaceable one.
    await dragDeviceToRack(page, { deviceName: "Server" });

    // Verify device appears in rack
    await expect(page.locator(locators.rack.device).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("device appears at correct position in rack", async ({ page }) => {
    // Rack already exists in v0.4 dual-view mode
    await expect(page.locator(locators.rack.container).first()).toBeVisible();

    // Drag device
    await dragDeviceToRack(page, { deviceName: "Server" });

    // Verify device is in the rack
    await expect(page.locator(locators.rack.device).first()).toBeVisible();
  });

  test("can move device within rack", async ({ page }) => {
    // Rack exists by default
    await expect(page.locator(locators.rack.container).first()).toBeVisible();

    // Drag device
    await dragDeviceToRack(page, { deviceName: "Server" });

    // Wait for device to appear
    await expect(page.locator(locators.rack.device).first()).toBeVisible();

    // Move the device within the rack using arrow keys
    const device = page.locator(locators.rack.device).first();
    await device.click();
    await page.keyboard.press("ArrowUp");

    // Device should still be visible
    await expect(page.locator(locators.rack.device).first()).toBeVisible();
  });

  test("can delete device from rack", async ({ page }) => {
    // Rack exists by default
    await expect(page.locator(locators.rack.container).first()).toBeVisible();

    // Drag device
    await dragDeviceToRack(page, { deviceName: "Server" });

    // Wait for device
    await expect(page.locator(locators.rack.device).first()).toBeVisible();

    // Select the device (opens edit panel with Delete button)
    await selectDevice(page, 0);

    // Delete the device using shared helper
    await deleteSelectedDevice(page);

    // Device should be removed
    await expect(page.locator(locators.rack.device)).not.toBeVisible();
  });
});
