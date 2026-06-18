import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  clickNewRack,
  completeWizardWithClicks,
  locators,
} from "./helpers";

/**
 * Regression: clicking a rack's canvas click target must populate the Edit
 * panel for that rack, even when a different rack is the active rack (#2407).
 *
 * This exercises the real click -> handler -> selection-store -> panel path,
 * which the unit test in side-panel-edit-context.test.ts cannot reach (it sets
 * the store directly).
 */
test.describe("Rack selection populates the Edit panel (#2407)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("clicking a rack while a different rack is active populates the Edit panel", async ({
    page,
  }) => {
    // Two standalone racks.
    await clickNewRack(page);
    await completeWizardWithClicks(page, { name: "Second Rack", height: 24 });
    await expect(page.locator(locators.rackView.dualViewName)).toHaveCount(2);

    const firstRack = page.locator(locators.rackView.dualView).first();
    const secondRack = page.locator(locators.rackView.dualView).nth(1);

    // Select the FIRST rack: it becomes the active + selected rack and the
    // Edit panel populates for it.
    await firstRack.locator(locators.rackView.frontSvg).click();
    await expect(page.locator(locators.sidePanel.editEmpty)).not.toBeVisible();

    // Now select the SECOND rack via its click target while the first rack is
    // active. The panel must update to the second rack, not fall back to its
    // empty state (#2407).
    await secondRack.locator(locators.rackView.frontSvg).click();
    await expect(page.locator(locators.sidePanel.editEmpty)).not.toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
      "Second Rack",
    );
  });

  test("clicking the rack name / outer chrome (not the body) populates the Edit panel", async ({
    page,
  }) => {
    await clickNewRack(page);
    await completeWizardWithClicks(page, { name: "Second Rack", height: 24 });
    await expect(page.locator(locators.rackView.dualViewName)).toHaveCount(2);

    const firstRack = page.locator(locators.rackView.dualView).first();
    const secondRack = page.locator(locators.rackView.dualView).nth(1);

    // Make the first rack the active + selected one.
    await firstRack.locator(locators.rackView.frontSvg).click();
    await expect(page.locator(locators.sidePanel.editEmpty)).not.toBeVisible();

    // Click the SECOND rack's name (outer chrome, not the rack body). This is
    // the "area around the rack / the title" click target from #2407: it must
    // select the rack and populate the Edit panel, not merely focus the
    // container (whose focus outline looks identical to the selection box).
    await secondRack.locator(locators.rackView.dualViewName).click();
    await expect(page.locator(locators.sidePanel.editEmpty)).not.toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
      "Second Rack",
    );
  });
});
