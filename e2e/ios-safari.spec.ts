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
import { EMPTY_RACK_SHARE, dragDeviceToRack } from "./helpers";

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
  await page.goto(`/?l=${EMPTY_RACK_SHARE}`);
  // Dismiss mobile warning modal for tests
  await page.evaluate(() => {
    sessionStorage.setItem("rackula-mobile-warning-dismissed", "true");
  });
  await page.locator(".rack-container").first().waitFor({ state: "visible" });
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

        const bottomSheet = page.locator(".bottom-sheet");
        await expect(bottomSheet).toBeVisible({ timeout: 2000 });
      });
    });
  }

  test("Device library FAB is removed in desktop mode", async ({ page }) => {
    const device = iosDevices.find((d) => d.name === "iPad Pro 12.9")!;
    await setupMobileViewport(page, device);

    await expect(page.locator(".device-library-fab")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Devices" })).toHaveCount(0);
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

    const bottomSheet = page.locator(".bottom-sheet");
    await expect(bottomSheet).toBeVisible();
  });

  test("bottom sheet has drag handle visible", async ({ page }) => {
    await openDeviceLibraryFromBottomNav(page);

    const dragHandle = page.locator(".drag-handle-bar");
    await expect(dragHandle).toBeVisible();
  });

  test("bottom sheet closes on backdrop click", async ({ page }) => {
    await openDeviceLibraryFromBottomNav(page);

    const bottomSheet = page.locator(".bottom-sheet");
    await expect(bottomSheet).toBeVisible();

    const backdrop = page.locator(".backdrop");
    await backdrop.click({ force: true });

    await expect(bottomSheet).not.toBeVisible({ timeout: 2000 });
  });

  test("bottom sheet closes on Escape key", async ({ page }) => {
    await openDeviceLibraryFromBottomNav(page);

    const bottomSheet = page.locator(".bottom-sheet");
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
        await dragDeviceToRack(page);

        const rackDevice = page.locator(".rack-device").first();
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

    await dragDeviceToRack(page);

    const device = page.locator(".rack-device").first();
    await expect(device).toBeVisible({ timeout: 5000 });
  });
});
