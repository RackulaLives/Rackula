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
  createRetypeDeviceCommand,
  type Command,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getCommandStoreAdapter } from "./command-adapters";
import { getPlacedDevicesWithRackForType } from "./mutators";
import {
  buildCustomCarrierType,
  isGeneratedCarrier,
  isOrphanedAfterRetype,
} from "$lib/utils/custom-carrier";
import { gapsFor, remainingMm } from "$lib/utils/slot-layout";
import { getRackOpeningMm } from "$lib/utils/device-width";
import { getToastStore } from "$lib/stores/toast.svelte";

/** Rounding slack when a row is compared to its opening, in millimetres. */
const ROW_FIT_SLACK_MM = 0.5;

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
): boolean {
  const layout = ctx.getLayout();
  const existing = findDeviceTypeInArray(layout.device_types, slug);
  if (!existing) return false;

  // Capture before state for the fields being updated
  const before: Partial<DeviceType> = {};
  for (const key of Object.keys(updates) as (keyof DeviceType)[]) {
    before[key] = existing[key] as never;
  }

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  // A measured width and the cell holding it must agree, so a width change
  // rewrites every generated carrier holding this device, in the same undo
  // step. Refused outright rather than left inconsistent when a row overflows.
  const widthChanged =
    updates.width_mm !== undefined && updates.width_mm !== existing.width_mm;
  const recompute = widthChanged
    ? recomputeCarriersForWidth(ctx, slug, updates.width_mm!, adapter)
    : { commands: [], blocked: [], carrierCount: 0 };

  if (recompute.blocked.length > 0) {
    getToastStore().showToast(
      `That width does not fit in ${recompute.blocked.join(", ")}`,
      "warning",
    );
    return false;
  }

  const command = createUpdateDeviceTypeCommand(slug, before, updates, adapter);
  history.execute(
    recompute.commands.length > 0
      ? createBatchCommand(`Update ${slug}`, [command, ...recompute.commands])
      : command,
  );
  ctx.markDirty();

  // The recompute can move devices in a rack the user is not looking at, so
  // say how many carriers moved rather than change them silently.
  if (recompute.carrierCount > 0) {
    getToastStore().showToast(
      `Width changed, ${recompute.carrierCount} carrier${
        recompute.carrierCount === 1 ? "" : "s"
      } adjusted`,
      "info",
    );
  }

  return true;
}

/**
 * Rewrite every generated carrier holding `slug` so its cells match the new
 * measured width.
 *
 * @param ctx - Layout state access
 * @param slug - The device type whose width is changing
 * @param widthMm - The new width in millimetres
 * @param adapter - Command store adapter
 * @returns The retype commands, the carriers that cannot take the width, and
 *   how many carriers the change touches
 */
