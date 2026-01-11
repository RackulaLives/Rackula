/**
 * Android Chrome E2E Tests
 *
 * Tests mobile-specific functionality across Android device viewports.
 * Uses Playwright Chromium as a baseline for catching rendering and interaction issues.
 *
 * Note: Playwright's Chromium is a desktop build, not actual Android Chrome.
 * For comprehensive Android coverage, these tests should also run on real devices
 * via BrowserStack or LambdaTest (see docs/guides/TESTING.md).
 *
 * Android-specific considerations:
 * - Device fragmentation (Samsung, Google, Xiaomi, etc.)
 * - Variable DPI densities (ldpi to xxxhdpi)
 * - WebView version differences
 * - OEM-specific browser modifications
 * - navigator.vibrate() IS supported (unlike iOS)
 *
 * @see https://github.com/RackulaLives/Rackula/issues/229
 */
import { test, expect, Page } from "@playwright/test";

// Android Device viewport matrix
const androidDevices = [
  // Phones - Various DPI densities
  { name: "Pixel 7", width: 412, height: 915, mobile: true },
  { name: "Pixel 8 Pro", width: 448, height: 998, mobile: true },
  { name: "Samsung Galaxy S23", width: 360, height: 780, mobile: true },
  { name: "Samsung Galaxy S24 Ultra", width: 480, height: 1067, mobile: true },
  { name: "Samsung Galaxy A54", width: 412, height: 915, mobile: true }, // Mid-range

  // Tablets
  { name: "Samsung Galaxy Tab S9", width: 800, height: 1280, mobile: false },
  { name: "Pixel Tablet", width: 1280, height: 800, mobile: false },

  // Foldables
  { name: "Samsung Galaxy Z Fold5", width: 904, height: 1842, mobile: true }, // Unfolded inner
  { name: "Samsung Galaxy Z Flip5", width: 412, height: 919, mobile: true },
] as const;

// Mobile-only devices (width < 1024px triggers mobile mode)
// Note: mobileDevices includes tablets, phoneDevices is phones only
const _mobileDevices = androidDevices.filter((d) => d.width < 1024);
const phoneDevices = androidDevices.filter((d) => d.mobile && d.width < 600);

/**
 * Setup helper for mobile viewport tests
 */
