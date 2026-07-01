import { test, expect } from "./helpers/base-test";
import { gotoWithRack, locators } from "./helpers";

test.describe("Responsive Layout", () => {
  test.describe("Desktop viewport (1200px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 800 });
      await gotoWithRack(page);
    });

    test("workspace-frame controls are visible", async ({ page }) => {
      // The top bar is the workspace frame only (#2072): the unified logo +
      // search pill (which opens the command palette, #2776) on the left and the
      // storage status chip in the right region are the desktop chrome.
      await expect(
        page.getByRole("button", { name: "Search or run a command" }),
      ).toBeVisible();
      await expect(page.getByTestId("storage-status-chip")).toBeVisible();
    });

    test("brand logo visible", async ({ page }) => {
      const logoMark = page.locator(locators.toolbar.brandLogoMark);
      await expect(logoMark).toBeVisible();
    });

    test("canvas controls split into upper-left history and lower-left view (#2697)", async ({
      page,
    }) => {
      // History (undo/redo) anchors to the canvas upper-left; the view/zoom pill
      // stays at the canvas lower-left. Both are on the canvas, left-aligned, and
      // do not overlap each other.
      const history = page.getByRole("group", { name: "History actions" });
      const view = page.getByRole("group", { name: "View actions" });
      await expect(history).toBeVisible();
      await expect(view).toBeVisible();

      const canvas = page.locator(locators.canvas.root);
      const canvasBox = await canvas.boundingBox();
      const historyBox = await history.boundingBox();
      const viewBox = await view.boundingBox();
      expect(canvasBox).not.toBeNull();
      expect(historyBox).not.toBeNull();
      expect(viewBox).not.toBeNull();
      if (!canvasBox || !historyBox || !viewBox) return;

      // History sits above View (upper-left vs lower-left).
      expect(historyBox.y + historyBox.height).toBeLessThanOrEqual(viewBox.y);

      // Both hug the left edge of the canvas, roughly aligned to the same column.
      const canvasMidX = canvasBox.x + canvasBox.width / 2;
      expect(historyBox.x).toBeLessThan(canvasMidX);
      expect(viewBox.x).toBeLessThan(canvasMidX);
      expect(Math.abs(historyBox.x - viewBox.x)).toBeLessThan(24);

      // History is anchored to the top half, View to the bottom half.
      const canvasMidY = canvasBox.y + canvasBox.height / 2;
      expect(historyBox.y).toBeLessThan(canvasMidY);
      expect(viewBox.y + viewBox.height).toBeGreaterThan(canvasMidY);
    });

    test("history controls clear the placement banner during placement (#2697)", async ({
      page,
    }) => {
      // The placement banner is a full-width top overlay stacked above the
      // controls. The upper-left History group must drop below it so undo/redo
      // stays reachable while a device is armed.
      const firstDevice = page.locator(locators.device.paletteItem).first();
      await expect(firstDevice).toBeVisible();
      await firstDevice.focus();
      await page.keyboard.press("Enter");

      const banner = page
        .locator('[data-testid="rack-canvas"] [role="status"]')
        .filter({ hasText: "Placing:" });
      await expect(banner).toBeVisible();

      const history = page.getByRole("group", { name: "History actions" });
      await expect(history).toBeVisible();

      const bannerBox = await banner.boundingBox();
      const historyBox = await history.boundingBox();
      expect(bannerBox).not.toBeNull();
      expect(historyBox).not.toBeNull();
      if (!bannerBox || !historyBox) return;

      // History's top edge sits at or below the banner's bottom edge: no overlap.
      expect(historyBox.y).toBeGreaterThanOrEqual(
        bannerBox.y + bannerBox.height,
      );
    });

    test("sidebar pane is visible", async ({ page }) => {
      const sidebar = page.locator(locators.sidebar.pane);
      await expect(sidebar).toBeVisible();
    });

    test("no horizontal scroll", async ({ page }) => {
      const hasHorizontalScroll = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
        );
      });
      expect(hasHorizontalScroll).toBe(false);
    });
  });

  test.describe("Medium viewport (900px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 800 });
      await gotoWithRack(page);
    });

    test("storage chip is the mobile top-bar right zone", async ({ page }) => {
      // The restructured mobile top bar (#2458) keeps the storage chip in the
      // right zone. The old quick file actions (Save / Load / Export) moved into
      // the registry-driven app menu behind the logo, so they no longer sit in
      // the top bar.
      await expect(page.getByTestId("storage-status-chip")).toBeVisible();
      await expect(
        page.getByRole("button", { name: /save layout/i }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /load layout/i }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /export layout/i }),
      ).toHaveCount(0);
    });

    test("layout name shows in the mobile top bar", async ({ page }) => {
      // Centred plain label; switching lives in the Layouts tab (#2458).
      await expect(page.getByTestId("mobile-layout-name")).toBeVisible();
    });

    test("command palette is reachable via the mobile pill", async ({
      page,
    }) => {
      // Below the 1024px mobile breakpoint (viewport.svelte.ts) the compact
      // logo + search pill is the single top-left control (#2776). It opens the
      // command palette (which presents as a full-screen sheet on touch, #2779),
      // replacing the former hamburger + search buttons.
      await expect(page.getByTestId("btn-command-palette")).toBeVisible();
    });

    test("mobile bottom navigation is visible", async ({ page }) => {
      const bottomNav = page.getByRole("navigation", {
        name: /mobile navigation/i,
      });
      await expect(bottomNav).toBeVisible();
    });

    test("no horizontal scroll", async ({ page }) => {
      const hasHorizontalScroll = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
        );
      });
      expect(hasHorizontalScroll).toBe(false);
    });
  });

  test.describe("Small viewport (600px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 600, height: 800 });
      await gotoWithRack(page);
    });

    test("command palette pill is visible in the mobile top bar", async ({
      page,
    }) => {
      // At 600px the app renders the mobile top bar (the 1024px mobile
      // breakpoint in viewport.svelte.ts). The compact logo + search pill is the
      // single top-left control on mobile (#2776), opening the command palette.
      await expect(page.getByTestId("btn-command-palette")).toBeVisible();
    });

    test("no horizontal scroll", async ({ page }) => {
      const hasHorizontalScroll = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
        );
      });
      expect(hasHorizontalScroll).toBe(false);
    });
  });

  test.describe("Panzoom at narrow viewport", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 800, height: 600 });
      await gotoWithRack(page);
    });

    test("canvas is visible and interactive", async ({ page }) => {
      const canvas = page.locator(locators.canvas.root);
      await expect(canvas).toBeVisible();
    });

    test("can pan the canvas", async ({ page }) => {
      const rack = page.locator(locators.rackView.dualView);
      await expect(rack).toBeVisible();

      const initialBox = await rack.boundingBox();
      expect(initialBox).toBeTruthy();

      const canvas = page.locator(locators.canvas.root);
      await canvas.hover();

      const canvasBox = await canvas.boundingBox();
      if (canvasBox) {
        const startX = canvasBox.x + canvasBox.width / 2;
        const startY = canvasBox.y + canvasBox.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 50, startY + 50, { steps: 5 });
        await page.mouse.up();
      }

      const panzoomContainer = page.locator(locators.canvas.panzoomContainer);
      const transform = await panzoomContainer.getAttribute("style");
      expect(transform).toContain("matrix");
    });

    test("reset view via keyboard shortcut", async ({ page }) => {
      const panzoomContainer = page.locator(locators.canvas.panzoomContainer);

      // Set a non-default transform (matches pattern in view-reset.spec.ts)
      await page.evaluate(() => {
        const container = document.querySelector(".panzoom-container");
        if (container) {
          (container as HTMLElement).style.transform =
            "matrix(0.5, 0, 0, 0.5, -300, -300)";
        }
      });

      const transformBefore = await panzoomContainer.getAttribute("style");
      expect(transformBefore).toContain("-300");

      // Press "f" to reset view — auto-retry until transform changes
      await page.keyboard.press("f");
      await expect
        .poll(() => panzoomContainer.getAttribute("style"), { timeout: 2000 })
        .not.toContain("-300");
    });
  });
});
