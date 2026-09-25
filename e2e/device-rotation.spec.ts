import { test, expect } from "./helpers/base-test";
import {
  dragDeviceToRack,
  gotoWithRack,
  locators,
  paletteItemByName,
} from "./helpers";
import type { Page } from "@playwright/test";

/**
 * A device's height can be entered in millimetres, and a measured device can
 * be turned 90 degrees and back: a mini PC lying flat stands on its side, taller than
 * the U it took flat.
 */
/** Add a mini PC lying flat: 179 mm wide, 34.5 mm tall. */
async function addMiniPc(page: Page, name: string): Promise<void> {
  await page.click('[data-testid="btn-create-custom-device"]');
  const dialog = page.locator(locators.dialog.root);
  await expect(dialog).toBeVisible();
  await page.fill("#device-name", name);
  await page.selectOption("#device-height-unit", "mm");
  await page.fill("#device-height", "34.5");
  await page.fill("#device-width", "179");
  await dialog.locator('[data-testid="btn-add-device"]').click();
  await expect(dialog).toBeHidden();
}

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

    await page.getByTestId("btn-rotate-device").click();

    await expect(page.getByTestId("device-rotation")).toHaveText("0°");
    await expect(flat).toBeVisible();
  });

  test("R turns a device before it is placed, so two stand side by side", async ({
    page,
  }) => {
    await gotoWithRack(page);
    await addMiniPc(page, "ThinkCentre");

    const front = page.getByTestId("rack-front");
    const box = (await front.boundingBox())!;
    const lowInRack = { x: box.width * 0.3, y: box.height * 0.7 };

    await paletteItemByName(page, "ThinkCentre").click();
    await page.keyboard.press("r");
    await expect(
      page.getByRole("status").filter({ hasText: "Placing:" }),
    ).toContainText("4.5U, on its side");
    await front.click({ position: lowInRack });

    const standing = front.getByRole("button", {
      name: /^ThinkCentre, 4\.5U /,
    });
    await expect(standing).toHaveCount(1);

    // The second one goes on the same carrier, to the right of the first.
    await paletteItemByName(page, "ThinkCentre").click();
    await page.keyboard.press("r");
    await front.click({ position: { x: box.width * 0.6, y: lowInRack.y } });

    await expect(standing).toHaveCount(2);
  });
});
