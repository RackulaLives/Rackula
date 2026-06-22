/**
 * Keyboard-only device placement (#106).
 *
 * A keyboard user picks a device from the palette with Enter ("picks it up"),
 * moves a U-slot cursor in the focused rack with the arrow keys, and places it
 * with Enter. Escape cancels with no side effects. The flow is announced through
 * an assertive live region for screen readers.
 *
 * These run under the desktop `chromium` project (mouse + keyboard, wide
 * viewport) where the sidebar palette is visible, which is the desktop
 * keyboard path this issue adds.
 */
import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  SMALL_RACK_SHARE,
  clickNewRack,
  completeWizardWithClicks,
  locators,
} from "./helpers";

const announcer = '[data-testid="placement-sr-announcer"]';
const placementBanner = '[data-testid="rack-canvas"] [role="status"]';

test.describe("Keyboard device placement (#106)", () => {
  test.beforeEach(async ({ page }) => {
    // SMALL_RACK_SHARE is an empty 12U rack; the Devices sidebar tab is the
    // desktop default, so the palette is on screen.
    await gotoWithRack(page, SMALL_RACK_SHARE);
  });

  test("pick up with Enter, move with arrows, place with Enter", async ({
    page,
  }) => {
    const firstDevice = page.locator(locators.device.paletteItem).first();
    await expect(firstDevice).toBeVisible();

    const devicesBefore = await page.locator(locators.rack.device).count();

    // Enter on a focused palette device picks it up (enters placement mode).
    await firstDevice.focus();
    await page.keyboard.press("Enter");

    // Placement mode is announced: the "Placing:" banner appears and the
    // assertive announcer names the mode, the seeded slot, and the controls.
    await expect(
      page.locator(placementBanner).filter({ hasText: "Placing:" }),
    ).toBeVisible();
    await expect(page.locator(announcer)).toContainText("Placing");
    await expect(page.locator(announcer)).toContainText("arrows");

    // A placement preview is shown on the rack.
    await expect(page.locator(locators.rack.dropZone).first()).toBeVisible();

    // Arrow keys move the U-slot cursor; the announcer reports the new slot.
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(announcer)).toContainText(
      /U\d+ of .+, available/,
    );

    // Enter confirms placement.
    await page.keyboard.press("Enter");

    // The device is placed (count increases) and placement mode exits.
    await expect(async () => {
      const devicesAfter = await page.locator(locators.rack.device).count();
      expect(devicesAfter).toBeGreaterThan(devicesBefore);
    }).toPass({ timeout: 5000 });
    await expect(
      page.locator(placementBanner).filter({ hasText: "Placing:" }),
    ).not.toBeVisible();
    await expect(page.locator(announcer)).toContainText("Placed");
  });

  test("Space confirms placement", async ({ page }) => {
    const firstDevice = page.locator(locators.device.paletteItem).first();
    await expect(firstDevice).toBeVisible();

    const devicesBefore = await page.locator(locators.rack.device).count();

    await firstDevice.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.locator(placementBanner).filter({ hasText: "Placing:" }),
    ).toBeVisible();

    // Space at the seeded slot places the device.
    await page.keyboard.press("Space");

    await expect(async () => {
      const devicesAfter = await page.locator(locators.rack.device).count();
      expect(devicesAfter).toBeGreaterThan(devicesBefore);
    }).toPass({ timeout: 5000 });
  });

  test("Escape cancels placement with no side effects", async ({ page }) => {
    const firstDevice = page.locator(locators.device.paletteItem).first();
    await expect(firstDevice).toBeVisible();

    const devicesBefore = await page.locator(locators.rack.device).count();

    await firstDevice.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.locator(placementBanner).filter({ hasText: "Placing:" }),
    ).toBeVisible();

    // Move the cursor, then cancel.
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Escape");

    // Placement mode exits, the cancel is announced, and nothing was placed.
    await expect(
      page.locator(placementBanner).filter({ hasText: "Placing:" }),
    ).not.toBeVisible();
    await expect(page.locator(announcer)).toContainText("Placement cancelled");

    const devicesAfter = await page.locator(locators.rack.device).count();
    expect(devicesAfter).toBe(devicesBefore);
  });

  test("Tab switches the target rack during placement", async ({ page }) => {
    // Add a second rack so there is somewhere to Tab to.
    await clickNewRack(page);
    await completeWizardWithClicks(page, { name: "Second Rack", height: 12 });
    await expect(page.locator(locators.rackView.dualViewName)).toHaveCount(2);

    // The wizard left the sidebar on the Racks tab; switch back to Devices so
    // the palette is on screen.
    await page.getByRole("tab", { name: "Devices" }).click();

    const firstDevice = page.locator(locators.device.paletteItem).first();
    await expect(firstDevice).toBeVisible();

    await firstDevice.focus();
    await page.keyboard.press("Enter");

    // The cursor seeds in the active rack (the newly created Second Rack).
    await expect(page.locator(announcer)).toContainText("Second Rack");

    // Tab moves the cursor to the other rack; the announcer names it.
    await page.keyboard.press("Tab");
    await expect(page.locator(announcer)).toContainText(
      /U\d+ of (?!Second Rack)/,
    );

    // Place there.
    const devicesBefore = await page.locator(locators.rack.device).count();
    await page.keyboard.press("Enter");
    await expect(async () => {
      const devicesAfter = await page.locator(locators.rack.device).count();
      expect(devicesAfter).toBeGreaterThan(devicesBefore);
    }).toPass({ timeout: 5000 });
  });

  test("placement survives undo (placed device can be undone)", async ({
    page,
  }) => {
    const firstDevice = page.locator(locators.device.paletteItem).first();
    await expect(firstDevice).toBeVisible();

    const devicesBefore = await page.locator(locators.rack.device).count();

    await firstDevice.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter"); // place at seeded slot

    await expect(async () => {
      const devicesAfter = await page.locator(locators.rack.device).count();
      expect(devicesAfter).toBeGreaterThan(devicesBefore);
    }).toPass({ timeout: 5000 });

    // Keyboard placement goes through the recorded placeDevice path, so Ctrl+Z
    // removes the device again (proves it is not a parallel, unrecorded path).
    await page.keyboard.press("ControlOrMeta+z");
    await expect(async () => {
      const devicesAfter = await page.locator(locators.rack.device).count();
      expect(devicesAfter).toBe(devicesBefore);
    }).toPass({ timeout: 5000 });
  });
});
