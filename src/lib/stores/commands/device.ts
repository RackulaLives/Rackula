/**
 * Device Commands for Undo/Redo
 */

import type { Command } from "./types";
import type { PlacedDevice, DeviceFace } from "$lib/types";
import type { DeviceImageData } from "$lib/types/images";
import { getImageStore } from "../images.svelte";
import { placementKey } from "$lib/utils/placement-key";

/**
 * Find the current array index of the device whose id matches `id`, scanning the
 * active rack via getDeviceAtIndex. Returns undefined when no device has that id.
 *
 * This is the shared building block for resolve-by-id command targeting (#2665).
 * It mirrors createCrossRackMoveCommand.resolveIndicesDescending, generalized so
 * every device command can find its target at runtime instead of trusting a
 * creation-time index that another command may have invalidated.
 */
function resolveIndexById(
  store: Pick<DeviceCommandStore, "getDeviceAtIndex">,
  id: string,
): number | undefined {
  let i = 0;
  while (true) {
    const d = store.getDeviceAtIndex(i);
    if (!d) break;
    if (d.id === id) return i;
    i++;
  }
  return undefined;
}

/**
 * Build a target resolver for a command that was created against `initialIndex`.
 *
 * The device's stable id is captured at command creation time, while
 * `initialIndex` is still valid: before any sibling command in a batch can shift
 * the rack. Every run then resolves the live index by that id, so the command can
 * never act on whichever device has since shifted into the old slot. Returns
 * undefined only when the device is genuinely absent, letting callers no-op
 * instead of mutating an unrelated device (#2665).
 */
function createTargetResolver(
  store: Pick<DeviceCommandStore, "getDeviceAtIndex">,
  initialIndex: number,
): () => number | undefined {
  const trackedId = store.getDeviceAtIndex(initialIndex)?.id;
  return function resolveTargetIndex(): number | undefined {
    if (trackedId === undefined) return undefined;
    return resolveIndexById(store, trackedId);
  };
}

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
  updateDeviceContainerLinkageRaw(
    index: number,
    containerId: string | undefined,
    slotId: string | undefined,
  ): void;
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
  // Track the placed device by id (#2665). placeDeviceRaw appends and may remap
  // the id on a collision (#1363), so read the live device back to learn its
  // actual id. undo resolves the current index by that id rather than trusting
  // the placement-time index, which an intervening command may have shifted.
  let placedId: string | undefined;

  return {
    type: "PLACE_DEVICE",
    description: `Place ${deviceName}`,
    timestamp: Date.now(),
    execute() {
      const placedIndex = store.placeDeviceRaw(device);
      if (placedIndex < 0) {
        placedId = undefined;
        return;
      }
      const placed = store.getDeviceAtIndex(placedIndex);
      placedId = placed?.id ?? device.id;
    },
    undo() {
      if (placedId === undefined) return;
      const targetIndex = resolveIndexById(store, placedId);
      if (targetIndex === undefined) return;
      store.removeDeviceAtIndexRaw(targetIndex);
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
  // Resolve the target by id at runtime (#2665) so redo/undo move the device the
  // command was created for, even after another command shifted array positions.
  const resolveTargetIndex = createTargetResolver(store, index);

  return {
    type: "MOVE_DEVICE",
    description: `Move ${deviceName}`,
    timestamp: Date.now(),
    execute() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.moveDeviceRaw(targetIndex, newPosition);
    },
    undo() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.moveDeviceRaw(targetIndex, oldPosition);
    },
  };
}

/**
 * Create a command to remove a device
 */
