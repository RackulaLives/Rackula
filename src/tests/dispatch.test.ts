import { describe, it, expect, vi, afterEach } from "vitest";
import { createActionDispatch } from "$lib/actions/dispatch";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import * as appActions from "$lib/utils/app-actions";

describe("createActionDispatch", () => {
  afterEach(() => {
    dialogStore.close();
    vi.restoreAllMocks();
  });

  it("opens the command palette dialog when command-palette runs", () => {
    const dispatch = createActionDispatch();
    expect(dialogStore.isOpen("commandPalette")).toBe(false);
    dispatch["command-palette"]();
    expect(dialogStore.isOpen("commandPalette")).toBe(true);
  });

  it("calls maybeSave when save runs", () => {
    const spy = vi.spyOn(appActions, "maybeSave").mockReturnValue(undefined);
    const dispatch = createActionDispatch();
    dispatch["save"]();
    expect(spy).toHaveBeenCalledOnce();
  });

  it("calls handleFitAll when fit-all runs", () => {
    const spy = vi.spyOn(appActions, "handleFitAll").mockReturnValue(undefined);
    const dispatch = createActionDispatch();
    dispatch["fit-all"]();
    expect(spy).toHaveBeenCalledOnce();
  });
});
