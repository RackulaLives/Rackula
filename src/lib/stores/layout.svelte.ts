/**
 * Layout Store
 * Central state management for the application using Svelte 5 runes
 *
 * This is the facade that owns the reactive $state and delegates to
 * extracted domain modules via the LayoutStateAccess bridge pattern.
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
import { MAX_RACKS } from "$lib/types/constants";
import {
  canPlaceInContainer,
  findValidDropPositions,
} from "$lib/utils/collision";
import { createLayout } from "$lib/utils/serialization";
import {
  findDeviceType as findDeviceTypeInArray,
  type CreateDeviceTypeInput,
} from "$lib/stores/layout-helpers";
import { findDeviceType } from "$lib/utils/device-lookup";
import { getStarterSlugs } from "$lib/data/starterLibrary";
import { getBrandSlugs } from "$lib/data/brandPacks";
import { debug, layoutDebug } from "$lib/utils/debug";
import { generateId } from "$lib/utils/device";
import { generateRackId } from "$lib/utils/rack";
import { toInternalUnits } from "$lib/utils/position";
import { instantiatePorts } from "$lib/utils/port-utils";
import { UNITS_PER_U } from "$lib/types/constants";
import { getHistoryStore } from "./history.svelte";
import {
  createPlaceDeviceCommand,
  createAddDeviceTypeCommand,
  createBatchCommand,
} from "./commands";
import type { LayoutStateAccess } from "./layout/types";
import {
  addRack as addRackImpl,
  addBayedRackGroup as addBayedRackGroupImpl,
  deleteRack as deleteRackImpl,
  reorderRacks as reorderRacksImpl,
  duplicateRack as duplicateRackImpl,
  getRackById as getRackByIdImpl,
  setActiveRack as setActiveRackImpl,
  getTargetRack as getTargetRackImpl,
} from "./layout/rack-actions";
import {
  createRackGroup as createRackGroupImpl,
  updateRackGroup as updateRackGroupImpl,
  deleteRackGroup as deleteRackGroupImpl,
  addRackToGroup as addRackToGroupImpl,
  removeRackFromGroup as removeRackFromGroupImpl,
  addBayToGroup as addBayToGroupImpl,
  removeBayFromGroup as removeBayFromGroupImpl,
  setBayCount as setBayCountImpl,
  getRackGroupById as getRackGroupByIdImpl,
  getRackGroupForRack as getRackGroupForRackImpl,
  reorderRacksInGroup as reorderRacksInGroupImpl,
  createRackGroupRaw as createRackGroupRawImpl,
  updateRackGroupRaw as updateRackGroupRawImpl,
  deleteRackGroupRaw as deleteRackGroupRawImpl,
} from "./layout/rack-groups";
import {
  addDeviceTypeRaw as addDeviceTypeRawImpl,
  removeDeviceTypeRaw as removeDeviceTypeRawImpl,
  updateDeviceTypeRaw as updateDeviceTypeRawImpl,
  placeDeviceRaw as placeDeviceRawImpl,
  removeDeviceAtIndexRaw as removeDeviceAtIndexRawImpl,
  moveDeviceRaw as moveDeviceRawImpl,
  updateDeviceFaceRaw as updateDeviceFaceRawImpl,
  updateDeviceNameRaw as updateDeviceNameRawImpl,
  updateDevicePlacementImageRaw as updateDevicePlacementImageRawImpl,
  updateDeviceColourRaw as updateDeviceColourRawImpl,
  getDeviceAtIndex as getDeviceAtIndexImpl,
  getPlacedDevicesForType as getPlacedDevicesForTypeImpl,
  updateRackRaw as updateRackRawImpl,
  replaceRackRaw as replaceRackRawImpl,
  clearRackDevicesRaw as clearRackDevicesRawImpl,
  restoreRackDevicesRaw as restoreRackDevicesRawImpl,
  addCableRaw as addCableRawImpl,
  updateCableRaw as updateCableRawImpl,
  removeCableRaw as removeCableRawImpl,
  removeCablesRaw as removeCablesRawImpl,
  generateUniqueDeviceId,
} from "./layout/mutators";
import {
  getCommandStoreAdapter as getCommandStoreAdapterImpl,
  addDeviceTypeRecorded as addDeviceTypeRecordedImpl,
  updateDeviceTypeRecorded as updateDeviceTypeRecordedImpl,
  deleteDeviceTypeRecorded as deleteDeviceTypeRecordedImpl,
  deleteMultipleDeviceTypesRecorded as deleteMultipleDeviceTypesRecordedImpl,
  placeDeviceRecorded as placeDeviceRecordedImpl,
  moveDeviceRecorded as moveDeviceRecordedImpl,
  removeDeviceRecorded as removeDeviceRecordedImpl,
  updateDeviceFaceRecorded as updateDeviceFaceRecordedImpl,
  updateDeviceNameRecorded as updateDeviceNameRecordedImpl,
  updateDevicePlacementImageRecorded as updateDevicePlacementImageRecordedImpl,
  updateDeviceColourRecorded as updateDeviceColourRecordedImpl,
  updateDeviceSlotPositionRecorded as updateDeviceSlotPositionRecordedImpl,
  updateDeviceNotesRecorded as updateDeviceNotesRecordedImpl,
  updateDeviceIpRecorded as updateDeviceIpRecordedImpl,
  updateRackRecorded as updateRackRecordedImpl,
  clearRackRecorded as clearRackRecordedImpl,
} from "./layout/command-adapters";

// localStorage key for tracking if user has started (created/loaded a rack)
export const HAS_STARTED_KEY = "Rackula_has_started";

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
let layout = $state<Layout>(createLayout());
let isDirty = $state(false);
let hasStarted = $state(loadHasStarted());
let activeRackId = $state<string | null>(null);

// Derived values (using $derived rune)
const racks = $derived(layout.racks);
const device_types = $derived(layout.device_types);
const rack_groups = $derived(layout.rack_groups ?? []);

/**
 * State access bridge for extracted domain modules.
 * Provides read/write access to the module-level $state variables
 * without exposing them directly to the extracted modules.
 */
