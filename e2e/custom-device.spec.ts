import { test, expect } from "./helpers/base-test";
import { gotoWithRack, locators } from "./helpers";

/**
 * E2E Tests for Custom Device Creation and Placement (Issue #166)
 * Tests that custom multi-U devices preserve their height after placement
 */

test.describe("Custom Device Height (Issue #166)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  // Two blockers prevent these tests from running:
  // 1. Svelte bind:value on <input type="number"> doesn't react to Playwright fill(),
  //    type(), or nativeInputValueSetter — the custom device is created with default 1U height
  // 2. Custom devices are inserted into a brand-sorted palette, not appended at the end,
  //    so deviceIndex: count-1 drags the wrong device
  // Needs: a dedicated dragDeviceByName() helper + Svelte number input workaround
  test.skip("custom 4U device renders with correct height after placement", async ({
    page,
  }) => {
    const addDeviceButton = page.getByTestId("btn-create-custom-device");
    await addDeviceButton.click();

    const addDeviceDialog = page.getByRole("dialog", { name: "Add Device" });
    await addDeviceDialog
      .getByLabel("Name", { exact: true })
      .fill("RACKOWL 4U Server");
    const heightInput = addDeviceDialog.getByLabel("Height (U)");
    await heightInput.click();
    await heightInput.fill("4");
    await addDeviceDialog.getByLabel("Category").selectOption("server");

    await page.getByTestId("btn-add-device").click();

    const customDevice = page
      .getByTestId("device-palette-item")
      .filter({ hasText: "RACKOWL 4U Server" });
    await expect(customDevice).toBeVisible();

    const deviceCount = await page.locator(locators.device.paletteItem).count();
    await expect(deviceCount).toBeGreaterThan(0);

    // TODO: drag custom device by name, verify 4U height (>60px)
  });

  test.skip("custom 2U device blocks correct number of rack positions", async ({
    page,
  }) => {
    const addDeviceButton = page.getByTestId("btn-create-custom-device");
    await addDeviceButton.click();

    const addDeviceDialog = page.getByRole("dialog", { name: "Add Device" });
    await addDeviceDialog
      .getByLabel("Name", { exact: true })
      .fill("Test 2U Storage");
    const heightInput = addDeviceDialog.getByLabel("Height (U)");
    await heightInput.click();
    await heightInput.fill("2");
    await addDeviceDialog.getByLabel("Category").selectOption("storage");

    await page.getByTestId("btn-add-device").click();

    // TODO: drag custom device by name, verify 2U height (>30px)
  });
});
