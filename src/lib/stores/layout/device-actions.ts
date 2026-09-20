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

import type { DeviceFace, DeviceType, PlacedDevice, Rack } from "$lib/types";
import { UNITS_PER_U } from "$lib/types/constants";
import {
  canPlaceDevice,
  canPlaceInContainer,
  canPlaceInSlot,
  findAdjacentSlotForChild,
  findChildrenTooWideForRack,
  findValidDropPositions,
  findNextFreeChildPosition,
  findNextSlotForChild,
  synthesizeCarrierForDevice,
  type CellDirection,
} from "$lib/utils/collision";
import { requiresCarrier, getRackOpeningMm } from "$lib/utils/device-width";
import {
  buildCustomCarrierType,
  cellForDevice,
  isGeneratedCarrier,
  isOrphanedAfterRetype,
  CUSTOM_CARRIER_SLUG_PATTERN,
} from "$lib/utils/custom-carrier";
import { fitsInRow, gapsFor, remainingMm } from "$lib/utils/slot-layout";
import { findDeviceType as findDeviceTypeInArray } from "$lib/stores/layout-helpers";
import { findDeviceType } from "$lib/utils/device-lookup";
import { generateId } from "$lib/utils/device";
import { toInternalUnits } from "$lib/utils/position";
import { instantiatePorts } from "$lib/utils/port-utils";
import {
  createPlaceDeviceCommand,
  createAddDeviceTypeCommand,
  createDeleteDeviceTypeCommand,
  createRetypeDeviceCommand,
  createBatchCommand,
  createCrossRackMoveCommand,
  createInRackCommand,
  createMoveToSlotCommand,
  createRemoveConnectionCommand,
  createRemoveDeviceCommand,
  createReparentDeviceCommand,
  type Command,
  type DevicePlacement,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getCommandStoreAdapter } from "./command-adapters";
import { getRackById } from "./rack-actions";
import {
  findEmptiedAutoCarrier,
  moveDeviceRecorded,
  placeDeviceRecorded,
} from "./recorded-device-actions";
import { findConnectionsForDevices } from "./recorded-device-type-actions";
import { getToastStore } from "$lib/stores/toast.svelte";
import { CARRIER_HINT_MESSAGE } from "$lib/constants/toast-messages";

/** Snapshot function injected by the facade ($state.snapshot is a rune). */
export type SnapshotDeviceFn = (device: PlacedDevice) => PlacedDevice;

// The carrier hint (#2165) explains the first auto-created carrier of a page
// load, so the bracket is not a surprise, and stays quiet after that.
let carrierHintShown = false;

function showCarrierHintOnce(): void {
  if (carrierHintShown) return;
  carrierHintShown = true;
  getToastStore().showToast(CARRIER_HINT_MESSAGE, "info");
}

/** Re-arm the once-per-page-load carrier hint (for testing). */
export function resetCarrierHint(): void {
  carrierHintShown = false;
}

/**
 * Duplicate a placed device within a rack
 * Places the duplicate in the next available slot on the same face
 * Inherits all properties (custom label, image overrides, colour)
 * A carrier is copied with its children; a carrier child is copied into the
 * next free cell of its own carrier (#2295)
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

  // A carrier child is duplicated into a free cell of its own carrier. It must
  // never land on the rails: sub-U / half-width gear there fails the schema.
  if (sourceDevice.container_id) {
    return duplicateContainerChild(
      ctx,
      sourceRack,
      sourceDevice,
      deviceType,
      snapshotDevice,
    );
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

  // A carrier is deep-copied: each child gets a new id and fresh ports and is
  // linked to the copy, all in the same undo step as the copy itself.
  const children = sourceRack.devices.filter(
    (d) => d.container_id === sourceDevice.id,
  );
  const childCommands = children.map((child) => {
    const childType = findDeviceType(child.device_type, layout.device_types);
    const childCopy: PlacedDevice = {
      ...snapshotDevice(child),
      id: generateId(),
      container_id: duplicatedDevice.id,
      ports: childType ? instantiatePorts(childType) : undefined,
    };
    return createPlaceDeviceCommand(childCopy, adapter, childType?.model);
  });
  const placeCommand =
    childCommands.length > 0
      ? createBatchCommand(`Place ${deviceName} (Copy)`, [
          command,
          ...childCommands,
        ])
      : command;
  // Pinned to this rack so undo/redo after selecting another rack still act
  // on the copy and its children here.
  history.execute(createInRackCommand(rackId, placeCommand, adapter));
  ctx.markDirty();

  return { device: duplicatedDevice };
}

/**
 * Duplicate a carrier child into the next free cell of the same carrier,
 * scanning forward from the source's cell. Refuses with an error when no cell
 * fits, so the copy never falls back to the rails.
 */
