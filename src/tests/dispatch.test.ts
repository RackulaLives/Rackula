import { describe, it, expect, vi, afterEach } from "vitest";
import { createActionDispatch } from "$lib/actions/dispatch";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import * as layoutStore from "$lib/stores/layout.svelte";
import * as appActions from "$lib/utils/app-actions";
import * as storage from "$lib/storage";
import { registerImportDevicesTrigger } from "$lib/actions/import-devices-trigger";
import { registerRestoreFromFileTrigger } from "$lib/actions/restore-file-trigger";
import * as dialogActions from "$lib/utils/dialog-actions";

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

  // create-rack (#2995, R13): adds a rack to the current layout via the same
  // handleNewRack the "+" toolbar control and the mobile Racks sheet use, so
  // the palette gains an "add a rack" command reachable by typing "rack".
  it("calls handleNewRack when create-rack runs", () => {
    const spy = vi
      .spyOn(dialogActions, "handleNewRack")
      .mockReturnValue(undefined);
    const dispatch = createActionDispatch();
    dispatch["create-rack"]();
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

  // new-layout replaces the working copy, so it confirms first when the current
  // layout is not durably persisted. The guard is storage-mode aware (#2801): in
  // server mode it keys on isDirty (edits not yet saved to the server), in
  // file/browser mode on changesSinceExport (edits not yet in any exported
  // file). shouldSaveToServer picks the mode, mirroring the dialog's "Save
  // First" button so the guard and the offered save never disagree.
  //
  // Wrap the real store and override only the fields under test, so the mock
  // stays a complete, type-sound LayoutStore: any other field the new-layout
  // branch might read returns the real value rather than silently being
  // undefined.
  function stubLayoutStore(overrides: {
    changesSinceExport?: number;
    isDirty?: boolean;
  }) {
    const real = layoutStore.getLayoutStore();
    const stub = new Proxy(real, {
      get(target, prop) {
        if (typeof prop === "string" && prop in overrides) {
          return overrides[prop as keyof typeof overrides];
        }
        return Reflect.get(target, prop, target);
      },
    });
    vi.spyOn(layoutStore, "getLayoutStore").mockReturnValue(stub);
  }

  function spyReset() {
    return vi
      .spyOn(appActions, "resetAndCreateNewRack")
      .mockReturnValue(undefined);
  }

  // --- server mode: key on isDirty (unsaved to the server) ---

  // The over-prompt bug this issue fixes: a server user who has saved to the
  // server (isDirty false) but never exported a file (changesSinceExport > 0)
  // must NOT be prompted, because the layout is durably persisted.
  it("new-layout resets straight away in server mode when saved to the server, even with unexported changes", () => {
    vi.spyOn(storage, "shouldSaveToServer").mockReturnValue(true);
    stubLayoutStore({ isDirty: false, changesSinceExport: 5 });
    const reset = spyReset();
    const dispatch = createActionDispatch();
    dispatch["new-layout"]();
    expect(reset).toHaveBeenCalledOnce();
    expect(dialogStore.isOpen("confirmReplace")).toBe(false);
  });

  it("new-layout confirms first in server mode when there are unsaved server changes", () => {
    vi.spyOn(storage, "shouldSaveToServer").mockReturnValue(true);
    stubLayoutStore({ isDirty: true, changesSinceExport: 0 });
    const reset = spyReset();
    const dispatch = createActionDispatch();
    dispatch["new-layout"]();
    expect(dialogStore.isOpen("confirmReplace")).toBe(true);
    expect(reset).not.toHaveBeenCalled();
  });

  // --- file/browser mode: semantics unchanged (key on changesSinceExport) ---

  it("new-layout confirms first in file mode when there are unexported changes", () => {
    vi.spyOn(storage, "shouldSaveToServer").mockReturnValue(false);
    stubLayoutStore({ changesSinceExport: 2, isDirty: true });
    const reset = spyReset();
    const dispatch = createActionDispatch();
    dispatch["new-layout"]();
    expect(dialogStore.isOpen("confirmReplace")).toBe(true);
    expect(reset).not.toHaveBeenCalled();
  });

  it("new-layout resets straight away in file mode when everything is exported, even if dirty", () => {
    vi.spyOn(storage, "shouldSaveToServer").mockReturnValue(false);
    stubLayoutStore({ changesSinceExport: 0, isDirty: true });
    const reset = spyReset();
    const dispatch = createActionDispatch();
    dispatch["new-layout"]();
    expect(reset).toHaveBeenCalledOnce();
    expect(dialogStore.isOpen("confirmReplace")).toBe(false);
  });
});
