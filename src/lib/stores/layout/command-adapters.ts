/**
 * Command Adapters for Layout Store
 *
 * Extracted from layout.svelte.ts — provides the bridge between the
 * command system (undo/redo) and the raw mutators. Contains:
 *
 * 1. getCommandStoreAdapter() — creates adapter objects implementing
 *    DeviceTypeCommandStore, DeviceCommandStore, and RackCommandStore
 * 2. Recorded actions — functions that create Command objects wrapping
 *    raw mutators, then execute them through the history system
 */

import type {
  DeviceFace,
  DeviceType,
  PlacedDevice,
  Rack,
  SlotPosition,
} from "$lib/types";
import { UNITS_PER_U } from "$lib/types/constants";
import { toInternalUnits, toHumanUnits } from "$lib/utils/position";
import {
  canPlaceDevice,
  isSlotOccupied,
} from "$lib/utils/collision";
import {
  createDeviceType as createDeviceTypeHelper,
  findDeviceType as findDeviceTypeInArray,
  type CreateDeviceTypeInput,
} from "$lib/stores/layout-helpers";
import { findDeviceType } from "$lib/utils/device-lookup";
import { debug, layoutDebug } from "$lib/utils/debug";
import { generateId } from "$lib/utils/device";
import { instantiatePorts } from "$lib/utils/port-utils";
import { DEFAULT_DEVICE_FACE } from "$lib/types/constants";
import { getHistoryStore } from "../history.svelte";
import {
  createAddDeviceTypeCommand,
  createUpdateDeviceTypeCommand,
  createDeleteDeviceTypeCommand,
  createPlaceDeviceCommand,
  createMoveDeviceCommand,
  createRemoveDeviceCommand,
  createUpdateDeviceFaceCommand,
  createUpdateDeviceNameCommand,
  createUpdateDevicePlacementImageCommand,
  createUpdateDeviceColourCommand,
  createUpdateDeviceSlotPositionCommand,
  createUpdateDeviceNotesCommand,
  createUpdateDeviceIpCommand,
  createUpdateRackCommand,
  createClearRackCommand,
  createBatchCommand,
  type DeviceTypeCommandStore,
  type DeviceCommandStore,
  type RackCommandStore,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getTargetRack, getRackById } from "./rack-actions";
import {
  addDeviceTypeRaw,
  removeDeviceTypeRaw,
  updateDeviceTypeRaw,
  placeDeviceRaw,
  removeDeviceAtIndexRaw,
  moveDeviceRaw,
  updateDeviceFaceRaw,
  updateDeviceNameRaw,
  updateDevicePlacementImageRaw,
  updateDeviceColourRaw,
  updateDeviceSlotPositionRaw,
  updateDeviceNotesRaw,
  updateDeviceIpRaw,
  getDeviceAtIndex,
  getPlacedDevicesForType,
  getPlacedDevicesWithRackForType,
  updateRackRaw,
  replaceRackRaw,
  clearRackDevicesRaw,
  restoreRackDevicesRaw,
} from "./mutators";

// =============================================================================
// Command Store Adapter
// Creates an adapter that implements the command store interfaces
// Operations target the active rack
// =============================================================================

/**
 * Resolve the rack ID for adapter operations.
 * Uses active rack, validates it exists, and warns on fallback.
 */
function resolveAdapterRackId(ctx: LayoutStateAccess, caller: string): string | undefined {
  const activeId = ctx.getActiveRackId();
  if (activeId) {
    // Validate the active rack still exists
    if (ctx.findRack(activeId)) {
      return activeId;
    }
    layoutDebug.device("%s: activeRackId '%s' is stale (rack no longer exists), falling back", caller, activeId);
  }
  // Fall back to first rack
  const target = getTargetRack(ctx);
  if (target) {
    return target.rack.id;
  }
  return undefined;
}

/**
 * Check if a device type needs auto-importing from starter/brand packs.
 * Returns the device type if it needs importing, undefined otherwise.
 */
function getAutoImportDeviceType(
  ctx: LayoutStateAccess,
  deviceTypeSlug: string,
  resolvedType: DeviceType | undefined,
): DeviceType | undefined {
  if (
    resolvedType &&
    !ctx.getLayout().device_types.find((dt) => dt.slug === deviceTypeSlug)
  ) {
    return resolvedType;
  }
  return undefined;
}