const stateAccess: LayoutStateAccess = {
  getLayout: () => layout,
  setLayout: (l: Layout) => {
    layout = l;
  },
  getActiveRackId: () => activeRackId,
  setActiveRackId: (id: string | null) => {
    activeRackId = id;
  },
  markDirty: () => {
    isDirty = true;
  },
  markStarted: () => {
    hasStarted = true;
    saveHasStarted(true);
  },
  getRackGroups: () => rack_groups,
  findRack: (id: string) => layout.racks.find((r) => r.id === id),
  findRackIndex: (id: string) => layout.racks.findIndex((r) => r.id === id),
};

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
  layout = createLayout();
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
    setLayoutName,

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
    updateDeviceNotes,
    updateDeviceIp,

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

// =============================================================================
// Layout Actions
// =============================================================================

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
  // Ensures metadata with UUID exists for persistence
  const metadata = layoutData.metadata
    ? { ...layoutData.metadata }
    : { id: generateId() };
  if (!metadata.id) {
    metadata.id = generateId();
  }

  // Track seen IDs to detect duplicates
  const seenIds = new SvelteSet<string>();

  // Ensure runtime view is set, show_rear defaults, and all racks have valid IDs
  layout = {
    ...layoutData,
    metadata,
    racks: layoutData.racks.map((r, index) => {
      // Generate ID if missing or duplicate
      let rackId = r.id && r.id.trim().length > 0 ? r.id : generateRackId();
      if (seenIds.has(rackId)) {
        rackId = generateRackId();
      }
      seenIds.add(rackId);

      // Deduplicate device IDs and remap container_id references — defence-in-depth (#1363)
      /* eslint-disable svelte/prefer-svelte-reactivity -- ephemeral validation collections, not reactive state */
      const seenDeviceIds = new Set<string>();
      const idRemap = new Map<string, string>();
      /* eslint-enable svelte/prefer-svelte-reactivity */
      const devices = r.devices.map((d) => {
        const originalId = d.id;
        let nextId = originalId;
        if (!nextId || seenDeviceIds.has(nextId)) {
          nextId = generateUniqueDeviceId(seenDeviceIds);
          if (originalId) {
            idRemap.set(originalId, nextId);
          }
        } else {
          seenDeviceIds.add(nextId);
        }
        const nextContainerId =
          d.container_id && idRemap.has(d.container_id)
            ? idRemap.get(d.container_id)!
            : d.container_id;
        return nextId === originalId && nextContainerId === d.container_id
          ? d
          : { ...d, id: nextId, container_id: nextContainerId };
      });

      return {
        ...r,
        id: rackId,
        devices,
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

// =============================================================================
// Rack Actions — delegated to layout/rack-actions.ts
// =============================================================================

function addRack(
  name: string,
  height: number,
  width?: Rack["width"],
  form_factor?: FormFactor,
  desc_units?: boolean,
  starting_unit?: number,
) {
  return addRackImpl(stateAccess, name, height, width, form_factor, desc_units, starting_unit);
}

function addBayedRackGroup(
  groupName: string,
  bayCount: 2 | 3,
  height: number,
  width: Rack["width"] = 19,
) {
  return addBayedRackGroupImpl(stateAccess, groupName, bayCount, height, width);
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

function deleteRack(id: string): void {
  deleteRackImpl(stateAccess, id);
}

function reorderRacks(fromIndex: number, toIndex: number): void {
  reorderRacksImpl(stateAccess, fromIndex, toIndex);
}

function duplicateRack(id: string) {
  return duplicateRackImpl(stateAccess, id);
}

// =============================================================================
// Rack Group Actions — delegated to layout/rack-groups.ts
// =============================================================================

function createRackGroup(name: string, rackIds: string[], preset?: LayoutPreset) {
  return createRackGroupImpl(stateAccess, name, rackIds, preset);
}

function updateRackGroup(id: string, updates: Partial<RackGroup>) {
  return updateRackGroupImpl(stateAccess, id, updates);
}

function deleteRackGroup(id: string): void {
  deleteRackGroupImpl(stateAccess, id);
}

function addRackToGroup(groupId: string, rackId: string) {
  return addRackToGroupImpl(stateAccess, groupId, rackId);
}

function removeRackFromGroup(groupId: string, rackId: string): void {
  removeRackFromGroupImpl(stateAccess, groupId, rackId);
}

function addBayToGroup(groupId: string) {
  return addBayToGroupImpl(stateAccess, groupId);
}

function removeBayFromGroup(groupId: string) {
  return removeBayFromGroupImpl(stateAccess, groupId, deleteRack);
}

function setBayCount(groupId: string, targetCount: number) {
  return setBayCountImpl(stateAccess, groupId, targetCount, deleteRack);
}

function getRackGroupById(id: string): RackGroup | undefined {
  return getRackGroupByIdImpl(stateAccess, id);
}

function getRackGroupForRack(rackId: string): RackGroup | undefined {
  return getRackGroupForRackImpl(stateAccess, rackId);
}

function reorderRacksInGroup(groupId: string, newOrder: string[]) {
  return reorderRacksInGroupImpl(stateAccess, groupId, newOrder);
}

// Rack group raw actions (for undo/redo system)

function createRackGroupRaw(group: RackGroup): void {
  createRackGroupRawImpl(stateAccess, group);
}

function updateRackGroupRaw(id: string, updates: Partial<RackGroup>): void {
  updateRackGroupRawImpl(stateAccess, id, updates);
}

function deleteRackGroupRaw(id: string): RackGroup | undefined {
  return deleteRackGroupRawImpl(stateAccess, id);
}

// =============================================================================
// Device Actions
// =============================================================================

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
  // Use $state.snapshot() to deep-clone the reactive proxy and avoid linked state
  const duplicatedDevice: PlacedDevice = {
    ...$state.snapshot(sourceDevice),
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
  const adapter = getCommandStoreAdapterImpl(stateAccess);
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

function getRackById(id: string): Rack | undefined {
  return getRackByIdImpl(stateAccess, id);
}

function setActiveRack(id: string | null): void {
  setActiveRackImpl(stateAccess, id);
}

// =============================================================================
// Device Type Actions
// =============================================================================

/**
 * Add a device type to the library
 * Uses undo/redo support via addDeviceTypeRecorded
 */
function addDeviceType(data: CreateDeviceTypeInput): DeviceType {
  return addDeviceTypeRecorded(data);
}

/**
 * Update a device type in the library
 * Uses undo/redo support via updateDeviceTypeRecorded
 */
function updateDeviceType(slug: string, updates: Partial<DeviceType>): void {
  updateDeviceTypeRecorded(slug, updates);
}

/**
 * Delete a device type from the library
 * Also removes all placed devices referencing it
 * Uses undo/redo support via deleteDeviceTypeRecorded
 */
function deleteDeviceType(slug: string): void {
  deleteDeviceTypeRecorded(slug);
}

// =============================================================================
// Placement Actions
// =============================================================================

/**
 * Place a device from the library into a rack
 * Uses undo/redo support via placeDeviceRecorded
 */
function placeDevice(
  rackId: string,
  deviceTypeSlug: string,
  position: number,
  face?: DeviceFace,
  slotPosition?: SlotPosition,
): boolean {
  return placeDeviceRecorded(rackId, deviceTypeSlug, position, face, slotPosition);
}

/**
 * Place a device inside a container slot
 * Uses undo/redo support via command pattern
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
    id: generateId(),
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
  const adapter = getCommandStoreAdapterImpl(stateAccess);

  const autoImport =
    childType && !layout.device_types.find((dt) => dt.slug === deviceTypeSlug)
      ? childType
      : undefined;
  const placeCommand = createPlaceDeviceCommand(placedDevice, adapter, deviceName);

  if (autoImport) {
    const importCommand = createAddDeviceTypeCommand(autoImport, adapter);
    const batch = createBatchCommand(`Place ${deviceName}`, [importCommand, placeCommand]);
    history.execute(batch);
  } else {
    history.execute(placeCommand);
  }
  isDirty = true;

  return true;
}

/**
 * Move a device within a rack
 * Uses undo/redo support via moveDeviceRecorded
 */
function moveDevice(
  rackId: string,
  deviceIndex: number,
  newPosition: number,
  slotPosition?: SlotPosition,
): boolean {
  return moveDeviceRecorded(rackId, deviceIndex, newPosition, slotPosition);
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
  slotPosition?: SlotPosition,
): boolean {
  // Cross-rack moves not yet implemented
  if (fromRackId !== toRackId) {
    debug.log("Cross-rack move not yet implemented");
    return false;
  }
  return moveDevice(fromRackId, deviceIndex, newPosition, slotPosition);
}

/**
 * Remove a device from a rack
 * Uses undo/redo support via removeDeviceRecorded
 */
function removeDeviceFromRack(rackId: string, deviceIndex: number): void {
  removeDeviceRecorded(rackId, deviceIndex);
}

/**
 * Update a device's face property
 */
function updateDeviceFace(
  rackId: string,
  deviceIndex: number,
  face: DeviceFace,
): void {
  updateDeviceFaceRecorded(rackId, deviceIndex, face);
}

/**
 * Update a device's custom display name
 */
function updateDeviceName(
  rackId: string,
  deviceIndex: number,
  name: string | undefined,
): void {
  updateDeviceNameRecorded(rackId, deviceIndex, name);
}

/**
 * Update a device's placement image filename
 */
function updateDevicePlacementImage(
  rackId: string,
  deviceIndex: number,
  face: "front" | "rear",
  filename: string | undefined,
): void {
  updateDevicePlacementImageRecorded(rackId, deviceIndex, face, filename);
}

/**
 * Update a device's colour override
 */
function updateDeviceColour(
  rackId: string,
  deviceIndex: number,
  colour: string | undefined,
): void {
  updateDeviceColourRecorded(rackId, deviceIndex, colour);
}

/**
 * Update a device's slot position (for half-width devices)
 */
function updateDeviceSlotPosition(
  rackId: string,
  deviceIndex: number,
  slotPosition: SlotPosition,
): boolean {
  return updateDeviceSlotPositionRecorded(rackId, deviceIndex, slotPosition);
}

/**
 * Update a device's notes
 */
function updateDeviceNotes(
  rackId: string,
  deviceIndex: number,
  notes: string | undefined,
): void {
  updateDeviceNotesRecorded(rackId, deviceIndex, notes);
}

/**
 * Update a device's IP address/hostname
 */
function updateDeviceIp(
  rackId: string,
  deviceIndex: number,
  ip: string | undefined,
): void {
  updateDeviceIpRecorded(rackId, deviceIndex, ip);
}

/**
 * Set the layout name explicitly
 * @param name - New layout name (whitespace-trimmed, empty strings ignored)
 */
function setLayoutName(name: string): void {
  const trimmed = name.trim();
  if (trimmed && trimmed !== layout.name) {
    layout = {
      ...layout,
      name: trimmed,
      metadata: layout.metadata
        ? { ...layout.metadata, name: trimmed }
        : layout.metadata,
    };
    markDirty();
  }
}

// =============================================================================
// Settings Actions
// =============================================================================

function markDirty(): void {
  isDirty = true;
}

function markClean(): void {
  isDirty = false;
}

function markStarted(): void {
  hasStarted = true;
  saveHasStarted(true);
}

/**
 * Update the display mode in layout settings
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
 */
function updateShowLabelsOnImages(value: boolean): void {
  layout = {
    ...layout,
    settings: { ...layout.settings, show_labels_on_images: value },
  };
  isDirty = true;
}

// =============================================================================
// Raw Actions — delegated to layout/mutators.ts
// These bypass dirty tracking and validation - used by the command pattern
// =============================================================================

function addDeviceTypeRaw(deviceType: DeviceType): void {
  addDeviceTypeRawImpl(stateAccess, deviceType);
}

function removeDeviceTypeRaw(slug: string): void {
  removeDeviceTypeRawImpl(stateAccess, slug);
}

function updateDeviceTypeRaw(slug: string, updates: Partial<DeviceType>): void {
  updateDeviceTypeRawImpl(stateAccess, slug, updates);
}

function placeDeviceRaw(device: PlacedDevice): number {
  return placeDeviceRawImpl(stateAccess, device);
}

function removeDeviceAtIndexRaw(index: number): PlacedDevice | undefined {
  return removeDeviceAtIndexRawImpl(stateAccess, index);
}

function moveDeviceRaw(index: number, newPosition: number): boolean {
  return moveDeviceRawImpl(stateAccess, index, newPosition);
}

function updateDeviceFaceRaw(index: number, face: DeviceFace): void {
  updateDeviceFaceRawImpl(stateAccess, index, face);
}

function updateDeviceNameRaw(index: number, name: string | undefined): void {
  updateDeviceNameRawImpl(stateAccess, index, name);
}

function updateDevicePlacementImageRaw(
  index: number,
  face: "front" | "rear",
  filename: string | undefined,
): void {
  // Resolve rack ID: use active rack, fall back to first rack
  const rackId = activeRackId ?? getTargetRackImpl(stateAccess)?.rack.id;
  if (!rackId) {
    debug.log("updateDevicePlacementImageRaw: No rack available");
    return;
  }
  updateDevicePlacementImageRawImpl(stateAccess, rackId, index, face, filename);
}

function updateDeviceColourRaw(index: number, colour: string | undefined): void {
  // Resolve rack ID: use active rack, fall back to first rack
  const rackId = activeRackId ?? getTargetRackImpl(stateAccess)?.rack.id;
  if (!rackId) {
    debug.log("updateDeviceColourRaw: No rack available");
    return;
  }
  updateDeviceColourRawImpl(stateAccess, rackId, index, colour);
}

function getDeviceAtIndex(index: number): PlacedDevice | undefined {
  return getDeviceAtIndexImpl(stateAccess, index);
}

function getPlacedDevicesForType(slug: string): PlacedDevice[] {
  return getPlacedDevicesForTypeImpl(stateAccess, slug);
}

function updateRackRaw(updates: Partial<Omit<Rack, "devices" | "view">>): void {
  updateRackRawImpl(stateAccess, updates);
}

function replaceRackRaw(newRack: Rack): void {
  replaceRackRawImpl(stateAccess, newRack);
}

function clearRackDevicesRaw(): PlacedDevice[] {
  return clearRackDevicesRawImpl(stateAccess);
}

function restoreRackDevicesRaw(devices: PlacedDevice[]): void {
  restoreRackDevicesRawImpl(stateAccess, devices);
}

// Cable raw actions

function addCableRaw(cable: Cable): void {
  addCableRawImpl(stateAccess, cable);
}

function updateCableRaw(id: string, updates: Partial<Omit<Cable, "id">>): void {
  updateCableRawImpl(stateAccess, id, updates);
}

function removeCableRaw(id: string): void {
  removeCableRawImpl(stateAccess, id);
}

function removeCablesRaw(ids: Set<string>): void {
  removeCablesRawImpl(stateAccess, ids);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get all device type slugs currently in use
 */
function getUsedDeviceTypeSlugs(): Set<string> {
  // Plain Set is intentional - this is a utility function, not reactive state
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const slugs = new Set<string>();

  for (const dt of layout.device_types) {
    slugs.add(dt.slug);
  }

  for (const r of layout.racks) {
    for (const device of r.devices) {
      slugs.add(device.device_type);
    }
  }

  return slugs;
}

/**
 * Get device type slugs that are currently placed in any rack
 */
function getPlacedDeviceTypeSlugs(): Set<string> {
  // Plain Set is intentional - this is a utility function, not reactive state
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const slugs = new Set<string>();

  for (const r of layout.racks) {
    for (const device of r.devices) {
      slugs.add(device.device_type);
    }
  }

  return slugs;
}

/**
 * Get unused custom device types
 */
function getUnusedCustomDeviceTypes(): DeviceType[] {
  const starterSlugs = getStarterSlugs();
  const brandSlugs = getBrandSlugs();
  const placedSlugs = getPlacedDeviceTypeSlugs();

  return layout.device_types.filter((dt) => {
    if (starterSlugs.has(dt.slug)) return false;
    if (brandSlugs.has(dt.slug)) return false;
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
// Recorded Actions — delegated to layout/command-adapters.ts
// =============================================================================

function addDeviceTypeRecorded(data: CreateDeviceTypeInput): DeviceType {
  return addDeviceTypeRecordedImpl(stateAccess, data);
}

function updateDeviceTypeRecorded(
  slug: string,
  updates: Partial<DeviceType>,
): void {
  updateDeviceTypeRecordedImpl(stateAccess, slug, updates);
}

function deleteDeviceTypeRecorded(slug: string): void {
  deleteDeviceTypeRecordedImpl(stateAccess, slug);
}

function deleteMultipleDeviceTypesRecorded(slugs: string[]): number {
  return deleteMultipleDeviceTypesRecordedImpl(stateAccess, slugs);
}

function placeDeviceRecorded(
  rackId: string,
  deviceTypeSlug: string,
  positionU: number,
  face?: DeviceFace,
  slotPosition?: SlotPosition,
): boolean {
  return placeDeviceRecordedImpl(
    stateAccess,
    rackId,
    deviceTypeSlug,
    positionU,
    face,
    slotPosition,
  );
}

function moveDeviceRecorded(
  rackId: string,
  deviceIndex: number,
  newPositionU: number,
  newSlotPosition?: SlotPosition,
): boolean {
  return moveDeviceRecordedImpl(
    stateAccess,
    rackId,
    deviceIndex,
    newPositionU,
    newSlotPosition,
  );
}

function removeDeviceRecorded(rackId: string, deviceIndex: number): void {
  // $state.snapshot() is a Svelte rune — must be called from this .svelte.ts file
  removeDeviceRecordedImpl(
    stateAccess,
    rackId,
    deviceIndex,
    (device) => $state.snapshot(device),
  );
}

function updateDeviceFaceRecorded(
  rackId: string,
  deviceIndex: number,
  face: DeviceFace,
): void {
  updateDeviceFaceRecordedImpl(stateAccess, rackId, deviceIndex, face);
}

function updateDeviceNameRecorded(
  rackId: string,
  deviceIndex: number,
  name: string | undefined,
): void {
  updateDeviceNameRecordedImpl(stateAccess, rackId, deviceIndex, name);
}

function updateDevicePlacementImageRecorded(
  rackId: string,
  deviceIndex: number,
  face: "front" | "rear",
  filename: string | undefined,
): void {
  updateDevicePlacementImageRecordedImpl(
    stateAccess,
    rackId,
    deviceIndex,
    face,
    filename,
  );
}

function updateDeviceColourRecorded(
  rackId: string,
  deviceIndex: number,
  colour: string | undefined,
): void {
  updateDeviceColourRecordedImpl(stateAccess, rackId, deviceIndex, colour);
}

function updateDeviceSlotPositionRecorded(
  rackId: string,
  deviceIndex: number,
  slotPosition: SlotPosition,
): boolean {
  return updateDeviceSlotPositionRecordedImpl(
    stateAccess,
    rackId,
    deviceIndex,
    slotPosition,
  );
}

function updateDeviceNotesRecorded(
  rackId: string,
  deviceIndex: number,
  notes: string | undefined,
): void {
  updateDeviceNotesRecordedImpl(stateAccess, rackId, deviceIndex, notes);
}

function updateDeviceIpRecorded(
  rackId: string,
  deviceIndex: number,
  ip: string | undefined,
): void {
  updateDeviceIpRecordedImpl(stateAccess, rackId, deviceIndex, ip);
}

function updateRackRecorded(
  rackId: string,
  updates: Partial<Omit<Rack, "devices" | "view">>,
): void {
  updateRackRecordedImpl(stateAccess, rackId, updates);
}

function clearRackRecorded(rackId?: string): void {
  clearRackRecordedImpl(stateAccess, rackId);
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
