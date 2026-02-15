import { test, expect } from "@playwright/test";
import { gotoWithRack } from "./helpers";

test.describe("Responsive Layout", () => {
  test.describe("Desktop viewport (1200px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 800 });
      await gotoWithRack(page);
    });

    test("toolbar buttons show text labels", async ({ page }) => {
      const saveButton = page.getByRole("button", { name: /save/i });
      await expect(saveButton).toBeVisible();

      const buttonText = await saveButton.textContent();
      expect(buttonText).toContain("Save");
    });

    test("brand name visible", async ({ page }) => {
      const brandName = page.locator(".brand-name");
      await expect(brandName).toBeVisible();
      await expect(brandName).toHaveText("Rackula");
    });

    test("sidebar is visible", async ({ page }) => {
      const sidebar = page.locator("aside.sidebar");
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

    test("brand click does NOT open drawer in full mode", async ({ page }) => {
      const brand = page.locator(".toolbar-brand");
      await brand.click();

      const drawer = page.locator(".toolbar-drawer.open");
      await expect(drawer).not.toBeVisible();
    });

    test("hamburger icon is NOT visible in full mode", async ({ page }) => {
      const hamburgerIcon = page.locator(".hamburger-icon");
      await expect(hamburgerIcon).not.toBeVisible();
    });
  });

  test.describe("Medium viewport (900px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 800 });
      await gotoWithRack(page);
    });

    test("hamburger mode is active", async ({ page }) => {
      const hamburgerIcon = page.locator(".hamburger-icon");
      await expect(hamburgerIcon).toBeVisible();

      const toolbarCenter = page.locator(".toolbar-center");
      await expect(toolbarCenter).not.toBeVisible();
    });

    test("brand name is still visible", async ({ page }) => {
      const brandName = page.locator(".brand-name");
      await expect(brandName).toBeVisible();
    });

    test("sidebar is narrower", async ({ page }) => {
      const sidebar = page.locator("aside.sidebar");
      await expect(sidebar).toBeVisible();

      const box = await sidebar.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(210);
      expect(box?.width).toBeGreaterThanOrEqual(190);
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

    test("drawer menu opens on hamburger click", async ({ page }) => {
      await page.locator(".toolbar-brand").click();

      const drawer = page.locator(".toolbar-drawer");
      await expect(drawer).toBeVisible();

      await expect(page.locator('.drawer-item:has-text("Save")')).toBeVisible();
    });
  });

  test.describe("Small viewport (600px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 600, height: 800 });
      await gotoWithRack(page);
    });

    test("brand name is hidden, logo visible", async ({ page }) => {
      const brandName = page.locator(".brand-name");
      await expect(brandName).toBeHidden();

      const logo = page.locator(".toolbar-brand .logo-icon");
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

  test.describe("Phone viewport dialogs (375px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await gotoWithRack(page);

      // Dismiss mobile warning if present
      await page.evaluate(() => {
        sessionStorage.setItem("rackula-mobile-warning-dismissed", "true");
      });

      // Open the New Rack dialog
      const newRackTitle = page.locator(".dialog-title").filter({
        hasText: "New Rack",
      });
      if (!(await newRackTitle.first().isVisible())) {
        await page.locator(".toolbar-brand").click();
        const newRackDrawerItem = page.locator(
          '.drawer-item:has-text("New Rack")',
        );
        await expect(newRackDrawerItem).toBeVisible();
        await newRackDrawerItem.click();
      }
    });

    test("new rack dialog is fully visible and touch-friendly", async ({
      page,
    }) => {
      const dialog = page.locator('.dialog[role="dialog"]').first();
      await test.step("Dialog is visible and positioned correctly", async () => {
        await expect(page.locator(".dialog-title")).toHaveText("New Rack");
        await expect(dialog).toBeVisible();
        await expect
          .poll(async () => {
            const viewportHeight = await page.evaluate(
              () => window.innerHeight,
            );
            const box = await dialog.boundingBox();
            if (!box) {
              return Number.POSITIVE_INFINITY;
            }
            return box.y + box.height - (viewportHeight + 1);
          })
          .toBeLessThanOrEqual(0);

        const box = await dialog.boundingBox();
        expect(box).toBeTruthy();
        if (box) {
          const viewportHeight = await page.evaluate(() => window.innerHeight);
          expect(box.x).toBeGreaterThanOrEqual(-1);
          expect(box.width).toBeGreaterThanOrEqual(374);
          expect(box.y).toBeGreaterThanOrEqual(-1);
          expect(box.y + box.height).toBeLessThanOrEqual(viewportHeight + 1);
        }

        const style = await dialog.evaluate((element) => {
          const computed = window.getComputedStyle(element);
          return {
            position: computed.position,
            left: computed.left,
            right: computed.right,
            bottom: computed.bottom,
          };
        });

        expect(style.position).toBe("fixed");
        expect(style.left).toBe("0px");
        expect(style.right).toBe("0px");
        expect(style.bottom).toBe("0px");
      });

      await test.step("Action buttons are full-width and touch-friendly", async () => {
        const actions = dialog.locator(".form-actions");
        await expect(actions).toBeVisible();
        const actionButtons = actions.locator("button");
        const actionCount = await actionButtons.count();
        expect(actionCount).toBeGreaterThanOrEqual(2);

        const actionsBox = await actions.boundingBox();
        expect(actionsBox).toBeTruthy();
        if (actionsBox) {
          for (let i = 0; i < actionCount; i++) {
            const buttonBox = await actionButtons.nth(i).boundingBox();
            expect(buttonBox).toBeTruthy();
            if (buttonBox) {
              expect(buttonBox.width).toBeGreaterThanOrEqual(
                actionsBox.width * 0.95,
              );
            }
          }
        }

        const cancelButton = actions.getByRole("button", { name: "Cancel" });
        const cancelBox = await cancelButton.boundingBox();
        expect(cancelBox).toBeTruthy();
        if (cancelBox) {
          expect(cancelBox.height).toBeGreaterThanOrEqual(44);
        }
      });

      await test.step("Dialog content is scrollable", async () => {
        const overflowY = await dialog
          .locator(".dialog-content")
          .evaluate((element) => window.getComputedStyle(element).overflowY);
        expect(["auto", "scroll"]).toContain(overflowY);
      });

      await test.step("Dialog survives virtual keyboard resize", async () => {
        await page.setViewportSize({ width: 375, height: 420 });
        await expect(dialog).toBeVisible();
        await expect
          .poll(async () => {
            const compactViewportHeight = await page.evaluate(
              () => window.innerHeight,
            );
            const compactBox = await dialog.boundingBox();
            if (!compactBox) {
              return Number.POSITIVE_INFINITY;
            }
            return (
              compactBox.y + compactBox.height - (compactViewportHeight + 1)
            );
          })
          .toBeLessThanOrEqual(0);

        const compactBox = await dialog.boundingBox();
        expect(compactBox).toBeTruthy();
        if (compactBox) {
          const compactViewportHeight = await page.evaluate(
            () => window.innerHeight,
          );
          expect(compactBox.y).toBeGreaterThanOrEqual(-1);
          expect(compactBox.y + compactBox.height).toBeLessThanOrEqual(
            compactViewportHeight + 1,
          );
        }
      });
    });
  });

  test.describe("Panzoom at narrow viewport", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 800, height: 600 });
      await gotoWithRack(page);
    });

    test("canvas is visible and interactive", async ({ page }) => {
      const canvas = page.locator(".canvas");
      await expect(canvas).toBeVisible();
    });

    test("can pan the canvas", async ({ page }) => {
      const rack = page.locator(".rack-dual-view");
      await expect(rack).toBeVisible();

      const initialBox = await rack.boundingBox();
      expect(initialBox).toBeTruthy();

      const canvas = page.locator(".canvas");
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

      const panzoomContainer = page.locator(".panzoom-container");
      const transform = await panzoomContainer.getAttribute("style");
      expect(transform).toContain("matrix");
    });

    test("reset view button works", async ({ page }) => {
      // At 800px viewport, need to use hamburger menu
      await page.locator(".toolbar-brand").click();

      const resetButton = page.locator('.drawer-item:has-text("Reset View")');
      await resetButton.click();

      await expect(
        page.locator('.toolbar-drawer:not([aria-hidden="true"])'),
      ).not.toBeVisible();
    });
  });
});
