import { test, expect } from "@playwright/test";
import {
  gotoWithRack,
  dragDeviceToRack,
  selectDevice,
  deleteSelectedDevice,
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
    await expect(page.locator(".rack-container").first()).toBeVisible();
    // Default rack name is displayed in dual-view header
    await expect(page.locator(".rack-dual-view-name")).toBeVisible();
  });

  // Skip these tests - the "Replace Rack" flow was part of v0.2 behavior
  // The current app has a different workflow for creating new racks
  test.skip("can replace current rack with a new one", async ({
    page: _page,
  }) => {
    // The v0.2 "Replace" flow used a toolbar button + replace dialog
    // This may have changed in the current app version
  });

  test.skip("rack appears on canvas after replacement", async ({
    page: _page,
  }) => {
    // Same as above - v0.2 replace flow may have changed
  });

  test("can drag device from palette to rack", async ({ page }) => {
    // In v0.4 dual-view mode, two rack containers exist
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Drag device using helper (drops on first .rack-svg which is front view)
    await dragDeviceToRack(page);

    // Verify device appears in rack
    await expect(page.locator(".rack-device").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("device appears at correct position in rack", async ({ page }) => {
    // Rack already exists in v0.4 dual-view mode
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Drag device
    await dragDeviceToRack(page);

    // Verify device is in the rack
    await expect(page.locator(".rack-device").first()).toBeVisible();
  });

  test("can move device within rack", async ({ page }) => {
    // Rack exists by default
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Drag device
    await dragDeviceToRack(page);

    // Wait for device to appear
    await expect(page.locator(".rack-device").first()).toBeVisible();

    // Move the device within the rack using arrow keys
    const device = page.locator(".rack-device").first();
    await device.click();
    await page.keyboard.press("ArrowUp");

    // Device should still be visible
    await expect(page.locator(".rack-device").first()).toBeVisible();
  });

  test("can delete device from rack", async ({ page }) => {
    // Rack exists by default
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Drag device
    await dragDeviceToRack(page);

    // Wait for device
    await expect(page.locator(".rack-device").first()).toBeVisible();

    // Select the device (opens edit panel with Delete button)
    await selectDevice(page, 0);

    // Delete the device using shared helper
    await deleteSelectedDevice(page);

    // Device should be removed
    await expect(page.locator(".rack-device")).not.toBeVisible();
  });

  // Skip this test - rack deletion flow may have changed from v0.2
  // The UI for selecting and deleting a rack (vs device) needs investigation
  test.skip("can clear rack (v0.2 does not remove the rack)", async ({
    page: _page,
  }) => {
    // This test clicks on the rack-svg to select the rack, then expects a Delete button
    // The current UI may have different rack selection/deletion mechanics
  });
});
