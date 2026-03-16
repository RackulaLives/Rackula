/**
 * Rack Actions Domain Module
 *
 * Extracted from layout.svelte.ts — handles rack creation, deletion,
 * duplication, reordering, and raw mutators for undo/redo.
 */

import type { FormFactor, Rack, RackGroup } from "$lib/types";
import { MAX_RACKS } from "$lib/types/constants";
import { createDefaultRack } from "$lib/utils/serialization";
import { layoutDebug } from "$lib/utils/debug";
import { generateId } from "$lib/utils/device";
import { generateRackId } from "$lib/utils/rack";
import { getHistoryStore } from "../history.svelte";
import {
  createAddRackCommand,
  createDeleteRackCommand,
  createBatchCommand,
  createCreateRackGroupCommand,
  type Command,
  type RackLifecycleCommandStore,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getRackGroupCommandAdapter } from "./rack-groups";

// =============================================================================
// Raw Mutators (for undo/redo system — bypass history)
// =============================================================================

/**
 * Raw add rack (bypasses history)
 * @param ctx - Layout state access
 * @param rack - Rack to add
 */
export function addRackRaw(ctx: LayoutStateAccess, rack: Rack): void {
  const layout = ctx.getLayout();
  ctx.setLayout({
    ...layout,
    racks: [...layout.racks, rack],
  });
}

/**
 * Raw delete rack (bypasses history)
 * Removes the rack and cleans up group memberships
 * @param ctx - Layout state access
 * @param id - Rack ID to delete
 * @returns The deleted rack, its original index, and affected groups (with original rack_ids), or undefined if not found
 */
export function deleteRackRaw(
  ctx: LayoutStateAccess,
  id: string,
): { rack: Rack; index: number; groups: RackGroup[] } | undefined {
  const layout = ctx.getLayout();
  const rackIndex = layout.racks.findIndex((r) => r.id === id);
  if (rackIndex === -1) return undefined;
  const rack = layout.racks[rackIndex];

  // Find groups that contain this rack (capture their state before modification)
  const affectedGroups = (layout.rack_groups ?? [])
    .filter((g) => g.rack_ids.includes(id))
    .map((g) => ({ ...g })); // Shallow copy to preserve rack_ids

  // Remove rack from array
  const newRacks = layout.racks.filter((r) => r.id !== id);

  // Remove rack from groups and clean up empty groups
  const newGroups = (layout.rack_groups ?? [])
    .map((group) => ({
      ...group,
      rack_ids: group.rack_ids.filter((rackId) => rackId !== id),
    }))
    .filter((group) => group.rack_ids.length > 0);

  ctx.setLayout({
    ...layout,
    racks: newRacks,
    rack_groups: newGroups.length > 0 ? newGroups : undefined,
  });

  // Update activeRackId if we deleted the active rack
  if (ctx.getActiveRackId() === id) {
    ctx.setActiveRackId(newRacks[0]?.id ?? null);
  }

  return { rack, index: rackIndex, groups: affectedGroups };
}

/**
 * Raw restore rack with group memberships (bypasses history)
 * Used by undo to restore a deleted rack
 * @param ctx - Layout state access
 * @param rack - Rack to restore
 * @param groups - Groups to restore (with original rack_ids including this rack)
 * @param originalIndex - Original position in the racks array (inserts at that position, or appends if omitted)
 */
export function restoreRackRaw(
  ctx: LayoutStateAccess,
  rack: Rack,
  groups: RackGroup[],
  originalIndex?: number,
): void {
  let layout = ctx.getLayout();

  // Insert the rack at its original position (or append if no index given)
  const racks = [...layout.racks];
  if (originalIndex !== undefined && originalIndex >= 0 && originalIndex <= racks.length) {
    racks.splice(originalIndex, 0, rack);
  } else {
    racks.push(rack);
  }
  layout = {
    ...layout,
    racks,
  };
  ctx.setLayout(layout);

  // Restore group memberships
  for (const restoredGroup of groups) {
    layout = ctx.getLayout();
    const existingGroup = (layout.rack_groups ?? []).find(
      (g) => g.id === restoredGroup.id,
    );
    if (existingGroup) {
      // Group still exists, restore the rack_ids
      ctx.setLayout({
        ...layout,
        rack_groups: (layout.rack_groups ?? []).map((g) =>
          g.id === restoredGroup.id
            ? { ...g, rack_ids: restoredGroup.rack_ids }
            : g,
        ),
      });
    } else {
      // Group was deleted (was empty), recreate it
      ctx.setLayout({
        ...layout,
        rack_groups: [...(layout.rack_groups ?? []), restoredGroup],
      });
    }
  }
}

/**
 * Get the command adapter for rack lifecycle operations
 * @param ctx - Layout state access
 */
export function getRackLifecycleCommandAdapter(
  ctx: LayoutStateAccess,
): RackLifecycleCommandStore {
  return {
    addRackRaw: (rack: Rack) => addRackRaw(ctx, rack),
    deleteRackRaw: (id: string) => deleteRackRaw(ctx, id),
    restoreRackRaw: (rack: Rack, groups: RackGroup[], originalIndex?: number) =>
      restoreRackRaw(ctx, rack, groups, originalIndex),
    setActiveRackId: (id: string | null) => ctx.setActiveRackId(id),
  };
}

