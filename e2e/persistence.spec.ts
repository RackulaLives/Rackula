import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  MEDIUM_RACK_SHARE,
  SMALL_RACK_SHARE,
  STANDARD_RACK_SHARE,
  PLATFORM_MODIFIER,
  clickSave,
  dragDeviceToRack,
  loadFileFromDisk,
  locators,
} from "./helpers";

test.describe("Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page, MEDIUM_RACK_SHARE);
  });

  test("save layout downloads YAML file", async ({ page }) => {
    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click save button
    await clickSave(page);

    // Wait for download (default save format is YAML, #1754)
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.rackula\.yaml$/);
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

    expect(savePath).toBeTruthy();

    const fs = await import("fs/promises");

    // Default save is a standalone YAML file (#1754), not a ZIP archive
    const yamlContent = await fs.readFile(savePath!, "utf-8");

    // YAML should contain the rack name
    expect(yamlContent).toContain("name:");
    expect(yamlContent).toContain("Standard Rack");
  });

  test("load layout from file restores rack", async ({ page }) => {
    // Place a device so the saved layout has content
    await dragDeviceToRack(page);
    await expect(page.locator(locators.rack.device).first()).toBeVisible({
      timeout: 5000,
    });

    // Save the layout via keyboard shortcut
    const downloadPromise = page.waitForEvent("download");
    await page.keyboard.press(`${PLATFORM_MODIFIER}+s`);
    const download = await downloadPromise;

    // Save to stable test output path
    const savedPath = test
      .info()
      .outputPath("persistence-load-test.rackula.yaml");
    await download.saveAs(savedPath);

    // Reload with a fresh rack (no devices)
    await gotoWithRack(page, MEDIUM_RACK_SHARE);
    await expect(page.locator(locators.rack.device)).not.toBeVisible();

    // Load the saved file
    await loadFileFromDisk(page, savedPath);

    // Wait for success toast to confirm load completed
    await expect(page.locator(locators.toast.success).first()).toBeVisible({
      timeout: 10000,
    });

    // Verify layout is restored with the device
    await expect(page.locator(locators.rack.device).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("session storage preserves work on refresh", async ({ page }) => {
    // Place a device so we have something to verify after reload
    await dragDeviceToRack(page);
    await expect(page.locator(locators.rack.device).first()).toBeVisible({
      timeout: 5000,
    });

    // Wait for the debounced session save (1s) to flush the placed device
    // to localStorage, instead of sleeping for a fixed duration
    await page.waitForFunction(
      () => {
        const raw = localStorage.getItem("Rackula:autosave");
        if (!raw) return false;
        try {
          const session = JSON.parse(raw) as {
            layout?: { racks?: { devices?: unknown[] }[] };
          };
          return (
            session.layout?.racks?.some(
              (rack) => (rack.devices?.length ?? 0) > 0,
            ) ?? false
          );
        } catch {
          return false;
        }
      },
      undefined,
      { timeout: 10000 },
    );

    // Reload
    await page.reload();

    // Session restore should show the rack with our placed device
    await expect(page.locator(locators.rack.container).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator(locators.rack.device).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("unsaved changes warning on close attempt", async ({ page }) => {
    // Loading via share link creates the initial state.
    // Rack name is displayed in dual-view header
    await expect(page.locator(locators.rackView.dualViewName)).toBeVisible();
    // In dual-view mode, there are 2 rack containers
    expect(await page.locator(locators.rack.container).count()).toBe(2);
  });

  test("no warning after saving", async ({ page }) => {
    // Use 12U rack
    await gotoWithRack(page, SMALL_RACK_SHARE);

    // Save to clear dirty flag
    const downloadPromise = page.waitForEvent("download");
    await clickSave(page);
    await downloadPromise;

    // Should show success toast
    await expect(page.locator(locators.toast.root).first()).toBeVisible();
  });
});
