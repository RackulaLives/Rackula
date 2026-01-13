/**
 * Rack Group Commands for Undo/Redo
 *
 * Issue: #476 - Rack Group Management & Layout Presets
 */

import type { Command } from "./types";
import type { RackGroup } from "$lib/types";

/**
 * Interface for layout store operations needed by rack group commands
 */
export interface RackGroupCommandStore {
  createRackGroupRaw(group: RackGroup): void;
  updateRackGroupRaw(id: string, updates: Partial<RackGroup>): void;
  deleteRackGroupRaw(id: string): RackGroup | undefined;
}

/**
 * Create a command to create a rack group
 */
export function createCreateRackGroupCommand(
  group: RackGroup,
  store: RackGroupCommandStore,
): Command {
  // Deep copy to avoid mutation issues
  const groupCopy = JSON.parse(JSON.stringify(group)) as RackGroup;

  const displayName = group.name ?? group.id ?? "unnamed";

  return {
    type: "CREATE_RACK_GROUP",
    description: `Create rack group "${displayName}"`,
    timestamp: Date.now(),
    execute() {
      store.createRackGroupRaw(groupCopy);
    },
    undo() {
      store.deleteRackGroupRaw(groupCopy.id);
    },
  };
}

/**
 * Create a command to update a rack group
 */
export function createUpdateRackGroupCommand(
  id: string,
  before: Partial<RackGroup>,
  after: Partial<RackGroup>,
  store: RackGroupCommandStore,
): Command {
  // Deep copy to avoid mutation issues
  const beforeCopy = JSON.parse(JSON.stringify(before)) as Partial<RackGroup>;
  const afterCopy = JSON.parse(JSON.stringify(after)) as Partial<RackGroup>;

  const displayName = afterCopy.name ?? beforeCopy.name ?? id ?? "unnamed";

  return {
    type: "UPDATE_RACK_GROUP",
    description: `Update rack group "${displayName}"`,
    timestamp: Date.now(),
    execute() {
      store.updateRackGroupRaw(id, afterCopy);
    },
    undo() {
      store.updateRackGroupRaw(id, beforeCopy);
    },
  };
}

/**
 * Create a command to delete a rack group
 */
export function createDeleteRackGroupCommand(
  group: RackGroup,
  store: RackGroupCommandStore,
): Command {
  // Deep copy to avoid mutation issues
  const groupCopy = JSON.parse(JSON.stringify(group)) as RackGroup;

  const displayName = group.name ?? group.id ?? "unnamed";

  return {
    type: "DELETE_RACK_GROUP",
    description: `Delete rack group "${displayName}"`,
    timestamp: Date.now(),
    execute() {
      store.deleteRackGroupRaw(groupCopy.id);
    },
    undo() {
      store.createRackGroupRaw(groupCopy);
    },
  };
}