// =============================================================================
// Getters / Utilities
// =============================================================================

/**
 * Get a rack by its ID
 * @param ctx - Layout state access
 * @param id - Rack ID to find
 * @returns The rack or undefined if not found
 */
export function getRackById(
  ctx: LayoutStateAccess,
  id: string,
): Rack | undefined {
  return ctx.findRack(id);
}

/**
 * Set the active rack for editing
 * @param ctx - Layout state access
 * @param id - Rack ID to make active (null to clear)
 */
export function setActiveRack(
  ctx: LayoutStateAccess,
  id: string | null,
): void {
  if (id === null) {
    ctx.setActiveRackId(null);
    return;
  }

  // Verify the rack exists
  const rack = ctx.findRack(id);
  if (rack) {
    ctx.setActiveRackId(id);
  }
}

/**
 * Get the index of a rack by ID
 * @param ctx - Layout state access
 * @param rackId - Rack ID to find
 * @returns Index in layout.racks or -1 if not found
 */
export function getRackIndex(
  ctx: LayoutStateAccess,
  rackId: string,
): number {
  return ctx.findRackIndex(rackId);
}

/**
 * Get the rack to operate on (by ID or active rack)
 * @param ctx - Layout state access
 * @param rackId - Optional rack ID (uses active rack if not provided)
 * @returns Rack and its index, or undefined if not found
 */
export function getTargetRack(
  ctx: LayoutStateAccess,
  rackId?: string,
): { rack: Rack; index: number } | undefined {
  const layout = ctx.getLayout();

  if (rackId) {
    const index = ctx.findRackIndex(rackId);
    if (index !== -1) {
      return { rack: layout.racks[index], index };
    }
    return undefined;
  }

  // Use active rack
  const activeId = ctx.getActiveRackId();
  if (activeId) {
    const index = ctx.findRackIndex(activeId);
    if (index !== -1) {
      return { rack: layout.racks[index], index };
    }
  }

  // Fall back to first rack
  if (layout.racks.length > 0) {
    return { rack: layout.racks[0], index: 0 };
  }

  return undefined;
}

// =============================================================================
// Recorded Actions (use undo/redo)
// =============================================================================

/**
 * Add a new rack to the layout
 * Layout name is managed independently via setLayoutName
 * Uses undo/redo support via command pattern
 * @param ctx - Layout state access
 * @param name - Rack name
 * @param height - Rack height in U
 * @param width - Rack width in inches (10 or 19)
 * @param form_factor - Rack form factor
 * @param desc_units - Whether units are numbered top-down
 * @param starting_unit - First U number
 * @returns The created rack object with ID, or null if at max capacity
 */
export function addRack(
  ctx: LayoutStateAccess,
  name: string,
  height: number,
  width?: Rack["width"],
  form_factor?: FormFactor,
  desc_units?: boolean,
  starting_unit?: number,
): (Rack & { id: string }) | null {
  const layout = ctx.getLayout();

  // Check if we can add more racks
  if (layout.racks.length >= MAX_RACKS) {
    return null;
  }

  const newRack = createDefaultRack(
    name,
    height,
    width ?? 19,
    form_factor ?? "4-post-cabinet",
    desc_units ?? false,
    starting_unit ?? 1,
    true, // show_rear
    generateRackId(), // id - pass directly
  );

  // Use recorded action for undo/redo support
  // setActive: true ensures redo also restores the active rack selection
  const history = getHistoryStore();
  const adapter = getRackLifecycleCommandAdapter(ctx);
  const command = createAddRackCommand(newRack, adapter, true);
  history.execute(command);
  ctx.markDirty();

  // Mark as started (user has created a rack)
  ctx.markStarted();

  return newRack;
}

/**
 * Interface for bayed rack group creation result
 */
interface BayedGroupResult {
  /** The created rack group */
  group: RackGroup;
  /** The created racks (in order) */
  racks: Rack[];
}

/**
 * Create a bayed rack group (multiple racks side-by-side)
 * Creates multiple racks and links them in a group for atomic management.
 *
 * @param ctx - Layout state access
 * @param groupName - Name for the group
 * @param bayCount - Number of bays (2 or 3)
 * @param height - Height for each rack in U
 * @param width - Width for each rack in inches
 * @returns Created group and racks, or null if insufficient capacity
 */
