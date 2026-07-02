import { test, expect } from "./helpers/base-test";
import { locators } from "./helpers";

test.describe("First run", () => {
  test("a fresh session lands in an editable layout with one rack", async ({
    page,
  }) => {
    // Clear any persisted workspace so this is a genuine first run (no saved
    // layouts, no everHadLayouts marker). addInitScript runs before the app on
    // every navigation, so the storage stays empty for the load under test.
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        // Storage may be unavailable; the app falls back to its defaults.
      }
    });

    await page.goto("/");

    // First run auto-creates a default layout and one rack (#2831), so the
    // canvas shows a rack immediately rather than a bare zero-rack void.
    await expect(page.locator(locators.rack.container).first()).toBeVisible();

    // Because a rack exists, the zero-rack "Add a rack" affordance is not shown.
    await expect(
      page.locator(locators.canvas.addRackAffordance),
    ).not.toBeVisible();
  });
});
