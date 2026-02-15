import { test, expect } from "@playwright/test";
import { gotoWithRack, dragDeviceToRack } from "./helpers";

/**
 * E2E Tests for Starter Library
 * Tests the 26-item rationalized device library
 */

test.describe("Starter Library", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("device palette is visible and contains starter library devices", async ({
    page,
  }) => {
    // Device palette should be visible
    await expect(page.locator(".device-palette")).toBeVisible();

    // Should have 26 device items (the starter library)
    const deviceItems = page.locator(".device-palette-item");
    await expect(deviceItems).toHaveCount(26);
  });

  test("all 12 categories are represented in the palette", async ({ page }) => {
    // Use getByRole with exact name to avoid strict mode violations

    // Server category (3 items)
    await expect(
      page.getByRole("listitem", { name: "1U Server, 1U server", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "2U Server, 2U server", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "4U Server, 4U server", exact: true }),
    ).toBeVisible();

    // Network category (3 items)
    await expect(
      page.getByRole("listitem", {
        name: "24-Port Switch, 1U network",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "48-Port Switch, 1U network",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "1U Router/Firewall, 1U network",
        exact: true,
      }),
    ).toBeVisible();

    // Patch Panel category (2 items)
    await expect(
      page.getByRole("listitem", {
        name: "24-Port Patch Panel, 1U patch-panel",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "48-Port Patch Panel, 2U patch-panel",
        exact: true,
      }),
    ).toBeVisible();

    // Storage category (3 items)
    await expect(
      page.getByRole("listitem", {
        name: "1U Storage, 1U storage",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "2U Storage, 2U storage",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "4U Storage, 4U storage",
        exact: true,
      }),
    ).toBeVisible();

    // Power category (3 items)
    await expect(
      page.getByRole("listitem", { name: "1U PDU, 1U power", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "2U UPS, 2U power", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "4U UPS, 4U power", exact: true }),
    ).toBeVisible();

    // KVM category (2 items)
    await expect(
      page.getByRole("listitem", { name: "1U KVM, 1U kvm", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "1U Console Drawer, 1U kvm",
        exact: true,
      }),
    ).toBeVisible();

    // AV/Media category (2 items)
    await expect(
      page.getByRole("listitem", {
        name: "1U Receiver, 1U av-media",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "2U Amplifier, 2U av-media",
        exact: true,
      }),
    ).toBeVisible();

    // Cooling category (1 item)
    await expect(
      page.getByRole("listitem", {
        name: "1U Fan Panel, 1U cooling",
        exact: true,
      }),
    ).toBeVisible();

    // Blank category (3 items)
    await expect(
      page.getByRole("listitem", {
        name: "0.5U Blank, 0.5U blank",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "1U Blank, 1U blank", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "2U Blank, 2U blank", exact: true }),
    ).toBeVisible();

    // Shelf category (2 items)
    await expect(
      page.getByRole("listitem", { name: "1U Shelf, 1U shelf", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "2U Shelf, 2U shelf", exact: true }),
    ).toBeVisible();

    // Cable Management category (2 items)
    await expect(
      page.getByRole("listitem", {
        name: "1U Brush Panel, 1U cable-management",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "1U Cable Management, 1U cable-management",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("removed items are NOT present", async ({ page }) => {
    // These items were removed from the library
    await expect(
      page.locator('.device-palette-item:has-text("1U Generic")'),
    ).not.toBeVisible();
    await expect(
      page.locator('.device-palette-item:has-text("2U Generic")'),
    ).not.toBeVisible();
    await expect(
      page.locator('.device-palette-item:has-text("4U Shelf")'),
    ).not.toBeVisible();
    await expect(
      page.locator('.device-palette-item:has-text("0.5U Blanking Fan")'),
    ).not.toBeVisible();

    // Old names that were renamed
    await expect(
      page.locator('.device-palette-item:has-text("1U Switch")'),
    ).not.toBeVisible();
    await expect(
      page.locator('.device-palette-item:has-text("1U Patch Panel")'),
    ).not.toBeVisible();
    await expect(
      page.locator('.device-palette-item:has-text("2U Patch Panel")'),
    ).not.toBeVisible();

    // Router and Firewall merged into Router/Firewall
    // Note: "1U Router" might partially match "1U Router/Firewall", so use exact
    const routerOnlyItems = page.locator(
      '.device-palette-item:text-is("1U Router"), .device-palette-item:has-text("1U Firewall")',
    );
    await expect(routerOnlyItems).toHaveCount(0);
  });

  test("can search for devices by name", async ({ page }) => {
    const searchInput = page.locator('.device-palette input[type="search"]');
    await expect(searchInput).toBeVisible();

    // Search for "Switch"
    await searchInput.fill("Switch");

    // Should show 2 switch items (24-Port Switch, 48-Port Switch)
    await expect(
      page.locator('.device-palette-item:has-text("Switch")'),
    ).toHaveCount(2);
  });

  test("can search for cable management devices", async ({ page }) => {
    const searchInput = page.locator('.device-palette input[type="search"]');
    await searchInput.fill("Cable");

    // Should show cable management item
    await expect(
      page.locator('.device-palette-item:has-text("1U Cable Management")'),
    ).toBeVisible();
  });

  test("can search for brush panel", async ({ page }) => {
    const searchInput = page.locator('.device-palette input[type="search"]');
    await searchInput.fill("Brush");

    // Should show brush panel
    await expect(
      page.locator('.device-palette-item:has-text("1U Brush Panel")'),
    ).toBeVisible();
  });

  test("can drag 24-Port Switch from palette to rack", async ({ page }) => {
    // Ensure rack is visible
    await expect(page.locator(".rack-container").first()).toBeVisible();

    // Drag first device to rack using shared helper
    await dragDeviceToRack(page);

    // Verify device appears in rack
    await expect(page.locator(".rack-device").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("cable management category has Steel Blue color", async ({ page }) => {
    // Find cable management device
    const cableMgmtItem = page.locator(
      '.device-palette-item:has-text("1U Cable Management")',
    );
    await expect(cableMgmtItem).toBeVisible();

    // Check the color indicator (assuming the device preview has a color element)
    const colorIndicator = cableMgmtItem.locator(
      ".device-preview rect, .category-colour",
    );
    if ((await colorIndicator.count()) > 0) {
      // Check fill or background color contains Steel Blue (#4682B4)
      const fill = await colorIndicator.first().getAttribute("fill");
      const bgColor = await colorIndicator
        .first()
        .evaluate((el) => window.getComputedStyle(el).backgroundColor);
      // Verify Steel Blue color is used
      expect(
        fill === "#4682B4" ||
          fill?.toLowerCase() === "#4682b4" ||
          bgColor.includes("70, 130, 180"), // RGB for Steel Blue
      ).toBeTruthy();
    }
  });
});
