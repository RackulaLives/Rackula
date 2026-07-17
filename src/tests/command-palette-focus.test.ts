import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/svelte";
import App from "../App.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetPaletteRecents } from "$lib/stores/palette-recents.svelte";
import * as dispatchModule from "$lib/actions/dispatch";

// #2997 fix round 1 (Finding 1): the Export command's dispatch is async -
// maybeExport -> handleExport awaits QR-code generation BEFORE calling
// dialogStore.open("export") - so the back-off guard has to still be correct
// well after the palette itself has already closed. generateQRCode is
// mocked with a real macrotask delay (not just an extra microtask/frame) so
// a fix that only covers a single deferred tick would still fail the async
// test below exactly the way the pre-fix guard did.
vi.mock("$lib/utils/qrcode", () => ({
  generateQRCode: () =>
    new Promise<string>((resolve) => {
      setTimeout(() => resolve("data:image/png;base64,"), 50);
    }),
  canFitInQR: () => true,
  QR_MIN_PRINT_CM: 4,
}));

/**
 * #2997: focus must never fall to document.body after a palette action
 * completes. Opening the palette via the global Ctrl/Cmd+K shortcut leaves
 * bits-ui's own close-auto-focus with nothing but body captured as the
 * pre-open focus (KeyboardHandler's toggle never focuses an element first,
 * unlike the pill's own mouse click), so its default restore-on-close is a
 * no-op and the removed input's focus falls through to body. Renders the
 * full App (like setup.test.ts) so Toolbar, KeyboardHandler, and
 * DialogOrchestrator are wired together exactly as in production - the bug
 * only reproduces with the real global shortcut path, not by opening
 * CommandPalette in isolation.
 *
 * Fix round 1 adds coverage for the back-off branch itself (Finding 2): a
 * command that opens another dialog/sheet must leave focus there, not steal
 * it to the pill, whether that dialog opens synchronously (Settings) or
 * asynchronously (Export, gated on the mocked QR-code generation above). The
 * guard now awaits the settled outcome of the dispatched command (a Promise
 * microtask chain over lastDispatchOutcome, not a fixed timer) and re-checks
 * live dialog/sheet state before focusing, so the four pre-existing tests
 * below use waitFor to absorb that settling instead of asserting the pill
 * has focus in the same tick as the close.
 */
