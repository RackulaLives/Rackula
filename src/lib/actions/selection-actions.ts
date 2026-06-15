/**
 * Centralized selection-aware verb handlers.
 *
 * Each function reads live selection state from the stores and acts on it.
 * They are shared by the keyboard handler, floating verb bars, and context
 * menus so all surfaces use one implementation.
 */

import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getSelectionStore } from "$lib/stores/selection.svelte";
import { getToastStore } from "$lib/stores/toast.svelte";
import { findNextValidPosition } from "$lib/utils/device-movement";
import { isContainerChild } from "$lib/utils/collision";
import { toHumanUnits } from "$lib/utils/position";
import type { DeviceFace } from "$lib/types";

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
      selectionStore.selectDevice(
        selectionStore.selectedRackId,
        result.device.id,
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
 * Toggle the selected device's mounting face between "front" and "rear".
 * Only "rear" flips to "front"; every other value (a missing face, "front",
 * or "both") flips to "rear". No-op if no device is selected.
 */
export function flipSelectedDeviceFace(): void {
  const selectionStore = getSelectionStore();
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();

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
  if (!placedDevice) return;

  const currentFace = placedDevice.face ?? "front";
  const newFace: DeviceFace = currentFace === "rear" ? "front" : "rear";

  layoutStore.updateDeviceFace(
    selectionStore.selectedRackId!,
    deviceIndex,
    newFace,
  );

  toastStore.showToast(`Flipped to ${newFace}`, "success");
}
