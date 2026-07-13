import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import App from "../App.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";

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
 */
describe("Command palette focus restoration (#2997)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    dialogStore.close();
  });

  afterEach(() => {
    dialogStore.close();
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
    // is the specific meaningful element the fix restores focus to.
    expect(getByTestId("btn-command-palette")).toHaveFocus();
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

    // toHaveFocus() (jest-dom, imported in setup.ts) is the testing-library-
    // sanctioned way to make this assertion - it is exactly the behavioural
    // activeElement check the fix targets, without raw document Node access
    // (blocked by testing-library/no-node-access). Asserting focus IS the
    // pill is strictly stronger than "not body": it also proves the anchor
    // is the specific meaningful element the fix restores focus to.
    expect(getByTestId("btn-command-palette")).toHaveFocus();
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

    // toHaveFocus() (jest-dom, imported in setup.ts) is the testing-library-
    // sanctioned way to make this assertion - it is exactly the behavioural
    // activeElement check the fix targets, without raw document Node access
    // (blocked by testing-library/no-node-access). Asserting focus IS the
    // pill is strictly stronger than "not body": it also proves the anchor
    // is the specific meaningful element the fix restores focus to.
    expect(getByTestId("btn-command-palette")).toHaveFocus();
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
    // toHaveFocus() (jest-dom, imported in setup.ts) is the testing-library-
    // sanctioned way to make this assertion - it is exactly the behavioural
    // activeElement check the fix targets, without raw document Node access
    // (blocked by testing-library/no-node-access). Asserting focus IS the
    // pill is strictly stronger than "not body": it also proves the anchor
    // is the specific meaningful element the fix restores focus to.
    expect(getByTestId("btn-command-palette")).toHaveFocus();
  }, 60000);
});
