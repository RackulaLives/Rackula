/**
 * Layout Store
 * Central state management for the application using Svelte 5 runes
 */

import { SvelteSet } from "svelte/reactivity";
import type {
  FormFactor,
  Layout,
  Rack,
  RackGroup,
  LayoutPreset,
  DeviceType,
  PlacedDevice,
  DeviceFace,
  RackView,
  DisplayMode,
  Cable,
  SlotPosition,
} from "$lib/types";
import {
  DEFAULT_DEVICE_FACE,
  MAX_RACKS,
  UNITS_PER_U,
} from "$lib/types/constants";
import { toInternalUnits, toHumanUnits } from "$lib/utils/position";
import {
  canPlaceDevice,
  canPlaceInContainer,
  findValidDropPositions,
  isSlotOccupied,
} from "$lib/utils/collision";
import { createLayout, createDefaultRack } from "$lib/utils/serialization";
import {
  createDeviceType as createDeviceTypeHelper,
  findDeviceType as findDeviceTypeInArray,
  type CreateDeviceTypeInput,
} from "$lib/stores/layout-helpers";
import { findDeviceType } from "$lib/utils/device-lookup";
import { getStarterSlugs } from "$lib/data/starterLibrary";
import { getBrandSlugs } from "$lib/data/brandPacks";
import { debug, layoutDebug } from "$lib/utils/debug";
import { generateId } from "$lib/utils/device";
import { generateRackId, generateGroupId } from "$lib/utils/rack";
import { instantiatePorts } from "$lib/utils/port-utils";
import { sanitizeFilename } from "$lib/utils/imageUpload";
import { getHistoryStore } from "./history.svelte";
import { getImageStore } from "./images.svelte";
import { getStarterSlugs } from "$lib/data/starterLibrary";
import { getBrandSlugs } from "$lib/data/brandPacks";
import {
  createAddDeviceTypeCommand,
  createUpdateDeviceTypeCommand,
  createDeleteDeviceTypeCommand,
  createPlaceDeviceCommand,
  createMoveDeviceCommand,
  createRemoveDeviceCommand,
  createUpdateDeviceFaceCommand,
  createUpdateDeviceNameCommand,
  createUpdateDevicePlacementImageCommand,
  createUpdateDeviceColourCommand,
  createUpdateDeviceSlotPositionCommand,
  createAddRackCommand,
  createDeleteRackCommand,
  createUpdateRackCommand,
  createClearRackCommand,
  createCreateRackGroupCommand,
  createUpdateRackGroupCommand,
  createDeleteRackGroupCommand,
  createBatchCommand,
  type DeviceTypeCommandStore,
  type DeviceCommandStore,
  type RackCommandStore,
  type RackLifecycleCommandStore,
  type RackGroupCommandStore,
} from "./commands";

// localStorage key for tracking if user has started (created/loaded a rack)
const HAS_STARTED_KEY = "Rackula_has_started";

// Check if user has previously started (created or loaded a rack)
function loadHasStarted(): boolean {
  try {
    return localStorage.getItem(HAS_STARTED_KEY) === "true";
  } catch {
    return false;
  }
}

// Persist the hasStarted flag to localStorage
function saveHasStarted(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(HAS_STARTED_KEY, "true");
    } else {
      localStorage.removeItem(HAS_STARTED_KEY);
    }
  } catch {
    // localStorage not available
  }
}

// Module-level state (using $state rune)
let layout = $state<Layout>(createLayout("Racky McRackface"));
let isDirty = $state(false);
let hasStarted = $state(loadHasStarted());
let activeRackId = $state<string | null>(null);

// Derived values (using $derived rune)
const racks = $derived(layout.racks);
const device_types = $derived(layout.device_types);
const rack_groups = $derived(layout.rack_groups ?? []);

// Active rack: the rack currently being edited (falls back to first rack if not set)
const activeRack = $derived.by(() => {
  if (activeRackId) {
    const found = layout.racks.find((r) => r.id === activeRackId);
    if (found) return found;
  }
  return layout.racks[0] ?? null;
});

// Legacy alias for backward compatibility
const rack = $derived(activeRack);

const hasRack = $derived(
  layout.racks.length > 0 && layout.racks[0]?.devices !== undefined,
);

// rackCount returns actual count when user has started
const rackCount = $derived(hasStarted ? layout.racks.length : 0);
const canAddRack = $derived(layout.racks.length < MAX_RACKS);
// Total devices across all racks (for analytics)
const totalDeviceCount = $derived(
  layout.racks.reduce((sum, r) => sum + r.devices.length, 0),
);

/**
 * Reset the store to initial state (primarily for testing)
 * @param clearStarted - If true, also clears the hasStarted flag (default: true)
 */
export function resetLayoutStore(clearStarted: boolean = true): void {
  layout = createLayout("Racky McRackface");
  isDirty = false;
  activeRackId = null;
  if (clearStarted) {
    hasStarted = false;
    saveHasStarted(false);
  }
}

/**
 * Get access to the layout store
 * @returns Store object with state and actions
 */
export function getLayoutStore() {
  return {
    // State getters
    get layout() {
      return layout;
    },
    get isDirty() {
      return isDirty;
    },
    get rack() {
      return rack;
    },
    get racks() {
      return racks;
    },
    get activeRack() {
      return activeRack;
    },
    get activeRackId() {
      return activeRackId;
    },
    get rack_groups() {
      return rack_groups;
    },
    get device_types() {
      return device_types;
    },
    get hasRack() {
      return hasRack;
    },
    get rackCount() {
      return rackCount;
    },
    get canAddRack() {
      return canAddRack;
    },
    get totalDeviceCount() {
      return totalDeviceCount;
    },
    get hasStarted() {
      return hasStarted;
    },

    // Layout actions
    createNewLayout,
    loadLayout,
    resetLayout: resetLayoutStore,

    // Rack actions
    addRack,
    addBayedRackGroup,
    updateRack,
    updateRackView,
    deleteRack,
    reorderRacks,
    duplicateRack,
    getRackById,
    setActiveRack,

    // Rack group actions
    createRackGroup,
    updateRackGroup,
    deleteRackGroup,
    addRackToGroup,
    removeRackFromGroup,
    addBayToGroup,
    removeBayFromGroup,
    setBayCount,
    getRackGroupById,
    getRackGroupForRack,
    reorderRacksInGroup,

    // Rack group raw actions (for undo/redo)
    createRackGroupRaw,
    updateRackGroupRaw,
    deleteRackGroupRaw,

    // Device actions
    duplicateDevice,

    // Device type actions
    addDeviceType,
    updateDeviceType,
    deleteDeviceType,

    // Placement actions
    placeDevice,
    placeInContainer,
    moveDevice,
    moveDeviceToRack,
    removeDeviceFromRack,
    updateDeviceFace,
    updateDeviceName,
    updateDevicePlacementImage,
    updateDeviceColour,
    updateDeviceSlotPosition,

    // Settings actions
    updateDisplayMode,
    updateShowLabelsOnImages,

    // Dirty tracking
    markDirty,
    markClean,

    // Start tracking (for WelcomeScreen flow)
    markStarted,

    // Raw actions for undo/redo system (bypass dirty tracking)
    addDeviceTypeRaw,
    removeDeviceTypeRaw,
    updateDeviceTypeRaw,
    placeDeviceRaw,
    removeDeviceAtIndexRaw,
    moveDeviceRaw,
    updateDeviceFaceRaw,
    updateDeviceNameRaw,
    updateDevicePlacementImageRaw,
    updateDeviceColourRaw,
    getDeviceAtIndex,
    getPlacedDevicesForType,
    updateRackRaw,
    replaceRackRaw,
    clearRackDevicesRaw,
    restoreRackDevicesRaw,

    // Cable raw actions
    addCableRaw,
    updateCableRaw,
    removeCableRaw,
    removeCablesRaw,

    // Utility
    getUsedDeviceTypeSlugs,
    getUnusedCustomDeviceTypes,
    isCustomDeviceType,
    hasDeviceTypePlacements,

    // Recorded actions (use undo/redo)
    addDeviceTypeRecorded,
    updateDeviceTypeRecorded,
    deleteDeviceTypeRecorded,
    deleteMultipleDeviceTypesRecorded,
    placeDeviceRecorded,
    moveDeviceRecorded,
    removeDeviceRecorded,
    updateDeviceFaceRecorded,
    updateDeviceNameRecorded,
    updateDevicePlacementImageRecorded,
    updateDeviceColourRecorded,
    updateRackRecorded,
    clearRackRecorded,

    // Undo/Redo
    undo,
    redo,
    clearHistory,
    get canUndo() {
      return getHistoryStore().canUndo;
    },
    get canRedo() {
      return getHistoryStore().canRedo;
    },
    get undoDescription() {
      return getHistoryStore().undoDescription;
    },
    get redoDescription() {
      return getHistoryStore().redoDescription;
    },
  };
}

/**
 * Create a new layout with the given name
 * @param name - Layout name
 */
function createNewLayout(name: string): void {
  layout = createLayout(name);
  isDirty = false;
}

