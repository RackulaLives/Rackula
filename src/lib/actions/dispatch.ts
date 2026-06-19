/**
 * The single dispatch spine: maps every registry ActionId to the closure that
 * runs it in this app. Both the keyboard handler and the command palette consume
 * this one map so a command runs identically however it is invoked.
 *
 * Stores and app-level action functions are module singletons (getLayoutStore,
 * maybeSave, handleHelp, ...), so this module resolves them internally and takes
 * no arguments - mirroring selection-actions.ts and dialog-actions.ts.
 *
 * Adaptation notes (differences from plan vs actual API):
 * - handleRackContextFocus and handleRackContextExport take string[] (not string);
 *   closures wrap selectedRackId in an array.
 * - handleLoad is imported from $lib/storage (re-exported from storage/index.ts).
 * - toggle-display-mode replicates App.handleToggleDisplayMode inline (no singleton).
 */
import { getActionById, type ActionId } from "$lib/actions/registry";
import { matchesShortcut } from "$lib/utils/keyboard";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getSelectionStore } from "$lib/stores/selection.svelte";
import { getUIStore } from "$lib/stores/ui.svelte";
import { getToastStore } from "$lib/stores/toast.svelte";
import { getPlacementStore } from "$lib/stores/placement.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import {
  moveSelectedDeviceUp,
  moveSelectedDeviceDown,
  moveSelectedDeviceToSlot,
  duplicateSelection,
  flipSelectedDeviceFace,
} from "$lib/actions/selection-actions";
import {
  maybeSave,
  maybeSaveAs,
  maybeExport,
  handleShare,
  handleFitAll,
  resetAndOpenNewRack,
} from "$lib/utils/app-actions";
import {
  handleDelete,
  handleHelp,
  handleAddDevice,
  handleImportFromNetBox,
  handleOpenYamlEditor,
} from "$lib/utils/dialog-actions";
import {
  handleRackContextFocus,
  handleRackContextExport,
} from "$lib/utils/rack-actions";
import { handleLoad } from "$lib/storage";
import { runImportDevices } from "$lib/actions/import-devices-trigger";

export type ActionDispatch = Record<ActionId, () => void>;

/** True when the event matches any command-palette binding (Ctrl/Cmd+K). */
export function isCommandPaletteShortcut(event: KeyboardEvent): boolean {
  const action = getActionById("command-palette");
  if (!action) return false;
  return action.bindings.some((b) =>
    matchesShortcut(event, {
      key: b.key,
      ctrl: b.ctrl,
      meta: b.meta,
      shift: b.shift,
      action: () => {},
    }),
  );
}

function performUndo(): void {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  if (!layoutStore.canUndo) return;
  const desc = layoutStore.undoDescription?.replace("Undo: ", "") ?? "action";
  layoutStore.undo();
  toastStore.showToast(`Undid: ${desc}`, "info");
}

function performRedo(): void {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  if (!layoutStore.canRedo) return;
  const desc = layoutStore.redoDescription?.replace("Redo: ", "") ?? "action";
  layoutStore.redo();
  toastStore.showToast(`Redid: ${desc}`, "info");
}

function handleEscape(): void {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const uiStore = getUIStore();
  const placementStore = getPlacementStore();
  if (placementStore.isPlacing) {
    placementStore.cancelPlacement();
    handleFitAll();
    return;
  }
  // Close any open mobile sheet before clearing selection so Escape gives the
  // user a progressive exit: sheet first, then selection. Clear selection at
  // the same time so the device-details $effect in DialogOrchestrator (which
  // auto-opens that sheet whenever a device is selected on mobile) does not
  // immediately reopen the sheet we just closed.
  if (dialogStore.currentSheet !== null) {
    dialogStore.closeSheet();
    selectionStore.clearSelection();
    return;
  }
  selectionStore.clearSelection();
  layoutStore.setActiveRack(null);
  uiStore.closeLeftDrawer();
  uiStore.closeRightDrawer();
}

function cycleActiveRack(direction: -1 | 1): void {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const toastStore = getToastStore();
  const racks = layoutStore.racks;
  if (racks.length === 0) return;
  const currentId = layoutStore.activeRackId;
  const currentIndex = currentId
    ? racks.findIndex((r) => r.id === currentId)
    : -1;
  let newIndex: number;
  if (currentIndex === -1) {
    newIndex = direction === 1 ? 0 : racks.length - 1;
  } else {
    newIndex = (currentIndex + direction + racks.length) % racks.length;
  }
  const newRack = racks[newIndex];
  if (!newRack) return;
  if (newRack.id === currentId) return;
  layoutStore.setActiveRack(newRack.id);
  selectionStore.selectRack(newRack.id);
  toastStore.showToast(`Active: ${newRack.name}`, "info");
}

function handleToggleDisplayMode(): void {
  const uiStore = getUIStore();
  const layoutStore = getLayoutStore();
  uiStore.toggleDisplayMode();
  layoutStore.updateDisplayMode(uiStore.displayMode);
  layoutStore.updateShowLabelsOnImages(uiStore.showLabelsOnImages);
}

/**
 * Build the dispatch map. Every ActionId has an entry so the map is total.
 */
export function createActionDispatch(): ActionDispatch {
  return {
    // global
    escape: handleEscape,
    "show-help": handleHelp,
    settings: () => dialogStore.open("settings"),
    "toggle-sidebar": () => getUIStore().toggleLeftDrawer(),
    undo: performUndo,
    redo: performRedo,
    save: maybeSave,
    "save-as": maybeSaveAs,
    "export-backup": maybeSaveAs,
    export: maybeExport,
    share: handleShare,
    load: handleLoad,
    "view-yaml": handleOpenYamlEditor,
    "new-layout": resetAndOpenNewRack,
    "import-devices": runImportDevices,
    "import-netbox": handleImportFromNetBox,
    "new-custom-device": handleAddDevice,
    "command-palette": () => dialogStore.open("commandPalette"),
    // layout
    "fit-all": handleFitAll,
    "toggle-display-mode": handleToggleDisplayMode,
    "toggle-annotations": () => getUIStore().toggleAnnotations(),
    "cycle-rack-prev": () => cycleActiveRack(-1),
    "cycle-rack-next": () => cycleActiveRack(1),
    // selection — each mutation verb checks readOnly so keyboard shortcuts
    // and the command palette respect the lock without per-call-site guards.
    "delete-selection": () => {
      if (getUIStore().readOnly) return;
      handleDelete();
    },
    "move-device-up": () => {
      if (getUIStore().readOnly) return;
      moveSelectedDeviceUp();
    },
    "move-device-down": () => {
      if (getUIStore().readOnly) return;
      moveSelectedDeviceDown();
    },
    "move-device-slot": () => {
      if (getUIStore().readOnly) return;
      moveSelectedDeviceToSlot();
    },
    "duplicate-selection": () => {
      if (getUIStore().readOnly) return;
      duplicateSelection();
    },
    "flip-device-face": () => {
      if (getUIStore().readOnly) return;
      flipSelectedDeviceFace();
    },
    // rack-actions take string[] not string; wrap selectedRackId in array
    "focus-rack": () => {
      const id = getSelectionStore().selectedRackId;
      if (id) handleRackContextFocus([id]);
    },
    "export-rack": () => {
      const id = getSelectionStore().selectedRackId;
      if (id) handleRackContextExport([id]);
    },
  };
}