export function addBayedRackGroup(
  ctx: LayoutStateAccess,
  groupName: string,
  bayCount: 2 | 3,
  height: number,
  width: Rack["width"] = 19,
): BayedGroupResult | null {
  const layout = ctx.getLayout();

  // Check capacity
  if (layout.racks.length + bayCount > MAX_RACKS) {
    return null;
  }

  // Create the individual racks
  const newRacks: Rack[] = [];
  for (let i = 0; i < bayCount; i++) {
    const rack = createDefaultRack(
      `Bay ${i + 1}`,
      height,
      width,
      "4-post-cabinet",
      false,
      1,
      true,
      generateRackId(),
    );
    newRacks.push(rack);
  }

  // Create the group linking them
  const group: RackGroup = {
    id: generateId(),
    name: groupName,
    rack_ids: newRacks.map((r) => r.id),
    layout_preset: "bayed",
  };

  layoutDebug.state(
    "addBayedRackGroup: created %d racks for group %s",
    newRacks.length,
    groupName,
  );

  // Use command pattern for undo/redo support
  // First rack gets setActive: true so redo also restores active rack selection
  const history = getHistoryStore();
  const rackAdapter = getRackLifecycleCommandAdapter(ctx);
  const groupAdapter = getRackGroupCommandAdapter(ctx);

  const commands: Command[] = [
    ...newRacks.map((rack, i) => createAddRackCommand(rack, rackAdapter, i === 0)),
    createCreateRackGroupCommand(group, groupAdapter),
  ];
  const batch = createBatchCommand(`Create bayed group "${groupName}"`, commands);
  history.execute(batch);
  ctx.markDirty();

  // Mark as started
  ctx.markStarted();

  layoutDebug.state(
    "addBayedRackGroup: state updated - activeRackId=%s, isDirty=%s",
    newRacks[0]!.id,
    true,
  );

  return { group, racks: newRacks };
}

/**
 * Delete a rack from the layout
 * Also removes the rack from any groups it belongs to
 * Uses undo/redo support via command pattern
 * @param ctx - Layout state access
 * @param id - Rack ID to delete
 */
export function deleteRack(ctx: LayoutStateAccess, id: string): void {
  const layout = ctx.getLayout();
  const rack = layout.racks.find((r) => r.id === id);
  if (!rack) return;

  // Find groups that contain this rack (for undo restoration)
  const affectedGroups = (layout.rack_groups ?? [])
    .filter((g) => g.rack_ids.includes(id))
    .map((g) => JSON.parse(JSON.stringify(g)) as RackGroup);

  // Use recorded action for undo/redo support
  const history = getHistoryStore();
  const adapter = getRackLifecycleCommandAdapter(ctx);
  const command = createDeleteRackCommand(rack, affectedGroups, adapter);
  history.execute(command);
  ctx.markDirty();
}

/**
 * Reorder racks by moving from one index to another
 * Updates position field to match new array indices
 * @param ctx - Layout state access
 * @param fromIndex - Source index
 * @param toIndex - Target index
 */
export function reorderRacks(
  ctx: LayoutStateAccess,
  fromIndex: number,
  toIndex: number,
): void {
  const layout = ctx.getLayout();
  if (
    fromIndex < 0 ||
    fromIndex >= layout.racks.length ||
    toIndex < 0 ||
    toIndex >= layout.racks.length ||
    fromIndex === toIndex
  ) {
    return;
  }

  const newRacks = [...layout.racks];
  const [removed] = newRacks.splice(fromIndex, 1);
  newRacks.splice(toIndex, 0, removed);

  // Update position field to match new array indices
  ctx.setLayout({
    ...layout,
    racks: newRacks.map((r, index) => ({ ...r, position: index })),
  });
  ctx.markDirty();
}

/**
 * Duplicate a rack with all its devices
 * Handles container_id references by remapping to new device IDs
 * @param ctx - Layout state access
 * @param id - Rack ID to duplicate
 * @returns The duplicated rack or error message
 */
export function duplicateRack(
  ctx: LayoutStateAccess,
  id: string,
): {
  error?: string;
  rack?: Rack & { id: string };
} {
  const layout = ctx.getLayout();

  if (layout.racks.length >= MAX_RACKS) {
    return { error: `Maximum of ${MAX_RACKS} racks allowed` };
  }

  const sourceRack = layout.racks.find((r) => r.id === id);
  if (!sourceRack) {
    return { error: "Rack not found" };
  }

  const newRackId = generateRackId();

  // Build a mapping from old device IDs to new device IDs
  // This ensures container_id references remain valid
  const idMap = new Map<string, string>(
    sourceRack.devices.map((d) => [d.id, generateId()]),
  );

  // Deep clone to avoid shared references with nested objects (ports, etc.)
  // Uses JSON round-trip as structuredClone cannot handle Svelte reactive proxies
  const cloned = JSON.parse(JSON.stringify(sourceRack)) as typeof sourceRack;
  cloned.id = newRackId;
  cloned.name = `${sourceRack.name} (Copy)`;
  cloned.position = layout.racks.length;
  cloned.devices = cloned.devices.map((d) => {
    const newId = idMap.get(d.id)!;
    const newContainerId = d.container_id
      ? idMap.get(d.container_id)
      : undefined;
    return { ...d, id: newId, container_id: newContainerId };
  });
  const duplicatedRack = cloned;

  // setActive: true ensures redo also restores the active rack selection
  const history = getHistoryStore();
  const adapter = getRackLifecycleCommandAdapter(ctx);
  const command = createAddRackCommand(duplicatedRack, adapter, true);
  history.execute(command);
  ctx.markDirty();

  return { rack: duplicatedRack };
}
