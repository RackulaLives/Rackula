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
 * Resolve the name for a newly-created default rack, appending the lowest
 * free " N" suffix when baseName collides with an existing rack's name
 * (#3002). Two default racks used to end up with the exact same name, which
 * cascaded into ambiguity downstream: the delete confirm couldn't say which
 * rack was about to die, the active-rack cycle toast was uninformative, and
 * both mobile switch dots carried an identical aria-label. Only the
 * collision case changes -- baseName itself is returned unmodified when it
 * isn't already taken, so plain direct-create naming is untouched. Existing
 * racks are read, never renamed: this only picks the new rack's own name.
 * Numbers are searched from 2 upward and the first unused one wins, so a
 * gap left by a deleted numbered rack is reused, and a name some other rack
 * already holds (however it got that name) is skipped rather than
 * collided with.
 */
function nextAvailableRackName(
  existingNames: readonly string[],
  baseName: string,
): string {
  if (!existingNames.includes(baseName)) return baseName;
  let suffix = 2;
  while (existingNames.includes(`${baseName} ${suffix}`)) {
    suffix++;
  }
  return `${baseName} ${suffix}`;
}

/**
 * Create a 24U rack directly on the canvas and select it, skipping the wizard
 * (#2732). The rack uses stage-1 defaults: width 19, ascending U-numbering, and
 * the schema default form factor. It is appended to the end of the row. Warns
 * when the rack limit is reached. The default name is disambiguated against
 * existing racks' names (#3002); see nextAvailableRackName.
 */
export function handleNewRack(): void {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const toastStore = getToastStore();
  if (!layoutStore.canAddRack) {
    toastStore.showToast("Maximum number of racks reached", "warning");
    return;
  }
  const name = nextAvailableRackName(
    layoutStore.racks.map((rack) => rack.name),
    NEW_RACK_DEFAULT_NAME,
  );
  const rack = layoutStore.addRack(name, NEW_RACK_DEFAULT_HEIGHT);
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
 * handleDelete). Acts on the rackId (or groupRackIds) snapshot captured in
 * deleteTarget at open time, not the live selectionStore, so a selection
 * change between opening the dialog and confirming it can't delete a
 * different rack than the one named in the dialog (#2918).
 */
export function handleConfirmDelete(): void {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const target = dialogStore.deleteTarget;

  if (target) {
    if (target.groupRackIds) {
      // Whole-bayed-group delete (edit panel's "Delete Bayed Rack", #2994
      // fold-in): resolve the live group from target.rackId, the documented
      // anchor rack (same #2918 pattern as the standalone branch below),
      // rather than the first entry of the groupRackIds membership snapshot
      // -- membership can change between dialog-open and confirm, so trusting
      // that snapshot to name the anchor could resolve the wrong group, or
      // none at all, while target.rackId is the one field every other branch
      // already treats as authoritative. Delete the resolved group as one
      // atomic batch. The previous per-member deleteRack() loop pushed one
      // history command per rack, so a single undo only restored the
      // last-deleted member and the loop itself passed through an invalid
      // intermediate state (a layout_preset:"bayed" group left with exactly
      // one rack_id, violating the >=2-bays invariant removeBayFromGroup
      // enforces). deleteBayedGroup batches the group deletion and every
      // member's deletion into a single BatchCommand instead (#2994 fix
      // round 2). Selection only clears once the group actually resolved and
      // deleteBayedGroup reports success; either failure mode (no live
      // group left to resolve, or deleteBayedGroup itself erroring) must
      // leave the selection and dialog target alone instead of presenting a
      // silent success with nothing selected and the group still standing.
      const group = layoutStore.getRackGroupForRack(target.rackId);
      if (group) {
        const { error } = layoutStore.deleteBayedGroup(group.id);
        if (error) {
          layoutDebug.group(
            "deleteBayedGroup failed for %s: %s",
            group.id,
            error,
          );
        } else {
          selectionStore.clearSelection();
        }
      }
    } else {
      const rackId = target.rackId;
      // A bay member removal closes the row and dissolves a 1-member bay; a
      // standalone rack deletes plainly (#2741). Same guard shape as the
      // group branch above: only clear selection once the delete actually
      // happened.
      const group = layoutStore.getRackGroupForRack(rackId);
      if (group?.layout_preset === "bayed") {
        const { error } = layoutStore.removeRackFromBay(rackId);
        if (error) {
          layoutDebug.group(
            "removeRackFromBay failed for %s: %s",
            rackId,
            error,
          );
        } else {
          selectionStore.clearSelection();
        }
      } else if (layoutStore.getRackById(rackId)) {
        layoutStore.deleteRack(rackId);
        selectionStore.clearSelection();
      }
    }
  }

  dialogStore.close();
}

/**
 * Compose the rack-delete confirm dialog's warning line. The copy used to be
 * static ("All devices in this rack will be removed") regardless of the
 * rack's actual contents, so an empty rack got the same devices-lost warning
 * as a full one. This varies the count and singular/plural wording with the
 * rack's live device count, and omits the devices clause entirely for an
 * empty rack rather than showing a false warning (#2994).
 */
export function formatRackDeleteMessage(
  name: string,
  deviceCount: number,
): string {
  const devicesClause =
    deviceCount > 0
      ? ` ${deviceCount} device${deviceCount === 1 ? "" : "s"} will be removed.`
      : "";
  return `Are you sure you want to delete "${name}"?${devicesClause}`;
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
