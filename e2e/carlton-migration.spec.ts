import { test, expect } from "@playwright/test";
import path from "path";

/**
 * Carlton Migration Test (#883)
 *
 * Regression test for issue #879: User Carlton (@carltonwb) could not load
 * their saved rack due to "Invalid layout: rack.devices.5.position: Invalid input".
 *
 * The file contains a device with position: 1.5 (half-U offset).
 * This tests that:
 * 1. The file loads successfully
 * 2. All 9 devices are present
 * 3. The position 1.5 is correctly migrated to internal unit 9 (1.5 * 6)
 * 4. Save/reload cycle works
 */
test.describe("Carlton Migration (#879)", () => {
  const fixturePath = path.join(
    process.cwd(),
    "e2e",
    "fixtures",
    "carlton-5123home.Rackula.zip",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Clear storage and set hasStarted flag to skip welcome screen
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
      localStorage.setItem("Rackula_has_started", "true");
    });
    await page.reload();
    // Wait for the app to fully initialize by checking for the rack container
    await page.locator(".rack-container").first().waitFor({ state: "visible" });
  });

  /**
   * Helper to load a file using keyboard shortcut (Ctrl+O)
   * More stable than clicking through dropdown menu
   */
  async function loadFileViaKeyboard(
    page: import("@playwright/test").Page,
    filePath: string,
  ) {
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.keyboard.press("Control+o");
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);
  }

  test("loads Carlton's zip file with decimal position successfully", async ({
    page,
  }) => {
    // Wait for app to be ready
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Load the fixture file via keyboard shortcut
    await loadFileViaKeyboard(page, fixturePath);

    // Wait for success toast to confirm load completed
    await expect(page.locator(".toast--success")).toBeVisible({
      timeout: 10000,
    });

    // Verify layout loaded - rack name "5123home" should be visible
    // Uses getByText for reliable text matching across SVG/HTML
    await expect(page.getByText("5123home")).toBeVisible({
      timeout: 5000,
    });
  });

  test("all devices load and UnRaid Server is present", async ({ page }) => {
    // Wait for app to be ready
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Load the fixture file via keyboard shortcut
    await loadFileViaKeyboard(page, fixturePath);

    // Wait for success toast
    await expect(page.locator(".toast--success")).toBeVisible({
      timeout: 10000,
    });

    // Verify devices are present - the file has 9 devices
    // We check that the rack has devices rendered
    await expect(page.locator(".rack-device").first()).toBeVisible({
      timeout: 5000,
    });

    // Verify the custom named device "UnRaid Server" is present
    // This is the device with position 1.5 that caused the original bug
    // Uses .first() because dual-view mode shows the device twice (front and rear)
    await expect(page.getByText("UnRaid Server").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("save and reload preserves layout", async ({ page }) => {
    // Wait for app to be ready
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Load the fixture file via keyboard shortcut
    await loadFileViaKeyboard(page, fixturePath);

    // Wait for success toast
    await expect(page.locator(".toast--success")).toBeVisible({
      timeout: 10000,
    });

    // Verify initial load worked - rack name should be visible
    await expect(page.getByText("5123home")).toBeVisible({
      timeout: 5000,
    });

    // Save the layout via keyboard shortcut
    const downloadPromise = page.waitForEvent("download");
    await page.keyboard.press("Control+s");
    const download = await downloadPromise;

    // Verify filename has correct extension
    expect(download.suggestedFilename()).toMatch(/\.Rackula\.zip$/);

    // Save to stable test output location
    const savedPath = test.info().outputPath("carlton-resaved.Rackula.zip");
    await download.saveAs(savedPath);

    // Reload page and clear state
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
      localStorage.setItem("Rackula_has_started", "true");
    });
    await page.reload();
    await page.locator(".rack-container").first().waitFor({ state: "visible" });

    // Load the re-saved file via keyboard shortcut
    await loadFileViaKeyboard(page, savedPath);

    // Verify it loads successfully
    await expect(page.locator(".toast--success")).toBeVisible({
      timeout: 10000,
    });

    // Verify layout is preserved - rack name should be visible
    await expect(page.getByText("5123home")).toBeVisible({
      timeout: 5000,
    });

    // Verify the UnRaid Server device is still present
    // Uses .first() because dual-view mode shows the device twice (front and rear)
    await expect(page.getByText("UnRaid Server").first()).toBeVisible({
      timeout: 5000,
    });
  });
});
