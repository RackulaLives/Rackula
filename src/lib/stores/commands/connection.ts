/**
 * Connection Commands for Undo/Redo
 *
 * Connections are addressed by stable `id` in a flat array
 * (`Layout.connections`), so unlike device commands there is no
 * index-shifting to resolve at undo time — raw mutators key directly off
 * the connection id.
 */

import type { Command } from "./types";
import type { Connection } from "$lib/types";

/**
 * Interface for layout store operations needed by connection commands
 */
export interface ConnectionCommandStore {
  addConnectionRaw(connection: Connection): void;
  updateConnectionRaw(
    id: string,
    updates: Partial<Omit<Connection, "id">>,
  ): void;
  removeConnectionRaw(id: string): void;
}

/**
 * Create a command to add a connection
 */
export function createAddConnectionCommand(
  connection: Connection,
  store: ConnectionCommandStore,
  description: string = "Add connection",
): Command {
  return {
    type: "ADD_CONNECTION",
    description,
    timestamp: Date.now(),
    execute() {
      store.addConnectionRaw(connection);
    },
    undo() {
      store.removeConnectionRaw(connection.id);
    },
  };
}

/**
 * Create a command to update a connection.
 * `before` and `after` should contain only the keys being changed.
 */
export function createUpdateConnectionCommand(
  id: string,
  before: Partial<Omit<Connection, "id">>,
  after: Partial<Omit<Connection, "id">>,
  store: ConnectionCommandStore,
  description: string = "Update connection",
): Command {
  return {
    type: "UPDATE_CONNECTION",
    description,
    timestamp: Date.now(),
    execute() {
      store.updateConnectionRaw(id, after);
    },
    undo() {
      store.updateConnectionRaw(id, before);
    },
  };
}

/**
 * Create a command to remove a connection. Captures the full connection so
 * undo can restore it exactly.
 */
export function createRemoveConnectionCommand(
  connection: Connection,
  store: ConnectionCommandStore,
  description?: string,
): Command {
  const connectionCopy: Connection = { ...connection };
  return {
    type: "REMOVE_CONNECTION",
    description: description ?? "Remove connection",
    timestamp: Date.now(),
    execute() {
      store.removeConnectionRaw(connectionCopy.id);
    },
    undo() {
      store.addConnectionRaw(connectionCopy);
    },
  };
}