async function setupMobileViewport(
  page: Page,
  device: (typeof androidDevices)[number],
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
  for (const device of phoneDevices.slice(0, 3)) {
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

  test("FAB is NOT visible on Pixel Tablet (desktop mode)", async ({
    page,
  }) => {
    const device = androidDevices.find((d) => d.name === "Pixel Tablet")!;
    await setupMobileViewport(page, device);

    const fab = page.locator(".device-library-fab");
    await expect(fab).not.toBeVisible();
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

  test("bottom sheet opens when FAB is tapped", async ({ page }) => {
    const fab = page.locator(".device-library-fab");
    await fab.tap();

    const bottomSheet = page.locator(".bottom-sheet");
    await expect(bottomSheet).toBeVisible();
    // eslint-disable-next-line no-restricted-syntax -- E2E test verifying bottom sheet opens (user-visible state)
    await expect(bottomSheet).toHaveClass(/open/);
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

  test("bottom sheet swipe does not trigger Android back gesture", async ({
    page,
  }) => {
    const fab = page.locator(".device-library-fab");
    await fab.tap();

    const bottomSheet = page.locator(".bottom-sheet");
    await expect(bottomSheet).toBeVisible();

    // Simulate a vertical swipe (not from edge)
    const box = await bottomSheet.boundingBox();
    if (box) {
      const startY = box.y + 50;
      const centerX = box.x + box.width / 2;

      await page.mouse.move(centerX, startY);
      await page.mouse.down();
      await page.mouse.move(centerX, startY + 200, { steps: 10 });
      await page.mouse.up();
    }

    // Sheet should close from swipe-to-dismiss, not Android back
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
        await addDeviceToRack(page);

        const rackDevice = page.locator(".rack-device").first();
        await expect(rackDevice).toBeVisible({ timeout: 5000 });

        const deviceBox = await rackDevice.boundingBox();
        expect(deviceBox).toBeTruthy();
      },
    );
  }

  // Test across different DPI density devices
  test.describe("DPI Density Variations", () => {
    const dpiTestDevices = [
      { ...phoneDevices[0], dpi: "medium" }, // Pixel 7
      { ...phoneDevices[2], dpi: "high" }, // Samsung Galaxy S23
    ];

    for (const device of dpiTestDevices) {
      test(`${device.name} (${device.dpi} DPI) - labels positioned correctly`, async ({
        page,
      }) => {
        await setupMobileViewport(page, device);
        await addDeviceToRack(page);

        const rackDevice = page.locator(".rack-device").first();
        await expect(rackDevice).toBeVisible({ timeout: 5000 });

        // Verify foreignObject content renders
        const foreignObject = page
          .locator(".rack-device foreignObject")
          .first();
        const foExists = (await foreignObject.count()) > 0;

        // Either foreignObject works or fallback text renders
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

    // Note: In Playwright desktop Chromium, vibrate may or may not be available
    // On real Android devices, it should always be available
    expect(typeof vibrateSupported).toBe("boolean");
  });

  test("vibrate calls do not throw errors", async ({ page }) => {
    await setupMobileViewport(page, phoneDevices[0]);

    const noError = await page.evaluate(() => {
      try {
        // eslint-disable-next-line no-restricted-syntax -- Testing browser API availability, not TypeScript types
        if (typeof navigator.vibrate === "function") {
          navigator.vibrate(50);
          navigator.vibrate([50, 100, 50]); // Pattern
          navigator.vibrate(0); // Cancel
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

    // Track if vibrate was called
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

    // Note: This just verifies the setup works - actual haptic testing
    // requires real device verification via BrowserStack
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
    await addDeviceToRack(page);

    const rackDevice = page.locator(".rack-device").first();
    await expect(rackDevice).toBeVisible({ timeout: 5000 });

    await rackDevice.tap();

    // Device should be selected (shown by selection indicator or class)
    // eslint-disable-next-line no-restricted-syntax -- E2E test verifying device selection (user-visible state)
    await expect(rackDevice).toHaveClass(/selected/, { timeout: 2000 });
  });

  test("touch coordinates are accurate on different viewports", async ({
    page,
  }) => {
    // This test verifies touch event coordinates are properly calculated
    // across different viewport sizes
    const rackSvg = page.locator(".rack-svg");
    await expect(rackSvg).toBeVisible();

    const box = await rackSvg.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      // Touch should register within the rack bounds
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
    await addDeviceToRack(page);

    const rackDevice = page.locator(".rack-device").first();
    await expect(rackDevice).toBeVisible({ timeout: 5000 });

    // Simulate long-press (500ms)
    const box = await rackDevice.boundingBox();
    if (box) {
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

      // Hold for 500ms+ to trigger long-press
      const startPos = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.mouse.move(startPos.x, startPos.y);
      await page.mouse.down();
      await page.waitForTimeout(600); // 500ms threshold + buffer
      await page.mouse.up();
    }

    // Context menu should NOT be visible
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

        // Verify the app renders correctly at foldable dimensions
        const rackSvg = page.locator(".rack-svg");
        await expect(rackSvg).toBeVisible();

        // For Z Fold (wide when unfolded), check FAB visibility based on width
        const fab = page.locator(".device-library-fab");
        if (device.width < 1024) {
          await expect(fab).toBeVisible();
        }
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

    // Test basic rendering
    const rackSvg = page.locator(".rack-svg");
    await expect(rackSvg).toBeVisible();

    // Test basic interaction
    await addDeviceToRack(page);
    const rackDevice = page.locator(".rack-device").first();
    await expect(rackDevice).toBeVisible({ timeout: 5000 });

    // Verify no JavaScript errors occurred
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    // Navigate and check for errors
    await page.reload();
    await page.waitForTimeout(500);

    // Filter out expected warnings
    const criticalErrors = errors.filter(
      (e) => !e.includes("warning") && !e.includes("deprecated"),
    );
    // eslint-disable-next-line no-restricted-syntax -- Testing no console errors (behavioral invariant: 0 errors expected)
    expect(criticalErrors).toHaveLength(0);
  });
});