/**
 * Load a layout directly
 * Preserves all racks in the layout (multi-rack support)
 * Defensively assigns IDs and positions to support older layouts
 * @param layoutData - Layout to load
 */
function loadLayout(layoutData: Layout): void {
  // Track seen IDs to detect duplicates
  const seenIds = new SvelteSet<string>();

  // Ensure runtime view is set, show_rear defaults, and all racks have valid IDs
  layout = {
    ...layoutData,
    racks: layoutData.racks.map((r, index) => {
      // Generate ID if missing or duplicate
      let rackId = r.id && r.id.trim().length > 0 ? r.id : generateRackId();
      if (seenIds.has(rackId)) {
        rackId = generateRackId();
      }
      seenIds.add(rackId);

      return {
        ...r,
        id: rackId,
        position: Number.isFinite(r.position) ? r.position : index,
        view: r.view ?? "front",
        show_rear: r.show_rear ?? true,
      };
    }),
  };
  isDirty = false;

  // Set active rack to first rack
  activeRackId = layout.racks[0]?.id ?? null;

  // Mark as started (user has loaded a layout)
  hasStarted = true;
  saveHasStarted(true);
}

/**
 * Add a new rack to the layout
 * If this is the first rack, it also sets the layout name
 * Uses undo/redo support via command pattern
 * @param name - Rack name
 * @param height - Rack height in U
 * @param width - Rack width in inches (10 or 19)
 * @param form_factor - Rack form factor
 * @param desc_units - Whether units are numbered top-down
 * @param starting_unit - First U number
 * @returns The created rack object with ID, or null if at max capacity
 */
