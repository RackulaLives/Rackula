import { test, expect } from "./helpers/base-test";
import fs from "fs";
import sharp from "sharp";
import {
  gotoWithRack,
  locators,
  RACK_WITH_DEVICE_SHARE,
  selectDevice,
} from "./helpers";

test.describe("Device Images", () => {
  let testImagePath: string;

  test.beforeAll(async () => {
    // Write a 1x1 PNG the browser can decode (the crop dialog loads it)
    testImagePath = test.info().outputPath("test-image.png");
    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
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
    // Click "Create Custom Device" button in sidebar to open AddDeviceForm dialog
    await page.click('[data-testid="btn-create-custom-device"]');

    const dialog = page.locator(locators.dialog.root);
    await expect(dialog).toBeVisible();

    // Fill in device details
    await page.fill(
      '#device-name, input[placeholder*="name" i]',
      "Server with Image",
    );

    // Find and use the file input for front image
    const fileInput = dialog.locator('input[type="file"]').first();
    await fileInput.setInputFiles(testImagePath);

    // Crop dialog opens with the image framed to the device shape
    const cropDialog = page.getByTestId("image-crop-dialog");
    await expect(cropDialog).toBeVisible();
    const applyCrop = cropDialog.getByTestId("btn-apply-crop");
    await expect(applyCrop).toBeEnabled();
    await applyCrop.click();
    await expect(cropDialog).toBeHidden();

    // Preview should appear (img element in the upload area)
    const preview = dialog.locator(locators.deviceDetail.imagePreview);
    await expect(preview.first()).toBeVisible({ timeout: 5000 });

    // Submit the form - click the button inside the dialog
    await dialog.locator('[data-testid="btn-add-device"]').click();

    // Device should be added to library
    await expect(
      page
        .getByTestId("device-palette-item")
        .filter({ hasText: "Server with Image" }),
    ).toBeVisible();
  });

  test("Use full image keeps the whole photo instead of cropping it", async ({
    page,
  }) => {
    await page.click('[data-testid="btn-create-custom-device"]');
    const dialog = page.locator(locators.dialog.root);
    await page.fill("#device-name", "Mini PC");

    // A JPEG shaped like a mini PC front, a different shape from the frame
    const buffer = await sharp({
      create: { width: 560, height: 100, channels: 3, background: "#808080" },
    })
      .jpeg()
      .toBuffer();
    await dialog
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: "mini-pc.jpg", mimeType: "image/jpeg", buffer });

    const cropDialog = page.getByTestId("image-crop-dialog");
    await cropDialog.getByTestId("btn-use-full-image").click();
    await expect(cropDialog).toBeHidden();

    // The whole photo is kept at its resolution: one side matches it and the
    // other grows with transparent bands to the frame shape, so the JPEG is
    // saved as PNG. A crop would have cut one side below the photo's size.
    const preview = dialog.locator(locators.deviceDetail.imagePreview).first();
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("src", /^data:image\/png/);
    const size = await preview.evaluate((img: HTMLImageElement) => ({
      width: img.naturalWidth,
      height: img.naturalHeight,
    }));
    expect(size.width).toBeGreaterThanOrEqual(560);
    expect(size.height).toBeGreaterThanOrEqual(100);
    expect(size.width === 560 || size.height === 100).toBe(true);
  });

  test("Enter on the Crop button reopens the crop without adding the device", async ({
    page,
  }) => {
    await page.click('[data-testid="btn-create-custom-device"]');
    const dialog = page.locator(locators.dialog.root);
    await page.fill("#device-name", "Server with Image");
    await dialog
      .locator('input[type="file"]')
      .first()
      .setInputFiles(testImagePath);

    const cropDialog = page.getByTestId("image-crop-dialog");
    await cropDialog.getByTestId("btn-apply-crop").click();
    await expect(cropDialog).toBeHidden();

    await page.getByRole("button", { name: "Adjust front image crop" }).focus();
    await page.keyboard.press("Enter");

    await expect(cropDialog).toBeVisible();
    await expect(
      page
        .getByTestId("device-palette-item")
        .filter({ hasText: "Server with Image" }),
    ).toHaveCount(0);
  });

  test("keys on the crop stage do not move or delete the selected device", async ({
    page,
  }) => {
    await gotoWithRack(page, RACK_WITH_DEVICE_SHARE);
    await selectDevice(page);
    const device = page.locator(locators.rackView.frontDevice).first();
    const labelBefore = await device.getAttribute("aria-label");

    await page
      .getByLabel("Choose front image override")
      .setInputFiles(testImagePath);
    const cropDialog = page.getByTestId("image-crop-dialog");
    await expect(cropDialog).toBeVisible();

    await cropDialog.getByRole("application").focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Delete");
    await cropDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(cropDialog).toBeHidden();

    await expect(device).toHaveAttribute("aria-label", labelBefore ?? "");
  });

  test("display mode toggle exists in toolbar", async ({ page }) => {
    // In v0.4 dual-view mode, two rack containers exist
    await expect(page.locator(locators.rack.container).first()).toBeVisible();

    // Should have toolbar with display mode related controls
    await expect(page.locator(locators.toolbar.root)).toBeVisible();
  });

  test("keyboard shortcut I triggers display mode toggle", async ({ page }) => {
    // In v0.4 dual-view mode, two rack containers exist
    await expect(page.locator(locators.rack.container).first()).toBeVisible();

    // Press I to toggle display mode - should not throw error
    await page.keyboard.press("i");

    // Rack should still be visible (no crash)
    await expect(page.locator(locators.rack.container).first()).toBeVisible();
  });

  test("labels toggle visible when in image mode", async ({ page }) => {
    // In v0.4 dual-view mode, two rack containers exist
    await expect(page.locator(locators.rack.container).first()).toBeVisible();

    // Toggle to image mode with I key
    await page.keyboard.press("i");

    // In image mode, toolbar should still be visible
    await expect(page.locator(locators.toolbar.root)).toBeVisible();
  });
});
