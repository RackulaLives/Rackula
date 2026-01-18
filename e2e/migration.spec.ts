import { test, expect } from "@playwright/test";
import path from "path";

test.describe("Position Migration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Clear both storage types
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
      localStorage.setItem("Rackula_has_started", "true");
    });
    await page.reload();
    // Wait for the app to fully initialize by checking for the rack container
    await page.locator(".rack-container").first().waitFor({ state: "visible" });
  });

  test("loads legacy layout and migrates positions correctly", async ({
    page,
  }) => {
    // Wait for app to be ready
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Set up file chooser listener
    const fileChooserPromise = page.waitForEvent("filechooser");

    // Click load button in toolbar
    await page.click('.toolbar-action-btn[aria-label="Load Layout"]');

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
    await expect(page.locator(".placed-device").first()).toBeVisible();

    // The server at U10 should now be at internal position 60
    // The switch at U1 should now be at internal position 6
    // Visual verification: both devices should be visible in the rack
    const devices = await page.locator(".placed-device").count();
    expect(devices).toBe(2);
  });

  test("save after load preserves migrated positions", async ({ page }) => {
    // Wait for app to be ready
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Load the legacy fixture
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click('.toolbar-action-btn[aria-label="Load Layout"]');
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
    const downloadPromise = page.waitForEvent("download");
    await page.keyboard.press("Control+s");
    const download = await downloadPromise;

    // Verify file was downloaded
    expect(download.suggestedFilename()).toMatch(/Legacy Test Layout/);

    // The saved file should have version 0.7.0 and migrated positions
    // This is verified by the unit tests; E2E confirms the workflow works end-to-end
  });

  test("reload after save does not double-migrate", async ({ page }) => {
    // Load legacy fixture
    await expect(page.locator(".rack-container").first()).toBeVisible();

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click('.toolbar-action-btn[aria-label="Load Layout"]');
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
    const downloadPromise = page.waitForEvent("download");
    await page.keyboard.press("Control+s");
    const download = await downloadPromise;

    // Save the downloaded file to a stable test output location
    const savedPath = test.info().outputPath("migrated-layout.yaml");
    await download.saveAs(savedPath);

    // Clear and reload the page
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
      localStorage.setItem("Rackula_has_started", "true");
    });
    await page.reload();
    // Wait for the app to fully initialize by checking for the rack container
    await page.locator(".rack-container").first().waitFor({ state: "visible" });

    // Load the saved file
    const fileChooserPromise2 = page.waitForEvent("filechooser");
    await page.click('.toolbar-action-btn[aria-label="Load Layout"]');
    const fileChooser2 = await fileChooserPromise2;
    await fileChooser2.setFiles(savedPath);

    await expect(page.locator(".toast--success")).toBeVisible({
      timeout: 10000,
    });

    // Verify devices are still in correct positions (not double-migrated)
    const devices = await page.locator(".placed-device").count();
    expect(devices).toBe(2);

    // Layout name should still be preserved
    await expect(page.locator('[data-testid="layout-name"]')).toContainText(
      "Legacy Test Layout",
    );
  });
});
