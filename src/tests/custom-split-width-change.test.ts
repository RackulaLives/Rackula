/**
 * A measured width and the cell holding it must never contradict each other,
 * so the cells recompute when the width changes.
 *
 * The recompute can move devices in a rack that is not on screen, so it is
 * announced; and it refuses rather than leave a row overflowing its opening.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { getRackOpeningMm } from "$lib/utils/device-width";
import { createTestDeviceType } from "./factories";

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
});

function placed(widthMm: number, count: number) {
  const store = getLayoutStore();
  const rack = store.addRack("Test Rack", 12)!;
  const device = createTestDeviceType({
    slug: "test-moi",
    model: "test moi",
    u_height: 1,
    width_mm: widthMm,
  });
  store.addDeviceTypeRaw(device);
  for (let i = 0; i < count; i++) {
    store.placeDeviceSmart(rack.id, device.slug, 5);
  }
  return { store, rackId: rack.id, slug: device.slug };
}

function carrierTypeIn(
  store: ReturnType<typeof getLayoutStore>,
  rackId: string,
) {
  const carrier = store
    .getRackById(rackId)!
    .devices.find((d) => !d.container_id)!;
  return store.device_types.find((dt) => dt.slug === carrier.device_type)!;
}

describe("changing a measured width", () => {
  it("resizes every cell holding that device", () => {
    const { store, rackId, slug } = placed(100, 2);

    expect(store.updateDeviceType(slug, { width_mm: 120 })).toBe(true);

    const expected = 120 / getRackOpeningMm(19);
    for (const slot of carrierTypeIn(store, rackId).slots ?? []) {
      expect(slot.width_fraction).toBeCloseTo(expected, 6);
    }
  });

  it("refuses a width that no longer fits, leaving the cells alone", () => {
    const { store, rackId, slug } = placed(100, 4);

    expect(store.updateDeviceType(slug, { width_mm: 200 })).toBe(false);

    expect(carrierTypeIn(store, rackId).slots?.[0]?.width_fraction).toBeCloseTo(
      100 / getRackOpeningMm(19),
      6,
    );
    expect(store.device_types.find((dt) => dt.slug === slug)!.width_mm).toBe(
      100,
    );
  });

  it("keeps the children in their cells", () => {
    const { store, rackId, slug } = placed(100, 3);

    store.updateDeviceType(slug, { width_mm: 120 });

    const cellIds = new Set(
      carrierTypeIn(store, rackId).slots?.map((s) => s.id),
    );
    const children = store
      .getRackById(rackId)!
      .devices.filter((d) => d.container_id);
    expect(children.length).toBe(3);
    for (const child of children) {
      expect(cellIds.has(child.slot_id!)).toBe(true);
    }
  });

  it("undoes the width and the cells together", () => {
    const { store, rackId, slug } = placed(100, 2);
    store.updateDeviceType(slug, { width_mm: 120 });

    store.undo();

    expect(carrierTypeIn(store, rackId).slots?.[0]?.width_fraction).toBeCloseTo(
      100 / getRackOpeningMm(19),
      6,
    );
    expect(store.device_types.find((dt) => dt.slug === slug)!.width_mm).toBe(
      100,
    );
  });

  it("leaves a change that touches no carrier alone", () => {
    const { store, slug } = placed(100, 1);

    expect(store.updateDeviceType(slug, { model: "renamed" })).toBe(true);
    expect(store.device_types.find((dt) => dt.slug === slug)!.model).toBe(
      "renamed",
    );
  });
});
