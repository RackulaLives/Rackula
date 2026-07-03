import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  SMALL_RACK_SHARE,
  dragDeviceToRack,
  clickExport,
  locators,
} from "./helpers";

test.describe("Dual-View Rack Display", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("dual-view renders correctly on page load", async ({ page }) => {
    await expect(page.locator(locators.rackView.dualView)).toBeVisible();

    await expect(page.locator(locators.rackView.front)).toBeVisible();
    await expect(page.locator(locators.rackView.rear)).toBeVisible();

    await expect(
      page.getByTestId("rack-front").getByText("FRONT", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId("rack-rear").getByText("REAR", { exact: true }),
    ).toBeVisible();

    await expect(page.locator(locators.rackView.frontSvg)).toBeVisible();
    await expect(page.locator(locators.rackView.rearSvg)).toBeVisible();
  });

  test("rack name is displayed once above both views", async ({ page }) => {
    await expect(page.locator(locators.rackView.dualViewName)).toBeVisible();
    await expect(page.locator(locators.rackView.dualViewName)).toHaveCount(1);
  });

  test("drag-drop to front view sets device face to front", async ({
    page,
  }) => {
    await expect(page.locator(locators.rackView.dualView)).toBeVisible();

    await dragDeviceToRack(page, { view: "front" });

    await expect(page.locator(locators.rackView.frontDevice)).toBeVisible({
      timeout: 5000,
    });

    const frontDevices = await page
      .locator(locators.rackView.frontDevice)
      .count();
    expect(frontDevices).toBeGreaterThan(0);
  });

  test("drag-drop to rear view sets device face to rear", async ({ page }) => {
    await expect(page.locator(locators.rackView.dualView)).toBeVisible();

    await dragDeviceToRack(page, { view: "rear" });

    await expect(page.locator(locators.rackView.rearDevice)).toBeVisible({
      timeout: 5000,
    });

    const rearDevices = await page
      .locator(locators.rackView.rearDevice)
      .count();
    expect(rearDevices).toBeGreaterThan(0);
  });

  test("blocked slot visual appears for a half-depth device on the opposite face", async ({
    page,
  }) => {
    await expect(page.locator(locators.rackView.dualView)).toBeVisible();

    // Only a half-depth device hatches its slots on the opposite face. A
    // full-depth device (effectiveFace "both", e.g. the "Server" default) is
    // visible from both sides and is skipped by getBlockedSlots, so this must
    // drop an explicitly half-depth device to exercise the hatching path.
    await dragDeviceToRack(page, {
      view: "front",
      deviceName: "Patch Panel (24-Port)",
    });
    await expect(page.locator(locators.rackView.frontDevice)).toBeVisible({
      timeout: 5000,
    });

    // The half-depth device occupies the front only, so its slots render as
    // blocked hatching on the rear. Assert unconditionally.
    const blockedSlots = page.locator(locators.rackView.rearBlockedSlot);
    await expect(blockedSlots.first()).toBeVisible();
  });

  test("dual-view rack can be selected", async ({ page }) => {
    await expect(page.locator(locators.rackView.dualView)).toBeVisible();

    await page.locator(locators.rackView.front).click();

    // The rack is a role="listitem" (it holds interactive devices, so it cannot
    // be a role="option", which forbids focusable descendants). Selection is
    // announced through the accessible name, not aria-selected.
    await expect(page.locator(locators.rackView.dualView)).toHaveAttribute(
      "aria-label",
      /, selected$/,
    );
  });

  test("device selection works in both views", async ({ page }) => {
    await expect(page.locator(locators.rackView.dualView)).toBeVisible();

    await dragDeviceToRack(page, { view: "front" });
    await expect(page.locator(locators.rackView.frontDevice)).toBeVisible({
      timeout: 5000,
    });

    await page.locator(locators.rackView.frontDevice).first().click();

    await expect(
      page.locator(locators.rackView.frontDeviceSelected).first(),
    ).toBeVisible({
      timeout: 2000,
    });
  });

  test("both views show same devices when face is both", async ({ page }) => {
    await expect(page.locator(locators.rackView.dualView)).toBeVisible();

    await dragDeviceToRack(page, { view: "front" });

    const frontDevices = await page
      .locator(locators.rackView.frontDevice)
      .count();
    const rearDevices = await page
      .locator(locators.rackView.rearDevice)
      .count();

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
    await expect(page.locator(locators.rack.device).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("export dialog has view selection", async ({ page }) => {
    await clickExport(page);
    await expect(page.locator(locators.dialog.root)).toBeVisible();

    const viewSelect = page
      .getByRole("dialog", { name: "Export" })
      .getByLabel("View");
    await expect(viewSelect).toBeVisible();

    await expect(viewSelect.locator('option[value="both"]')).toBeAttached();
    await expect(viewSelect.locator('option[value="front"]')).toBeAttached();
    await expect(viewSelect.locator('option[value="rear"]')).toBeAttached();
  });

  test("export with both views downloads file", async ({ page }) => {
    await clickExport(page);

    await page
      .getByRole("dialog", { name: "Export" })
      .getByLabel("View")
      .selectOption("both");

    const downloadPromise = page.waitForEvent("download");
    await page.click('[data-testid="btn-export-confirm"]');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.(png|svg|jpe?g)$/);
  });

  test("export with front view only downloads file", async ({ page }) => {
    await clickExport(page);

    await page
      .getByRole("dialog", { name: "Export" })
      .getByLabel("View")
      .selectOption("front");

    const downloadPromise = page.waitForEvent("download");
    await page.click('[data-testid="btn-export-confirm"]');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.(png|svg|jpe?g)$/);
  });

  test("export with rear view only downloads file", async ({ page }) => {
    await clickExport(page);

    await page
      .getByRole("dialog", { name: "Export" })
      .getByLabel("View")
      .selectOption("rear");

    const downloadPromise = page.waitForEvent("download");
    await page.click('[data-testid="btn-export-confirm"]');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.(png|svg|jpe?g)$/);
  });

  test("SVG export with both views contains two rack renderings", async ({
    page,
  }) => {
    await clickExport(page);

    const exportDialog = page.getByRole("dialog", { name: "Export" });
    await exportDialog.getByLabel("Format").selectOption("svg");
    await exportDialog.getByLabel("View").selectOption("both");

    const downloadPromise = page.waitForEvent("download");
    await page.click('[data-testid="btn-export-confirm"]');

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
