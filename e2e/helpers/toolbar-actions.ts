/**
 * Toolbar action helpers for E2E tests
 *
 * The toolbar was reorganized: Save/Load are now in a "File menu" dropdown,
 * Export/Share are direct toolbar buttons, and "New Rack" is in the sidebar Racks tab.
 */
import type { Page } from "@playwright/test";

/** Platform-aware modifier key (Cmd on macOS, Ctrl on Windows/Linux) */
const MODIFIER = process.platform === "darwin" ? "Meta" : "Control";

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
  // Trigger the load action so the hidden file input is created
  await page.keyboard.press(`${MODIFIER}+o`);

  // Wait for the hidden file input to appear
  const fileInput = page.locator('[data-testid="file-input-load"]');
  await fileInput.waitFor({ state: "attached", timeout: 5000 });

  // Set the file directly — no filechooser event needed
  await fileInput.setInputFiles(filePath);
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
  // Trigger load via menu
  await clickLoad(page);

  // Wait for the hidden file input to appear
  const fileInput = page.locator('[data-testid="file-input-load"]');
  await fileInput.waitFor({ state: "attached", timeout: 5000 });

  // Set the file directly
  await fileInput.setInputFiles(filePath);
}
