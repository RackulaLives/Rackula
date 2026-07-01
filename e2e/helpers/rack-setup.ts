/**
 * Rack setup helpers for E2E tests
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { locators } from "./locators";
import { clickNewRack } from "./toolbar-actions";

/**
 * Create a rack directly via the sidebar New Rack button (#2732) and wait for
 * the new rack to appear. New Rack adds a 24U rack immediately: the New Rack
 * wizard was removed in #2747, so rack dimensions are configured afterwards via
 * the Edit panel. When `name` is given, the freshly-created rack (selected on
 * create) is renamed through the Edit panel so callers can address it by name.
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
