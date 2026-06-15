/**
 * Public Device Action Flows for Layout Store
 *
 * Extracted from layout.svelte.ts — multi-step device flows that build
 * commands directly (rather than delegating to a single recorded action):
 * duplication, container placement, and cross-rack moves.
 *
 * Snapshot functions are injected because $state.snapshot() is a Svelte
 * rune that must be called from a .svelte.ts file (the facade).
 */

import type { DeviceFace, PlacedDevice } from "$lib/types";
import { UNITS_PER_U } from "$lib/types/constants";
import {
  canPlaceDevice,
  canPlaceInContainer,
  canPlaceInSlot,
  findValidDropPositions,
  findNextFreeChildPosition,
  requiresCarrier,
  synthesizeCarrierForDevice,
} from "$lib/utils/collision";
import { findDeviceType as findDeviceTypeInArray } from "$lib/stores/layout-helpers";
import { findDeviceType } from "$lib/utils/device-lookup";
import { generateId } from "$lib/utils/device";
import { toInternalUnits } from "$lib/utils/position";
import { instantiatePorts } from "$lib/utils/port-utils";
import {
  createPlaceDeviceCommand,
  createAddDeviceTypeCommand,
  createBatchCommand,
  createCrossRackMoveCommand,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getCommandStoreAdapter } from "./command-adapters";
import { getRackById } from "./rack-actions";
import {
  moveDeviceRecorded,
  placeDeviceRecorded,
} from "./recorded-device-actions";

/** Snapshot function injected by the facade ($state.snapshot is a rune). */
export type SnapshotDeviceFn = (device: PlacedDevice) => PlacedDevice;

/**
 * Duplicate a placed device within a rack
 * Places the duplicate in the next available slot on the same face
 * Inherits all properties (custom label, image overrides, colour)
 * Uses undo/redo system for reverting the operation
 * @param ctx - Layout state access
 * @param rackId - Rack ID containing the device
 * @param deviceIndex - Index of the device in rack's devices array
 * @param snapshotDevice - Snapshot function (deep-clones the reactive proxy)
 * @returns The duplicated device or error message
 */
export function duplicateDevice(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  snapshotDevice: SnapshotDeviceFn,
): { error?: string; device?: PlacedDevice } {
  const layout = ctx.getLayout();
  const sourceRack = layout.racks.find((r) => r.id === rackId);
  if (!sourceRack) {
    return { error: "Rack not found" };
  }

  if (deviceIndex < 0 || deviceIndex >= sourceRack.devices.length) {
    return { error: "Device not found" };
  }

  const sourceDevice = sourceRack.devices[deviceIndex]!;
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    sourceDevice.device_type,
  );
  if (!deviceType) {
    return { error: "Device type not found" };
  }

  // Find valid positions on the same face
  const validPositions = findValidDropPositions(
    sourceRack,
    layout.device_types,
    deviceType.u_height,
    sourceDevice.face,
  );

  if (validPositions.length === 0) {
    return { error: "Cannot duplicate: no available space in rack" };
  }

  // Prefer adjacent slot (above or below the source device)
  // Device positions and heights are in internal units
  const heightInternal = toInternalUnits(deviceType.u_height);
  const adjacentAbove = sourceDevice.position + heightInternal;
  const adjacentBelow = sourceDevice.position - heightInternal;

  let targetPosition: number;

  // Check if adjacent above is valid
  if (validPositions.includes(adjacentAbove)) {
    targetPosition = adjacentAbove;
  } else if (
    adjacentBelow >= UNITS_PER_U &&
    validPositions.includes(adjacentBelow)
  ) {
    // Check if adjacent below is valid (and within rack bounds - U1 = UNITS_PER_U)
    targetPosition = adjacentBelow;
  } else {
    // Fall back to first available position
    targetPosition = validPositions[0]!;
  }

  // Create the duplicate device with new ID but inherited properties
  // Use the injected snapshot to deep-clone the reactive proxy and avoid linked state
  const duplicatedDevice: PlacedDevice = {
    ...snapshotDevice(sourceDevice),
    id: generateId(),
    position: targetPosition,
    // Regenerate ports with new IDs
    ports: instantiatePorts(deviceType),
    // Don't copy container_id - duplicates are independent rack-level devices
    container_id: undefined,
    slot_id: undefined,
  };

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  // Use the undo/redo system via placeDeviceRaw and history
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  const deviceName = deviceType.model ?? deviceType.slug;

  const command = createPlaceDeviceCommand(
    duplicatedDevice,
    adapter,
    `${deviceName} (Copy)`,
  );
  history.execute(command);
  ctx.markDirty();

  return { device: duplicatedDevice };
}

/**
 * Place a device inside a container slot
 * Uses undo/redo support via command pattern
 * @param ctx - Layout state access
 * @param rackId - Target rack ID
 * @param deviceTypeSlug - Device type slug
 * @param containerId - ID of the container device
 * @param slotId - Slot within the container
 * @param position - 0-indexed position within the container
 * @returns true if placed successfully
 */
