/**
 * Recorded Device Type Actions for Layout Store
 *
 * Extracted from layout/command-adapters.ts — device type library
 * operations with undo/redo support. Each function creates a Command
 * wrapping raw mutators, then executes it through the history system.
 */

import type { Cable, Connection, DeviceType, PlacedDevice } from "$lib/types";
import {
  createDeviceType as createDeviceTypeHelper,
  findDeviceType as findDeviceTypeInArray,
  type CreateDeviceTypeInput,
} from "$lib/stores/layout-helpers";
import { layoutDebug } from "$lib/utils/debug";
import {
  createAddDeviceTypeCommand,
  createUpdateDeviceTypeCommand,
  createDeleteDeviceTypeCommand,
  createRemoveConnectionCommand,
  createBatchCommand,
  type Command,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getCommandStoreAdapter } from "./command-adapters";
import { getPlacedDevicesWithRackForType } from "./mutators";

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
  const history = ctx.getHistory();
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

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createUpdateDeviceTypeCommand(slug, before, updates, adapter);
  history.execute(command);
  ctx.markDirty();
}

/**
 * Find cables connected to any of the given placed devices.
 * Used so DELETE_DEVICE_TYPE (#1483) and REMOVE_DEVICE (#2924) can clean up
 * dangling cable endpoints.
 */
export function findCablesForDevices(
  ctx: LayoutStateAccess,
  placedDevices: { rackId: string; device: PlacedDevice }[],
): Cable[] {
  const layout = ctx.getLayout();
  const cables = layout.cables;
  if (!cables || cables.length === 0) return [];
  const deviceIds = new Set(placedDevices.map((p) => p.device.id));
  if (deviceIds.size === 0) return [];
  return cables.filter(
    (c) => deviceIds.has(c.a_device_id) || deviceIds.has(c.b_device_id),
  );
}

/**
 * Find connections attached to any port on the given placed devices.
 * Used so REMOVE_DEVICE / REMOVE_DEVICE_WITH_CHILDREN (#639) and
 * DELETE_DEVICE_TYPE can clean up dangling connection endpoints, mirroring
 * findCablesForDevices above. Unlike cables, connections reference
 * PlacedPort.id (not device id), and port ids never change across a
 * remove/restore cycle, so no id-remap bookkeeping is needed on undo.
 */
export function findConnectionsForDevices(
  ctx: LayoutStateAccess,
  placedDevices: { rackId: string; device: PlacedDevice }[],
): Connection[] {
  const layout = ctx.getLayout();
  const connections = layout.connections;
  if (!connections || connections.length === 0) return [];
  const portIds = new Set(
    placedDevices.flatMap((p) => (p.device.ports ?? []).map((port) => port.id)),
  );
  if (portIds.size === 0) return [];
  return connections.filter(
    (c) => portIds.has(c.a_port_id) || portIds.has(c.b_port_id),
  );
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
  const connectedCables = findCablesForDevices(ctx, placedDevices);
  const connectedConnections = findConnectionsForDevices(ctx, placedDevices);
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const deleteCommand = createDeleteDeviceTypeCommand(
    existing,
    placedDevices,
    adapter,
    connectedCables,
    layout.metadata?.id ?? "",
  );

  // Connections reference PlacedPort.id, which DELETE_DEVICE_TYPE's device
  // restore never remaps, so a plain REMOVE_CONNECTION per connection is
  // enough (#639, mirrors the cable handling above).
  const connectionCommands: Command[] = connectedConnections.map((connection) =>
    createRemoveConnectionCommand(
      connection,
      adapter,
      `Remove connection ${connection.label ?? connection.id}`,
    ),
  );

  const command =
    connectionCommands.length > 0
      ? createBatchCommand(`Delete ${existing.model ?? existing.slug}`, [
          ...connectionCommands,
          deleteCommand,
        ])
      : deleteCommand;

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
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  const commands: ReturnType<typeof createDeleteDeviceTypeCommand>[] = [];
  // A cable connecting devices of two different types would otherwise be
  // snapshotted by both per-type delete commands, restoring it twice on undo.
  const claimedCableIds = new Set<string>();
  // Same double-restore risk for a connection spanning two of the deleted
  // types (#639).
  const claimedConnectionIds = new Set<string>();
  const connectionCommands: Command[] = [];

  for (const slug of slugs) {
    const existing = findDeviceTypeInArray(layout.device_types, slug);
    if (!existing) continue;

    const placedDevices = getPlacedDevicesWithRackForType(ctx, slug);
    const connectedCables = findCablesForDevices(ctx, placedDevices).filter(
      (cable) => {
        if (claimedCableIds.has(cable.id)) return false;
        claimedCableIds.add(cable.id);
        return true;
      },
    );
    const connectedConnections = findConnectionsForDevices(
      ctx,
      placedDevices,
    ).filter((connection) => {
      if (claimedConnectionIds.has(connection.id)) return false;
      claimedConnectionIds.add(connection.id);
      return true;
    });
    for (const connection of connectedConnections) {
      connectionCommands.push(
        createRemoveConnectionCommand(
          connection,
          adapter,
          `Remove connection ${connection.label ?? connection.id}`,
        ),
      );
    }
    const command = createDeleteDeviceTypeCommand(
      existing,
      placedDevices,
      adapter,
      connectedCables,
      layout.metadata?.id ?? "",
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

  const batchCommand = createBatchCommand(description, [
    ...connectionCommands,
    ...commands,
  ]);
  history.execute(batchCommand);
  ctx.markDirty();

  layoutDebug.state(
    "deleteMultipleDeviceTypesRecorded: completed - deleted %d device types",
    count,
  );

  return count;
}
