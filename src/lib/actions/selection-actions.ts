/**
 * Centralized selection-aware verb handlers.
 *
 * Each function reads live selection state from the stores and acts on it.
 * They are shared by the keyboard handler, floating verb bars, and context
 * menus so all surfaces use one implementation.
 */

import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getSelectionStore } from "$lib/stores/selection.svelte";
import { getCanvasStore } from "$lib/stores/canvas.svelte";
import { getUIStore } from "$lib/stores/ui.svelte";
import { getToastStore } from "$lib/stores/toast.svelte";
import { hapticSuccess, hapticError } from "$lib/utils/haptics";
import { getRackSlotControls } from "$lib/utils/rack-row";
import { findNextValidPosition } from "$lib/utils/device-movement";
import {
  canPlaceDevice,
  findNextSlotForChild,
  isContainerChild,
} from "$lib/utils/collision";
import { findDeviceType } from "$lib/utils/device-lookup";
import { toHumanUnits } from "$lib/utils/position";
import type { DeviceFace, DeviceType, Rack } from "$lib/types";

/**
 * Move the selected device up one valid position in the rack.
 * No-op if no device is selected or if the device is a container child.
 */
export function moveSelectedDeviceUp(): void {
  _moveSelectedDevice(1);
}

/**
 * Move the selected device down one valid position in the rack.
 * No-op if no device is selected or if the device is a container child.
 */
export function moveSelectedDeviceDown(): void {
  _moveSelectedDevice(-1);
}

function _moveSelectedDevice(direction: 1 | -1): void {
  const selectionStore = getSelectionStore();
  const layoutStore = getLayoutStore();

  if (!selectionStore.isDeviceSelected) return;
  if (
    selectionStore.selectedRackId === null ||
    selectionStore.selectedDeviceId === null
  )
    return;

  const rack = layoutStore.getRackById(selectionStore.selectedRackId);
  if (!rack) return;

  const deviceIndex = selectionStore.getSelectedDeviceIndex(rack.devices);
  if (deviceIndex === null) return;

  const placedDevice = rack.devices[deviceIndex];
  if (placedDevice && isContainerChild(placedDevice)) return;

  const result = findNextValidPosition(
    rack,
    layoutStore.device_types,
    deviceIndex,
    direction,
  );

  if (result.success && result.newPosition !== null) {
    const humanPosition = toHumanUnits(result.newPosition);
    layoutStore.moveDevice(
      selectionStore.selectedRackId!,
      deviceIndex,
      humanPosition,
    );
  }
}

/**
 * The reachable next cell for a contained child within its own carrier, or null
 * when the device is not a carrier child or has nowhere else to go. Shared by
 * the slot verb's run path and its enabled predicate so the control only shows
 * when activating it would actually move the device.
 */
function nextSlotForSelectedDevice(
  rack: Rack,
  deviceTypes: DeviceType[],
  deviceIndex: number,
): { slotId: string } | null {
  const child = rack.devices[deviceIndex];
  if (!child || !child.container_id || !child.slot_id) return null;

  const childType = findDeviceType(child.device_type, deviceTypes);
  if (!childType) return null;

  const container = rack.devices.find((d) => d.id === child.container_id);
  if (!container) return null;
  const containerType = findDeviceType(container.device_type, deviceTypes);
  if (!containerType) return null;

  const siblings = rack.devices.filter(
    (d) => d.container_id === container.id && d.id !== child.id,
  );

  return findNextSlotForChild(
    containerType,
    childType,
    child.slot_id,
    siblings,
  );
}

/**
 * Whether the selected device is a contained child that can shuffle to another
 * cell of its carrier. Drives the slot verb's enabledWhen so the control is
 * hidden for full-width devices and single-cell carriers (#2322).
 */
