/**
 * Rack wizard setup helpers for E2E tests
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

interface WizardOptions {
  name?: string;
  heightPreset?: 1 | 2 | 3 | 4; // 1=12U, 2=18U, 3=24U, 4=42U
  layout?: "column" | "bayed";
  customHeight?: number;
}

/**
 * Complete the New Rack wizard using keyboard shortcuts
 * @param page - Playwright page
 * @param options - Wizard configuration
 */
export async function completeWizardWithKeyboard(
  page: Page,
  options?: WizardOptions,
): Promise<void> {
  // Wait for wizard to be visible
  await expect(page.locator('[role="dialog"]')).toBeVisible();

  // Step 1: Name field is auto-focused with default text selected
  if (options?.name) {
    // Clear default and type new name
    await page.keyboard.press("Control+a");
    await page.keyboard.type(options.name);
  }

  // Select layout type with arrow keys if bayed
  if (options?.layout === "bayed") {
    await page.keyboard.press("ArrowRight");
  }

  // Press Enter to go to Step 2
  await page.keyboard.press("Enter");

  // Step 2: Select height with number key
  if (options?.heightPreset) {
    await page.keyboard.press(String(options.heightPreset));
  }

  // Press Enter to create
  await page.keyboard.press("Enter");

  // Wait for rack to appear
  await page.locator(".rack-container").first().waitFor({ state: "visible" });
}

/**
 * Complete the New Rack wizard using mouse clicks
 * @param page - Playwright page
 * @param options - Wizard configuration
 */
export async function completeWizardWithClicks(
  page: Page,
  options?: { name?: string; height?: number; layout?: "column" | "bayed" },
): Promise<void> {
  // Wait for wizard
  await expect(page.locator('[role="dialog"]')).toBeVisible();

  // Fill name if provided
  if (options?.name) {
    await page.fill("#rack-name", options.name);
  }

  // Select layout type
  if (options?.layout === "bayed") {
    await page.click('button:has-text("Bayed")');
  }

  // Click Next
  await page.click('button:has-text("Next")');

  // Select height if provided
  const height = options?.height ?? 42;
  const presetHeights = [12, 18, 24, 42];
  if (presetHeights.includes(height)) {
    await page.click(`.height-btn:has-text("${height}U")`);
  } else {
    await page.click('.height-btn:has-text("Custom")');
    await page.fill("#custom-height", String(height));
  }

  // Click Create
  await page.click('button:has-text("Create")');

  // Wait for rack
  await page.locator(".rack-container").first().waitFor({ state: "visible" });
}

/**
 * Fill rack form fields (legacy helper for tests that open wizard themselves)
 */
export async function fillRackForm(
  page: Page,
  name: string,
  height: number,
): Promise<void> {
  await page.fill("#rack-name", name);

  const presetHeights = [12, 18, 24, 42];
  if (presetHeights.includes(height)) {
    await page.click(`.height-btn:has-text("${height}U")`);
  } else {
    await page.click('.height-btn:has-text("Custom")');
    await page.fill("#custom-height", String(height));
  }
}
