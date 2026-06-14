import { test, expect } from "./helpers/base-test";
import { createTestLayout, locators } from "./helpers";
import { dynamicMasks, gotoVisual, settle } from "./helpers/visual";

/**
 * Visual regression tripwire (issue #2098).
 *
 * A small, stable set of screenshot snapshots of key UI states, diffed in CI to
 * catch unintended visual drift while the shell is rebuilt in slices (epic
 * #2017). This is deliberately NOT pixel-perfect coverage: keep the set small.
 *
 * Baselines are committed for Linux only (the CI runner). Regenerate them with
 * the "Update Visual Snapshots" workflow; never commit baselines generated on
 * macOS or Windows. See docs/guides/TESTING.md.
 *
 * Deliberately out of scope (would couple the tripwire to features still in
 * flux): the standalone Load and Layouts dialogs (their triggers depend on the
 * storage-mode work in M14/M15). The File menu snapshot covers the Load and
 * Import entry-point chrome in the meantime.
 */

// A deterministic rack: fixed devices, colours and positions, and a compact
// height so the dual (front + rear) view frames cleanly in the fixed viewport.
// Category codes are the single-char share abbreviations: n=network, s=server,
// w=power.
const POPULATED_RACK = createTestLayout({
  name: "Visual Test Layout",
  rackName: "Rack A",
  rackHeight: 12,
  devices: [
    { type: "vis-switch", position: 1, face: "front", name: "Switch" },
    { type: "vis-server", position: 3, face: "front", name: "Server" },
    { type: "vis-pdu", position: 10, face: "rear", name: "PDU" },
  ],
  customTypes: [
    { slug: "vis-switch", height: 1, colour: "#4A90A4", category: "n" },
    { slug: "vis-server", height: 2, colour: "#7B6FA3", category: "s" },
    { slug: "vis-pdu", height: 2, colour: "#A4705A", category: "w" },
  ],
});
const POPULATED_URL = `/?l=${POPULATED_RACK}`;

test.describe("visual regression", () => {
  test("canvas - welcome (empty state)", async ({ page }) => {
    await gotoVisual(page, "/", { theme: "dark" });
    await expect(page).toHaveScreenshot("canvas-welcome.png", {
      mask: dynamicMasks(page),
    });
  });

  test("canvas - populated rack, dark theme", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL, { theme: "dark" });
    await expect(page).toHaveScreenshot("canvas-populated-dark.png", {
      mask: dynamicMasks(page),
    });
  });

  test("canvas - populated rack, light theme", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL, { theme: "light" });
    await expect(page).toHaveScreenshot("canvas-populated-light.png", {
      mask: dynamicMasks(page),
    });
  });

  test("canvas - populated rack, image + label display mode", async ({
    page,
  }) => {
    await gotoVisual(page, POPULATED_URL, { theme: "light" });
    // Display mode cycles label -> image -> image-label; two clicks lands on
    // image-label. It does not persist, so it must be toggled via the toolbar.
    const displayBtn = page.getByTestId("btn-display-mode");
    await displayBtn.click();
    await displayBtn.click();
    await settle(page);
    await expect(page).toHaveScreenshot("canvas-image-label-mode.png", {
      mask: dynamicMasks(page),
    });
  });

  test("sidebar - devices tab", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL, { theme: "light" });
    await page.getByTestId("sidebar-tab-devices").click();
    await settle(page);
    await expect(page.getByTestId("drawer-left")).toHaveScreenshot(
      "sidebar-devices.png",
      { mask: dynamicMasks(page) },
    );
  });

  test("sidebar - racks tab", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL, { theme: "light" });
    await page.getByTestId("sidebar-tab-racks").click();
    await settle(page);
    await expect(page.getByTestId("drawer-left")).toHaveScreenshot(
      "sidebar-racks.png",
      { mask: dynamicMasks(page) },
    );
  });

  test("dialog - export", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL, { theme: "light" });
    await page.getByTestId("btn-export").click();
    const dialog = page.locator(locators.dialog.root);
    await expect(dialog).toBeVisible();
    await settle(page);
    await expect(dialog).toHaveScreenshot("dialog-export.png", {
      mask: dynamicMasks(page),
    });
  });

  test("dialog - share", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL, { theme: "light" });
    await page.getByTestId("btn-share").click();
    const dialog = page.locator(locators.dialog.root);
    await expect(dialog).toBeVisible();
    await settle(page);
    // The share URL and its QR code encode the layout and app version, so both
    // change between builds: mask them.
    await expect(dialog).toHaveScreenshot("dialog-share.png", {
      mask: [
        ...dynamicMasks(page),
        page.getByTestId("share-url-input"),
        page.getByTestId("qr-container"),
      ],
    });
  });

  test("dialog - import from NetBox", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL, { theme: "light" });
    await page.getByRole("button", { name: "File menu" }).click();
    await page.getByRole("menuitem", { name: "Import from NetBox" }).click();
    const dialog = page.locator(locators.dialog.root);
    await expect(dialog).toBeVisible();
    await settle(page);
    await expect(dialog).toHaveScreenshot("dialog-import-netbox.png", {
      mask: dynamicMasks(page),
    });
  });

  test("menu - file", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL, { theme: "light" });
    await page.getByRole("button", { name: "File menu" }).click();
    const menu = page.locator(".menu-content");
    await expect(menu).toBeVisible();
    await settle(page);
    await expect(menu).toHaveScreenshot("menu-file.png");
  });

  test("menu - settings", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL, { theme: "light" });
    await page.getByRole("button", { name: "Settings menu" }).click();
    const menu = page.locator(".menu-content");
    await expect(menu).toBeVisible();
    await settle(page);
    await expect(menu).toHaveScreenshot("menu-settings.png");
  });
});
