/**
 * E2E coverage for the command palette shell (#2212).
 *
 * Covers: shortcut opens (input focused); pill click opens; typing filters;
 * Enter runs the highlighted command then closes; Esc closes; opening the
 * palette closes another open dialog.
 */
import { test, expect } from "./helpers/base-test";
import { gotoWithRack, SMALL_RACK_SHARE, PLATFORM_MODIFIER } from "./helpers";

test.describe("Command palette", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page, SMALL_RACK_SHARE);
  });

  test("Ctrl/Cmd+K opens the palette with input focused", async ({ page }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible({ timeout: 2000 });
    await expect(page.getByTestId("command-palette-input")).toBeFocused();
  });

  test("clicking the top-bar pill opens the palette", async ({ page }) => {
    await page.getByTestId("btn-command-palette").click();
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
  });

  test("typing filters the command list", async ({ page }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    const input = page.getByTestId("command-palette-input");
    await input.fill("fit");
    // fit-all matches the filter and stays visible.
    await expect(
      page.getByTestId("command-palette-item-fit-all"),
    ).toBeVisible();
    // share does not match "fit" and is filtered out.
    // (share is included unfiltered because SMALL_RACK_SHARE provides a rack,
    // satisfying its hasRacks enabledWhen gate.)
    await expect(page.getByTestId("command-palette-item-share")).toHaveCount(0);
  });

  test("Enter runs the highlighted command then closes the palette", async ({
    page,
  }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    const input = page.getByTestId("command-palette-input");
    // Filter to a single deterministic, side-effect-clean command: "fit all"
    // matches the Fit All command (fit-all), which pans/zooms the canvas and
    // opens no secondary dialog. This makes the "palette closed" assertion
    // unambiguous - no other dialog can interfere.
    await input.fill("fit all");
    await expect(
      page.getByTestId("command-palette-item-fit-all"),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    // The palette must be gone after the command runs.
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).not.toBeVisible();
  });

  test("Escape closes the palette", async ({ page }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).not.toBeVisible();
    // The input is gone from the DOM once the dialog closes.
    await expect(page.getByTestId("command-palette-input")).toHaveCount(0);
  });

  test("running a command that opens a dialog keeps that dialog open", async ({
    page,
  }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    const input = page.getByTestId("command-palette-input");
    await input.fill("about");
    await expect(
      page.getByTestId("command-palette-item-show-help"),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "About Rackula" }),
    ).toBeVisible();
  });

  test("Ctrl/Cmd+K opens the palette even when a text field is focused", async ({
    page,
  }) => {
    // Click the layout name display button to enter rename mode.
    // This reveals a text input (data-testid="layout-name-input") and focuses it,
    // simulating a user with keyboard focus inside an editable field.
    await page.getByTestId("layout-name-display").click();
    const nameInput = page.getByTestId("layout-name-input");
    await expect(nameInput).toBeFocused();

    // Press the palette shortcut from within the focused text field.
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);

    // The palette must open regardless of the focused field.
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible({ timeout: 2000 });
    // The palette input must steal focus from the rename field.
    await expect(page.getByTestId("command-palette-input")).toBeFocused();
  });

  test("opening the palette closes the help dialog", async ({ page }) => {
    // Open the help dialog first using the ? shortcut.
    // Shift+Slash dispatches keydown key="?" shiftKey=true, matching a real keyboard.
    await page.keyboard.press("Shift+Slash");
    // HelpPanel passes title="About Rackula" to Dialog; Dialog.Title makes that
    // the accessible name (confirmed in HelpPanel.svelte and keyboard.spec.ts).
    await expect(
      page.getByRole("dialog", { name: "About Rackula" }),
    ).toBeVisible({ timeout: 2000 });

    // Open the command palette. dialogStore is a scalar: opening "commandPalette"
    // replaces "help", so the help dialog disappears automatically.
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "About Rackula" }),
    ).not.toBeVisible();
  });
});
