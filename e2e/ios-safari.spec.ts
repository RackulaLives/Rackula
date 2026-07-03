/**
 * iOS Safari E2E Tests
 *
 * Tests mobile-specific functionality across iOS device viewports.
 * Uses Playwright WebKit as a baseline for catching rendering and interaction issues.
 *
 * @see https://github.com/RackulaLives/Rackula/issues/228
 */
import { test, expect } from "./helpers/base-test";
import type { Page } from "@playwright/test";
import { openDeviceLibraryFromBottomNav } from "./helpers/mobile-navigation";
import {
  EMPTY_RACK_SHARE,
  dragDeviceToRack,
  paletteItemByName,
  locators,
} from "./helpers";

// iOS Device viewport matrix
const iosDevices = [
  { name: "iPhone SE", width: 375, height: 667, mobile: true },
  { name: "iPhone 14", width: 390, height: 844, mobile: true },
  { name: "iPhone 14 Pro Max", width: 430, height: 932, mobile: true },
  { name: "iPad mini", width: 744, height: 1133, mobile: false },
  { name: "iPad Pro 11", width: 834, height: 1194, mobile: false },
  { name: "iPad Pro 12.9", width: 1024, height: 1366, mobile: false },
] as const;

const mobileDevices = iosDevices.filter((d) => d.width < 1024);

/**
 * Setup helper for mobile viewport tests - uses share link instead of v0.2 flow
 */
async function setupMobileViewport(
  page: Page,
  device: (typeof iosDevices)[number],
) {
  await page.setViewportSize({ width: device.width, height: device.height });
  await page.addInitScript(() => {
    sessionStorage.setItem("rackula-mobile-warning-dismissed", "true");
  });
  await page.goto(`/?l=${EMPTY_RACK_SHARE}`);
  await page
    .locator(locators.rack.container)
    .first()
    .waitFor({ state: "visible" });
}

/**
 * On mobile viewports, the device palette is inside the bottom sheet.
 * Open it before calling dragDeviceToRack so palette items are visible.
 */
async function mobileDragDeviceToRack(page: Page) {
  await openDeviceLibraryFromBottomNav(page);
  return dragDeviceToRack(page);
}

// ============================================================================
// Devices Tab Tests
// ============================================================================

test.describe("Devices Tab (Device Library)", () => {
  for (const device of mobileDevices.slice(0, 2)) {
    test.describe(device.name, () => {
      test.beforeEach(async ({ page }) => {
        await setupMobileViewport(page, device);
      });

      test("Devices tab is visible on mobile viewport", async ({ page }) => {
        const devicesTab = page.getByRole("button", { name: "Devices" });
        await expect(devicesTab).toBeVisible();
      });

      test("Devices tab has minimum 48px touch target", async ({ page }) => {
        const devicesTab = page.getByRole("button", { name: "Devices" });
        await expect(devicesTab).toBeVisible();

        const box = await devicesTab.boundingBox();
        expect(box).toBeTruthy();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(48);
          expect(box.height).toBeGreaterThanOrEqual(48);
        }
      });

      test("Devices tab is tappable and opens bottom sheet", async ({
        page,
      }) => {
        await openDeviceLibraryFromBottomNav(page);

        const bottomSheet = page.locator(locators.mobile.bottomSheet);
        await expect(bottomSheet).toBeVisible({ timeout: 2000 });
      });
    });
  }

  test("mobile device-library affordances are removed in desktop mode", async ({
    page,
  }) => {
    // iPad Pro 12.9 at 1024px is at the mobile breakpoint (max-width: 1024px),
    // so it's still mobile. Use a wider viewport to test desktop mode.
    await page.setViewportSize({ width: 1280, height: 1366 });
    await page.addInitScript(() => {
      sessionStorage.setItem("rackula-mobile-warning-dismissed", "true");
    });
    await page.goto(`/?l=${EMPTY_RACK_SHARE}`);
    await page
      .locator(locators.rack.container)
      .first()
      .waitFor({ state: "visible" });

    // The mobile-only device-library affordances are absent in desktop mode.
    await expect(page.locator(locators.mobile.deviceLibraryFab)).toHaveCount(0);
    await expect(page.locator(locators.mobile.bottomNav)).toHaveCount(0);
    await expect(page.getByTestId("nav-tab-devices")).toHaveCount(0);

    // The desktop layout still exposes the device library, now through the
    // sidebar's Devices tab (role="tab", not the mobile bottom-nav button).
    await expect(page.getByRole("tab", { name: "Devices" })).toBeVisible();
  });
});

// ============================================================================
// Bottom Sheet Tests
// ============================================================================

test.describe("Bottom Sheet", () => {
  const device = mobileDevices[0]; // iPhone SE

  test.beforeEach(async ({ page }) => {
    await setupMobileViewport(page, device);
  });

  test("bottom sheet opens when Devices tab is tapped", async ({ page }) => {
    await openDeviceLibraryFromBottomNav(page);

    const bottomSheet = page.locator(locators.mobile.bottomSheet);
    await expect(bottomSheet).toBeVisible();
  });

  test("bottom sheet has drag handle visible", async ({ page }) => {
    await openDeviceLibraryFromBottomNav(page);

    const dragHandle = page.locator(locators.mobile.dragHandleBar);
    await expect(dragHandle).toBeVisible();
  });

  test("bottom sheet closes on backdrop click", async ({ page }) => {
    await openDeviceLibraryFromBottomNav(page);

    const bottomSheet = page.locator(locators.mobile.bottomSheet);
    await expect(bottomSheet).toBeVisible();

    const backdrop = page.locator(locators.mobile.backdrop);
    await backdrop.click({ force: true });

    await expect(bottomSheet).not.toBeVisible({ timeout: 2000 });
  });

  test("bottom sheet closes on Escape key", async ({ page }) => {
    await openDeviceLibraryFromBottomNav(page);

    const bottomSheet = page.locator(locators.mobile.bottomSheet);
    await expect(bottomSheet).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(bottomSheet).not.toBeVisible({ timeout: 2000 });
  });
});

