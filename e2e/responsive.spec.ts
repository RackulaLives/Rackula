import { test, expect } from "./helpers/base-test";
import { gotoWithRack, locators } from "./helpers";

test.describe("Responsive Layout", () => {
  test.describe("Desktop viewport (1200px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 800 });
      await gotoWithRack(page);
    });

    test("workspace-frame controls are visible", async ({ page }) => {
      // The top bar is the workspace frame only (#2072): the app menu (logo)
      // on the left and the storage status chip in the right region are the
      // desktop chrome. Settings moved into the app menu (#2398).
      await expect(
        page.getByRole("button", { name: "App menu" }),
      ).toBeVisible();
      await expect(page.getByTestId("storage-status-chip")).toBeVisible();
    });

    test("brand logo visible", async ({ page }) => {
      const logoMark = page.locator(locators.toolbar.brandLogoMark);
      await expect(logoMark).toBeVisible();
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

    test("app menu is accessible", async ({ page }) => {
      // File commands live in the app menu behind the logo (#2072).
      const appMenu = page.getByRole("button", { name: "App menu" });
      await expect(appMenu).toBeVisible();
    });
  });

  test.describe("Medium viewport (900px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 800 });
      await gotoWithRack(page);
    });

    test("mobile mode is active — desktop chrome hidden", async ({ page }) => {
      // In mobile mode the desktop-only storage chip gives way to the mobile
      // quick file actions (asserted in the next test).
      await expect(page.getByTestId("storage-status-chip")).not.toBeVisible();
    });

    test("brand logo is still visible", async ({ page }) => {
      const logoMark = page.locator(locators.toolbar.brandLogoMark);
      await expect(logoMark).toBeVisible();
    });

    test("mobile action buttons are shown", async ({ page }) => {
      const saveBtn = page.getByRole("button", { name: /save layout/i });
      const loadBtn = page.getByRole("button", { name: /load layout/i });
      const exportBtn = page.getByRole("button", { name: /export layout/i });

      await expect(saveBtn).toBeVisible();
      await expect(loadBtn).toBeVisible();
      await expect(exportBtn).toBeVisible();
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

    test("brand logo remains visible in toolbar", async ({ page }) => {
      const logoMark = page.locator(locators.toolbar.brandLogoMark);
      await expect(logoMark).toBeVisible();
    });

    test("logo mark is visible", async ({ page }) => {
      const logo = page.locator(locators.toolbar.brandLogoMark);
      await expect(logo).toBeVisible();
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