export function createRemoveDeviceCommand(
  device: PlacedDevice,
  store: DeviceCommandStore,
  deviceName: string = "device",
  layoutId: string = "",
): Command {
  // Store a deep copy of the device for restoration
  // structuredClone handles nested objects like ports and custom_fields
  const deviceCopy = structuredClone(device);

  // Track the target device by ID, not by a fixed creation-time index (#2656,
  // generalized in #2665). undo() re-appends the device to the end (mutators.ts
  // placeDeviceRaw), which shifts array positions, so a captured index goes stale
  // and redo would delete the wrong device. Resolve the current index by ID at
  // execute time via the shared resolveIndexById helper. currentImageId doubles
  // as the live device ID, kept in sync across undo when placeDeviceRaw remaps it.
  let currentImageId = device.id;

  // Snapshot placement images before removal for undo restoration
  const imageStore = getImageStore();
  const imageSnapshot = imageStore
    .getAllImages()
    .get(placementKey(layoutId, currentImageId));
  const snapshotCopy = imageSnapshot
    ? structuredClone(imageSnapshot)
    : undefined;

  return {
    type: "REMOVE_DEVICE",
    description: `Remove ${deviceName}`,
    timestamp: Date.now(),
    execute() {
      // Resolve the target by ID at runtime so redo deletes the right device (#2656).
      // If the device is no longer present, no-op rather than touching a stale index.
      const targetIndex = resolveIndexById(store, currentImageId);
      if (targetIndex === undefined) return;
      // Clean up placement images using current ID (may differ from original after undo remap)
      getImageStore().removeAllDeviceImages(
        placementKey(layoutId, currentImageId),
      );
      store.removeDeviceAtIndexRaw(targetIndex);
    },
    undo() {
      const placedIdx = store.placeDeviceRaw(deviceCopy);
      // Read back actual device — placeDeviceRaw may remap the ID (#1363 dedup guard)
      const placed = store.getDeviceAtIndex(placedIdx);
      const actualId = placed?.id ?? deviceCopy.id;
      currentImageId = actualId;
      // Restore placement images under the (possibly remapped) key
      if (snapshotCopy) {
        const imgStore = getImageStore();
        const actualKey = placementKey(layoutId, actualId);
        if (snapshotCopy.front)
          imgStore.setDeviceImage(actualKey, "front", snapshotCopy.front);
        if (snapshotCopy.rear)
          imgStore.setDeviceImage(actualKey, "rear", snapshotCopy.rear);
      }
    },
  };
}

/**
 * Create a command to remove a carrier device along with every device whose
 * container_id references it, in one atomic, undoable operation (#2911).
 *
 * Without this, deleting a carrier leaves its children in the rack with a
 * container_id pointing at the now-removed carrier. LayoutSchema rejects that
 * dangling reference on the next load, corrupting the persisted layout even
 * though the delete looked complete in the UI.
 *
 * Mirrors createCrossRackMoveCommand's remove/restore and ID-remap handling
 * (#1363, #1478), but stays within a single rack: no position/face change,
 * no rack switch.
 */
