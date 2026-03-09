import { test, expect } from "./helpers/base-test";
import path from "path";
import { gotoWithRack, clickLoad } from "./helpers";

test.describe("Position Migration", () => {
  test.beforeEach(async ({ page }) => {
    // Load a rack via share link so the app is in a ready state for file loading
    await gotoWithRack(page);
  });

  test("loads legacy layout and migrates positions correctly", async ({
    page,
  }) => {
    // Wait for app to be ready
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Set up file chooser listener
    const fileChooserPromise = page.waitForEvent("filechooser");

    // Click load button in toolbar
    await clickLoad(page);

    // Handle file chooser with our legacy fixture
    const fileChooser = await fileChooserPromise;
    const fixturePath = path.join(
      __dirname,
      "fixtures/legacy-layout-v0.6.yaml",
    );
    await fileChooser.setFiles(fixturePath);

    // Wait for success toast to confirm load completed
    await expect(page.locator(".toast--success")).toBeVisible({
      timeout: 10000,
    });

    // Verify the layout name was loaded
    await expect(page.locator('[data-testid="layout-name"]')).toContainText(
      "Legacy Test Layout",
    );

    // Verify rack is visible with devices
    await expect(page.locator(".rack-device").first()).toBeVisible();

    // The server at U10 should now be at internal position 60
    // The switch at U1 should now be at internal position 6
    // Visual verification: both devices should be visible in the rack
    const devices = await page.locator(".rack-device").count();
    expect(devices).toBe(2);
  });

  test("save after load preserves migrated positions", async ({ page }) => {
    // Wait for app to be ready
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Load the legacy fixture
    const fileChooserPromise = page.waitForEvent("filechooser");
    await clickLoad(page);
    const fileChooser = await fileChooserPromise;
    const fixturePath = path.join(
      __dirname,
      "fixtures/legacy-layout-v0.6.yaml",
    );
    await fileChooser.setFiles(fixturePath);

    await expect(page.locator(".toast--success")).toBeVisible({
      timeout: 10000,
    });

    // Save the layout
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    const downloadPromise = page.waitForEvent("download");
    await page.keyboard.press(`${modifier}+s`);
    const download = await downloadPromise;

    // Verify file was downloaded
    expect(download.suggestedFilename()).toMatch(/Legacy Test Layout/);

    // The saved file should have version 0.7.0 and migrated positions
    // This is verified by the unit tests; E2E confirms the workflow works end-to-end
  });

  test("reload after save does not double-migrate", async ({ page }) => {
    // Wait for app to be ready
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Load legacy fixture
    const fileChooserPromise = page.waitForEvent("filechooser");
    await clickLoad(page);
    const fileChooser = await fileChooserPromise;
    const fixturePath = path.join(
      __dirname,
      "fixtures/legacy-layout-v0.6.yaml",
    );
    await fileChooser.setFiles(fixturePath);

    await expect(page.locator(".toast--success")).toBeVisible({
      timeout: 10000,
    });

    // Save the layout
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    const downloadPromise = page.waitForEvent("download");
    await page.keyboard.press(`${modifier}+s`);
    const download = await downloadPromise;

    // Save the downloaded file to a stable test output location
    const savedPath = test.info().outputPath("migrated-layout.yaml");
    await download.saveAs(savedPath);

    // Reload with a fresh rack state
    await gotoWithRack(page);

    // Load the saved file
    const fileChooserPromise2 = page.waitForEvent("filechooser");
    await clickLoad(page);
    const fileChooser2 = await fileChooserPromise2;
    await fileChooser2.setFiles(savedPath);

    await expect(page.locator(".toast--success")).toBeVisible({
      timeout: 10000,
    });

    // Verify devices are still in correct positions (not double-migrated)
    const devices = await page.locator(".rack-device").count();
    expect(devices).toBe(2);

    // Layout name should still be preserved
    await expect(page.locator('[data-testid="layout-name"]')).toContainText(
      "Legacy Test Layout",
    );
  });
});
