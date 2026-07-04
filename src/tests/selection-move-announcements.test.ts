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
