import { test, expect } from "@playwright/test";

test.describe("Responsive Layout", () => {
  test.describe("Desktop viewport (1200px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.goto("/");
    });

    test("toolbar buttons show text labels", async ({ page }) => {
      // At desktop size, buttons should show text
      const saveButton = page.getByRole("button", { name: /save/i });
      await expect(saveButton).toBeVisible();

      // Button should contain visible text "Save"
      const buttonText = await saveButton.textContent();
      expect(buttonText).toContain("Save");
    });

    test("brand name visible", async ({ page }) => {
      const brandName = page.locator(".brand-name");
      await expect(brandName).toBeVisible();
      await expect(brandName).toHaveText("Rackula");
      // Note: Tagline was removed from toolbar in v0.4.5 (moved to Help panel)
    });

    test("sidebar is visible", async ({ page }) => {
      const sidebar = page.locator("aside.sidebar");
      await expect(sidebar).toBeVisible();
    });

    test("no horizontal scroll", async ({ page }) => {
      // Check that document doesn't have horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
        );
      });
      expect(hasHorizontalScroll).toBe(false);
    });

    test("brand click does NOT open drawer in full mode", async ({ page }) => {
      // At 1200px (>= 1024px), clicking brand should NOT open drawer
      // In full mode, brand is a div, not a button
      const brand = page.locator(".toolbar-brand");
      await brand.click();
      await page.waitForTimeout(200);

      // Drawer should NOT have the .open class
      const drawer = page.locator(".toolbar-drawer.open");
      await expect(drawer).not.toBeVisible();
    });

    test("hamburger icon is NOT visible in full mode", async ({ page }) => {
      // At 1200px, hamburger icon should be hidden
      const hamburgerIcon = page.locator(".hamburger-icon");
      await expect(hamburgerIcon).not.toBeVisible();
    });
  });

  test.describe("Medium viewport (900px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 800 });
      await page.goto("/");
    });

    test("hamburger mode is active", async ({ page }) => {
      // At 900px (< 1024px breakpoint), toolbar is in hamburger mode
      // The hamburger icon should be visible
      const hamburgerIcon = page.locator(".hamburger-icon");
      await expect(hamburgerIcon).toBeVisible();

      // The toolbar-center (action buttons) should be hidden
      const toolbarCenter = page.locator(".toolbar-center");
      await expect(toolbarCenter).not.toBeVisible();
    });
    // Note: Tagline test removed - tagline was removed from toolbar in v0.4.5

    test("brand name is still visible", async ({ page }) => {
      const brandName = page.locator(".brand-name");
      await expect(brandName).toBeVisible();
    });

    test("sidebar is narrower", async ({ page }) => {
      const sidebar = page.locator("aside.sidebar");
      await expect(sidebar).toBeVisible();

      // Sidebar should be 200px at this breakpoint
      const box = await sidebar.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(210); // Allow some tolerance
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
      // Click the toolbar brand to open the drawer
      await page.locator(".toolbar-brand").click();
      await page.waitForTimeout(200);

      // Drawer should be visible with menu items
      const drawer = page.locator(".toolbar-drawer");
      await expect(drawer).toBeVisible();

      // Should contain action items
      await expect(page.locator('.drawer-item:has-text("Save")')).toBeVisible();
    });
  });

  test.describe("Small viewport (600px)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 600, height: 800 });
      await page.goto("/");
    });

    test("brand name is hidden, logo visible", async ({ page }) => {
      // At 600px, brand name should be hidden
      const brandName = page.locator(".brand-name");
      await expect(brandName).toBeHidden();

      // Logo (SVG) should still be visible - use specific class
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
      await page.goto("/");
      await page.evaluate(() => {
        sessionStorage.setItem("rackula-mobile-warning-dismissed", "true");
        localStorage.setItem("Rackula_has_started", "true");
      });
      await page.reload();
      await page.waitForSelector(".toolbar-brand");

      // Explicitly open the New Rack dialog to avoid relying on auto-open behavior.
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
            const viewportHeight = await page.evaluate(() => window.innerHeight);
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
            return compactBox.y + compactBox.height - (compactViewportHeight + 1);
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
      await page.goto("/");
      // Clear storage and set started flag
      await page.evaluate(() => {
        sessionStorage.clear();
        localStorage.clear();
        localStorage.setItem("Rackula_has_started", "true");
      });
      await page.reload();
      await page.waitForTimeout(500);

      // At 800px viewport, toolbar is in hamburger mode
      // Open hamburger menu by clicking on toolbar brand
      await page.locator(".toolbar-brand").click();
      await page.waitForTimeout(200);

      // Click New Rack in the drawer
      await page.locator('.drawer-item:has-text("New Rack")').click();

      // Wait for dialog and click Create
      await page.locator('button:has-text("Replace")').click();
      const createBtn = page.locator('button:has-text("Create")');
      await createBtn.click();

      // Wait for rack to be visible
      await page.waitForSelector(".rack-dual-view", { timeout: 5000 });
    });

    test("canvas is visible and interactive", async ({ page }) => {
      const canvas = page.locator(".canvas");
      await expect(canvas).toBeVisible();
    });

    test("can pan the canvas", async ({ page }) => {
      // Get the rack element position before panning
      const rack = page.locator(".rack-dual-view");
      await expect(rack).toBeVisible();

      const initialBox = await rack.boundingBox();
      expect(initialBox).toBeTruthy();

      // Perform a drag to pan
      const canvas = page.locator(".canvas");
      await canvas.hover();

      // Mouse drag to pan
      const canvasBox = await canvas.boundingBox();
      if (canvasBox) {
        const startX = canvasBox.x + canvasBox.width / 2;
        const startY = canvasBox.y + canvasBox.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 50, startY + 50, { steps: 5 });
        await page.mouse.up();
      }

      // Verify panzoom container has moved (transform applied)
      const panzoomContainer = page.locator(".panzoom-container");
      const transform = await panzoomContainer.getAttribute("style");
      expect(transform).toContain("matrix");
    });

    test("reset view button works", async ({ page }) => {
      // Rack should already be created from beforeEach
      // At 800px viewport, need to use hamburger menu
      await page.locator(".toolbar-brand").click();
      await page.waitForTimeout(200);

      // Click Reset View in the drawer
      const resetButton = page.locator('.drawer-item:has-text("Reset View")');
      await resetButton.click();

      // Verify drawer closed (button click worked)
      await expect(
        page.locator('.toolbar-drawer:not([aria-hidden="true"])'),
      ).not.toBeVisible();
    });
  });
});
