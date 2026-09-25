import { test, expect } from "./helpers/base-test";
import fs from "fs";
import { gotoWithRack, locators } from "./helpers";

/**
 * A half-width device is carrier-first, so it always ends up inside a container
 * cell. Container children used to draw only a coloured rectangle and a label,
 * so the image a user cropped for such a device was stored and shown in the
 * edit panel but never appeared in the rack.
 */
test.describe("Container child images", () => {
  let testImagePath: string;

  test.beforeAll(async () => {
    testImagePath = test.info().outputPath("child-image.png");
    fs.writeFileSync(
      testImagePath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
  });

  test.afterAll(async () => {
    if (fs.existsSync(testImagePath)) fs.unlinkSync(testImagePath);
  });

  test("a half-width device placed in a carrier draws its image", async ({
    page,
  }) => {
    await gotoWithRack(page);

    await page.click('[data-testid="btn-create-custom-device"]');
    const dialog = page.locator(locators.dialog.root);
    await expect(dialog).toBeVisible();

    await page.fill(
      '#device-name, input[placeholder*="name" i]',
      "Crop Frame Probe",
    );
    // Half width makes the device carrier-first and halves the crop frame.
    await page.locator("#device-half-width").click();

    await dialog
      .locator('input[type="file"]')
      .first()
      .setInputFiles(testImagePath);
    const cropDialog = page.getByTestId("image-crop-dialog");
    await expect(cropDialog).toBeVisible();
    await expect(cropDialog).toContainText("half-width");
    const applyCrop = cropDialog.getByTestId("btn-apply-crop");
    await expect(applyCrop).toBeEnabled();
    await applyCrop.click();
    await expect(cropDialog).toBeHidden();

    await dialog.locator('[data-testid="btn-add-device"]').click();

    const paletteItem = page.getByRole("listitem", {
      name: "Crop Frame Probe, 1U, server, half-width",
    });
    await expect(paletteItem).toBeVisible();

    // Place it. It is carrier-first, so this creates a carrier and puts the
    // device in one of its cells.
    await paletteItem.click();
    await page
      .locator("[data-rack-id]")
      .first()
      .click({ position: { x: 60, y: 60 } });

    // I cycles the display mode. Cycle until images are on, then assert the
    // child actually draws one rather than only a coloured rectangle.
    const childImage = page.getByTestId("child-device-image");
    await expect(async () => {
      await page.keyboard.press("i");
      await expect(childImage.first()).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15000 });
  });
});
