/**
 * Recorded Connection Actions for Layout Store
 *
 * Connection-level operations with undo/redo support. Each function creates
 * a Command wrapping the raw mutators in ./mutators.ts, then executes it
 * through the history system. Mirrors the recorded/raw pattern used by
 * recorded-device-actions.ts, but connections are id-keyed (no
 * index-shifting to resolve at undo time).
 */

import type { Connection } from "$lib/types";
import {
  createAddConnectionCommand,
  createUpdateConnectionCommand,
  createRemoveConnectionCommand,
  createBatchCommand,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getCommandStoreAdapter } from "./command-adapters";

/**
 * Add a connection with undo/redo support
 * @param ctx - Layout state access
 * @param connection - Connection to add
 */
export function addConnectionRecorded(
  ctx: LayoutStateAccess,
  connection: Connection,
): void {
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createAddConnectionCommand(
    connection,
    adapter,
    `Add connection ${connection.label ?? connection.id}`,
  );
  history.execute(command);
  ctx.markDirty();
}

/**
 * Update a connection with undo/redo support
 * @param ctx - Layout state access
 * @param id - Connection ID to update
 * @param updates - Properties to update
 * @returns true if the connection existed and was updated
 */
export function updateConnectionRecorded(
  ctx: LayoutStateAccess,
  id: string,
  updates: Partial<Omit<Connection, "id">>,
): boolean {
  const layout = ctx.getLayout();
  const existing = (layout.connections ?? []).find((c) => c.id === id);
  if (!existing) return false;

  // Capture before-state for only the keys being changed, mirroring
  // updateRackRecorded in recorded-rack-actions.ts.
  const before: Partial<Omit<Connection, "id">> = {};
  for (const key of Object.keys(updates) as (keyof Omit<Connection, "id">)[]) {
    before[key] = existing[key] as never;
  }

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createUpdateConnectionCommand(
    id,
    before,
    updates,
    adapter,
    `Update connection ${existing.label ?? id}`,
  );
  history.execute(command);
  ctx.markDirty();
  return true;
}

/**
 * Remove a connection with undo/redo support
 * @param ctx - Layout state access
 * @param id - Connection ID to remove
 * @returns The removed connection, or undefined if it did not exist
 */
export function removeConnectionRecorded(
  ctx: LayoutStateAccess,
  id: string,
): Connection | undefined {
  const layout = ctx.getLayout();
  const existing = (layout.connections ?? []).find((c) => c.id === id);
  if (!existing) return undefined;

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createRemoveConnectionCommand(
    existing,
    adapter,
    `Remove connection ${existing.label ?? id}`,
  );
  history.execute(command);
  ctx.markDirty();
  return existing;
}

/**
 * Remove every connection referencing any of the given port IDs, as a single
 * undoable unit. Used when a device (and its ports) is removed.
 * @param ctx - Layout state access
 * @param portIds - Port IDs whose connections should be removed
 * @returns The number of connections removed
 */
export function removeConnectionsForPortsRecorded(
  ctx: LayoutStateAccess,
  portIds: Set<string>,
): number {
  if (portIds.size === 0) return 0;

  const layout = ctx.getLayout();
  const matching = (layout.connections ?? []).filter(
    (c) => portIds.has(c.a_port_id) || portIds.has(c.b_port_id),
  );
  if (matching.length === 0) return 0;

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const commands = matching.map((connection) =>
    createRemoveConnectionCommand(
      connection,
      adapter,
      `Remove connection ${connection.label ?? connection.id}`,
    ),
  );

  const command =
    commands.length === 1
      ? commands[0]!
      : createBatchCommand(`Remove ${matching.length} connections`, commands);

  history.execute(command);
  ctx.markDirty();
  return matching.length;
}
