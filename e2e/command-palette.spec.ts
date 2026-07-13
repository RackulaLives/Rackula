/**
 * E2E coverage for the command palette shell (#2212) and recents / selection-aware
 * empty state (#2213).
 *
 * Covers: shortcut opens (input focused); pill click opens; typing filters;
 * Enter runs the highlighted command then closes; Esc closes; opening the
 * palette closes another open dialog; recents appear after running a command;
 * selection block surfaces the selected device's verbs; palette is never blank.
 */
import { test, expect } from "./helpers/base-test";
import {
  gotoWithRack,
  SMALL_RACK_SHARE,
  RACK_WITH_DEVICE_SHARE,
  PLATFORM_MODIFIER,
  selectDevice,
  locators,
} from "./helpers";

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
    // Double-click the active layout tab to enter inline rename mode. This
    // reveals a text input (data-testid="layout-name-input") and focuses it,
    // simulating a user with keyboard focus inside an editable field. Scope to
    // the layout tablist so the selected tab is unambiguous (the sidebar also
    // has tabs).
    await page
      .getByRole("tablist", { name: "Open layouts" })
      .getByRole("tab", { selected: true })
      .dblclick();
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

  // --- #2213: recents + selection-aware empty state ---

  test("a command run from the palette appears under Recent on reopen", async ({
    page,
  }) => {
    // Open palette, filter to fit-all, and run it with Enter.
    // fit-all is a side-effect-clean navigation command (pans/zooms, opens no
    // secondary dialog) so the only visible outcome is the palette closing.
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await page.getByTestId("command-palette-input").fill("fit all");
    await expect(
      page.getByTestId("command-palette-item-fit-all"),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).not.toBeVisible();

    // Reopen with no search text. The empty-state Recent section must appear
    // and carry fit-all as the most recently executed palette command.
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await expect(page.getByTestId("command-palette-recent")).toBeVisible();
    await expect(
      page.getByTestId("command-palette-recent-item-fit-all"),
    ).toBeVisible();
  });

  test("selecting a device surfaces its verbs in the Selection block", async ({
    page,
  }) => {
    // RACK_WITH_DEVICE_SHARE carries a pre-placed 1U test-server device so no
    // drag is needed. selectDevice clicks the first front-view device and waits
    // for the Edit panel to confirm selection before returning.
    await gotoWithRack(page, RACK_WITH_DEVICE_SHARE);
    await selectDevice(page, 0);

    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);

    // The Selection block must be visible and carry verbs that apply to a
    // selected device. duplicate-selection (isDeviceSelected||isRackSelected)
    // and delete-selection (hasSelection) both pass for a device selection.
    await expect(page.getByTestId("command-palette-selection")).toBeVisible();
    await expect(
      page.getByTestId("command-palette-selection-item-duplicate-selection"),
    ).toBeVisible();
    await expect(
      page.getByTestId("command-palette-selection-item-delete-selection"),
    ).toBeVisible();
  });

  test("the empty palette is never blank", async ({ page }) => {
    // With no search text and no recents the empty-state Commands section must
    // render. fit-all is a global layout command with no enabledWhen gate so it
    // is always present when a rack exists (SMALL_RACK_SHARE satisfies hasRacks).
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("command-palette-item-fit-all"),
    ).toBeVisible();
    // Command.Empty ("No matching commands") must not be in the DOM when items exist.
    await expect(page.getByText("No matching commands")).toHaveCount(0);
  });

  // --- #2214: device-search sub-mode ---

  test("Add device pushes a device sub-page without closing the palette", async ({
    page,
  }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();

    await page.getByTestId("command-palette-add-device").click();

    // The palette stays open; the device sub-page swaps in (back affordance and
    // a device result row appear). 1u-server is a stable starter slug.
    await expect(palette).toBeVisible();
    await expect(page.getByTestId("command-palette-device-back")).toBeVisible();
    await expect(
      page.getByTestId("command-palette-device-item-1u-server"),
    ).toBeVisible();
  });

  test("device rows never appear in the top-level command list", async ({
    page,
  }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    // Type a query that matches a device model but no command. No device row may
    // surface at the top level: device search lives only behind "Add device...".
    await page.getByTestId("command-palette-input").fill("server");
    await expect(
      page.getByTestId("command-palette-device-item-1u-server"),
    ).toHaveCount(0);
  });

  test("the back affordance returns to the command list", async ({ page }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await page.getByTestId("command-palette-add-device").click();
    await expect(page.getByTestId("command-palette-device-back")).toBeVisible();

    await page.getByTestId("command-palette-device-back").click();
    // Back to commands: the command list returns and the device sub-page is gone.
    await expect(
      page.getByTestId("command-palette-item-fit-all"),
    ).toBeVisible();
    await expect(page.getByTestId("command-palette-device-back")).toHaveCount(
      0,
    );
  });

  test("Backspace on an empty device query returns to the command list", async ({
    page,
  }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await page.getByTestId("command-palette-add-device").click();
    const input = page.getByTestId("command-palette-input");
    await expect(input).toBeFocused();

    // A typed query then Backspaces clears the text; a further Backspace on the
    // now-empty query pops back to commands (it must not also delete a char).
    await input.fill("srv");
    await input.press("Backspace");
    await input.press("Backspace");
    await input.press("Backspace");
    // Query is empty but still in device mode.
    await expect(page.getByTestId("command-palette-device-back")).toBeVisible();
    // One more Backspace on the empty query returns to commands.
    await input.press("Backspace");
    await expect(
      page.getByTestId("command-palette-item-fit-all"),
    ).toBeVisible();
    await expect(page.getByTestId("command-palette-device-back")).toHaveCount(
      0,
    );
  });

  test("choosing a device arms desktop placement and click-to-place (#2352)", async ({
    page,
  }) => {
    const devicesBefore = await page.locator(locators.rack.device).count();

    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await page.getByTestId("command-palette-add-device").click();
    await page.getByTestId("command-palette-device-item-1u-server").click();

    // Choosing a device closes the palette and arms placement (#2214/#2352).
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).not.toBeVisible();

    // On desktop the cue now surfaces: a "Placing:" status banner mounted once
    // at the canvas level. Scope by text in case other status regions exist.
    const placementHeader = page
      .getByRole("status")
      .filter({ hasText: "Placing:" })
      .first();
    await expect(placementHeader).toBeVisible();

    // Click a valid rack slot with the mouse to complete placement.
    const rackSvg = page
      .locator(`${locators.rackView.front} ${locators.rack.svg}`)
      .first();
    const box = await rackSvg.boundingBox();
    if (!box) {
      throw new Error(
        "rackSvg boundingBox() returned null; cannot click placement target",
      );
    }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.5);

    // The device is placed and placement mode exits.
    await expect(async () => {
      const devicesAfter = await page.locator(locators.rack.device).count();
      expect(devicesAfter).toBeGreaterThan(devicesBefore);
    }).toPass({ timeout: 5000 });
    // `not.toBeVisible()` already auto-retries, so a plain assertion with a
    // timeout suffices for the post-placement settle.
    await expect(placementHeader).not.toBeVisible({ timeout: 5000 });
  });

  // --- #2399: input-row settings gear ---

  test("the settings gear opens the Settings dialog and closes the palette", async ({
    page,
  }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();

    await page.getByTestId("command-palette-settings").click();

    // dialogStore is scalar: opening "settings" replaces the palette, so the
    // palette closes and the Settings dialog takes its place.
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).not.toBeVisible();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  });

  // --- #2777: Cmd+K toggles, no-armed-row on open ---

  test("Ctrl/Cmd+K also closes the palette when it is open", async ({
    page,
  }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    // A second press toggles it closed (#2777).
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await expect(palette).not.toBeVisible();
  });

  test("Enter before typing is inert for ordinary commands (no row armed on open)", async ({
    page,
  }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await expect(page.getByTestId("command-palette-input")).toBeFocused();

    // No ORDINARY row is armed on open, so Enter before the first keystroke
    // cannot run one (#2777 decision 8). Running a command would close the
    // palette, so its staying open (with focus still in the input) is the
    // proof that no ordinary row fired. This fixture has a rack, so the one
    // deliberate exception - the persistent "Add device..." row (#2996) -
    // also arms on this same Enter; that is covered on its own next.
    await page.keyboard.press("Enter");
    await expect(palette).toBeVisible();
    await expect(page.getByTestId("command-palette-input")).toBeFocused();
  });

  // --- #2996: Add-device row is keyboard-armable; device bridge is dependable ---

  test("Enter on an empty query arms the persistent Add-device row (#106, #2996)", async ({
    page,
  }) => {
    // SMALL_RACK_SHARE provides a rack, so canAddDevice is true and the
    // "Add device..." lead row is offered. Unlike an ordinary command row, it
    // is a persistent, explicitly-labelled affordance, so Enter with an empty
    // query arms it specifically without reversing decision 8 for anything
    // else (covered by the "Enter before typing is inert" test above).
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await expect(page.getByTestId("command-palette-add-device")).toBeVisible();

    await page.keyboard.press("Enter");

    // The device sub-page opened: the back affordance and a device result
    // appear. The palette itself stays open (a run() command would have
    // closed it), proving no ordinary command fired instead.
    await expect(palette).toBeVisible();
    await expect(page.getByTestId("command-palette-device-back")).toBeVisible();
    await expect(
      page.getByTestId("command-palette-device-item-1u-server"),
    ).toBeVisible();
  });

  test("the device bridge stays available for a query that also fuzzy-matches a command, and Enter goes to the bridge, not the command (#2996)", async ({
    page,
  }) => {
    // "xserve" is the issue's own repro: it fuzzy-matches "Export all layouts"
    // via a stray character-jump (a coincidental, low-confidence hit), which
    // previously hid the device bridge entirely and let a bare Enter silently
    // fire the export command instead of surfacing a way to place a device.
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    const input = page.getByTestId("command-palette-input");
    await input.fill("xserve");

    const bridge = page.getByTestId("command-palette-create-device");
    await expect(bridge).toBeVisible();

    await page.keyboard.press("Enter");

    // Enter went to the device bridge, not "Export all layouts": the palette
    // is still open, in the device sub-page, carrying the typed query. Had the
    // export command fired instead, the palette would have closed entirely.
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
    await expect(page.getByTestId("command-palette-device-back")).toBeVisible();
    await expect(input).toHaveValue("xserve");
  });

  test("the device bridge stays available for a device-category word that also fuzzy-matches a command (#2996)", async ({
    page,
  }) => {
    // "server" fuzzy-matches "New layout from template: Media Server" (a real,
    // non-spurious interior-word hit), which previously hid the bridge
    // entirely because any match at all suppressed it. The bridge must remain
    // reachable so a common device-search word is never a dead end.
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await page.getByTestId("command-palette-input").fill("server");

    await expect(
      page.getByTestId("command-palette-create-device"),
    ).toBeVisible();
  });

  // --- #2778: search reveals unavailable commands greyed with a reason ---

  test("searching a selection verb with nothing selected reveals it greyed", async ({
    page,
  }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    // Nothing is selected, so Duplicate selection is hidden from browse but a
    // direct search must still surface it (disabled) rather than returning no
    // match (#2778).
    await page.getByTestId("command-palette-input").fill("duplicate");
    const dup = page.getByTestId("command-palette-item-duplicate-selection");
    // Revealed (not absent) even though it cannot run: browse hides it, search
    // keeps it (greyed, with a reason). The reason copy renders alongside.
    await expect(dup).toBeVisible();
    await expect(dup.getByText("select gear first")).toBeVisible();

    // A greyed row must be inert: a command row matched, so no device bridge is
    // offered, and pressing Enter runs nothing. The palette stays open in
    // command mode (a real run would have closed it; the bridge would have
    // opened device mode).
    await expect(page.getByTestId("command-palette-create-device")).toHaveCount(
      0,
    );
    await page.getByTestId("command-palette-input").press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
    await expect(page.getByTestId("command-palette-device-back")).toHaveCount(
      0,
    );
  });

  // --- #2779: no-command-match bridge to the device catalogue ---

  test("a query that matches no command offers the device bridge, pre-filled", async ({
    page,
  }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    // A query that matches no command surfaces the "Add a device called ..."
    // bridge instead of a dead end (#2779).
    await page.getByTestId("command-palette-input").fill("zzzqqq");
    const bridge = page.getByTestId("command-palette-create-device");
    await expect(bridge).toBeVisible();

    // Selecting it enters device search pre-filled with the typed query, so the
    // device sub-page opens carrying "zzzqqq" (which matches no device).
    await bridge.click();
    await expect(page.getByTestId("command-palette-device-back")).toBeVisible();
    await expect(page.getByTestId("command-palette-input")).toHaveValue(
      "zzzqqq",
    );
    await expect(
      page.getByTestId("command-palette-device-empty"),
    ).toBeVisible();
  });

  test("Escape in the device sub-mode returns to commands before closing", async ({
    page,
  }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await page.getByTestId("command-palette-add-device").click();
    await expect(page.getByTestId("command-palette-device-back")).toBeVisible();

    // First Escape pops the device sub-page back to the command list (#2779).
    await page.keyboard.press("Escape");
    await expect(
      page.getByTestId("command-palette-item-fit-all"),
    ).toBeVisible();
    await expect(page.getByTestId("command-palette-device-back")).toHaveCount(
      0,
    );

    // A second Escape closes the palette.
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).not.toBeVisible();
  });
});
