import { test, expect } from "./helpers/base-test";
import type { Page } from "@playwright/test";
import { gotoWithRack, createRackDirect, locators } from "./helpers";

/**
 * Create a fresh rack directly and name it, then return its front-view SVG.
 * The New Rack wizard was removed in #2747: every entry point now creates a
 * rack directly (a 24U/19"/ascending rack) and selects it, so rack dimensions
 * are configured afterwards through the Edit panel (EditPanelRack) rather than
 * a wizard. createRackDirect places the rack and renames it via the inspector.
 */
async function createNamedRack(page: Page, name: string) {
  await createRackDirect(page, { name });
  return page.locator(locators.rackView.dualView).filter({ hasText: name });
}

test.describe("Rack Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("can set a 10-inch rack width with narrower render", async ({
    page,
  }) => {
    const narrowRack = await createNamedRack(page, "Narrow Rack");

    // The rack is auto-selected on create, so the Edit panel shows its width
    // presets. Switch the selected rack to 10".
    await page
      .getByRole("group", { name: "Rack width in inches" })
      .getByRole("button", { name: '10"' })
      .click();

    await expect(narrowRack).toBeVisible();

    // The rack SVG should have a narrower viewBox for a 10" rack.
    const rackSvg = narrowRack.locator(locators.rackView.frontSvg);
    const viewBox = await rackSvg.getAttribute("viewBox");
    expect(viewBox).toBeDefined();

    if (viewBox) {
      const parts = viewBox.split(" ");
      const width = parseFloat(parts[2] || "0");
      // 10" rack should be narrower (roughly half of 19")
      expect(width).toBeLessThan(200);
    }
  });

  test("19-inch rack renders at standard width", async ({ page }) => {
    // Direct-created racks default to 19", so no width change is needed.
    const stdRack = await createNamedRack(page, "Standard Rack");

    // Set a 42U height via the Edit panel preset to match the previous coverage.
    await page.getByTestId("btn-preset-height-42").click();

    await expect(stdRack).toBeVisible();

    const rackSvg = stdRack.locator(locators.rackView.frontSvg);
    const viewBox = await rackSvg.getAttribute("viewBox");
    expect(viewBox).toBeDefined();

    if (viewBox) {
      const parts = viewBox.split(" ");
      const width = parseFloat(parts[2] || "0");
      // 19" rack should be standard width
      expect(width).toBeGreaterThan(200);
    }
  });

  // Descending units, custom starting unit, and form factor tests
  // are tracked by #1402. Stubs removed by #1226 triage.

  test("rack with ascending units shows U1 at bottom (default desc_units=false, starting_unit=1)", async ({
    page,
  }) => {
    const ascRack = await createNamedRack(page, "Ascending Rack");

    // Set a non-preset height of 10U via the Edit panel height field.
    const heightInput = page.locator("#rack-height");
    await heightInput.fill("10");
    await heightInput.press("Enter");

    await expect(ascRack).toBeVisible();

    // Scope U labels to the front view of the new rack.
    const firstRackSvg = ascRack.locator(locators.rackView.frontSvg);
    const uLabels = firstRackSvg.locator(locators.rack.uLabel);
    await expect(uLabels).toHaveCount(10);

    // First label (top) should be "10", last label (bottom) should be "1".
    await expect(uLabels.first()).toHaveText("10");
    await expect(uLabels.last()).toHaveText("1");
  });

  test("height field sets a non-preset height", async ({ page }) => {
    const rack = await createNamedRack(page, "Custom Height Rack");

    const heightInput = page.locator("#rack-height");
    await heightInput.fill("32");
    await heightInput.press("Enter");

    await expect(heightInput).toHaveValue("32");

    // The rack renders the new height: 32 U labels in its front view.
    const rackSvg = rack.locator(locators.rackView.frontSvg);
    await expect(rackSvg.locator(locators.rack.uLabel)).toHaveCount(32);
  });
});