describe("Command palette focus restoration (#2997)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    // Recents are a module-level MRU (src/lib/stores/palette-recents.svelte.ts)
    // shared across every test in this file, not component-local state torn
    // down by @testing-library/svelte's cleanup(). Without resetting it here,
    // a command exercised by an earlier test (e.g. "export" in the async
    // back-off test below) reappears under the palette's "Recent" section on
    // a later test, changing its list testid from command-palette-item-{id}
    // to command-palette-recent-item-{id} out from under that later test.
    resetPaletteRecents();
    dialogStore.close();
  });

  afterEach(() => {
    dialogStore.close();
    vi.restoreAllMocks();
  });

  it("returns focus to the command pill after a Ctrl+K toggle-close", async () => {
    const { getByTestId } = render(App);

    await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(dialogStore.isOpen("commandPalette")).toBe(true);

    await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(dialogStore.isOpen("commandPalette")).toBe(false);

    // toHaveFocus() (jest-dom, imported in setup.ts) is the testing-library-
    // sanctioned way to make this assertion - it is exactly the behavioural
    // activeElement check the fix targets, without raw document Node access
    // (blocked by testing-library/no-node-access). Asserting focus IS the
    // pill is strictly stronger than "not body": it also proves the anchor
    // is the specific meaningful element the fix restores focus to. Wrapped
    // in waitFor because the guard now awaits the settled command outcome
    // (a Promise microtask chain, not a timer) and re-checks live dialog
    // state before focusing, so it can back off for an async dialog-open
    // (#2997 fix round 1, Finding 1).
    await waitFor(() => {
      expect(getByTestId("btn-command-palette")).toHaveFocus();
    });
  }, 60000);

  it("returns focus to the command pill after an Escape-close", async () => {
    const { getByTestId } = render(App);

    await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(dialogStore.isOpen("commandPalette")).toBe(true);

    // bits-ui's EscapeLayer listens on document, not window (unlike
    // KeyboardHandler's own global shortcut listener), so Escape must be
    // dispatched on document to reach it.
    await fireEvent.keyDown(document, { key: "Escape" });
    expect(dialogStore.isOpen("commandPalette")).toBe(false);

    // See the first test above for why this is wrapped in waitFor.
    await waitFor(() => {
      expect(getByTestId("btn-command-palette")).toHaveFocus();
    });
  }, 60000);

  it("returns focus to the command pill after a mouse-invoked command completes", async () => {
    const { getByTestId } = render(App);

    await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(dialogStore.isOpen("commandPalette")).toBe(true);

    // "Toggle display mode" is global-scope with no enabledWhen gate, so it is
    // always present and runnable without any extra rack/selection setup.
    await fireEvent.click(
      getByTestId("command-palette-item-toggle-display-mode"),
    );
    expect(dialogStore.isOpen("commandPalette")).toBe(false);

    // See the first test above for why this is wrapped in waitFor.
    await waitFor(() => {
      expect(getByTestId("btn-command-palette")).toHaveFocus();
    });
  }, 60000);

  it("returns focus to the command pill after a keyboard-invoked command completes", async () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const rack = layoutStore.addRack("Test Rack", 42);
    selectionStore.selectRack(rack!.id);

    const { getByTestId } = render(App);

    await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(dialogStore.isOpen("commandPalette")).toBe(true);

    const input = getByTestId("command-palette-input");
    // Typing the exact label is a confident command match (#2996), so Enter
    // runs it natively instead of routing to the device-search bridge.
    await fireEvent.input(input, { target: { value: "Duplicate selection" } });
    await fireEvent.keyDown(input, { key: "Enter" });

    expect(dialogStore.isOpen("commandPalette")).toBe(false);
    // See the first test above for why this is wrapped in waitFor.
    await waitFor(() => {
      expect(getByTestId("btn-command-palette")).toHaveFocus();
    });
  }, 60000);

  it("backs off and leaves focus in the opened dialog, not the pill, when a command opens a dialog synchronously", async () => {
    const { getByTestId } = render(App);
    const pill = getByTestId("btn-command-palette");
    // Spying on the exact element handleCloseAutoFocus queries by testid
    // (document.querySelector returns the same node) proves the guard never
    // even attempted to focus the pill - not merely that something else
    // grabbed focus back afterwards.
    const pillFocusSpy = vi.spyOn(pill, "focus");

    await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(dialogStore.isOpen("commandPalette")).toBe(true);

    // "Settings" opens dialogStore.open("settings") synchronously, with no
    // enabledWhen gate and no viewport-dependent sheet/dialog split (unlike
    // "View YAML"), so this exercises the synchronous branch of the guard -
    // the one that was already correct before this fix round.
    await fireEvent.click(getByTestId("command-palette-item-settings"));

    expect(dialogStore.isOpen("commandPalette")).toBe(false);
    expect(dialogStore.isOpen("settings")).toBe(true);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Close dialog" }),
      ).toHaveFocus();
    });
    expect(pillFocusSpy).not.toHaveBeenCalled();
  }, 60000);

  it("backs off and leaves focus in the opened dialog, not the pill, when a command opens a dialog asynchronously (Export)", async () => {
    const layoutStore = getLayoutStore();
    layoutStore.addRack("Test Rack", 42);

    const { getByTestId } = render(App);
    const pill = getByTestId("btn-command-palette");
    const pillFocusSpy = vi.spyOn(pill, "focus");

    await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(dialogStore.isOpen("commandPalette")).toBe(true);

    await fireEvent.click(getByTestId("command-palette-item-export"));

    // The palette itself closes immediately; maybeExport -> handleExport's
    // dispatch is fire-and-forget and has NOT opened the export dialog yet
    // at this instant (#2997 Finding 1) - dialogStore.open("export") only
    // runs after the mocked, artificially-delayed generateQRCode resolves.
    // This is the exact race the pre-fix guard lost: it read openDialog as
    // null here and grabbed pill focus immediately.
    expect(dialogStore.isOpen("commandPalette")).toBe(false);
    expect(dialogStore.isOpen("export")).toBe(false);

    await waitFor(() => {
      expect(dialogStore.isOpen("export")).toBe(true);
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Close dialog" }),
      ).toHaveFocus();
    });

    // The genuine assertion for Finding 1: the guard must never have grabbed
    // pill focus while waiting on the async dialog to open - not merely that
    // the dialog eventually reclaimed it after a fight-and-lose.
    expect(pillFocusSpy).not.toHaveBeenCalled();
  }, 60000);

  it("still restores focus to the pill when a command's dispatch rejects", async () => {
    const layoutStore = getLayoutStore();
    layoutStore.addRack("Test Rack", 42);

    // Swap in a dispatch map identical to the real one except "export"
    // rejects instead of ever reaching dialogStore.open("export") - the
    // guard's two no-op .then() handlers (fulfilled and rejected) exist
    // specifically to absorb an outcome like this one and still fall
    // through to focusing the pill, rather than leaving focus stranded on
    // the removed palette input. If the rejection were not absorbed here it
    // would also surface as an unhandled promise rejection and fail the
    // test run.
    const realCreateActionDispatch = dispatchModule.createActionDispatch;
    vi.spyOn(dispatchModule, "createActionDispatch").mockImplementation(() => ({
      ...realCreateActionDispatch(),
      export: () => Promise.reject(new Error("mock async command failure")),
    }));

    const { getByTestId } = render(App);

    await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(dialogStore.isOpen("commandPalette")).toBe(true);

    await fireEvent.click(getByTestId("command-palette-item-export"));

    expect(dialogStore.isOpen("commandPalette")).toBe(false);
    expect(dialogStore.isOpen("export")).toBe(false);

    await waitFor(() => {
      expect(getByTestId("btn-command-palette")).toHaveFocus();
    });
    expect(dialogStore.isOpen("export")).toBe(false);
  }, 60000);
});
