/**
 * Rack Group Domain Module
 *
 * Extracted from layout.svelte.ts — handles rack group creation,
 * updates, deletion, bay management, and raw mutators for undo/redo.
 */

import type { Rack, RackGroup, LayoutPreset } from "$lib/types";
import { MAX_RACKS } from "$lib/types/constants";
import { createDefaultRack } from "$lib/utils/serialization";
import { layoutDebug } from "$lib/utils/debug";
import { generateRackId, generateGroupId } from "$lib/utils/rack";
import { getHistoryStore } from "../history.svelte";
import {
  createCreateRackGroupCommand,
  createUpdateRackGroupCommand,
  createDeleteRackGroupCommand,
  createAddRackCommand,
  createDeleteRackCommand,
  createBatchCommand,
  type Command,
  type RackGroupCommandStore,
} from "../commands";
import { getRackLifecycleCommandAdapter } from "./rack-actions";
import type { LayoutStateAccess } from "./types";

// =============================================================================
// Raw Mutators (for undo/redo system — bypass history)
// =============================================================================

/**
 * Raw create rack group (bypasses history)
 * @param ctx - Layout state access
 * @param group - Group to create
 */
export function createRackGroupRaw(
  ctx: LayoutStateAccess,
  group: RackGroup,
): void {
  const layout = ctx.getLayout();
  const newGroups = [...(layout.rack_groups ?? []), group];
  ctx.setLayout({
    ...layout,
    rack_groups: newGroups,
  });
}

/**
 * Raw update rack group (bypasses history)
 * @param ctx - Layout state access
 * @param id - Group ID
 * @param updates - Properties to update
 */
export function updateRackGroupRaw(
  ctx: LayoutStateAccess,
  id: string,
  updates: Partial<RackGroup>,
): void {
  const layout = ctx.getLayout();
  const newGroups = (layout.rack_groups ?? []).map((g) =>
    g.id === id ? { ...g, ...updates } : g,
  );
  ctx.setLayout({
    ...layout,
    rack_groups: newGroups,
  });
}

/**
 * Raw delete rack group (bypasses history)
 * @param ctx - Layout state access
 * @param id - Group ID
 * @returns The deleted group or undefined
 */
export function deleteRackGroupRaw(
  ctx: LayoutStateAccess,
  id: string,
): RackGroup | undefined {
  const group = getRackGroupById(ctx, id);
  if (!group) return undefined;

  const layout = ctx.getLayout();
  const newGroups = (layout.rack_groups ?? []).filter((g) => g.id !== id);
  ctx.setLayout({
    ...layout,
    rack_groups: newGroups.length > 0 ? newGroups : undefined,
  });
  return group;
}

/**
 * Get the command adapter for rack group operations
 * @param ctx - Layout state access
 */
export function getRackGroupCommandAdapter(
  ctx: LayoutStateAccess,
): RackGroupCommandStore {
  return {
    createRackGroupRaw: (group: RackGroup) => createRackGroupRaw(ctx, group),
    updateRackGroupRaw: (id: string, updates: Partial<RackGroup>) =>
      updateRackGroupRaw(ctx, id, updates),
    deleteRackGroupRaw: (id: string) => deleteRackGroupRaw(ctx, id),
  };
}

// =============================================================================
// Getters
// =============================================================================

/**
 * Get a rack group by ID
 * @param ctx - Layout state access
 * @param id - Group ID
 * @returns The group or undefined
 */
export function getRackGroupById(
  ctx: LayoutStateAccess,
  id: string,
): RackGroup | undefined {
  return ctx.getRackGroups().find((g) => g.id === id);
}

/**
 * Get the rack group that contains a specific rack
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @returns The group or undefined
 */
