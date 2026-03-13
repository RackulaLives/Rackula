/**
 * Toolbar action helpers for E2E tests
 *
 * The toolbar was reorganized: Save/Load are now in a "File menu" dropdown,
 * Export/Share are direct toolbar buttons, and "New Rack" is in the sidebar Racks tab.
 */
import type { Page } from "@playwright/test";
import { PLATFORM_MODIFIER } from "./index";

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
 * Click Save via the File menu dropdown.
 */
export async function clickSave(page: Page): Promise<void> {
  await page.click('button[aria-label="File menu"]');
  const saveItem = page.locator('[data-testid="menu-save"]');
  await saveItem.waitFor({ state: "visible" });
  await saveItem.click();
}

/**
 * Click Load via the File menu dropdown.
 */
export async function clickLoad(page: Page): Promise<void> {
  await page.click('button[aria-label="File menu"]');
  const loadItem = page.locator('[data-testid="menu-load"]');
  await loadItem.waitFor({ state: "visible" });
  await loadItem.click();
}

/**
 * Click the Export button in the toolbar.
 */
export async function clickExport(page: Page): Promise<void> {
  await page.getByTestId("btn-export").click();
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
 * Load a layout file via the File menu dropdown + page.setInputFiles().
 *
 * Same as loadFileFromDisk but triggers load via the menu instead of
 * keyboard shortcut — useful when the test needs to exercise the menu path.
 */
export async function loadFileFromDiskViaMenu(
  page: Page,
  filePath: string,
): Promise<void> {
  await clickLoad(page);
  await setFileAndWait(page, filePath);
}