function addRack(
  name: string,
  height: number,
  width?: number,
  form_factor?: FormFactor,
  desc_units?: boolean,
  starting_unit?: number,
): (Rack & { id: string }) | null {
  // Check if we can add more racks
  if (layout.racks.length >= MAX_RACKS) {
    return null;
  }

  const newRack = createDefaultRack(
    name,
    height,
    (width as 10 | 19) ?? 19,
    form_factor ?? "4-post-cabinet",
    desc_units ?? false,
    starting_unit ?? 1,
    true, // show_rear
    generateRackId(), // id - pass directly
  );

  // If this is the first rack, sync layout name
  const isFirstRack = layout.racks.length === 0;
  if (isFirstRack) {
    layout = { ...layout, name };
  }

  // Use recorded action for undo/redo support
  const history = getHistoryStore();
  const adapter = getRackLifecycleCommandAdapter();
  const command = createAddRackCommand(newRack, adapter);
  history.execute(command);
  isDirty = true;

  // Set as active rack
  activeRackId = newRack.id;

  // Mark as started (user has created a rack)
  hasStarted = true;
  saveHasStarted(true);

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
 * Note: This function does NOT currently use BatchCommand for atomic undo.
 * The issue #576 spec requested BatchCommand, but addRack() also doesn't use
 * undo/redo commands - both use direct state mutation. To delete a bayed group,
 * users would delete the rack group which removes all linked racks.
 * BatchCommand support can be added in a follow-up if undo/redo is needed.
 *
 * @param groupName - Name for the group
 * @param bayCount - Number of bays (2 or 3)
 * @param height - Height for each rack in U
 * @param width - Width for each rack in inches
 * @returns Created group and racks, or null if insufficient capacity
 */
function addBayedRackGroup(
  groupName: string,
  bayCount: 2 | 3,
  height: number,
  width: 10 | 19 | 23 = 19,
): BayedGroupResult | null {
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

  // Update layout state
  const isFirstRack = layout.racks.length === 0;
  layout = {
    ...layout,
    name: isFirstRack ? groupName : layout.name,
    racks: [...layout.racks, ...newRacks],
    rack_groups: [...(layout.rack_groups ?? []), group],
  };
  isDirty = true;

  // Set first bay as active
  activeRackId = newRacks[0]!.id;

  // Mark as started
  hasStarted = true;
  saveHasStarted(true);

  layoutDebug.state(
    "addBayedRackGroup: state updated - activeRackId=%s, isDirty=%s, hasStarted=%s",
    activeRackId,
    isDirty,
    hasStarted,
  );

  return { group, racks: newRacks };
}

/**
 * Update a rack's properties
 * Uses undo/redo support via updateRackRecorded (except for view changes)
 * @param id - Rack ID to update
 * @param updates - Properties to update
 */
function updateRack(id: string, updates: Partial<Rack>): void {
  const rackIndex = layout.racks.findIndex((r) => r.id === id);
  if (rackIndex === -1) return;

  // Check if height change on bayed rack
  if (updates.height !== undefined) {
    const group = getRackGroupForRack(id);
    if (group?.layout_preset === "bayed") {
      layoutDebug.state(
        "updateRack: rejected height change for bayed rack %s",
        id,
      );
      // Silently reject - UI should show toast
      return;
    }
  }

  // Handle view separately (doesn't need undo/redo)
  if (updates.view !== undefined) {
    layout = {
      ...layout,
      racks: layout.racks.map((r, i) =>
        i === rackIndex ? { ...r, view: updates.view } : r,
      ),
    };
    isDirty = true;
  }

  // For other properties, use recorded version for undo/redo support
  const { view: _view, devices: _devices, ...recordableUpdates } = updates;
  if (Object.keys(recordableUpdates).length > 0) {
    updateRackRecorded(id, recordableUpdates);
  }
}

/**
 * Update a rack's view (front/rear)
 * @param id - Rack ID
 * @param view - New view
 */
function updateRackView(id: string, view: RackView): void {
  updateRack(id, { view });
}

/**
 * Delete a rack from the layout
 * Also removes the rack from any groups it belongs to
 * Uses undo/redo support via command pattern
 * @param id - Rack ID to delete
 */
function deleteRack(id: string): void {
  const rack = layout.racks.find((r) => r.id === id);
  if (!rack) return;

  // Find groups that contain this rack (for undo restoration)
  const affectedGroups = (layout.rack_groups ?? [])
    .filter((g) => g.rack_ids.includes(id))
    .map((g) => JSON.parse(JSON.stringify(g)) as RackGroup);

  // Use recorded action for undo/redo support
  const history = getHistoryStore();
  const adapter = getRackLifecycleCommandAdapter();
  const command = createDeleteRackCommand(rack, affectedGroups, adapter);
  history.execute(command);
  isDirty = true;
}

// =============================================================================
// Rack Group Functions
// =============================================================================

/**
 * Validate that all racks in a group have the same height (for bayed preset)
 * @param rackIds - Array of rack IDs to validate
 * @returns Error message if validation fails, undefined if valid
 */
function validateBayedGroupHeights(rackIds: string[]): string | undefined {
  if (rackIds.length <= 1) return undefined;

  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Plain Set is intentional: utility function, not reactive state
  const heights = new Set<number>();
  for (const rackId of rackIds) {
    const rack = layout.racks.find((r) => r.id === rackId);
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

/**
 * Create a new rack group
 * @param name - Group name
 * @param rackIds - Array of rack IDs to include in the group
 * @param preset - Layout preset (defaults to "row")
 * @returns The created group or error
 */
function createRackGroup(
  name: string,
  rackIds: string[],
  preset?: LayoutPreset,
): { group?: RackGroup; error?: string } {
  // Validate at least one rack
  if (rackIds.length === 0) {
    return { error: "Group must contain at least one rack" };
  }

  // Validate all rack IDs exist
  for (const rackId of rackIds) {
    if (!layout.racks.find((r) => r.id === rackId)) {
      return { error: `Rack "${rackId}" not found` };
    }
  }

  // Validate no rack is already in another group
  for (const rackId of rackIds) {
    const existingGroup = getRackGroupForRack(rackId);
    if (existingGroup) {
      const rackName =
        layout.racks.find((r) => r.id === rackId)?.name ?? rackId;
      return {
        error: `Rack "${rackName}" is already in group "${existingGroup.name ?? existingGroup.id}". Remove it first.`,
      };
    }
  }

  // Validate bayed preset height requirement
  const actualPreset = preset ?? "row";
  if (actualPreset === "bayed") {
    const heightError = validateBayedGroupHeights(rackIds);
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
  const adapter = getRackGroupCommandAdapter();
  const command = createCreateRackGroupCommand(group, adapter);
  history.execute(command);
  isDirty = true;

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
 * @param id - Group ID
 * @param updates - Properties to update
 * @returns Error if validation fails
 */
function updateRackGroup(
  id: string,
  updates: Partial<RackGroup>,
): { error?: string } {
  const group = getRackGroupById(id);
  if (!group) {
    return { error: "Group not found" };
  }

  // Validate all rack IDs in updates exist
  if (updates.rack_ids) {
    for (const rackId of updates.rack_ids) {
      if (!layout.racks.find((r) => r.id === rackId)) {
        return { error: `Rack "${rackId}" not found` };
      }
    }
  }

  // Validate bayed preset height requirement
  // Check when: (1) switching to bayed, or (2) updating rack_ids on existing bayed group
  const effectivePreset = updates.layout_preset ?? group.layout_preset;
  const effectiveRackIds = updates.rack_ids ?? group.rack_ids;
  if (
    effectivePreset === "bayed" &&
    (updates.layout_preset === "bayed" || updates.rack_ids)
  ) {
    const heightError = validateBayedGroupHeights(effectiveRackIds);
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
  const adapter = getRackGroupCommandAdapter();
  const command = createUpdateRackGroupCommand(id, before, updates, adapter);
  history.execute(command);
  isDirty = true;

  layoutDebug.group("updated group %s: %o", id, updates);

  return {};
}

/**
 * Delete a rack group
 * @param id - Group ID to delete
 */
function deleteRackGroup(id: string): void {
  const group = getRackGroupById(id);
  if (!group) return;

  // Use recorded action for undo/redo support
  const history = getHistoryStore();
  const adapter = getRackGroupCommandAdapter();
  const command = createDeleteRackGroupCommand(group, adapter);
  history.execute(command);
  isDirty = true;

  layoutDebug.group("deleted group %s", id);
}

/**
 * Add a rack to an existing group
 * @param groupId - Group ID
 * @param rackId - Rack ID to add
 * @returns Error if validation fails
 */
function addRackToGroup(groupId: string, rackId: string): { error?: string } {
  const group = getRackGroupById(groupId);
  if (!group) {
    return { error: "Group not found" };
  }

  // Check rack exists
  const rack = layout.racks.find((r) => r.id === rackId);
  if (!rack) {
    return { error: `Rack "${rackId}" not found` };
  }

  // Check rack not already in group
  if (group.rack_ids.includes(rackId)) {
    return { error: "Rack is already in this group" };
  }

  // Check rack not in ANY other group
  const existingGroup = getRackGroupForRack(rackId);
  if (existingGroup && existingGroup.id !== groupId) {
    const rackName = rack.name ?? rackId;
    return {
      error: `Rack "${rackName}" is already in group "${existingGroup.name ?? existingGroup.id}". Remove it first.`,
    };
  }

  // Validate bayed preset height requirement
  if (group.layout_preset === "bayed") {
    const existingRack = layout.racks.find((r) => r.id === group.rack_ids[0]);
    if (existingRack && rack.height !== existingRack.height) {
      return {
        error: `Cannot add ${rack.height}U rack to bayed group with ${existingRack.height}U racks`,
      };
    }
  }

  // Update via updateRackGroup for undo/redo support
  const newRackIds = [...group.rack_ids, rackId];
  return updateRackGroup(groupId, { rack_ids: newRackIds });
}

/**
 * Remove a rack from a group
 * @param groupId - Group ID
 * @param rackId - Rack ID to remove
 */
function removeRackFromGroup(groupId: string, rackId: string): void {
  const group = getRackGroupById(groupId);
  if (!group) return;

  const newRackIds = group.rack_ids.filter((id) => id !== rackId);

  // If this was the last rack, delete the group
  if (newRackIds.length === 0) {
    deleteRackGroup(groupId);
  } else {
    updateRackGroup(groupId, { rack_ids: newRackIds });
  }
}

/**
 * Add a new empty bay to a bayed rack group
 * Creates a new rack with matching height and adds to group
 * @param groupId - Group ID
 * @returns The new rack ID or error
 */
function addBayToGroup(groupId: string): { rackId?: string; error?: string } {
  const group = getRackGroupById(groupId);
  if (!group) {
    return { error: "Group not found" };
  }

  if (group.layout_preset !== "bayed") {
    return { error: "Can only add bays to bayed rack groups" };
  }

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
  // Validate width - bayed racks should only use standard widths (10/19/23), default to 19
  const validWidths = [10, 19, 23];
  const width = (
    validWidths.includes(existingRack.width) ? existingRack.width : 19
  ) as 10 | 19 | 23;
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

  // Add rack to layout (immutable update for Svelte reactivity)
  layout = { ...layout, racks: [...layout.racks, newRack] };

  // Add to group
  const result = addRackToGroup(groupId, newRackId);
  if (result.error) {
    // Rollback rack creation
    layout = {
      ...layout,
      racks: layout.racks.filter((r) => r.id !== newRackId),
    };
    return { error: result.error };
  }

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
 * @param groupId - Group ID
 * @returns Error if bay has devices or group would have < 2 bays
 */
function removeBayFromGroup(groupId: string): { error?: string } {
  const group = getRackGroupById(groupId);
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
  const lastRack = layout.racks.find((r) => r.id === lastRackId);

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
  deleteRack(lastRackId);

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
 * Performs full upfront validation to catch all errors before making changes,
 * then applies mutations sequentially via addBayToGroup and removeBayFromGroup.
 * Note: This is not a true atomic operation - if an unexpected error occurs
 * mid-loop, partial state changes may persist. Consider implementing a
 * batch-apply approach if true atomicity is required.
 *
 * @param groupId - Group ID
 * @param targetCount - Desired bay count (must be >= 2)
 * @returns Error if validation fails
 */
function setBayCount(groupId: string, targetCount: number): { error?: string } {
  const group = getRackGroupById(groupId);
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

  // Validate upfront before making any changes
  if (targetCount > currentCount) {
    // Adding bays - check capacity
    const baysToAdd = targetCount - currentCount;
    if (layout.racks.length + baysToAdd > MAX_RACKS) {
      return { error: "Maximum rack limit would be exceeded" };
    }
  } else {
    // Removing bays - check for devices in bays to be removed
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

  // All validation passed - now apply changes
  if (targetCount > currentCount) {
    // Add bays
    for (let i = currentCount; i < targetCount; i++) {
      const result = addBayToGroup(groupId);
      if (result.error) {
        // This shouldn't happen due to upfront validation, but handle it
        return { error: result.error };
      }
    }
  } else {
    // Remove bays
    for (let i = currentCount; i > targetCount; i--) {
      const result = removeBayFromGroup(groupId);
      if (result.error) {
        // This shouldn't happen due to upfront validation, but handle it
        return { error: result.error };
      }
    }
  }

  return {};
}

/**
 * Get a rack group by ID
 * @param id - Group ID
 * @returns The group or undefined
 */
function getRackGroupById(id: string): RackGroup | undefined {
  return rack_groups.find((g) => g.id === id);
}

/**
 * Get the rack group that contains a specific rack
 * @param rackId - Rack ID
 * @returns The group or undefined
 */
function getRackGroupForRack(rackId: string): RackGroup | undefined {
  return rack_groups.find((g) => g.rack_ids.includes(rackId));
}

/**
 * Reorder racks within a group by providing a new order of rack IDs.
 * This changes the bay numbering for bayed view rendering.
 * Uses undo/redo system for reverting the operation.
 *
 * @param groupId - Group ID to reorder
 * @param newOrder - New order of rack IDs (must contain same racks, just reordered)
 * @returns Error if validation fails
 */
function reorderRacksInGroup(
  groupId: string,
  newOrder: string[],
): { error?: string } {
  const group = getRackGroupById(groupId);
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
  return updateRackGroup(groupId, { rack_ids: newOrder });
}

// Rack Group Raw Actions (for undo/redo system)

/**
 * Raw create rack group (bypasses history)
 * @param group - Group to create
 */
function createRackGroupRaw(group: RackGroup): void {
  const newGroups = [...(layout.rack_groups ?? []), group];
  layout = {
    ...layout,
    rack_groups: newGroups,
  };
}

/**
 * Raw update rack group (bypasses history)
 * @param id - Group ID
 * @param updates - Properties to update
 */
function updateRackGroupRaw(id: string, updates: Partial<RackGroup>): void {
  const newGroups = (layout.rack_groups ?? []).map((g) =>
    g.id === id ? { ...g, ...updates } : g,
  );
  layout = {
    ...layout,
    rack_groups: newGroups,
  };
}

/**
 * Raw delete rack group (bypasses history)
 * @param id - Group ID
 * @returns The deleted group or undefined
 */
function deleteRackGroupRaw(id: string): RackGroup | undefined {
  const group = getRackGroupById(id);
  if (!group) return undefined;

  const newGroups = (layout.rack_groups ?? []).filter((g) => g.id !== id);
  layout = {
    ...layout,
    rack_groups: newGroups.length > 0 ? newGroups : undefined,
  };
  return group;
}

/**
 * Get the command adapter for rack group operations
 */
function getRackGroupCommandAdapter(): RackGroupCommandStore {
  return {
    createRackGroupRaw,
    updateRackGroupRaw,
    deleteRackGroupRaw,
  };
}

// =============================================================================
// Rack Raw Actions (for undo/redo system)
// =============================================================================

/**
 * Raw add rack (bypasses history)
 * @param rack - Rack to add
 */
function addRackRaw(rack: Rack): void {
  layout = {
    ...layout,
    racks: [...layout.racks, rack],
  };
}

/**
 * Raw delete rack (bypasses history)
 * Removes the rack and cleans up group memberships
 * @param id - Rack ID to delete
 * @returns The deleted rack and affected groups (with original rack_ids), or undefined if not found
 */
function deleteRackRaw(
  id: string,
): { rack: Rack; groups: RackGroup[] } | undefined {
  const rack = layout.racks.find((r) => r.id === id);
  if (!rack) return undefined;

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

  layout = {
    ...layout,
    racks: newRacks,
    rack_groups: newGroups.length > 0 ? newGroups : undefined,
  };

  // Update activeRackId if we deleted the active rack
  if (activeRackId === id) {
    activeRackId = newRacks[0]?.id ?? null;
  }

  return { rack, groups: affectedGroups };
}

/**
 * Raw restore rack with group memberships (bypasses history)
 * Used by undo to restore a deleted rack
 * @param rack - Rack to restore
 * @param groups - Groups to restore (with original rack_ids including this rack)
 */
function restoreRackRaw(rack: Rack, groups: RackGroup[]): void {
  // Add the rack back
  layout = {
    ...layout,
    racks: [...layout.racks, rack],
  };

  // Restore group memberships
  for (const restoredGroup of groups) {
    const existingGroup = (layout.rack_groups ?? []).find(
      (g) => g.id === restoredGroup.id,
    );
    if (existingGroup) {
      // Group still exists, restore the rack_ids
      layout = {
        ...layout,
        rack_groups: (layout.rack_groups ?? []).map((g) =>
          g.id === restoredGroup.id
            ? { ...g, rack_ids: restoredGroup.rack_ids }
            : g,
        ),
      };
    } else {
      // Group was deleted (was empty), recreate it
      layout = {
        ...layout,
        rack_groups: [...(layout.rack_groups ?? []), restoredGroup],
      };
    }
  }
}

/**
 * Get the command adapter for rack lifecycle operations
 */
function getRackLifecycleCommandAdapter(): RackLifecycleCommandStore {
  return {
    addRackRaw,
    deleteRackRaw,
    restoreRackRaw,
  };
}

/**
 * Reorder racks by moving from one index to another
 * Updates position field to match new array indices
 * @param fromIndex - Source index
 * @param toIndex - Target index
 */
function reorderRacks(fromIndex: number, toIndex: number): void {
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
  layout = {
    ...layout,
    racks: newRacks.map((r, index) => ({ ...r, position: index })),
  };
  isDirty = true;
}

/**
 * Duplicate a rack with all its devices
 * Handles container_id references by remapping to new device IDs
 * @param id - Rack ID to duplicate
 * @returns The duplicated rack or error message
 */
function duplicateRack(id: string): {
  error?: string;
  rack?: Rack & { id: string };
} {
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

  const duplicatedRack = {
    ...sourceRack,
    id: newRackId,
    name: `${sourceRack.name} (Copy)`,
    position: layout.racks.length, // Set position to append index
    devices: sourceRack.devices.map((d) => {
      const newId = idMap.get(d.id)!;
      // Remap container_id if present
      const newContainerId = d.container_id
        ? idMap.get(d.container_id)
        : undefined;
      return {
        ...d,
        id: newId,
        container_id: newContainerId,
      };
    }),
  };

  layout = {
    ...layout,
    racks: [...layout.racks, duplicatedRack],
  };
  isDirty = true;

  // Set as active rack
  activeRackId = newRackId;

  return { rack: duplicatedRack };
}

/**
 * Duplicate a placed device within a rack
 * Places the duplicate in the next available slot on the same face
 * Inherits all properties (custom label, image overrides, colour)
 * Uses undo/redo system for reverting the operation
 * @param rackId - Rack ID containing the device
 * @param deviceIndex - Index of the device in rack's devices array
 * @returns The duplicated device or error message
 */
function duplicateDevice(
  rackId: string,
  deviceIndex: number,
): { error?: string; device?: PlacedDevice } {
  const sourceRack = layout.racks.find((r) => r.id === rackId);
  if (!sourceRack) {
    return { error: "Rack not found" };
  }

  if (deviceIndex < 0 || deviceIndex >= sourceRack.devices.length) {
    return { error: "Device not found" };
  }

  const sourceDevice = sourceRack.devices[deviceIndex]!;
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    sourceDevice.device_type,
  );
  if (!deviceType) {
    return { error: "Device type not found" };
  }

  // Find valid positions on the same face
  const validPositions = findValidDropPositions(
    sourceRack,
    layout.device_types,
    deviceType.u_height,
    sourceDevice.face,
    sourceDevice.slot_position,
  );

  if (validPositions.length === 0) {
    return { error: "Cannot duplicate: no available space in rack" };
  }

  // Prefer adjacent slot (above or below the source device)
  // Device positions and heights are in internal units
  const heightInternal = toInternalUnits(deviceType.u_height);
  const adjacentAbove = sourceDevice.position + heightInternal;
  const adjacentBelow = sourceDevice.position - heightInternal;

  let targetPosition: number;

  // Check if adjacent above is valid
  if (validPositions.includes(adjacentAbove)) {
    targetPosition = adjacentAbove;
  } else if (
    adjacentBelow >= UNITS_PER_U &&
    validPositions.includes(adjacentBelow)
  ) {
    // Check if adjacent below is valid (and within rack bounds - U1 = UNITS_PER_U)
    targetPosition = adjacentBelow;
  } else {
    // Fall back to first available position
    targetPosition = validPositions[0]!;
  }

  // Create the duplicate device with new ID but inherited properties
  const duplicatedDevice: PlacedDevice = {
    ...sourceDevice,
    id: generateId(),
    position: targetPosition,
    // Regenerate ports with new IDs
    ports: instantiatePorts(deviceType),
    // Don't copy container_id - duplicates are independent rack-level devices
    container_id: undefined,
    slot_id: undefined,
  };

  // Set active rack so Raw functions target the correct rack
  activeRackId = rackId;

  // Use the undo/redo system via placeDeviceRaw and history
  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();
  const deviceName = deviceType.model ?? deviceType.slug;

  const command = createPlaceDeviceCommand(
    duplicatedDevice,
    adapter,
    `${deviceName} (Copy)`,
  );
  history.execute(command);
  isDirty = true;

  return { device: duplicatedDevice };
}

/**
 * Get a rack by its ID
 * @param id - Rack ID to find
 * @returns The rack or undefined if not found
 */
function getRackById(id: string): Rack | undefined {
  return layout.racks.find((r) => r.id === id);
}

/**
 * Set the active rack for editing
 * @param id - Rack ID to make active (null to clear)
 */
function setActiveRack(id: string | null): void {
  if (id === null) {
    activeRackId = null;
    return;
  }

  // Verify the rack exists
  const rack = layout.racks.find((r) => r.id === id);
  if (rack) {
    activeRackId = id;
  }
}

/**
 * Add a device type to the library
 * Uses undo/redo support via addDeviceTypeRecorded
 * @param data - Device type data
 * @returns The created device type
 */
function addDeviceType(data: CreateDeviceTypeInput): DeviceType {
  // Delegate to recorded version for undo/redo support
  return addDeviceTypeRecorded(data);
}

/**
 * Update a device type in the library
 * Uses undo/redo support via updateDeviceTypeRecorded
 * @param slug - Device type slug
 * @param updates - Properties to update
 */
function updateDeviceType(slug: string, updates: Partial<DeviceType>): void {
  // Delegate to recorded version for undo/redo support
  updateDeviceTypeRecorded(slug, updates);
}

/**
 * Delete a device type from the library
 * Also removes all placed devices referencing it
 * Uses undo/redo support via deleteDeviceTypeRecorded
 * @param slug - Device type slug
 */
function deleteDeviceType(slug: string): void {
  // Delegate to recorded version for undo/redo support
  deleteDeviceTypeRecorded(slug);
}

/**
 * Place a device from the library into a rack
 * Uses undo/redo support via placeDeviceRecorded
 * Face defaults based on device depth: full-depth -> 'both', half-depth -> 'front'
 * @param rackId - Target rack ID
 * @param deviceTypeSlug - Device type slug
 * @param position - U position (bottom of device)
 * @param face - Optional face assignment (auto-determined from depth if not specified)
 * @param slotPosition - Optional slot position for half-width devices ('left', 'right', or 'full')
 * @returns true if placed successfully, false otherwise
 */
function placeDevice(
  rackId: string,
  deviceTypeSlug: string,
  position: number,
  face?: DeviceFace,
  slotPosition?: SlotPosition,
): boolean {
  // Delegate to recorded version for undo/redo support
  // Face is determined by placeDeviceRecorded based on device depth if not specified
  return placeDeviceRecorded(
    rackId,
    deviceTypeSlug,
    position,
    face,
    slotPosition,
  );
}

/**
 * Place a device inside a container slot
 * Uses undo/redo support via command pattern
 * @param rackId - Target rack ID
 * @param deviceTypeSlug - Device type slug of child device
 * @param containerId - ID of parent container PlacedDevice
 * @param slotId - Slot ID within the container
 * @param position - Position within container (0-indexed from bottom)
 * @returns true if placed successfully, false if invalid
 */
function placeInContainer(
  rackId: string,
  deviceTypeSlug: string,
  containerId: string,
  slotId: string,
  position: number,
): boolean {
  // Validate rack exists
  const targetRack = getRackById(rackId);
  if (!targetRack) return false;

  // Set active rack so Raw functions target the correct rack
  activeRackId = rackId;

  // Find container device
  const container = targetRack.devices.find((d) => d.id === containerId);
  if (!container) return false;

  // Find device types
  const containerType = layout.device_types.find(
    (d) => d.slug === container.device_type,
  );
  const childType = findDeviceType(deviceTypeSlug, layout.device_types);

  // Auto-import if found in starter/brand but not yet in layout
  if (
    childType &&
    !layout.device_types.find((dt) => dt.slug === deviceTypeSlug)
  ) {
    layout.device_types = [...layout.device_types, childType];
  }

  if (!containerType || !childType) return false;

  // Check collision within container
  if (
    !canPlaceInContainer(
      targetRack,
      layout.device_types,
      container,
      containerType,
      childType,
      slotId,
      position,
    )
  ) {
    return false;
  }

  // Create placed device with container reference
  const placedDevice: PlacedDevice = {
    id: crypto.randomUUID(),
    device_type: deviceTypeSlug,
    position, // 0-indexed within container
    face: container.face, // Inherit parent face
    container_id: containerId,
    slot_id: slotId,
    ports: instantiatePorts(childType),
  };

  // Use command for undo/redo
  const deviceName = childType.model ?? childType.slug;
  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();
  const command = createPlaceDeviceCommand(placedDevice, adapter, deviceName);
  history.execute(command);
  isDirty = true;

  return true;
}

/**
 * Move a device within a rack
 * Uses undo/redo support via moveDeviceRecorded
 * @param rackId - Rack ID
 * @param deviceIndex - Index of device in rack's devices array
 * @param newPosition - New U position
 * @returns true if moved successfully, false otherwise
 */
function moveDevice(
  rackId: string,
  deviceIndex: number,
  newPosition: number,
): boolean {
  // Delegate to recorded version for undo/redo support
  return moveDeviceRecorded(rackId, deviceIndex, newPosition);
}

/**
 * Move a device from one rack to another
 * Currently only supports within-rack moves (cross-rack is blocked)
 */
function moveDeviceToRack(
  fromRackId: string,
  deviceIndex: number,
  toRackId: string,
  newPosition: number,
): boolean {
  // Cross-rack moves not yet implemented
  if (fromRackId !== toRackId) {
    debug.log("Cross-rack move not yet implemented");
    return false;
  }
  return moveDevice(fromRackId, deviceIndex, newPosition);
}

/**
 * Remove a device from a rack
 * Uses undo/redo support via removeDeviceRecorded
 * @param rackId - Rack ID
 * @param deviceIndex - Index of device in rack's devices array
 */
function removeDeviceFromRack(rackId: string, deviceIndex: number): void {
  // Delegate to recorded version for undo/redo support
  removeDeviceRecorded(rackId, deviceIndex);
}

/**
 * Update a device's face property
 * Uses undo/redo support via updateDeviceFaceRecorded
 * @param rackId - Rack ID
 * @param deviceIndex - Index of device in rack's devices array
 * @param face - New face value
 */
function updateDeviceFace(
  rackId: string,
  deviceIndex: number,
  face: DeviceFace,
): void {
  // Delegate to recorded version for undo/redo support
  updateDeviceFaceRecorded(rackId, deviceIndex, face);
}

/**
 * Update a device's custom display name
 * Uses undo/redo support via updateDeviceNameRecorded
 * @param rackId - Rack ID
 * @param deviceIndex - Index of device in rack's devices array
 * @param name - New custom name (undefined or empty to clear)
 */
function updateDeviceName(
  rackId: string,
  deviceIndex: number,
  name: string | undefined,
): void {
  // Delegate to recorded version for undo/redo support
  updateDeviceNameRecorded(rackId, deviceIndex, name);
}

/**
 * Update a device's placement image filename
 * Uses undo/redo support via updateDevicePlacementImageRecorded
 * @param rackId - Rack ID
 * @param deviceIndex - Index of device in rack's devices array
 * @param face - Which face to update ('front' or 'rear')
 * @param filename - Image filename (undefined to clear)
 */
function updateDevicePlacementImage(
  rackId: string,
  deviceIndex: number,
  face: "front" | "rear",
  filename: string | undefined,
): void {
  // Delegate to recorded version for undo/redo support
  updateDevicePlacementImageRecorded(rackId, deviceIndex, face, filename);
}

/**
 * Update a device's colour override
 * Uses undo/redo support via updateDeviceColourRecorded
 * @param rackId - Rack ID
 * @param deviceIndex - Index of device in rack's devices array
 * @param colour - Hex colour string (undefined to clear and use device type colour)
 */
function updateDeviceColour(
  rackId: string,
  deviceIndex: number,
  colour: string | undefined,
): void {
  // Delegate to recorded version for undo/redo support
  updateDeviceColourRecorded(rackId, deviceIndex, colour);
}

/**
 * Update a device's slot position (for half-width devices)
 * Uses undo/redo support via updateDeviceSlotPositionRecorded
 * @param rackId - Rack ID
 * @param deviceIndex - Index of device in rack's devices array
 * @param slotPosition - New slot position ('left' or 'right')
 * @returns true if successful, false if blocked by another device
 */
function updateDeviceSlotPosition(
  rackId: string,
  deviceIndex: number,
  slotPosition: SlotPosition,
): boolean {
  // Delegate to recorded version for undo/redo support
  return updateDeviceSlotPositionRecorded(rackId, deviceIndex, slotPosition);
}

/**
 * Mark the layout as having unsaved changes
 */
function markDirty(): void {
  isDirty = true;
}

/**
 * Mark the layout as saved (no unsaved changes)
 */
function markClean(): void {
  isDirty = false;
}

/**
 * Mark that the user has started (created or loaded a rack)
 * This hides the WelcomeScreen and persists to localStorage
 */
function markStarted(): void {
  hasStarted = true;
  saveHasStarted(true);
}

/**
 * Update the display mode in layout settings
 * @param mode - Display mode to set ('label', 'image', or 'image-label')
 */
function updateDisplayMode(mode: DisplayMode): void {
  layout = {
    ...layout,
    settings: { ...layout.settings, display_mode: mode },
  };
  isDirty = true;
}

/**
 * Update the showLabelsOnImages setting
 * @param value - Boolean value to set
 */
function updateShowLabelsOnImages(value: boolean): void {
  layout = {
    ...layout,
    settings: { ...layout.settings, show_labels_on_images: value },
  };
  isDirty = true;
}

// =============================================================================
// Rack Helper Functions
// =============================================================================

/**
 * Get the index of a rack by ID
 * @param rackId - Rack ID to find
 * @returns Index in layout.racks or -1 if not found
 */
function getRackIndex(rackId: string): number {
  return layout.racks.findIndex((r) => r.id === rackId);
}

/**
 * Get the rack to operate on (by ID or active rack)
 * @param rackId - Optional rack ID (uses active rack if not provided)
 * @returns Rack and its index, or undefined if not found
 */
function getTargetRack(
  rackId?: string,
): { rack: Rack; index: number } | undefined {
  if (rackId) {
    const index = getRackIndex(rackId);
    if (index !== -1) {
      return { rack: layout.racks[index], index };
    }
    return undefined;
  }

  // Use active rack
  if (activeRackId) {
    const index = getRackIndex(activeRackId);
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

/**
 * Update a rack at a specific index
 * @param index - Rack index
 * @param updater - Function to update the rack
 */
function updateRackAtIndex(index: number, updater: (rack: Rack) => Rack): void {
  layout = {
    ...layout,
    racks: layout.racks.map((r, i) => (i === index ? updater(r) : r)),
  };
}

// =============================================================================
// Raw Actions for Undo/Redo System
// These bypass dirty tracking and validation - used by the command pattern
// Operations use the active rack unless a rackId is specified
// =============================================================================

/**
 * Add a device type directly (raw)
 * @param deviceType - Device type to add
 */
function addDeviceTypeRaw(deviceType: DeviceType): void {
  layout = {
    ...layout,
    device_types: [...layout.device_types, deviceType],
  };
}

/**
 * Remove a device type directly (raw)
 * Also removes any placed devices of this type from ALL racks
 * @param slug - Device type slug to remove
 */
function removeDeviceTypeRaw(slug: string): void {
  layout = {
    ...layout,
    device_types: layout.device_types.filter((dt) => dt.slug !== slug),
    racks: layout.racks.map((rack) => ({
      ...rack,
      devices: rack.devices.filter((d) => d.device_type !== slug),
    })),
  };

  // Clean up associated images to prevent memory leaks
  getImageStore().removeAllDeviceImages(slug);
}

/**
 * Update a device type directly (raw)
 * @param slug - Device type slug to update
 * @param updates - Properties to update
 */
function updateDeviceTypeRaw(slug: string, updates: Partial<DeviceType>): void {
  layout = {
    ...layout,
    device_types: layout.device_types.map((dt) =>
      dt.slug === slug ? { ...dt, ...updates } : dt,
    ),
  };
}

/**
 * Place a device directly (raw) - no validation
 * Uses active rack
 * @param device - Device to place
 * @returns Index where device was placed, or -1 if no rack available
 */
function placeDeviceRaw(device: PlacedDevice): number {
  const target = getTargetRack();
  if (!target) return -1;

  const newDevices = [...target.rack.devices, device];
  updateRackAtIndex(target.index, (rack) => ({
    ...rack,
    devices: newDevices,
  }));
  return newDevices.length - 1;
}

/**
 * Remove a device at index directly (raw)
 * Uses active rack
 * @param index - Device index to remove
 * @returns The removed device or undefined
 */
function removeDeviceAtIndexRaw(index: number): PlacedDevice | undefined {
  const target = getTargetRack();
  if (!target) return undefined;
  if (index < 0 || index >= target.rack.devices.length) return undefined;

  const removed = target.rack.devices[index];

  // Clean up placement-specific images for this device
  if (removed) {
    const imageStore = getImageStore();
    imageStore.removeAllDeviceImages(`placement-${removed.id}`);
  }

  updateRackAtIndex(target.index, (rack) => ({
    ...rack,
    devices: rack.devices.filter((_, i) => i !== index),
  }));
  return removed;
}

/**
 * Move a device directly (raw) - no collision checking
 * Uses active rack
 * @param index - Device index
 * @param newPosition - New position
 * @returns true if moved
 */
function moveDeviceRaw(index: number, newPosition: number): boolean {
  const target = getTargetRack();
  if (!target) return false;
  if (index < 0 || index >= target.rack.devices.length) return false;

  updateRackAtIndex(target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) =>
      i === index ? { ...d, position: newPosition } : d,
    ),
  }));
  return true;
}

/**
 * Update a device's face directly (raw)
 * Uses active rack
 * @param index - Device index
 * @param face - New face value
 */
function updateDeviceFaceRaw(index: number, face: DeviceFace): void {
  const target = getTargetRack();
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  updateRackAtIndex(target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) => (i === index ? { ...d, face } : d)),
  }));
}

/**
 * Update a device's custom display name directly (raw)
 * Uses active rack
 * @param index - Device index
 * @param name - New custom name (undefined to clear)
 */
function updateDeviceNameRaw(index: number, name: string | undefined): void {
  const target = getTargetRack();
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  // Normalize empty string to undefined
  const normalizedName = name?.trim() || undefined;

  updateRackAtIndex(target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) =>
      i === index ? { ...d, name: normalizedName } : d,
    ),
  }));
}

