import { test, expect } from "./helpers/base-test";
import { locators } from "./helpers";

test.describe("First run", () => {
  test("a fresh session lands in exactly one editable layout with one rack", async ({
    page,
  }) => {
    // Desktop viewport so the layout tab strip (LayoutTabs) is present.
    await page.setViewportSize({ width: 1280, height: 800 });

    // Clear any persisted workspace so this is a genuine first run (no saved
    // layouts, no everHadLayouts marker). addInitScript runs before the app on
    // every navigation, so storage starts empty on the load under test; because
    // the app then persists its fresh workspace, the reload below restores it.
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

    // The rack is added to the seeded first tab, not a second appended tab, so
    // there is exactly one open layout tab (no phantom empty tab). This is the
    // assertion that guards against the fresh-install-second-tab regression.
    const layoutTabs = page
      .getByRole("tablist", { name: "Open layouts" })
      .getByRole("tab");
    await expect(layoutTabs).toHaveCount(1);

    // Because a rack exists, the zero-rack "Add a rack" affordance is not shown.
    await expect(
      page.locator(locators.canvas.addRackAffordance),
    ).not.toBeVisible();

    // The single tab is persisted (exactly one open tab, no phantom). Polling
    // the persisted index also ensures the debounced save has flushed before the
    // reload below.
    await expect
      .poll(() =>
        page.evaluate(() => {
          try {
            const raw = localStorage.getItem("Rackula:workspace");
            if (!raw) return -1;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed.openTabs) ? parsed.openTabs.length : -1;
          } catch {
            return -1;
          }
        }),
      )
      .toBe(1);

    // A reload restores exactly one tab with a rack; a phantom empty tab would
    // reappear here as a second tab.
    await page.reload();
    await expect(page.locator(locators.rack.container).first()).toBeVisible();
    await expect(layoutTabs).toHaveCount(1);
  });
});
