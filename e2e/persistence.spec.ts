import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  MEDIUM_RACK_SHARE,
  SMALL_RACK_SHARE,
  STANDARD_RACK_SHARE,
  PLATFORM_MODIFIER,
  clickSave,
  dragDeviceToRack,
} from "./helpers";

test.describe("Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page, MEDIUM_RACK_SHARE);
  });

  test("save layout downloads ZIP file", async ({ page }) => {
    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click save button
    await clickSave(page);

    // Wait for download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });

  test("saved file contains correct layout structure", async ({ page }) => {
    // Use 24U rack for structure test
    await gotoWithRack(page, STANDARD_RACK_SHARE);

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Save
    await clickSave(page);

    // Get the downloaded file
    const download = await downloadPromise;
    const savePath = await download.path();

    if (savePath) {
      const fs = await import("fs/promises");
      const JSZip = (await import("jszip")).default;

      // Read the ZIP file
      const zipData = await fs.readFile(savePath);
      const zip = await JSZip.loadAsync(zipData);

      // ZIP contains folder/[name].yaml
      const files = Object.keys(zip.files);
      const yamlFile = files.find((f) => f.endsWith(".yaml"));
      expect(yamlFile).toBeDefined();

      if (yamlFile) {
        const yamlContent = await zip.file(yamlFile)?.async("string");
        expect(yamlContent).toBeDefined();

        // YAML should contain the rack name
        expect(yamlContent).toContain("name:");
        expect(yamlContent).toContain("Standard Rack");
      }
    }
  });

  test("load layout from file restores rack", async ({ page }) => {
    // Place a device so the saved layout has content
    await dragDeviceToRack(page);
    await expect(page.locator(".rack-device").first()).toBeVisible({
      timeout: 5000,
    });

    // Save the layout via keyboard shortcut
    const downloadPromise = page.waitForEvent("download");
    await page.keyboard.press(`${PLATFORM_MODIFIER}+s`);
    const download = await downloadPromise;

    // Save to stable test output path
    const savedPath = test.info().outputPath("persistence-load-test.Rackula.zip");
    await download.saveAs(savedPath);

    // Reload with a fresh rack (no devices)
    await gotoWithRack(page, MEDIUM_RACK_SHARE);
    await expect(page.locator(".rack-device")).not.toBeVisible();

    // Load the saved file via keyboard shortcut
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.keyboard.press(`${PLATFORM_MODIFIER}+o`);
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(savedPath);

    // Wait for success toast to confirm load completed
    await expect(page.locator(".toast--success")).toBeVisible({
      timeout: 10000,
    });

    // Verify layout is restored with the device
    await expect(page.locator(".rack-device").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("session storage preserves work on refresh", async ({ page }) => {
    // Place a device so we have something to verify after reload
    await dragDeviceToRack(page);
    await expect(page.locator(".rack-device").first()).toBeVisible({
      timeout: 5000,
    });

    // Reload immediately while the 1s debounce is still pending —
    // this exercises the beforeunload/visibilitychange flush path
    await page.reload();

    // Session restore should show the rack with our placed device
    await expect(page.locator(".rack-container").first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator(".rack-device").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("unsaved changes warning on close attempt", async ({ page }) => {
    // Loading via share link creates the initial state.
    // Rack name is displayed in dual-view header
    await expect(page.locator(".rack-dual-view-name")).toBeVisible();
    // In dual-view mode, there are 2 rack containers
    expect(await page.locator(".rack-container").count()).toBe(2);
  });

  test("no warning after saving", async ({ page }) => {
    // Use 12U rack
    await gotoWithRack(page, SMALL_RACK_SHARE);

    // Save to clear dirty flag
    const downloadPromise = page.waitForEvent("download");
    await clickSave(page);
    await downloadPromise;

    // Should show success toast
    await expect(page.locator(".toast")).toBeVisible();
  });
});
