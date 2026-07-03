import { test, expect } from "./helpers/base-test";
import { gotoWithRack, dragDeviceToRack, locators } from "./helpers";

/**
 * E2E Tests for Custom Device Creation and Placement (Issue #166)
 * Verifies a custom multi-U device keeps its height after placement, the
 * regression where custom devices reverted to 1U once dropped in the rack.
 */

test.describe("Custom Device Height (Issue #166)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("custom 4U device keeps its height after placement", async ({
    page,
  }) => {
    const deviceName = "Custom Quad Server";

    // Open the "Add custom device" dialog from the palette footer.
    await page.getByTestId("btn-create-custom-device").click();

    const dialog = page.getByRole("dialog", { name: "Add Device" });
    await dialog.getByLabel("Name", { exact: true }).fill(deviceName);

    // Set the height to 4U. Svelte's bind:value on a number input updates from
    // the input event, which fill() dispatches, so the state tracks the value.
    await dialog.getByLabel("Height (U)").fill("4");
    await dialog.getByLabel("Category").selectOption("server");

    await page.getByTestId("btn-add-device").click();

    // Filter the palette to the new device so the virtualized list renders it
    // (off-window rows unmount, #2094); then drag it into the rack by name.
    await page
      .getByRole("searchbox", { name: "Search devices" })
      .fill(deviceName);

    await dragDeviceToRack(page, { deviceName });

    // The placed device announces its height through its accessible name
    // (RackDevice ariaLabel: "<name>, <u_height>U <category> at U<n>"). A 4U
    // device that survived placement announces "4U"; the #166 regression would
    // announce "1U". getByRole substring-matches a plain string name, so no
    // dynamic regex is built. Scope to the front face so the full-depth twin on
    // the rear does not double the match.
    await expect(
      page
        .locator(locators.rackView.front)
        .getByRole("button", { name: `${deviceName}, 4U` }),
    ).toBeVisible();
  });
});
