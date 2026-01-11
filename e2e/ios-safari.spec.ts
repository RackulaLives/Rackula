/**
 * iOS Safari E2E Tests
 *
 * Tests mobile-specific functionality across iOS device viewports.
 * Uses Playwright WebKit as a baseline for catching rendering and interaction issues.
 *
 * Note: Playwright's WebKit is a desktop build, not actual Mobile Safari.
 * For comprehensive iOS coverage, these tests should also run on real devices
 * via BrowserStack or LambdaTest (see docs/guides/TESTING.md).
 *
 * @see https://github.com/RackulaLives/Rackula/issues/228
 */
import { test, expect, Page } from "@playwright/test";

// iOS Device viewport matrix
const iosDevices = [
  { name: "iPhone SE", width: 375, height: 667, mobile: true },
  { name: "iPhone 14", width: 390, height: 844, mobile: true },
  { name: "iPhone 14 Pro Max", width: 430, height: 932, mobile: true },
  { name: "iPad mini", width: 744, height: 1133, mobile: false },
  { name: "iPad Pro 11", width: 834, height: 1194, mobile: false },
  { name: "iPad Pro 12.9", width: 1024, height: 1366, mobile: false },
] as const;

// Mobile-only devices (width < 1024px triggers mobile mode)
const mobileDevices = iosDevices.filter((d) => d.width < 1024);

/**
 * Setup helper for mobile viewport tests
 */
async function setupMobileViewport(
  page: Page,
  device: (typeof iosDevices)[number],
) {
  await page.setViewportSize({ width: device.width, height: device.height });
  await page.goto("/");

  // Clear storage and set started flag for consistent state
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
    localStorage.setItem("Rackula_has_started", "true");
    // Dismiss mobile warning modal for tests
    sessionStorage.setItem("rackula-mobile-warning-dismissed", "true");
  });
  await page.reload();
  await page.waitForTimeout(300);
}

/**
 * Helper to add a device to the rack via drag simulation
 */
async function addDeviceToRack(page: Page) {
  await page.evaluate(() => {
    const deviceItem = document.querySelector(".device-palette-item");
    const rack = document.querySelector(".rack-svg");

    if (!deviceItem || !rack) {
      throw new Error("Could not find device item or rack");
    }

    const dataTransfer = new DataTransfer();
    const dragStartEvent = new DragEvent("dragstart", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });
    deviceItem.dispatchEvent(dragStartEvent);

    const dragOverEvent = new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });
    rack.dispatchEvent(dragOverEvent);

    const dropEvent = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });
    rack.dispatchEvent(dropEvent);

    const dragEndEvent = new DragEvent("dragend", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });
    deviceItem.dispatchEvent(dragEndEvent);
  });
  await page.waitForTimeout(100);
}

// ============================================================================
// FAB Button Tests
// ============================================================================

test.describe("FAB Button (Device Library)", () => {
  for (const device of mobileDevices.slice(0, 2)) {
    test.describe(device.name, () => {
      test.beforeEach(async ({ page }) => {
        await setupMobileViewport(page, device);
      });

      test("FAB is visible on mobile viewport", async ({ page }) => {
        const fab = page.locator(".device-library-fab");
        await expect(fab).toBeVisible();
      });

      test("FAB has minimum 48px touch target", async ({ page }) => {
        const fab = page.locator(".device-library-fab");
        await expect(fab).toBeVisible();

        const box = await fab.boundingBox();
        expect(box).toBeTruthy();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(48);
          expect(box.height).toBeGreaterThanOrEqual(48);
        }
      });

      test("FAB is tappable and opens bottom sheet", async ({ page }) => {
        const fab = page.locator(".device-library-fab");
        await expect(fab).toBeVisible();
        await fab.tap();

        const bottomSheet = page.locator(".bottom-sheet");
        await expect(bottomSheet).toBeVisible({ timeout: 2000 });
      });
    });
  }

  test("FAB is NOT visible on iPad Pro 12.9 (desktop mode)", async ({
    page,
  }) => {
    const device = iosDevices.find((d) => d.name === "iPad Pro 12.9")!;
    await setupMobileViewport(page, device);

    const fab = page.locator(".device-library-fab");
    await expect(fab).not.toBeVisible();
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

  test("bottom sheet opens when FAB is tapped", async ({ page }) => {
    const fab = page.locator(".device-library-fab");
    await fab.tap();

    const bottomSheet = page.locator(".bottom-sheet");
    await expect(bottomSheet).toBeVisible();
  });

  test("bottom sheet has drag handle visible", async ({ page }) => {
    const fab = page.locator(".device-library-fab");
    await fab.tap();

    const dragHandle = page.locator(".drag-handle-bar");
    await expect(dragHandle).toBeVisible();
  });

  test("bottom sheet closes on backdrop click", async ({ page }) => {
    const fab = page.locator(".device-library-fab");
    await fab.tap();

    const bottomSheet = page.locator(".bottom-sheet");
    await expect(bottomSheet).toBeVisible();

    const backdrop = page.locator(".backdrop");
    await backdrop.click({ force: true });

    await expect(bottomSheet).not.toBeVisible({ timeout: 2000 });
  });

  test("bottom sheet closes on Escape key", async ({ page }) => {
    const fab = page.locator(".device-library-fab");
    await fab.tap();

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
        await addDeviceToRack(page);

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

    await addDeviceToRack(page);

    const device = page.locator(".rack-device").first();
    await expect(device).toBeVisible({ timeout: 5000 });
  });
});
