/**
 * Recorded Device Type Actions for Layout Store
 *
 * Extracted from layout/command-adapters.ts — device type library
 * operations with undo/redo support. Each function creates a Command
 * wrapping raw mutators, then executes it through the history system.
 */

import type { Connection, DeviceType, PlacedDevice, Rack } from "$lib/types";
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
  createInRackCommand,
  createRemoveDeviceCommand,
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
 * Find connections attached to any port on the given placed devices.
 * Used so REMOVE_DEVICE / REMOVE_DEVICE_WITH_CHILDREN (#639) and
 * DELETE_DEVICE_TYPE can clean up dangling connection endpoints. Connections
 * reference PlacedPort.id (not device id), and port ids never change across
 * a remove/restore cycle, so no id-remap bookkeeping is needed on undo.
 */
export function findConnectionsForDevices(
  ctx: LayoutStateAccess,
  placedDevices: { rackId: string; device: PlacedDevice }[],
): Connection[] {
  const layout = ctx.getLayout();
  const connections = layout.connections;
  // Array.isArray, not truthiness: untrusted input can reach loadLayout with a
  // truthy non-array `connections` (e.g. `{}`), which must not throw (#3090).
  if (!Array.isArray(connections) || connections.length === 0) return [];
  const portIds = new Set(
    placedDevices.flatMap((p) => (p.device.ports ?? []).map((port) => port.id)),
  );
  if (portIds.size === 0) return [];
  return connections.filter(
    (c) => portIds.has(c.a_port_id) || portIds.has(c.b_port_id),
  );
}

/**
 * Auto-created carriers in `rack` that every child is leaving.
 *
 * A carrier synthesised by drag/drop (auto_created) exists only to hold its
 * children, so when its last child leaves (removed, dragged out, moved to
 * another carrier or rack, or its device type deleted) the carrier goes with
 * it in the same undo step. User-placed carriers persist when empty (#2295).
 *
 * @param rack - The rack to scan
 * @param isLeaving - Whether a placed device is being removed from its spot
 * @returns The carriers to remove alongside the leaving devices
 */
export function findAutoCarriersEmptiedBy(
  rack: Rack,
  isLeaving: (device: PlacedDevice) => boolean,
): PlacedDevice[] {
  return rack.devices.filter((carrier) => {
    if (!carrier.auto_created || isLeaving(carrier)) return false;
    const children = rack.devices.filter((d) => d.container_id === carrier.id);
    return children.length > 0 && children.every(isLeaving);
  });
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
  // Auto-created carriers whose children are all of this type go too, in the
  // same undo step (#2295). JSON-cloned like the placements above: the
  // remove command structuredClones its device, which a state proxy fails.
  const emptiedCarriers = layout.racks.flatMap((rack) =>
    findAutoCarriersEmptiedBy(rack, (d) => d.device_type === slug).map(
      (carrier) => ({
        rackId: rack.id,
        device: JSON.parse(JSON.stringify(carrier)) as PlacedDevice,
      }),
    ),
  );
  const connectedConnections = findConnectionsForDevices(ctx, [
    ...placedDevices,
    ...emptiedCarriers,
  ]);
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  const layoutId = layout.metadata?.id ?? "";

  const deleteCommand = createDeleteDeviceTypeCommand(
    existing,
    placedDevices,
    adapter,
    layoutId,
  );

  // Removed after the type's placements, so undo restores each carrier before
  // the children that reference it.
  const carrierCommands: Command[] = emptiedCarriers.map(({ rackId, device }) =>
    createInRackCommand(
      rackId,
      createRemoveDeviceCommand(device, adapter, "carrier", layoutId),
      adapter,
    ),
  );

  // Connections reference PlacedPort.id, which DELETE_DEVICE_TYPE's device
  // restore never remaps, so a plain REMOVE_CONNECTION per connection is
  // enough (#639).
  const connectionCommands: Command[] = connectedConnections.map((connection) =>
    createRemoveConnectionCommand(
      connection,
      adapter,
      `Remove connection ${connection.label ?? connection.id}`,
    ),
  );

  const command =
    connectionCommands.length > 0 || carrierCommands.length > 0
      ? createBatchCommand(`Delete ${existing.model ?? existing.slug}`, [
          ...connectionCommands,
          deleteCommand,
          ...carrierCommands,
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
  // A connection spanning two of the deleted types would otherwise be
  // snapshotted by both per-type delete commands, restoring it twice on undo
  // (#639).
  const claimedConnectionIds = new Set<string>();
  const connectionCommands: Command[] = [];

  for (const slug of slugs) {
    const existing = findDeviceTypeInArray(layout.device_types, slug);
    if (!existing) continue;

    const placedDevices = getPlacedDevicesWithRackForType(ctx, slug);
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