/**
 * Create a command store adapter implementing DeviceTypeCommandStore,
 * DeviceCommandStore, and RackCommandStore interfaces.
 * Used by the command (undo/redo) system to call raw mutators.
 * @param ctx - Layout state access
 */
export function getCommandStoreAdapter(
  ctx: LayoutStateAccess,
): DeviceTypeCommandStore & DeviceCommandStore & RackCommandStore {
  return {
    // DeviceTypeCommandStore
    addDeviceTypeRaw: (deviceType) => addDeviceTypeRaw(ctx, deviceType),
    removeDeviceTypeRaw: (slug) => removeDeviceTypeRaw(ctx, slug),
    updateDeviceTypeRaw: (slug, updates) =>
      updateDeviceTypeRaw(ctx, slug, updates),
    placeDeviceRaw: (device) => placeDeviceRaw(ctx, device),
    removeDeviceAtIndexRaw: (index) => removeDeviceAtIndexRaw(ctx, index),
    getPlacedDevicesForType: (slug) => getPlacedDevicesForType(ctx, slug),
    setActiveRackId: (id) => ctx.setActiveRackId(id),
    getActiveRackId: () => ctx.getActiveRackId(),

    // DeviceCommandStore
    moveDeviceRaw: (index, newPosition) =>
      moveDeviceRaw(ctx, index, newPosition),
    updateDeviceFaceRaw: (index, face) =>
      updateDeviceFaceRaw(ctx, index, face),
    updateDeviceNameRaw: (index, name) =>
      updateDeviceNameRaw(ctx, index, name),
    updateDevicePlacementImageRaw: (index, face, filename) => {
      const rackId = resolveAdapterRackId(ctx, "updateDevicePlacementImageRaw");
      if (!rackId) {
        layoutDebug.device("updateDevicePlacementImageRaw: No rack available");
        return;
      }
      updateDevicePlacementImageRaw(ctx, rackId, index, face, filename);
    },
    updateDeviceColourRaw: (index, colour) => {
      const rackId = resolveAdapterRackId(ctx, "updateDeviceColourRaw");
      if (!rackId) {
        layoutDebug.device("updateDeviceColourRaw: No rack available");
        return;
      }
      updateDeviceColourRaw(ctx, rackId, index, colour);
    },
    updateDeviceSlotPositionRaw: (index, slotPosition) => {
      const rackId = resolveAdapterRackId(ctx, "updateDeviceSlotPositionRaw");
      if (!rackId) {
        layoutDebug.device("updateDeviceSlotPositionRaw: No rack available");
        return;
      }
      updateDeviceSlotPositionRaw(ctx, rackId, index, slotPosition);
    },
    updateDeviceNotesRaw: (index, notes) => {
      const rackId = resolveAdapterRackId(ctx, "updateDeviceNotesRaw");
      if (!rackId) {
        layoutDebug.device("updateDeviceNotesRaw: No rack available");
        return;
      }
      updateDeviceNotesRaw(ctx, rackId, index, notes);
    },
    updateDeviceIpRaw: (index, ip) => {
      const rackId = resolveAdapterRackId(ctx, "updateDeviceIpRaw");
      if (!rackId) {
        layoutDebug.device("updateDeviceIpRaw: No rack available");
        return;
      }
      updateDeviceIpRaw(ctx, rackId, index, ip);
    },
    getDeviceAtIndex: (index) => getDeviceAtIndex(ctx, index),

    // RackCommandStore
    updateRackRaw: (updates) => updateRackRaw(ctx, updates),
    replaceRackRaw: (newRack) => replaceRackRaw(ctx, newRack),
    clearRackDevicesRaw: () => clearRackDevicesRaw(ctx),
    restoreRackDevicesRaw: (devices) => restoreRackDevicesRaw(ctx, devices),
    getRack: () => {
      const target = getTargetRack(ctx);
      const layout = ctx.getLayout();
      if (!target && layout.racks.length === 0) {
        throw new Error("No rack available in RackCommandStore");
      }
      return target?.rack ?? layout.racks[0];
    },
  };
}

// =============================================================================
// Recorded Actions (with Undo/Redo support)
// These create commands and execute them through the history system
// Operations set activeRackId before executing to ensure Raw functions
// target the correct rack
// =============================================================================

/**
 * Add a device type with undo/redo support
 * @param ctx - Layout state access
 * @param data - Device type creation input
 * @returns The created device type
 */
