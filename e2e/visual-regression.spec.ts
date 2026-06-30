import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "./helpers/base-test";
import {
  createTestLayout,
  loadFileFromDisk,
  locators,
  clickSettings,
} from "./helpers";
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
 * storage-mode work in M14/M15). The app menu snapshot covers the Open and
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
    await gotoVisual(page, "/");
    await expect(page).toHaveScreenshot("canvas-welcome.png", {
      mask: dynamicMasks(page),
    });
  });

  test("canvas - populated rack, dark theme", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL);
    await expect(page).toHaveScreenshot("canvas-populated-dark.png", {
      mask: dynamicMasks(page),
    });
  });

  test("canvas - populated rack, image + label display mode", async ({
    page,
  }) => {
    await gotoVisual(page, POPULATED_URL);
    // Display mode cycles label -> image -> image-label; two presses land on
    // image-label. It does not persist, so it must be toggled each run. The top
    // bar no longer carries the display-mode lens (#2072); the canonical toggle
    // is the "I" shortcut (it also lives in the Devices sidebar).
    await page.keyboard.press("i");
    await page.keyboard.press("i");
    await settle(page);
    await expect(page).toHaveScreenshot("canvas-image-label-mode.png", {
      mask: dynamicMasks(page),
    });
  });

  test("sidebar - devices tab", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL);
    await page.getByTestId("sidebar-tab-devices").click();
    await settle(page);
    await expect(page.getByTestId("drawer-left")).toHaveScreenshot(
      "sidebar-devices.png",
      { mask: dynamicMasks(page) },
    );
  });

  test("sidebar - racks tab", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL);
    await page.getByTestId("sidebar-tab-racks").click();
    await settle(page);
    await expect(page.getByTestId("drawer-left")).toHaveScreenshot(
      "sidebar-racks.png",
      { mask: dynamicMasks(page) },
    );
  });

  test("sidebar - layouts tab", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL);
    await page.getByTestId("sidebar-tab-layouts").click();
    await settle(page);
    await expect(page.getByTestId("drawer-left")).toHaveScreenshot(
      "sidebar-layouts.png",
      { mask: dynamicMasks(page) },
    );
  });

  test("dialog - export", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL);
    await page.getByRole("button", { name: "App menu" }).click();
    await page.getByTestId("app-menu-export").click();
    const dialog = page.locator(locators.dialog.root);
    await expect(dialog).toBeVisible();
    await settle(page);
    await expect(dialog).toHaveScreenshot("dialog-export.png", {
      mask: dynamicMasks(page),
    });
  });

  test("dialog - share", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL);
    await page.getByRole("button", { name: "App menu" }).click();
    await page.getByTestId("app-menu-share").click();
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
    await gotoVisual(page, POPULATED_URL);
    await page.getByRole("button", { name: "App menu" }).click();
    await page.getByTestId("app-menu-import-netbox").click();
    const dialog = page.locator(locators.dialog.root);
    await expect(dialog).toBeVisible();
    await settle(page);
    await expect(dialog).toHaveScreenshot("dialog-import-netbox.png", {
      mask: dynamicMasks(page),
    });
  });

  test("menu - app", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL);
    await page.getByRole("button", { name: "App menu" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await settle(page);
    await expect(menu).toHaveScreenshot("menu-app.png");
  });

  test("dialog - settings", async ({ page }) => {
    await gotoVisual(page, POPULATED_URL);
    // Settings moved into the app menu behind the logo (#2398); open it via the
    // shared helper so the selector stays centralized.
    await clickSettings(page);
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await expect(dialog).toBeVisible();
    await settle(page);
    await expect(dialog).toHaveScreenshot("dialog-settings.png");
  });
});

/**
 * Per-form-factor frame snapshots (issue #2735).
 *
 * Each form factor draws a distinct frame; only the chrome differs (the U-grid,
 * rails and labels are identical). One snapshot per form factor catches frame
 * drift. form_factor has no share-link or inspector path yet (the inspector
 * control lands in #2738), so each rack is loaded from a YAML fixture, which is
 * the format that carries form_factor today.
 */
const FRAME_FORM_FACTORS = [
  "2-post",
  "4-post",
  "4-post-cabinet",
  "wall-mount",
  "open-frame",
] as const;

function frameFixtureYaml(formFactor: string): string {
  return [
    'version: "0.7.0"',
    `name: "Frame ${formFactor}"`,
    "racks:",
    '  - id: "rack-1"',
    `    name: "Frame ${formFactor}"`,
    "    height: 12",
    "    width: 19",
    "    desc_units: false",
    "    show_rear: false",
    `    form_factor: "${formFactor}"`,
    "    starting_unit: 1",
    "    position: 0",
    "    devices: []",
    "device_types: []",
    "settings:",
    '  display_mode: "label"',
    "  show_labels_on_images: false",
    "",
  ].join("\n");
}

test.describe("form factor frames", () => {
  const baseUrl = `/?l=${createTestLayout({ rackHeight: 12 })}`;

  for (const formFactor of FRAME_FORM_FACTORS) {
    test(`frame - ${formFactor}`, async ({ page }) => {
      const dir = mkdtempSync(join(tmpdir(), "rackula-frame-"));
      const file = join(dir, `frame-${formFactor}.rackula.yaml`);
      writeFileSync(file, frameFixtureYaml(formFactor), "utf8");

      await gotoVisual(page, baseUrl);
      await loadFileFromDisk(page, file);
      // The loaded rack name confirms the fixture replaced the base rack.
      await expect(page.getByText(`Frame ${formFactor}`).first()).toBeVisible();
      await settle(page);

      // Snapshot the rack itself: the frame is the subject, and an element shot
      // keeps the chrome large and free of surrounding canvas drift.
      const rack = page.locator(locators.rack.container).first();
      await expect(rack).toHaveScreenshot(`frame-${formFactor}.png`);
    });
  }
});
