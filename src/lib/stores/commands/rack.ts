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
 * Snapshot of the previous layout-level names captured before a first-rack
 * sync, used to restore them on undo.
 */
export interface LayoutNameSnapshot {
  /** Previous value of `layout.name`. */
  previousLayoutName: string;
  /** Previous value of `layout.metadata.name`, if metadata exists. */
  previousMetadataName?: string;
}

/**
 * Optional layout-name sync directive for createAddRackCommand. When provided,
 * the command will update `layout.name` and `layout.metadata.name` to the new
 * rack's name on execute(), and restore the previous values on undo().
 */
export interface AddRackLayoutNameSync {
  /** Whether the previous layout had a metadata block at the time of capture. */
  hasMetadata: boolean;
  /** Snapshot of names to restore on undo. */
  snapshot: LayoutNameSnapshot;
}

/**
 * Interface for layout store operations needed by rack add/delete commands
 */
export interface RackLifecycleCommandStore {
  addRackRaw(rack: Rack): void;
  deleteRackRaw(
    id: string,
  ): { rack: Rack; index: number; groups: RackGroup[] } | undefined;
  restoreRackRaw(rack: Rack, groups: RackGroup[], originalIndex?: number): void;
  getActiveRackId(): string | null;
  setActiveRackId(id: string | null): void;
  /**
   * Write both `layout.name` and `layout.metadata.name` directly (bypasses
   * history and dirty tracking). Used by createAddRackCommand to sync the
   * layout name when the first rack is added, and to restore it on undo.
   *
   * - `name` is written verbatim (no trimming, no empty-skip guard) so undo
   *   can restore arbitrary previous values exactly.
   * - When `metadataName` is `undefined`, `layout.metadata.name` is left
   *   untouched (e.g., layouts without metadata).
   */
  setLayoutNamesRaw(name: string, metadataName: string | undefined): void;
}

/**
 * Create a command to add a rack
 *
 * When `layoutNameSync` is provided, this command also syncs
 * `layout.name` and `layout.metadata.name` to the new rack's name on
 * `execute()` and restores the previous values on `undo()`. This is used
 * to keep the layout's display name in sync with the first rack a user
 * creates (#1482), while preserving full undo correctness.
 */
export function createAddRackCommand(
  rack: Rack,
  store: RackLifecycleCommandStore,
  /** When true, execute() will also set this rack as active (for redo) */
  setActive = false,
  /** Optional sync of layout-level names (#1482). */
  layoutNameSync?: AddRackLayoutNameSync,
): Command {
  // Deep copy to avoid mutation issues
  const rackCopy = JSON.parse(JSON.stringify(rack)) as Rack;
  // Captured on each execute() so undo (and a subsequent redo) restores
  // whichever rack was active immediately before this command ran (#2940).
  let previousActiveRackId: string | null = null;

  return {
    type: "ADD_RACK",
    description: `Add rack "${rack.name}"`,
    timestamp: Date.now(),
    execute() {
      previousActiveRackId = store.getActiveRackId();
      store.addRackRaw(rackCopy);
      if (setActive) {
        store.setActiveRackId(rackCopy.id);
      }
      if (layoutNameSync) {
        const newName = rackCopy.name;
        const metadataName = layoutNameSync.hasMetadata ? newName : undefined;
        store.setLayoutNamesRaw(newName, metadataName);
      }
    },
    undo() {
      store.deleteRackRaw(rackCopy.id);
      store.setActiveRackId(previousActiveRackId);
      if (layoutNameSync) {
        const { previousLayoutName, previousMetadataName } =
          layoutNameSync.snapshot;
        store.setLayoutNamesRaw(previousLayoutName, previousMetadataName);
      }
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
  // Captured on each execute() so undo restores whichever rack was active
  // immediately before this delete ran (#2940).
  let previousActiveRackId: string | null = null;

  return {
    type: "DELETE_RACK",
    description: `Delete rack "${rack.name}"`,
    timestamp: Date.now(),
    execute() {
      previousActiveRackId = store.getActiveRackId();
      const result = store.deleteRackRaw(rackSnapshot.id);
      if (result && originalIndex === undefined) {
        originalIndex = result.index;
      }
    },
    undo() {
      store.restoreRackRaw(rackSnapshot, groupSnapshots, originalIndex);
      store.setActiveRackId(previousActiveRackId);
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
