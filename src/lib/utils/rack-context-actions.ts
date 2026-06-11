/**
 * Rack Context Menu Actions
 * Factory for context menu handlers, extracted from Rack.svelte.
 */

import type { Rack as RackType, DeviceType } from "$lib/types";
import type { getLayoutStore } from "$lib/stores/layout.svelte";
import type { getSelectionStore } from "$lib/stores/selection.svelte";
import type { getToastStore } from "$lib/stores/toast.svelte";
import { toHumanUnits, toInternalUnits } from "$lib/utils/position";
import { canPlaceDevice } from "$lib/utils/collision";

/** Identifies a right-clicked device and the screen position for the context menu. */
export interface ContextMenuTarget {
  rackId: string;
  deviceIndex: number;
  /** Screen X coordinate for menu positioning. */
  x: number;
  /** Screen Y coordinate for menu positioning. */
  y: number;
}

/** Actions available from the rack device context menu. */
export interface RackContextActions {
  /** Select the device for editing in the side panel. */
  handleEdit(rack: RackType, target: ContextMenuTarget): void;
  /** Duplicate the device at the next available position. */
  handleDuplicate(rack: RackType, target: ContextMenuTarget): void;
  /** Move the device one U-position upward. */
  handleMoveUp(
    rack: RackType,
    deviceLibrary: DeviceType[],
    target: ContextMenuTarget,
  ): void;
  /** Move the device one U-position downward. */
  handleMoveDown(rack: RackType, target: ContextMenuTarget): void;
  /** Remove the device from the rack. */
  handleDelete(target: ContextMenuTarget): void;
  /** Whether the device can move up (checks bounds and collisions). */
  getCanMoveUp(
    rack: RackType,
    deviceLibrary: DeviceType[],
    deviceIndex: number,
  ): boolean;
  /** Whether the device can move down (checks bounds and collisions). */
  getCanMoveDown(
    rack: RackType,
    deviceLibrary: DeviceType[],
    deviceIndex: number,
  ): boolean;
}

/**
 * Create context menu action handlers bound to the given stores.
 * Returns an object implementing {@link RackContextActions}.
 */
export function createContextMenuActions(
  layoutStore: ReturnType<typeof getLayoutStore>,
  selectionStore: ReturnType<typeof getSelectionStore>,
  toastStore: ReturnType<typeof getToastStore>,
): RackContextActions {
  function handleEdit(rack: RackType, target: ContextMenuTarget): void {
    const device = rack.devices[target.deviceIndex];
    if (device) {
      selectionStore.selectDevice(target.rackId, device.id);
    }
  }

  function handleDuplicate(_rack: RackType, target: ContextMenuTarget): void {
    const { rackId, deviceIndex } = target;
    const result = layoutStore.duplicateDevice(rackId, deviceIndex);
    if (result.error) {
      toastStore.showToast(result.error, "error");
    } else if (result.device) {
      selectionStore.selectDevice(rackId, result.device.id);
      toastStore.showToast("Device duplicated", "success");
    }
  }

  function handleMoveUp(
    rack: RackType,
    deviceLibrary: DeviceType[],
    target: ContextMenuTarget,
  ): void {
    const device = rack.devices[target.deviceIndex];
    if (!device) return;

    const deviceType = deviceLibrary.find((d) => d.slug === device.device_type);
    if (!deviceType) return;

    const currentPositionU = toHumanUnits(device.position);
    const newPositionU = currentPositionU + 1;
    layoutStore.moveDevice(rack.id, target.deviceIndex, newPositionU);
  }

  function handleMoveDown(rack: RackType, target: ContextMenuTarget): void {
    const device = rack.devices[target.deviceIndex];
    if (!device) return;

    const currentPositionU = toHumanUnits(device.position);
    const newPositionU = currentPositionU - 1;
    if (newPositionU >= 1) {
      layoutStore.moveDevice(rack.id, target.deviceIndex, newPositionU);
    }
  }

  function handleDelete(target: ContextMenuTarget): void {
    layoutStore.removeDeviceFromRack(target.rackId, target.deviceIndex);
    selectionStore.clearSelection();
  }

  function getCanMoveUp(
    rack: RackType,
    deviceLibrary: DeviceType[],
    deviceIndex: number,
  ): boolean {
    const device = rack.devices[deviceIndex];
    if (!device) return false;
    const deviceType = deviceLibrary.find((d) => d.slug === device.device_type);
    if (!deviceType) return false;
    const currentPositionU = toHumanUnits(device.position);
    const targetPositionInternal = toInternalUnits(currentPositionU + 1);
    return canPlaceDevice(
      rack,
      deviceLibrary,
      deviceType.u_height,
      targetPositionInternal,
      deviceIndex,
      device.face,
      device.slot_position ?? "full",
    );
  }

  function getCanMoveDown(
    rack: RackType,
    deviceLibrary: DeviceType[],
    deviceIndex: number,
  ): boolean {
    const device = rack.devices[deviceIndex];
    if (!device) return false;
    const deviceType = deviceLibrary.find((d) => d.slug === device.device_type);
    if (!deviceType) return false;
    const currentPositionU = toHumanUnits(device.position);
    const targetPositionInternal = toInternalUnits(currentPositionU - 1);
    return canPlaceDevice(
      rack,
      deviceLibrary,
      deviceType.u_height,
      targetPositionInternal,
      deviceIndex,
      device.face,
      device.slot_position ?? "full",
    );
  }

  return {
    handleEdit,
    handleDuplicate,
    handleMoveUp,
    handleMoveDown,
    handleDelete,
    getCanMoveUp,
    getCanMoveDown,
  };
}