export function createRemoveDeviceWithChildrenCommand(
  parentDevice: PlacedDevice,
  children: PlacedDevice[],
  store: DeviceCommandStore,
  deviceName: string = "device",
  layoutId: string = "",
): Command {
  const parentCopy = structuredClone(parentDevice);
  const childrenCopies = children.map((c) => structuredClone(c));

  // Track live IDs so removal/restore resolve by id at runtime, and stay in
  // sync across execute/undo when placeDeviceRaw remaps an id on collision (#1363).
  let currentParentId = parentCopy.id;
  const currentChildIds: string[] = childrenCopies.map((c) => c.id);

  // Snapshot placement images before removal for undo restoration.
  const snapshotImage = (id: string): DeviceImageData | undefined => {
    const data = getImageStore().getAllImages().get(placementKey(layoutId, id));
    return data ? structuredClone(data) : undefined;
  };
  const parentImageCopy = snapshotImage(currentParentId);
  const childImageCopies = currentChildIds.map((id) => snapshotImage(id));

  const restoreImage = (
    id: string,
    snapshot: DeviceImageData | undefined,
  ): void => {
    if (!snapshot) return;
    const imgStore = getImageStore();
    const key = placementKey(layoutId, id);
    if (snapshot.front) imgStore.setDeviceImage(key, "front", snapshot.front);
    if (snapshot.rear) imgStore.setDeviceImage(key, "rear", snapshot.rear);
  };

  return {
    type: "REMOVE_DEVICE_WITH_CHILDREN",
    description: `Remove ${deviceName} and its contents`,
    timestamp: Date.now(),
    execute() {
      // Resolve each id to a live index, then remove in descending index order
      // so an earlier removal cannot shift a later target. Wipe each device's
      // placement image only when that device is actually removed, so a redo
      // that finds a device already gone never destroys an unrelated image.
      const targets: { id: string; index: number }[] = [];
      for (const id of [currentParentId, ...currentChildIds]) {
        const idx = resolveIndexById(store, id);
        if (idx !== undefined) targets.push({ id, index: idx });
      }
      targets.sort((a, b) => b.index - a.index);
      const imgStore = getImageStore();
      for (const { id, index } of targets) {
        imgStore.removeAllDeviceImages(placementKey(layoutId, id));
        store.removeDeviceAtIndexRaw(index);
      }
    },
    undo() {
      // Restore the parent first so children can be re-linked to its
      // (possibly remapped) id.
      const parentIdx = store.placeDeviceRaw(parentCopy);
      const actualParent = store.getDeviceAtIndex(parentIdx);
      const actualParentId = actualParent?.id ?? parentCopy.id;
      currentParentId = actualParentId;
      restoreImage(actualParentId, parentImageCopy);

      childrenCopies.forEach((child, i) => {
        const childToPlace: PlacedDevice =
          child.container_id && child.container_id !== actualParentId
            ? { ...child, container_id: actualParentId }
            : child;
        const childIdx = store.placeDeviceRaw(childToPlace);
        const actualChild = store.getDeviceAtIndex(childIdx);
        const actualChildId = actualChild?.id ?? childToPlace.id;
        currentChildIds[i] = actualChildId;
        restoreImage(actualChildId, childImageCopies[i]);
      });
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
  // Resolve the target by id at runtime (#2665) so the right device is updated
  // even after another command shifted array positions.
  const resolveTargetIndex = createTargetResolver(store, index);

  return {
    type: "UPDATE_DEVICE_FACE",
    description: `Flip ${deviceName}`,
    timestamp: Date.now(),
    execute() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceFaceRaw(targetIndex, newFace);
    },
    undo() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceFaceRaw(targetIndex, oldFace);
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
  // Resolve the target by id at runtime (#2665).
  const resolveTargetIndex = createTargetResolver(store, index);
  return {
    type: "UPDATE_DEVICE_NAME",
    description: `Rename ${displayName}`,
    timestamp: Date.now(),
    execute() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceNameRaw(targetIndex, newName);
    },
    undo() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceNameRaw(targetIndex, oldName);
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
  // Resolve the target by id at runtime (#2665).
  const resolveTargetIndex = createTargetResolver(store, index);
  return {
    type: "UPDATE_DEVICE_PLACEMENT_IMAGE",
    description: `Update ${deviceName} ${face} image`,
    timestamp: Date.now(),
    execute() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDevicePlacementImageRaw(targetIndex, face, newFilename);
    },
    undo() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDevicePlacementImageRaw(targetIndex, face, oldFilename);
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
  // Resolve the target by id at runtime (#2665).
  const resolveTargetIndex = createTargetResolver(store, index);
  return {
    type: "UPDATE_DEVICE_COLOUR",
    description: `Update ${deviceName} colour`,
    timestamp: Date.now(),
    execute() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceColourRaw(targetIndex, newColour);
    },
    undo() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceColourRaw(targetIndex, oldColour);
    },
  };
}

/**
 * Create a command to detach a device from its container.
 * Clears container_id/slot_id on execute; restores them on undo.
 */
export function createDetachContainerCommand(
  index: number,
  oldContainerId: string | undefined,
  oldSlotId: string | undefined,
  store: DeviceCommandStore,
  deviceName: string = "device",
): Command {
  // Resolve the target by id at runtime (#2665).
  const resolveTargetIndex = createTargetResolver(store, index);
  return {
    type: "DETACH_CONTAINER",
    description: `Detach ${deviceName} from container`,
    timestamp: Date.now(),
    execute() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceContainerLinkageRaw(targetIndex, undefined, undefined);
    },
    undo() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceContainerLinkageRaw(
        targetIndex,
        oldContainerId,
        oldSlotId,
      );
    },
  };
}

