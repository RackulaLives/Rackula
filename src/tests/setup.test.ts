import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import App from "../App.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";

describe("Setup", () => {
  it("vitest is configured correctly", () => {
    expect(true).toBe(true);
  });

  it("can import Svelte component", async () => {
    // This test verifies that Svelte component imports work correctly
    expect(App).toBeDefined();
  });

  it("Ctrl+K opens the command palette from the rendered app", async () => {
    render(App);
    // App renders KeyboardHandler which attaches a window keydown listener.
    // The palette shortcut fires before shouldIgnoreKeyboard so it works
    // from any focus state.
    await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(dialogStore.isOpen("commandPalette")).toBe(true);
  }, 60000); // App component is slow to render due to complex component tree

  afterEach(() => {
    dialogStore.close();
  });
});
