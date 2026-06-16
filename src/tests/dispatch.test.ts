import { describe, it, expect, afterEach } from "vitest";
import { ACTION_REGISTRY } from "$lib/actions/registry";
import { createActionDispatch } from "$lib/actions/dispatch";
import { dialogStore } from "$lib/stores/dialogs.svelte";

describe("createActionDispatch", () => {
  afterEach(() => dialogStore.close());

  it("provides a runnable entry for every registered action id", () => {
    const dispatch = createActionDispatch();
    for (const action of ACTION_REGISTRY) {
      expect(
        typeof dispatch[action.id],
        `missing dispatch entry for "${action.id}"`,
      ).toBe("function");
    }
  });

  it("opens the command palette dialog when command-palette runs", () => {
    const dispatch = createActionDispatch();
    expect(dialogStore.isOpen("commandPalette")).toBe(false);
    dispatch["command-palette"]();
    expect(dialogStore.isOpen("commandPalette")).toBe(true);
  });
});
