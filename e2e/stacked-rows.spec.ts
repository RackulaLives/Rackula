import { test, expect } from "./helpers/base-test";
import type { Locator } from "@playwright/test";
import { gotoWithRack, STACKED_ROWS_SHARE, locators } from "./helpers";

/**
 * Stacked canvas rows (#3370): each rack group renders as its own row and
 * standalone racks share one row. Fit-all frames every row, group chrome
 * included.
 */

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no bounding box");
  return b;
}

test.describe("Stacked group rows", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page, STACKED_ROWS_SHARE);
  });

  test("each group renders in its own row below the standalone racks", async ({
    page,
  }) => {
    const soloOne = await box(
      page.getByRole("listitem", { name: /^Solo One,/ }),
    );
    const soloTwo = await box(
      page.getByRole("listitem", { name: /^Solo Two,/ }),
    );
    const bay = await box(page.getByRole("group", { name: /bays/ }));
    const rowGroup = await box(
      page.locator(locators.rackView.rowGroup, { hasText: "Aisle Row" }),
    );

    // Standalone racks share one row: same baseline, left to right.
    expect(soloTwo.y + soloTwo.height).toBeCloseTo(
      soloOne.y + soloOne.height,
      0,
    );
    expect(soloTwo.x).toBeGreaterThan(soloOne.x + soloOne.width);

    // The standalone row, the bayed group and the row group occupy three
    // separate bands: no two overlap vertically. (Share links give every rack
    // the same position, so the groups sort first; the order is not asserted.)
    const bands = [soloOne, bay, rowGroup].sort((a, b) => a.y - b.y);
    for (let i = 1; i < bands.length; i++) {
      const above = bands[i - 1]!;
      expect(bands[i]!.y).toBeGreaterThan(above.y + above.height);
    }
  });

  test("fit-all frames every row, including group chrome", async ({ page }) => {
    const canvas = page.locator(locators.canvas.root);
    await canvas.click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("f");

    const viewport = await box(canvas);
    const targets = [
      page.getByRole("listitem", { name: /^Solo One,/ }),
      page.getByRole("listitem", { name: /^Solo Two,/ }),
      page.getByRole("group", { name: /bays/ }),
      page.locator(locators.rackView.rowGroup, { hasText: "Aisle Row" }),
    ];

    await expect
      .poll(async () => {
        for (const target of targets) {
          const b = await box(target);
          if (
            b.x < viewport.x - 1 ||
            b.y < viewport.y - 1 ||
            b.x + b.width > viewport.x + viewport.width + 1 ||
            b.y + b.height > viewport.y + viewport.height + 1
          ) {
            return false;
          }
        }
        return true;
      })
      .toBe(true);
  });
});
