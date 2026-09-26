/**
 * Gaps are set on the carrier, not on a device.
 *
 * A gap belongs to the carrier and to a position between two cells. Setting
 * one rewrites that carrier's split, which fingerprints differently, so any
 * other carrier sharing the old type keeps it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createTestDeviceType } from "./factories";

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
});

function twoCellCarrier() {
  const store = getLayoutStore();
  const rack = store.addRack("Test Rack", 12)!;
  const device = createTestDeviceType({
    slug: "test-moi",
    model: "test moi",
    u_height: 1,
    width_mm: 100,
  });
  store.addDeviceTypeRaw(device);
  store.placeDeviceSmart(rack.id, device.slug, 5);
  store.placeDeviceSmart(rack.id, device.slug, 5);
  const carrier = store
    .getRackById(rack.id)!
    .devices.find((d) => !d.container_id)!;
  return { store, rackId: rack.id, carrierId: carrier.id, slug: device.slug };
}

function carrierTypeOf(
  store: ReturnType<typeof getLayoutStore>,
  rackId: string,
  carrierId: string,
) {
  const carrier = store
    .getRackById(rackId)!
    .devices.find((d) => d.id === carrierId)!;
  return store.device_types.find((dt) => dt.slug === carrier.device_type)!;
}

describe("updateDeviceTypeSlotGaps", () => {
  it("sets the gap between two cells", () => {
    const { store, rackId, carrierId } = twoCellCarrier();

    expect(store.updateDeviceTypeSlotGaps(rackId, carrierId, [20])).toBe(true);
    expect(carrierTypeOf(store, rackId, carrierId).slot_gaps).toEqual([20]);
  });

  it("keeps the children attached to their cells", () => {
    const { store, rackId, carrierId } = twoCellCarrier();

    store.updateDeviceTypeSlotGaps(rackId, carrierId, [20]);

    const children = store
      .getRackById(rackId)!
      .devices.filter((d) => d.container_id === carrierId);
    expect(children.length).toBe(2);
    expect(children.map((c) => c.slot_id).sort()).toEqual(["col-1", "col-2"]);
  });

  it("refuses a gap that would overflow the row", () => {
    const { store, rackId, carrierId } = twoCellCarrier();
    const before = carrierTypeOf(store, rackId, carrierId).slug;

    expect(store.updateDeviceTypeSlotGaps(rackId, carrierId, [400])).toBe(
      false,
    );
    expect(carrierTypeOf(store, rackId, carrierId).slug).toBe(before);
  });

  it("refuses the wrong number of gaps for the cell count", () => {
    const { store, rackId, carrierId } = twoCellCarrier();

    expect(store.updateDeviceTypeSlotGaps(rackId, carrierId, [10, 10])).toBe(
      false,
    );
    expect(store.updateDeviceTypeSlotGaps(rackId, carrierId, [-5])).toBe(false);
  });

  it("leaves another carrier on the same split alone", () => {
    const { store, rackId, carrierId, slug } = twoCellCarrier();
    const other = store.addRack("Other", 12)!;
    store.placeDeviceSmart(other.id, slug, 5);
    store.placeDeviceSmart(other.id, slug, 5);
    const otherCarrier = store
      .getRackById(other.id)!
      .devices.find((d) => !d.container_id)!;
    const sharedSlug = otherCarrier.device_type;

    store.updateDeviceTypeSlotGaps(rackId, carrierId, [20]);

    expect(carrierTypeOf(store, other.id, otherCarrier.id).slug).toBe(
      sharedSlug,
    );
  });

  it("undoes the gap in one step", () => {
    const { store, rackId, carrierId } = twoCellCarrier();
    store.updateDeviceTypeSlotGaps(rackId, carrierId, [20]);

    store.undo();

    expect(carrierTypeOf(store, rackId, carrierId).slot_gaps).toEqual([0]);
  });
});
