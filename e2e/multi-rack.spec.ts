import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  clickNewRack,
  completeWizardWithClicks,
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

  test("clicking New Rack opens wizard directly (no replace dialog)", async ({
    page,
  }) => {
    await clickNewRack(page);

    // Wizard should open directly — no ConfirmReplaceDialog
    await expect(page.locator(locators.dialog.root)).toBeVisible();
    await expect(page.locator("#rack-name")).toBeVisible();
  });

  test("can create a second rack", async ({ page }) => {
    // Create a second rack via the wizard
    await clickNewRack(page);
    await completeWizardWithClicks(page, { name: "Second Rack", height: 24 });

    // Should now have 2 racks (4 containers in dual-view: 2 per rack)
    await expect(page.locator(locators.rackView.dualViewName)).toHaveCount(2);
  });

  test("both racks coexist after creation", async ({ page }) => {
    // Create first named rack
    await clickNewRack(page);
    await completeWizardWithClicks(page, { name: "Rack Alpha" });

    // Create second named rack
    await clickNewRack(page);
    await completeWizardWithClicks(page, { name: "Rack Beta" });

    // Both rack names should be visible
    await expect(
      page.locator(locators.rackView.dualViewName, { hasText: "Rack Alpha" }),
    ).toBeVisible();
    await expect(
      page.locator(locators.rackView.dualViewName, { hasText: "Rack Beta" }),
    ).toBeVisible();
  });

  test("max rack limit shows toast warning", async ({ page }) => {
    // Creating 9 racks sequentially through the wizard can take a while on CI
    test.setTimeout(60000);

    // Create 9 more racks (already have 1 from share link) to hit the limit of 10
    for (let i = 2; i <= 10; i++) {
      await clickNewRack(page);
      await completeWizardWithClicks(page, { name: `Rack ${i}` });
    }

    // Attempt to create 11th rack — should show toast warning
    await clickNewRack(page);

    // Wizard should NOT open — wait for hidden to ensure the warning path was taken
    // rather than racing against wizard mount
    await expect(page.locator("#rack-name")).toBeHidden();

    // Toast warning should appear
    await expect(page.locator(locators.toast.warning)).toBeVisible();
  });

  test("Escape closes wizard dialog", async ({ page }) => {
    await clickNewRack(page);
    await expect(page.locator(locators.dialog.root)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(locators.dialog.root)).not.toBeVisible();
  });
});
