/**
 * Rack wizard setup helpers for E2E tests
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

interface WizardOptions {
  name?: string;
  heightPreset?: 1 | 2 | 3 | 4; // 1=12U, 2=18U, 3=24U, 4=42U
  layout?: "column" | "bayed";
  bayCount?: 2 | 3;
  height?: number;
}

const HEIGHT_BY_PRESET: Record<
  NonNullable<WizardOptions["heightPreset"]>,
  number
> = {
  1: 12,
  2: 18,
  3: 24,
  4: 42,
};

function resolveHeight(options?: WizardOptions): number {
  if (typeof options?.height === "number") {
    return options.height;
  }
  if (options?.heightPreset) {
    return HEIGHT_BY_PRESET[options.heightPreset];
  }
  return 42;
}

async function selectHeight(page: Page, height: number): Promise<void> {
  const presetHeights = [12, 18, 24, 42];
  if (presetHeights.includes(height)) {
    await page.click(`.height-btn:has-text("${height}U")`);
    return;
  }

  await page.click('.height-btn:has-text("Custom")');
  await page.fill("#custom-height", String(height));
}

/**
 * Complete the New Rack wizard using keyboard shortcuts
 * Note: Keyboard flow supports preset heights only (12/18/24/42) via HEIGHT_BY_PRESET.
 * For custom heights, use completeWizardWithClicks, which delegates to selectHeight.
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
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(options.name);
  }

  // Select layout type with arrow keys if bayed
  if (options?.layout === "bayed") {
    await page.keyboard.press("ArrowRight");
  }

  // Press Enter to go to Step 2
  await page.keyboard.press("Enter");

  // Step 2: Select height with number key
  const selectedHeight = resolveHeight(options);
  const selectedPreset = Object.entries(HEIGHT_BY_PRESET).find(
    ([, value]) => value === selectedHeight,
  )?.[0];
  if (selectedPreset) {
    await page.keyboard.press(selectedPreset);
  } else {
    throw new Error(
      `completeWizardWithKeyboard only supports preset heights (12, 18, 24, 42). Received: ${selectedHeight}`,
    );
  }

  // Bay count shortcuts on step 2 (default is 2 bays)
  if (options?.layout === "bayed" && options.bayCount === 3) {
    await page.keyboard.press("ArrowRight");
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
  options?: WizardOptions,
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

  // Bay count selection for bayed layouts (default is 2)
  if (options?.layout === "bayed" && options.bayCount === 3) {
    await page.click('.bay-btn:has-text("3 Bays")');
  }

  // Select height (preset or custom)
  await selectHeight(page, resolveHeight(options));

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
  await selectHeight(page, height);
}
