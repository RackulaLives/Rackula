/**
 * Pointer placement completion (#2992).
 *
 * A successful click/tap-to-place placement must give sighted users a visible
 * confirmation beyond the aria-live announcement: the placed device becomes
 * the selection (so the rack highlight and edit panel reflect it) and
 * placement mode ends. A failed placement leaves the mode armed for a retry
 * and the selection untouched.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import {
  getPlacementStore,
  resetPlacementStore,
} from "$lib/stores/placement.svelte";
import { completePointerPlacement } from "$lib/utils/placement-completion";
import { toInternalUnits } from "$lib/utils/position";
import { CATEGORY_COLOURS } from "$lib/types/constants";

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
  resetSelectionStore();
  resetPlacementStore();
});

function setup(height = 12) {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const placementStore = getPlacementStore();
  const rack = layoutStore.addRack("Rack 1", height);
  if (!rack) throw new Error("addRack failed");
  return { layoutStore, selectionStore, placementStore, rack };
}

describe("completePointerPlacement — visible confirmation (#2992)", () => {
  it("selects the newly placed device and ends placement mode", () => {
    const { layoutStore, selectionStore, placementStore, rack } = setup();
    const dt = layoutStore.addDeviceType({
      name: "Server",
      u_height: 1,
      category: "server",
      colour: CATEGORY_COLOURS.server,
      slot_width: 2,
    });
    placementStore.startPlacement(dt);

    const ok = completePointerPlacement(
      { layoutStore, selectionStore, placementStore },
      rack.id,
      dt,
      5,
      "front",
    );

    expect(ok).toBe(true);
    const placed = layoutStore
      .getRackById(rack.id)!
      .devices.find((d) => d.device_type === dt.slug);
    expect(placed).toBeDefined();
    expect(selectionStore.selectedType).toBe("device");
    expect(selectionStore.selectedDeviceId).toBe(placed!.id);
    expect(placementStore.isPlacing).toBe(false);
    // The aria-live announcement must remain (and name the landing slot).
    expect(placementStore.placementAnnouncement).toContain("Placed");
    expect(placementStore.placementAnnouncement).toContain("U5");
  });

  it("selects the placed device, not an older sibling of the same type", () => {
    const { layoutStore, selectionStore, placementStore, rack } = setup();
    const dt = layoutStore.addDeviceType({
      name: "Server",
      u_height: 1,
      category: "server",
      colour: CATEGORY_COLOURS.server,
      slot_width: 2,
    });
    // An earlier placement of the same device type at U3.
    layoutStore.placeDevice(rack.id, dt.slug, 3, "front");
    placementStore.startPlacement(dt);

    const ok = completePointerPlacement(
      { layoutStore, selectionStore, placementStore },
      rack.id,
      dt,
      7,
      "front",
    );

    expect(ok).toBe(true);
    const placedAtSeven = layoutStore
      .getRackById(rack.id)!
      .devices.find(
        (d) => d.device_type === dt.slug && d.position === toInternalUnits(7),
      );
    expect(placedAtSeven).toBeDefined();
    expect(selectionStore.selectedDeviceId).toBe(placedAtSeven!.id);
  });

  it("selects the placed sub-U child, not its synthesised carrier", () => {
    const { layoutStore, selectionStore, placementStore, rack } = setup();
    const dt = layoutStore.addDeviceType({
      name: "Mini PC",
      u_height: 1,
      category: "server",
      colour: CATEGORY_COLOURS.server,
      slot_width: 1,
    });
    placementStore.startPlacement(dt);

    const ok = completePointerPlacement(
      { layoutStore, selectionStore, placementStore },
      rack.id,
      dt,
      5,
      "front",
    );

    expect(ok).toBe(true);
    const child = layoutStore
      .getRackById(rack.id)!
      .devices.find((d) => d.device_type === dt.slug);
    expect(child?.container_id).toBeTruthy();
    expect(selectionStore.selectedDeviceId).toBe(child!.id);
  });

  it("leaves the mode armed and the selection untouched on a failed placement", () => {
    const { layoutStore, selectionStore, placementStore, rack } = setup();
    const dt = layoutStore.addDeviceType({
      name: "Server",
      u_height: 1,
      category: "server",
      colour: CATEGORY_COLOURS.server,
      slot_width: 2,
    });
    // Occupy the slot so the placement collides.
    layoutStore.placeDevice(rack.id, dt.slug, 5, "front");
    placementStore.startPlacement(dt);

    const ok = completePointerPlacement(
      { layoutStore, selectionStore, placementStore },
      rack.id,
      dt,
      5,
      "front",
    );

    expect(ok).toBe(false);
    expect(selectionStore.selectedType).toBe(null);
    expect(placementStore.isPlacing).toBe(true);
  });
});
