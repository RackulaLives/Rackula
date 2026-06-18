/**
 * Mobile tap-to-place with a MOUSE (regression for #1757)
 *
 * #1757: in mobile mode (viewport <= 1024px) placing a device onto a rack was
 * triggered only by `ontouchend`. Desktop browsers do NOT synthesise
 * TouchEvents for mouse/trackpad input, so a mouse user in a narrow window
 * could pick a device from the palette but never complete the placement tap.
 *
 * This exercises the exact gap no other project covers: the desktop projects
 * run at >1024px (desktop drag-and-drop) and the touch projects emulate real
 * TouchEvents. Here we run under the desktop `chromium` project (mouse,
 * hasTouch:false) but force a narrow viewport so the app enters mobile mode.
 *
 * The test fails against the pre-#1757 (touch-only) code, which is what makes
 * it a meaningful regression guard.
 *
 * NOTE: Test 2 from #1762 ("a pan ending over a rack does not place") is
 * intentionally omitted: it depends on the ~50ms `isPanning` window and is
 * timing-sensitive/flaky in CI. Per the issue's acceptance criteria it is
 * deferred rather than committed as a flaky test; it can be added later with
 * explicit synchronisation.
 */
import { test, expect } from "./helpers/base-test";
import { openDeviceLibraryFromBottomNav } from "./helpers/mobile-navigation";
import { EMPTY_RACK_SHARE, gotoWithRack, locators } from "./helpers";

// Desktop Chrome (mouse, hasTouch:false) at a narrow viewport -> mobile mode
// (breakpoint is max-width:1024px). 944x1039 matches the original bug report.
test.use({ viewport: { width: 944, height: 1039 } });

test.describe("Mobile tap-to-place with a mouse (#1757)", () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss the mobile-warning modal so it doesn't intercept interactions.
    await page.addInitScript(() => {
      sessionStorage.setItem("rackula-mobile-warning-dismissed", "true");
    });
    await gotoWithRack(page, EMPTY_RACK_SHARE);
  });

  test("mouse user can pick a device and tap a rack slot to place it", async ({
    page,
  }) => {
    const rack = page.locator(locators.rack.container).first();
    await expect(rack).toBeVisible();

    const devicesBefore = await page.locator(locators.rack.device).count();

    // Open the device library and pick the first device. On mobile this starts
    // placement mode and auto-closes the bottom sheet (do NOT press Escape — it
    // would cancel placement).
    await openDeviceLibraryFromBottomNav(page);
    const firstDevice = page.locator(locators.device.paletteItem).first();
    await expect(firstDevice).toBeVisible();
    await firstDevice.click();

    // Placement mode is active: the "Tap to place" status header appears and
    // the bottom sheet has closed. The header is a role="status" region; scope
    // by its text since dual-view renders it in both the front and rear SVGs.
    const placementHeader = page
      .getByRole("status")
      .filter({ hasText: "Tap to place" })
      .first();
    await expect(placementHeader).toBeVisible();
    await expect(placementHeader).toContainText("Tap to place");
    await expect(page.locator(locators.mobile.bottomSheet)).not.toBeVisible();

    // Tap a rack slot with the MOUSE (the path #1757 fixed). Use the front-view
    // SVG and aim ~35% down to land in clear rack interior, below the header.
    const rackSvg = page
      .locator(`${locators.rackView.front} ${locators.rack.svg}`)
      .first();
    const box = await rackSvg.boundingBox();
    if (!box) {
      throw new Error(
        "rackSvg boundingBox() returned null; cannot click placement target",
      );
    }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.35);

    // The device is placed: count increases and placement mode exits.
    await expect(async () => {
      const devicesAfter = await page.locator(locators.rack.device).count();
      expect(devicesAfter).toBeGreaterThan(devicesBefore);
    }).toPass({ timeout: 5000 });

    // (`.not.toBeVisible()` already auto-retries; wrapped in toPass per review
    // #1763 to make the post-placement settle explicit.)
    await expect(async () => {
      await expect(placementHeader).not.toBeVisible();
    }).toPass({ timeout: 5000 });
  });
});
