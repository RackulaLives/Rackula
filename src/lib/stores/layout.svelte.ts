/**
 * Layout Store
 * Central state management for the application using Svelte 5 runes
 *
 * This is the facade that owns the reactive $state and delegates to
 * extracted domain modules via the LayoutStateAccess bridge pattern.
 */

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
import { createLayout } from "$lib/utils/serialization";
import type { CreateDeviceTypeInput } from "$lib/stores/layout-helpers";
import { debug } from "$lib/utils/debug";
import {
  createHistoryStore,
  getHistoryStore,
  type HistoryStore,
} from "./history.svelte";
import type { LayoutStateAccess } from "./layout/types";
import {
  type BackupState,
  HAS_STARTED_KEY,
  loadHasStarted,
  saveHasStarted,
} from "./layout/persistence";
import {
  createNewLayout as createNewLayoutImpl,
  loadLayout as loadLayoutImpl,
} from "./layout/layout-lifecycle";
import {
  getUsedDeviceTypeSlugs as getUsedDeviceTypeSlugsImpl,
  getUnusedCustomDeviceTypes as getUnusedCustomDeviceTypesImpl,
  isCustomDeviceType as isCustomDeviceTypeImpl,
  hasDeviceTypePlacements as hasDeviceTypePlacementsImpl,
} from "./layout/queries";
import {
  addRack as addRackImpl,
  addBayedRackGroup as addBayedRackGroupImpl,
  updateRack as updateRackImpl,
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
} from "./layout/mutators";
import {
  addDeviceTypeRecorded as addDeviceTypeRecordedImpl,
  updateDeviceTypeRecorded as updateDeviceTypeRecordedImpl,
  deleteDeviceTypeRecorded as deleteDeviceTypeRecordedImpl,
  deleteMultipleDeviceTypesRecorded as deleteMultipleDeviceTypesRecordedImpl,
} from "./layout/recorded-device-type-actions";
import {
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
} from "./layout/recorded-device-actions";
import {
  updateRackRecorded as updateRackRecordedImpl,
  updateRacksBatchRecorded as updateRacksBatchRecordedImpl,
  clearRackRecorded as clearRackRecordedImpl,
} from "./layout/recorded-rack-actions";
import {
  duplicateDevice as duplicateDeviceImpl,
  placeInContainer as placeInContainerImpl,
  moveDeviceToRack as moveDeviceToRackImpl,
} from "./layout/device-actions";

export { type BackupState, HAS_STARTED_KEY };

/**
 * Create a layout store instance with its own reactive state and undo/redo
 * history.
 *
 * The module keeps an active instance (see getLayoutStore) so existing call
 * sites keep working against one layout per app session. Independent instances
 * each own their state and history, which the multi-layout workspace (#2017)
 * will use to open layouts as tabs.
 */
