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
    const viewport = await box(canvas);
    const targets = [
      page.getByRole("listitem", { name: /^Solo One,/ }),
      page.getByRole("listitem", { name: /^Solo Two,/ }),
      page.getByRole("group", { name: /bays/ }),
      page.locator(locators.rackView.rowGroup, { hasText: "Aisle Row" }),
    ];
    const allInView = async () => {
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
    };

    // The page opens with every rack in view, so pan away first: otherwise
    // the test passes without fit-all doing anything. The drag starts on
    // empty canvas right of the racks, since a press on a rack does not pan.
    const startX = viewport.x + viewport.width - 40;
    const startY = viewport.y + viewport.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - viewport.width * 0.75, startY, {
      steps: 10,
    });
    await page.mouse.up();
    await expect.poll(allInView).toBe(false);

    // Focus rather than click: the left panel's edge grip overlays the
    // canvas's left edge and would take a click there.
    await canvas.focus();
    await page.keyboard.press("f");

    await expect.poll(allInView).toBe(true);
  });
});
