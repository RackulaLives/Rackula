import { test, expect } from "./helpers/base-test";
import { gotoWithRack, dragDeviceToRack, PLATFORM_MODIFIER } from "./helpers";

test.describe("Device Custom Names", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("can edit device display name", async ({ page }) => {
    // Place a device
    await dragDeviceToRack(page);
    await expect(page.locator(".rack-device").first()).toBeVisible();

    // Click on the device to select it
    await page.locator(".rack-device").first().click();

    // Wait for edit panel drawer to open
    await expect(page.locator("aside.drawer-right.open")).toBeVisible();

    // Click the display name button to start editing
    await page.locator("button.display-name-display").click();

    // Input field should appear
    const nameInput = page.locator("input#device-display-name");
    await expect(nameInput).toBeVisible();

    // Clear and type new name
    await nameInput.fill("Primary Database Server");

    // Press Enter to save
    await nameInput.press("Enter");

    // The new name should be visible in the rack device
    await expect(page.locator(".rack-device .device-name").first()).toHaveText(
      "Primary Database Server",
    );
  });

  test("display name persists after save/load", async ({ page }) => {
    // Place a device and give it a custom name
    await dragDeviceToRack(page);
    await expect(page.locator(".rack-device").first()).toBeVisible();
    await page.locator(".rack-device").first().click();

    // Wait for edit panel to open
    await expect(page.locator("aside.drawer-right.open")).toBeVisible();

    // Edit the name
    await page.locator("button.display-name-display").click();
    const nameInput = page.locator("input#device-display-name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Storage Server");
    await nameInput.press("Enter");

    // Verify the name shows
    await expect(page.locator(".rack-device .device-name").first()).toHaveText(
      "Storage Server",
    );

    // Save the layout via keyboard shortcut
    const downloadPromise = page.waitForEvent("download");
    await page.keyboard.press(`${PLATFORM_MODIFIER}+s`);
    const download = await downloadPromise;

    // Save to stable test output path
    const savedPath = test.info().outputPath("device-name-test.Rackula.zip");
    await download.saveAs(savedPath);

    // Reload with a fresh rack
    await gotoWithRack(page);

    // Load the saved file via keyboard shortcut
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.keyboard.press(`${PLATFORM_MODIFIER}+o`);
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(savedPath);

    // Wait for success toast to confirm load completed
    await expect(page.locator(".toast--success")).toBeVisible({
      timeout: 10000,
    });

    // Wait for device to appear
    await expect(page.locator(".rack-device").first()).toBeVisible({
      timeout: 10000,
    });

    // Verify the custom name is restored
    await expect(page.locator(".rack-device .device-name").first()).toHaveText(
      "Storage Server",
    );
  });

  test("undo/redo works for display name changes", async ({ page }) => {
    // Place a device
    await dragDeviceToRack(page);
    await expect(page.locator(".rack-device").first()).toBeVisible();
    await page.locator(".rack-device").first().click();

    // Wait for edit panel to open
    await expect(page.locator("aside.drawer-right.open")).toBeVisible();

    // Get the original device type name
    const originalName = await page
      .locator(".rack-device .device-name")
      .first()
      .textContent();

    // Edit the name
    await page.locator("button.display-name-display").click();
    const nameInput = page.locator("input#device-display-name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Custom Name");
    await nameInput.press("Enter");

    // Verify new name
    await expect(page.locator(".rack-device .device-name").first()).toHaveText(
      "Custom Name",
    );

    // Deselect device to ensure keyboard shortcuts target the app, not the edit panel
    await page.keyboard.press("Escape");
    await expect(page.locator("aside.drawer-right.open")).not.toBeVisible();

    // Undo (Ctrl+Z)
    await page.keyboard.press("Control+z");

    // Should restore original name
    await expect(page.locator(".rack-device .device-name").first()).toHaveText(
      originalName!,
    );

    // Redo (Ctrl+Shift+Z)
    await page.keyboard.press("Control+Shift+z");

    // Should restore custom name
    await expect(page.locator(".rack-device .device-name").first()).toHaveText(
      "Custom Name",
    );
  });

  test("clearing display name reverts to device type name", async ({
    page,
  }) => {
    // Place a device
    await dragDeviceToRack(page);
    await expect(page.locator(".rack-device").first()).toBeVisible();
    await page.locator(".rack-device").first().click();

    // Wait for edit panel to open
    await expect(page.locator("aside.drawer-right.open")).toBeVisible();

    // Get the original device type name
    const originalName = await page
      .locator(".rack-device .device-name")
      .first()
      .textContent();

    // Edit the name to something custom
    await page.locator("button.display-name-display").click();
    let nameInput = page.locator("input#device-display-name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Custom Name");
    await nameInput.press("Enter");

    // Verify custom name is shown
    await expect(page.locator(".rack-device .device-name").first()).toHaveText(
      "Custom Name",
    );

    // Click again and clear the name
    await page.locator("button.display-name-display").click();
    nameInput = page.locator("input#device-display-name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("");
    await nameInput.press("Enter");

    // Should revert to device type name
    await expect(page.locator(".rack-device .device-name").first()).toHaveText(
      originalName!,
    );
  });
});
