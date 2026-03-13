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
import { createLayout } from "$lib/utils/serialization";
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
import { generateRackId } from "$lib/utils/rack";
import { instantiatePorts } from "$lib/utils/port-utils";
import { sanitizeFilename } from "$lib/utils/imageUpload";
import { getHistoryStore } from "./history.svelte";
import { getImageStore } from "./images.svelte";
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
  createUpdateDeviceNotesCommand,
  createUpdateDeviceIpCommand,
  createUpdateRackCommand,
  createClearRackCommand,
  createBatchCommand,
  type DeviceTypeCommandStore,
  type DeviceCommandStore,
  type RackCommandStore,
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

// Rack actions — delegated to layout/rack-actions.ts and layout/rack-groups.ts

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

// Rack actions — delegated to layout/rack-actions.ts

function deleteRack(id: string): void {
  deleteRackImpl(stateAccess, id);
}

function reorderRacks(fromIndex: number, toIndex: number): void {
  reorderRacksImpl(stateAccess, fromIndex, toIndex);
}

function duplicateRack(id: string) {
  return duplicateRackImpl(stateAccess, id);
}

// Rack group actions — delegated to layout/rack-groups.ts

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

// Rack group raw actions — delegated to layout/rack-groups.ts (for undo/redo system)

function createRackGroupRaw(group: RackGroup): void {
  createRackGroupRawImpl(stateAccess, group);
}

function updateRackGroupRaw(id: string, updates: Partial<RackGroup>): void {
  updateRackGroupRawImpl(stateAccess, id, updates);
}

