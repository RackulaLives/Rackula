/**
 * Recorded Device Actions for Layout Store
 *
 * Extracted from layout/command-adapters.ts — placed-device operations
 * with undo/redo support. Each function creates a Command wrapping raw
 * mutators, then executes it through the history system. Operations set
 * activeRackId before executing to ensure Raw functions target the
 * correct rack.
 */

import type { DeviceFace, DeviceType, PlacedDevice } from "$lib/types";
import { UNITS_PER_U, DEFAULT_DEVICE_FACE } from "$lib/types/constants";
import { toInternalUnits, toHumanUnits } from "$lib/utils/position";
import { canPlaceDevice, requiresCarrier } from "$lib/utils/collision";
import { findDeviceType as findDeviceTypeInArray } from "$lib/stores/layout-helpers";
import { findDeviceType } from "$lib/utils/device-lookup";
import { debug } from "$lib/utils/debug";
import { generateId } from "$lib/utils/device";
import { instantiatePorts } from "$lib/utils/port-utils";
import {
  createAddDeviceTypeCommand,
  createPlaceDeviceCommand,
  createMoveDeviceCommand,
  createRemoveDeviceCommand,
  createUpdateDeviceFaceCommand,
  createUpdateDeviceNameCommand,
  createUpdateDevicePlacementImageCommand,
  createUpdateDeviceColourCommand,
  createDetachContainerCommand,
  createUpdateDeviceNotesCommand,
  createUpdateDeviceIpCommand,
  createBatchCommand,
  type Command,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getCommandStoreAdapter } from "./command-adapters";
import { getRackById } from "./rack-actions";

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
 * Place a device with undo/redo support
 * Auto-imports brand pack devices if not already in device library
 * Face defaults based on device depth: full-depth -> 'both', half-depth -> 'front'
 * @param ctx - Layout state access
 * @param rackId - Target rack ID
 * @param deviceTypeSlug - Device type slug
 * @param positionU - U position (human-readable, e.g., 1, 5, 10)
 * @param face - Optional face assignment
 * @returns true if placed successfully
 */
export function placeDeviceRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceTypeSlug: string,
  positionU: number,
  face?: DeviceFace,
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

  // Carrier-first rule (#2158/C4): sub-U, non-integer-height, or half-width gear
  // cannot register directly to the rails - it must mount inside a carrier
  // (route via placeDeviceSmart). Blank filler panels are exempt. Reject the
  // invalid rail placement here so the block-live UX (D5) refuses it the moment
  // it is attempted.
  if (requiresCarrier(deviceType)) {
    debug.devicePlace({
      slug: deviceTypeSlug,
      position: positionU,
      passedFace: face,
      effectiveFace: "N/A",
      deviceName: deviceType.model ?? deviceType.slug,
      isFullDepth: deviceType.is_full_depth !== false,
      result: "collision",
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
    ports: instantiatePorts(deviceType),
  };

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const autoImport = getAutoImportDeviceType(ctx, deviceTypeSlug, deviceType);
  const placeCommand = createPlaceDeviceCommand(device, adapter, deviceName);

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
 * @returns true if moved successfully
 */
export function moveDeviceRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  newPositionU: number,
  newFace?: DeviceFace,
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

  // Carrier-first rule (#2158/C4): a move always lands on a rack-level rail
  // position and detaches any container linkage. A carrier-requiring device
  // (sub-U / non-integer-height / half-width, non-blank) therefore cannot be
  // moved onto bare rails - that would create an invalid rail mount and leave
  // the layout unsaveable. Reject so schema and store stay in parity.
  if (requiresCarrier(deviceType)) {
    debug.deviceMove({
      index: deviceIndex,
      deviceName,
      face: device.face ?? "front",
      fromPosition: oldPositionU,
      toPosition: newPositionU,
      result: "collision",
    });
    return false;
  }

  // Use canPlaceDevice for bounds and collision checking (face and depth aware)
  const effectiveFace = newFace ?? device.face;
  if (
    !canPlaceDevice(
      targetRack,
      layout.device_types,
      deviceType.u_height,
      newPositionInternal,
      deviceIndex,
      effectiveFace,
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

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const moveCommand = createMoveDeviceCommand(
    deviceIndex,
    oldPositionInternal,
    newPositionInternal,
    adapter,
    deviceName,
  );

  const hasFaceChange =
    newFace !== undefined && newFace !== (device.face ?? "front");
  // A move always targets a rack-level position, so a contained device dragged
  // out of its container must shed its container linkage (otherwise it stays
  // excluded from rack-level collision while claiming membership in a container
  // it no longer sits in). Undo restores the linkage.
  const hasContainerLinkage = device.container_id !== undefined;

  if (hasFaceChange || hasContainerLinkage) {
    const commands: Command[] = [moveCommand];
    if (hasFaceChange) {
      commands.push(
        createUpdateDeviceFaceCommand(
          deviceIndex,
          device.face ?? "front",
          newFace!,
          adapter,
          deviceName,
        ),
      );
    }
    if (hasContainerLinkage) {
      commands.push(
        createDetachContainerCommand(
          deviceIndex,
          device.container_id,
          device.slot_id,
          adapter,
          deviceName,
        ),
      );
    }
    const batchCommand = createBatchCommand(`Move ${deviceName}`, commands);
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

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createRemoveDeviceCommand(
    deviceIndex,
    device,
    adapter,
    deviceName,
    layout.metadata?.id ?? "",
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

  const history = ctx.getHistory();
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

  const history = ctx.getHistory();
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

  const history = ctx.getHistory();
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

  const history = ctx.getHistory();
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

  const history = ctx.getHistory();
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

  const history = ctx.getHistory();
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
