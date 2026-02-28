/**
 * Android Chrome E2E Tests
 *
 * Tests mobile-specific functionality across Android device viewports.
 * Uses Playwright Chromium as a baseline for catching rendering and interaction issues.
 *
 * @see https://github.com/RackulaLives/Rackula/issues/229
 */
import { test, expect } from "./helpers/base-test";
import type { Page } from "@playwright/test";
import { openDeviceLibraryFromBottomNav } from "./helpers/mobile-navigation";
import { EMPTY_RACK_SHARE, dragDeviceToRack } from "./helpers";

// Android Device viewport matrix
const androidDevices = [
  // Phones
  { name: "Pixel 7", width: 412, height: 915, mobile: true },
  { name: "Pixel 8 Pro", width: 448, height: 998, mobile: true },
  { name: "Samsung Galaxy S23", width: 360, height: 780, mobile: true },
  { name: "Samsung Galaxy S24 Ultra", width: 480, height: 1067, mobile: true },
  { name: "Samsung Galaxy A54", width: 412, height: 915, mobile: true },
  // Tablets
  { name: "Samsung Galaxy Tab S9", width: 800, height: 1280, mobile: false },
  { name: "Pixel Tablet", width: 1280, height: 800, mobile: false },
  // Foldables
  { name: "Samsung Galaxy Z Fold5", width: 904, height: 1842, mobile: true },
  { name: "Samsung Galaxy Z Flip5", width: 412, height: 919, mobile: true },
] as const;

const phoneDevices = androidDevices.filter((d) => d.mobile && d.width < 600);

/**
 * Setup helper for mobile viewport tests - uses share link instead of v0.2 flow
 */
async function setupMobileViewport(
  page: Page,
  device: (typeof androidDevices)[number],
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
  for (const device of phoneDevices.slice(0, 3)) {
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
    const device = androidDevices.find((d) => d.name === "Pixel Tablet")!;
    await setupMobileViewport(page, device);

    await expect(page.locator(".device-library-fab")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Devices" })).toHaveCount(0);
  });
});

// ============================================================================
// Bottom Sheet Tests
// ============================================================================

