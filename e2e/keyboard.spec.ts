import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  SMALL_RACK_SHARE,
  dragDeviceToRack,
  clickNewRack,
  PLATFORM_MODIFIER,
  locators,
} from "./helpers";

test.describe("Keyboard Shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page, SMALL_RACK_SHARE);
  });

  test("Delete key removes rack after confirmation", async ({ page }) => {
    // Add a device first
    await dragDeviceToRack(page);
    await expect(page.locator(locators.rack.device).first()).toBeVisible();

    // Select the rack (click on first rack-svg in dual-view)
    await page.locator(locators.rack.svg).first().click();

    // Press Delete
    await page.keyboard.press("Delete");

    // Confirm deletion
    await expect(page.locator(locators.dialog.root)).toBeVisible();
    await page.click('[data-testid="btn-confirm-action"]');

    // In multi-rack mode, deleting the only rack removes it entirely
    await expect(page.locator(locators.rack.device)).not.toBeVisible();
  });

  test("Backspace key removes rack after confirmation", async ({ page }) => {
    // Add a device first
    await dragDeviceToRack(page);
    await expect(page.locator(locators.rack.device).first()).toBeVisible();

    // Select the rack (click on first rack-svg in dual-view)
    await page.locator(locators.rack.svg).first().click();

    // Press Backspace
    await page.keyboard.press("Backspace");

    // Confirm deletion
    await expect(page.locator(locators.dialog.root)).toBeVisible();
    await page.click('[data-testid="btn-confirm-action"]');

    // In multi-rack mode, deleting the only rack removes it entirely
    await expect(page.locator(locators.rack.device)).not.toBeVisible();
  });

  test("Escape clears selection", async ({ page }) => {
    // Select the rack (click on first rack-svg in dual-view)
    await page.locator(locators.rack.svg).first().click();

    // Edit panel should open
    await expect(page.locator(locators.drawer.rightOpenBare)).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");

    // Edit panel should close
    await expect(page.locator(locators.drawer.rightOpenBare)).not.toBeVisible();
  });

  test("? key opens help dialog", async ({ page }) => {
    // Press ? using keyboard.type which handles shift automatically
    await page.keyboard.type("?");

    // Help dialog should open (HelpPanel uses Dialog component)
    // The Dialog.Title is sr-only with text "About Rackula" — check dialog is visible
    await expect(page.locator(locators.dialog.root)).toBeVisible({ timeout: 2000 });
    // Verify it's the help dialog by checking for the logo or keyboard shortcuts content
    await expect(page.locator(".help-dialog")).toBeVisible();
  });

  test("Ctrl+S triggers save", async ({ page }) => {
    // Set up download listener
    const downloadPromise = page.waitForEvent("download", { timeout: 5000 });

    // Press Ctrl+S
    await page.keyboard.press(`${PLATFORM_MODIFIER}+s`);

    // Should trigger download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });

  test("Escape closes dialogs", async ({ page }) => {
    // Open new rack wizard dialog
    await clickNewRack(page);
    await expect(page.locator(locators.dialog.root)).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");

    // Dialog should close
    await expect(page.locator(locators.dialog.root)).not.toBeVisible();
  });

  test("Arrow keys move device in rack", async ({ page }) => {
    // Add a device lower in the rack so ArrowUp can move it.
    await dragDeviceToRack(page, { yOffsetPercent: 70 });

    const device = page.locator(locators.rackView.frontDevice).first();
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
