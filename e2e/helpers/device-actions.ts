/**
 * Shared device action helpers for E2E tests
 * Consolidates duplicated drag-drop and selection code
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { locators } from "./locators";

/**
 * Drag a device from palette to rack using manual DragEvent dispatch
 * @param page - Playwright page
 * @param options.yOffsetPercent - Vertical position in rack (0-100), default 10
 * @param options.deviceIndex - Which palette device to drag (default 0 = first)
 * @param options.rackIndex - Zero-based index of the target rack in multi-rack layouts (default 0)
 * @returns Number of devices in rack after drag
 */
export async function dragDeviceToRack(
  page: Page,
  options?: { yOffsetPercent?: number; deviceIndex?: number; rackIndex?: number },
): Promise<number> {
  const yPercent = options?.yOffsetPercent ?? 10;
  const deviceIndex = options?.deviceIndex ?? 0;
  const rackIndex = options?.rackIndex ?? 0;

  await expect(page.locator(locators.device.paletteItem).first()).toBeVisible();

  const deviceCountBefore = await page.locator(locators.rack.device).count();

  await page.evaluate(
    ({ yPercent, deviceIndex, rackIndex }) => {
      const deviceItems = document.querySelectorAll(".device-palette-item");
      const deviceItem = deviceItems[deviceIndex];
      // Use front-view SVGs so rackIndex maps directly to rack number
      const rackSvgs = document.querySelectorAll(".rack-front .rack-svg");
      const rack = rackSvgs[rackIndex];
      if (!rack) {
        throw new Error(
          `Rack at index ${rackIndex} not found (${rackSvgs.length} rack(s) available)`,
        );
      }

      if (!deviceItem) {
        throw new Error(`Device item at index ${deviceIndex} not found`);
      }

      const rackRect = rack.getBoundingClientRect();
      const dropX = rackRect.left + rackRect.width / 2;
      const dropY = rackRect.top + (rackRect.height * yPercent) / 100;

      const dataTransfer = new DataTransfer();

      deviceItem.dispatchEvent(
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
          clientX: dropX,
          clientY: dropY,
        }),
      );

      rack.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: dropX,
          clientY: dropY,
        }),
      );

      deviceItem.dispatchEvent(
        new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
    },
    { yPercent, deviceIndex, rackIndex },
  );

  // Wait for device count to increase
  await expect(async () => {
    const currentCount = await page.locator(locators.rack.device).count();
    expect(currentCount).toBeGreaterThan(deviceCountBefore);
  }).toPass({ timeout: 5000 });

  return await page.locator(locators.rack.device).count();
}

/**
 * Select a device by clicking on it
 * Uses .rack-front to avoid dual-view duplicates
 */
export async function selectDevice(
  page: Page,
  index: number = 0,
): Promise<void> {
  const frontViewDevices = page.locator(locators.rackView.frontDevice);
  const frontCount = await frontViewDevices.count();

  const device =
    frontCount > 0
      ? frontViewDevices.nth(index)
      : page.locator(locators.rack.device).nth(index);

  await device.click();
  await expect(page.locator(locators.drawer.rightOpen)).toBeVisible();
}

/**
 * Deselect current device by pressing Escape
 */
export async function deselectDevice(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.locator(locators.drawer.rightOpen)).not.toBeVisible();
}

/**
 * Remove the currently selected device from the rack
 * Note: This removes immediately without a confirmation dialog
 */
export async function deleteSelectedDevice(page: Page): Promise<void> {
  const devices = page.locator(locators.rack.device);
  const countBeforeDelete = await devices.count();

  await page.click('button[aria-label="Remove from rack"]');

  await expect(async () => {
    const countAfterDelete = await devices.count();
    expect(countAfterDelete).toBeLessThan(countBeforeDelete);
  }).toPass({ timeout: 5000 });

  await expect(page.locator(locators.drawer.rightOpen)).not.toBeVisible();
}
