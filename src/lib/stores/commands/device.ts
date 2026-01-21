/**
 * Device Commands for Undo/Redo
 */

import type { Command } from "./types";
import type { PlacedDevice, DeviceFace, SlotPosition } from "$lib/types";

/**
 * Interface for layout store operations needed by device commands
 */
export interface DeviceCommandStore {
  placeDeviceRaw(device: PlacedDevice): number;
  removeDeviceAtIndexRaw(index: number): PlacedDevice | undefined;
  moveDeviceRaw(index: number, newPosition: number): boolean;
  updateDeviceFaceRaw(index: number, face: DeviceFace): void;
  updateDeviceNameRaw(index: number, name: string | undefined): void;
  updateDevicePlacementImageRaw(
    index: number,
    face: "front" | "rear",
    filename: string | undefined,
  ): void;
  updateDeviceColourRaw(index: number, colour: string | undefined): void;
  updateDeviceSlotPositionRaw(index: number, slotPosition: SlotPosition): void;
  getDeviceAtIndex(index: number): PlacedDevice | undefined;
}

/**
 * Create a command to place a device
 */
export function createPlaceDeviceCommand(
  device: PlacedDevice,
  store: DeviceCommandStore,
  deviceName: string = "device",
): Command {
  let placedIndex: number = -1;

  return {
    type: "PLACE_DEVICE",
    description: `Place ${deviceName}`,
    timestamp: Date.now(),
    execute() {
      placedIndex = store.placeDeviceRaw(device);
    },
    undo() {
      if (placedIndex >= 0) {
        store.removeDeviceAtIndexRaw(placedIndex);
      }
    },
  };
}

/**
 * Create a command to move a device
 */
export function createMoveDeviceCommand(
  index: number,
  oldPosition: number,
  newPosition: number,
  store: DeviceCommandStore,
  deviceName: string = "device",
): Command {
  return {
    type: "MOVE_DEVICE",
    description: `Move ${deviceName}`,
    timestamp: Date.now(),
    execute() {
      store.moveDeviceRaw(index, newPosition);
    },
    undo() {
      store.moveDeviceRaw(index, oldPosition);
    },
  };
}

/**
 * Create a command to remove a device
 */
export function createRemoveDeviceCommand(
  index: number,
  device: PlacedDevice,
  store: DeviceCommandStore,
  deviceName: string = "device",
): Command {
  // Store a deep copy of the device for restoration
  // structuredClone handles nested objects like ports and custom_fields
  const deviceCopy = structuredClone(device);

  return {
    type: "REMOVE_DEVICE",
    description: `Remove ${deviceName}`,
    timestamp: Date.now(),
    execute() {
      store.removeDeviceAtIndexRaw(index);
    },
    undo() {
      store.placeDeviceRaw(deviceCopy);
    },
  };
}

/**
 * Create a command to update a device's display face
 */
export function createUpdateDeviceFaceCommand(
  index: number,
  oldFace: DeviceFace,
  newFace: DeviceFace,
  store: DeviceCommandStore,
  deviceName: string = "device",
): Command {
  return {
    type: "UPDATE_DEVICE_FACE",
    description: `Flip ${deviceName}`,
    timestamp: Date.now(),
    execute() {
      store.updateDeviceFaceRaw(index, newFace);
    },
    undo() {
      store.updateDeviceFaceRaw(index, oldFace);
    },
  };
}

/**
 * Create a command to update a device's custom display name
 */
export function createUpdateDeviceNameCommand(
  index: number,
  oldName: string | undefined,
  newName: string | undefined,
  store: DeviceCommandStore,
  deviceTypeName: string = "device",
): Command {
  const displayName = newName || deviceTypeName;
  return {
    type: "UPDATE_DEVICE_NAME",
    description: `Rename ${displayName}`,
    timestamp: Date.now(),
    execute() {
      store.updateDeviceNameRaw(index, newName);
    },
    undo() {
      store.updateDeviceNameRaw(index, oldName);
    },
  };
}

/**
 * Create a command to update a device's placement image
 */
export function createUpdateDevicePlacementImageCommand(
  index: number,
  face: "front" | "rear",
  oldFilename: string | undefined,
  newFilename: string | undefined,
  store: DeviceCommandStore,
  deviceName: string = "device",
): Command {
  return {
    type: "UPDATE_DEVICE_PLACEMENT_IMAGE",
    description: `Update ${deviceName} ${face} image`,
    timestamp: Date.now(),
    execute() {
      store.updateDevicePlacementImageRaw(index, face, newFilename);
    },
    undo() {
      store.updateDevicePlacementImageRaw(index, face, oldFilename);
    },
  };
}

/**
 * Create a command to update a device's colour override
 */
export function createUpdateDeviceColourCommand(
  index: number,
  oldColour: string | undefined,
  newColour: string | undefined,
  store: DeviceCommandStore,
  deviceName: string = "device",
): Command {
  return {
    type: "UPDATE_DEVICE_COLOUR",
    description: `Update ${deviceName} colour`,
    timestamp: Date.now(),
    execute() {
      store.updateDeviceColourRaw(index, newColour);
    },
    undo() {
      store.updateDeviceColourRaw(index, oldColour);
    },
  };
}

/**
 * Create a command to update a device's slot position (for half-width devices)
 */
export function createUpdateDeviceSlotPositionCommand(
  index: number,
  oldSlotPosition: SlotPosition,
  newSlotPosition: SlotPosition,
  store: DeviceCommandStore,
  deviceName: string = "device",
): Command {
  return {
    type: "UPDATE_DEVICE_SLOT_POSITION",
    description: `Move ${deviceName} to ${newSlotPosition} slot`,
    timestamp: Date.now(),
    execute() {
      store.updateDeviceSlotPositionRaw(index, newSlotPosition);
    },
    undo() {
      store.updateDeviceSlotPositionRaw(index, oldSlotPosition);
    },
  };
}
