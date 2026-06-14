import { test, expect } from "./helpers/base-test";
import type { Page } from "@playwright/test";
import {
  gotoWithRack,
  dragDeviceToRack,
  selectDevice,
  deselectDevice,
  deleteSelectedDevice,
  clickNewRack,
  completeWizardWithClicks,
  PLATFORM_MODIFIER,
  locators,
} from "./helpers";

/**
 * E2E coverage for undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) across the major
 * user operations: place, move, delete, metadata edit, rack create, and a
 * multi-step undo chain. Each test asserts user-visible outcomes (a device
 * present or absent, its on-screen position, an editable value) rather than
 * internal history state.
 */

/** Undo via the platform-aware modifier key. */
async function undo(page: Page): Promise<void> {
  await page.keyboard.press(`${PLATFORM_MODIFIER}+z`);
}

/** Redo via the platform-aware modifier key. */
async function redo(page: Page): Promise<void> {
  await page.keyboard.press(`${PLATFORM_MODIFIER}+Shift+z`);
}

/**
 * Count devices in the front view only. The dual-view renders full-depth
 * devices in both the front and rear panels, so counting `rack.device` would
 * double-count; scoping to the front view keeps the count deterministic.
 */
function frontDevices(page: Page) {
  return page.locator(locators.rackView.frontDevice);
}

test.describe("Undo/Redo", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("place device, undo removes it, redo restores it", async ({ page }) => {
    await dragDeviceToRack(page);
    await expect(frontDevices(page)).toHaveCount(1);

    await undo(page);
    await expect(frontDevices(page)).toHaveCount(0);

    await redo(page);
    await expect(frontDevices(page)).toHaveCount(1);
  });

  test("move device, undo restores original position", async ({ page }) => {
    // Place a device low in the rack so it has room to move up.
    await dragDeviceToRack(page, { yOffsetPercent: 70 });
    const device = frontDevices(page).first();
    await expect(device).toBeVisible();

    const before = await device.boundingBox();
    expect(before).not.toBeNull();
    if (!before) throw new Error("Could not read device position before move");

    // Move the device up with the keyboard.
    await device.click();
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(async () => (await device.boundingBox())?.y ?? before.y)
      .not.toBe(before.y);

    // Deselect so the keyboard shortcut targets the app, not the selection.
    await deselectDevice(page);

    // Undo returns the device to its starting position.
    await undo(page);
    await expect
      .poll(async () => (await device.boundingBox())?.y)
      .toBe(before.y);
  });

  test("delete device, undo restores it", async ({ page }) => {
    await dragDeviceToRack(page);
    await expect(frontDevices(page)).toHaveCount(1);

    await selectDevice(page, 0);
    await deleteSelectedDevice(page);
    await expect(frontDevices(page)).toHaveCount(0);

    await undo(page);
    await expect(frontDevices(page)).toHaveCount(1);
  });

  test("edit device IP, undo reverts it", async ({ page }) => {
    await dragDeviceToRack(page);
    await selectDevice(page, 0);

    // Set an IP and wait for the save indicator to confirm the edit committed.
    const ipInput = page.locator("#device-ip");
    await ipInput.fill("192.168.1.50");
    await ipInput.blur();
    await expect(
      page.locator('label:has-text("IP Address") .saved-indicator'),
    ).toBeVisible();
    await expect(ipInput).toHaveValue("192.168.1.50");

    // Deselect so Ctrl+Z is not swallowed by the focused input.
    await deselectDevice(page);

    await undo(page);

    // Re-select and confirm the IP reverted to empty.
    await selectDevice(page, 0);
    await expect(page.locator("#device-ip")).toHaveValue("");
  });

  test("create rack, undo removes it", async ({ page }) => {
    // Start state has a single rack.
    await expect(page.locator(locators.rackView.front)).toHaveCount(1);

    await clickNewRack(page);
    await completeWizardWithClicks(page, { name: "Second Rack", height: 24 });
    await expect(page.locator(locators.rackView.front)).toHaveCount(2);

    await undo(page);
    await expect(page.locator(locators.rackView.front)).toHaveCount(1);
  });

  test("rename rack, undo reverts the name", async ({ page }) => {
    const originalName = await page
      .locator(locators.rackView.dualViewName)
      .first()
      .textContent();
    expect(originalName?.trim()).toBeTruthy();

    // Select the rack to open its edit panel, then rename it.
    await page.locator(locators.rack.svg).first().click();
    const nameInput = page.locator("#rack-name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Renamed Rack");
    await nameInput.press("Enter");
    await expect(
      page.locator(locators.rackView.dualViewName).first(),
    ).toHaveText("Renamed Rack");

    // Deselect so Ctrl+Z targets the app, not the focused input.
    await deselectDevice(page);

    await undo(page);
    await expect(
      page.locator(locators.rackView.dualViewName).first(),
    ).toHaveText(originalName!.trim());
  });

  test("multi-step undo removes placed devices one at a time", async ({
    page,
  }) => {
    // Place three devices at distinct positions to avoid collisions.
    await dragDeviceToRack(page, { yOffsetPercent: 15 });
    await expect(frontDevices(page)).toHaveCount(1);
    await dragDeviceToRack(page, { yOffsetPercent: 45 });
    await expect(frontDevices(page)).toHaveCount(2);
    await dragDeviceToRack(page, { yOffsetPercent: 75 });
    await expect(frontDevices(page)).toHaveCount(3);

    // Each undo removes the most recently placed device.
    await undo(page);
    await expect(frontDevices(page)).toHaveCount(2);
    await undo(page);
    await expect(frontDevices(page)).toHaveCount(1);
    await undo(page);
    await expect(frontDevices(page)).toHaveCount(0);
  });

  test("a new action clears the redo stack", async ({ page }) => {
    // Place a device near the top, then undo so a redo is available.
    await dragDeviceToRack(page, { yOffsetPercent: 15 });
    await expect(frontDevices(page)).toHaveCount(1);
    await undo(page);
    await expect(frontDevices(page)).toHaveCount(0);

    // A fresh action lower in the rack invalidates the redo history.
    await dragDeviceToRack(page, { yOffsetPercent: 60 });
    await expect(frontDevices(page)).toHaveCount(1);
    const newDeviceY = (await frontDevices(page).first().boundingBox())?.y;
    expect(newDeviceY).toBeDefined();

    // Redo must be a no-op: had the cleared redo fired, it would have restored
    // the first device (higher in the rack), giving a count of 2. Instead the
    // count stays at 1 and the surviving device is the freshly placed one.
    await redo(page);
    await expect(frontDevices(page)).toHaveCount(1);
    expect((await frontDevices(page).first().boundingBox())?.y).toBe(newDeviceY);
  });
});