export function placeInContainer(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceTypeSlug: string,
  containerId: string,
  slotId: string,
  position: number,
): boolean {
  // Validate rack exists
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return false;

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  // Find container device
  const container = targetRack.devices.find((d) => d.id === containerId);
  if (!container) return false;

  const layout = ctx.getLayout();

  // Find device types
  const containerType = findDeviceType(
    container.device_type,
    layout.device_types,
  );
  const childType = findDeviceType(deviceTypeSlug, layout.device_types);

  if (!containerType || !childType) return false;

  // Check collision within container
  if (
    !canPlaceInContainer(
      targetRack,
      layout.device_types,
      container,
      containerType,
      childType,
      slotId,
      position,
    )
  ) {
    return false;
  }

  // Create placed device with container reference
  const placedDevice: PlacedDevice = {
    id: generateId(),
    device_type: deviceTypeSlug,
    position, // 0-indexed within container
    face: container.face, // Inherit parent face
    container_id: containerId,
    slot_id: slotId,
    ports: instantiatePorts(childType),
  };

  // Use command for undo/redo
  const deviceName = childType.model ?? childType.slug;
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const autoImport =
    childType && !layout.device_types.find((dt) => dt.slug === deviceTypeSlug)
      ? childType
      : undefined;
  const placeCommand = createPlaceDeviceCommand(
    placedDevice,
    adapter,
    deviceName,
  );

  if (autoImport) {
    const importCommand = createAddDeviceTypeCommand(autoImport, adapter);
    const batch = createBatchCommand(`Place ${deviceName}`, [
      importCommand,
      placeCommand,
    ]);
    history.execute(batch);
  } else {
    history.execute(placeCommand);
  }
  ctx.markDirty();

  return true;
}

/**
 * Place a device carrier-first.
 *
 * Half-width gear cannot register to the rails directly. This flow:
 * 1. Devices with no applicable carrier (full-width) fall through to a normal
 *    rail placement.
 * 2. Otherwise it prefers an existing carrier of the right kind at the target U
 *    that has a free cell, and fills that cell.
 * 3. Failing that, it synthesises a carrier (marked auto_created) at the target
 *    U and places the device in its first cell, as a single undo entry.
 *
 * @param ctx - Layout state access
 * @param rackId - Target rack ID
 * @param deviceTypeSlug - Device type slug being placed
 * @param positionU - U position (human-readable)
 * @param face - Optional face assignment for the rail-placement fall-through
 * @returns true if placed successfully
 */
export function placeDeviceSmart(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceTypeSlug: string,
  positionU: number,
  face?: DeviceFace,
): boolean {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return false;

  const layout = ctx.getLayout();
  const deviceType = findDeviceType(deviceTypeSlug, layout.device_types);
  if (!deviceType) return false;

  const carrierSlug = synthesizeCarrierForDevice(deviceType);

  // Whole-U full-width devices mount directly to the rails.
  if (!carrierSlug) {
    return placeDeviceRecorded(ctx, rackId, deviceTypeSlug, positionU, face);
  }

  ctx.setActiveRackId(rackId);

  // Prefer an existing carrier of the right kind at this U with a free cell.
  const positionInternal = toInternalUnits(positionU);
  const existingCarrier = targetRack.devices.find(
    (d) =>
      !d.container_id &&
      d.device_type === carrierSlug &&
      d.position === positionInternal,
  );

  if (existingCarrier) {
    const carrierType = findDeviceType(carrierSlug, layout.device_types);
    if (!carrierType) return false;
    // Only consider cells the child actually fits (width/height/category).
    const fittingSlots = (carrierType.slots ?? []).filter((slot) =>
      canPlaceInSlot(deviceType, slot),
    );
    if (fittingSlots.length === 0) return false;
    const children = targetRack.devices.filter(
      (d) => d.container_id === existingCarrier.id,
    );
    const free = findNextFreeChildPosition(
      { ...carrierType, slots: fittingSlots },
      children,
    );
    if (!free) return false;
    return placeInContainer(
      ctx,
      rackId,
      deviceTypeSlug,
      existingCarrier.id,
      free.slotId,
      free.position,
    );
  }

  // Synthesise a new carrier and place the child inside it.
  const carrierType = findDeviceType(carrierSlug, layout.device_types);
  if (!carrierType) return false;

  // Carriers are whole-U full-width: validate the rail slot is free.
  if (
    !canPlaceDevice(
      targetRack,
      layout.device_types,
      carrierType.u_height,
      positionInternal,
      undefined,
      "both",
    )
  ) {
    return false;
  }

  // Only place into a cell the child actually fits. The carrier mapping
  // guarantees a fit for the standard sizes; reject odd dimensions rather than
  // commit an invalid placement.
  const fittingSlots = (carrierType.slots ?? []).filter((slot) =>
    canPlaceInSlot(deviceType, slot),
  );
  const free = findNextFreeChildPosition(
    { ...carrierType, slots: fittingSlots },
    [],
  );
  if (!free) return false;

  const carrierDevice: PlacedDevice = {
    id: generateId(),
    device_type: carrierSlug,
    position: positionInternal,
    face: "both",
    auto_created: true,
    ports: instantiatePorts(carrierType),
  };

  const childDevice: PlacedDevice = {
    id: generateId(),
    device_type: deviceTypeSlug,
    position: free.position,
    face: carrierDevice.face,
    container_id: carrierDevice.id,
    slot_id: free.slotId,
    ports: instantiatePorts(deviceType),
  };

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  const childName = deviceType.model ?? deviceType.slug;

  const commands = [];

  // Auto-import the carrier and child types if not already in the layout.
  const carrierImport = !layout.device_types.find((dt) => dt.slug === carrierSlug)
    ? createAddDeviceTypeCommand(carrierType, adapter)
    : undefined;
  if (carrierImport) commands.push(carrierImport);

  const childImport = !layout.device_types.find(
    (dt) => dt.slug === deviceTypeSlug,
  )
    ? createAddDeviceTypeCommand(deviceType, adapter)
    : undefined;
  if (childImport) commands.push(childImport);

  commands.push(createPlaceDeviceCommand(carrierDevice, adapter, "Carrier"));
  commands.push(createPlaceDeviceCommand(childDevice, adapter, childName));

  history.execute(createBatchCommand(`Place ${childName}`, commands));
  ctx.markDirty();

  return true;
}