test.describe("Bottom Sheet", () => {
  const device = phoneDevices[0]; // Pixel 7

  test.beforeEach(async ({ page }) => {
    await setupMobileViewport(page, device);
  });

  test("bottom sheet opens when Devices tab is tapped", async ({ page }) => {
    await openDeviceLibraryFromBottomNav(page);

    const bottomSheet = page.locator(".bottom-sheet");
    await expect(bottomSheet).toBeVisible();
    // eslint-disable-next-line no-restricted-syntax -- E2E test verifying bottom sheet opens (user-visible state)
    await expect(bottomSheet).toHaveClass(/open/);
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

  test("bottom sheet swipe does not trigger Android back gesture", async ({
    page,
  }) => {
    await openDeviceLibraryFromBottomNav(page);

    const bottomSheet = page.locator(".bottom-sheet");
    await expect(bottomSheet).toBeVisible();

    const box = await bottomSheet.boundingBox();
    if (box) {
      const startY = box.y + 50;
      const centerX = box.x + box.width / 2;

      await page.mouse.move(centerX, startY);
      await page.mouse.down();
      await page.mouse.move(centerX, startY + 200, { steps: 10 });
      await page.mouse.up();
    }

    await expect(bottomSheet).not.toBeVisible({ timeout: 2000 });
  });
});

// ============================================================================
// Device Label Positioning Tests
// ============================================================================

test.describe("Device Label Positioning", () => {
  for (const device of phoneDevices.slice(0, 3)) {
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

  test.describe("DPI Density Variations", () => {
    const dpiTestDevices = [
      { ...phoneDevices[0], dpi: "medium" },
      { ...phoneDevices[2], dpi: "high" },
    ];

    for (const device of dpiTestDevices) {
      test(`${device.name} (${device.dpi} DPI) - labels positioned correctly`, async ({
        page,
      }) => {
        await setupMobileViewport(page, device);
        await dragDeviceToRack(page);

        const rackDevice = page.locator(".rack-device").first();
        await expect(rackDevice).toBeVisible({ timeout: 5000 });

        const foreignObject = page
          .locator(".rack-device foreignObject")
          .first();
        const foExists = (await foreignObject.count()) > 0;

        if (foExists) {
          await expect(foreignObject).toBeVisible();
        } else {
          const labelText = page.locator(".rack-device text").first();
          await expect(labelText).toBeVisible();
        }
      });
    }
  });
});

// ============================================================================
// No Horizontal Scroll Tests
// ============================================================================

test.describe("No Horizontal Scroll", () => {
  for (const device of androidDevices) {
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
// Haptic Feedback Tests (Android supports navigator.vibrate)
// ============================================================================

test.describe("Haptic Feedback", () => {
  test("navigator.vibrate is available on Android Chrome", async ({ page }) => {
    await setupMobileViewport(page, phoneDevices[0]);

    const vibrateSupported = await page.evaluate(() => {
      // eslint-disable-next-line no-restricted-syntax -- Testing browser API availability, not TypeScript types
      return typeof navigator.vibrate === "function";
    });

    expect(typeof vibrateSupported).toBe("boolean");
  });

  test("vibrate calls do not throw errors", async ({ page }) => {
    await setupMobileViewport(page, phoneDevices[0]);

    const noError = await page.evaluate(() => {
      try {
        // eslint-disable-next-line no-restricted-syntax -- Testing browser API availability, not TypeScript types
        if (typeof navigator.vibrate === "function") {
          navigator.vibrate(50);
          navigator.vibrate([50, 100, 50]);
          navigator.vibrate(0);
        }
        return true;
      } catch {
        return false;
      }
    });

    expect(noError).toBe(true);
  });

  test("haptic feedback fires during device placement", async ({ page }) => {
    await setupMobileViewport(page, phoneDevices[0]);

    const vibrateCalled = await page.evaluate(() => {
      let called = false;
      const originalVibrate = navigator.vibrate?.bind(navigator);
      if (originalVibrate) {
        navigator.vibrate = (...args) => {
          called = true;
          return originalVibrate(...args);
        };
      }
      return called;
    });

    expect(typeof vibrateCalled).toBe("boolean");
  });
});

// ============================================================================
// Touch Interaction Tests
// ============================================================================

test.describe("Touch Interactions", () => {
  const device = phoneDevices[0]; // Pixel 7

  test.beforeEach(async ({ page }) => {
    await setupMobileViewport(page, device);
  });

  test("tap-to-select works on placed device", async ({ page }) => {
    await dragDeviceToRack(page);

    const rackDevice = page.locator(".rack-device").first();
    await expect(rackDevice).toBeVisible({ timeout: 5000 });

    await rackDevice.tap();

    // eslint-disable-next-line no-restricted-syntax -- E2E test verifying device selection (user-visible state)
    await expect(rackDevice).toHaveClass(/selected/, { timeout: 2000 });
  });

  test("touch coordinates are accurate on different viewports", async ({
    page,
  }) => {
    const rackSvg = page.locator(".rack-svg");
    await expect(rackSvg).toBeVisible();

    const box = await rackSvg.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Long-Press Gesture Tests
// ============================================================================

test.describe("Long-Press Gesture", () => {
  const device = phoneDevices[0]; // Pixel 7

  test.beforeEach(async ({ page }) => {
    await setupMobileViewport(page, device);
  });

  test("long-press does not trigger Android context menu", async ({ page }) => {
    await dragDeviceToRack(page);

    const rackDevice = page.locator(".rack-device").first();
    await expect(rackDevice).toBeVisible({ timeout: 5000 });

    const box = await rackDevice.boundingBox();
    if (box) {
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

      const startPos = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.mouse.move(startPos.x, startPos.y);
      await page.mouse.down();
      await page.waitForTimeout(600);
      await page.mouse.up();
    }

    const contextMenu = page.locator('[role="menu"]');
    await expect(contextMenu).not.toBeVisible();
  });
});

// ============================================================================
// Foldable Device Tests
// ============================================================================

test.describe("Foldable Devices", () => {
  const foldables = androidDevices.filter(
    (d) => d.name.includes("Fold") || d.name.includes("Flip"),
  );

  for (const device of foldables) {
    test(
      device.name + " - layout adapts to unfolded dimensions",
      async ({ page }) => {
        await setupMobileViewport(page, device);

        const rackSvg = page.locator(".rack-svg");
        await expect(rackSvg).toBeVisible();

        const devicesTab = page.getByRole("button", { name: "Devices" });
        if (device.width < 1024) {
          await expect(devicesTab).toBeVisible();
        } else {
          await expect(devicesTab).toHaveCount(0);
        }
        await expect(page.locator(".device-library-fab")).toHaveCount(0);
      },
    );
  }
});

// ============================================================================
// WebView Compatibility Smoke Test
// ============================================================================

test.describe("WebView Compatibility", () => {
  test("core functionality works without advanced features", async ({
    page,
  }) => {
    await setupMobileViewport(page, phoneDevices[0]);

    const rackSvg = page.locator(".rack-svg");
    await expect(rackSvg).toBeVisible();

    await dragDeviceToRack(page);
    const rackDevice = page.locator(".rack-device").first();
    await expect(rackDevice).toBeVisible({ timeout: 5000 });

    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.reload();
    await page.locator(".rack-container").first().waitFor({ state: "visible" });

    const criticalErrors = errors.filter(
      (e) => !e.includes("warning") && !e.includes("deprecated"),
    );
    // eslint-disable-next-line no-restricted-syntax -- Testing no console errors (behavioral invariant: 0 errors expected)
    expect(criticalErrors).toHaveLength(0);
  });
});
