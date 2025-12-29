/**
 * Layout Store
 * Central state management for the application using Svelte 5 runes
 */

import type {
  FormFactor,
  Layout,
  Rack,
  DeviceType,
  PlacedDevice,
  DeviceFace,
  RackView,
  DisplayMode,
} from "$lib/types";
import { DEFAULT_DEVICE_FACE } from "$lib/types/constants";
import { canPlaceDevice } from "$lib/utils/collision";
import { createLayout, createRack } from "$lib/utils/serialization";
import {
  createDeviceType as createDeviceTypeHelper,
  findDeviceType as findDeviceTypeInArray,
  type CreateDeviceTypeInput,
} from "$lib/stores/layout-helpers";
import { findDeviceType } from "$lib/utils/device-lookup";
import { debug } from "$lib/utils/debug";
import { generateId } from "$lib/utils/device";
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
  createUpdateRackCommand,
  createClearRackCommand,
  type DeviceTypeCommandStore,
  type DeviceCommandStore,
  type RackCommandStore,
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

// Derived values (using $derived rune)
const rack = $derived(layout.rack);
const device_types = $derived(layout.device_types);
const hasRack = $derived(layout.rack.devices !== undefined);

// rackCount returns 0 until user has started (shows WelcomeScreen)
const rackCount = $derived(hasStarted ? 1 : 0);
const canAddRack = $derived(false); // Single-rack mode

/**
 * Reset the store to initial state (primarily for testing)
 * @param clearStarted - If true, also clears the hasStarted flag (default: true)
 */