function deleteRackGroupRaw(id: string): RackGroup | undefined {
  return deleteRackGroupRawImpl(stateAccess, id);
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

function getRackById(id: string): Rack | undefined {
  return getRackByIdImpl(stateAccess, id);
}

function setActiveRack(id: string | null): void {
  setActiveRackImpl(stateAccess, id);
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
  slotPosition?: SlotPosition,
): boolean {
  // Delegate to recorded version for undo/redo support
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
 * Update a device's notes
 * Uses undo/redo support via updateDeviceNotesRecorded
 * @param rackId - Rack ID
 * @param deviceIndex - Index of device in rack's devices array
 * @param notes - New notes (undefined or empty to clear)
 */
function updateDeviceNotes(
  rackId: string,
  deviceIndex: number,
  notes: string | undefined,
): void {
  // Delegate to recorded version for undo/redo support
  updateDeviceNotesRecorded(rackId, deviceIndex, notes);
}

/**
 * Update a device's IP address/hostname
 * Uses undo/redo support via updateDeviceIpRecorded
 * @param rackId - Rack ID
 * @param deviceIndex - Index of device in rack's devices array
 * @param ip - New IP address/hostname (undefined or empty to clear)
 */
function updateDeviceIp(
  rackId: string,
  deviceIndex: number,
  ip: string | undefined,
): void {
  // Delegate to recorded version for undo/redo support
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

function getTargetRack(rackId?: string) {
  return getTargetRackImpl(stateAccess, rackId);
}

/**
 * Update a rack at a specific index
 * @param index - Rack index
 * @param updater - Function to update the rack
 */
/**
 * Generate a unique device ID that doesn't collide with the given set (#1363)
 */
function generateUniqueDeviceId(seen: Set<string>): string {
  let id = generateId();
  while (seen.has(id)) id = generateId();
  seen.add(id);
  return id;
}

/**
 * Dev-mode invariant: warn if a rack contains duplicate device IDs (#1363)
 */
function assertUniqueDeviceIds(rack: Rack): void {
  if (!import.meta.env.DEV) return;
  const ids = rack.devices.map((d) => d.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    layoutDebug.state(`Duplicate device IDs in rack "${rack.name}":`, dupes);
  }
}

function updateRackAtIndex(index: number, updater: (rack: Rack) => Rack): void {
  layout = {
    ...layout,
    racks: layout.racks.map((r, i) => {
      if (i !== index) return r;
      const updated = updater(r);
      assertUniqueDeviceIds(updated);
      return updated;
    }),
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

  // Guard: regenerate ID if it already exists in this rack (#1363)
  const existingIds = new Set(target.rack.devices.map((d) => d.id));
  const safeDevice = existingIds.has(device.id)
    ? { ...device, id: generateUniqueDeviceId(existingIds) }
    : device;

  const newDevices = [...target.rack.devices, safeDevice];
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
 * Update a device's notes directly (raw)
 * @param rackId - Rack ID (for multi-rack support)
 * @param index - Device index
 * @param notes - Notes string (undefined to clear)
 */
function updateDeviceNotesRaw(
  rackId: string,
  index: number,
  notes: string | undefined,
): void {
  const target = getTargetRack(rackId);
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  // Normalize empty string to undefined
  const normalizedNotes = notes?.trim() || undefined;

  updateRackAtIndex(target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) =>
      i === index ? { ...d, notes: normalizedNotes } : d,
    ),
  }));
}

/**
 * Update a device's IP address/hostname directly (raw)
 * @param rackId - Rack ID (for multi-rack support)
 * @param index - Device index
 * @param ip - IP address/hostname string (undefined to clear)
 */
function updateDeviceIpRaw(
  rackId: string,
  index: number,
  ip: string | undefined,
): void {
  const target = getTargetRack(rackId);
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  // Normalize empty string to undefined
  const normalizedIp = ip?.trim() || undefined;

  updateRackAtIndex(target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) => {
      if (i !== index) return d;

      // Handle custom_fields object lifecycle - default to empty object for safe spreading
      const currentCustomFields = d.custom_fields ?? {};

      if (normalizedIp === undefined) {
        // Removing IP - clean up custom_fields if it becomes empty
        if (!Object.hasOwn(currentCustomFields, "ip")) {
          return d; // No change needed - IP doesn't exist
        }
        const { ip: _ip, ...restFields } = currentCustomFields;
        // If no other custom fields, set to undefined rather than empty object
        const newCustomFields =
          Object.keys(restFields).length > 0 ? restFields : undefined;
        return { ...d, custom_fields: newCustomFields };
      } else {
        // Setting IP - create or update custom_fields
        return {
          ...d,
          custom_fields: { ...currentCustomFields, ip: normalizedIp },
        };
      }
    }),
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

  // Guard: deduplicate IDs in restored device list (#1363)
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- ephemeral validation set, not reactive state
  const seenIds = new Set<string>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- ephemeral remap, not reactive state
  const idRemap = new Map<string, string>();
  const safeDevices = devices
    .map((d) => {
      if (seenIds.has(d.id)) {
        const newId = generateUniqueDeviceId(seenIds);
        idRemap.set(d.id, newId);
        return { ...d, id: newId };
      }
      seenIds.add(d.id);
      return d;
    })
    .map((d) => {
      // Second pass: remap container_id references
      if (d.container_id && idRemap.has(d.container_id)) {
        return { ...d, container_id: idRemap.get(d.container_id)! };
      }
      return d;
    });

  updateRackAtIndex(target.index, (rack) => ({
    ...rack,
    devices: [...safeDevices],
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
    updateDeviceNotesRaw: (index, notes) => {
      // Resolve rack ID: use active rack, fall back to first rack
      const rackId = activeRackId ?? getTargetRack()?.rack.id;
      if (!rackId) {
        debug.log("updateDeviceNotesRaw: No rack available");
        return;
      }
      updateDeviceNotesRaw(rackId, index, notes);
    },
    updateDeviceIpRaw: (index, ip) => {
      // Resolve rack ID: use active rack, fall back to first rack
      const rackId = activeRackId ?? getTargetRack()?.rack.id;
      if (!rackId) {
        debug.log("updateDeviceIpRaw: No rack available");
        return;
      }
      updateDeviceIpRaw(rackId, index, ip);
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
  newSlotPosition?: SlotPosition,
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
  // Use new slot_position if provided (e.g., from D&D target), otherwise keep existing
  const effectiveSlot = newSlotPosition ?? device.slot_position ?? "full";
  if (
    !canPlaceDevice(
      targetRack,
      layout.device_types,
      deviceType.u_height,
      newPositionInternal,
      deviceIndex,
      device.face,
      effectiveSlot,
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

  // Update slot_position if changed (not tracked by move command undo/redo)
  if (newSlotPosition && newSlotPosition !== device.slot_position) {
    const freshRack = getRackById(rackId);
    if (freshRack && freshRack.devices[deviceIndex]) {
      freshRack.devices[deviceIndex]!.slot_position = newSlotPosition;
    }
  }

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
  const device = $state.snapshot(targetRack.devices[deviceIndex]);
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
 * @param slotPosition - New slot position ('left', 'right', or 'full')
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
 * Update device notes with undo/redo support
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param notes - New notes (undefined to clear)
 */
function updateDeviceNotesRecorded(
  rackId: string,
  deviceIndex: number,
  notes: string | undefined,
): void {
  const targetRack = getRackById(rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  activeRackId = rackId;

  const device = targetRack.devices[deviceIndex]!;
  const oldNotes = device.notes;
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceName = deviceType?.model ?? deviceType?.slug ?? "device";

  // Normalize empty string to undefined
  const normalizedNotes = notes?.trim() || undefined;

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createUpdateDeviceNotesCommand(
    deviceIndex,
    oldNotes,
    normalizedNotes,
    adapter,
    deviceName,
  );
  history.execute(command);
  isDirty = true;
}

/**
 * Update device IP address/hostname with undo/redo support
 * @param rackId - Rack ID
 * @param deviceIndex - Device index
 * @param ip - New IP address/hostname (undefined to clear)
 */
function updateDeviceIpRecorded(
  rackId: string,
  deviceIndex: number,
  ip: string | undefined,
): void {
  const targetRack = getRackById(rackId);
  if (!targetRack) return;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return;

  // Set active rack so Raw functions target the correct rack
  activeRackId = rackId;

  const device = targetRack.devices[deviceIndex]!;
  const oldIp =
    typeof device.custom_fields?.ip === "string"
      ? device.custom_fields.ip
      : undefined;
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  const deviceName = deviceType?.model ?? deviceType?.slug ?? "device";

  // Normalize empty string to undefined
  const normalizedIp = ip?.trim() || undefined;

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createUpdateDeviceIpCommand(
    deviceIndex,
    oldIp,
    normalizedIp,
    adapter,
    deviceName,
  );
  history.execute(command);
  isDirty = true;
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
 * Uses active rack unless a rackId override is provided
 */
function clearRackRecorded(rackId?: string): void {
  if (rackId) {
    activeRackId = rackId;
  }
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
