import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  getLayoutStore,
  HAS_STARTED_KEY,
  resetLayoutStore,
} from "$lib/stores/layout.svelte";
import { getHistoryStore, resetHistoryStore } from "$lib/stores/history.svelte";

/**
 * Compile-time API contract for the public LayoutStore surface.
 * This tuple is intentionally type-level only (not a runtime Object.keys assertion):
 * - catches accidental API additions/removals via TypeScript key comparisons
 * - stays literal because it is declared as const
 * Update this list when adding or removing public members on getLayoutStore().
 */
const _EXPECTED_LAYOUT_STORE_KEYS = [
  "activeRack",
  "activeRackId",
  "addBayToGroup",
  "addBayedRackGroup",
  "addCableRaw",
  "addDeviceType",
  "addDeviceTypeRaw",
  "addDeviceTypeRecorded",
  "addRack",
  "addRackToGroup",
  "canAddRack",
  "canRedo",
  "canUndo",
  "clearHistory",
  "clearRackDevicesRaw",
  "clearRackRecorded",
  "createNewLayout",
  "createRackGroup",
  "createRackGroupRaw",
  "deleteDeviceType",
  "deleteDeviceTypeRecorded",
  "deleteMultipleDeviceTypesRecorded",
  "deleteRack",
  "deleteRackGroup",
  "deleteRackGroupRaw",
  "device_types",
  "duplicateDevice",
  "duplicateRack",
  "getDeviceAtIndex",
  "getPlacedDevicesForType",
  "getRackById",
  "getRackGroupById",
  "getRackGroupForRack",
  "getUnusedCustomDeviceTypes",
  "getUsedDeviceTypeSlugs",
  "hasDeviceTypePlacements",
  "hasRack",
  "hasStarted",
  "isCustomDeviceType",
  "isDirty",
  "layout",
  "loadLayout",
  "markClean",
  "markDirty",
  "markStarted",
  "moveDevice",
  "moveDeviceRaw",
  "moveDeviceRecorded",
  "moveDeviceToRack",
  "placeDevice",
  "placeDeviceRaw",
  "placeDeviceRecorded",
  "placeInContainer",
  "rack",
  "rackCount",
  "rack_groups",
  "racks",
  "redo",
  "redoDescription",
  "removeBayFromGroup",
  "removeCableRaw",
  "removeCablesRaw",
  "removeDeviceAtIndexRaw",
  "removeDeviceFromRack",
  "removeDeviceRecorded",
  "removeDeviceTypeRaw",
  "removeRackFromGroup",
  "reorderRacks",
  "reorderRacksInGroup",
  "replaceRackRaw",
  "resetLayout",
  "restoreRackDevicesRaw",
  "setActiveRack",
  "setBayCount",
  "totalDeviceCount",
  "undo",
  "undoDescription",
  "updateCableRaw",
  "updateDeviceColour",
  "updateDeviceColourRaw",
  "updateDeviceColourRecorded",
  "updateDeviceFace",
  "updateDeviceFaceRaw",
  "updateDeviceFaceRecorded",
  "updateDeviceIp",
  "updateDeviceName",
  "updateDeviceNameRaw",
  "updateDeviceNameRecorded",
  "updateDeviceNotes",
  "updateDevicePlacementImage",
  "updateDevicePlacementImageRaw",
  "updateDevicePlacementImageRecorded",
  "updateDeviceSlotPosition",
  "updateDeviceType",
  "updateDeviceTypeRaw",
  "updateDeviceTypeRecorded",
  "updateDisplayMode",
  "updateRack",
  "updateRackGroup",
  "updateRackGroupRaw",
  "updateRackRaw",
  "updateRackRecorded",
  "updateRackView",
  "updateShowLabelsOnImages",
] as const;

type LayoutStoreContract = ReturnType<typeof getLayoutStore>;
type ExpectedLayoutStoreKey = (typeof _EXPECTED_LAYOUT_STORE_KEYS)[number];
type MissingFromExpected = Exclude<
  keyof LayoutStoreContract,
  ExpectedLayoutStoreKey
>;
type ExtraInExpected = Exclude<ExpectedLayoutStoreKey, keyof LayoutStoreContract>;

describe("Layout Store Contract", () => {
  beforeEach(() => {
    localStorage.removeItem(HAS_STARTED_KEY);
    resetHistoryStore();
    resetLayoutStore();
  });

  it("matches the documented public API key contract at type level", () => {
    expectTypeOf<MissingFromExpected>().toEqualTypeOf<never>();
    expectTypeOf<ExtraInExpected>().toEqualTypeOf<never>();
  });

  it("shares state across getLayoutStore() calls", () => {
    const storeA = getLayoutStore();
    const storeB = getLayoutStore();

    const rack = storeA.addRack("Contract Rack", 42);
    expect(rack).not.toBeNull();
    expect(storeB.racks.some((r) => r.id === rack!.id)).toBe(true);

    storeB.updateDisplayMode("image");
    expect(storeA.layout.settings.display_mode).toBe("image");
  });

  it("respects resetLayoutStore(clearStarted) semantics", () => {
    const store = getLayoutStore();
    store.markStarted();
    store.addRack("Reset Rack", 42);
    store.markDirty();
    expect(store.hasStarted).toBe(true);

    resetLayoutStore(false);
    const afterPartialReset = getLayoutStore();
    expect(afterPartialReset.hasStarted).toBe(true);
    expect(afterPartialReset.racks).toEqual([]);
    expect(afterPartialReset.isDirty).toBe(false);

    resetLayoutStore();
    const afterFullReset = getLayoutStore();
    expect(afterFullReset.hasStarted).toBe(false);
  });

  it("integrates layout actions with undo/redo history behavior", () => {
    const store = getLayoutStore();
    const history = getHistoryStore();
    const rackName = "History Rack";

    expect(store.racks).toEqual([]);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
    expect(history.canUndo).toBe(false);

    const rack = store.addRack(rackName, 42);
    expect(rack).not.toBeNull();
    expect(store.racks.some((r) => r.id === rack!.id && r.name === rackName)).toBe(
      true,
    );
    expect(store.canUndo).toBe(true);
    expect(history.canUndo).toBe(true);

    store.undo();
    expect(store.racks.some((r) => r.id === rack!.id)).toBe(false);
    expect(store.canRedo).toBe(true);
    expect(history.canRedo).toBe(true);

    store.redo();
    expect(store.racks.some((r) => r.id === rack!.id && r.name === rackName)).toBe(
      true,
    );
  });
});
