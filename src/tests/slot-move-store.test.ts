/**
 * Slot-move store flow (#2322): moving a contained half-width device between
 * the cells of its own carrier through the layout store. Built on the
 * carrier-cell model (#2158): the child keeps its container_id and only its
 * slot_id changes, so it is never ejected (contained-device guard, #2146).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { CATEGORY_COLOURS } from "$lib/types/constants";
import { setupStoreWithRack } from "./factories";

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
});

type Store = NonNullable<ReturnType<typeof getLayoutStore>>;

/** Reuses the shared rack factory, returning the non-null store these tests use. */
function setupRack(): { store: Store; rackId: string } {
  const { store, rack } = setupStoreWithRack();
  return { store: store!, rackId: rack.id };
}

/** A 1U half-width device: synthesises a 2-column carrier. */
function addHalfWidth(store: Store) {
  return store.addDeviceType({
    name: "Half 1U",
    u_height: 1,
    category: "network",
    colour: CATEGORY_COLOURS.network,
    slot_width: 1,
  });
}

function carrierIn(store: Store) {
  return store.rack!.devices.find((d) => d.device_type.startsWith("carrier"))!;
}

function childIndex(store: Store, deviceTypeSlug: string) {
  return store.rack!.devices.findIndex((d) => d.device_type === deviceTypeSlug);
}

describe("moveDeviceToSlot (store)", () => {
  it("moves a lone child to the other cell of its carrier without ejecting it", () => {
    const { store, rackId } = setupRack();
    const dt = addHalfWidth(store);
    store.placeDeviceSmart(rackId, dt.slug, 5);

    const carrier = carrierIn(store);
    const index = childIndex(store, dt.slug);
    const before = store.rack!.devices[index]!;
    const originalSlot = before.slot_id;

    expect(store.moveDeviceToSlot(rackId, index)).toBe(true);

    const after = store.rack!.devices.find((d) => d.device_type === dt.slug)!;
    // Still contained in the same carrier, just a different cell.
    expect(after.container_id).toBe(carrier.id);
    expect(after.slot_id).not.toBe(originalSlot);
    expect(after.slot_id).toBeDefined();
  });

  it("undo restores the child to its original cell", () => {
    const { store, rackId } = setupRack();
    const dt = addHalfWidth(store);
    store.placeDeviceSmart(rackId, dt.slug, 5);

    const index = childIndex(store, dt.slug);
    const originalSlot = store.rack!.devices[index]!.slot_id;
    const carrierId = store.rack!.devices[index]!.container_id;

    store.moveDeviceToSlot(rackId, index);
    store.undo();

    const restored = store.rack!.devices.find(
      (d) => d.device_type === dt.slug,
    )!;
    expect(restored.slot_id).toBe(originalSlot);
    expect(restored.container_id).toBe(carrierId);
  });

  it("returns false when every other cell of the carrier is occupied", () => {
    const { store, rackId } = setupRack();
    const dt = addHalfWidth(store);
    // Two half-width devices fill both cells of the 2-column carrier.
    store.placeDeviceSmart(rackId, dt.slug, 5);
    store.placeDeviceSmart(rackId, dt.slug, 5);

    const carrier = carrierIn(store);
    const children = store.rack!.devices.filter(
      (d) => d.container_id === carrier.id,
    );
    // both half-width devices occupy distinct cells, filling the 2-column carrier
    expect(new Set(children.map((c) => c.slot_id)).size).toBe(2);

    const firstChildIndex = store.rack!.devices.indexOf(children[0]!);
    expect(store.moveDeviceToSlot(rackId, firstChildIndex)).toBe(false);

    // Nothing moved: both children keep their distinct cells.
    const after = store.rack!.devices.filter(
      (d) => d.container_id === carrier.id,
    );
    expect(new Set(after.map((c) => c.slot_id)).size).toBe(2);
  });

  it("returns false for a rack-level device that is not a carrier child", () => {
    const { store, rackId } = setupRack();
    const dt = store.addDeviceType({
      name: "Server 1U",
      u_height: 1,
      category: "server",
      colour: CATEGORY_COLOURS.server,
      slot_width: 2,
    });
    store.placeDeviceSmart(rackId, dt.slug, 5);

    const index = store.rack!.devices.findIndex(
      (d) => d.device_type === dt.slug,
    );
    expect(store.moveDeviceToSlot(rackId, index)).toBe(false);
  });
});
