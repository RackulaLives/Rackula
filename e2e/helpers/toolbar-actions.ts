/**
 * Toolbar action helpers for E2E tests
 *
 * The top bar is the workspace frame only (#2072): file commands (save/export
 * backup, open, export image, share, import) live in the app menu behind the
 * logo, and "New Rack" is in the sidebar Racks tab. These helpers open the app
 * menu and select the matching item. The build under test is browser mode, so
 * "save" is the browser build's "Export backup" (a YAML download).
 */
import type { Page } from "@playwright/test";
import { PLATFORM_MODIFIER } from "./index";

/**
 * Open the app menu (the logo, top-left) and click the item with the given
 * registry action id. The item's testid is `app-menu-<id>`.
 */
async function selectAppMenuItem(page: Page, actionId: string): Promise<void> {
  await page.getByRole("button", { name: "App menu" }).click();
  const item = page.getByTestId(`app-menu-${actionId}`);
  await item.waitFor({ state: "visible" });
  await item.click();
}

/**
 * Click the "New Rack" button in the sidebar Racks tab.
 * Switches to the Racks tab if not already selected, then clicks the + button.
 */
export async function clickNewRack(page: Page): Promise<void> {
  const racksTab = page.getByTestId("sidebar-tab-racks");
  await racksTab.click();
  const newRackBtn = page.getByTestId("btn-new-rack");
  await newRackBtn.waitFor({ state: "visible" });
  await newRackBtn.click();
}

/**
 * Save via the app menu. In browser mode this is "Export backup", which
 * downloads the layout as a YAML archive.
 */
export async function clickSave(page: Page): Promise<void> {
  await selectAppMenuItem(page, "export-backup");
}

/**
 * Open a layout via the app menu.
 */
export async function clickLoad(page: Page): Promise<void> {
  await selectAppMenuItem(page, "load");
}

/**
 * Open the image export dialog via the app menu.
 */
export async function clickExport(page: Page): Promise<void> {
  await selectAppMenuItem(page, "export");
}

/**
 * Open the Settings dialog via the app menu. Settings moved out of the top bar
 * into the app menu behind the logo (#2398), so this is the only entry point.
 */
export async function clickSettings(page: Page): Promise<void> {
  await selectAppMenuItem(page, "settings");
}

/**
 * Wait for the hidden file input to appear, then set the file directly.
 * Shared by loadFileFromDisk() and loadFileFromDiskViaMenu().
 */
async function setFileAndWait(page: Page, filePath: string): Promise<void> {
  const fileInput = page.locator('[data-testid="file-input-load"]');
  await fileInput.waitFor({ state: "attached", timeout: 5000 });
  await fileInput.setInputFiles(filePath);
}

/**
 * Load a layout file using page.setInputFiles() on the hidden file input.
 *
 * Triggers the load action via Ctrl/Cmd+O, waits for the hidden file input
 * to appear in the DOM, then sets the file directly — avoiding the flaky
 * page.waitForEvent("filechooser") pattern.
 */
export async function loadFileFromDisk(
  page: Page,
  filePath: string,
): Promise<void> {
  await page.keyboard.press(`${PLATFORM_MODIFIER}+o`);
  await setFileAndWait(page, filePath);
}

/**
 * Load a layout file via the app menu (Open) + page.setInputFiles().
 *
 * Same as loadFileFromDisk but triggers load via the menu instead of the
 * keyboard shortcut, useful when the test needs to exercise the menu path.
 */
export async function loadFileFromDiskViaMenu(
  page: Page,
  filePath: string,
): Promise<void> {
  await clickLoad(page);
  await setFileAndWait(page, filePath);
}
