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

    // Selecting the rack surfaces its Edit-tab properties (empty state gone)
    await expect(page.locator(locators.sidePanel.editEmpty)).not.toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");

    // Clearing the selection returns the Edit tab to its empty state
    await expect(page.locator(locators.sidePanel.editEmpty)).toBeVisible();
  });

  test("? key opens help dialog", async ({ page }) => {
    // Press the physical "?" combo (Shift + /). This dispatches a keydown with
    // key "?" AND shiftKey=true, matching a real keyboard - keyboard.type("?")
    // would synthesise a shift-less event and mask shift-handling regressions.
    await page.keyboard.press("Shift+Slash");

    // Help dialog should open (HelpPanel uses Dialog component). Its sr-only
    // Dialog.Title "About Rackula" provides the accessible name, so the
    // role/name locator both finds the dialog and confirms it is the help one.
    await expect(
      page.getByRole("dialog", { name: "About Rackula" }),
    ).toBeVisible({ timeout: 2000 });
  });

  test("Ctrl+S triggers save", async ({ page }) => {
    // Set up download listener
    const downloadPromise = page.waitForEvent("download", { timeout: 5000 });

    // Press Ctrl+S
    await page.keyboard.press(`${PLATFORM_MODIFIER}+s`);

    // Should trigger download (default save format is YAML, #1754)
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.rackula\.yaml$/);
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