export function addDeviceTypeRecorded(
  ctx: LayoutStateAccess,
  data: CreateDeviceTypeInput,
): DeviceType {
  const deviceType = createDeviceTypeHelper(data);
  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createAddDeviceTypeCommand(deviceType, adapter);
  history.execute(command);
  ctx.markDirty();

  return deviceType;
}

/**
 * Update a device type with undo/redo support
 * @param ctx - Layout state access
 * @param slug - Device type slug
 * @param updates - Properties to update
 */
export function updateDeviceTypeRecorded(
  ctx: LayoutStateAccess,
  slug: string,
  updates: Partial<DeviceType>,
): void {
  const layout = ctx.getLayout();
  const existing = findDeviceTypeInArray(layout.device_types, slug);
  if (!existing) return;

  // Capture before state for the fields being updated
  const before: Partial<DeviceType> = {};
  for (const key of Object.keys(updates) as (keyof DeviceType)[]) {
    before[key] = existing[key] as never;
  }

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createUpdateDeviceTypeCommand(slug, before, updates, adapter);
  history.execute(command);
  ctx.markDirty();
}

/**
 * Delete a device type with undo/redo support
 * @param ctx - Layout state access
 * @param slug - Device type slug
 */
export function deleteDeviceTypeRecorded(
  ctx: LayoutStateAccess,
  slug: string,
): void {
  const layout = ctx.getLayout();
  const existing = findDeviceTypeInArray(layout.device_types, slug);
  if (!existing) return;

  const placedDevices = getPlacedDevicesWithRackForType(ctx, slug);
  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createDeleteDeviceTypeCommand(
    existing,
    placedDevices,
    adapter,
  );
  history.execute(command);
  ctx.markDirty();
}

/**
 * Delete multiple device types with single undo/redo support
 * Used for bulk cleanup operations
 * @param ctx - Layout state access
 * @param slugs - Array of device type slugs to delete
 * @returns Number of device types actually deleted
 */
export function deleteMultipleDeviceTypesRecorded(
  ctx: LayoutStateAccess,
  slugs: string[],
): number {
  layoutDebug.state(
    "deleteMultipleDeviceTypesRecorded: received %d slugs",
    slugs.length,
  );

  if (slugs.length === 0) {
    layoutDebug.state(
      "deleteMultipleDeviceTypesRecorded: early return - no slugs",
    );
    return 0;
  }

  const layout = ctx.getLayout();
  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);
  const commands: ReturnType<typeof createDeleteDeviceTypeCommand>[] = [];

  for (const slug of slugs) {
    const existing = findDeviceTypeInArray(layout.device_types, slug);
    if (!existing) continue;

    const placedDevices = getPlacedDevicesWithRackForType(ctx, slug);
    const command = createDeleteDeviceTypeCommand(
      existing,
      placedDevices,
      adapter,
    );
    commands.push(command);
  }

  if (commands.length === 0) {
    layoutDebug.state(
      "deleteMultipleDeviceTypesRecorded: no valid commands created",
    );
    return 0;
  }

  // Create a batch command for single undo
  const count = commands.length;
  const description =
    count === 1 ? "Delete device type" : `Delete ${count} device types`;

  layoutDebug.state(
    "deleteMultipleDeviceTypesRecorded: executing batch command - %s",
    description,
  );

  const batchCommand = createBatchCommand(description, commands);
  history.execute(batchCommand);
  ctx.markDirty();

  layoutDebug.state(
    "deleteMultipleDeviceTypesRecorded: completed - deleted %d device types",
    count,
  );

  return count;
}

/**
 * Place a device with undo/redo support
 * Auto-imports brand pack devices if not already in device library
 * Face defaults based on device depth: full-depth -> 'both', half-depth -> 'front'
 * @param ctx - Layout state access
 * @param rackId - Target rack ID
 * @param deviceTypeSlug - Device type slug
 * @param positionU - U position (human-readable, e.g., 1, 5, 10)
 * @param face - Optional face assignment
 * @param slotPosition - Optional slot position for half-width devices
 * @returns true if placed successfully
 */