export function canMoveSelectedDeviceSlot(): boolean {
  const selectionStore = getSelectionStore();
  const layoutStore = getLayoutStore();

  if (!selectionStore.isDeviceSelected) return false;
  if (selectionStore.selectedRackId === null) return false;

  const rack = layoutStore.getRackById(selectionStore.selectedRackId);
  if (!rack) return false;

  const deviceIndex = selectionStore.getSelectedDeviceIndex(rack.devices);
  if (deviceIndex === null) return false;

  return (
    nextSlotForSelectedDevice(rack, layoutStore.device_types, deviceIndex) !==
    null
  );
}

/**
 * Move the selected contained child to the next free cell of its carrier.
 * No-op when no device is selected, the device is not a carrier child, or the
 * carrier has no other reachable cell.
 */
export function moveSelectedDeviceToSlot(): void {
  const selectionStore = getSelectionStore();
  const layoutStore = getLayoutStore();

  if (!selectionStore.isDeviceSelected) return;
  if (selectionStore.selectedRackId === null) return;

  const rack = layoutStore.getRackById(selectionStore.selectedRackId);
  if (!rack) return;

  const deviceIndex = selectionStore.getSelectedDeviceIndex(rack.devices);
  if (deviceIndex === null) return;

  layoutStore.moveDeviceToSlot(selectionStore.selectedRackId, deviceIndex);
}

/**
 * Reorder the selected rack (or bayed group) one slot left or right in the
 * canvas row. A group moves as a unit, since its active member carries the
 * selection's rack id. No-op unless a rack or group is selected. Routed through
 * the layout store so undo/redo covers it. Shared by the verb bar (#2822).
 */
export function moveSelectedRack(direction: "left" | "right"): void {
  const selectionStore = getSelectionStore();
  const layoutStore = getLayoutStore();

  if (!selectionStore.isRackSelected && !selectionStore.isGroupSelected) return;
  const id = selectionStore.selectedRackId;
  if (!id) return;

  layoutStore.moveRackInRow(id, direction);
}

/**
 * Create a bay from a standalone rack, or extend an existing bay, from the
 * given source rack. The new member inherits the source's width, form factor,
 * and height. On success it selects the resulting bay and keeps it on screen
 * with a minimal ensure-visible camera move (#2825); on failure it surfaces a
 * toast. Shared by the verb bar (#2822) and the edge-drag grip so both baying
 * paths behave identically.
 */
export function bayRack(sourceRackId: string): void {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const canvasStore = getCanvasStore();
  const toastStore = getToastStore();

  const result = layoutStore.createBayedRack(sourceRackId);
  if (result.error || !result.groupId) {
    hapticError();
    toastStore.showToast(
      result.error ?? "Can't bay this rack",
      "warning",
      3000,
    );
    return;
  }
  hapticSuccess();
  // Select the resulting bay so its bay-level affordances surface at once.
  layoutStore.setActiveRack(sourceRackId);
  selectionStore.selectGroup(result.groupId, sourceRackId);
  // Direct-manipulation commit: keep the bay group (including the new member)
  // on screen with minimal camera movement. Passing the group's rack_ids
  // resolves to the whole group's extent so the new member ends up visible.
  const group = layoutStore.getRackGroupById(result.groupId);
  if (group) {
    canvasStore.ensureRacksVisible(
      group.rack_ids,
      layoutStore.racks,
      layoutStore.rack_groups,
    );
  }
}

/**
 * Bay the current selection: resolve the bay source for the selected rack or
 * group (an empty standalone rack bays itself; a bayed group extends from its
 * active member) and run bayRack on it. No-op unless the bayed-racks setting is
 * on, a rack or group is selected, and that slot offers a bay source. Shared by
 * the verb bar's bay action and the dispatch spine so both gate baying the same
 * way as the edge grip.
 */
export function baySelectedRack(): void {
  const selectionStore = getSelectionStore();
  const layoutStore = getLayoutStore();
  const uiStore = getUIStore();

  if (!uiStore.enableBayedRacks) return;
  if (!selectionStore.isRackSelected && !selectionStore.isGroupSelected) return;

  const { baySource } = getRackSlotControls(
    layoutStore.racks,
    layoutStore.rack_groups,
    selectionStore.selectedRackId,
    layoutStore.activeRackId,
  );
  if (baySource) bayRack(baySource);
}