/**
 * Create a command to move a contained child to a different cell of the same
 * carrier. Only slot_id changes; container_id is preserved, so the child stays
 * inside its carrier and is never ejected (contained-device guard, #2146).
 */
export function createMoveToSlotCommand(
  index: number,
  containerId: string,
  oldSlotId: string | undefined,
  newSlotId: string,
  store: DeviceCommandStore,
  deviceName: string = "device",
): Command {
  // Resolve the target by id at runtime (#2665).
  const resolveTargetIndex = createTargetResolver(store, index);
  return {
    type: "MOVE_TO_SLOT",
    description: `Move ${deviceName} to another cell`,
    timestamp: Date.now(),
    execute() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceContainerLinkageRaw(
        targetIndex,
        containerId,
        newSlotId,
      );
    },
    undo() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceContainerLinkageRaw(
        targetIndex,
        containerId,
        oldSlotId,
      );
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
  // Resolve the target by id at runtime (#2665).
  const resolveTargetIndex = createTargetResolver(store, index);
  return {
    type: "UPDATE_DEVICE_NOTES",
    description: `Update ${deviceName} notes`,
    timestamp: Date.now(),
    execute() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceNotesRaw(targetIndex, newNotes);
    },
    undo() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceNotesRaw(targetIndex, oldNotes);
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
  // Resolve the target by id at runtime (#2665).
  const resolveTargetIndex = createTargetResolver(store, index);
  return {
    type: "UPDATE_DEVICE_IP",
    description: `Update ${deviceName} IP`,
    timestamp: Date.now(),
    execute() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceIpRaw(targetIndex, newIp);
    },
    undo() {
      const targetIndex = resolveTargetIndex();
      if (targetIndex === undefined) return;
      store.updateDeviceIpRaw(targetIndex, oldIp);
    },
  };
}

/**
 * Move placement image from one device ID key to another when placeDeviceRaw remaps the ID.
 * No-op if no image exists under the old key.
 */
