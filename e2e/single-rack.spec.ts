import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  fillRackForm,
  clickNewRack,
  locators,
} from "./helpers";

test.describe("Single Rack Mode (v0.2)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("rack exists on initial load (v0.2 always has a rack)", async ({
    page,
  }) => {
    // In v0.4 dual-view mode, there are 2 rack containers (front and rear)
    await expect(page.locator(locators.rack.container)).toHaveCount(2);
    // Rack name is displayed in dual-view header
    await expect(page.locator(locators.rackView.dualViewName)).toBeVisible();
  });

  test("shows confirmation dialog when clicking New Rack", async ({ page }) => {
    // Clicking New Rack shows replace confirmation
    await clickNewRack(page);

    // Should show confirmation dialog
    await expect(
      page.locator('h2:has-text("Replace Current Rack?")'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="btn-save-first"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-replace-rack"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-cancel-replace"]')).toBeVisible();
  });

  test("Replace button clears rack and opens form", async ({ page }) => {
    // First create a named rack via replace dialog
    await clickNewRack(page);
    await page.click('[data-testid="btn-replace-rack"]');
    await fillRackForm(page, "Old Rack", 24);
    await page.click('[data-testid="btn-wizard-next"]');

    // Verify rack exists (dual-view header shows name)
    await expect(page.locator(locators.rackView.dualViewName)).toContainText(
      "Old Rack",
    );

    // Click New Rack, then Replace
    await clickNewRack(page);
    await expect(
      page.locator('h2:has-text("Replace Current Rack?")'),
    ).toBeVisible();
    await page.click('[data-testid="btn-replace-rack"]');

    // Dialog should close
    await expect(
      page.locator('h2:has-text("Replace Current Rack?")'),
    ).not.toBeVisible();

    // New Rack form should appear
    await expect(page.locator("#rack-name")).toBeVisible();
    await expect(page.locator('h2:has-text("New Rack")')).toBeVisible();

    // Create new rack
    await fillRackForm(page, "New Rack", 42);
    await page.click('[data-testid="btn-wizard-next"]');

    // Only new rack should exist (2 rack containers in dual-view mode)
    await expect(page.locator(locators.rack.container)).toHaveCount(2);
    await expect(
      page.locator(locators.rackView.dualViewName, { hasText: "New Rack" }),
    ).toBeVisible();
    await expect(
      page.locator(locators.rackView.dualViewName, { hasText: "Old Rack" }),
    ).not.toBeVisible();
  });

  test("Cancel preserves existing rack", async ({ page }) => {
    // Create a named rack first
    await clickNewRack(page);
    await page.click('[data-testid="btn-replace-rack"]');
    await fillRackForm(page, "My Rack", 42);
    await page.click('[data-testid="btn-wizard-next"]');

    // Verify rack exists (dual-view header shows name)
    await expect(page.locator(locators.rackView.dualViewName)).toContainText("My Rack");

    // Click New Rack, then Cancel
    await clickNewRack(page);
    await expect(
      page.locator('h2:has-text("Replace Current Rack?")'),
    ).toBeVisible();
    await page.click('[data-testid="btn-cancel-replace"]');

    // Dialog should close
    await expect(
      page.locator('h2:has-text("Replace Current Rack?")'),
    ).not.toBeVisible();

    // Rack should still exist (2 containers in dual-view)
    await expect(page.locator(locators.rack.container)).toHaveCount(2);
    await expect(page.locator(locators.rackView.dualViewName)).toContainText("My Rack");

    // New Rack form should NOT be open
    await expect(page.locator('h2:has-text("New Rack")')).not.toBeVisible();
  });

  test("Escape key triggers Cancel", async ({ page }) => {
    // Create a named rack first
    await clickNewRack(page);
    await page.click('[data-testid="btn-replace-rack"]');
    await fillRackForm(page, "Test Rack", 24);
    await page.click('[data-testid="btn-wizard-next"]');

    // Click New Rack to show dialog
    await clickNewRack(page);
    await expect(
      page.locator('h2:has-text("Replace Current Rack?")'),
    ).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");

    // Dialog should close
    await expect(
      page.locator('h2:has-text("Replace Current Rack?")'),
    ).not.toBeVisible();

    // Rack should still exist (2 containers in dual-view)
    await expect(page.locator(locators.rack.container)).toHaveCount(2);
    await expect(page.locator(locators.rackView.dualViewName)).toContainText(
      "Test Rack",
    );
  });

  test("enforces maximum 1 rack", async ({ page }) => {
    // Verify rack exists (2 containers in dual-view for the single rack)
    await expect(page.locator(locators.rack.container)).toHaveCount(2);

    // Try to create a 2nd rack should show confirmation dialog
    await clickNewRack(page);

    // Should show replace confirmation, not allow direct creation
    await expect(
      page.locator('h2:has-text("Replace Current Rack?")'),
    ).toBeVisible();

    // Cancel the dialog
    await page.click('[data-testid="btn-cancel-replace"]');

    // Should still have only the dual-view containers (2)
    await expect(page.locator(locators.rack.container)).toHaveCount(2);
  });

  test("dialog shows correct rack name and device count", async ({ page }) => {
    // Create a named rack via replace
    await clickNewRack(page);
    await page.click('[data-testid="btn-replace-rack"]');
    await fillRackForm(page, "Production Server Rack", 42);
    await page.click('[data-testid="btn-wizard-next"]');

    // Try to create second rack
    await clickNewRack(page);

    // Dialog should show rack name in message (use specific selector for replace dialog, not drawer)
    const dialog = page.locator('.dialog[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("text=/Production Server Rack/")).toBeVisible();

    // Should show 0 devices initially
    await expect(dialog.locator("text=/0 devices/")).toBeVisible();
  });
});
