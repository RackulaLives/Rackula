/**
 * dialog-actions behavioural tests
 *
 * Covers the handleDelete() seam that wires the mobile remove-confirm flow.
 * The critical invariant: dialogStore.open() closes any open sheet so dialogs
 * always render without a sheet underneath them. This prevents the mobile
 * device-details bottom sheet from occluding the confirm dialog (#2490).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { handleDelete } from "$lib/utils/dialog-actions";
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
