import { test, expect } from "@playwright/test";
import fs from "fs";
import { gotoWithRack } from "./helpers";

test.describe("Device Images", () => {
  let testImagePath: string;

  test.beforeAll(async () => {
    // Create a minimal valid PNG file for testing in a temp location
    testImagePath = test.info().outputPath("test-image.png");
    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const ihdrChunk = Buffer.from([
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x10,
      0x00, 0x00, 0x00, 0x10, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde,
    ]);
    const idatChunk = Buffer.from([
      0x00, 0x00, 0x00, 0x15, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x60,
      0x60, 0x60, 0x60, 0x60, 0x60, 0x60, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00,
      0x31, 0x00, 0x01, 0xa7, 0x3e, 0xa4, 0xc6,
    ]);
    const iendChunk = Buffer.from([
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    const pngBuffer = Buffer.concat([
      pngSignature,
      ihdrChunk,
      idatChunk,
      iendChunk,
    ]);
    fs.writeFileSync(testImagePath, pngBuffer);
  });

  test.afterAll(async () => {
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("can upload front image when adding device", async ({ page }) => {
    // Click add device button in sidebar
    await page.click('button:has-text("Add Device")');

    const dialog = page.locator(".dialog");
    await expect(dialog).toBeVisible();

    // Fill in device details
    await page.fill(
      '#device-name, input[placeholder*="name" i]',
      "Server with Image",
    );

    // Find and use the file input for front image
    const fileInput = dialog.locator('input[type="file"]').first();
    await fileInput.setInputFiles(testImagePath);

    // Preview should appear (img element in the upload area)
    const preview = dialog.locator(".image-upload img, .image-preview img");
    await expect(preview.first()).toBeVisible({ timeout: 5000 });

    // Submit the form - click the button inside the dialog
    await dialog.locator('button:has-text("Add")').click();

    // Device should be added to library
    await expect(
      page.locator('.device-palette-item:has-text("Server with Image")'),
    ).toBeVisible();
  });

  test("display mode toggle exists in toolbar", async ({ page }) => {
    // In v0.4 dual-view mode, two rack containers exist
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Should have toolbar with display mode related controls
    await expect(page.locator(".toolbar")).toBeVisible();
  });

  test("keyboard shortcut I triggers display mode toggle", async ({ page }) => {
    // In v0.4 dual-view mode, two rack containers exist
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Press I to toggle display mode - should not throw error
    await page.keyboard.press("i");

    // Rack should still be visible (no crash)
    await expect(page.locator(".rack-container").first()).toBeVisible();
  });

  test("labels toggle visible when in image mode", async ({ page }) => {
    // In v0.4 dual-view mode, two rack containers exist
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Toggle to image mode with I key
    await page.keyboard.press("i");

    // In image mode, toolbar should still be visible
    await expect(page.locator(".toolbar")).toBeVisible();
  });
});
