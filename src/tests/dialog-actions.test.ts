/**
 * dialog-actions behavioural tests
 *
 * Covers the handleDelete() seam that wires the mobile remove-confirm flow.
 * The critical invariant: dialogStore.open() closes any open sheet so dialogs
 * always render without a sheet underneath them. This prevents the mobile
 * device-details bottom sheet from occluding the confirm dialog (#2490).
 *
 * Also covers handleNewRack(), which creates a 24U rack directly on the canvas
 * and selects it instead of opening the New Rack wizard (#2732).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { handleDelete, handleNewRack } from "$lib/utils/dialog-actions";
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
    expect(dialogStore.isOpen("newRack")).toBe(false);
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
