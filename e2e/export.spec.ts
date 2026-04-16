import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  createTestLayout,
  dragDeviceToRack,
  clickExport,
  locators,
} from "./helpers";

const smallRack = createTestLayout({
  name: "Small Test Layout",
  rackName: "Small Rack",
  rackHeight: 12,
});

test.describe("Export Functionality", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page, smallRack);

    // Add a device (drag to first rack-svg which is front view)
    await dragDeviceToRack(page);
    await expect(page.locator(locators.rack.device).first()).toBeVisible();
  });

  test("export dialog opens", async ({ page }) => {
    // Click export button
    await clickExport(page);

    // Dialog should open
    await expect(page.locator(locators.dialog.root)).toBeVisible();
    await expect(page.locator(locators.dialog.title)).toHaveText("Export");
  });

  test("export dialog has format options", async ({ page }) => {
    await clickExport(page);

    // Should have format select dropdown with options
    const formatSelect = page.locator("#export-format");
    await expect(formatSelect).toBeVisible();

    // Verify options exist
    await expect(formatSelect.locator('option[value="png"]')).toBeAttached();
    await expect(formatSelect.locator('option[value="jpeg"]')).toBeAttached();
    await expect(formatSelect.locator('option[value="svg"]')).toBeAttached();
  });

  test("export PNG downloads file", async ({ page }) => {
    await clickExport(page);

    // Select PNG format (default, but be explicit)
    await page.selectOption("#export-format", "png");

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click export button
    await page.click('[data-testid="btn-export-confirm"]');

    // Wait for download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/);
  });

  test("export SVG downloads file", async ({ page }) => {
    await clickExport(page);

    // Select SVG format
    await page.selectOption("#export-format", "svg");

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click export button
    await page.click('[data-testid="btn-export-confirm"]');

    // Wait for download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.svg$/);
  });

  test("export JPEG downloads file", async ({ page }) => {
    await clickExport(page);

    // Select JPEG format
    await page.selectOption("#export-format", "jpeg");

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click export button
    await page.click('[data-testid="btn-export-confirm"]');

    // Wait for download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.jpe?g$/);
  });

  test("export with legend option", async ({ page }) => {
    await clickExport(page);

    // Toggle include legend — bits-ui Checkbox renders as a button, not native input.
    // Click the label which is linked to the checkbox via htmlFor.
    const legendLabel = page.getByText("Include legend");
    await expect(legendLabel).toBeVisible();
    await legendLabel.click();

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Export
    await page.click('[data-testid="btn-export-confirm"]');

    await downloadPromise;
    // Legend inclusion is reflected in the exported file content
  });

  test("export dialog can be cancelled", async ({ page }) => {
    await clickExport(page);
    await expect(page.locator(locators.dialog.root)).toBeVisible();

    // Click cancel
    await page.click('[data-testid="btn-export-cancel"]');

    // Dialog should close
    await expect(page.locator(locators.dialog.root)).not.toBeVisible();
  });
});