/**
 * Update a device's placement image directly (raw)
 * @param rackId - Rack ID (for multi-rack support)
 * @param index - Device index
 * @param face - Which face to update ('front' or 'rear')
 * @param filename - Image filename (undefined to clear)
 */
function updateDevicePlacementImageRaw(
  rackId: string,
  index: number,
  face: "front" | "rear",
  filename: string | undefined,
): void {
  const target = getTargetRack(rackId);
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  // Sanitize filename to prevent path traversal attacks
  const sanitizedFilename = filename ? sanitizeFilename(filename) : undefined;

  // Update the appropriate field based on face
  const fieldName = face === "front" ? "front_image" : "rear_image";

  updateRackAtIndex(target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) =>
      i === index ? { ...d, [fieldName]: sanitizedFilename } : d,
    ),
  }));
}

/**
 * Update a device's colour override directly (raw)
 * @param rackId - Rack ID (for multi-rack support)
 * @param index - Device index
 * @param colour - Hex colour string (undefined to clear and use device type colour)
 */
function updateDeviceColourRaw(
  rackId: string,
  index: number,
  colour: string | undefined,
): void {
  const target = getTargetRack(rackId);
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  updateRackAtIndex(target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) =>
      i === index ? { ...d, colour_override: colour } : d,
    ),
  }));
}