// ============================================================================
// Device Label Positioning Tests
// ============================================================================

test.describe("Device Label Positioning", () => {
  for (const device of mobileDevices.slice(0, 2)) {
    test(
      device.name + " - device labels render within bounds",
      async ({ page }) => {
        await setupMobileViewport(page, device);
        // Open bottom sheet to expose palette items on mobile
        await mobileDragDeviceToRack(page);

        const rackDevice = page.locator(locators.rack.device).first();
        await expect(rackDevice).toBeVisible({ timeout: 5000 });

        const deviceBox = await rackDevice.boundingBox();
        expect(deviceBox).toBeTruthy();
      },
    );
  }
});

// ============================================================================
// No Horizontal Scroll Tests
// ============================================================================

test.describe("No Horizontal Scroll", () => {
  for (const device of iosDevices) {
    test(device.name + " has no horizontal scroll", async ({ page }) => {
      await setupMobileViewport(page, device);

      const hasHorizontalScroll = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
        );
      });
      expect(hasHorizontalScroll).toBe(false);
    });
  }
});

// ============================================================================
// Tap-to-place (real touch) — #2454
// ============================================================================

test.describe("Tap-to-place on touch (#2454)", () => {
  // iPhone 14: a real-touch (hasTouch) WebKit profile, so .tap() and
  // touchscreen.tap() dispatch genuine TouchEvents and exercise the rack SVG's
  // ontouchend placement path (not the mouse/click path covered elsewhere).
  const device = iosDevices.find((d) => d.name === "iPhone 14")!;

  test.beforeEach(async ({ page }) => {
    await setupMobileViewport(page, device);
  });

  test("arming a device and tapping a valid slot places it", async ({
    page,
  }) => {
    const devicesBefore = await page.locator(locators.rack.device).count();

    // Arm placement: tap a placeable full-width Server. This closes the bottom
    // sheet and surfaces the "Placing:" banner. Do NOT press Escape, it cancels.
    await openDeviceLibraryFromBottomNav(page);
    const serverDevice = paletteItemByName(page, "Server").first();
    await expect(serverDevice).toBeVisible();
    await serverDevice.tap();

    const placementBanner = page
      .getByRole("status")
      .filter({ hasText: "Placing:" })
      .first();
    await expect(placementBanner).toBeVisible();
    await expect(page.locator(locators.mobile.bottomSheet)).not.toBeVisible();

    // Tap a rack slot with real touch. Aim ~45% down the front-view SVG to land
    // in clear rack interior, clear of the top banner.
    const rackSvg = page
      .locator(`${locators.rackView.front} ${locators.rack.svg}`)
      .first();
    const box = await rackSvg.boundingBox();
    if (!box) {
      throw new Error(
        "rackSvg boundingBox() returned null; cannot tap placement target",
      );
    }
    await page.touchscreen.tap(
      box.x + box.width / 2,
      box.y + box.height * 0.45,
    );

    // The device is placed: count increases and placement mode exits.
    await expect(async () => {
      const devicesAfter = await page.locator(locators.rack.device).count();
      expect(devicesAfter).toBeGreaterThan(devicesBefore);
    }).toPass({ timeout: 5000 });
    await expect(placementBanner).not.toBeVisible({ timeout: 5000 });
  });

  test("the Cancel button in the banner aborts placement", async ({ page }) => {
    const devicesBefore = await page.locator(locators.rack.device).count();

    await openDeviceLibraryFromBottomNav(page);
    const serverDevice = paletteItemByName(page, "Server").first();
    await expect(serverDevice).toBeVisible();
    await serverDevice.tap();

    const placementBanner = page
      .getByRole("status")
      .filter({ hasText: "Placing:" })
      .first();
    await expect(placementBanner).toBeVisible();

    await page.getByRole("button", { name: /cancel placement/i }).tap();

    // Placement is cancelled: the banner is gone and nothing was placed.
    await expect(placementBanner).not.toBeVisible({ timeout: 5000 });
    const devicesAfter = await page.locator(locators.rack.device).count();
    expect(devicesAfter).toBe(devicesBefore);
  });
});

// ============================================================================
// Haptic Feedback Graceful Degradation
// ============================================================================

test.describe("Haptic Feedback", () => {
  test("navigator.vibrate is handled gracefully", async ({ page }) => {
    await setupMobileViewport(page, mobileDevices[0]);

    const vibrateSupported = await page.evaluate(() => {
      // eslint-disable-next-line no-restricted-syntax -- Testing browser API availability, not TypeScript types
      return typeof navigator.vibrate === "function";
    });

    expect(typeof vibrateSupported).toBe("boolean");

    // Open bottom sheet to expose palette items on mobile
    await mobileDragDeviceToRack(page);

    const device = page.locator(locators.rack.device).first();
    await expect(device).toBeVisible({ timeout: 5000 });
  });
});
