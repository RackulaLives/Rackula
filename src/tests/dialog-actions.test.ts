/**
 * dialog-actions behavioural tests
 *
 * Covers the handleDelete() seam that wires the mobile remove-confirm flow.
 * The critical invariant: dialogStore.open() closes any open sheet so dialogs
 * always render without a sheet underneath them. This prevents the mobile
 * device-details bottom sheet from occluding the confirm dialog (#2490).
 *
 * Also covers handleNewRack(), which creates a 24U rack directly on the canvas
 * and selects it (#2732). The New Rack wizard was removed in #2747, so no entry
 * point opens a dialog to create a rack.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  handleDelete,
  handleConfirmDelete,
  handleNewRack,
} from "$lib/utils/dialog-actions";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { createTestDeviceType } from "./factories";

function resetAll() {
  resetLayoutStore();
  resetSelectionStore();
  dialogStore.close();
  dialogStore.closeSheet();
}

/** Place one device in a new rack and select it. Returns rackId and device id. */
function placeAndSelectDevice() {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();

  const rack = layoutStore.addRack("Test Rack", 42);
  if (!rack) throw new Error("addRack returned null");

  const dt = createTestDeviceType({ slug: "test-server", u_height: 1 });
  layoutStore.addDeviceTypeRaw(dt);

  const ok = layoutStore.placeDevice(rack.id, dt.slug, 10, "front");
  if (!ok) throw new Error("placeDevice failed");

  const placed = layoutStore.getRackById(rack.id)!.devices[0]!;
  selectionStore.selectDevice(rack.id, placed.id);

  return { rackId: rack.id, deviceId: placed.id };
}

describe("handleDelete", () => {
  beforeEach(resetAll);

  it("opens the confirmDelete dialog when a device is selected", () => {
    placeAndSelectDevice();
    expect(dialogStore.isOpen("confirmDelete")).toBe(false);

    handleDelete();

    expect(dialogStore.isOpen("confirmDelete")).toBe(true);
  });

  it("sets deleteTarget to device type when a device is selected", () => {
    placeAndSelectDevice();

    handleDelete();

    expect(dialogStore.deleteTarget).toMatchObject({ type: "device" });
  });

  it("closes any open sheet when opening the confirm dialog (dialogStore.open invariant)", () => {
    placeAndSelectDevice();
    // Simulate the state that exists when Remove is tapped from the mobile
    // device-details bottom sheet: the sheet is open and the device is selected.
    dialogStore.openSheet("deviceDetails", 0);
    expect(dialogStore.isSheetOpen("deviceDetails")).toBe(true);

    handleDelete();

    // dialogStore.open() closes any open sheet as a built-in invariant (#2490).
    expect(dialogStore.isSheetOpen("deviceDetails")).toBe(false);
    expect(dialogStore.isOpen("confirmDelete")).toBe(true);
  });

  it("does nothing when no device or rack is selected", () => {
    // No selection: handleDelete should be a no-op.
    handleDelete();

    expect(dialogStore.isOpen("confirmDelete")).toBe(false);
    expect(dialogStore.deleteTarget).toBeNull();
  });
});

