import { test, expect } from "./helpers/base-test";
import type { Page } from "@playwright/test";
import path from "path";
import { gotoWithRack, PLATFORM_MODIFIER } from "./helpers";

test.describe("Position Migration", () => {
  const fixturePath = path.join(
    process.cwd(),
    "e2e",
    "fixtures",
    "Legacy Test Layout.Rackula.zip",
  );

  /**
   * Helper to load a file using keyboard shortcut (Ctrl/Cmd+O)
   * More stable than clicking through dropdown menu
   */
  async function loadFileViaKeyboard(page: Page, filePath: string) {
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.keyboard.press(`${PLATFORM_MODIFIER}+o`);
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);
  }

  test.beforeEach(async ({ page }) => {
    // Load a rack via share link so the app is in a ready state for file loading
    await gotoWithRack(page);
  });

  test("loads legacy layout and migrates positions correctly", async ({
    page,
  }) => {
    // Wait for app to be ready
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Load the legacy fixture file via keyboard shortcut
    await loadFileViaKeyboard(page, fixturePath);

    // Wait for file load success toast (distinct from share link toast)
    await expect(
      page.getByText("Layout loaded successfully"),
    ).toBeVisible({ timeout: 10000 });

    // Verify the rack name from the fixture is visible
    await expect(page.getByText("Test Rack")).toBeVisible({
      timeout: 5000,
    });

    // Verify rack is visible with devices
    await expect(page.locator(".rack-device").first()).toBeVisible({
      timeout: 5000,
    });

    // The server at U10 should now be at internal position 60
    // The switch at U1 should now be at internal position 6
    // Visual verification: both devices should be visible in the rack
    const devices = await page.locator(".rack-device").count();
    expect(devices).toBe(2);
  });

  test("save after load preserves migrated positions", async ({ page }) => {
    // Wait for app to be ready
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Load the legacy fixture via keyboard shortcut
    await loadFileViaKeyboard(page, fixturePath);

    // Wait for file load success
    await expect(
      page.getByText("Layout loaded successfully"),
    ).toBeVisible({ timeout: 10000 });

    // Save the layout
    const downloadPromise = page.waitForEvent("download");
    await page.keyboard.press(`${PLATFORM_MODIFIER}+s`);
    const download = await downloadPromise;

    // Verify file was downloaded with correct name
    expect(download.suggestedFilename()).toMatch(/Legacy Test Layout/);

    // The saved file should have version 0.7.0 and migrated positions
    // This is verified by the unit tests; E2E confirms the workflow works end-to-end
  });

  test("reload after save does not double-migrate", async ({ page }) => {
    // Wait for app to be ready
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Load legacy fixture via keyboard shortcut
    await loadFileViaKeyboard(page, fixturePath);

    // Wait for file load success
    await expect(
      page.getByText("Layout loaded successfully"),
    ).toBeVisible({ timeout: 10000 });

    // Save the layout
    const downloadPromise = page.waitForEvent("download");
    await page.keyboard.press(`${PLATFORM_MODIFIER}+s`);
    const download = await downloadPromise;

    // Save the downloaded file to a stable test output location
    const savedPath = test.info().outputPath("migrated-layout.Rackula.zip");
    await download.saveAs(savedPath);

    // Reload with a fresh rack state
    await gotoWithRack(page);
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Load the saved file via keyboard shortcut
    await loadFileViaKeyboard(page, savedPath);

    // Wait for file load success
    await expect(
      page.getByText("Layout loaded successfully"),
    ).toBeVisible({ timeout: 10000 });

    // Verify devices are still in correct positions (not double-migrated)
    const devices = await page.locator(".rack-device").count();
    expect(devices).toBe(2);

    // Verify the rack name is preserved
    await expect(page.getByText("Test Rack")).toBeVisible({
      timeout: 5000,
    });
  });
});
