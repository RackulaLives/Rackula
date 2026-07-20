/**
 * Device Type Commands for Undo/Redo
 */

import type { Command } from "./types";
import type { DeviceType, PlacedDevice } from "$lib/types";
import { getImageStore } from "../images.svelte";
import type { DeviceImageData } from "$lib/types/images";
import { placementKey } from "$lib/utils/placement-key";

/**
 * Interface for layout store operations needed by device type commands
 */
export interface DeviceTypeCommandStore {
  addDeviceTypeRaw(deviceType: DeviceType): void;
  removeDeviceTypeRaw(slug: string): void;
  updateDeviceTypeRaw(slug: string, updates: Partial<DeviceType>): void;
  placeDeviceRaw(device: PlacedDevice): number;
  removeDeviceAtIndexRaw(index: number): void;
  getPlacedDevicesForType(slug: string): PlacedDevice[];
  getDeviceAtIndex(index: number): PlacedDevice | undefined;
  setActiveRackId(id: string | null): void;
  getActiveRackId(): string | null;
}

/**
 * Create a command to add a device type
 */
export function createAddDeviceTypeCommand(
  deviceType: DeviceType,
  store: DeviceTypeCommandStore,
): Command {
  // Tracks whether the most recent undo actually removed the type.
  // Starts true so the first execute() always adds. Redo mirrors undo: if undo
  // skipped removal (another device still referenced the type), redo also skips
  // the re-add to avoid creating a duplicate entry.
  let undoRemovedType = true;
  return {
    type: "ADD_DEVICE_TYPE",
    description: `Add ${deviceType.model ?? deviceType.slug}`,
    timestamp: Date.now(),
    execute() {
      if (undoRemovedType) {
        store.addDeviceTypeRaw(deviceType);
      }
    },
    undo() {
      // Batch undo removes the placed device first, then calls this, so the
      // original device is already gone by the time we check references.
      if (store.getPlacedDevicesForType(deviceType.slug).length === 0) {
        store.removeDeviceTypeRaw(deviceType.slug);
        undoRemovedType = true;
      } else {
        undoRemovedType = false;
      }
    },
  };
}

/**
 * Create a command to update a device type
 */
export function createUpdateDeviceTypeCommand(
  slug: string,
  before: Partial<DeviceType>,
  after: Partial<DeviceType>,
  store: DeviceTypeCommandStore,
): Command {
  return {
    type: "UPDATE_DEVICE_TYPE",
    description: `Update ${slug}`,
    timestamp: Date.now(),
    execute() {
      store.updateDeviceTypeRaw(slug, after);
    },
    undo() {
      store.updateDeviceTypeRaw(slug, before);
    },
  };
}

/**
 * Create a command to delete a device type (including placed instances)
 * Accepts rack-aware device data so undo restores devices to their original racks.
 */
export function createDeleteDeviceTypeCommand(
  deviceType: DeviceType,
  placedDevices: { rackId: string; device: PlacedDevice }[],
  store: DeviceTypeCommandStore,
  layoutId: string = "",
): Command {
  const deviceData = placedDevices.map((d) => ({
    rackId: d.rackId,
    device: JSON.parse(JSON.stringify(d.device)) as PlacedDevice,
  }));
  const deviceTypeCopy = JSON.parse(JSON.stringify(deviceType)) as DeviceType;
  // Populated by undo() so a subsequent redo can clean up placement images
  // under the (possibly remapped) device ids — placeDeviceRaw can change the
  // id if it collides with another rack device (#1363).
  const restoredDeviceIdMap = new Map<string, string>();

  // Snapshot all images associated with this device type
  const imageStore = getImageStore();
  const typeImageSnapshot = imageStore.getAllImages().get(deviceType.slug);
  const typeImageCopy = typeImageSnapshot
    ? structuredClone(typeImageSnapshot)
    : undefined;

  // Snapshot placement-specific images for each placed device
  const placementSnapshots = new Map<string, DeviceImageData>();
  for (const d of placedDevices) {
    const key = placementKey(layoutId, d.device.id);
    const snap = imageStore.getAllImages().get(key);
    if (snap) placementSnapshots.set(key, structuredClone(snap));
  }

  return {
    type: "DELETE_DEVICE_TYPE",
    description: `Delete ${deviceType.model ?? deviceType.slug}`,
    timestamp: Date.now(),
    execute() {
      // Clean up images (moved from raw mutator)
      const imgStore = getImageStore();
      imgStore.removeAllDeviceImages(deviceTypeCopy.slug);
      // Remove placement images at both the snapshot id and any remapped id
      // left over from a prior undo (otherwise redo leaks an orphan key).
      for (const { device } of deviceData) {
        imgStore.removeAllDeviceImages(placementKey(layoutId, device.id));
        const remapped = restoredDeviceIdMap.get(device.id);
        if (remapped && remapped !== device.id) {
          imgStore.removeAllDeviceImages(placementKey(layoutId, remapped));
        }
      }
      store.removeDeviceTypeRaw(deviceTypeCopy.slug);
    },
    undo() {
      store.addDeviceTypeRaw(deviceTypeCopy);
      // Restore devices to their original racks
      const previousActiveRack = store.getActiveRackId();
      const imgStore = getImageStore();
      restoredDeviceIdMap.clear();
      for (const { rackId, device } of deviceData) {
        store.setActiveRackId(rackId);
        const placedIdx = store.placeDeviceRaw(device);
        const placed = store.getDeviceAtIndex(placedIdx);
        const actualId = placed?.id ?? device.id;
        restoredDeviceIdMap.set(device.id, actualId);
        // Restore placement images under the (possibly remapped) key
        const originalKey = placementKey(layoutId, device.id);
        const snap = placementSnapshots.get(originalKey);
        if (snap) {
          const actualKey = placementKey(layoutId, actualId);
          if (snap.front)
            imgStore.setDeviceImage(actualKey, "front", snap.front);
          if (snap.rear) imgStore.setDeviceImage(actualKey, "rear", snap.rear);
        }
      }
      store.setActiveRackId(previousActiveRack);
      // Restore type-level images
      if (typeImageCopy) {
        if (typeImageCopy.front)
          imgStore.setDeviceImage(
            deviceTypeCopy.slug,
            "front",
            typeImageCopy.front,
          );
        if (typeImageCopy.rear)
          imgStore.setDeviceImage(
            deviceTypeCopy.slug,
            "rear",
            typeImageCopy.rear,
          );
      }
    },
  };
}
