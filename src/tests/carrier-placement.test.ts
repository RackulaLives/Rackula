/**
 * Carrier-First Placement Tests (C3, epic #2158)
 *
 * Covers the carrier-first drag/drop behaviour:
 * - A sub-U / half-width device dropped on bare rack synthesises a carrier and
 *   places the device as a child (marked auto_created on the carrier).
 * - Dropping near a carrier with a free cell fills that cell.
 * - One child per cell; the four cells of a 2x2 carrier are each fillable.
 * - An oversized child is rejected.
 * - findNextFreeChildPosition returns the first empty cell in slot order.
 * - synthesizeCarrierForDevice picks the carrier slug from device dimensions.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { findStarterDevice } from "$lib/data/starterLibrary";
import {
  findNextFreeChildPosition,
  synthesizeCarrierForDevice,
} from "$lib/utils/collision";
import { createTestDeviceType } from "./factories";
import { CATEGORY_COLOURS } from "$lib/types/constants";
import type { PlacedDevice } from "$lib/types";

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
});

/** A 0.5U half-width device (needs a 2x2 carrier). */
const halfWidthHalfHeight = createTestDeviceType({
  slug: "rb5009",
  u_height: 0.5,
  slot_width: 1,
});

/** A 1U half-width device (needs a 1x2 carrier). */
const halfWidthFullHeight = createTestDeviceType({
  slug: "mini-1u",
  u_height: 1,
  slot_width: 1,
});

/** A standard 1U full-width device (never needs a carrier). */
const fullWidthDevice = createTestDeviceType({
  slug: "server-1u",
  u_height: 1,
  slot_width: 2,
});

/** A 0.5U full-width device: no half-width carrier can hold it. */
const fullWidthSubU = createTestDeviceType({
  slug: "blank-0-5u",
  u_height: 0.5,
  slot_width: 2,
});

describe("synthesizeCarrierForDevice", () => {
  it("returns the 2x2 carrier slug for a half-width half-height device", () => {
    expect(synthesizeCarrierForDevice(halfWidthHalfHeight)).toBe(
      "carrier-1u-2x2",
    );
  });

  it("returns the 2-col carrier slug for a half-width full-height device", () => {
    expect(synthesizeCarrierForDevice(halfWidthFullHeight)).toBe(
      "carrier-1u-2col",
    );
  });

  it("returns null for a full-width whole-U device (no carrier needed)", () => {
    expect(synthesizeCarrierForDevice(fullWidthDevice)).toBeNull();
  });

  it("returns null for a full-width sub-U device (no half-width carrier fits)", () => {
    expect(synthesizeCarrierForDevice(fullWidthSubU)).toBeNull();
  });
});

describe("findNextFreeChildPosition", () => {
  const carrier2x2 = findStarterDevice("carrier-1u-2x2")!;

  function childIn(slotId: string): PlacedDevice {
    return {
      id: `child-${slotId}`,
      device_type: "rb5009",
      position: 0,
      face: "front",
      container_id: "carrier-1",
      slot_id: slotId,
    };
  }

  it("returns the first slot when the carrier is empty", () => {
    const free = findNextFreeChildPosition(carrier2x2, []);
    expect(free).toEqual({ slotId: "r0-c0", position: 0 });
  });

  it("skips occupied cells and returns the next free cell", () => {
    const free = findNextFreeChildPosition(carrier2x2, [childIn("r0-c0")]);
    expect(free).toEqual({ slotId: "r0-c1", position: 0 });
  });

  it("reaches the upper-row cells once the bottom row is full (y-aware)", () => {
    const free = findNextFreeChildPosition(carrier2x2, [
      childIn("r0-c0"),
      childIn("r0-c1"),
    ]);
    expect(free).toEqual({ slotId: "r1-c0", position: 0 });
  });

  it("returns null when every cell is occupied", () => {
    const free = findNextFreeChildPosition(carrier2x2, [
      childIn("r0-c0"),
      childIn("r0-c1"),
      childIn("r1-c0"),
      childIn("r1-c1"),
    ]);
    expect(free).toBeNull();
  });
});

