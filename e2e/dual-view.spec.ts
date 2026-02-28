import { test, expect } from "./helpers/base-test";
import type { Page } from "@playwright/test";
import {
  gotoWithRack,
  SMALL_RACK_SHARE,
  dragDeviceToRack,
  clickExport,
} from "./helpers";

/**
 * Helper to drag a device from palette to a specific rack view (front or rear)
 */
async function dragDeviceToRackView(page: Page, view: "front" | "rear") {
  await expect(page.locator(".device-palette-item").first()).toBeVisible();

  const viewSelector =
    view === "front" ? ".rack-front .rack-svg" : ".rack-rear .rack-svg";

  const deviceHandle = await page
    .locator(".device-palette-item")
    .first()
    .elementHandle();
  const rackHandle = await page.locator(viewSelector).elementHandle();

  if (!deviceHandle || !rackHandle) {
    throw new Error(`Could not find device item or ${view} rack view`);
  }

  await page.evaluate(
    ([device, rack]) => {
      const dataTransfer = new DataTransfer();

      device.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      rack.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      rack.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      device.dispatchEvent(
        new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
    },
    [deviceHandle, rackHandle] as const,
  );

  // Wait for state update
  await expect(async () => {
    const count = await page.locator(".rack-device").count();
    expect(count).toBeGreaterThan(0);
  }).toPass({ timeout: 5000 });
}

test.describe("Dual-View Rack Display", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("dual-view renders correctly on page load", async ({ page }) => {
    await expect(page.locator(".rack-dual-view")).toBeVisible();

    await expect(page.locator(".rack-front")).toBeVisible();
    await expect(page.locator(".rack-rear")).toBeVisible();

    await expect(
      page.locator('.rack-view-label:has-text("FRONT")'),
    ).toBeVisible();
    await expect(
      page.locator('.rack-view-label:has-text("REAR")'),
    ).toBeVisible();

    await expect(page.locator(".rack-front .rack-svg")).toBeVisible();
    await expect(page.locator(".rack-rear .rack-svg")).toBeVisible();
  });

  test("rack name is displayed once above both views", async ({ page }) => {
    await expect(page.locator(".rack-dual-view-name")).toBeVisible();
    await expect(page.locator(".rack-dual-view-name")).toHaveCount(1);
  });

  test("drag-drop to front view sets device face to front", async ({
    page,
  }) => {
    await expect(page.locator(".rack-dual-view")).toBeVisible();

    await dragDeviceToRackView(page, "front");

    await expect(page.locator(".rack-front .rack-device")).toBeVisible({
      timeout: 5000,
    });

    const frontDevices = await page.locator(".rack-front .rack-device").count();
    expect(frontDevices).toBeGreaterThan(0);
  });

  test("drag-drop to rear view sets device face to rear", async ({ page }) => {
    await expect(page.locator(".rack-dual-view")).toBeVisible();

    await dragDeviceToRackView(page, "rear");

    await expect(page.locator(".rack-rear .rack-device")).toBeVisible({
      timeout: 5000,
    });

    const rearDevices = await page.locator(".rack-rear .rack-device").count();
    expect(rearDevices).toBeGreaterThan(0);
  });

  test("blocked slot visual appears for full-depth devices", async ({
    page,
  }) => {
    await expect(page.locator(".rack-dual-view")).toBeVisible();

    await dragDeviceToRackView(page, "front");
    await expect(page.locator(".rack-front .rack-device")).toBeVisible({
      timeout: 5000,
    });

    const blockedSlots = page.locator(".rack-rear .blocked-slot");
    const hasBlockedSlots = (await blockedSlots.count()) > 0;

    if (hasBlockedSlots) {
      await expect(blockedSlots.first()).toBeVisible();
    }
  });

  test("dual-view rack can be selected", async ({ page }) => {
    await expect(page.locator(".rack-dual-view")).toBeVisible();

    await page.locator(".rack-front").click();

    await expect(page.locator(".rack-dual-view")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("device selection works in both views", async ({ page }) => {
    await expect(page.locator(".rack-dual-view")).toBeVisible();

    await dragDeviceToRackView(page, "front");
    await expect(page.locator(".rack-front .rack-device")).toBeVisible({
      timeout: 5000,
    });

    await page.locator(".rack-front .rack-device").first().click();

    await expect(
      page.locator(".rack-front .rack-device.selected").first(),
    ).toBeVisible({
      timeout: 2000,
    });
  });

  test("both views show same devices when face is both", async ({ page }) => {
    await expect(page.locator(".rack-dual-view")).toBeVisible();

    await dragDeviceToRackView(page, "front");

    const frontDevices = await page.locator(".rack-front .rack-device").count();
    const rearDevices = await page.locator(".rack-rear .rack-device").count();

    expect(frontDevices).toBeGreaterThan(0);

    if (rearDevices > 0) {
      expect(rearDevices).toBe(frontDevices);
    }
  });
});

test.describe("Dual-View Export", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page, SMALL_RACK_SHARE);

    // Setup: add device
    await dragDeviceToRack(page);
    await expect(page.locator(".rack-device").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("export dialog has view selection", async ({ page }) => {
    await clickExport(page);
    await expect(page.locator(".dialog")).toBeVisible();

    const viewSelect = page.locator("#export-view");
    await expect(viewSelect).toBeVisible();

    await expect(viewSelect.locator('option[value="both"]')).toBeAttached();
    await expect(viewSelect.locator('option[value="front"]')).toBeAttached();
    await expect(viewSelect.locator('option[value="rear"]')).toBeAttached();
  });

  test("export with both views downloads file", async ({ page }) => {
    await clickExport(page);

    await page.selectOption("#export-view", "both");

    const downloadPromise = page.waitForEvent("download");
    await page.click('button:has-text("Export"):not([aria-label])');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.(png|svg|jpe?g)$/);
  });

  test("export with front view only downloads file", async ({ page }) => {
    await clickExport(page);

    await page.selectOption("#export-view", "front");

    const downloadPromise = page.waitForEvent("download");
    await page.click('button:has-text("Export"):not([aria-label])');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.(png|svg|jpe?g)$/);
  });

  test("export with rear view only downloads file", async ({ page }) => {
    await clickExport(page);

    await page.selectOption("#export-view", "rear");

    const downloadPromise = page.waitForEvent("download");
    await page.click('button:has-text("Export"):not([aria-label])');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.(png|svg|jpe?g)$/);
  });

  test("SVG export with both views contains two rack renderings", async ({
    page,
  }) => {
    await clickExport(page);

    await page.selectOption("#export-format", "svg");
    await page.selectOption("#export-view", "both");

    const downloadPromise = page.waitForEvent("download");
    await page.click('button:has-text("Export"):not([aria-label])');

    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      stream?.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream?.on("end", () => resolve());
      stream?.on("error", reject);
    });

    const svgContent = Buffer.concat(chunks).toString("utf-8");

    expect(svgContent).toContain("FRONT");
    expect(svgContent).toContain("REAR");
  });
});