/**
 * Update a device's slot position directly (raw)
 * @param rackId - Rack ID (for multi-rack support)
 * @param index - Device index
 * @param slotPosition - New slot position ('left', 'right', or 'full')
 */
function updateDeviceSlotPositionRaw(
  rackId: string,
  index: number,
  slotPosition: SlotPosition,
): void {
  const target = getTargetRack(rackId);
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  updateRackAtIndex(target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) =>
      i === index ? { ...d, slot_position: slotPosition } : d,
    ),
  }));
}

/**
 * Get a device at a specific index from the active rack
 * @param index - Device index
 * @returns The device or undefined
 */
function getDeviceAtIndex(index: number): PlacedDevice | undefined {
  const target = getTargetRack();
  if (!target) return undefined;
  return target.rack.devices[index];
}

/**
 * Get all placed devices for a device type across all racks
 * @param slug - Device type slug
 * @returns Array of placed devices
 */
function getPlacedDevicesForType(slug: string): PlacedDevice[] {
  // Collect from all racks for proper deletion handling
  return layout.racks.flatMap((rack) =>
    rack.devices.filter((d) => d.device_type === slug),
  );
}

/**
 * Update rack settings directly (raw)
 * Uses active rack
 * @param updates - Settings to update
 */
function updateRackRaw(updates: Partial<Omit<Rack, "devices" | "view">>): void {
  const target = getTargetRack();
  if (!target) return;

  updateRackAtIndex(target.index, (rack) => ({ ...rack, ...updates }));

  // Sync layout name with first rack name
  if (updates.name !== undefined && target.index === 0) {
    layout = { ...layout, name: updates.name };
  }
}