describe("placeDeviceSmart (store carrier-first flow)", () => {
  type Store = NonNullable<ReturnType<typeof getLayoutStore>>;

  function setupRack(height = 12): { store: Store; rackId: string } {
    const store = getLayoutStore()!;
    const rack = store.addRack("Test Rack", height);
    return { store, rackId: rack!.id };
  }

  /** Register a 0.5U half-width device (needs a 2x2 carrier). */
  function addRb5009(store: Store) {
    return store.addDeviceType({
      name: "RB5009",
      u_height: 0.5,
      category: "network",
      colour: CATEGORY_COLOURS.network,
      slot_width: 1,
    });
  }

  function carrierIn(store: Store) {
    return store.rack!.devices.find((d) => d.device_type.startsWith("carrier"));
  }

  function childrenOf(store: Store, carrierId: string) {
    return store.rack!.devices.filter((d) => d.container_id === carrierId);
  }

  it("synthesises a carrier and places a sub-U device on a bare rack", () => {
    const { store, rackId } = setupRack();
    const dt = addRb5009(store);

    expect(store.placeDeviceSmart(rackId, dt.slug, 5)).toBe(true);

    const carrier = carrierIn(store)!;
    expect(carrier.device_type).toBe("carrier-1u-2x2");
    expect(carrier.auto_created).toBe(true);

    const child = childrenOf(store, carrier.id)[0];
    expect(child?.device_type).toBe(dt.slug);
  });

  it("places a full-width device directly on the rail without a carrier", () => {
    const { store, rackId } = setupRack();
    const dt = store.addDeviceType({
      name: "Server 1U",
      u_height: 1,
      category: "server",
      colour: CATEGORY_COLOURS.server,
      slot_width: 2,
    });

    expect(store.placeDeviceSmart(rackId, dt.slug, 5)).toBe(true);

    expect(carrierIn(store)).toBeUndefined();
    const placed = store.rack!.devices.find((d) => d.device_type === dt.slug);
    expect(placed?.container_id).toBeUndefined();
  });

  it("fills a free cell of an existing carrier at the target U", () => {
    const { store, rackId } = setupRack();
    const dt = addRb5009(store);

    // First drop synthesises the carrier at U5.
    store.placeDeviceSmart(rackId, dt.slug, 5);
    const carrier = carrierIn(store)!;
    const carrierU = carrier.position;

    // Second drop at the same U fills the next free cell, not a new carrier.
    store.placeDeviceSmart(rackId, dt.slug, 5);

    const carriers = store.rack!.devices.filter((d) =>
      d.device_type.startsWith("carrier"),
    );
    // eslint-disable-next-line no-restricted-syntax -- invariant: the carrier is reused, never duplicated
    expect(carriers).toHaveLength(1);
    const children = childrenOf(store, carrier.id);
    // eslint-disable-next-line no-restricted-syntax -- invariant: two distinct cells filled
    expect(children).toHaveLength(2);
    expect(new Set(children.map((c) => c.slot_id)).size).toBe(2);
    expect(carrier.position).toBe(carrierU);
  });

  it("fills all four cells of a 2x2 carrier across repeated drops", () => {
    const { store, rackId } = setupRack();
    const dt = addRb5009(store);

    for (let i = 0; i < 4; i++) {
      expect(store.placeDeviceSmart(rackId, dt.slug, 5)).toBe(true);
    }

    const carrier = carrierIn(store)!;
    const children = childrenOf(store, carrier.id);
    // eslint-disable-next-line no-restricted-syntax -- invariant: a 2x2 carrier has exactly four cells
    expect(children).toHaveLength(4);
    expect(new Set(children.map((c) => c.slot_id)).size).toBe(4);
  });

  it("rejects a fifth child once the 2x2 carrier is full", () => {
    const { store, rackId } = setupRack();
    const dt = addRb5009(store);

    for (let i = 0; i < 4; i++) {
      store.placeDeviceSmart(rackId, dt.slug, 5);
    }

    expect(store.placeDeviceSmart(rackId, dt.slug, 5)).toBe(false);

    const carrier = carrierIn(store)!;
    // eslint-disable-next-line no-restricted-syntax -- invariant: a full carrier gains no fifth child
    expect(childrenOf(store, carrier.id)).toHaveLength(4);
  });

  it("rejects a child too tall to fit any carrier cell", () => {
    const { store, rackId } = setupRack();
    // A 0.75U half-width device routes to the 2x2 carrier (0.5U cells) but does
    // not fit; placement is rejected rather than committed.
    const dt = store.addDeviceType({
      name: "Tall Half",
      u_height: 0.75,
      category: "network",
      colour: CATEGORY_COLOURS.network,
      slot_width: 1,
    });

    expect(store.placeDeviceSmart(rackId, dt.slug, 5)).toBe(false);
    expect(carrierIn(store)).toBeUndefined();
  });
});
