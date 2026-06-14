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

/** Duplicate a rack, then fit all on success or toast the error. */
export function handleRackContextDuplicate(rackId: string): void {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  const result = layoutStore.duplicateRack(rackId);
  if (result.error) {
    toastStore.showToast(result.error, "error");
  } else {
    toastStore.showToast("Rack duplicated", "success");
    handleFitAll();
  }
}

/** Select a rack and open the confirm-delete dialog targeting it. */
export function handleRackContextDelete(rackId: string): void {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const rack = layoutStore.getRackById(rackId);
  if (rack) {
    layoutStore.setActiveRack(rackId);
    selectionStore.selectRack(rackId);
    dialogStore.deleteTarget = { type: "rack", name: rack.name };
    dialogStore.open("confirmDelete");
  }
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
