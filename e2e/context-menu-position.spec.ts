import { test, expect } from "./helpers/base-test";
import { gotoWithRack, RACK_WITH_DEVICE_SHARE, locators } from "./helpers";

/**
 * Regression test for #1725 (and the original #1193).
 *
 * Right-clicking a placed device must open its context menu at the cursor
 * location, not pinned to the top-left origin. The menu is rendered inside the
 * panzoom container, whose CSS `transform` re-bases `position: fixed`, so the
 * menu must be positioned via a `customAnchor` Measurable rather than a fixed
 * trigger element. This test guards against the menu collapsing back to (0,0).
 */
test("device context menu opens at the cursor, not the top-left origin", async ({
  page,
}) => {
  await gotoWithRack(page, RACK_WITH_DEVICE_SHARE);

  const device = page.locator(locators.rack.device).first();
  await expect(device).toBeVisible();
  const deviceBox = await device.boundingBox();
  if (!deviceBox) throw new Error("device has no bounding box");

  // Right-click the centre of the device — well away from the viewport origin.
  await device.click({
    button: "right",
    position: { x: deviceBox.width / 2, y: deviceBox.height / 2 },
  });

  const menu = page.locator(locators.contextMenu.content);
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  if (!menuBox) throw new Error("context menu has no bounding box");

  // The menu must appear near the right-clicked device, not at top-left (0,0).
  // Horizontal position tracks the cursor (bits-ui may flip vertically to keep
  // the menu inside the viewport, so we assert X against the click and only a
  // lower bound on Y).
  const clickX = deviceBox.x + deviceBox.width / 2;
  expect(Math.abs(menuBox.x - clickX)).toBeLessThan(40);
  expect(menuBox.x).toBeGreaterThan(50);
  expect(menuBox.y).toBeGreaterThan(50);
});
