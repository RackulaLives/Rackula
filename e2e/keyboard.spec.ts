import { test, expect } from "./helpers/base-test";
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
    await page.click('[data-testid="btn-confirm-action"]');

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
    await page.click('[data-testid="btn-confirm-action"]');

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
    const downloadPromise = page.waitForEvent("download", { timeout: 5000 });

    // Press Ctrl+S
    await page.keyboard.press("Control+s");

    // Should trigger download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
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
    // Add a device lower in the rack so ArrowUp can move it.
    await dragDeviceToRack(page, { yOffsetPercent: 70 });

    const device = page.locator(".rack-front .rack-device").first();
    await expect(device).toBeVisible();

    await device.click();
    const beforePosition = await device.boundingBox();
    expect(beforePosition).not.toBeNull();
    if (!beforePosition) {
      throw new Error("Could not determine device position before ArrowUp");
    }

    // Press Arrow Up
    await page.keyboard.press("ArrowUp");

    await expect
      .poll(async () => {
        const afterPosition = await device.boundingBox();
        return afterPosition?.y ?? beforePosition.y;
      })
      .not.toBe(beforePosition.y);
  });
});
