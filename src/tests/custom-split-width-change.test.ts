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

  it("imports the split both carriers converge on once, and drops the old one", () => {
    // Two carriers on the same split land on the same new split. Reading the
    // library as it stood before the batch made both import it, under one slug,
    // and made neither collect the split they had both left.
    const { store, rackId, slug } = placed(100, 1);
    store.placeDeviceSmart(rackId, slug, 8);
    const old = store.device_types.find((dt) => dt.auto_created === true)!.slug;

    expect(store.updateDeviceType(slug, { width_mm: 120 })).toBe(true);

    const slugs = store.device_types.map((dt) => dt.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).not.toContain(old);
  });

  it("refuses a width a shipped carrier's cell cannot take", () => {
    const store = getLayoutStore();
    const rack = store.addRack("Test Rack", 12)!;
    const half = createTestDeviceType({
      slug: "test-half",
      model: "test half",
      u_height: 1,
      slot_width: 1,
    });
    store.addDeviceTypeRaw(half);
    store.placeDeviceSmart(rack.id, half.slug, 5);

    // The shipped 1U carrier's cells are half of the 450 mm opening and cannot
    // be re-cut, so 300 mm has nowhere to go: allowing it would save a layout
    // LayoutSchema refuses on the next load.
    expect(store.updateDeviceType(half.slug, { width_mm: 300 })).toBe(false);
    expect(
      store.device_types.find((dt) => dt.slug === half.slug)!.width_mm,
    ).toBeUndefined();

    expect(store.updateDeviceType(half.slug, { width_mm: 200 })).toBe(true);
  });

  it("leaves a change that touches no carrier alone", () => {
    const { store, slug } = placed(100, 1);

    expect(store.updateDeviceType(slug, { model: "renamed" })).toBe(true);
    expect(store.device_types.find((dt) => dt.slug === slug)!.model).toBe(
      "renamed",
    );
  });
});
