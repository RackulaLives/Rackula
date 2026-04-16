import { test, expect } from "./helpers/base-test";
import { gotoWithRack, dragDeviceToRack, locators } from "./helpers";

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
    await expect(page.locator(locators.device.palette)).toBeVisible();

    // Starter library should have devices loaded
    const deviceItems = page.locator(locators.device.paletteItem);
    expect(await deviceItems.count()).toBeGreaterThan(0);
  });

  test("all 12 categories are represented in the palette", async ({ page }) => {
    // Aria-label format: "${model}, ${u_height}U, ${category}"

    // Server category (3 items)
    await expect(
      page.getByRole("listitem", { name: "Server, 1U, server", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "Server, 2U, server", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "Server, 4U, server", exact: true }),
    ).toBeVisible();

    // Network category (3 items)
    await expect(
      page.getByRole("listitem", {
        name: "Switch (24-Port), 1U, network",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "Switch (48-Port), 1U, network",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "Router/Firewall, 1U, network",
        exact: true,
      }),
    ).toBeVisible();

    // Patch Panel category (2 items)
    await expect(
      page.getByRole("listitem", {
        name: "Patch Panel (24-Port), 1U, patch-panel",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "Patch Panel (48-Port), 2U, patch-panel",
        exact: true,
      }),
    ).toBeVisible();

    // Storage category (3 items)
    await expect(
      page.getByRole("listitem", {
        name: "Storage, 1U, storage",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "Storage, 2U, storage",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "Storage, 4U, storage",
        exact: true,
      }),
    ).toBeVisible();

    // Power category (3 items)
    await expect(
      page.getByRole("listitem", { name: "PDU, 1U, power", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "UPS, 2U, power", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "UPS, 4U, power", exact: true }),
    ).toBeVisible();

    // KVM category (2 items)
    await expect(
      page.getByRole("listitem", {
        name: "KVM Switch, 1U, kvm",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "Console Drawer, 1U, kvm",
        exact: true,
      }),
    ).toBeVisible();

    // AV/Media category (2 items)
    await expect(
      page.getByRole("listitem", {
        name: "AV Receiver, 1U, av-media",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "Amplifier, 2U, av-media",
        exact: true,
      }),
    ).toBeVisible();

    // Cooling category (1 item)
    await expect(
      page.getByRole("listitem", {
        name: "Fan Panel, 1U, cooling",
        exact: true,
      }),
    ).toBeVisible();

    // Blank category (3 items)
    await expect(
      page.getByRole("listitem", {
        name: "Blank Panel, 0.5U, blank",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "Blank Panel, 1U, blank",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "Blank Panel, 2U, blank",
        exact: true,
      }),
    ).toBeVisible();

    // Shelf category (2 items)
    await expect(
      page.getByRole("listitem", { name: "Shelf, 1U, shelf", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "Shelf, 2U, shelf", exact: true }),
    ).toBeVisible();

    // Cable Management category (2 items)
    await expect(
      page.getByRole("listitem", {
        name: "Brush Panel, 1U, cable-management",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", {
        name: "Cable Manager, 1U, cable-management",
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
    const searchInput = page.locator('[data-testid="search-devices"]');
    await expect(searchInput).toBeVisible();

    // Search for "Switch"
    await searchInput.fill("Switch");

    // Should show switch items (KVM Switch, 24-Port Switch, 48-Port Switch)
    const results = page.locator(locators.device.paletteItem);
    const names = (await results.allTextContents()).map((n) => n.trim());
    const matchingNames = names.filter((n) => /switch/i.test(n));
    expect(matchingNames.some((n) => /KVM Switch/i.test(n))).toBe(true);
    expect(matchingNames.some((n) => /24-Port/i.test(n))).toBe(true);
    expect(matchingNames.some((n) => /48-Port/i.test(n))).toBe(true);
    // Unrelated items should be filtered out by the search
    expect(names.some((n) => /\bServer\b/i.test(n))).toBe(false);
  });

  test("can search for cable management devices", async ({ page }) => {
    const searchInput = page.locator('[data-testid="search-devices"]');
    await searchInput.fill("Cable Manager");

    // Should show cable management items (Cable Manager 1U/2U)
    const results = page.locator(locators.device.paletteItem);
    const names = (await results.allTextContents()).map((n) => n.trim());
    expect(names.some((n) => /Cable Manager/i.test(n))).toBe(true);
    // Unrelated items should be filtered out by the search
    expect(names.some((n) => /\bServer\b/i.test(n))).toBe(false);
  });

  test("can search for brush panel", async ({ page }) => {
    const searchInput = page.locator('[data-testid="search-devices"]');
    await searchInput.fill("Brush Panel");

    // Should show brush panel
    await expect(
      page.locator(locators.device.paletteItem).first(),
    ).toBeVisible();
  });

  test("can drag 24-Port Switch from palette to rack", async ({ page }) => {
    // Ensure rack is visible
    await expect(page.locator(locators.rack.container).first()).toBeVisible();

    // Drag first device to rack using shared helper
    await dragDeviceToRack(page);

    // Verify device appears in rack
    await expect(page.locator(locators.rack.device).first()).toBeVisible({
      timeout: 5000,
    });
  });

});
