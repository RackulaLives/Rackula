/**
 * Toolbar action helpers for E2E tests
 *
 * The toolbar was reorganized: Save/Load are now in a "File menu" dropdown,
 * Export/Share are direct toolbar buttons, and "New Rack" is in the sidebar Racks tab.
 */
import type { Page } from "@playwright/test";

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
