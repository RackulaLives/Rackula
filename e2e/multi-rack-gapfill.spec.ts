/**
 * Multi-rack gap-fill (#2858, replaces #1230).
 *
 * Covers the multi-rack behaviours the existing suites do not:
 *  - duplicate a rack: its devices are copied and the copies are independent
 *  - delete a rack: the confirm flow runs, the canvas updates, and a remaining
 *    rack stays intact
 *  - cross-bay placement: a bayed group's devices land in their intended bays
 *  - export composite: an SVG export of a multi-rack layout carries every rack
 *
 * multi-rack.spec.ts already covers create/coexist/limit and rack-controls.spec.ts
 * covers the bay verbs and bay-group formation/extension, so this file does not
 * repeat them.
 *
 * Racks and devices are targeted by accessible name / visible text, never by
 * positional palette index, and there are no fixed timeouts (Playwright's
 * web-first assertions auto-wait).
 */
import { test, expect } from "./helpers/base-test";
import type { Locator, Page } from "@playwright/test";
import {
  gotoWithRack,
  createTestLayout,
  deleteSelectedDevice,
  clickExport,
  MULTI_RACK_SHARE,
  BAYED_RACK_SHARE,
  locators,
} from "./helpers";

/** The floating verb bar shown for a rack (or device) selection. */
function rackActions(page: Page): Locator {
  return page.getByRole("toolbar", { name: "Rack actions" });
}

/** The dual-view wrapper for a standalone rack addressed by its exact name. */
function dualViewByName(page: Page, name: string): Locator {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.locator(locators.rackView.dualView).filter({
    has: page.locator(locators.rackView.dualViewName, {
      hasText: new RegExp(`^${escaped}$`),
    }),
  });
}

/** Front-view devices inside a named standalone rack. */
function frontDevicesIn(page: Page, rackName: string): Locator {
  return dualViewByName(page, rackName).locator(locators.rackView.frontDevice);
}

/**
 * Select a standalone rack by clicking its front face and wait for its verb bar.
 * The click lands on the empty middle of the rack (devices here sit at the top),
 * so it selects the rack rather than a device.
 */
async function selectRack(page: Page, name: string): Promise<void> {
  await dualViewByName(page, name).locator(locators.rackView.frontSvg).click();
  await expect(rackActions(page)).toBeVisible();
}

test.describe("Duplicate rack (#2858)", () => {
  test("duplicating a rack copies its devices into an independent copy", async ({
    page,
  }) => {
    await gotoWithRack(
      page,
      createTestLayout({
        name: "Dup Layout",
        rackName: "Original",
        rackHeight: 12,
        devices: [
          { type: "srv", position: 1, face: "front", name: "Widget One" },
        ],
        customTypes: [
          { slug: "srv", height: 1, colour: "#4A90A4", category: "s" },
        ],
      }),
    );

    // Duplicate the populated rack through its verb bar.
    await selectRack(page, "Original");
    await page.getByRole("button", { name: "Duplicate selection" }).click();

    // A "(Copy)" sibling appears and both racks carry the copied device.
    await expect(dualViewByName(page, "Original (Copy)")).toBeVisible();
    await expect(frontDevicesIn(page, "Original")).toHaveCount(1);
    await expect(frontDevicesIn(page, "Original (Copy)")).toHaveCount(1);

    // Independence: removing the copy's device must not touch the original.
    await frontDevicesIn(page, "Original (Copy)").first().click();
    await deleteSelectedDevice(page);

    await expect(frontDevicesIn(page, "Original (Copy)")).toHaveCount(0);
    await expect(frontDevicesIn(page, "Original")).toHaveCount(1);
  });
});

test.describe("Delete rack (#2858)", () => {
  test("confirming the delete dialog removes one rack and keeps the other", async ({
    page,
  }) => {
    await gotoWithRack(page, MULTI_RACK_SHARE);

    const fronts = page.locator(locators.rackView.front);
    await expect(fronts).toHaveCount(2);

    // Delete "Rack Dos" via the verb bar, which opens the confirm dialog.
    await selectRack(page, "Rack Dos");
    await page.getByRole("button", { name: "Delete selected" }).click();

    const confirm = page.getByRole("dialog", { name: "Delete Rack" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("Rack Dos");
    await confirm.getByTestId("btn-confirm-action").click();

    // The canvas drops to a single rack; the untouched rack keeps its device.
    await expect(fronts).toHaveCount(1);
    await expect(dualViewByName(page, "Rack Uno")).toBeVisible();
    await expect(dualViewByName(page, "Rack Dos")).toHaveCount(0);
    await expect(frontDevicesIn(page, "Rack Uno")).toHaveCount(1);
  });
});

test.describe("Cross-bay device placement (#2858)", () => {
  test("each bay of a bayed group renders its own device", async ({ page }) => {
    await gotoWithRack(page, BAYED_RACK_SHARE);

    const bayGroup = page.getByRole("group", { name: /bays/ });
    await expect(bayGroup).toBeVisible();

    const members = bayGroup.locator(locators.bayGroup.frontMemberSvg);
    await expect(members).toHaveCount(2);

    // Bay 1 holds "Alpha" only; bay 2 holds "Beta" only. Each device landed in
    // its intended bay, and neither bled into the other.
    await expect(members.nth(0)).toContainText("Alpha");
    await expect(members.nth(0)).not.toContainText("Beta");
    await expect(members.nth(1)).toContainText("Beta");
    await expect(members.nth(1)).not.toContainText("Alpha");
  });
});

test.describe("Export multiple racks (#2858)", () => {
  test("an SVG export of two racks contains both racks", async ({ page }) => {
    await gotoWithRack(page, MULTI_RACK_SHARE);
    await expect(page.locator(locators.rackView.front)).toHaveCount(2);

    await clickExport(page);
    const dialog = page.getByRole("dialog", { name: "Export" });
    // Both racks are selected by default; export the composite as SVG.
    await dialog.getByLabel("Format").selectOption("svg");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("btn-export-confirm").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.svg$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream?.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream?.on("end", () => resolve());
      stream?.on("error", reject);
    });
    const svg = Buffer.concat(chunks).toString("utf-8");

    expect(svg).toContain("Rack Uno");
    expect(svg).toContain("Rack Dos");
  });
});