/**
 * Replace the entire rack directly (raw)
 * Uses active rack
 * @param newRack - New rack data
 */
function replaceRackRaw(newRack: Rack): void {
  const target = getTargetRack();
  if (!target) return;

  updateRackAtIndex(target.index, () => newRack);

  // Sync layout name with first rack name
  if (target.index === 0) {
    layout = { ...layout, name: newRack.name };
  }
}

/**
 * Clear all devices from the active rack directly (raw)
 * @returns The removed devices
 */
function clearRackDevicesRaw(): PlacedDevice[] {
  const target = getTargetRack();
  if (!target) return [];

  const removed = [...target.rack.devices];
  updateRackAtIndex(target.index, (rack) => ({ ...rack, devices: [] }));
  return removed;
}

/**
 * Restore devices to the active rack directly (raw)
 * @param devices - Devices to restore
 */
function restoreRackDevicesRaw(devices: PlacedDevice[]): void {
  const target = getTargetRack();
  if (!target) return;

  updateRackAtIndex(target.index, (rack) => ({
    ...rack,
    devices: [...devices],
  }));
}

// =============================================================================
// Cable Raw Actions
// These perform immutable updates to layout.cables without dirty tracking
// =============================================================================

/**
 * Add a cable directly (raw)
 * @param cable - Cable to add
 */
function addCableRaw(cable: Cable): void {
  layout = {
    ...layout,
    cables: [...(layout.cables ?? []), cable],
  };
}

/**
 * Update a cable directly (raw)
 * @param id - Cable ID to update
 * @param updates - Properties to update
 */
function updateCableRaw(id: string, updates: Partial<Omit<Cable, "id">>): void {
  layout = {
    ...layout,
    cables: (layout.cables ?? []).map((c) =>
      c.id === id ? { ...c, ...updates } : c,
    ),
  };
}

/**
 * Remove a cable directly (raw)
 * @param id - Cable ID to remove
 */
function removeCableRaw(id: string): void {
  layout = {
    ...layout,
    cables: (layout.cables ?? []).filter((c) => c.id !== id),
  };
}

/**
 * Remove multiple cables directly (raw)
 * @param ids - Set of cable IDs to remove
 */
function removeCablesRaw(ids: Set<string>): void {
  layout = {
    ...layout,
    cables: (layout.cables ?? []).filter((c) => !ids.has(c.id)),
  };
}

/**
 * Get all device type slugs currently in use
 * Includes both defined device types and placed device references from ALL racks
 * Use this for image store cleanup to identify orphaned images
 */
function getUsedDeviceTypeSlugs(): Set<string> {
  // Plain Set is intentional - this is a utility function, not reactive state
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const slugs = new Set<string>();

  // Add all defined device types
  for (const dt of layout.device_types) {
    slugs.add(dt.slug);
  }

  // Add all placed device references from all racks (in case of orphaned references)
  for (const rack of layout.racks) {
    for (const device of rack.devices) {
      slugs.add(device.device_type);
    }
  }

  return slugs;
}

/**
 * Get device type slugs that are currently placed in any rack
 * Only counts actual placements, not just defined types
 */
function getPlacedDeviceTypeSlugs(): Set<string> {
  // Plain Set is intentional - this is a utility function, not reactive state
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const slugs = new Set<string>();

  for (const rack of layout.racks) {
    for (const device of rack.devices) {
      slugs.add(device.device_type);
    }
  }

  return slugs;
}

/**
 * Get unused custom device types
 * Returns device types that:
 * 1. Are in layout.device_types (custom/user-defined)
 * 2. Are NOT in starter library
 * 3. Are NOT in brand packs
 * 4. Have zero placements across all racks
 */