function recomputeCarriersForWidth(
  ctx: LayoutStateAccess,
  slug: string,
  widthMm: number,
  adapter: ReturnType<typeof getCommandStoreAdapter>,
): { commands: Command[]; blocked: string[]; carrierCount: number } {
  const layout = ctx.getLayout();
  const commands: Command[] = [];
  const blocked: string[] = [];
  let carrierCount = 0;

  for (const rack of layout.racks) {
    for (const carrier of rack.devices) {
      if (carrier.container_id) continue;
      const carrierType = findDeviceTypeInArray(
        layout.device_types,
        carrier.device_type,
      );
      if (!carrierType || !isGeneratedCarrier(carrierType)) continue;

      const slots = carrierType.slots ?? [];
      const holdsIt = rack.devices.some(
        (d) => d.container_id === carrier.id && d.device_type === slug,
      );
      if (!holdsIt) continue;

      const cells = slots.map((slot) => {
        const child = rack.devices.find(
          (d) => d.container_id === carrier.id && d.slot_id === slot.id,
        );
        return child?.device_type === slug
          ? {
              widthFraction: widthMm / getRackOpeningMm(rack.width),
              heightUnits: slot.height_units ?? 1,
            }
          : {
              widthFraction: slot.width_fraction ?? 1.0,
              heightUnits: slot.height_units ?? 1,
            };
      });

      const candidate = buildCustomCarrierType(
        carrierType.u_height,
        cells,
        gapsFor(carrierType),
      );
      if (remainingMm(candidate, rack.width) < -ROW_FIT_SLACK_MM) {
        blocked.push(carrier.name ?? carrierType.model ?? carrierType.slug);
        continue;
      }
      if (candidate.slug === carrierType.slug) continue;

      carrierCount++;
      if (!layout.device_types.some((dt) => dt.slug === candidate.slug)) {
        commands.push(createAddDeviceTypeCommand(candidate, adapter));
      }
      commands.push(
        createRetypeDeviceCommand(
          carrier.id,
          carrierType.slug,
          candidate.slug,
          adapter,
        ),
      );
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
    }
  }

  return { commands, blocked, carrierCount };
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
 * Commands that keep containers and their children consistent when device
 * types are deleted (#2295):
 * - children (of other types) inside a deleted type's container are removed,
 *   since they would otherwise reference a container that no longer exists;
 * - auto-created carriers left with no children are removed.
 * Both bring their connections along. In a batch, the child commands go
 * before the type deletions and the carrier commands after them, so undo
 * restores each container before the children that reference it.
 * Connections already in `claimedConnectionIds` are skipped so none is
 * restored twice.
 */
function containerCleanup(
  ctx: LayoutStateAccess,
  deletedSlugs: Set<string>,
  claimedConnectionIds: Set<string>,
): {
  connectionCommands: Command[];
  childCommands: Command[];
  carrierCommands: Command[];
} {
  const layout = ctx.getLayout();
  const adapter = getCommandStoreAdapter(ctx);
  const layoutId = layout.metadata?.id ?? "";
  // JSON-cloned like getPlacedDevicesWithRackForType's placements: the remove
  // command structuredClones its device, which a state proxy fails.
  const plain = (rackId: string, device: PlacedDevice) => ({
    rackId,
    device: JSON.parse(JSON.stringify(device)) as PlacedDevice,
  });
  const children = layout.racks.flatMap((rack) => {
    const deletedContainerIds = new Set(
      rack.devices
        .filter((d) => deletedSlugs.has(d.device_type))
        .map((d) => d.id),
    );
    return rack.devices
      .filter(
        (d) =>
          d.container_id &&
          deletedContainerIds.has(d.container_id) &&
          !deletedSlugs.has(d.device_type),
      )
      .map((child) => plain(rack.id, child));
  });
  const carriers = layout.racks.flatMap((rack) =>
    findAutoCarriersEmptiedBy(rack, (d) => deletedSlugs.has(d.device_type)).map(
      (carrier) => plain(rack.id, carrier),
    ),
  );
  const connectionCommands = findConnectionsForDevices(ctx, [
    ...children,
    ...carriers,
  ])
    .filter((connection) => !claimedConnectionIds.has(connection.id))
    .map((connection) => {
      claimedConnectionIds.add(connection.id);
      return createRemoveConnectionCommand(
        connection,
        adapter,
        `Remove connection ${connection.label ?? connection.id}`,
      );
    });
  const removeIn = ({
    rackId,
    device,
  }: {
    rackId: string;
    device: PlacedDevice;
  }) =>
    createInRackCommand(
      rackId,
      createRemoveDeviceCommand(device, adapter, "device", layoutId),
      adapter,
    );
  return {
    connectionCommands,
    childCommands: children.map(removeIn),
    carrierCommands: carriers.map(removeIn),
  };
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
  const connectedConnections = findConnectionsForDevices(ctx, placedDevices);
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const deleteCommand = createDeleteDeviceTypeCommand(
    existing,
    placedDevices,
    adapter,
    layout.metadata?.id ?? "",
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

  const cleanup = containerCleanup(
    ctx,
    new Set([slug]),
    new Set(connectedConnections.map((c) => c.id)),
  );
  const cleanupCommands = [
    ...cleanup.connectionCommands,
    ...cleanup.childCommands,
    deleteCommand,
    ...cleanup.carrierCommands,
  ];

  const command =
    connectionCommands.length > 0 || cleanupCommands.length > 1
      ? createBatchCommand(`Delete ${existing.model ?? existing.slug}`, [
          ...connectionCommands,
          ...cleanupCommands,
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

  const cleanup = containerCleanup(ctx, new Set(slugs), claimedConnectionIds);

  const batchCommand = createBatchCommand(description, [
    ...connectionCommands,
    ...cleanup.connectionCommands,
    ...cleanup.childCommands,
    ...commands,
    ...cleanup.carrierCommands,
  ]);
  history.execute(batchCommand);
  ctx.markDirty();

  layoutDebug.state(
    "deleteMultipleDeviceTypesRecorded: completed - deleted %d device types",
    count,
  );

  return count;
}

/**
 * Set the gaps on a placed generated carrier, in one undo step.
 *
 * A gap belongs to the carrier and to a position between two cells, so this
 * rewrites that carrier's split. The new split fingerprints differently, which
 * is the copy-on-write: only this carrier is retyped, and any other carrier
 * still on the old split keeps it.
 *
 * Refuses when the row cannot hold its cells plus the requested gaps, naming
 * what is free rather than silently clipping.
 *
 * @param ctx - Layout state access
 * @param rackId - Rack holding the carrier
 * @param carrierId - The placed generated carrier
 * @param gapsMm - One value per boundary, n - 1 for n cells
 * @returns true when the carrier carries those gaps afterwards
 */
export function updateDeviceTypeSlotGaps(
  ctx: LayoutStateAccess,
  rackId: string,
  carrierId: string,
  gapsMm: number[],
): boolean {
  const layout = ctx.getLayout();
  const rack = layout.racks.find((r) => r.id === rackId);
  const carrier = rack?.devices.find((d) => d.id === carrierId);
  const carrierType = carrier
    ? findDeviceTypeInArray(layout.device_types, carrier.device_type)
    : undefined;
  if (!rack || !carrier || !carrierType || !isGeneratedCarrier(carrierType)) {
    return false;
  }

  const slots = carrierType.slots ?? [];
  if (gapsMm.length !== Math.max(slots.length - 1, 0)) return false;
  if (gapsMm.some((mm) => mm < 0 || !Number.isFinite(mm))) return false;

  const cells = slots.map((slot) => ({
    widthFraction: slot.width_fraction ?? 1.0,
    heightUnits: slot.height_units ?? 1,
  }));
  const candidate = buildCustomCarrierType(carrierType.u_height, cells, gapsMm);

  if (remainingMm(candidate, rack.width) < -ROW_FIT_SLACK_MM) {
    getToastStore().showToast(
      `That gap does not fit: ${Math.round(remainingMm(carrierType, rack.width))} mm free in this carrier`,
      "warning",
    );
    return false;
  }

  if (candidate.slug === carrierType.slug) return true;

  ctx.setActiveRackId(rackId);
  const adapter = getCommandStoreAdapter(ctx);
  const commands: Command[] = [];
  if (!layout.device_types.some((dt) => dt.slug === candidate.slug)) {
    commands.push(createAddDeviceTypeCommand(candidate, adapter));
  }
  commands.push(
    createRetypeDeviceCommand(
      carrier.id,
      carrierType.slug,
      candidate.slug,
      adapter,
    ),
  );
  // The gaps the carrier just left behind are a split of their own.
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

  ctx.getHistory().execute(createBatchCommand("Set carrier gaps", commands));
  ctx.markDirty();
  return true;
}
