/**
 * Accessibility E2E coverage.
 *
 * These tests exercise real assistive-technology behaviour rather than DOM
 * structure: focusable controls are reached by role/name, focus trapping and
 * restoration are verified through the active element, and live regions are
 * found by their ARIA role. Touch-target sizing is measured against the WCAG
 * 2.5.5 minimum on a mobile viewport.
 *
 * @see docs/guides/ACCESSIBILITY.md
 * @see https://github.com/RackulaLives/Rackula/issues/1231
 */
import { test, expect } from "./helpers/base-test";
import type { Page } from "@playwright/test";
import {
  gotoWithRack,
  gotoMobileWithRack,
  clickNewRack,
  locators,
} from "./helpers";

/** WCAG 2.5.5 Target Size (Level AAA) / 2.5.8 (Level AA) minimum. */
const MIN_TOUCH_TARGET_PX = 44;

/**
 * Resolve the accessible role and name of the currently focused element.
 * Runs in the browser so it reflects what an assistive technology would expose.
 */
async function activeElementInfo(page: Page): Promise<{
  role: string | null;
  name: string | null;
  tag: string;
  testid: string | null;
}> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { role: null, name: null, tag: "", testid: null };
    // Prefer the explicit accessible name. Fall back to own text only for leaf
    // elements so a focused container does not report its whole subtree's text.
    const ownText = el.children.length === 0 ? el.textContent?.trim() : "";
    const name =
      el.getAttribute("aria-label") ||
      (ownText && ownText.length > 0 ? ownText : null) ||
      el.getAttribute("title") ||
      null;
    return {
      role: el.getAttribute("role"),
      name,
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute("data-testid"),
    };
  });
}