/**
 * Duplicate the currently selected item (device takes priority over rack).
 * No-op if nothing is selected.
 */
export function duplicateSelection(): void {
  const selectionStore = getSelectionStore();
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();

  if (
    selectionStore.isDeviceSelected &&
    selectionStore.selectedRackId &&
    selectionStore.selectedDeviceId
  ) {
    const rack = layoutStore.getRackById(selectionStore.selectedRackId);
    if (!rack) return;

    const deviceIndex = selectionStore.getSelectedDeviceIndex(rack.devices);
    if (deviceIndex === null) return;

    const result = layoutStore.duplicateDevice(
      selectionStore.selectedRackId,
      deviceIndex,
    );
    if (result.error) {
      toastStore.showToast(result.error, "error");
    } else if (result.device) {
      // Keep the verb bar anchored to the same view the original was selected in
      // (#2646); the duplicate shares the original's face.
      selectionStore.selectDevice(
        selectionStore.selectedRackId,
        result.device.id,
        selectionStore.selectedDeviceFace ?? undefined,
      );
      toastStore.showToast("Device duplicated", "success");
    }
    return;
  }

  if (selectionStore.isRackSelected && selectionStore.selectedRackId) {
    const result = layoutStore.duplicateRack(selectionStore.selectedRackId);
    if (result.error) {
      toastStore.showToast(result.error, "error");
    } else if (result.rack) {
      toastStore.showToast("Rack duplicated", "success");
    }
  }
}

/**
 * Toggle a placed device's mounting face between "front" and "rear". Only
 * "rear" flips to "front"; every other value (a missing face, "front", or
 * "both") flips to "rear".
 *
 * Validates the target face is clear (matching the edit panel's face change)
 * and leaves container children untouched, since their face is inherited from
 * the parent container. Shared by the verb bar (selection) and the device
 * context menu (right-clicked target), so all flip surfaces behave the same.
 */
export function flipDeviceFaceAt(
  layoutStore: ReturnType<typeof getLayoutStore>,
  toastStore: ReturnType<typeof getToastStore>,
  rackId: string,
  deviceIndex: number,
): void {
  const rack = layoutStore.getRackById(rackId);
  if (!rack) return;

  const placedDevice = rack.devices[deviceIndex];
  if (!placedDevice) return;
  if (isContainerChild(placedDevice)) return;

  const deviceType = layoutStore.device_types.find(
    (d) => d.slug === placedDevice.device_type,
  );
  if (!deviceType) return;

  const currentFace = placedDevice.face ?? "front";
  const newFace: DeviceFace = currentFace === "rear" ? "front" : "rear";

  if (
    !canPlaceDevice(
      rack,
      layoutStore.device_types,
      deviceType.u_height,
      placedDevice.position,
      deviceIndex,
      newFace,
    )
  ) {
    toastStore.showToast(
      `Cannot flip to ${newFace}: the face is blocked`,
      "error",
    );
    return;
  }

  layoutStore.updateDeviceFace(rackId, deviceIndex, newFace);
  toastStore.showToast(`Flipped to ${newFace}`, "success");
}

/**
 * Flip the currently selected device's face. No-op if no device is selected.
 */
export function flipSelectedDeviceFace(): void {
  const selectionStore = getSelectionStore();
  const layoutStore = getLayoutStore();

  if (!selectionStore.isDeviceSelected) return;
  if (
    selectionStore.selectedRackId === null ||
    selectionStore.selectedDeviceId === null
  )
    return;

  const rack = layoutStore.getRackById(selectionStore.selectedRackId);
  if (!rack) return;

  const deviceIndex = selectionStore.getSelectedDeviceIndex(rack.devices);
  if (deviceIndex === null) return;

  flipDeviceFaceAt(
    layoutStore,
    getToastStore(),
    selectionStore.selectedRackId,
    deviceIndex,
  );
}