export function resetLayoutStore(clearStarted: boolean = true): void {
  layout = createLayout("Racky McRackface");
  isDirty = false;
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
    get hasStarted() {
      return hasStarted;
    },

    // Layout actions
    createNewLayout,
    loadLayout,
    resetLayout: resetLayoutStore,

    // Rack actions (simplified for single rack)
    addRack,
    updateRack,
    updateRackView,
    deleteRack,
    reorderRacks,
    duplicateRack,

    // Device type actions
    addDeviceType,
    updateDeviceType,
    deleteDeviceType,

    // Placement actions
    placeDevice,
    moveDevice,
    moveDeviceToRack,
    removeDeviceFromRack,
    updateDeviceFace,
    updateDeviceName,
    updateDevicePlacementImage,
    updateDeviceColour,

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

    // Utility
    getUsedDeviceTypeSlugs,

    // Recorded actions (use undo/redo)
    addDeviceTypeRecorded,
    updateDeviceTypeRecorded,
    deleteDeviceTypeRecorded,
    placeDeviceRecorded,
    moveDeviceRecorded,
    removeDeviceRecorded,
    updateDeviceFaceRecorded,
    updateDeviceNameRecorded,
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
 * Load a v0.2 layout directly
 * @param layoutData - v0.2 layout to load
 */
function loadLayout(layoutData: Layout): void {
  // Ensure runtime view is set and show_rear defaults to true for older layouts
  layout = {
    ...layoutData,
    rack: {
      ...layoutData.rack,
      view: layoutData.rack.view ?? "front",
      show_rear: layoutData.rack.show_rear ?? true,
    },
  };
  isDirty = false;

  // Mark as started (user has loaded a layout)
  hasStarted = true;
  saveHasStarted(true);
}

/**
 * Add a new rack to the layout (replaces existing in v0.2)
 * In v0.2, there's only one rack, so this replaces it
 * @param name - Rack name
 * @param height - Rack height in U
 * @param width - Rack width in inches (10 or 19)
 * @param form_factor - Rack form factor
 * @param desc_units - Whether units are numbered top-down
 * @param starting_unit - First U number
 * @returns The created rack object with synthetic id
 */
function addRack(
  name: string,
  height: number,
  width?: number,
  form_factor?: FormFactor,
  desc_units?: boolean,
  starting_unit?: number,
): (Rack & { id: string }) | null {
  const newRack = createRack(
    name,
    height,
    (width as 10 | 19) ?? 19,
    form_factor ?? "4-post-cabinet",
    desc_units ?? false,
    starting_unit ?? 1,
  );

  layout = {
    ...layout,
    name, // Sync layout name with rack name
    rack: newRack,
  };
  isDirty = true;

  // Mark as started (user has created a rack)
  hasStarted = true;
  saveHasStarted(true);

  // Return with synthetic id (single-rack mode uses fixed 'rack-0')
  return { ...newRack, id: "rack-0" };
}

/**
 * Update a rack's properties
 * Uses undo/redo support via updateRackRecorded (except for view changes)
 * In v0.2, there's only one rack, so id is ignored
 * @param _id - Rack ID (ignored in v0.2)
 * @param updates - Properties to update
 */
function updateRack(_id: string, updates: Partial<Rack>): void {
  // Handle view separately (doesn't need undo/redo)
  if (updates.view !== undefined) {
    layout = {
      ...layout,
      rack: { ...layout.rack, view: updates.view },
    };
    isDirty = true;
  }

  // For other properties, use recorded version for undo/redo support
  const { view: _view, devices: _devices, ...recordableUpdates } = updates;
  if (Object.keys(recordableUpdates).length > 0) {
    updateRackRecorded(recordableUpdates);
  }
}

/**
 * Update a rack's view (front/rear)
 * @param _id - Rack ID (ignored in v0.2)
 * @param view - New view
 */
function updateRackView(_id: string, view: RackView): void {
  updateRack(_id, { view });
}

/**
 * Delete a rack from the layout
 * In v0.2, this resets the rack to empty
 * @param _id - Rack ID (ignored in v0.2)
 */
function deleteRack(_id: string): void {
  layout = {
    ...layout,
    rack: {
      ...layout.rack,
      devices: [],
    },
  };
  isDirty = true;
}

/**
 * Reorder racks by swapping positions
 * No-op in v0.2 (single rack only)
 */
function reorderRacks(_fromIndex: number, _toIndex: number): void {
  // No-op in v0.2 - single rack only
}

/**
 * Duplicate a rack with all its devices
 * Not supported in v0.2 (single rack only)
 * @param _id - Rack ID
 * @returns Error message
 */
function duplicateRack(_id: string): { error?: string } {
  return { error: "Maximum of 1 rack allowed" };
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
 * Place a device from the library into the rack
 * Uses undo/redo support via placeDeviceRecorded
 * Face defaults based on device depth: full-depth -> 'both', half-depth -> 'front'
 * @param _rackId - Target rack ID (ignored in v0.2)
 * @param deviceTypeSlug - Device type slug
 * @param position - U position (bottom of device)
 * @param face - Optional face assignment (auto-determined from depth if not specified)
 * @returns true if placed successfully, false otherwise
 */
function placeDevice(
  _rackId: string,
  deviceTypeSlug: string,
  position: number,
  face?: DeviceFace,
): boolean {
  // Delegate to recorded version for undo/redo support
  // Face is determined by placeDeviceRecorded based on device depth if not specified
  return placeDeviceRecorded(deviceTypeSlug, position, face);
}

/**
 * Move a device within the rack
 * Uses undo/redo support via moveDeviceRecorded
 * @param _rackId - Rack ID (ignored in v0.2)
 * @param deviceIndex - Index of device in rack's devices array
 * @param newPosition - New U position
 * @returns true if moved successfully, false otherwise
 */
function moveDevice(
  _rackId: string,
  deviceIndex: number,
  newPosition: number,
): boolean {
  // Delegate to recorded version for undo/redo support
  return moveDeviceRecorded(deviceIndex, newPosition);
}

/**
 * Move a device from one rack to another
 * In v0.2, this just delegates to moveDevice (single rack)
 */
function moveDeviceToRack(
  fromRackId: string,
  deviceIndex: number,
  toRackId: string,
  newPosition: number,
): boolean {
  // In v0.2, there's only one rack
  if (fromRackId !== toRackId) {
    debug.log("Cross-rack move blocked in single-rack mode");
    return false;
  }
  return moveDevice(fromRackId, deviceIndex, newPosition);
}

/**
 * Remove a device from the rack
 * Uses undo/redo support via removeDeviceRecorded
 * @param _rackId - Rack ID (ignored in v0.2)
 * @param deviceIndex - Index of device in rack's devices array
 */
function removeDeviceFromRack(_rackId: string, deviceIndex: number): void {
  // Delegate to recorded version for undo/redo support
  removeDeviceRecorded(deviceIndex);
}

/**
 * Update a device's face property
 * Uses undo/redo support via updateDeviceFaceRecorded
 * @param _rackId - Rack ID (ignored in v0.2)
 * @param deviceIndex - Index of device in rack's devices array
 * @param face - New face value
 */
function updateDeviceFace(
  _rackId: string,
  deviceIndex: number,
  face: DeviceFace,
): void {
  // Delegate to recorded version for undo/redo support
  updateDeviceFaceRecorded(deviceIndex, face);
}

/**
 * Update a device's custom display name
 * Uses undo/redo support via updateDeviceNameRecorded
 * @param _rackId - Rack ID (ignored in v0.2)
 * @param deviceIndex - Index of device in rack's devices array
 * @param name - New custom name (undefined or empty to clear)
 */
function updateDeviceName(
  _rackId: string,
  deviceIndex: number,
  name: string | undefined,
): void {
  // Delegate to recorded version for undo/redo support
  updateDeviceNameRecorded(deviceIndex, name);
}

/**
 * Update a device's placement image filename
 * @param _rackId - Rack ID (ignored in v0.2)
 * @param deviceIndex - Index of device in rack's devices array
 * @param face - Which face to update ('front' or 'rear')
 * @param filename - Image filename (undefined to clear)
 */
function updateDevicePlacementImage(
  _rackId: string,
  deviceIndex: number,
  face: "front" | "rear",
  filename: string | undefined,
): void {
  updateDevicePlacementImageRaw(deviceIndex, face, filename);
  isDirty = true;
}

/**
 * Update a device's colour override
 * @param _rackId - Rack ID (ignored in v0.2)
 * @param deviceIndex - Index of device in rack's devices array
 * @param colour - Hex colour string (undefined to clear and use device type colour)
 */
function updateDeviceColour(
  _rackId: string,
  deviceIndex: number,
  colour: string | undefined,
): void {
  updateDeviceColourRaw(deviceIndex, colour);
  isDirty = true;
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
// Raw Actions for Undo/Redo System
// These bypass dirty tracking and validation - used by the command pattern
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
 * Also removes any placed devices of this type
 * @param slug - Device type slug to remove
 */
function removeDeviceTypeRaw(slug: string): void {
  layout = {
    ...layout,
    device_types: layout.device_types.filter((dt) => dt.slug !== slug),
    rack: {
      ...layout.rack,
      devices: layout.rack.devices.filter((d) => d.device_type !== slug),
    },
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
 * @param device - Device to place
 * @returns Index where device was placed
 */
function placeDeviceRaw(device: PlacedDevice): number {
  const newDevices = [...layout.rack.devices, device];
  layout = {
    ...layout,
    rack: {
      ...layout.rack,
      devices: newDevices,
    },
  };
  return newDevices.length - 1;
}

/**
 * Remove a device at index directly (raw)
 * @param index - Device index to remove
 * @returns The removed device or undefined
 */
function removeDeviceAtIndexRaw(index: number): PlacedDevice | undefined {
  if (index < 0 || index >= layout.rack.devices.length) return undefined;

  const removed = layout.rack.devices[index];

  // Clean up placement-specific images for this device
  if (removed) {
    const imageStore = getImageStore();
    imageStore.removeAllDeviceImages(`placement-${removed.id}`);
  }

  layout = {
    ...layout,
    rack: {
      ...layout.rack,
      devices: layout.rack.devices.filter((_, i) => i !== index),
    },
  };
  return removed;
}

/**
 * Move a device directly (raw) - no collision checking
 * @param index - Device index
 * @param newPosition - New position
 * @returns true if moved
 */
function moveDeviceRaw(index: number, newPosition: number): boolean {
  if (index < 0 || index >= layout.rack.devices.length) return false;

  layout = {
    ...layout,
    rack: {
      ...layout.rack,
      devices: layout.rack.devices.map((d, i) =>
        i === index ? { ...d, position: newPosition } : d,
      ),
    },
  };
  return true;
}

/**
 * Update a device's face directly (raw)
 * @param index - Device index
 * @param face - New face value
 */
function updateDeviceFaceRaw(index: number, face: DeviceFace): void {
  if (index < 0 || index >= layout.rack.devices.length) return;

  layout = {
    ...layout,
    rack: {
      ...layout.rack,
      devices: layout.rack.devices.map((d, i) =>
        i === index ? { ...d, face } : d,
      ),
    },
  };
}

/**
 * Update a device's custom display name directly (raw)
 * @param index - Device index
 * @param name - New custom name (undefined to clear)
 */
function updateDeviceNameRaw(index: number, name: string | undefined): void {
  if (index < 0 || index >= layout.rack.devices.length) return;

  // Normalize empty string to undefined
  const normalizedName = name?.trim() || undefined;

  layout = {
    ...layout,
    rack: {
      ...layout.rack,
      devices: layout.rack.devices.map((d, i) =>
        i === index ? { ...d, name: normalizedName } : d,
      ),
    },
  };
}

/**
 * Update a device's placement image directly (raw)
 * @param index - Device index
 * @param face - Which face to update ('front' or 'rear')
 * @param filename - Image filename (undefined to clear)
 */
function updateDevicePlacementImageRaw(
  index: number,
  face: "front" | "rear",
  filename: string | undefined,
): void {
  if (index < 0 || index >= layout.rack.devices.length) return;

  // Sanitize filename to prevent path traversal attacks
  const sanitizedFilename = filename ? sanitizeFilename(filename) : undefined;

  // Update the appropriate field based on face
  const fieldName = face === "front" ? "front_image" : "rear_image";

  layout = {
    ...layout,
    rack: {
      ...layout.rack,
      devices: layout.rack.devices.map((d, i) =>
        i === index ? { ...d, [fieldName]: sanitizedFilename } : d,
      ),
    },
  };
}

/**
 * Update a device's colour override directly (raw)
 * @param index - Device index
 * @param colour - Hex colour string (undefined to clear and use device type colour)
 */
function updateDeviceColourRaw(
  index: number,
  colour: string | undefined,
): void {
  if (index < 0 || index >= layout.rack.devices.length) return;

  layout = {
    ...layout,
    rack: {
      ...layout.rack,
      devices: layout.rack.devices.map((d, i) =>
        i === index ? { ...d, colour_override: colour } : d,
      ),
    },
  };
}

/**
 * Get a device at a specific index
 * @param index - Device index
 * @returns The device or undefined
 */
function getDeviceAtIndex(index: number): PlacedDevice | undefined {
  return layout.rack.devices[index];
}

/**
 * Get all placed devices for a device type
 * @param slug - Device type slug
 * @returns Array of placed devices
 */
function getPlacedDevicesForType(slug: string): PlacedDevice[] {
  return layout.rack.devices.filter((d) => d.device_type === slug);
}

/**
 * Update rack settings directly (raw)
 * @param updates - Settings to update
 */
function updateRackRaw(updates: Partial<Omit<Rack, "devices" | "view">>): void {
  layout = {
    ...layout,
    rack: { ...layout.rack, ...updates },
  };
  // Sync layout name with rack name
  if (updates.name !== undefined) {
    layout = { ...layout, name: updates.name };
  }
}

/**
 * Replace the entire rack directly (raw)
 * @param newRack - New rack data
 */
function replaceRackRaw(newRack: Rack): void {
  layout = {
    ...layout,
    rack: newRack,
    name: newRack.name,
  };
}

/**
 * Clear all devices from the rack directly (raw)
 * @returns The removed devices
 */
function clearRackDevicesRaw(): PlacedDevice[] {
  const removed = [...layout.rack.devices];
  layout = {
    ...layout,
    rack: {
      ...layout.rack,
      devices: [],
    },
  };
  return removed;
}

/**
 * Restore devices to the rack directly (raw)
 * @param devices - Devices to restore
 */
function restoreRackDevicesRaw(devices: PlacedDevice[]): void {
  layout = {
    ...layout,
    rack: {
      ...layout.rack,
      devices: [...devices],
    },
  };
}

/**
 * Get all device type slugs currently in use
 * Includes both defined device types and placed device references
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

  // Add all placed device references (in case of orphaned references)
  for (const device of layout.rack.devices) {
    slugs.add(device.device_type);
  }

  return slugs;
}

// =============================================================================
// Command Store Adapter
// Creates an adapter that implements the command store interfaces
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
    updateDevicePlacementImageRaw,
    updateDeviceColourRaw,
    getDeviceAtIndex,

    // RackCommandStore
    updateRackRaw,
    replaceRackRaw,
    clearRackDevicesRaw,
    restoreRackDevicesRaw,
    getRack: () => layout.rack,
  };
}

// =============================================================================
// Recorded Actions (with Undo/Redo support)
// These create commands and execute them through the history system
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
 * Place a device with undo/redo support
 * Auto-imports brand pack devices if not already in device library
 * Face defaults based on device depth: full-depth -> 'both', half-depth -> 'front'
 * @returns true if placed successfully
 */
function placeDeviceRecorded(
  deviceTypeSlug: string,
  position: number,
  face?: DeviceFace,
): boolean {
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
      position,
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

  if (
    !canPlaceDevice(
      layout.rack,
      layout.device_types,
      deviceType.u_height,
      position,
      undefined,
      effectiveFace,
      isFullDepth,
    )
  ) {
    debug.devicePlace({
      slug: deviceTypeSlug,
      position,
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
    position,
    face: effectiveFace,
  };

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createPlaceDeviceCommand(device, adapter, deviceName);
  history.execute(command);
  isDirty = true;

  debug.devicePlace({
    slug: deviceTypeSlug,
    position,
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
 * @returns true if moved successfully
 */
function moveDeviceRecorded(deviceIndex: number, newPosition: number): boolean {
  if (deviceIndex < 0 || deviceIndex >= layout.rack.devices.length) {
    debug.deviceMove({
      index: deviceIndex,
      deviceName: "unknown",
      face: "unknown",
      fromPosition: -1,
      toPosition: newPosition,
      result: "not_found",
    });
    return false;
  }

  const device = layout.rack.devices[deviceIndex]!;
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  if (!deviceType) {
    debug.deviceMove({
      index: deviceIndex,
      deviceName: device.device_type,
      face: device.face ?? "front",
      fromPosition: device.position,
      toPosition: newPosition,
      result: "not_found",
    });
    return false;
  }

  const deviceName = deviceType.model ?? deviceType.slug;
  const oldPosition = device.position;

  // Use canPlaceDevice for bounds and collision checking (face and depth aware)
  const isFullDepth = deviceType.is_full_depth !== false;
  if (
    !canPlaceDevice(
      layout.rack,
      layout.device_types,
      deviceType.u_height,
      newPosition,
      deviceIndex,
      device.face,
      isFullDepth,
    )
  ) {
    // Determine if it's out of bounds or collision
    const isOutOfBounds =
      newPosition < 1 ||
      newPosition + deviceType.u_height - 1 > layout.rack.height;
    debug.deviceMove({
      index: deviceIndex,
      deviceName,
      face: device.face ?? "front",
      fromPosition: oldPosition,
      toPosition: newPosition,
      result: isOutOfBounds ? "out_of_bounds" : "collision",
    });
    return false;
  }

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createMoveDeviceCommand(
    deviceIndex,
    oldPosition,
    newPosition,
    adapter,
    deviceName,
  );
  history.execute(command);
  isDirty = true;

  debug.deviceMove({
    index: deviceIndex,
    deviceName,
    face: device.face ?? "front",
    fromPosition: oldPosition,
    toPosition: newPosition,
    result: "success",
  });

  return true;
}

/**
 * Remove a device with undo/redo support
 */
function removeDeviceRecorded(deviceIndex: number): void {
  if (deviceIndex < 0 || deviceIndex >= layout.rack.devices.length) return;

  const device = layout.rack.devices[deviceIndex]!;
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
 */
function updateDeviceFaceRecorded(deviceIndex: number, face: DeviceFace): void {
  if (deviceIndex < 0 || deviceIndex >= layout.rack.devices.length) return;

  const device = layout.rack.devices[deviceIndex]!;
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
 */
function updateDeviceNameRecorded(
  deviceIndex: number,
  name: string | undefined,
): void {
  if (deviceIndex < 0 || deviceIndex >= layout.rack.devices.length) return;

  const device = layout.rack.devices[deviceIndex]!;
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
 * Update rack settings with undo/redo support
 */
function updateRackRecorded(
  updates: Partial<Omit<Rack, "devices" | "view">>,
): void {
  // Capture before state
  const before: Partial<Omit<Rack, "devices" | "view">> = {};
  for (const key of Object.keys(updates) as (keyof Omit<
    Rack,
    "devices" | "view"
  >)[]) {
    before[key] = layout.rack[key] as never;
  }

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter();

  const command = createUpdateRackCommand(before, updates, adapter);
  history.execute(command);
  isDirty = true;
}

/**
 * Clear rack devices with undo/redo support
 */
function clearRackRecorded(): void {
  if (layout.rack.devices.length === 0) return;

  const devices = [...layout.rack.devices];
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