export function createLayoutStore(
  history: HistoryStore = createHistoryStore(),
) {
  // Instance state (using $state rune)
  let layout = $state<Layout>(createLayout());
  let isDirty = $state(false);
  let changesSinceExport = $state(0);
  let hasEverExported = $state(false);
  let hasStarted = $state(loadHasStarted());
  let activeRackId = $state<string | null>(null);

  // Derived values (using $derived rune)
  const racks = $derived(layout.racks);
  const device_types = $derived(layout.device_types);
  const rack_groups = $derived(layout.rack_groups ?? []);

  /**
   * State access bridge for extracted domain modules.
   * Provides read/write access to this instance's reactive state and history
   * without exposing the $state variables directly to the extracted modules.
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
    markDirty,
    markStarted: () => {
      hasStarted = true;
      saveHasStarted(true);
    },
    resetBackupTracking: () => {
      isDirty = false;
      changesSinceExport = 0;
      hasEverExported = false;
    },
    getRackGroups: () => rack_groups,
    findRack: (id: string) => layout.racks.find((r) => r.id === id),
    findRackIndex: (id: string) => layout.racks.findIndex((r) => r.id === id),
    getHistory: () => history,
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
  // Total devices across all racks
  const totalDeviceCount = $derived(
    layout.racks.reduce((sum, r) => sum + r.devices.length, 0),
  );

  /**
   * Reset this instance to initial state: a fresh layout with an empty
   * undo/redo history. The history is this instance's own, so resetting the
   * layout discards the commands that referenced the old one.
   * @param clearStarted - If true, also clears the hasStarted flag (default: true)
   */
  function resetLayout(clearStarted: boolean = true): void {
    layout = createLayout();
    isDirty = false;
    changesSinceExport = 0;
    hasEverExported = false;
    activeRackId = null;
    history.clear();
    if (clearStarted) {
      hasStarted = false;
      saveHasStarted(false);
    }
  }

  // Public store surface: getters over reactive state + bound actions.
  return {
    // State getters
    get layout() {
      return layout;
    },
    get isDirty() {
      return isDirty;
    },
    get changesSinceExport() {
      return changesSinceExport;
    },
    get hasEverExported() {
      return hasEverExported;
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
    resetLayout,
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
    markExported,
    restoreBackupState,

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
      return history.canUndo;
    },
    get canRedo() {
      return history.canRedo;
    },
    get undoDescription() {
      return history.undoDescription;
    },
    get redoDescription() {
      return history.redoDescription;
    },
  };

  // =============================================================================
  // Layout Actions — delegated to layout/layout-lifecycle.ts
  // =============================================================================

  function createNewLayout(name: string): void {
    createNewLayoutImpl(stateAccess, name);
  }

  function loadLayout(layoutData: Layout): void {
    loadLayoutImpl(stateAccess, layoutData);
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
    return addRackImpl(
      stateAccess,
      name,
      height,
      width,
      form_factor,
      desc_units,
      starting_unit,
    );
  }

  function addBayedRackGroup(
    groupName: string,
    bayCount: 2 | 3,
    height: number,
    width: Rack["width"] = 19,
  ) {
    return addBayedRackGroupImpl(
      stateAccess,
      groupName,
      bayCount,
      height,
      width,
    );
  }

  function updateRack(id: string, updates: Partial<Rack>): void {
    updateRackImpl(
      stateAccess,
      id,
      updates,
      updateRackRecorded,
      updateRacksBatchRecorded,
    );
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

  function createRackGroup(
    name: string,
    rackIds: string[],
    preset?: LayoutPreset,
  ) {
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
  // Device Actions — delegated to layout/device-actions.ts
  // =============================================================================

  /**
   * Duplicate a placed device within a rack
   * @param rackId - Rack ID containing the device
   * @param deviceIndex - Index of the device in rack's devices array
   * @returns The duplicated device or error message
   */
  function duplicateDevice(
    rackId: string,
    deviceIndex: number,
  ): { error?: string; device?: PlacedDevice } {
    // $state.snapshot() is a Svelte rune — must be called from this .svelte.ts file
    return duplicateDeviceImpl(stateAccess, rackId, deviceIndex, (device) =>
      $state.snapshot(device),
    );
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
   */
  function placeInContainer(
    rackId: string,
    deviceTypeSlug: string,
    containerId: string,
    slotId: string,
    position: number,
  ): boolean {
    return placeInContainerImpl(
      stateAccess,
      rackId,
      deviceTypeSlug,
      containerId,
      slotId,
      position,
    );
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
    face?: DeviceFace,
  ): boolean {
    return moveDeviceRecorded(
      rackId,
      deviceIndex,
      newPosition,
      slotPosition,
      face,
    );
  }

  /**
   * Move a device from one rack to another
   * Supports both within-rack moves (delegates to moveDevice) and cross-rack moves.
   */
  function moveDeviceToRack(
    fromRackId: string,
    deviceIndex: number,
    toRackId: string,
    newPosition: number,
    face?: DeviceFace,
    slotPosition?: SlotPosition,
  ): boolean {
    // $state.snapshot() is a Svelte rune — must be called from this .svelte.ts file
    return moveDeviceToRackImpl(
      stateAccess,
      fromRackId,
      deviceIndex,
      toRackId,
      newPosition,
      face,
      slotPosition,
      (device) => $state.snapshot(device),
    );
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
    changesSinceExport += 1;
  }

  /**
   * Mark the layout as having unsaved changes without incrementing the
   * changes-since-export counter. The counter tracks edit operations made
   * since the last export; undo/redo revert or re-apply edits that were
   * already counted, so they do not add to it.
   */
  function markDirtyWithoutCounting(): void {
    isDirty = true;
  }

  function markClean(): void {
    isDirty = false;
  }

  /**
   * Record a successful file export: the working copy now matches a file
   * backup, so the changes-since-export counter resets.
   */
  function markExported(): void {
    changesSinceExport = 0;
    hasEverExported = true;
  }

  /**
   * Restore backup state persisted in the session blob (used when a
   * localStorage session is restored on startup).
   */
  function restoreBackupState(state: BackupState): void {
    changesSinceExport = state.changesSinceExport;
    hasEverExported = state.hasEverExported;
  }

  function markStarted(): void {
    hasStarted = true;
    saveHasStarted(true);
  }

  /**
   * Update the display mode in layout settings
   */
  function updateDisplayMode(mode: DisplayMode): void {
    if (layout.settings.display_mode === mode) return;
    layout = {
      ...layout,
      settings: { ...layout.settings, display_mode: mode },
    };
    markDirty();
  }

  /**
   * Update the showLabelsOnImages setting
   */
  function updateShowLabelsOnImages(value: boolean): void {
    if (layout.settings.show_labels_on_images === value) return;
    layout = {
      ...layout,
      settings: { ...layout.settings, show_labels_on_images: value },
    };
    markDirty();
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

  function updateDeviceTypeRaw(
    slug: string,
    updates: Partial<DeviceType>,
  ): void {
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
    updateDevicePlacementImageRawImpl(
      stateAccess,
      rackId,
      index,
      face,
      filename,
    );
  }

  function updateDeviceColourRaw(
    index: number,
    colour: string | undefined,
  ): void {
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

  function updateRackRaw(
    updates: Partial<Omit<Rack, "devices" | "view">>,
  ): void {
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

  function updateCableRaw(
    id: string,
    updates: Partial<Omit<Cable, "id">>,
  ): void {
    updateCableRawImpl(stateAccess, id, updates);
  }

  function removeCableRaw(id: string): void {
    removeCableRawImpl(stateAccess, id);
  }

  function removeCablesRaw(ids: Set<string>): void {
    removeCablesRawImpl(stateAccess, ids);
  }

  // =============================================================================
  // Utility Functions — delegated to layout/queries.ts
  // =============================================================================

  function getUsedDeviceTypeSlugs(): Set<string> {
    return getUsedDeviceTypeSlugsImpl(stateAccess);
  }

  function getUnusedCustomDeviceTypes(): DeviceType[] {
    return getUnusedCustomDeviceTypesImpl(stateAccess);
  }

  function isCustomDeviceType(slug: string): boolean {
    return isCustomDeviceTypeImpl(slug);
  }

  function hasDeviceTypePlacements(slug: string): boolean {
    return hasDeviceTypePlacementsImpl(stateAccess, slug);
  }

  // =============================================================================
  // Recorded Actions — delegated to layout/recorded-device-type-actions.ts,
  // layout/recorded-device-actions.ts, and layout/recorded-rack-actions.ts
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
    newFace?: DeviceFace,
  ): boolean {
    return moveDeviceRecordedImpl(
      stateAccess,
      rackId,
      deviceIndex,
      newPositionU,
      newSlotPosition,
      newFace,
    );
  }

  function removeDeviceRecorded(rackId: string, deviceIndex: number): void {
    // $state.snapshot() is a Svelte rune — must be called from this .svelte.ts file
    removeDeviceRecordedImpl(stateAccess, rackId, deviceIndex, (device) =>
      $state.snapshot(device),
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

  function updateRacksBatchRecorded(
    targets: {
      rackId: string;
      updates: Partial<Omit<Rack, "devices" | "view">>;
    }[],
    description: string,
  ): void {
    updateRacksBatchRecordedImpl(stateAccess, targets, description);
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
    const result = history.undo();
    if (result) {
      markDirtyWithoutCounting();
    }
    return result;
  }

  /**
   * Redo the last undone action
   * @returns true if redo was performed
   */
  function redo(): boolean {
    const result = history.redo();
    if (result) {
      markDirtyWithoutCounting();
    }
    return result;
  }

  /**
   * Clear all undo/redo history
   */
  function clearHistory(): void {
    history.clear();
  }

  // Close createLayoutStore.
}

/**
 * Type alias for the layout store instance returned by createLayoutStore.
 */
export type LayoutStore = ReturnType<typeof createLayoutStore>;

// Active instance for the app session (one layout open at a time).
const activeInstance = createLayoutStore(getHistoryStore());

/**
 * Get access to the active layout store.
 * @returns Store object with state and actions
 */
export function getLayoutStore(): LayoutStore {
  return activeInstance;
}

/**
 * Reset the active layout store to initial state (primarily for testing).
 * @param clearStarted - If true, also clears the hasStarted flag (default: true)
 */
export function resetLayoutStore(clearStarted: boolean = true): void {
  activeInstance.resetLayout(clearStarted);
}
