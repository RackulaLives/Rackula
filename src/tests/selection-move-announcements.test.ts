/**
 * Arrow-key device moves must be perceivable without vision: a successful
 * move announces the new U position through the assertive live region
 * (placementStore.placementAnnouncement, rendered by DialogOrchestrator),
 * and a blocked move announces the failure instead of no-oping silently.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import {
  getPlacementStore,
  resetPlacementStore,
} from "$lib/stores/placement.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import {
  moveSelectedDeviceUp,
  moveSelectedDeviceDown,
  moveSelectedDeviceLeft,
  moveSelectedDeviceRight,
} from "$lib/actions/selection-actions";
import { createTestDeviceTypeInput } from "./factories";

describe("arrow-key device move announcements", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetPlacementStore();
    resetHistoryStore();
  });

  function placeAndSelect(positionU: number): void {
    const layoutStore = getLayoutStore();
    const rack = layoutStore.addRack("Test Rack", 12);
    const dt = layoutStore.addDeviceType(createTestDeviceTypeInput());
    layoutStore.placeDeviceSmart(rack!.id, dt.slug, positionU);
    // Store mutations replace arrays immutably (rack-actions.ts), so re-read
    // the rack from the store rather than trusting the creation-time reference.
    const liveRack = layoutStore.racks.find((r) => r.id === rack!.id)!;
    getSelectionStore().selectDevice(rack!.id, liveRack.devices[0]!.id);
  }

  it("announces the new position after a successful move up", () => {
    placeAndSelect(5);
    moveSelectedDeviceUp();
    expect(getPlacementStore().placementAnnouncement).toBe("Moved to U6");
  });

  it("announces failure when the device is already at the top", () => {
    placeAndSelect(12);
    moveSelectedDeviceUp();
    expect(getPlacementStore().placementAnnouncement).toBe(
      "Cannot move up, no free position",
    );
  });

  it("announces failure when the device is already at the bottom", () => {
    placeAndSelect(1);
    moveSelectedDeviceDown();
    expect(getPlacementStore().placementAnnouncement).toBe(
      "Cannot move down, no free position",
    );
  });
});

describe("arrow-key carrier child moves (#2295)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetPlacementStore();
    resetHistoryStore();
  });

  /** Place a half-width device (synthesising a 2-column carrier) and select it. */
  function placeChildAndSelect(): { rackId: string; childId: string } {
    const layoutStore = getLayoutStore();
    const rack = layoutStore.addRack("Test Rack", 12)!;
    const dt = layoutStore.addDeviceType(
      createTestDeviceTypeInput({ name: "Mini Switch", slot_width: 1 }),
    );
    layoutStore.placeDeviceSmart(rack.id, dt.slug, 5);
    const child = layoutStore
      .getRackById(rack.id)!
      .devices.find((d) => d.container_id)!;
    getSelectionStore().selectDevice(rack.id, child.id);
    return { rackId: rack.id, childId: child.id };
  }

  function deviceIn(rackId: string, id: string) {
    return getLayoutStore()
      .getRackById(rackId)!
      .devices.find((d) => d.id === id)!;
  }

  it("moves a selected child one cell right and announces the cell", () => {
    const { rackId, childId } = placeChildAndSelect();
    const carrierId = deviceIn(rackId, childId).container_id;

    moveSelectedDeviceRight();

    expect(deviceIn(rackId, childId).slot_id).toBe("col-2");
    expect(deviceIn(rackId, childId).container_id).toBe(carrierId);
    const carrierType = getLayoutStore().device_types.find(
      (dt) => dt.slug === deviceIn(rackId, carrierId!).device_type,
    )!;
    const cellName = carrierType.slots!.find((s) => s.id === "col-2")!.name;
    expect(getPlacementStore().placementAnnouncement).toBe(
      `Moved to ${cellName}`,
    );
  });

  it("moves a selected child back left", () => {
    const { rackId, childId } = placeChildAndSelect();

    moveSelectedDeviceRight();
    moveSelectedDeviceLeft();

    expect(deviceIn(rackId, childId).slot_id).toBe("col-1");
  });

  it("keeps a child in its carrier when there is no cell above, and says why", () => {
    const { rackId, childId } = placeChildAndSelect();
    const before = { ...deviceIn(rackId, childId) };

    moveSelectedDeviceUp();

    expect(deviceIn(rackId, childId)).toEqual(before);
    expect(getPlacementStore().placementAnnouncement).toBe(
      "Cannot move up, no free cell above",
    );
  });

  it("says why when the cell to the right is taken", () => {
    const { rackId, childId } = placeChildAndSelect();
    const slug = deviceIn(rackId, childId).device_type;
    getLayoutStore().placeDeviceSmart(rackId, slug, 5);

    moveSelectedDeviceRight();

    expect(deviceIn(rackId, childId).slot_id).toBe("col-1");
    expect(getPlacementStore().placementAnnouncement).toBe(
      "Cannot move right, no free cell to the right",
    );
  });

  it("leaves a rack-level device where it is on left and right", () => {
    const layoutStore = getLayoutStore();
    const rack = layoutStore.addRack("Test Rack", 12)!;
    const dt = layoutStore.addDeviceType(createTestDeviceTypeInput());
    layoutStore.placeDevice(rack.id, dt.slug, 5);
    const device = layoutStore.getRackById(rack.id)!.devices[0]!;
    getSelectionStore().selectDevice(rack.id, device.id);

    moveSelectedDeviceLeft();
    moveSelectedDeviceRight();

    expect(deviceIn(rack.id, device.id).position).toBe(device.position);
  });
});