function rekeyPlacementImage(
  oldId: string,
  newId: string,
  layoutId: string = "",
): void {
  const imgStore = getImageStore();
  const data = imgStore.getAllImages().get(placementKey(layoutId, oldId));
  if (!data) return;
  if (data.front)
    imgStore.setDeviceImage(placementKey(layoutId, newId), "front", data.front);
  if (data.rear)
    imgStore.setDeviceImage(placementKey(layoutId, newId), "rear", data.rear);
  imgStore.removeAllDeviceImages(placementKey(layoutId, oldId));
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
  parentDevice: PlacedDevice,
  children: PlacedDevice[],
  store: CrossRackMoveStore,
  deviceName: string = "device",
  layoutId: string = "",
): Command {
  // Deep-copy all devices at command creation time to isolate from reactive state
  const parentCopy = structuredClone(parentDevice);
  const childrenCopies = children.map((c) => structuredClone(c));

  // Build the placed device for the target rack (updated position/face).
  // Clear container linkage: the moved device's own container never moves with
  // it (the move set is the device plus its children), so container_id/slot_id
  // would point at a container that only exists in the source rack. parentCopy
  // keeps the original linkage so undo restores the device into its container.
  const placedParent: PlacedDevice = {
    ...parentCopy,
    position: targetPosition,
    face,
    container_id: undefined,
    slot_id: undefined,
  };

  // Children inherit the parent's new face and keep their relative positions
  const placedChildren: PlacedDevice[] = childrenCopies.map((child) => ({
    ...child,
    face,
  }));

  // All device IDs to remove from source rack (resolved by ID at runtime)
  const sourceDeviceIds = [parentCopy.id, ...childrenCopies.map((c) => c.id)];

  // Track current source IDs and image keys — updated across execute/undo when
  // placeDeviceRaw remaps an ID (#1478). Mutable so redo (execute) finds remapped devices.
  const currentSourceDeviceIds = [...sourceDeviceIds];
  let currentParentImageId = parentCopy.id;
  const currentChildImageIds: string[] = childrenCopies.map((c) => c.id);

  /**
   * Resolve current indices for device IDs in the active rack.
   * Returns indices sorted descending for safe removal.
   */
  function resolveIndicesDescending(ids: string[]): number[] {
    const indices: number[] = [];
    for (const id of ids) {
      const idx = resolveIndexById(store, id);
      if (idx !== undefined) indices.push(idx);
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
      const indices = resolveIndicesDescending(currentSourceDeviceIds);
      for (const idx of indices) {
        store.removeDeviceAtIndexRaw(idx);
      }

      // 2. Place parent in target rack
      store.setActiveRackId(targetRackId);
      const parentPlacedIndex = store.placeDeviceRaw(placedParent);

      // Read back actual parent — placeDeviceRaw may remap the ID (#1363 dedup guard)
      const actualParent = store.getDeviceAtIndex(parentPlacedIndex);
      const actualParentId = actualParent?.id ?? placedParent.id;

      // Re-key placement image if parent ID was remapped (#1478)
      if (actualParentId !== currentParentImageId) {
        rekeyPlacementImage(currentParentImageId, actualParentId, layoutId);
        currentParentImageId = actualParentId;
      }

      // 3. Place children in target rack with remapped container_id
      placedChildren.forEach((child, i) => {
        const childToPlace: PlacedDevice =
          child.container_id && child.container_id !== actualParentId
            ? { ...child, container_id: actualParentId }
            : child;
        const idx = store.placeDeviceRaw(childToPlace);

        // Re-key child placement image if child ID was remapped (#1478)
        const actualChild = store.getDeviceAtIndex(idx);
        const actualChildId = actualChild?.id ?? childToPlace.id;
        const previousChildImageId = currentChildImageIds[i];
        if (previousChildImageId && actualChildId !== previousChildImageId) {
          rekeyPlacementImage(previousChildImageId, actualChildId, layoutId);
          currentChildImageIds[i] = actualChildId;
        }
      });

      // 4. Restore active rack
      store.setActiveRackId(savedActiveRack);
    },
    undo() {
      const savedActiveRack = store.getActiveRackId();

      // 1. Remove devices from target rack, resolved by id so a change to the
      // target rack between execute and undo cannot remove the wrong devices (#2665).
      store.setActiveRackId(targetRackId);
      const allTargetIndices = resolveIndicesDescending([
        currentParentImageId,
        ...currentChildImageIds,
      ]);
      for (const idx of allTargetIndices) {
        store.removeDeviceAtIndexRaw(idx);
      }

      // 2. Place parent back in source rack (original position/face)
      store.setActiveRackId(sourceRackId);
      const undoParentIdx = store.placeDeviceRaw(parentCopy);

      // Read back actual parent — placeDeviceRaw may remap the ID (#1363 dedup guard)
      const undoActualParent = store.getDeviceAtIndex(undoParentIdx);
      const undoActualParentId = undoActualParent?.id ?? parentCopy.id;

      // Re-key placement image and update source ID tracking if remapped (#1478)
      if (undoActualParentId !== currentParentImageId) {
        rekeyPlacementImage(currentParentImageId, undoActualParentId, layoutId);
        currentParentImageId = undoActualParentId;
      }
      currentSourceDeviceIds[0] = undoActualParentId;

      // 3. Place children back in source rack with remapped container_id
      childrenCopies.forEach((child, i) => {
        const childToPlace: PlacedDevice =
          child.container_id && child.container_id !== undoActualParentId
            ? { ...child, container_id: undoActualParentId }
            : child;
        const undoChildIdx = store.placeDeviceRaw(childToPlace);

        // Re-key child placement image and update source ID tracking if remapped (#1478)
        const actualChild = store.getDeviceAtIndex(undoChildIdx);
        const actualChildId = actualChild?.id ?? childToPlace.id;
        const previousChildImageId = currentChildImageIds[i];
        if (previousChildImageId && actualChildId !== previousChildImageId) {
          rekeyPlacementImage(previousChildImageId, actualChildId, layoutId);
          currentChildImageIds[i] = actualChildId;
        }
        currentSourceDeviceIds[i + 1] = actualChildId;
      });

      // 4. Restore active rack
      store.setActiveRackId(savedActiveRack);
    },
  };
}
