/**
 * Device Type Commands for Undo/Redo
 */

import type { Command } from "./types";
import type { Cable, DeviceType, PlacedDevice } from "$lib/types";
import { getImageStore } from "../images.svelte";
import type { DeviceImageData } from "$lib/types/images";

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
  /**
   * Append a cable in place — not recorded by the history system.
   * `createDeleteDeviceTypeCommand` calls this from its undo path to restore
   * cables snapshotted at command creation; the surrounding command provides
   * the redo entry, so this mutator must not record one itself.
   */
  addCableRaw(cable: Cable): void;
  /**
   * Remove the cable with the given id in place — not recorded by the history
   * system. Counterpart to `addCableRaw`; same non-recording contract.
   */
  removeCableRaw(id: string): void;
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
 * Accepts connected cables so undo restores the cable topology too.
 */
export function createDeleteDeviceTypeCommand(
  deviceType: DeviceType,
  placedDevices: { rackId: string; device: PlacedDevice }[],
  store: DeviceTypeCommandStore,
  connectedCables: Cable[] = [],
): Command {
  const deviceData = placedDevices.map((d) => ({
    rackId: d.rackId,
    device: JSON.parse(JSON.stringify(d.device)) as PlacedDevice,
  }));
  const deviceTypeCopy = JSON.parse(JSON.stringify(deviceType)) as DeviceType;
  const cableData = connectedCables.map((c) => structuredClone(c));
  // Populated by undo() so a subsequent redo can clean up placement images and
  // restore cables under the (possibly remapped) device ids — placeDeviceRaw
  // can change the id if it collides with another rack device (#1363).
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
    const key = `placement-${d.device.id}`;
    const snap = imageStore.getAllImages().get(key);
    if (snap) placementSnapshots.set(key, structuredClone(snap));
  }

  return {
    type: "DELETE_DEVICE_TYPE",
    description: `Delete ${deviceType.model ?? deviceType.slug}`,
    timestamp: Date.now(),
    execute() {
      // Clean up cables connected to the placed devices before removing them,
      // otherwise their endpoint device IDs become orphan references (#1483).
      for (const cable of cableData) {
        store.removeCableRaw(cable.id);
      }
      // Clean up images (moved from raw mutator)
      const imgStore = getImageStore();
      imgStore.removeAllDeviceImages(deviceTypeCopy.slug);
      // Remove placement images at both the snapshot id and any remapped id
      // left over from a prior undo (otherwise redo leaks an orphan key).
      for (const { device } of deviceData) {
        imgStore.removeAllDeviceImages(`placement-${device.id}`);
        const remapped = restoredDeviceIdMap.get(device.id);
        if (remapped && remapped !== device.id) {
          imgStore.removeAllDeviceImages(`placement-${remapped}`);
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
        const originalKey = `placement-${device.id}`;
        const snap = placementSnapshots.get(originalKey);
        if (snap) {
          const actualKey = `placement-${actualId}`;
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
      // Restore cables, rewriting endpoint IDs through the remap map so any
      // device whose id was changed by placeDeviceRaw stays reachable.
      for (const cable of cableData) {
        store.addCableRaw({
          ...cable,
          a_device_id:
            restoredDeviceIdMap.get(cable.a_device_id) ?? cable.a_device_id,
          b_device_id:
            restoredDeviceIdMap.get(cable.b_device_id) ?? cable.b_device_id,
        });
      }
    },
  };
}