export function placeDeviceRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceTypeSlug: string,
  positionU: number,
  face?: DeviceFace,
  slotPosition?: SlotPosition,
): boolean {
  // Convert human U position to internal units
  const positionInternal = toInternalUnits(positionU);

  // Validate rack exists
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) {
    debug.devicePlace({
      slug: deviceTypeSlug,
      position: positionU,
      passedFace: face,
      effectiveFace: "N/A",
      deviceName: "unknown",
      isFullDepth: false,
      result: "not_found",
    });
    return false;
  }

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  const layout = ctx.getLayout();

  // Find device type across all sources (layout -> starter -> brand)
  const deviceType = findDeviceType(deviceTypeSlug, layout.device_types);

  // If not found, device type doesn't exist
  if (!deviceType) {
    debug.devicePlace({
      slug: deviceTypeSlug,
      position: positionU,
      passedFace: face,
      effectiveFace: "N/A",
      deviceName: "unknown",
      isFullDepth: false,
      result: "not_found",
    });
    return false;
  }

  // Determine face based on device depth
  // Full-depth devices ALWAYS use 'both' (they physically occupy front and rear)
  // Half-depth devices use the specified face, or default to 'front'
  const isFullDepth = deviceType.is_full_depth !== false;
  const effectiveFace: DeviceFace = isFullDepth
    ? "both"
    : (face ?? DEFAULT_DEVICE_FACE);
  const deviceName = deviceType.model ?? deviceType.slug;

  // Determine effective slot position
  // Full-width devices (slot_width !== 1) always use 'full'
  const deviceSlotWidth = deviceType.slot_width ?? 2;
  const effectiveSlotPosition: SlotPosition =
    deviceSlotWidth === 1 ? (slotPosition ?? "full") : "full";

  if (
    !canPlaceDevice(
      targetRack,
      layout.device_types,
      deviceType.u_height,
      positionInternal,
      undefined,
      effectiveFace,
      effectiveSlotPosition,
    )
  ) {
    debug.devicePlace({
      slug: deviceTypeSlug,
      position: positionU,
      passedFace: face,
      effectiveFace,
      deviceName,
      isFullDepth,
      result: "collision",
    });
    return false;
  }

  const device: PlacedDevice = {
    id: generateId(),
    device_type: deviceTypeSlug,
    position: positionInternal,
    face: effectiveFace,
    slot_position: effectiveSlotPosition,
    ports: instantiatePorts(deviceType),
  };

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const autoImport = getAutoImportDeviceType(ctx, deviceTypeSlug, deviceType);
  const placeCommand = createPlaceDeviceCommand(device, adapter, deviceName);

  if (autoImport) {
    const importCommand = createAddDeviceTypeCommand(autoImport, adapter);
    const batch = createBatchCommand(`Place ${deviceName}`, [importCommand, placeCommand]);
    history.execute(batch);
  } else {
    history.execute(placeCommand);
  }
  ctx.markDirty();

  debug.devicePlace({
    slug: deviceTypeSlug,
    position: positionU,
    passedFace: face,
    effectiveFace,
    deviceName,
    isFullDepth,
    result: "success",
  });

  return true;
}

/**
 * Move a device with undo/redo support
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param newPositionU - New position in U (human-readable)
 * @param newSlotPosition - Optional new slot position
 * @returns true if moved successfully
 */