test.describe("Accessibility", () => {
  test.describe("Keyboard navigation", () => {
    test.beforeEach(async ({ page }) => {
      await gotoWithRack(page);
    });

    test("Tab reaches the major interactive regions by role and name", async ({
      page,
      browserName,
    }) => {
      // WebKit does not move keyboard focus through buttons via Tab by default
      // (macOS "Full Keyboard Access" is off), so a Tab sweep over button
      // controls is not meaningful there. Chromium exercises the full path.
      test.skip(
        browserName === "webkit",
        "WebKit skips buttons in Tab order by default (macOS keyboard setting)",
      );

      // Start from a known anchor: the logo, which is also the app-menu
      // trigger, leads the toolbar. Anchor on the button itself by testid.
      const appMenu = page.getByTestId("btn-app-menu");
      await expect(appMenu).toHaveAttribute("aria-label", "App menu");
      await appMenu.focus();
      await expect(appMenu).toBeFocused();

      // Walk forward with Tab and record what each stop is. A keyboard user
      // must be able to reach controls without the focus ring vanishing into a
      // non-interactive void, and the far end of the top-bar chrome must be on
      // the path. The top bar is the workspace frame only (#2072): file commands
      // and Settings live in the app menu (#2398, #2072) and the view/history
      // controls relocate to the canvas (#2074), so the storage status chip in
      // the right region is the workspace-chrome anchor at the end of the sweep.
      let sawInteractiveControl = false;
      let reachedStorageChip = false;

      for (let i = 0; i < 25; i++) {
        await page.keyboard.press("Tab");
        const info = await activeElementInfo(page);

        // Focus must always land on something focusable, never <body>.
        expect(info.tag).not.toBe("body");

        if (info.testid === "storage-status-chip") reachedStorageChip = true;

        // Native controls and ARIA widgets are the keyboard-operable surface.
        const interactiveTags = ["button", "input", "a", "select", "textarea"];
        if (
          interactiveTags.includes(info.tag) ||
          info.role === "button" ||
          info.role === "tab" ||
          info.role === "option"
        ) {
          sawInteractiveControl = true;
        }

        if (reachedStorageChip) break;
      }

      expect(sawInteractiveControl).toBe(true);
      // The storage chip must be reachable in a single forward sweep.
      expect(reachedStorageChip).toBe(true);
    });

    test("canvas exposes an application region with a descriptive name", async ({
      page,
    }) => {
      // The canvas advertises role="application" so screen-reader users know it
      // is an interactive drawing surface, and carries a non-empty accessible
      // name describing the rack contents. We assert the role and a meaningful
      // name rather than exact text, since the description is content-derived.
      const canvas = page.getByRole("application");
      await expect(canvas).toBeVisible();

      const name = await canvas.getAttribute("aria-label");
      expect(name?.trim()).toBeTruthy();
    });
  });

  test.describe("Dialog focus management", () => {
    test.beforeEach(async ({ page }) => {
      await gotoWithRack(page);
    });

    test("dialog traps Tab focus within its content", async ({
      page,
      browserName,
    }) => {
      // Tab-based focus traversal relies on the browser visiting buttons in Tab
      // order, which WebKit disables by default. The trap itself is enforced by
      // bits-ui in JS; Chromium verifies it cycles correctly.
      test.skip(
        browserName === "webkit",
        "WebKit skips buttons in Tab order by default (macOS keyboard setting)",
      );

      await clickNewRack(page);

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      // Tab repeatedly; focus must stay inside the dialog on every stop.
      // A trapped dialog cycles through its own controls and never lets focus
      // escape to the page behind the modal.
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press("Tab");
        const focusInDialog = await dialog.evaluate((node) =>
          node.contains(document.activeElement),
        );
        expect(focusInDialog).toBe(true);
      }

      // Shift+Tab (reverse cycle) must also stay trapped.
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press("Shift+Tab");
        const focusInDialog = await dialog.evaluate((node) =>
          node.contains(document.activeElement),
        );
        expect(focusInDialog).toBe(true);
      }
    });

    test("closing a dialog restores focus to its trigger", async ({
      page,
      browserName,
    }) => {
      // WebKit does not give buttons DOM focus on activation by default, so
      // there is no trigger focus to restore. The restoration itself is bits-ui
      // behaviour; Chromium verifies it end to end for a keyboard user.
      test.skip(
        browserName === "webkit",
        "WebKit does not focus buttons on activation by default (macOS keyboard setting)",
      );

      // Switch to the Racks tab and open the wizard from the New Rack button
      // via keyboard, so the trigger genuinely holds focus before the dialog
      // opens, the way a keyboard user would experience it.
      await page.getByTestId("sidebar-tab-racks").click();
      const trigger = page.getByTestId("btn-new-rack");
      await trigger.focus();
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Enter");

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();

      // Focus must return to the control that opened the dialog so keyboard
      // users are not dumped back at the top of the document.
      await expect(trigger).toBeFocused();
    });
  });

  test.describe("Mobile bottom sheet focus management", () => {
    test.beforeEach(async ({ page, browserName }) => {
      // Tab-based focus traversal relies on the browser visiting buttons in Tab
      // order. WebKit skips buttons by default (macOS "Full Keyboard Access").
      test.skip(
        browserName === "webkit",
        "WebKit skips buttons in Tab order by default (macOS keyboard setting)",
      );
      await gotoMobileWithRack(page);
    });

    test("mobile sheet traps Tab focus while open", async ({ page }) => {
      // Open the Devices sheet via the bottom nav.
      const devicesTab = page.getByRole("button", { name: "Devices" });
      await devicesTab.focus();
      await devicesTab.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      // Tab repeatedly; focus must stay inside the sheet on every stop.
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press("Tab");
        const focusInDialog = await dialog.evaluate((node) =>
          node.contains(document.activeElement),
        );
        expect(focusInDialog).toBe(true);
      }
    });

    test("closing a mobile sheet via Escape restores focus to the nav tab", async ({
      page,
    }) => {
      // Open the View sheet via the bottom nav.
      const viewTab = page.getByRole("button", { name: "View" });
      await viewTab.focus();
      await viewTab.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();

      // Focus must return to the View tab button that opened the sheet.
      await expect(viewTab).toBeFocused();
    });

    test("Escape cancels active placement and hides the Placing banner", async ({
      page,
    }) => {
      // Arm a device for placement via the Devices sheet.
      const devicesTab = page.getByRole("button", { name: "Devices" });
      await devicesTab.focus();
      await devicesTab.click();
      await expect(
        page.locator(locators.device.paletteItem).first(),
      ).toBeVisible();
      await page.locator(locators.device.paletteItem).first().click();

      // Confirm the Placing banner is visible.
      const banner = page
        .getByRole("status")
        .filter({ hasText: /placing:/i })
        .first();
      await expect(banner).toBeVisible();

      // Pressing Escape must cancel placement and hide the banner.
      await page.keyboard.press("Escape");
      await expect(banner).not.toBeVisible();
    });
  });

  test.describe("Live regions", () => {
    test("a status live region announces tap-to-place on mobile", async ({
      page,
    }) => {
      // Mobile uses tap-to-place: selecting a palette device arms placement and
      // surfaces a role="status" / aria-live banner so the pending device is
      // announced. Desktop has the same banner, so this stays mobile-scoped for
      // the arming flow it exercises.
      await gotoMobileWithRack(page);

      // Open the device library and arm a device for placement.
      await page.getByRole("button", { name: "Devices" }).click();
      await expect(
        page.locator(locators.device.paletteItem).first(),
      ).toBeVisible();
      await page.locator(locators.device.paletteItem).first().click();

      // The placement banner is a polite status region naming the pending
      // device. getByRole finds the live region regardless of markup.
      const status = page
        .getByRole("status")
        .filter({ hasText: /placing:/i })
        .first();
      await expect(status).toBeVisible();
    });

    test("placement cancellation is announced to screen readers", async ({
      page,
    }) => {
      await gotoMobileWithRack(page);

      // Arm a device for placement.
      await page.getByRole("button", { name: "Devices" }).click();
      await expect(
        page.locator(locators.device.paletteItem).first(),
      ).toBeVisible();
      await page.locator(locators.device.paletteItem).first().click();

      // The Placing banner must be visible before cancel.
      const banner = page
        .getByRole("status")
        .filter({ hasText: /placing:/i })
        .first();
      await expect(banner).toBeVisible();

      // Cancel via the Cancel button in the banner.
      await page.getByRole("button", { name: /cancel placement/i }).click();

      // The assertive announcer must carry the cancellation message.
      const announcer = page.getByTestId("placement-sr-announcer");
      await expect(announcer).toContainText(/cancelled/i);
    });
  });

  test.describe("Touch targets", () => {
    test("mobile bottom navigation meets the minimum touch-target size", async ({
      page,
    }) => {
      await gotoMobileWithRack(page);

      const nav = page.getByRole("navigation", { name: /mobile navigation/i });
      await expect(nav).toBeVisible();

      // Every actionable button in the bottom nav must be large enough to tap
      // reliably, per WCAG 2.5.5. Measuring each one catches a single
      // undersized control rather than an aggregate average.
      const buttons = nav.getByRole("button");
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        await expect(button).toBeVisible();
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
          expect(box.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
        }
      }
    });
  });
});