/**
 * Move a device from one rack to another
 * Supports both within-rack moves (delegates to moveDeviceRecorded) and cross-rack moves.
 * @param ctx - Layout state access
 * @param fromRackId - Source rack ID
 * @param deviceIndex - Device index in the source rack
 * @param toRackId - Target rack ID
 * @param newPosition - New position in U (human-readable)
 * @param face - Optional face assignment
 * @param snapshotDevice - Snapshot function (deep-clones the reactive proxy)
 * @returns true if moved successfully
 */
export function moveDeviceToRack(
  ctx: LayoutStateAccess,
  fromRackId: string,
  deviceIndex: number,
  toRackId: string,
  newPosition: number,
  face: DeviceFace | undefined,
  snapshotDevice: SnapshotDeviceFn,
): boolean {
  // Same-rack move — delegate to existing function (face bundled into single undo entry)
  if (fromRackId === toRackId) {
    return moveDeviceRecorded(ctx, fromRackId, deviceIndex, newPosition, face);
  }

  // Cross-rack move
  const sourceRack = getRackById(ctx, fromRackId);
  const targetRack = getRackById(ctx, toRackId);
  if (!sourceRack || !targetRack) return false;
  if (deviceIndex < 0 || deviceIndex >= sourceRack.devices.length) return false;

  const layout = ctx.getLayout();
  const device = sourceRack.devices[deviceIndex]!;
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  if (!deviceType) return false;

  // Carrier-first rule (#2158/C4): a cross-rack move lands on a rail position in
  // the target rack. A carrier-requiring device cannot rail-mount, so refuse
  // rather than create an invalid placement in the destination rack.
  if (requiresCarrier(deviceType)) return false;

  // Resolve face: use provided face, or infer from device type
  const effectiveFace: DeviceFace =
    face ??
    (deviceType.is_full_depth !== false ? "both" : (device.face ?? "front"));
  const positionInternal = toInternalUnits(newPosition);

  // Validate placement in target rack (no excludeIndex — device isn't in target rack yet)
  if (
    !canPlaceDevice(
      targetRack,
      layout.device_types,
      deviceType.u_height,
      positionInternal,
      undefined,
      effectiveFace,
    )
  ) {
    return false;
  }

  // Collect container children
  const children = sourceRack.devices.filter(
    (d) => d.container_id === device.id,
  );
  const parentSnapshot = snapshotDevice(device);
  const childrenSnapshots = children.map((child) => snapshotDevice(child));

  // Compute removal indices sorted descending for safe removal
  const allRemovals = [
    { index: deviceIndex },
    ...children.map((child) => ({
      index: sourceRack.devices.indexOf(child),
    })),
  ].sort((a, b) => b.index - a.index);
  const sortedRemovalIndices = allRemovals.map((r) => r.index);

  const deviceName = deviceType.model ?? deviceType.slug;

  // Set active rack for command creation
  ctx.setActiveRackId(fromRackId);

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createCrossRackMoveCommand(
    fromRackId,
    sortedRemovalIndices,
    toRackId,
    positionInternal,
    effectiveFace,
    parentSnapshot,
    childrenSnapshots,
    adapter,
    deviceName,
    layout.metadata?.id ?? "",
  );

  history.execute(command);
  ctx.markDirty();
  return true;
}