export function moveDeviceRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  newPositionU: number,
  newSlotPosition?: SlotPosition,
): boolean {
  // Convert to internal units
  const newPositionInternal = toInternalUnits(newPositionU);

  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) {
    debug.deviceMove({
      index: deviceIndex,
      deviceName: "unknown",
      face: "unknown",
      fromPosition: -1,
      toPosition: newPositionU,
      result: "not_found",
    });
    return false;
  }

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) {
    debug.deviceMove({
      index: deviceIndex,
      deviceName: "unknown",
      face: "unknown",
      fromPosition: -1,
      toPosition: newPositionU,
      result: "not_found",
    });
    return false;
  }

  const layout = ctx.getLayout();
  const device = targetRack.devices[deviceIndex]!;
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  if (!deviceType) {
    debug.deviceMove({
      index: deviceIndex,
      deviceName: device.device_type,
      face: device.face ?? "front",
      fromPosition: toHumanUnits(device.position),
      toPosition: newPositionU,
      result: "not_found",
    });
    return false;
  }

  const deviceName = deviceType.model ?? deviceType.slug;
  const oldPositionInternal = device.position;
  const oldPositionU = toHumanUnits(oldPositionInternal);

  // Use canPlaceDevice for bounds and collision checking (face and depth aware)
  // Use new slot_position if provided (e.g., from D&D target), otherwise keep existing
  const effectiveSlot = newSlotPosition ?? device.slot_position ?? "full";
  if (
    !canPlaceDevice(
      targetRack,
      layout.device_types,
      deviceType.u_height,
      newPositionInternal,
      deviceIndex,
      device.face,
      effectiveSlot,
    )
  ) {
    // Determine if it's out of bounds or collision
    const isOutOfBounds =
      newPositionInternal < UNITS_PER_U ||
      newPositionInternal + toInternalUnits(deviceType.u_height) - 1 >
        targetRack.height * UNITS_PER_U;
    debug.deviceMove({
      index: deviceIndex,
      deviceName,
      face: device.face ?? "front",
      fromPosition: oldPositionU,
      toPosition: newPositionU,
      result: isOutOfBounds ? "out_of_bounds" : "collision",
    });
    return false;
  }

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const moveCommand = createMoveDeviceCommand(
    deviceIndex,
    oldPositionInternal,
    newPositionInternal,
    adapter,
    deviceName,
  );

  if (newSlotPosition && newSlotPosition !== (device.slot_position ?? "full")) {
    const slotCommand = createUpdateDeviceSlotPositionCommand(
      deviceIndex,
      device.slot_position ?? "full",
      newSlotPosition,
      adapter,
      deviceName,
    );
    const batchCommand = createBatchCommand(`Move ${deviceName}`, [moveCommand, slotCommand]);
    history.execute(batchCommand);
  } else {
    history.execute(moveCommand);
  }
  ctx.markDirty();

  debug.deviceMove({
    index: deviceIndex,
    deviceName,
    face: device.face ?? "front",
    fromPosition: oldPositionU,
    toPosition: newPositionU,
    result: "success",
  });

  return true;
}

/**
 * Remove a device with undo/redo support
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param snapshotDevice - Snapshot function (for converting reactive proxies to plain objects)
 */
export function removeDeviceRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  snapshotDevice: (device: PlacedDevice) => PlacedDevice,
): void {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  // Get a snapshot to convert from reactive proxy to plain object
  // structuredClone in the command factory requires a plain object
  const device = snapshotDevice(targetRack.devices[deviceIndex]!);
  const layout = ctx.getLayout();
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceName = deviceType?.model ?? deviceType?.slug ?? "device";

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createRemoveDeviceCommand(
    deviceIndex,
    device,
    adapter,
    deviceName,
  );
  history.execute(command);
  ctx.markDirty();
}

/**
 * Update device face with undo/redo support
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param face - New face value
 */
export function updateDeviceFaceRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  face: DeviceFace,
): void {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  const device = targetRack.devices[deviceIndex]!;
  const oldFace = device.face ?? "front";
  const layout = ctx.getLayout();
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceName = deviceType?.model ?? deviceType?.slug ?? "device";

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createUpdateDeviceFaceCommand(
    deviceIndex,
    oldFace,
    face,
    adapter,
    deviceName,
  );
  history.execute(command);
  ctx.markDirty();
}

/**
 * Update device custom name with undo/redo support
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param name - New name
 */
export function updateDeviceNameRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  name: string | undefined,
): void {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  const device = targetRack.devices[deviceIndex]!;
  const oldName = device.name;
  const layout = ctx.getLayout();
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceTypeName = deviceType?.model ?? deviceType?.slug ?? "device";

  // Normalize empty string to undefined
  const normalizedName = name?.trim() || undefined;

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createUpdateDeviceNameCommand(
    deviceIndex,
    oldName,
    normalizedName,
    adapter,
    deviceTypeName,
  );
  history.execute(command);
  ctx.markDirty();
}

/**
 * Update device placement image with undo/redo support
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param face - Which face to update ('front' or 'rear')
 * @param filename - New image filename (undefined to clear)
 */
export function updateDevicePlacementImageRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  face: "front" | "rear",
  filename: string | undefined,
): void {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  const device = targetRack.devices[deviceIndex]!;
  const oldFilename = face === "front" ? device.front_image : device.rear_image;
  const layout = ctx.getLayout();
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceName = deviceType?.model ?? deviceType?.slug ?? "device";

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createUpdateDevicePlacementImageCommand(
    deviceIndex,
    face,
    oldFilename,
    filename,
    adapter,
    deviceName,
  );
  history.execute(command);
  ctx.markDirty();
}

