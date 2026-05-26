/**
 * Device Commands for Undo/Redo
 */

import type { Command } from "./types";
import type { PlacedDevice, DeviceFace, SlotPosition } from "$lib/types";
import { getImageStore } from "../images.svelte";

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
  updateDeviceNotesRaw(index: number, notes: string | undefined): void;
  updateDeviceIpRaw(index: number, ip: string | undefined): void;
  getDeviceAtIndex(index: number): PlacedDevice | undefined;
}

/**
 * Extended store interface for cross-rack move commands.
 * Adds active rack switching needed for multi-rack operations.
 */
export interface CrossRackMoveStore extends DeviceCommandStore {
  setActiveRackId(id: string | null): void;
  getActiveRackId(): string | null;
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

  // Snapshot placement images before removal for undo restoration
  const imageStore = getImageStore();
  const imageKey = `placement-${device.id}`;
  const imageSnapshot = imageStore.getAllImages().get(imageKey);
  const snapshotCopy = imageSnapshot
    ? structuredClone(imageSnapshot)
    : undefined;

  return {
    type: "REMOVE_DEVICE",
    description: `Remove ${deviceName}`,
    timestamp: Date.now(),
    execute() {
      // Clean up placement images (moved from raw mutator)
      getImageStore().removeAllDeviceImages(imageKey);
      store.removeDeviceAtIndexRaw(index);
    },
    undo() {
      const placedIdx = store.placeDeviceRaw(deviceCopy);
      // Read back actual device — placeDeviceRaw may remap the ID (#1363 dedup guard)
      const placed = store.getDeviceAtIndex(placedIdx);
      const actualId = placed?.id ?? deviceCopy.id;
      // Restore placement images under the (possibly remapped) key
      if (snapshotCopy) {
        const imgStore = getImageStore();
        const actualKey = `placement-${actualId}`;
        if (snapshotCopy.front)
          imgStore.setDeviceImage(actualKey, "front", snapshotCopy.front);
        if (snapshotCopy.rear)
          imgStore.setDeviceImage(actualKey, "rear", snapshotCopy.rear);
      }
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

/**
 * Create a command to update a device's notes
 */
export function createUpdateDeviceNotesCommand(
  index: number,
  oldNotes: string | undefined,
  newNotes: string | undefined,
  store: DeviceCommandStore,
  deviceName: string = "device",
): Command {
  return {
    type: "UPDATE_DEVICE_NOTES",
    description: `Update ${deviceName} notes`,
    timestamp: Date.now(),
    execute() {
      store.updateDeviceNotesRaw(index, newNotes);
    },
    undo() {
      store.updateDeviceNotesRaw(index, oldNotes);
    },
  };
}

/**
 * Create a command to update a device's IP address/hostname
 */
export function createUpdateDeviceIpCommand(
  index: number,
  oldIp: string | undefined,
  newIp: string | undefined,
  store: DeviceCommandStore,
  deviceName: string = "device",
): Command {
  return {
    type: "UPDATE_DEVICE_IP",
    description: `Update ${deviceName} IP`,
    timestamp: Date.now(),
    execute() {
      store.updateDeviceIpRaw(index, newIp);
    },
    undo() {
      store.updateDeviceIpRaw(index, oldIp);
    },
  };
}

/**
 * Create a command to move a device (and its container children) from one rack to another.
 * Atomic undo/redo — one Ctrl+Z restores the device to its original rack.
 *
 * Removal uses device IDs to resolve indices at runtime, avoiding stale indices
 * after undo re-inserts devices at different positions.
 */
export function createCrossRackMoveCommand(
  sourceRackId: string,
  _sortedRemovalIndices: number[],
  targetRackId: string,
  targetPosition: number,
  face: DeviceFace,
  slotPosition: SlotPosition | undefined,
  parentDevice: PlacedDevice,
  children: PlacedDevice[],
  store: CrossRackMoveStore,
  deviceName: string = "device",
): Command {
  // Deep-copy all devices at command creation time to isolate from reactive state
  const parentCopy = structuredClone(parentDevice);
  const childrenCopies = children.map((c) => structuredClone(c));

  // Build the placed device for the target rack (updated position/face/slot)
  const placedParent: PlacedDevice = {
    ...parentCopy,
    position: targetPosition,
    face,
    slot_position: slotPosition ?? parentCopy.slot_position ?? "full",
  };

  // Children inherit the parent's new face and keep their relative positions
  const placedChildren: PlacedDevice[] = childrenCopies.map((child) => ({
    ...child,
    face,
  }));

  // All device IDs to remove from source rack (resolved by ID at runtime)
  const sourceDeviceIds = [parentCopy.id, ...childrenCopies.map((c) => c.id)];

  // Captured during execute() for undo — target-rack indices of placed devices
  let parentPlacedIndex = -1;
  const childPlacedIndices: number[] = [];

  /**
   * Resolve current indices for device IDs in the active rack.
   * Returns indices sorted descending for safe removal.
   */
  function resolveIndicesDescending(ids: string[]): number[] {
    const indices: number[] = [];
    for (const id of ids) {
      let i = 0;
      while (true) {
        const d = store.getDeviceAtIndex(i);
        if (!d) break;
        if (d.id === id) {
          indices.push(i);
          break;
        }
        i++;
      }
    }
    return indices.sort((a, b) => b - a);
  }

  return {
    type: "CROSS_RACK_MOVE",
    description: `Move ${deviceName} to another rack`,
    timestamp: Date.now(),
    execute() {
      const savedActiveRack = store.getActiveRackId();

      // 1. Resolve current indices in source rack and remove (descending order)
      store.setActiveRackId(sourceRackId);
      const indices = resolveIndicesDescending(sourceDeviceIds);
      for (const idx of indices) {
        store.removeDeviceAtIndexRaw(idx);
      }

      // 2. Place parent in target rack
      store.setActiveRackId(targetRackId);
      parentPlacedIndex = store.placeDeviceRaw(placedParent);

      // Read back actual parent — placeDeviceRaw may remap the ID (#1363 dedup guard)
      const actualParent = store.getDeviceAtIndex(parentPlacedIndex);
      const actualParentId = actualParent?.id ?? placedParent.id;

      // 3. Place children in target rack with remapped container_id
      childPlacedIndices.length = 0;
      for (const child of placedChildren) {
        const childToPlace: PlacedDevice =
          child.container_id && child.container_id !== actualParentId
            ? { ...child, container_id: actualParentId }
            : child;
        const idx = store.placeDeviceRaw(childToPlace);
        childPlacedIndices.push(idx);
      }

      // 4. Restore active rack
      store.setActiveRackId(savedActiveRack);
    },
    undo() {
      const savedActiveRack = store.getActiveRackId();

      // 1. Remove devices from target rack (descending index order)
      store.setActiveRackId(targetRackId);
      const allTargetIndices = [parentPlacedIndex, ...childPlacedIndices].sort(
        (a, b) => b - a,
      );
      for (const idx of allTargetIndices) {
        store.removeDeviceAtIndexRaw(idx);
      }

      // 2. Place parent back in source rack (original position/face)
      store.setActiveRackId(sourceRackId);
      const undoParentIdx = store.placeDeviceRaw(parentCopy);

      // Read back actual parent — placeDeviceRaw may remap the ID (#1363 dedup guard)
      const undoActualParent = store.getDeviceAtIndex(undoParentIdx);
      const undoActualParentId = undoActualParent?.id ?? parentCopy.id;

      // 3. Place children back in source rack with remapped container_id
      for (const child of childrenCopies) {
        const childToPlace: PlacedDevice =
          child.container_id && child.container_id !== undoActualParentId
            ? { ...child, container_id: undoActualParentId }
            : child;
        store.placeDeviceRaw(childToPlace);
      }

      // 4. Restore active rack
      store.setActiveRackId(savedActiveRack);
    },
  };
}