function getUnusedCustomDeviceTypes(): DeviceType[] {
  const starterSlugs = getStarterSlugs();
  const brandSlugs = getBrandSlugs();
  const placedSlugs = getPlacedDeviceTypeSlugs();

  return layout.device_types.filter((dt) => {
    // Must not be a starter library device
    if (starterSlugs.has(dt.slug)) return false;
    // Must not be a brand pack device
    if (brandSlugs.has(dt.slug)) return false;
    // Must not have any placements
    if (placedSlugs.has(dt.slug)) return false;
    return true;
  });
}

/**
 * Check if a device type slug is a custom type (not starter or brand)
 */
function isCustomDeviceType(slug: string): boolean {
  const starterSlugs = getStarterSlugs();
  const brandSlugs = getBrandSlugs();
  return !starterSlugs.has(slug) && !brandSlugs.has(slug);
}

/**
 * Check if a device type has any placements in any rack
 */
function hasDeviceTypePlacements(slug: string): boolean {
  return getPlacedDeviceTypeSlugs().has(slug);
}

// =============================================================================
// Command Store Adapter
// Creates an adapter that implements the command store interfaces
// Operations target the active rack
// =============================================================================

function getCommandStoreAdapter(): DeviceTypeCommandStore &
  DeviceCommandStore &
  RackCommandStore {
  return {
    // DeviceTypeCommandStore
    addDeviceTypeRaw,
    removeDeviceTypeRaw,
    updateDeviceTypeRaw,
    placeDeviceRaw,
    removeDeviceAtIndexRaw,
    getPlacedDevicesForType,

    // DeviceCommandStore
    moveDeviceRaw,
    updateDeviceFaceRaw,
    updateDeviceNameRaw,
    updateDevicePlacementImageRaw: (index, face, filename) => {
      // Resolve rack ID: use active rack, fall back to first rack
      const rackId = activeRackId ?? getTargetRack()?.rack.id;
      if (!rackId) {
        debug.log("updateDevicePlacementImageRaw: No rack available");
        return;
      }
      updateDevicePlacementImageRaw(rackId, index, face, filename);
    },
    updateDeviceColourRaw: (index, colour) => {
      // Resolve rack ID: use active rack, fall back to first rack
      const rackId = activeRackId ?? getTargetRack()?.rack.id;
      if (!rackId) {
        debug.log("updateDeviceColourRaw: No rack available");
        return;
      }
      updateDeviceColourRaw(rackId, index, colour);
    },
    updateDeviceSlotPositionRaw: (index, slotPosition) => {
      // Resolve rack ID: use active rack, fall back to first rack
      const rackId = activeRackId ?? getTargetRack()?.rack.id;
      if (!rackId) {
        debug.log("updateDeviceSlotPositionRaw: No rack available");
        return;
      }
      updateDeviceSlotPositionRaw(rackId, index, slotPosition);
    },
    getDeviceAtIndex,

    // RackCommandStore
    updateRackRaw,
    replaceRackRaw,
    clearRackDevicesRaw,
    restoreRackDevicesRaw,
    getRack: () => {
      const target = getTargetRack();
      if (!target && layout.racks.length === 0) {
        throw new Error("No rack available in RackCommandStore");
      }
      return target?.rack ?? layout.racks[0];
    },
  };
}

// =============================================================================
// Recorded Actions (with Undo/Redo support)
// These create commands and execute them through the history system
// Operations set activeRackId before executing to ensure Raw functions target the correct rack
// =============================================================================

/**
 * Add a device type with undo/redo support
 */
function addDeviceTypeRecorded(data: CreateDeviceTypeInput): DeviceType {
  const deviceType = createDeviceTypeHelper(data);
  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createAddDeviceTypeCommand(deviceType, adapter);
  history.execute(command);
  isDirty = true;

  return deviceType;
}

/**
 * Update a device type with undo/redo support
 */
function updateDeviceTypeRecorded(
  slug: string,
  updates: Partial<DeviceType>,
): void {
  const existing = findDeviceTypeInArray(layout.device_types, slug);
  if (!existing) return;

  // Capture before state for the fields being updated
  const before: Partial<DeviceType> = {};
  for (const key of Object.keys(updates) as (keyof DeviceType)[]) {
    before[key] = existing[key] as never;
  }

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createUpdateDeviceTypeCommand(slug, before, updates, adapter);
  history.execute(command);
  isDirty = true;
}

/**
 * Delete a device type with undo/redo support
 */
function deleteDeviceTypeRecorded(slug: string): void {
  const existing = findDeviceTypeInArray(layout.device_types, slug);
  if (!existing) return;

  const placedDevices = getPlacedDevicesForType(slug);
  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createDeleteDeviceTypeCommand(
    existing,
    placedDevices,
    adapter,
  );
  history.execute(command);
  isDirty = true;
}

/**
 * Delete multiple device types with single undo/redo support
 * Used for bulk cleanup operations
 * @param slugs - Array of device type slugs to delete
 * @returns Number of device types actually deleted
 */