/**
 * Update device colour with undo/redo support
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param colour - New colour (undefined to clear and use device type colour)
 */
export function updateDeviceColourRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  colour: string | undefined,
): void {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  const device = targetRack.devices[deviceIndex]!;
  const oldColour = device.colour_override;
  const layout = ctx.getLayout();
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceName = deviceType?.model ?? deviceType?.slug ?? "device";

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createUpdateDeviceColourCommand(
    deviceIndex,
    oldColour,
    colour,
    adapter,
    deviceName,
  );
  history.execute(command);
  ctx.markDirty();
}

/**
 * Update device slot position with undo/redo support (for half-width devices)
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param slotPosition - New slot position ('left', 'right', or 'full')
 * @returns true if successful, false if blocked
 */
export function updateDeviceSlotPositionRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  slotPosition: SlotPosition,
): boolean {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return false;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return false;

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  const device = targetRack.devices[deviceIndex]!;
  const layout = ctx.getLayout();

  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );

  // Only half-width devices can have their slot position changed
  if (!deviceType || deviceType.slot_width !== 1) {
    return false;
  }

  const oldSlotPosition = device.slot_position ?? "full";
  const deviceName = deviceType.model ?? deviceType.slug ?? "device";

  // No change needed
  if (oldSlotPosition === slotPosition) return true;

  // Check if target slot is occupied using shared collision utility
  if (isSlotOccupied(targetRack, device.position, slotPosition, deviceIndex)) {
    return false;
  }

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createUpdateDeviceSlotPositionCommand(
    deviceIndex,
    oldSlotPosition,
    slotPosition,
    adapter,
    deviceName,
  );
  history.execute(command);
  ctx.markDirty();
  return true;
}

/**
 * Update device notes with undo/redo support
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param notes - New notes (undefined to clear)
 */
export function updateDeviceNotesRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  notes: string | undefined,
): void {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  const device = targetRack.devices[deviceIndex]!;
  const oldNotes = device.notes;
  const layout = ctx.getLayout();
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceName = deviceType?.model ?? deviceType?.slug ?? "device";

  // Normalize empty string to undefined
  const normalizedNotes = notes?.trim() || undefined;

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createUpdateDeviceNotesCommand(
    deviceIndex,
    oldNotes,
    normalizedNotes,
    adapter,
    deviceName,
  );
  history.execute(command);
  ctx.markDirty();
}

/**
 * Update device IP address/hostname with undo/redo support
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param ip - New IP address/hostname (undefined to clear)
 */
export function updateDeviceIpRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  ip: string | undefined,
): void {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  const device = targetRack.devices[deviceIndex]!;
  const oldIp =
    typeof device.custom_fields?.ip === "string"
      ? device.custom_fields.ip
      : undefined;
  const layout = ctx.getLayout();
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceName = deviceType?.model ?? deviceType?.slug ?? "device";

  // Normalize empty string to undefined
  const normalizedIp = ip?.trim() || undefined;

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createUpdateDeviceIpCommand(
    deviceIndex,
    oldIp,
    normalizedIp,
    adapter,
    deviceName,
  );
  history.execute(command);
  ctx.markDirty();
}

/**
 * Update rack settings with undo/redo support
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param updates - Settings to update
 */
export function updateRackRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  updates: Partial<Omit<Rack, "devices" | "view">>,
): void {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return;

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  // Capture before state
  const before: Partial<Omit<Rack, "devices" | "view">> = {};
  for (const key of Object.keys(updates) as (keyof Omit<
    Rack,
    "devices" | "view"
  >)[]) {
    before[key] = targetRack[key] as never;
  }

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createUpdateRackCommand(before, updates, adapter);
  history.execute(command);
  ctx.markDirty();
}

/**
 * Clear rack devices with undo/redo support
 * Uses active rack unless a rackId override is provided
 * @param ctx - Layout state access
 * @param rackId - Optional rack ID override
 */
export function clearRackRecorded(
  ctx: LayoutStateAccess,
  rackId?: string,
): void {
  if (rackId) {
    ctx.setActiveRackId(rackId);
  }
  const target = getTargetRack(ctx);
  if (!target || target.rack.devices.length === 0) return;

  const devices = [...target.rack.devices];
  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createClearRackCommand(devices, adapter);
  history.execute(command);
  ctx.markDirty();
}
