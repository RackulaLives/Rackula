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

/** Open the confirm-delete dialog for the selected rack or device. */
export function handleDelete(): void {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  if (selectionStore.isRackSelected && selectionStore.selectedRackId) {
    const rack = layoutStore.getRackById(selectionStore.selectedRackId);
    if (rack) {
      dialogStore.deleteTarget = { type: "rack", name: rack.name };
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
        const device = rack.devices[deviceIndex];
        const deviceDef = layoutStore.device_types.find(
          (d) => d.slug === device?.device_type,
        );
        dialogStore.deleteTarget = {
          type: "device",
          name: deviceDef?.model ?? deviceDef?.slug ?? "Device",
        };
        dialogStore.open("confirmDelete");
      }
    }
  }
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
