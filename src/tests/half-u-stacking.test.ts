/**
 * Half-U stacking (#2152)
 *
 * Two 0.5U devices (e.g. Mikrotik RB5009) must be able to share a single U as
 * the lower and upper half. These end-to-end guards exercise the store,
 * collision, undo, and share round-trip so the stacked pair survives intact.
 *
 * This is a disposable M02 regression guard. The M03 carrier-first epic
 * replaces sub-U placement and can delete this file wholesale.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getHistoryStore,
  resetHistoryStore,
} from "$lib/stores/history.svelte";
import { encodeLayout, decodeLayout } from "$lib/utils/share";
import { toInternalUnits, UNITS_PER_U } from "$lib/utils/position";
import { createTestDeviceType } from "./factories";

const HALF_U = UNITS_PER_U / 2; // 3 internal units

function setup() {
  const store = getLayoutStore();
  if (!store) throw new Error("getLayoutStore() returned null");
  const rack = store.addRack("Test Rack", 42);
  if (!rack) throw new Error("addRack() failed");
  store.addDeviceTypeRaw(
    createTestDeviceType({
      slug: "rb5009",
      model: "RB5009",
      u_height: 0.5,
      category: "network",
    }),
  );
  return { store, rackId: rack.id };
}

function sortedPositions(store: ReturnType<typeof getLayoutStore>): number[] {
  return store!.layout.racks[0]!.devices
    .map((d) => d.position)
    .sort((a, b) => a - b);
}

describe("half-U stacking (#2152)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetHistoryStore();
  });

  it("stacks two 0.5U devices as the lower and upper half of one U", () => {
    const { store, rackId } = setup();

    expect(store.placeDevice(rackId, "rb5009", 5)).toBe(true); // lower half U5
    expect(store.placeDevice(rackId, "rb5009", 5.5)).toBe(true); // upper half U5

    const positions = sortedPositions(store);
    expect(positions).toEqual([toInternalUnits(5), toInternalUnits(5.5)]); // [30, 33]
    // Both sit on half-U boundaries (multiples of 3), never a 1/3U-only offset.
    for (const p of positions) {
      expect(p % HALF_U).toBe(0);
    }
  });

  it("rejects a third 0.5U device once both halves of a U are filled", () => {
    const { store, rackId } = setup();
    store.placeDevice(rackId, "rb5009", 5);
    store.placeDevice(rackId, "rb5009", 5.5);

    expect(store.placeDevice(rackId, "rb5009", 5)).toBe(false);
    expect(store.placeDevice(rackId, "rb5009", 5.5)).toBe(false);
    expect(sortedPositions(store)).toEqual([
      toInternalUnits(5),
      toInternalUnits(5.5),
    ]);
  });

  it("undo removes the upper-half device and restores the prior state", () => {
    const { store, rackId } = setup();
    store.placeDevice(rackId, "rb5009", 5);
    store.placeDevice(rackId, "rb5009", 5.5);

    expect(getHistoryStore().undo()).toBe(true);

    expect(sortedPositions(store)).toEqual([toInternalUnits(5)]);
  });

  it("preserves the stacked pair across a share encode/decode round-trip", () => {
    const { store, rackId } = setup();
    store.placeDevice(rackId, "rb5009", 5);
    store.placeDevice(rackId, "rb5009", 5.5);

    const encoded = encodeLayout(store.layout);
    expect(encoded).toBeTruthy();
    const { layout } = decodeLayout(encoded!);
    expect(layout).not.toBeNull();

    const positions = layout!.racks[0]!.devices
      .map((d) => d.position)
      .sort((a, b) => a - b);
    expect(positions).toEqual([toInternalUnits(5), toInternalUnits(5.5)]);
  });
});
