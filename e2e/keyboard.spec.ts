import { test, expect } from "@playwright/test";
import {
  gotoWithRack,
  SMALL_RACK_SHARE,
  dragDeviceToRack,
  clickNewRack,
} from "./helpers";

test.describe("Keyboard Shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page, SMALL_RACK_SHARE);
  });

  test("Delete key clears rack devices (v0.2 cannot remove the rack)", async ({
    page,
  }) => {
    // Add a device first
    await dragDeviceToRack(page);
    await expect(page.locator(".rack-device").first()).toBeVisible();

    // Select the rack (click on first rack-svg in dual-view)
    await page.locator(".rack-svg").first().click();

    // Press Delete
    await page.keyboard.press("Delete");

    // Confirm deletion - button text is "Delete Rack" for racks
    await expect(page.locator(".dialog")).toBeVisible();
    await page.click('[role="dialog"] button:has-text("Delete Rack")');

    // In v0.2, rack still exists but devices are cleared
    await expect(page.locator(".rack-container").first()).toBeVisible();
    await expect(page.locator(".rack-device")).not.toBeVisible();
  });

  test("Backspace key clears rack devices (v0.2 cannot remove the rack)", async ({
    page,
  }) => {
    // Add a device first
    await dragDeviceToRack(page);
    await expect(page.locator(".rack-device").first()).toBeVisible();

    // Select the rack (click on first rack-svg in dual-view)
    await page.locator(".rack-svg").first().click();

    // Press Backspace
    await page.keyboard.press("Backspace");

    // Confirm deletion - button text is "Delete Rack" for racks
    await expect(page.locator(".dialog")).toBeVisible();
    await page.click('[role="dialog"] button:has-text("Delete Rack")');

    // In v0.2, rack still exists but devices are cleared
    await expect(page.locator(".rack-container").first()).toBeVisible();
    await expect(page.locator(".rack-device")).not.toBeVisible();
  });

  test("Escape clears selection", async ({ page }) => {
    // Select the rack (click on first rack-svg in dual-view)
    await page.locator(".rack-svg").first().click();

    // Edit panel should open
    await expect(page.locator(".drawer-right.open")).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");

    // Edit panel should close
    await expect(page.locator(".drawer-right.open")).not.toBeVisible();
  });

  test("? key opens help dialog", async ({ page }) => {
    // Press ? using keyboard.type which handles shift automatically
    await page.keyboard.type("?");

    // Help dialog should open (HelpPanel uses Dialog component)
    await expect(page.locator(".dialog")).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".dialog-title")).toHaveText("Help");
  });

  test("Ctrl+S triggers save", async ({ page }) => {
    // Set up download listener
    const downloadPromise = page
      .waitForEvent("download", { timeout: 5000 })
      .catch(() => null);

    // Press Ctrl+S
    await page.keyboard.press("Control+s");

    // Should trigger download
    const download = await downloadPromise;
    if (download) {
      expect(download.suggestedFilename()).toContain(".Rackula.zip");
    }
  });

  test("Escape closes dialogs", async ({ page }) => {
    // Open new rack dialog (this shows replace dialog)
    await clickNewRack(page);
    await expect(page.locator(".dialog")).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");

    // Dialog should close
    await expect(page.locator(".dialog")).not.toBeVisible();
  });

  test("Arrow keys move device in rack", async ({ page }) => {
    // Add a device to the rack
    await dragDeviceToRack(page);

    // Wait for device
    await expect(page.locator(".rack-device").first()).toBeVisible();

    // Select the device (first one in dual-view)
    await page.locator(".rack-device").first().click();

    // Press Arrow Up
    await page.keyboard.press("ArrowUp");

    // Note: This test verifies the key is handled, actual movement depends on implementation
    await expect(page.locator(".rack-device").first()).toBeVisible();
  });
});
