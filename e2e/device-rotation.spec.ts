import { test, expect } from "./helpers/base-test";
import { dragDeviceToRack, gotoWithRack, locators } from "./helpers";

/**
 * A device's height can be entered in millimetres, and a measured device can
 * be turned a quarter: a mini PC lying flat stands on its side, taller than
 * the U it took flat.
 */
test.describe("Device height and rotation", () => {
  test("a mini PC entered in millimetres stands on its side", async ({
    page,
  }) => {
    await gotoWithRack(page);

    await page.click('[data-testid="btn-create-custom-device"]');
    const dialog = page.locator(locators.dialog.root);
    await expect(dialog).toBeVisible();

    await page.fill("#device-name", "Stood Mini PC");
    await page.selectOption("#device-height-unit", "mm");
    await page.fill("#device-height", "34.5");
    await expect(page.getByTestId("height-rack-units")).toHaveText("Takes 1U");
    await page.fill("#device-width", "179");
    await dialog.locator('[data-testid="btn-add-device"]').click();
    await expect(dialog).toBeHidden();

    await dragDeviceToRack(page, {
      deviceName: "Stood Mini PC",
      yOffsetPercent: 70,
    });

    // The front and rear views both draw the device; the front one is enough.
    const front = page.getByTestId("rack-front");
    const flat = front.getByRole("button", { name: /^Stood Mini PC, 1U / });
    await expect(flat).toBeVisible();
    await flat.click();

    await expect(page.getByTestId("device-rotation")).toHaveText("0°");
    await page.getByTestId("btn-rotate-device").click();

    await expect(page.getByTestId("device-rotation")).toHaveText("90°");
    await expect(
      front.getByRole("button", { name: /^Stood Mini PC, 4\.5U / }),
    ).toBeVisible();
  });
});