export function getRackGroupForRack(
  ctx: LayoutStateAccess,
  rackId: string,
): RackGroup | undefined {
  return ctx.getRackGroups().find((g) => g.rack_ids.includes(rackId));
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that all racks in a group have the same height (for bayed preset)
 * @param ctx - Layout state access
 * @param rackIds - Array of rack IDs to validate
 * @returns Error message if validation fails, undefined if valid
 */
export function validateBayedGroupHeights(
  ctx: LayoutStateAccess,
  rackIds: string[],
): string | undefined {
  if (rackIds.length <= 1) return undefined;

  const heights = new Set<number>();
  for (const rackId of rackIds) {
    const rack = ctx.findRack(rackId);
    if (rack) {
      heights.add(rack.height);
    }
  }

  if (heights.size > 1) {
    const heightList = Array.from(heights)
      .sort((a, b) => a - b)
      .map((h) => `${h}U`)
      .join(", ");
    return `Bayed groups require same-height racks. Found heights: ${heightList}`;
  }

  return undefined;
}

// =============================================================================
// Recorded Actions (use undo/redo)
// =============================================================================

/**
 * Create a new rack group
 * @param ctx - Layout state access
 * @param name - Group name
 * @param rackIds - Array of rack IDs to include in the group
 * @param preset - Layout preset (defaults to "row")
 * @returns The created group or error
 */
export function createRackGroup(
  ctx: LayoutStateAccess,
  name: string,
  rackIds: string[],
  preset?: LayoutPreset,
): { group?: RackGroup; error?: string } {
  // Validate at least one rack
  if (rackIds.length === 0) {
    return { error: "Group must contain at least one rack" };
  }

  const layout = ctx.getLayout();

  // Validate all rack IDs exist
  for (const rackId of rackIds) {
    if (!layout.racks.find((r) => r.id === rackId)) {
      return { error: `Rack "${rackId}" not found` };
    }
  }

  // Validate no rack is already in another group
  for (const rackId of rackIds) {
    const existingGroup = getRackGroupForRack(ctx, rackId);
    if (existingGroup) {
      const rackName =
        layout.racks.find((r) => r.id === rackId)?.name ?? rackId;
      return {
        error: `Rack "${rackName}" is already in group "${existingGroup.name ?? existingGroup.id}". Remove it first.`,
      };
    }
  }

  // Validate bayed preset minimum rack count
  const actualPreset = preset ?? "row";
  if (actualPreset === "bayed" && rackIds.length < 2) {
    return { error: "Bayed groups require at least 2 racks" };
  }

  // Validate bayed preset height requirement
  if (actualPreset === "bayed") {
    const heightError = validateBayedGroupHeights(ctx, rackIds);
    if (heightError) {
      return { error: heightError };
    }
  }

  // Create the group
  const group: RackGroup = {
    id: generateGroupId(),
    name,
    rack_ids: [...rackIds],
    layout_preset: actualPreset,
  };

  // Use recorded action for undo/redo support
  const history = getHistoryStore();
  const adapter = getRackGroupCommandAdapter(ctx);
  const command = createCreateRackGroupCommand(group, adapter);
  history.execute(command);
  ctx.markDirty();

  layoutDebug.group(
    "created group %s with %d racks, preset: %s",
    group.id,
    rackIds.length,
    actualPreset,
  );

  return { group };
}

/**
 * Update a rack group's properties
 * @param ctx - Layout state access
 * @param id - Group ID
 * @param updates - Properties to update
 * @returns Error if validation fails
 */
export function updateRackGroup(
  ctx: LayoutStateAccess,
  id: string,
  updates: Partial<RackGroup>,
): { error?: string } {
  const group = getRackGroupById(ctx, id);
  if (!group) {
    return { error: "Group not found" };
  }

  const layout = ctx.getLayout();

  // Validate all rack IDs in updates exist
  if (updates.rack_ids) {
    for (const rackId of updates.rack_ids) {
      if (!layout.racks.find((r) => r.id === rackId)) {
        return { error: `Rack "${rackId}" not found` };
      }
    }
  }

  // Validate bayed preset minimum rack count
  const effectivePreset = updates.layout_preset ?? group.layout_preset;
  const effectiveRackIds = updates.rack_ids ?? group.rack_ids;
  if (effectivePreset === "bayed" && effectiveRackIds.length < 2) {
    return { error: "Bayed groups require at least 2 racks" };
  }

  // Validate bayed preset height requirement
  // Check when: (1) switching to bayed, or (2) updating rack_ids on existing bayed group
  if (
    effectivePreset === "bayed" &&
    (updates.layout_preset === "bayed" || updates.rack_ids)
  ) {
    const heightError = validateBayedGroupHeights(ctx, effectiveRackIds);
    if (heightError) {
      return { error: heightError };
    }
  }

  // Capture before state for undo
  const before: Partial<RackGroup> = {};
  for (const key of Object.keys(updates) as (keyof RackGroup)[]) {
    before[key] = group[key] as never;
  }

  // Use recorded action for undo/redo support
  const history = getHistoryStore();
  const adapter = getRackGroupCommandAdapter(ctx);
  const command = createUpdateRackGroupCommand(id, before, updates, adapter);
  history.execute(command);
  ctx.markDirty();

  layoutDebug.group("updated group %s: %o", id, updates);

  return {};
}

/**
 * Delete a rack group
 * @param ctx - Layout state access
 * @param id - Group ID to delete
 */
export function deleteRackGroup(ctx: LayoutStateAccess, id: string): void {
  const group = getRackGroupById(ctx, id);
  if (!group) return;

  // Use recorded action for undo/redo support
  const history = getHistoryStore();
  const adapter = getRackGroupCommandAdapter(ctx);
  const command = createDeleteRackGroupCommand(group, adapter);
  history.execute(command);
  ctx.markDirty();

  layoutDebug.group("deleted group %s", id);
}

/**
 * Add a rack to an existing group
 * @param ctx - Layout state access
 * @param groupId - Group ID
 * @param rackId - Rack ID to add
 * @returns Error if validation fails
 */
export function addRackToGroup(
  ctx: LayoutStateAccess,
  groupId: string,
  rackId: string,
): { error?: string } {
  const group = getRackGroupById(ctx, groupId);
  if (!group) {
    return { error: "Group not found" };
  }

  // Check rack exists
  const rack = ctx.findRack(rackId);
  if (!rack) {
    return { error: `Rack "${rackId}" not found` };
  }

  // Check rack not already in group
  if (group.rack_ids.includes(rackId)) {
    return { error: "Rack is already in this group" };
  }

  // Check rack not in ANY other group
  const existingGroup = getRackGroupForRack(ctx, rackId);
  if (existingGroup && existingGroup.id !== groupId) {
    const rackName = rack.name ?? rackId;
    return {
      error: `Rack "${rackName}" is already in group "${existingGroup.name ?? existingGroup.id}". Remove it first.`,
    };
  }

  // Validate bayed preset height requirement
  if (group.layout_preset === "bayed") {
    const existingRack = ctx.findRack(group.rack_ids[0]!);
    if (existingRack && rack.height !== existingRack.height) {
      return {
        error: `Cannot add ${rack.height}U rack to bayed group with ${existingRack.height}U racks`,
      };
    }
  }

  // Update via updateRackGroup for undo/redo support
  const newRackIds = [...group.rack_ids, rackId];
  return updateRackGroup(ctx, groupId, { rack_ids: newRackIds });
}

/**
 * Remove a rack from a group
 * @param ctx - Layout state access
 * @param groupId - Group ID
 * @param rackId - Rack ID to remove
 */
export function removeRackFromGroup(
  ctx: LayoutStateAccess,
  groupId: string,
  rackId: string,
): void {
  const group = getRackGroupById(ctx, groupId);
  if (!group) return;

  const newRackIds = group.rack_ids.filter((id) => id !== rackId);

  // If this was the last rack, delete the group
  if (newRackIds.length === 0) {
    deleteRackGroup(ctx, groupId);
  } else {
    updateRackGroup(ctx, groupId, { rack_ids: newRackIds });
  }
}

/**
 * Add a new empty bay to a bayed rack group
 * Creates a new rack with matching height and adds to group
 * @param ctx - Layout state access
 * @param groupId - Group ID
 * @param deleteRackFn - Function to delete a rack (from rack-actions, avoids circular dep)
 * @returns The new rack ID or error
 */
export function addBayToGroup(
  ctx: LayoutStateAccess,
  groupId: string,
): { rackId?: string; error?: string } {
  const group = getRackGroupById(ctx, groupId);
  if (!group) {
    return { error: "Group not found" };
  }

  if (group.layout_preset !== "bayed") {
    return { error: "Can only add bays to bayed rack groups" };
  }

  const layout = ctx.getLayout();

  // Get height from existing rack in group
  const existingRack = layout.racks.find((r) => r.id === group.rack_ids[0]);
  if (!existingRack) {
    return { error: "Group has no existing racks" };
  }

  // Check capacity
  if (layout.racks.length >= MAX_RACKS) {
    return { error: "Maximum rack limit reached" };
  }

  // Create new rack with matching height, using createDefaultRack for proper field initialization
  const newRackId = generateRackId();
  const bayNumber = group.rack_ids.length + 1;
  // Validate width - default to 19 if the persisted value is unexpected.
  const validWidths: Rack["width"][] = [10, 19, 21, 23];
  const width = (
    validWidths.includes(existingRack.width) ? existingRack.width : 19
  ) as Rack["width"];
  const newRack = createDefaultRack(
    `Bay ${bayNumber}`,
    existingRack.height,
    width,
    existingRack.form_factor,
    existingRack.desc_units,
    existingRack.starting_unit,
    existingRack.show_rear,
    newRackId,
  );

  // Use BatchCommand for atomic undo/redo
  const history = getHistoryStore();
  const rackAdapter = getRackLifecycleCommandAdapter(ctx);
  const groupAdapter = getRackGroupCommandAdapter(ctx);

  const oldRackIds = [...group.rack_ids];
  const newRackIds = [...oldRackIds, newRackId];

  const commands: Command[] = [
    createAddRackCommand(newRack, rackAdapter),
    createUpdateRackGroupCommand(groupId, { rack_ids: oldRackIds }, { rack_ids: newRackIds }, groupAdapter),
  ];
  const batch = createBatchCommand(`Add bay ${bayNumber} to "${group.name}"`, commands);
  history.execute(batch);
  ctx.markDirty();

  layoutDebug.group(
    "addBayToGroup: added bay %d (rack %s) to group %s",
    bayNumber,
    newRackId,
    groupId,
  );

  return { rackId: newRackId };
}

/**
 * Remove the last bay from a bayed rack group
 * @param ctx - Layout state access
 * @param groupId - Group ID
 * @param deleteRackFn - Function to delete a rack (injected to avoid circular dep)
 * @returns Error if bay has devices or group would have < 2 bays
 */
export function removeBayFromGroup(
  ctx: LayoutStateAccess,
  groupId: string,
  deleteRackFn: (id: string) => void,
): { error?: string } {
  const group = getRackGroupById(ctx, groupId);
  if (!group) {
    layoutDebug.group("removeBayFromGroup: group %s not found", groupId);
    return { error: "Group not found" };
  }

  if (group.rack_ids.length <= 2) {
    layoutDebug.group(
      "removeBayFromGroup: group %s has only %d bays, cannot remove",
      groupId,
      group.rack_ids.length,
    );
    return { error: "Bayed racks must have at least 2 bays" };
  }

  // Get the last rack
  const lastRackId = group.rack_ids[group.rack_ids.length - 1];
  if (!lastRackId) {
    return { error: "Group has no racks" };
  }
  const lastRack = ctx.findRack(lastRackId);

  if (lastRack && lastRack.devices.length > 0) {
    layoutDebug.group(
      "removeBayFromGroup: bay %d has %d devices, cannot remove",
      group.rack_ids.length,
      lastRack.devices.length,
    );
    return {
      error: `Bay ${group.rack_ids.length} contains ${lastRack.devices.length} device(s). Remove them first.`,
    };
  }

  const bayNumber = group.rack_ids.length;

  layoutDebug.group(
    "removeBayFromGroup: removing bay %d (rack %s) from group %s",
    bayNumber,
    lastRackId,
    groupId,
  );

  // Delete the rack using the command pattern for proper undo/redo support.
  // deleteRack handles both rack deletion and group membership cleanup atomically.
  deleteRackFn(lastRackId);

  layoutDebug.group(
    "removeBayFromGroup: successfully removed bay %d (rack %s) from group %s",
    bayNumber,
    lastRackId,
    groupId,
  );

  return {};
}

/**
 * Set the bay count for a bayed rack group.
 *
 * Performs full upfront validation, then builds all rack and group mutations
 * as a single BatchCommand for atomic undo/redo.
 *
 * @param ctx - Layout state access
 * @param groupId - Group ID
 * @param targetCount - Desired bay count (must be >= 2)
 * @param deleteRackFn - Function to delete a rack (injected to avoid circular dep; unused in batch path)
 * @returns Error if validation fails
 */
export function setBayCount(
  ctx: LayoutStateAccess,
  groupId: string,
  targetCount: number,
  _deleteRackFn: (id: string) => void,
): { error?: string } {
  const group = getRackGroupById(ctx, groupId);
  if (!group) {
    return { error: "Group not found" };
  }

  if (group.layout_preset !== "bayed") {
    return { error: "Can only modify bay count for bayed rack groups" };
  }

  if (targetCount < 2) {
    return { error: "Bayed racks must have at least 2 bays" };
  }

  const currentCount = group.rack_ids.length;
  if (targetCount === currentCount) {
    return {}; // No change needed
  }

  const layout = ctx.getLayout();

  // Validate upfront before making any changes
  if (targetCount > currentCount) {
    const baysToAdd = targetCount - currentCount;
    if (layout.racks.length + baysToAdd > MAX_RACKS) {
      return { error: "Maximum rack limit would be exceeded" };
    }
  } else {
    for (let i = currentCount - 1; i >= targetCount; i--) {
      const rackId = group.rack_ids[i];
      const rack = layout.racks.find((r) => r.id === rackId);
      if (rack && rack.devices.length > 0) {
        return {
          error: `Bay ${i + 1} contains ${rack.devices.length} device(s). Remove them first.`,
        };
      }
    }
  }

  // Build all mutations as a single BatchCommand
  const history = getHistoryStore();
  const rackAdapter = getRackLifecycleCommandAdapter(ctx);
  const groupAdapter = getRackGroupCommandAdapter(ctx);
  const oldRackIds = [...group.rack_ids];
  const commands: Command[] = [];

  if (targetCount > currentCount) {
    // Adding bays — create racks, then update group with all new IDs
    const existingRack = layout.racks.find((r) => r.id === group.rack_ids[0]);
    if (!existingRack) {
      return { error: "Group has no existing racks" };
    }

    const validWidths: Rack["width"][] = [10, 19, 21, 23];
    const width = (
      validWidths.includes(existingRack.width) ? existingRack.width : 19
    ) as Rack["width"];

    const newRackIds: string[] = [];
    for (let i = currentCount; i < targetCount; i++) {
      const newRackId = generateRackId();
      const bayNumber = i + 1;
      const newRack = createDefaultRack(
        `Bay ${bayNumber}`,
        existingRack.height,
        width,
        existingRack.form_factor,
        existingRack.desc_units,
        existingRack.starting_unit,
        existingRack.show_rear,
        newRackId,
      );
      commands.push(createAddRackCommand(newRack, rackAdapter));
      newRackIds.push(newRackId);
    }

    commands.push(
      createUpdateRackGroupCommand(
        groupId,
        { rack_ids: oldRackIds },
        { rack_ids: [...oldRackIds, ...newRackIds] },
        groupAdapter,
      ),
    );
  } else {
    // Removing bays — update group first (so rack_ids shrinks), then delete racks
    const rackIdsToKeep = oldRackIds.slice(0, targetCount);
    const rackIdsToRemove = oldRackIds.slice(targetCount);

    commands.push(
      createUpdateRackGroupCommand(
        groupId,
        { rack_ids: oldRackIds },
        { rack_ids: rackIdsToKeep },
        groupAdapter,
      ),
    );

    // Delete racks that are being removed (reverse order for cleaner undo)
    for (const rackId of rackIdsToRemove.reverse()) {
      const rack = layout.racks.find((r) => r.id === rackId);
      if (rack) {
        commands.push(createDeleteRackCommand(rack, [], rackAdapter));
      }
    }
  }

  const batch = createBatchCommand(`Set bay count to ${targetCount}`, commands);
  history.execute(batch);
  ctx.markDirty();

  return {};
}

/**
 * Reorder racks within a group by providing a new order of rack IDs.
 * This changes the bay numbering for bayed view rendering.
 * Uses undo/redo system for reverting the operation.
 *
 * @param ctx - Layout state access
 * @param groupId - Group ID to reorder
 * @param newOrder - New order of rack IDs (must contain same racks, just reordered)
 * @returns Error if validation fails
 */
export function reorderRacksInGroup(
  ctx: LayoutStateAccess,
  groupId: string,
  newOrder: string[],
): { error?: string } {
  const group = getRackGroupById(ctx, groupId);
  if (!group) {
    return { error: "Group not found" };
  }

  layoutDebug.group(
    "reordering racks in group %s: %o -> %o",
    groupId,
    group.rack_ids,
    newOrder,
  );

  // Validate same racks, just reordered
  const currentSet = new Set(group.rack_ids);
  const newSet = new Set(newOrder);
  if (
    currentSet.size !== newSet.size ||
    ![...currentSet].every((id) => newSet.has(id))
  ) {
    return { error: "New order must contain same racks" };
  }

  // Check for duplicates in newOrder
  if (newOrder.length !== newSet.size) {
    return { error: "New order contains duplicate rack IDs" };
  }

  // No change needed if order is the same
  if (JSON.stringify(group.rack_ids) === JSON.stringify(newOrder)) {
    layoutDebug.group(
      "reorder skipped - order unchanged for group %s",
      groupId,
    );
    return {};
  }

  // Use updateRackGroup which already has undo/redo support
  return updateRackGroup(ctx, groupId, { rack_ids: newOrder });
}
