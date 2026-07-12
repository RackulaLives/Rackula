/**
 * Dialog-entry actions: parameterless verbs that open (or guard the opening
 * of) the app's dialogs. Each resolves its own store singletons internally so
 * a future command registry can call them as `run:` targets.
 */
import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getSelectionStore } from "$lib/stores/selection.svelte";
import { getToastStore } from "$lib/stores/toast.svelte";
import { getViewportStore } from "$lib/utils/viewport.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { handleFitAll } from "$lib/utils/app-actions";
import { layoutDebug } from "$lib/utils/debug";

/** Stage-1 default height for a directly-created rack (#2732). */
const NEW_RACK_DEFAULT_HEIGHT = 24;
/** Default name for a directly-created rack; renameable in the inspector. */
const NEW_RACK_DEFAULT_NAME = "Racky McRackface";

/**
 * Create a 24U rack directly on the canvas and select it, skipping the wizard
 * (#2732). The rack uses stage-1 defaults: width 19, ascending U-numbering, and
 * the schema default form factor. It is appended to the end of the row. Warns
 * when the rack limit is reached.
 */
export function handleNewRack(): void {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const toastStore = getToastStore();
  if (!layoutStore.canAddRack) {
    toastStore.showToast("Maximum number of racks reached", "warning");
    return;
  }
  const rack = layoutStore.addRack(
    NEW_RACK_DEFAULT_NAME,
    NEW_RACK_DEFAULT_HEIGHT,
  );
  if (!rack) return;
  selectionStore.selectRack(rack.id);
  requestAnimationFrame(() => handleFitAll());
}

/**
 * Remove the selected device or rack. A device placement is trivially
 * undoable, so it is removed immediately with an undo toast rather than
 * gated behind a confirm dialog; a rack carries a much larger blast radius
 * (every device it holds), so it still opens the confirm-delete dialog
 * (#2993). This keeps all five device-removal affordances (Delete key,
 * verb-bar trash, mobile sheet Remove, desktop context-menu Delete, edit
 * panel Remove from Rack) behaving identically, since the first three route
 * through this function.
 */
export function handleDelete(): void {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const toastStore = getToastStore();
  if (selectionStore.isRackSelected && selectionStore.selectedRackId) {
    const rack = layoutStore.getRackById(selectionStore.selectedRackId);
    if (rack) {
      dialogStore.deleteTarget = {
        type: "rack",
        name: rack.name,
        rackId: rack.id,
      };
      dialogStore.open("confirmDelete");
    }
  } else if (selectionStore.isDeviceSelected) {
    if (
      selectionStore.selectedRackId !== null &&
      selectionStore.selectedDeviceId !== null
    ) {
      const rack = layoutStore.getRackById(selectionStore.selectedRackId);
      const deviceIndex = selectionStore.getSelectedDeviceIndex(
        rack?.devices ?? [],
      );
      if (rack && deviceIndex !== null && rack.devices[deviceIndex]) {
        const name = layoutStore.removeDeviceFromRack(rack.id, deviceIndex);
        selectionStore.clearSelection();
        if (name) {
          toastStore.showUndoToast(`Removed ${name}`, () => layoutStore.undo());
        }
      }
    }
  }
}

/**
 * Apply the delete confirmed by the confirm-delete dialog. Racks are the only
 * target this dialog gates now: device removal is immediate (see
 * handleDelete). Acts on the rackId snapshot captured in deleteTarget at open
 * time, not the live selectionStore, so a selection change between opening
 * the dialog and confirming it can't delete a different rack than the one
 * named in the dialog (#2918).
 */
export function handleConfirmDelete(): void {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const target = dialogStore.deleteTarget;

  if (target) {
    const rackId = target.rackId;
    // A bay member removal closes the row and dissolves a 1-member bay; a
    // standalone rack deletes plainly (#2741).
    const group = layoutStore.getRackGroupForRack(rackId);
    if (group?.layout_preset === "bayed") {
      const { error } = layoutStore.removeRackFromBay(rackId);
      if (error) {
        layoutDebug.group("removeRackFromBay failed for %s: %s", rackId, error);
      } else {
        selectionStore.clearSelection();
      }
    } else {
      layoutStore.deleteRack(rackId);
      selectionStore.clearSelection();
    }
  }

  dialogStore.close();
}

/** Open the keyboard-shortcuts help dialog. */
export function handleHelp(): void {
  dialogStore.open("help");
}

/** Close any open sheet, then open the Add Device dialog. */
export function handleAddDevice(): void {
  dialogStore.open("addDevice");
}

/** Open the import-from-NetBox dialog. */
export function handleImportFromNetBox(): void {
  dialogStore.open("importNetBox");
}

/** Open the YAML editor as a sheet on mobile, otherwise as a dialog. */
export function handleOpenYamlEditor(): void {
  const viewportStore = getViewportStore();
  if (viewportStore.isMobile) {
    dialogStore.openSheet("yamlEditor");
    return;
  }
  dialogStore.open("yamlEditor");
}
