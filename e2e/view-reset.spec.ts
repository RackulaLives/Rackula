import { test, expect } from "./helpers/base-test";
import type { Page } from "@playwright/test";
import {
  gotoWithRack,
  SMALL_RACK_SHARE,
  clickNewRack,
  locators,
} from "./helpers";

/**
 * Helper to get the current panzoom transform
 */
async function getPanzoomTransform(page: Page) {
  return page.evaluate(() => {
    const panzoomContainer = document.querySelector(".panzoom-container");
    if (!panzoomContainer) return null;
    const style = (panzoomContainer as HTMLElement).style.transform;
    const match = style.match(/matrix\(([^)]+)\)/);
    if (!match) return null;
    const values = match[1].split(",").map((v) => parseFloat(v.trim()));
    return { scale: values[0], x: values[4], y: values[5] };
  });
}

test.describe("View Reset on Rack Changes", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page, SMALL_RACK_SHARE);
  });

  test("view resets when creating a new rack", async ({ page }) => {
    // Pan the view to an offset position first
    const canvas = page.locator(locators.canvas.root);
    await canvas.click();

    await page.evaluate(() => {
      const panzoomContainer = document.querySelector(".panzoom-container");
      if (panzoomContainer) {
        (panzoomContainer as HTMLElement).style.transform =
          "matrix(0.5, 0, 0, 0.5, -500, -500)";
      }
    });

    const transformBefore = await getPanzoomTransform(page);
    expect(transformBefore).toBeTruthy();

    // Create a new rack (replace existing) via the replace flow
    await clickNewRack(page);
    await page.click('[data-testid="btn-replace-rack"]');
    await page.fill("#rack-name", "Test Rack");
    await page.click('[data-testid="btn-height-24"]');
    await page.click('[data-testid="btn-wizard-next"]');
    await expect(page.locator(locators.rack.container).first()).toBeVisible();

    // Wait for the view to reset (transform should change from panned position)
    await expect
      .poll(async () => {
        const t = await getPanzoomTransform(page);
        return (
          t !== null &&
          (t.x !== transformBefore!.x || t.y !== transformBefore!.y)
        );
      })
      .toBeTruthy();
  });

  test("view resets when resizing rack height in EditPanel", async ({
    page,
  }) => {
    // Select the rack to open EditPanel BEFORE panning away
    await page.locator(locators.rack.svg).first().click();
    await expect(page.locator(locators.drawer.rightOpenBare)).toBeVisible();

    // Pan the view to an offset position
    await page.evaluate(() => {
      const panzoomContainer = document.querySelector(".panzoom-container");
      if (panzoomContainer) {
        (panzoomContainer as HTMLElement).style.transform =
          "matrix(1, 0, 0, 1, -300, -300)";
      }
    });

    const transformBefore = await getPanzoomTransform(page);
    expect(transformBefore).toBeTruthy();
    expect(transformBefore?.x).toBe(-300);

    // Click on a different height preset (e.g., 42U)
    await page.locator('.drawer-right [data-testid="btn-preset-height-42"]').click();

    // Wait for the view to reset (transform should change from panned position)
    await expect
      .poll(async () => {
        const t = await getPanzoomTransform(page);
        return (
          t !== null &&
          (t.x !== transformBefore!.x || t.y !== transformBefore!.y)
        );
      })
      .toBeTruthy();
  });

  test("view resets when resizing rack with numeric height input", async ({
    page,
  }) => {
    // Select the rack BEFORE panning away
    await page.locator(locators.rack.svg).first().click();
    await expect(page.locator(locators.drawer.rightOpenBare)).toBeVisible();

    // Pan away after selection
    await page.evaluate(() => {
      const panzoomContainer = document.querySelector(".panzoom-container");
      if (panzoomContainer) {
        (panzoomContainer as HTMLElement).style.transform =
          "matrix(1, 0, 0, 1, -200, -200)";
      }
    });

    const transformBefore = await getPanzoomTransform(page);
    expect(transformBefore).toBeTruthy();
    expect(transformBefore?.x).toBe(-200);

    // Use the numeric height input field to change height
    await page.locator(locators.drawer.rightRackHeight).fill("36");
    await page.locator(locators.drawer.rightRackHeight).blur();

    // Wait for the view to reset (transform should change from panned position)
    await expect
      .poll(async () => {
        const t = await getPanzoomTransform(page);
        return (
          t !== null &&
          (t.x !== transformBefore!.x || t.y !== transformBefore!.y)
        );
      })
      .toBeTruthy();
  });
});
