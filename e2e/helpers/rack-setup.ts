/**
 * Rack wizard setup helpers for E2E tests
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { locators } from "./locators";
import { clickNewRack } from "./toolbar-actions";

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
  // Bayed racks only allow 10-24U; the column default (42) would be clamped by
  // the bayed slider, so fall back to a bayed-safe default instead.
  return options?.layout === "bayed" ? 12 : 42;
}

async function selectHeight(
  page: Page,
  height: number,
  layout: "column" | "bayed" = "column",
): Promise<void> {
  const presetHeights = [12, 18, 24, 42];
  // Only column racks expose preset buttons; bayed racks use the slider only.
  if (layout === "column" && presetHeights.includes(height)) {
    await page.click(`[data-testid="btn-height-${height}"]`);
    return;
  }

  // Slider fallback: a range input silently clamps out-of-range values, which
  // would let a test pass with the wrong height. Validate against the slider's
  // own min/max/step so the test fails fast instead.
  const slider = page.locator('[data-testid="slider-height"]');
  const minAttr = await slider.getAttribute("min");
  const maxAttr = await slider.getAttribute("max");
  const stepAttr = await slider.getAttribute("step");
  const min = Number(minAttr);
  const max = Number(maxAttr);
  const step = stepAttr === null ? NaN : Number(stepAttr);
  if (
    minAttr === null ||
    maxAttr === null ||
    Number.isNaN(min) ||
    Number.isNaN(max)
  ) {
    throw new Error(
      `selectHeight: could not read slider range (min=${minAttr}, max=${maxAttr})`,
    );
  }
  if (stepAttr !== "any" && (Number.isNaN(step) || step <= 0)) {
    throw new Error(
      `selectHeight: could not read slider step (step=${stepAttr})`,
    );
  }
  if (height < min || height > max) {
    throw new Error(
      `selectHeight: height ${height}U is outside the slider range [${min}, ${max}]`,
    );
  }
  // A range input also snaps in-range values to the nearest step (the bayed
  // slider uses step=2), which would silently coerce e.g. 13U to 12U.
  if (stepAttr !== "any" && (height - min) % step !== 0) {
    throw new Error(
      `selectHeight: height ${height}U does not align to slider step ${step}U from min ${min}U`,
    );
  }

  await slider.fill(String(height));
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
  await expect(page.getByRole("dialog", { name: "New Rack" })).toBeVisible();

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
  await page
    .locator(locators.rack.container)
    .first()
    .waitFor({ state: "visible" });
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
  await expect(page.getByRole("dialog", { name: "New Rack" })).toBeVisible();

  // Fill name if provided
  if (options?.name) {
    await page.getByLabel("Rack Name", { exact: true }).fill(options.name);
  }

  // Select layout type
  if (options?.layout === "bayed") {
    await page.click('[data-testid="btn-layout-bayed"]');
  }

  // Click Next
  await page.click('[data-testid="btn-wizard-next"]');

  // Bay count selection for bayed layouts (default is 2)
  if (options?.layout === "bayed" && options.bayCount === 3) {
    await page.click('[data-testid="btn-bay-3"]');
  }

  // Select height (preset button for column, slider otherwise)
  await selectHeight(page, resolveHeight(options), options?.layout ?? "column");

  // Click Create
  await page.click('[data-testid="btn-wizard-next"]');

  // Wait for rack
  await page
    .locator(locators.rack.container)
    .first()
    .waitFor({ state: "visible" });
}

/**
 * Create a rack directly via the sidebar New Rack button (#2732) and wait for
 * the new rack to appear. #2732 makes New Rack add a 24U rack immediately
 * instead of opening the wizard, so this replaces clickNewRack + completeWizard*
 * in setup-only specs. When `name` is given, the freshly-created rack (selected
 * on create) is renamed through the Edit panel so callers can address it by name.
 * @param page - Playwright page
 * @param options - Optional rack name to apply after creation
 */
export async function createRackDirect(
  page: Page,
  options?: { name?: string },
): Promise<void> {
  const fronts = page.locator(locators.rackView.front);
  const before = await fronts.count();
  await clickNewRack(page);
  await expect(fronts).toHaveCount(before + 1);

  if (options?.name) {
    // The new rack is auto-selected, so the Edit panel shows its name field.
    const nameInput = page.locator("#rack-name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill(options.name);
    await nameInput.press("Enter");
    // Anchor the match so a name that is a substring of another rack's name
    // cannot satisfy this before the rename actually lands.
    const escaped = options.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(
      page.locator(locators.rackView.dualViewName, {
        hasText: new RegExp(`^${escaped}$`),
      }),
    ).toBeVisible();
  }
}