function deleteMultipleDeviceTypesRecorded(slugs: string[]): number {
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

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();
  const commands: ReturnType<typeof createDeleteDeviceTypeCommand>[] = [];

  for (const slug of slugs) {
    const existing = findDeviceTypeInArray(layout.device_types, slug);
    if (!existing) continue;

    const placedDevices = getPlacedDevicesForType(slug);
    const command = createDeleteDeviceTypeCommand(
      existing,
      placedDevices,
      adapter,
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

  const batchCommand = createBatchCommand(description, commands);
  history.execute(batchCommand);
  isDirty = true;

  layoutDebug.state(
    "deleteMultipleDeviceTypesRecorded: completed - deleted %d device types",
    count,
  );

  return count;
}

/**
 * Place a device with undo/redo support
 * Auto-imports brand pack devices if not already in device library
 * Face defaults based on device depth: full-depth -> 'both', half-depth -> 'front'
 * @param rackId - Target rack ID
 * @param deviceTypeSlug - Device type slug
 * @param positionU - U position (human-readable, e.g., 1, 5, 10)
 * @param face - Optional face assignment
 * @param slotPosition - Optional slot position for half-width devices ('left', 'right', or 'full')
 * @returns true if placed successfully
 */
function placeDeviceRecorded(
  rackId: string,
  deviceTypeSlug: string,
  positionU: number,
  face?: DeviceFace,
  slotPosition?: SlotPosition,
): boolean {
  // Convert human U position to internal units
  const positionInternal = toInternalUnits(positionU);

  // Validate rack exists
  const targetRack = getRackById(rackId);
  if (!targetRack) {
    debug.devicePlace({
      slug: deviceTypeSlug,
      position: positionU,
      passedFace: face,
      effectiveFace: "N/A",
      deviceName: "unknown",
      isFullDepth: false,
      result: "not_found",
    });
    return false;
  }

  // Set active rack so Raw functions target the correct rack
  activeRackId = rackId;

  // Find device type across all sources (layout → starter → brand)
  const deviceType = findDeviceType(deviceTypeSlug, layout.device_types);

  // Auto-import if found in starter/brand but not yet in layout
  if (
    deviceType &&
    !layout.device_types.find((dt) => dt.slug === deviceTypeSlug)
  ) {
    layout.device_types = [...layout.device_types, deviceType];
  }

  // If not found, device type doesn't exist
  if (!deviceType) {
    debug.devicePlace({
      slug: deviceTypeSlug,
      position: positionU,
      passedFace: face,
      effectiveFace: "N/A",
      deviceName: "unknown",
      isFullDepth: false,
      result: "not_found",
    });
    return false;
  }

  // Determine face based on device depth
  // Full-depth devices ALWAYS use 'both' (they physically occupy front and rear)
  // Half-depth devices use the specified face, or default to 'front'
  const isFullDepth = deviceType.is_full_depth !== false;
  const effectiveFace: DeviceFace = isFullDepth
    ? "both"
    : (face ?? DEFAULT_DEVICE_FACE);
  const deviceName = deviceType.model ?? deviceType.slug;

  // Determine effective slot position
  // Full-width devices (slot_width !== 1) always use 'full'
  const deviceSlotWidth = deviceType.slot_width ?? 2;
  const effectiveSlotPosition: SlotPosition =
    deviceSlotWidth === 1 ? (slotPosition ?? "full") : "full";

  if (
    !canPlaceDevice(
      targetRack,
      layout.device_types,
      deviceType.u_height,
      positionInternal,
      undefined,
      effectiveFace,
      effectiveSlotPosition,
    )
  ) {
    debug.devicePlace({
      slug: deviceTypeSlug,
      position: positionU,
      passedFace: face,
      effectiveFace,
      deviceName,
      isFullDepth,
      result: "collision",
    });
    return false;
  }

  const device: PlacedDevice = {
    id: generateId(),
    device_type: deviceTypeSlug,
    position: positionInternal,
    face: effectiveFace,
    slot_position: effectiveSlotPosition,
    ports: instantiatePorts(deviceType),
  };

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createPlaceDeviceCommand(device, adapter, deviceName);
  history.execute(command);
  isDirty = true;

  debug.devicePlace({
    slug: deviceTypeSlug,
    position: positionU,
    passedFace: face,
    effectiveFace,
    deviceName,
    isFullDepth,
    result: "success",
  });

  return true;
}

/**
 * Move a device with undo/redo support
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param newPositionU - New position in U (human-readable)
 * @returns true if moved successfully
 */
function moveDeviceRecorded(
  rackId: string,
  deviceIndex: number,
  newPositionU: number,
): boolean {
  // Convert to internal units
  const newPositionInternal = toInternalUnits(newPositionU);

  const targetRack = getRackById(rackId);
  if (!targetRack) {
    debug.deviceMove({
      index: deviceIndex,
      deviceName: "unknown",
      face: "unknown",
      fromPosition: -1,
      toPosition: newPositionU,
      result: "not_found",
    });
    return false;
  }

  // Set active rack so Raw functions target the correct rack
  activeRackId = rackId;

  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) {
    debug.deviceMove({
      index: deviceIndex,
      deviceName: "unknown",
      face: "unknown",
      fromPosition: -1,
      toPosition: newPositionU,
      result: "not_found",
    });
    return false;
  }

  const device = targetRack.devices[deviceIndex]!;
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  if (!deviceType) {
    debug.deviceMove({
      index: deviceIndex,
      deviceName: device.device_type,
      face: device.face ?? "front",
      fromPosition: toHumanUnits(device.position),
      toPosition: newPositionU,
      result: "not_found",
    });
    return false;
  }

  const deviceName = deviceType.model ?? deviceType.slug;
  const oldPositionInternal = device.position;
  const oldPositionU = toHumanUnits(oldPositionInternal);

  // Use canPlaceDevice for bounds and collision checking (face and depth aware)
  const isFullDepth = deviceType.is_full_depth !== false;
  if (
    !canPlaceDevice(
      targetRack,
      layout.device_types,
      deviceType.u_height,
      newPositionInternal,
      deviceIndex,
      device.face,
      isFullDepth,
    )
  ) {
    // Determine if it's out of bounds or collision
    const isOutOfBounds =
      newPositionInternal < UNITS_PER_U ||
      newPositionInternal + toInternalUnits(deviceType.u_height) - 1 >
        targetRack.height * UNITS_PER_U;
    debug.deviceMove({
      index: deviceIndex,
      deviceName,
      face: device.face ?? "front",
      fromPosition: oldPositionU,
      toPosition: newPositionU,
      result: isOutOfBounds ? "out_of_bounds" : "collision",
    });
    return false;
  }

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createMoveDeviceCommand(
    deviceIndex,
    oldPositionInternal,
    newPositionInternal,
    adapter,
    deviceName,
  );
  history.execute(command);
  isDirty = true;

  debug.deviceMove({
    index: deviceIndex,
    deviceName,
    face: device.face ?? "front",
    fromPosition: oldPositionU,
    toPosition: newPositionU,
    result: "success",
  });

  return true;
}

/**
 * Remove a device with undo/redo support
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 */
function removeDeviceRecorded(rackId: string, deviceIndex: number): void {
  const targetRack = getRackById(rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  activeRackId = rackId;

  // Get a snapshot to convert from reactive proxy to plain object
  // structuredClone in the command factory requires a plain object
  const device = $state.snapshot(targetRack.devices[deviceIndex]!);
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceName = deviceType?.model ?? deviceType?.slug ?? "device";

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createRemoveDeviceCommand(
    deviceIndex,
    device,
    adapter,
    deviceName,
  );
  history.execute(command);
  isDirty = true;
}

/**
 * Update device face with undo/redo support
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param face - New face value
 */
function updateDeviceFaceRecorded(
  rackId: string,
  deviceIndex: number,
  face: DeviceFace,
): void {
  const targetRack = getRackById(rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  activeRackId = rackId;

  const device = targetRack.devices[deviceIndex]!;
  const oldFace = device.face ?? "front";
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceName = deviceType?.model ?? deviceType?.slug ?? "device";

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createUpdateDeviceFaceCommand(
    deviceIndex,
    oldFace,
    face,
    adapter,
    deviceName,
  );
  history.execute(command);
  isDirty = true;
}

/**
 * Update device custom name with undo/redo support
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param name - New name
 */
function updateDeviceNameRecorded(
  rackId: string,
  deviceIndex: number,
  name: string | undefined,
): void {
  const targetRack = getRackById(rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  activeRackId = rackId;

  const device = targetRack.devices[deviceIndex]!;
  const oldName = device.name;
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceTypeName = deviceType?.model ?? deviceType?.slug ?? "device";

  // Normalize empty string to undefined
  const normalizedName = name?.trim() || undefined;

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createUpdateDeviceNameCommand(
    deviceIndex,
    oldName,
    normalizedName,
    adapter,
    deviceTypeName,
  );
  history.execute(command);
  isDirty = true;
}

/**
 * Update device placement image with undo/redo support
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param face - Which face to update ('front' or 'rear')
 * @param filename - New image filename (undefined to clear)
 */
function updateDevicePlacementImageRecorded(
  rackId: string,
  deviceIndex: number,
  face: "front" | "rear",
  filename: string | undefined,
): void {
  const targetRack = getRackById(rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  activeRackId = rackId;

  const device = targetRack.devices[deviceIndex]!;
  const oldFilename = face === "front" ? device.front_image : device.rear_image;
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceName = deviceType?.model ?? deviceType?.slug ?? "device";

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createUpdateDevicePlacementImageCommand(
    deviceIndex,
    face,
    oldFilename,
    filename,
    adapter,
    deviceName,
  );
  history.execute(command);
  isDirty = true;
}

/**
 * Update device colour with undo/redo support
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param colour - New colour (undefined to clear and use device type colour)
 */
function updateDeviceColourRecorded(
  rackId: string,
  deviceIndex: number,
  colour: string | undefined,
): void {
  const targetRack = getRackById(rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  activeRackId = rackId;

  const device = targetRack.devices[deviceIndex]!;
  const oldColour = device.colour_override;
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceName = deviceType?.model ?? deviceType?.slug ?? "device";

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createUpdateDeviceColourCommand(
    deviceIndex,
    oldColour,
    colour,
    adapter,
    deviceName,
  );
  history.execute(command);
  isDirty = true;
}

/**
 * Update device slot position with undo/redo support (for half-width devices)
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param slotPosition - New slot position ('left' or 'right')
 * @returns true if successful, false if blocked
 */
function updateDeviceSlotPositionRecorded(
  rackId: string,
  deviceIndex: number,
  slotPosition: SlotPosition,
): boolean {
  const targetRack = getRackById(rackId);
  if (!targetRack) return false;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return false;

  // Set active rack so Raw functions target the correct rack
  activeRackId = rackId;

  const device = targetRack.devices[deviceIndex]!;

  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );

  // Only half-width devices can have their slot position changed
  if (!deviceType || deviceType.slot_width !== 1) {
    return false;
  }

  const oldSlotPosition = device.slot_position ?? "full";
  const deviceName = deviceType.model ?? deviceType.slug ?? "device";

  // No change needed
  if (oldSlotPosition === slotPosition) return true;

  // Check if target slot is occupied using shared collision utility
  if (isSlotOccupied(targetRack, device.position, slotPosition, deviceIndex)) {
    return false;
  }

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createUpdateDeviceSlotPositionCommand(
    deviceIndex,
    oldSlotPosition,
    slotPosition,
    adapter,
    deviceName,
  );
  history.execute(command);
  isDirty = true;
  return true;
}

/**
 * Update rack settings with undo/redo support
 * @param rackId - Rack ID
 * @param updates - Settings to update
 */
function updateRackRecorded(
  rackId: string,
  updates: Partial<Omit<Rack, "devices" | "view">>,
): void {
  const targetRack = getRackById(rackId);
  if (!targetRack) return;

  // Set active rack so Raw functions target the correct rack
  activeRackId = rackId;

  // Capture before state
  const before: Partial<Omit<Rack, "devices" | "view">> = {};
  for (const key of Object.keys(updates) as (keyof Omit<
    Rack,
    "devices" | "view"
  >)[]) {
    before[key] = targetRack[key] as never;
  }

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createUpdateRackCommand(before, updates, adapter);
  history.execute(command);
  isDirty = true;
}

/**
 * Clear rack devices with undo/redo support
 * Uses active rack
 */
function clearRackRecorded(): void {
  const target = getTargetRack();
  if (!target || target.rack.devices.length === 0) return;

  const devices = [...target.rack.devices];
  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createClearRackCommand(devices, adapter);
  history.execute(command);
  isDirty = true;
}

// =============================================================================
// Undo/Redo Functions
// =============================================================================

/**
 * Undo the last action
 * @returns true if undo was performed
 */
function undo(): boolean {
  const history = getHistoryStore();
  const result = history.undo();
  if (result) {
    isDirty = true;
  }
  return result;
}

/**
 * Redo the last undone action
 * @returns true if redo was performed
 */
function redo(): boolean {
  const history = getHistoryStore();
  const result = history.redo();
  if (result) {
    isDirty = true;
  }
  return result;
}

/**
 * Clear all undo/redo history
 */
function clearHistory(): void {
  getHistoryStore().clear();
}
