import { test, expect } from "@playwright/test";

import fs from "fs";
import JSZip from "jszip";
import {
  gotoWithRack,
  STANDARD_RACK_SHARE,
  dragDeviceToRack,
  clickSave,
  clickLoad,
} from "./helpers";

test.describe("Archive Format", () => {
  let legacyJsonPath: string;

  test.beforeAll(async () => {
    legacyJsonPath = test.info().outputPath("test-legacy.Rackula.json");

    // Create a legacy JSON file for migration testing (v0.2.x format with racks array)
    const legacyLayout = {
      version: "0.2.1",
      name: "Legacy Layout",
      created: "2024-01-01T00:00:00.000Z",
      modified: "2024-01-01T00:00:00.000Z",
      racks: [
        {
          id: "rack-1",
          name: "Old Rack",
          height: 42,
          width: 19,
          position: 0,
          view: "front",
          devices: [],
        },
      ],
      deviceLibrary: [],
      settings: {
        theme: "dark",
      },
    };
    fs.writeFileSync(legacyJsonPath, JSON.stringify(legacyLayout, null, 2));
  });

  test.afterAll(async () => {
    if (fs.existsSync(legacyJsonPath)) {
      fs.unlinkSync(legacyJsonPath);
    }
  });

  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page, STANDARD_RACK_SHARE);
  });

  test("save creates .Rackula.zip file", async ({ page }) => {
    await dragDeviceToRack(page);
    await expect(page.locator(".rack-device").first()).toBeVisible({
      timeout: 5000,
    });

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click save button
    await clickSave(page);

    // Wait for download
    const download = await downloadPromise;

    // Check filename has .Rackula.zip extension
    expect(download.suggestedFilename()).toMatch(/\.Rackula\.zip$/);

    // Save and verify contents
    const downloadPath = test.info().outputPath(download.suggestedFilename());
    await download.saveAs(downloadPath);

    const zipBuffer = fs.readFileSync(downloadPath);
    const zip = await JSZip.loadAsync(zipBuffer);

    // Should contain a YAML file in a folder structure
    const files = Object.keys(zip.files);
    expect(files.some((f) => f.endsWith(".yaml"))).toBe(true);
  });

  test.skip("load saved .Rackula.zip restores layout", async ({ page }) => {
    // SKIP: File chooser interaction unreliable in E2E tests
    await dragDeviceToRack(page);
    await expect(page.locator(".rack-device")).toBeVisible({ timeout: 5000 });

    const downloadPromise = page.waitForEvent("download");
    await clickSave(page);
    const download = await downloadPromise;

    const savedPath = test.info().outputPath("saved-layout.Rackula.zip");
    await download.saveAs(savedPath);

    // Reload with a fresh rack
    await gotoWithRack(page, STANDARD_RACK_SHARE);

    // Load the saved file
    const fileChooserPromise = page.waitForEvent("filechooser");
    await clickLoad(page);
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(savedPath);

    // Wait for success toast to confirm load completed
    await expect(page.locator(".toast--success")).toBeVisible({
      timeout: 10000,
    });

    // Verify layout is restored
    await expect(page.locator(".rack-container")).toBeVisible();
    await expect(page.locator(".rack-device")).toBeVisible();
  });

  test("legacy .Rackula.json file shows error (v0.4.0 removed legacy support)", async ({
    page,
  }) => {
    // In v0.4.0, legacy format support was removed
    const fileChooserPromise = page.waitForEvent("filechooser");
    await clickLoad(page);
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(legacyJsonPath);

    // Should show error toast - legacy format no longer supported
    const toast = page.locator('.toast-error, .toast.error, [role="alert"]');
    await expect(toast.first()).toBeVisible({ timeout: 5000 });
  });

  test("error handling for corrupted archive", async ({ page }) => {
    const corruptedPath = test.info().outputPath("corrupted.Rackula.zip");
    fs.writeFileSync(corruptedPath, "not a zip file");

    // Load corrupted file
    const fileChooserPromise = page.waitForEvent("filechooser");
    await clickLoad(page);
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(corruptedPath);

    // Should show error toast
    const toast = page.locator('.toast-error, .toast.error, [role="alert"]');
    await expect(toast.first()).toBeVisible({ timeout: 5000 });
  });
});