function duplicateContainerChild(
  ctx: LayoutStateAccess,
  rack: Rack,
  child: PlacedDevice,
  childType: DeviceType,
  snapshotDevice: SnapshotDeviceFn,
): { error?: string; device?: PlacedDevice } {
  const layout = ctx.getLayout();
  const container = rack.devices.find((d) => d.id === child.container_id);
  const containerType = container
    ? findDeviceType(container.device_type, layout.device_types)
    : undefined;
  if (!container || !containerType || !child.slot_id) {
    return { error: "Cannot duplicate: carrier not found" };
  }

  const siblings = rack.devices.filter(
    (d) => d.container_id === container.id && d.id !== child.id,
  );
  const next = findNextSlotForChild(
    containerType,
    childType,
    child.slot_id,
    siblings,
    rack.width,
  );
  if (!next) {
    const containerName = containerType.model ?? containerType.slug;
    return { error: `Cannot duplicate: no free cell in ${containerName}` };
  }

  const duplicatedDevice: PlacedDevice = {
    ...snapshotDevice(child),
    id: generateId(),
    slot_id: next.slotId,
    position: 0,
    ports: instantiatePorts(childType),
  };

  ctx.setActiveRackId(rack.id);
  const deviceName = childType.model ?? childType.slug;
  const adapter = getCommandStoreAdapter(ctx);
  ctx
    .getHistory()
    .execute(
      createInRackCommand(
        rack.id,
        createPlaceDeviceCommand(
          duplicatedDevice,
          adapter,
          `${deviceName} (Copy)`,
        ),
        adapter,
      ),
    );
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
 * Move a contained child to the next free, fitting cell of its own carrier.
 *
 * Cycles the child through the carrier's cells (wrapping around) without ever
 * detaching it: container_id is preserved and only slot_id changes, so the
 * contained-device guard (#2146) holds by construction. No-op (returns false)
 * when the device is not a carrier child or the carrier has no other reachable
 * cell.
 *
 * @param ctx - Layout state access
 * @param rackId - Rack containing the child and its carrier
 * @param deviceIndex - Index of the child in the rack's devices array
 * @returns true if the child moved to a new cell
 */
export function moveDeviceToSlot(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
): boolean {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return false;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return false;

  const child = targetRack.devices[deviceIndex]!;
  if (!child.container_id || !child.slot_id) return false;

  const layout = ctx.getLayout();
  const childType = findDeviceType(child.device_type, layout.device_types);
  if (!childType) return false;

  const container = targetRack.devices.find((d) => d.id === child.container_id);
  if (!container) return false;
  const containerType = findDeviceType(
    container.device_type,
    layout.device_types,
  );
  if (!containerType) return false;

  const siblings = targetRack.devices.filter(
    (d) => d.container_id === container.id && d.id !== child.id,
  );

  const next = findNextSlotForChild(
    containerType,
    childType,
    child.slot_id,
    siblings,
    targetRack.width,
  );
  if (!next) return false;

  ctx.setActiveRackId(rackId);
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  const deviceName = childType.model ?? childType.slug;

  history.execute(
    createMoveToSlotCommand(
      deviceIndex,
      container.id,
      child.slot_id,
      next.slotId,
      adapter,
      deviceName,
    ),
  );
  ctx.markDirty();
  return true;
}

/**
 * Move a contained child to the nearest free cell in one direction within its
 * own carrier (arrow keys, #2295). Like moveDeviceToSlot it only changes
 * slot_id, so the child is never ejected. No-op (returns false) when the device
 * is not a carrier child or no free cell lies that way.
 *
 * @param ctx - Layout state access
 * @param rackId - Rack containing the child and its carrier
 * @param deviceIndex - Index of the child in the rack's devices array
 * @param direction - Which way to move
 * @returns true if the child moved to a new cell
 */
export function moveDeviceToAdjacentSlot(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  direction: CellDirection,
): boolean {
  const targetRack = getRackById(ctx, rackId);
  const child = targetRack?.devices[deviceIndex];
  if (!targetRack || !child?.container_id || !child.slot_id) return false;

  const layout = ctx.getLayout();
  const childType = findDeviceType(child.device_type, layout.device_types);
  const container = targetRack.devices.find((d) => d.id === child.container_id);
  const containerType = container
    ? findDeviceType(container.device_type, layout.device_types)
    : undefined;
  if (!childType || !container || !containerType) return false;

  const siblings = targetRack.devices.filter(
    (d) => d.container_id === container.id && d.id !== child.id,
  );
  const next = findAdjacentSlotForChild(
    containerType,
    childType,
    child.slot_id,
    siblings,
    direction,
    targetRack.width,
  );
  if (!next) return false;

  ctx.setActiveRackId(rackId);
  const adapter = getCommandStoreAdapter(ctx);
  ctx
    .getHistory()
    .execute(
      createInRackCommand(
        rackId,
        createMoveToSlotCommand(
          deviceIndex,
          container.id,
          child.slot_id,
          next.slotId,
          adapter,
          childType.model ?? childType.slug,
        ),
        adapter,
      ),
    );
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

  const carrierPlan = synthesizeCarrierForDevice(deviceType, targetRack.width);
  const carrierSlug = carrierPlan?.slug ?? null;

  // Whole-U full-width devices mount directly to the rails.
  if (!carrierPlan || !carrierSlug) {
    return placeDeviceRecorded(ctx, rackId, deviceTypeSlug, positionU, face);
  }

  ctx.setActiveRackId(rackId);

  // Prefer an existing carrier of the right kind at this U with a free cell.
  // A generated carrier also qualifies whatever its slug: its slug encodes the
  // split it holds now, which stopped matching the incoming device's one-cell
  // slug the moment it grew its second cell.
  const positionInternal = toInternalUnits(positionU);
  const existingCarrier = targetRack.devices.find(
    (d) =>
      !d.container_id &&
      d.position === positionInternal &&
      (d.device_type === carrierSlug ||
        CUSTOM_CARRIER_SLUG_PATTERN.test(d.device_type)),
  );

  if (existingCarrier) {
    const carrierType =
      findDeviceType(existingCarrier.device_type, layout.device_types) ??
      carrierPlan.type;
    if (!carrierType) return false;

    // A generated carrier grows a cell rather than turning the drop away: the
    // split is the feature, and two cells were never its limit.
    if (isGeneratedCarrier(carrierType)) {
      return extendCustomCarrier(
        ctx,
        rackId,
        existingCarrier.id,
        deviceTypeSlug,
      );
    }
    // Only consider cells the child actually fits (width/height/category).
    const fittingSlots = (carrierType.slots ?? []).filter((slot) =>
      canPlaceInSlot(deviceType, slot, targetRack.width),
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
  const carrierType =
    findDeviceType(carrierSlug, layout.device_types) ?? carrierPlan.type;
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
    canPlaceInSlot(deviceType, slot, targetRack.width),
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
  const carrierImport = !layout.device_types.find(
    (dt) => dt.slug === carrierSlug,
  )
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
  showCarrierHintOnce();

  return true;
}

/**
 * Add a cell to a generated carrier and place a device in it, in one undo
 * step. The new cell is the device's own width and a 0 mm gap precedes it, so
 * the row reads exactly as it did plus one device.
 *
 * Refuses when the row cannot take the width, naming what is left rather than
 * reporting "No space": the rack has plenty of room, this row does not.
 *
 * @param ctx - Layout state access
 * @param rackId - Rack holding the carrier
 * @param carrierId - The placed generated carrier
 * @param deviceTypeSlug - The device being added
 * @returns true when the device sits in a new cell afterwards
 */
export function extendCustomCarrier(
  ctx: LayoutStateAccess,
  rackId: string,
  carrierId: string,
  deviceTypeSlug: string,
): boolean {
  const rack = getRackById(ctx, rackId);
  if (!rack) return false;

  const layout = ctx.getLayout();
  const carrier = rack.devices.find((d) => d.id === carrierId);
  const deviceType = findDeviceType(deviceTypeSlug, layout.device_types);
  const carrierType = carrier
    ? findDeviceType(carrier.device_type, layout.device_types)
    : undefined;
  if (!carrier || !deviceType || !carrierType) return false;
  if (!isGeneratedCarrier(carrierType)) return false;

  const cell = cellForDevice(deviceType, rack.width);
  const cellMm = cell.widthFraction * getRackOpeningMm(rack.width);

  // Joining an existing row adds a boundary, and a new boundary starts at no
  // gap so the row keeps the shape the user already sees.
  const NEW_CELL_GAP_MM = 0;

  if (!fitsInRow(carrierType, rack.width, cellMm + NEW_CELL_GAP_MM)) {
    getToastStore().showToast(
      `Only ${Math.round(remainingMm(carrierType, rack.width))} mm left in this carrier, ` +
        `${Math.round(cellMm)} mm needed`,
      "warning",
    );
    return false;
  }

  // The carrier's rail height is fixed; a taller device needs its own.
  if (cell.heightUnits > carrierType.u_height) return false;

  const cells = (carrierType.slots ?? []).map((slot) => ({
    widthFraction: slot.width_fraction ?? 1.0,
    heightUnits: slot.height_units ?? 1,
  }));
  const grown = buildCustomCarrierType(
    carrierType.u_height,
    [...cells, cell],
    [...gapsFor(carrierType), NEW_CELL_GAP_MM],
  );

  ctx.setActiveRackId(rackId);
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  const childName = deviceType.model ?? deviceType.slug;
  const commands = [];

  // Copy on write: the grown split fingerprints differently, so it is a new
  // type and any other carrier still on the old one is untouched.
  if (!layout.device_types.some((dt) => dt.slug === grown.slug)) {
    commands.push(createAddDeviceTypeCommand(grown, adapter));
  }
  if (!layout.device_types.some((dt) => dt.slug === deviceTypeSlug)) {
    commands.push(createAddDeviceTypeCommand(deviceType, adapter));
  }
  commands.push(
    createRetypeDeviceCommand(
      carrier.id,
      carrierType.slug,
      grown.slug,
      adapter,
    ),
  );
  // The split the carrier just left is a type of its own. Without this a row
  // grown from one cell to four strands three types in the file's library.
  if (isOrphanedAfterRetype(layout.racks, carrierType.slug, carrier.id)) {
    commands.push(
      createDeleteDeviceTypeCommand(
        carrierType,
        [],
        adapter,
        layout.metadata?.id ?? "",
      ),
    );
  }
  commands.push(
    createPlaceDeviceCommand(
      {
        id: generateId(),
        device_type: deviceTypeSlug,
        position: 0,
        face: carrier.face,
        container_id: carrier.id,
        slot_id: `col-${cells.length + 1}`,
        ports: instantiatePorts(deviceType),
      },
      adapter,
      childName,
    ),
  );

  history.execute(createBatchCommand(`Place ${childName}`, commands));
  ctx.markDirty();
  return true;
}

/**
 * Move an existing placed device into a container cell, in the same rack or
 * another one, keeping its identity: id, ports (so connections survive), name,
 * notes, colour, images and custom fields (#2295). One undo step. When the
 * device leaves an auto-created carrier empty, that carrier goes in the same
 * step.
 *
 * Refuses (returns false, nothing changes) when the cell does not fit or is
 * taken, or when the device is itself a container (containers do not nest).
 *
 * @returns true if the device is in the requested cell afterwards
 */
export function moveDeviceIntoContainer(
  ctx: LayoutStateAccess,
  fromRackId: string,
  deviceIndex: number,
  toRackId: string,
  containerId: string,
  slotId: string,
  position: number,
  snapshotDevice: SnapshotDeviceFn,
): boolean {
  const sourceRack = getRackById(ctx, fromRackId);
  const targetRack = getRackById(ctx, toRackId);
  if (!sourceRack || !targetRack) return false;
  const device = sourceRack.devices[deviceIndex];
  if (!device) return false;

  const layout = ctx.getLayout();
  const deviceType = findDeviceType(device.device_type, layout.device_types);
  const container = targetRack.devices.find((d) => d.id === containerId);
  const containerType = container
    ? findDeviceType(container.device_type, layout.device_types)
    : undefined;
  if (!deviceType || !container || !containerType) return false;
  // Containers never nest (single-level nesting, LayoutSchema), which also
  // stops a container being dropped into its own cell.
  if (deviceType.slots?.length) return false;

  if (
    device.container_id === container.id &&
    device.slot_id === slotId &&
    device.position === position
  ) {
    return true;
  }

  if (
    !canPlaceInContainer(
      targetRack,
      layout.device_types,
      container,
      containerType,
      deviceType,
      slotId,
      position,
      device.id,
    )
  ) {
    return false;
  }

  return commitReparent(
    ctx,
    sourceRack,
    targetRack,
    device,
    deviceType,
    {
      position,
      face: container.face,
      container_id: container.id,
      slot_id: slotId,
    },
    [],
    snapshotDevice,
  );
}

/**
 * Move an existing placed device carrier-first, the move counterpart of
 * placeDeviceSmart. Gear that needs no carrier moves on the rails via
 * moveDeviceToRack. Otherwise the device joins a free, fitting cell of a
 * matching carrier at the target U, or a new auto-created carrier synthesised
 * there. Either way it keeps its identity and the move is one undo step, with
 * any auto-created carrier it leaves empty removed in that step (#2295).
 *
 * @returns true if moved successfully
 */
export function moveDeviceSmart(
  ctx: LayoutStateAccess,
  fromRackId: string,
  deviceIndex: number,
  toRackId: string,
  positionU: number,
  face: DeviceFace | undefined,
  snapshotDevice: SnapshotDeviceFn,
): boolean {
  const sourceRack = getRackById(ctx, fromRackId);
  const targetRack = getRackById(ctx, toRackId);
  if (!sourceRack || !targetRack) return false;
  const device = sourceRack.devices[deviceIndex];
  if (!device) return false;

  const layout = ctx.getLayout();
  const deviceType = findDeviceType(device.device_type, layout.device_types);
  if (!deviceType) return false;

  const carrierPlan = synthesizeCarrierForDevice(deviceType, targetRack.width);
  const carrierSlug = carrierPlan?.slug ?? null;
  if (!carrierPlan || !carrierSlug) {
    return moveDeviceToRack(
      ctx,
      fromRackId,
      deviceIndex,
      toRackId,
      positionU,
      face,
      snapshotDevice,
    );
  }

  // Containers never nest (single-level nesting, LayoutSchema).
  if (deviceType.slots?.length) return false;

  const carrierType =
    findDeviceType(carrierSlug, layout.device_types) ?? carrierPlan.type;
  if (!carrierType) return false;
  const carrierCells = {
    ...carrierType,
    slots: (carrierType.slots ?? []).filter((slot) =>
      canPlaceInSlot(deviceType, slot, targetRack.width),
    ),
  };
  const positionInternal = toInternalUnits(positionU);

  // Prefer an existing carrier of the right kind at this U with a free cell.
  const existingCarrier = targetRack.devices.find(
    (d) =>
      !d.container_id &&
      d.device_type === carrierSlug &&
      d.position === positionInternal,
  );
  if (existingCarrier) {
    const others = targetRack.devices.filter(
      (d) => d.container_id === existingCarrier.id && d.id !== device.id,
    );
    const free = findNextFreeChildPosition(carrierCells, others);
    if (!free) return false;
    return moveDeviceIntoContainer(
      ctx,
      fromRackId,
      deviceIndex,
      toRackId,
      existingCarrier.id,
      free.slotId,
      free.position,
      snapshotDevice,
    );
  }

  // Otherwise synthesise a carrier at this U (a whole-U, full-width rail
  // placement) and move the device into its first fitting cell.
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
  const free = findNextFreeChildPosition(carrierCells, []);
  if (!free) return false;

  const carrierDevice: PlacedDevice = {
    id: generateId(),
    device_type: carrierSlug,
    position: positionInternal,
    face: "both",
    auto_created: true,
    ports: instantiatePorts(carrierType),
  };
  const adapter = getCommandStoreAdapter(ctx);
  const setupCommands: Command[] = [];
  if (!layout.device_types.some((dt) => dt.slug === carrierSlug)) {
    setupCommands.push(createAddDeviceTypeCommand(carrierType, adapter));
  }
  setupCommands.push(
    createInRackCommand(
      targetRack.id,
      createPlaceDeviceCommand(carrierDevice, adapter, "Carrier"),
      adapter,
    ),
  );

  const moved = commitReparent(
    ctx,
    sourceRack,
    targetRack,
    device,
    deviceType,
    {
      position: free.position,
      face: carrierDevice.face,
      container_id: carrierDevice.id,
      slot_id: free.slotId,
    },
    setupCommands,
    snapshotDevice,
  );
  if (moved) showCarrierHintOnce();
  return moved;
}

/**
 * Execute a reparent as one undo step: any setup commands (a new carrier),
 * the identity-preserving move, then removal of an auto-created carrier the
 * device left empty, along with that carrier's connections.
 */
function commitReparent(
  ctx: LayoutStateAccess,
  sourceRack: Rack,
  targetRack: Rack,
  device: PlacedDevice,
  deviceType: DeviceType,
  placement: DevicePlacement,
  setupCommands: Command[],
  snapshotDevice: SnapshotDeviceFn,
): boolean {
  const layout = ctx.getLayout();
  const layoutId = layout.metadata?.id ?? "";
  const adapter = getCommandStoreAdapter(ctx);
  const deviceName = deviceType.model ?? deviceType.slug;

  const commands: Command[] = [
    ...setupCommands,
    createReparentDeviceCommand(
      sourceRack.id,
      targetRack.id,
      snapshotDevice(device),
      placement,
      adapter,
      deviceName,
      layoutId,
    ),
  ];

  const emptiedCarrier =
    placement.container_id === device.container_id
      ? undefined
      : findEmptiedAutoCarrier(sourceRack, device);
  if (emptiedCarrier) {
    const carrierSnapshot = snapshotDevice(emptiedCarrier);
    for (const connection of findConnectionsForDevices(ctx, [
      { rackId: sourceRack.id, device: carrierSnapshot },
    ])) {
      commands.push(
        createRemoveConnectionCommand(
          connection,
          adapter,
          `Remove connection ${connection.label ?? connection.id}`,
        ),
      );
    }
    commands.push(
      createInRackCommand(
        sourceRack.id,
        createRemoveDeviceCommand(
          carrierSnapshot,
          adapter,
          "carrier",
          layoutId,
        ),
        adapter,
      ),
    );
  }

  ctx.setActiveRackId(targetRack.id);
  ctx.getHistory().execute(createBatchCommand(`Move ${deviceName}`, commands));
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

  // Cell fit for measured children depends on the rack opening.
  if (
    findChildrenTooWideForRack(
      [device, ...children],
      layout.device_types,
      targetRack.width,
    ).length > 0
  ) {
    return false;
  }
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
