/**
 * Rack context-menu actions invoked from the canvas and rack list. Each
 * resolves its own store singletons internally so a future command registry
 * can call them with an event-derived rack id.
 */
import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getSelectionStore } from "$lib/stores/selection.svelte";
import { getUIStore } from "$lib/stores/ui.svelte";
import { getCanvasStore } from "$lib/stores/canvas.svelte";
import { getToastStore } from "$lib/stores/toast.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { DRAWER_WIDTH } from "$lib/constants/layout";
import { handleFitAll, prepareExportQrCode } from "./app-actions";

/**
 * Duplicate a rack, select the copy, and fit it into view on success, or
 * toast the error. Selecting the copy keeps active (sidebar) and selected
 * (canvas outline, edit panel, delete target) in sync (#3003). The sync
 * object routes the selection change through duplicateRack's command so
 * undo/redo keep selection transactionally coherent with activeRackId
 * (#3003 fix round 1): a bare selectionStore.selectRack() call after the
 * fact would leave selection dangling on the copy's id once undo deletes
 * it. The fit call is deferred a frame, mirroring handleNewRack, so a copy
 * placed beyond the viewport edge never becomes active while invisible.
 */
export function handleRackContextDuplicate(rackId: string): void {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const toastStore = getToastStore();
  const result = layoutStore.duplicateRack(rackId, {
    getSelectedRackId: () => selectionStore.selectedRackId,
    setSelectedRackId: (id) => {
      if (id) {
        selectionStore.selectRack(id);
      } else {
        selectionStore.clearSelection();
      }
    },
  });
  if (result.error) {
    toastStore.showToast(result.error, "error");
  } else if (result.rack) {
    toastStore.showToast("Rack duplicated", "success");
    requestAnimationFrame(() => handleFitAll());
  }
}

/**
 * Remove a rack via the context menu. Always opens the confirm dialog, the
 * same one every other rack-deletion affordance uses, regardless of device
 * count or bay membership. A bay member that holds gear used to gate on the
 * dialog while an empty member deleted on the spot (#2741); that split left
 * emptying a bayed group's member the one rack-deletion path with no guard at
 * all, count-independent (#2994). handleConfirmDelete resolves the bayed vs.
 * standalone branch once the user confirms.
 */
export function handleRackContextDelete(rackId: string): void {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const rack = layoutStore.getRackById(rackId);
  if (!rack) return;

  layoutStore.setActiveRack(rackId);
  selectionStore.selectRack(rackId);
  dialogStore.deleteTarget = { type: "rack", name: rack.name, rackId: rack.id };
  dialogStore.open("confirmDelete");
}

/** Open the export dialog for the given racks; warns if none are selected. */
export async function handleRackContextExport(
  rackIds: string[],
): Promise<void> {
  const toastStore = getToastStore();
  if (rackIds.length === 0) {
    toastStore.showToast("No rack to export", "warning");
    return;
  }

  await prepareExportQrCode();

  dialogStore.exportSelectedRackIds = rackIds;
  dialogStore.open("export");
}

/** Focus the canvas on the given racks, accounting for the right drawer. */
export function handleRackContextFocus(rackIds: string[]): void {
  const layoutStore = getLayoutStore();
  const uiStore = getUIStore();
  const canvasStore = getCanvasStore();
  if (rackIds.length === 0) return;
  const rightOffset = uiStore.rightDrawerOpen ? DRAWER_WIDTH : 0;
  canvasStore.focusRack(
    rackIds,
    layoutStore.racks,
    layoutStore.rack_groups,
    rightOffset,
  );
}
