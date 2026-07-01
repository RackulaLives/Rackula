import { describe, it, expect, vi, afterEach } from "vitest";
import { createActionDispatch } from "$lib/actions/dispatch";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import * as layoutStore from "$lib/stores/layout.svelte";
import * as appActions from "$lib/utils/app-actions";
import * as storage from "$lib/storage";
import { registerImportDevicesTrigger } from "$lib/actions/import-devices-trigger";
import { registerRestoreFromFileTrigger } from "$lib/actions/restore-file-trigger";

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

  it("runs the registered trigger when import-devices runs", () => {
    const trigger = vi.fn();
    const unregister = registerImportDevicesTrigger(trigger);
    try {
      const dispatch = createActionDispatch();
      dispatch["import-devices"]();
      expect(trigger).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
  });

  it("calls handleExportAll when export-all runs", () => {
    const spy = vi.spyOn(storage, "handleExportAll").mockResolvedValue(true);
    const dispatch = createActionDispatch();
    dispatch["export-all"]();
    expect(spy).toHaveBeenCalledOnce();
  });

  it("runs the registered trigger when restore-file runs", () => {
    const trigger = vi.fn();
    const unregister = registerRestoreFromFileTrigger(trigger);
    try {
      const dispatch = createActionDispatch();
      dispatch["restore-file"]();
      expect(trigger).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
  });

  // new-layout replaces the working copy. When there are changes not yet in any
  // exported file it must confirm first (the shared confirmReplace dialog),
  // mirroring restore-file; a backed-up copy resets straight away (#2775).
  // Wrap the real store and override only changesSinceExport, so the mock stays
  // a complete, type-sound LayoutStore: any other field the new-layout branch
  // might read returns the real value rather than silently being undefined.
  function stubLayoutChangesSinceExport(value: number) {
    const real = layoutStore.getLayoutStore();
    const stub = new Proxy(real, {
      get(target, prop) {
        if (prop === "changesSinceExport") return value;
        return Reflect.get(target, prop, target);
      },
    });
    vi.spyOn(layoutStore, "getLayoutStore").mockReturnValue(stub);
  }

  it("new-layout confirms before resetting when there are unexported changes", () => {
    stubLayoutChangesSinceExport(2);
    const reset = vi
      .spyOn(appActions, "resetAndCreateNewRack")
      .mockReturnValue(undefined);
    const dispatch = createActionDispatch();
    dispatch["new-layout"]();
    expect(dialogStore.isOpen("confirmReplace")).toBe(true);
    expect(reset).not.toHaveBeenCalled();
  });

  it("new-layout resets straight away when there are no unexported changes", () => {
    stubLayoutChangesSinceExport(0);
    const reset = vi
      .spyOn(appActions, "resetAndCreateNewRack")
      .mockReturnValue(undefined);
    const dispatch = createActionDispatch();
    dispatch["new-layout"]();
    expect(reset).toHaveBeenCalledOnce();
    expect(dialogStore.isOpen("confirmReplace")).toBe(false);
  });
});
