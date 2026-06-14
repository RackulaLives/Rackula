/**
 * axe-core accessibility scans (issue #2099).
 *
 * A guard rail for the UX overhaul (epic #2017): each test renders a key surface
 * and runs axe-core against it, failing CI on any WCAG 2.2 AA violation. The
 * design spec treats accessibility as part of the design, not a retrofit, and
 * the shell rework touches keyboard navigation extensively, so these scans catch
 * regressions that manual review would miss.
 *
 * Scope: the surfaces that exist today (populated canvas with a selection, the
 * sidebar's Devices and Racks tabs, and the Export and Share dialogs). As the
 * M14 shell lands new surfaces (side panel, layout tabs), add a scan per the
 * pattern in docs/guides/TESTING.md.
 *
 * Behavioural a11y (keyboard paths, focus trapping, landmark naming) lives in
 * accessibility.spec.ts; this file covers the static, machine-detectable issues
 * axe can see across a whole surface.
 *
 * @see docs/guides/TESTING.md
 * @see docs/guides/ACCESSIBILITY.md
 * @see https://github.com/RackulaLives/Rackula/issues/2099
 */
import { test } from "./helpers/base-test";
import { expect } from "@playwright/test";
import {
  createTestLayout,
  gotoWithRack,
  selectDevice,
  clickExport,
  locators,
} from "./helpers";
import { expectNoA11yViolations } from "./helpers/a11y";

// A small, deterministic rack so the canvas and sidebar render real content for
// the scan. Category codes are the single-char share abbreviations:
// n=network, s=server, w=power.
const POPULATED_RACK = createTestLayout({
  name: "A11y Test Layout",
  rackName: "Rack A",
  rackHeight: 12,
  devices: [
    { type: "a11y-switch", position: 1, face: "front", name: "Switch" },
    { type: "a11y-server", position: 3, face: "front", name: "Server" },
    { type: "a11y-pdu", position: 10, face: "rear", name: "PDU" },
  ],
  customTypes: [
    { slug: "a11y-switch", height: 1, colour: "#4A90A4", category: "n" },
    { slug: "a11y-server", height: 2, colour: "#7B6FA3", category: "s" },
    { slug: "a11y-pdu", height: 2, colour: "#A4705A", category: "w" },
  ],
});

test.describe("axe accessibility scans", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page, POPULATED_RACK);
  });

  test("canvas with a selected device has no WCAG 2.2 AA violations", async ({
    page,
  }) => {
    // Selecting a device surfaces its properties in the side panel's Edit tab
    // and applies the selected state, so the scan covers the canvas, the device
    // chrome, and the panel at once: the states a user is most often in.
    await selectDevice(page, 0);
    await expectNoA11yViolations(page);
  });

  test("side panel View tab has no WCAG 2.2 AA violations", async ({
    page,
  }) => {
    // With nothing selected the Edit tab shows its empty state; switching to
    // View exercises the tablist roles, the active tabpanel, and the panel's
    // landmark labelling.
    await page.getByTestId("side-panel-tab-view").click();
    await expect(page.getByTestId("side-panel-panel-view")).toBeVisible();
    await expectNoA11yViolations(page, locators.sidePanel.root);
  });

  test("collapsed side panel rail has no WCAG 2.2 AA violations", async ({
    page,
  }) => {
    // The slim rail is the collapsed state; its only control is the expand
    // toggle, which must remain a labelled, reachable button.
    await page.getByTestId("side-panel-collapse").click();
    await expect(page.getByTestId("side-panel-expand")).toBeVisible();
    await expectNoA11yViolations(page, locators.sidePanel.root);
  });

  test("sidebar Devices tab has no WCAG 2.2 AA violations", async ({
    page,
  }) => {
    await page.getByTestId("sidebar-tab-devices").click();
    await expect(page.getByTestId("drawer-left")).toBeVisible();
    await expectNoA11yViolations(page, locators.sidebar.pane);
  });

  test("sidebar Racks tab has no WCAG 2.2 AA violations", async ({ page }) => {
    await page.getByTestId("sidebar-tab-racks").click();
    await expect(page.getByTestId("drawer-left")).toBeVisible();
    await expectNoA11yViolations(page, locators.sidebar.pane);
  });

  test("sidebar Layouts tab has no WCAG 2.2 AA violations", async ({
    page,
  }) => {
    await page.getByTestId("sidebar-tab-layouts").click();
    await expect(page.getByTestId("drawer-left")).toBeVisible();
    await expectNoA11yViolations(page, locators.sidebar.pane);
  });

  test("Export dialog has no WCAG 2.2 AA violations", async ({ page }) => {
    await clickExport(page);
    await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible();
    await expectNoA11yViolations(page, locators.dialog.root);
  });

  test("Share dialog has no WCAG 2.2 AA violations", async ({ page }) => {
    // Share lives in the app menu behind the logo (#2072).
    await page.getByRole("button", { name: "App menu" }).click();
    await page.getByTestId("app-menu-share").click();
    // Assert by accessible name so the scan runs against the Share dialog, not
    // whatever dialog happens to match the generic selector.
    await expect(
      page.getByRole("dialog", { name: "Share Layout" }),
    ).toBeVisible();
    await expectNoA11yViolations(page, locators.dialog.root);
  });

  test("Settings dialog has no WCAG 2.2 AA violations", async ({ page }) => {
    // The gear button opens the consolidated settings surface (Appearance,
    // Behaviour, Data). Target it by testid so the scan covers the dialog's
    // toggles and action buttons.
    await page.getByTestId("btn-settings").click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await expectNoA11yViolations(page, locators.dialog.root);
  });
});
