import { describe, it, expect, vi, afterEach } from "vitest";
import { createActionDispatch } from "$lib/actions/dispatch";
import { dialogStore } from "$lib/stores/dialogs.svelte";
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
});
