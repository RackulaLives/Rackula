/**
 * Shared device action helpers for E2E tests
 * Consolidates duplicated drag-drop and selection code
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { locators } from "./locators";

/**
 * Drag a device from palette to rack using manual DragEvent dispatch.
 *
 * Prefer `deviceName` over `deviceIndex`: positional indexing is fragile under
 * the virtualized palette (#2094), where off-screen rows unmount and a pinned
 * device renders twice (once in the favourites section, once in its category).
 * `deviceName` matches the visible device name, so it survives reordering,
 * virtualization, and the favourites duplicate.
 *
 * @param page - Playwright page
 * @param options.yOffsetPercent - Vertical position in rack (0-100), default 10
 * @param options.deviceName - Visible name of the palette device to drag. Defaults
 *   to the generic full-width "Server" when no deviceIndex is given (preferred).
 * @param options.deviceIndex - Positional selection; when given, it overrides the
 *   name default. Fragile under virtualization (#2094), so prefer deviceName.
 * @param options.rackIndex - Zero-based index of the target rack in multi-rack layouts (default 0)
 * @param options.view - Rack face to drop onto: "front" (default) or "rear"
 * @returns Number of devices in rack after drag
 */
export async function dragDeviceToRack(
  page: Page,
  options?: {
    yOffsetPercent?: number;
    deviceName?: string;
    deviceIndex?: number;
    rackIndex?: number;
    view?: "front" | "rear";
  },
): Promise<number> {
  const yPercent = options?.yOffsetPercent ?? 10;
  // Default to the generic full-width "Server" when the caller names neither a
  // device nor an index. After #2745 alphabetized the palette the first item is
  // a half-width carrier-required "Blade Server (Full-Height)" that placeDevice
  // refuses to place on the rails, so an index-0 default placed nothing (#2851,
  // #2755). An explicit deviceIndex still selects positionally.
  const deviceName =
    options?.deviceName ??
    (options?.deviceIndex === undefined ? "Server" : null);
  const deviceIndex = options?.deviceIndex ?? 0;
  const rackIndex = options?.rackIndex ?? 0;
  const view = options?.view ?? "front";

  await expect(page.locator(locators.device.paletteItem).first()).toBeVisible();

  // When targeting by name, wait for that item to render before the one-shot
  // evaluate below. The palette search input debounces 150ms
  // (DevicePalette.svelte) and the virtualized list unmounts off-window rows
  // (#2094); without this wait the querySelectorAll snapshot can miss the named
  // device and throw. Playwright auto-waits here (no fixed timeout). The name
  // can resolve to several identical generic entries (e.g. the 1U-4U Servers),
  // so scope to the first match: all share a placeable full-width form.
  if (deviceName !== null) {
    await paletteItemByName(page, deviceName)
      .first()
      .waitFor({ state: "visible" });
  }

  const deviceCountBefore = await page.locator(locators.rack.device).count();

  await page.evaluate(
    ({ yPercent, deviceName, deviceIndex, rackIndex, view }) => {
      const deviceItems = Array.from(
        document.querySelectorAll('[data-testid="device-palette-item"]'),
      );
      // Index by name when given: positional indexing breaks under
      // virtualization and the favourites duplicate (#2094). Check for null
      // (not truthiness) so an empty name still searches rather than silently
      // falling back to the index path.
      const deviceItem =
        deviceName !== null
          ? deviceItems.find(
              (item) =>
                item.querySelector(".device-name")?.textContent?.trim() ===
                deviceName,
            )
          : deviceItems[deviceIndex];
      // Use the requested view's SVGs so rackIndex maps directly to rack number.
      // Dropping on the rear view sets the placed device's face to rear.
      const rackSvgs = document.querySelectorAll(
        `[data-testid="rack-${view}"] .rack-svg`,
      );
      const rack = rackSvgs[rackIndex];
      if (!rack) {
        throw new Error(
          `Rack at index ${rackIndex} not found (${rackSvgs.length} rack(s) available)`,
        );
      }

      if (!deviceItem) {
        throw new Error(
          deviceName !== null
            ? `Device named "${deviceName}" not found in palette`
            : `Device item at index ${deviceIndex} not found`,
        );
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
    { yPercent, deviceName, deviceIndex, rackIndex, view },
  );

  // Wait for device count to increase
  await expect(async () => {
    const currentCount = await page.locator(locators.rack.device).count();
    expect(currentCount).toBeGreaterThan(deviceCountBefore);
  }).toPass({ timeout: 5000 });

  return await page.locator(locators.rack.device).count();
}

/**
 * Locate a palette item by its visible device name.
 *
 * Use this instead of `.nth(index)` when targeting a specific device: the
 * palette is virtualized and sorts custom devices into the brand list (#2094),
 * so positional indices are unstable. Filtering by name survives reordering and
 * the favourites duplicate.
 *
 * A pinned device renders twice (favourites section and category section). When
 * the name is ambiguous, scope the search first, e.g.
 * `page.getByTestId("device-palette-favourites")`, then call `.first()`.
 */
export function paletteItemByName(page: Page, deviceName: string): Locator {
  // Exact match on the item's own .device-name span, matching dragDeviceToRack's
  // in-page comparison. Substring matching would let "Server" match "Server 2U".
  // The has-locator is scoped to each candidate item, so it targets the item's
  // .device-name child directly (paletteItemName is the relative selector). A
  // full "[data-testid=...] .device-name" selector would instead require a
  // nested palette item (there is none) and match nothing, dropping every item.
  return page.getByTestId("device-palette-item").filter({
    has: page.locator(locators.device.paletteItemName, {
      hasText: new RegExp(`^${escapeRegExp(deviceName)}$`),
    }),
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  // Selecting a device surfaces its properties in the side panel's Edit tab.
  // Assert the Edit tab is the active one and its empty-state prompt is gone,
  // so this does not pass merely because the View tab is hiding the Edit panel.
  await expect(page.locator(locators.sidePanel.editPanel)).toBeVisible();
  await expect(page.locator(locators.sidePanel.editEmpty)).not.toBeVisible();
}

/**
 * Deselect current device by pressing Escape
 */
export async function deselectDevice(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  // With nothing selected the Edit tab falls back to its empty-state prompt.
  await expect(page.locator(locators.sidePanel.editEmpty)).toBeVisible();
}

/**
 * Remove the currently selected device from the rack
 * Note: This removes immediately without a confirmation dialog
 */
export async function deleteSelectedDevice(page: Page): Promise<void> {
  const devices = page.locator(locators.rack.device);
  const countBeforeDelete = await devices.count();

  await page.getByRole("button", { name: "Remove from rack" }).click();

  await expect(async () => {
    const countAfterDelete = await devices.count();
    expect(countAfterDelete).toBeLessThan(countBeforeDelete);
  }).toPass({ timeout: 5000 });

  // Removing the device clears the selection, but the rack it was in stays
  // the active rack, so the inspector falls back to rack mode rather than
  // the empty state (#2739, #2757). Unlike deselectDevice(), this never
  // presses Escape, which is the only path that also clears the active rack.
  // Assert the Edit tab is still showing content (not just that the
  // empty-state testid is absent), matching the pairing selectDevice() uses
  // above so this can't pass vacuously off an unmounted tabpanel.
  await expect(page.locator(locators.sidePanel.editPanel)).toBeVisible();
  await expect(page.locator(locators.sidePanel.editEmpty)).not.toBeVisible();
}

/**
 * Click the device display-name field to enter edit mode.
 *
 * In view mode the field is a button (aria-label "Edit display name"); clicking
 * it swaps in the editable text input.
 */
export async function startEditingDisplayName(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Edit display name" }).click();
}

/**
 * Locator for the device display-name input shown while editing.
 *
 * Scoped to the side panel's Edit tabpanel so the "Name" label is unambiguous.
 */
export function displayNameInput(page: Page): Locator {
  return page
    .getByTestId("side-panel-panel-edit")
    .getByLabel("Name", { exact: true });
}
