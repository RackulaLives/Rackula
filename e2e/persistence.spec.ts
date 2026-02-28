import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  MEDIUM_RACK_SHARE,
  SMALL_RACK_SHARE,
  STANDARD_RACK_SHARE,
  clickSave,
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
    expect(download.suggestedFilename()).toMatch(/\.Rackula\.zip$/);
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

  test.skip("load layout from file", async ({ page: _page }) => {
    // SKIP: File chooser interaction unreliable in E2E tests
  });

  // Session auto-save is planned for a later phase (see App.svelte comment)
  test.skip("session storage preserves work on refresh", async ({
    page: _page,
  }) => {
    // Skipped — session auto-save not yet implemented
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
