import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  clickNewRack,
  clickNewLayout,
  createRackDirect,
  locators,
} from "./helpers";

test.describe("Multi-Rack Mode", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("rack exists on initial load", async ({ page }) => {
    // In dual-view mode, there are 2 rack containers (front and rear)
    await expect(page.locator(locators.rack.container)).toHaveCount(2);
    // Rack name is displayed in dual-view header
    await expect(page.locator(locators.rackView.dualViewName)).toBeVisible();
  });

  test("clicking New Rack creates a rack directly (no wizard, no replace dialog)", async ({
    page,
  }) => {
    const fronts = page.locator(locators.rackView.front);
    await expect(fronts).toHaveCount(1);

    await clickNewRack(page);

    // #2732: a 24U rack is added immediately. No wizard or replace dialog opens.
    await expect(fronts).toHaveCount(2);
    await expect(page.locator(locators.dialog.root)).not.toBeVisible();
  });

  test("can create a second rack", async ({ page }) => {
    // #2732: New Rack adds a rack directly.
    await createRackDirect(page);

    // Should now have 2 racks (dual-view renders one name header per rack).
    await expect(page.locator(locators.rackView.dualViewName)).toHaveCount(2);
  });

  test("both racks coexist after creation", async ({ page }) => {
    // Create two more racks directly, naming each via the inspector (#2732).
    await createRackDirect(page, { name: "Rack Alpha" });
    await createRackDirect(page, { name: "Rack Beta" });

    // Both rack names should be visible
    await expect(
      page.locator(locators.rackView.dualViewName, { hasText: "Rack Alpha" }),
    ).toBeVisible();
    await expect(
      page.locator(locators.rackView.dualViewName, { hasText: "Rack Beta" }),
    ).toBeVisible();
  });

  test("max rack limit shows toast warning", async ({ page }) => {
    // Creating 9 racks sequentially can take a while on CI.
    test.setTimeout(60000);

    const fronts = page.locator(locators.rackView.front);
    // Create 9 more racks (already have 1 from the share link) to hit the limit of 10.
    for (let i = 2; i <= 10; i++) {
      await createRackDirect(page);
    }
    await expect(fronts).toHaveCount(10);

    // The 11th exceeds the limit: no rack is added and a warning toast appears.
    await clickNewRack(page);
    await expect(page.locator(locators.toast.warning)).toBeVisible();
    await expect(fronts).toHaveCount(10);
  });

  test("Escape closes the New Rack wizard dialog", async ({ page }) => {
    // The wizard now opens via New layout (#2732 / #2747), not the New Rack button.
    await clickNewLayout(page);
    await expect(page.locator(locators.dialog.root)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(locators.dialog.root)).not.toBeVisible();
  });
});
