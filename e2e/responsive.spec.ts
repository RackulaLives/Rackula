import { test, expect } from "./helpers/base-test";
import { gotoWithRack, locators } from "./helpers";

test.describe("Responsive Layout", () => {
  test.describe("Desktop viewport (1200px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 800 });
      await gotoWithRack(page);
    });

    test("toolbar action cluster is visible", async ({ page }) => {
      const toolbarCenter = page.locator(locators.toolbar.center);
      await expect(toolbarCenter).toBeVisible();
    });

    test("brand name visible", async ({ page }) => {
      const brandTitle = page.locator(locators.toolbar.brand).getByRole("img", {
        name: /Rackula/,
      });
      await expect(brandTitle).toBeVisible();
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

    test("file menu is accessible", async ({ page }) => {
      const fileMenu = page.getByRole("button", { name: /file menu/i });
      await expect(fileMenu).toBeVisible();
    });
  });

  test.describe("Medium viewport (900px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 800 });
      await gotoWithRack(page);
    });

    test("mobile mode is active — action cluster hidden", async ({ page }) => {
      const toolbarCenter = page.locator(locators.toolbar.center);
      await expect(toolbarCenter).not.toBeVisible();
    });

    test("brand name is still visible", async ({ page }) => {
      const brandTitle = page.locator(locators.toolbar.brand).getByRole("img", {
        name: /Rackula/,
      });
      await expect(brandTitle).toBeVisible();
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

    test("brand name remains visible in toolbar", async ({ page }) => {
      const brandTitle = page.locator(locators.toolbar.brand).getByRole("img", {
        name: /Rackula/,
      });
      await expect(brandTitle).toBeVisible();
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
