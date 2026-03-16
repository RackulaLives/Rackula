/**
 * Rack Commands for Undo/Redo
 */

import type { Command } from "./types";
import type { Rack, RackGroup, PlacedDevice } from "$lib/types";

/**
 * Rack settings that can be updated
 */
export type RackSettings = Omit<Rack, "devices" | "view">;

/**
 * Interface for layout store operations needed by rack commands
 */
export interface RackCommandStore {
  updateRackRaw(updates: Partial<RackSettings>): void;
  replaceRackRaw(rack: Rack): void;
  clearRackDevicesRaw(): PlacedDevice[];
  restoreRackDevicesRaw(devices: PlacedDevice[]): void;
  getRack(): Rack;
}

/**
 * Interface for layout store operations needed by rack add/delete commands
 */
export interface RackLifecycleCommandStore {
  addRackRaw(rack: Rack): void;
  deleteRackRaw(id: string): { rack: Rack; index: number; groups: RackGroup[] } | undefined;
  restoreRackRaw(rack: Rack, groups: RackGroup[], originalIndex?: number): void;
  setActiveRackId(id: string | null): void;
}

/**
 * Create a command to add a rack
 */
export function createAddRackCommand(
  rack: Rack,
  store: RackLifecycleCommandStore,
  /** When true, execute() will also set this rack as active (for redo) */
  setActive = false,
): Command {
  // Deep copy to avoid mutation issues
  const rackCopy = JSON.parse(JSON.stringify(rack)) as Rack;

  return {
    type: "ADD_RACK",
    description: `Add rack "${rack.name}"`,
    timestamp: Date.now(),
    execute() {
      store.addRackRaw(rackCopy);
      if (setActive) {
        store.setActiveRackId(rackCopy.id);
      }
    },
    undo() {
      store.deleteRackRaw(rackCopy.id);
    },
  };
}

/**
 * Create a command to delete a rack
 * Captures the rack state, original position, and group memberships for restoration on undo
 */
export function createDeleteRackCommand(
  rack: Rack,
  affectedGroups: RackGroup[],
  store: RackLifecycleCommandStore,
): Command {
  // Deep copy to avoid mutation issues
  const rackSnapshot = JSON.parse(JSON.stringify(rack)) as Rack;
  const groupSnapshots = JSON.parse(
    JSON.stringify(affectedGroups),
  ) as RackGroup[];
  // Capture original index on first execute so undo restores to the correct position
  let originalIndex: number | undefined;

  return {
    type: "DELETE_RACK",
    description: `Delete rack "${rack.name}"`,
    timestamp: Date.now(),
    execute() {
      const result = store.deleteRackRaw(rackSnapshot.id);
      if (result && originalIndex === undefined) {
        originalIndex = result.index;
      }
    },
    undo() {
      store.restoreRackRaw(rackSnapshot, groupSnapshots, originalIndex);
    },
  };
}

/**
 * Create a command to update rack settings
 */
export function createUpdateRackCommand(
  before: Partial<RackSettings>,
  after: Partial<RackSettings>,
  store: RackCommandStore,
): Command {
  return {
    type: "UPDATE_RACK",
    description: "Update rack settings",
    timestamp: Date.now(),
    execute() {
      store.updateRackRaw(after);
    },
    undo() {
      store.updateRackRaw(before);
    },
  };
}

/**
 * Create a command to replace the entire rack
 * Used for bulk operations or loading from file
 */
export function createReplaceRackCommand(
  oldRack: Rack,
  newRack: Rack,
  store: RackCommandStore,
): Command {
  // Deep copy to avoid mutation issues
  const oldRackCopy = JSON.parse(JSON.stringify(oldRack)) as Rack;
  const newRackCopy = JSON.parse(JSON.stringify(newRack)) as Rack;

  return {
    type: "REPLACE_RACK",
    description: "Replace rack",
    timestamp: Date.now(),
    execute() {
      store.replaceRackRaw(newRackCopy);
    },
    undo() {
      store.replaceRackRaw(oldRackCopy);
    },
  };
}

/**
 * Create a command to clear all devices from the rack
 */
export function createClearRackCommand(
  devices: PlacedDevice[],
  store: RackCommandStore,
): Command {
  // Store copies of all devices for restoration
  const devicesCopy = devices.map((d) => ({ ...d }));

  return {
    type: "CLEAR_RACK",
    description: `Clear rack (${devices.length} device${devices.length === 1 ? "" : "s"})`,
    timestamp: Date.now(),
    execute() {
      store.clearRackDevicesRaw();
    },
    undo() {
      store.restoreRackDevicesRaw(devicesCopy);
    },
  };
}