describe("handleConfirmDelete", () => {
  beforeEach(resetAll);

  // #2918: deleteTarget must snapshot rackId/deviceId at open time and act on
  // that snapshot, not the live selectionStore, so a selection change between
  // opening the dialog and confirming can't delete a different object than the
  // one named in the dialog (async/programmatic/mobile paths).
  it("deletes exactly the device named in the dialog, even if selection moves to a different device before confirm", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    const { rackId, deviceId: namedDeviceId } = placeAndSelectDevice();

    handleDelete();
    expect(dialogStore.deleteTarget).toMatchObject({ type: "device" });

    // Selection moves to a different device after the dialog opened but
    // before it's confirmed.
    const dt2 = createTestDeviceType({ slug: "test-server-2", u_height: 1 });
    layoutStore.addDeviceTypeRaw(dt2);
    const placed = layoutStore.placeDevice(rackId, dt2.slug, 20, "front");
    expect(placed).toBe(true);
    const otherDevice = layoutStore
      .getRackById(rackId)!
      .devices.find((d) => d.device_type === dt2.slug)!;
    selectionStore.selectDevice(rackId, otherDevice.id);

    handleConfirmDelete();

    const rack = layoutStore.getRackById(rackId)!;
    expect(rack.devices.some((d) => d.id === namedDeviceId)).toBe(false);
    expect(rack.devices.some((d) => d.id === otherDevice.id)).toBe(true);
  });

  // #2918 hardening: the device is identified by a stable id, not a captured
  // array index, so a reorder that shifts the named device's index between
  // open and confirm (here: a device removed above it) still deletes exactly
  // the named device and nothing else.
  it("deletes exactly the device named in the dialog even if its array index shifts before confirm", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    const rack = layoutStore.addRack("Test Rack", 42);
    if (!rack) throw new Error("addRack returned null");

    const dt = createTestDeviceType({ slug: "test-server", u_height: 1 });
    layoutStore.addDeviceTypeRaw(dt);

    // Two devices: "above" is placed first (array index 0), "named" second
    // (array index 1). placeDeviceRaw appends, so this order is deterministic.
    expect(layoutStore.placeDevice(rack.id, dt.slug, 5, "front")).toBe(true);
    expect(layoutStore.placeDevice(rack.id, dt.slug, 10, "front")).toBe(true);
    const devicesAtOpen = layoutStore.getRackById(rack.id)!.devices;
    const aboveDeviceId = devicesAtOpen[0]!.id;
    const namedDeviceId = devicesAtOpen[1]!.id;

    selectionStore.selectDevice(rack.id, namedDeviceId);
    handleDelete();
    expect(dialogStore.deleteTarget).toMatchObject({ type: "device" });

    // Remove the device above the named one, shifting the named device from
    // index 1 to index 0 after the dialog opened but before confirm.
    layoutStore.removeDeviceFromRack(rack.id, 0);
    expect(
      layoutStore
        .getRackById(rack.id)!
        .devices.some((d) => d.id === namedDeviceId),
    ).toBe(true);

    handleConfirmDelete();

    const after = layoutStore.getRackById(rack.id)!.devices;
    // A stale-index delete would have removed index 1 (now out of bounds, a
    // silent no-op) and left the named device in place; id resolution removes
    // exactly the named device.
    expect(after.some((d) => d.id === namedDeviceId)).toBe(false);
    expect(after.some((d) => d.id === aboveDeviceId)).toBe(false);
    expect(after.length).toBe(0);
  });

  it("deletes exactly the rack named in the dialog, even if selection moves to a different rack before confirm", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    const rackA = layoutStore.addRack("Rack A", 12);
    const rackB = layoutStore.addRack("Rack B", 12);
    if (!rackA || !rackB) throw new Error("addRack returned null");
    selectionStore.selectRack(rackA.id);

    handleDelete();
    expect(dialogStore.deleteTarget).toMatchObject({
      type: "rack",
      name: "Rack A",
    });

    // Selection moves to a different rack after the dialog opened but
    // before it's confirmed.
    selectionStore.selectRack(rackB.id);

    handleConfirmDelete();

    expect(layoutStore.getRackById(rackA.id)).toBeUndefined();
    expect(layoutStore.getRackById(rackB.id)).toBeDefined();
  });
});

describe("handleNewRack", () => {
  beforeEach(resetAll);

  it("creates a 24U rack and selects it, without opening the wizard", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const beforeIds = new Set(layoutStore.racks.map((rack) => rack.id));

    handleNewRack();

    const created = layoutStore.racks.find((rack) => !beforeIds.has(rack.id));
    expect(created).toBeDefined();
    expect(created?.height).toBe(24);
    expect(selectionStore.isRackSelected).toBe(true);
    expect(selectionStore.selectedRackId).toBe(created?.id);
    // No dialog is opened: the New Rack wizard was removed in #2747, so the
    // create path never opens a dialog.
    expect(dialogStore.openDialog).toBeNull();
  });

  it("applies stage-1 defaults (width 19, ascending U-numbering)", () => {
    const layoutStore = getLayoutStore();
    const beforeIds = new Set(layoutStore.racks.map((rack) => rack.id));

    handleNewRack();

    const created = layoutStore.racks.find((rack) => !beforeIds.has(rack.id));
    expect(created).toBeDefined();
    expect(created?.width).toBe(19);
    expect(created?.desc_units).toBe(false);
  });

  it("undo removes the rack it created", () => {
    const layoutStore = getLayoutStore();
    const beforeIds = new Set(layoutStore.racks.map((rack) => rack.id));

    handleNewRack();
    const created = layoutStore.racks.find((rack) => !beforeIds.has(rack.id));
    expect(created).toBeDefined();

    layoutStore.undo();

    expect(layoutStore.racks.some((rack) => rack.id === created?.id)).toBe(
      false,
    );
  });
});

describe("zero-rack add-rack affordance", () => {
  beforeEach(resetAll);

  // The zero-rack canvas shows an inline "Add a rack" affordance whose button
  // routes through the same handleNewRack() path as the "+" toolbar action
  // (#2831). This covers the last-rack-deleted case: an emptied layout is never
  // a dead end because the affordance re-adds a rack.
  it("re-adds a rack after the last rack is deleted", () => {
    const layoutStore = getLayoutStore();

    const rack = layoutStore.addRack("Only Rack", 24);
    if (!rack) throw new Error("addRack returned null");
    expect(layoutStore.rackCount).toBe(1);

    // Deleting the last rack drives rackCount to 0, which is what surfaces the
    // affordance (Canvas renders it when rackCount === 0).
    layoutStore.deleteRack(rack.id);
    expect(layoutStore.rackCount).toBe(0);

    // The affordance's action adds a rack back.
    handleNewRack();
    expect(layoutStore.rackCount).toBe(1);
  });
});
