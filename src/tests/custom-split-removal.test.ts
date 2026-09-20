/**
 * Taking a device out of a custom split.
 *
 * The cell goes with its device, and the gap to its left goes with the cell,
 * so the devices to the right do not slide left by an amount nobody chose.
 * The first cell has no left gap, so it takes the one on its right instead.
 *
 * Cells are numbered left to right, so dropping one renumbers its neighbours:
 * the survivors are re-slotted in the same step or they point at cells that no
 * longer exist.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createTestDeviceType } from "./factories";

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
});

function splitOf(cellCount: number, gaps?: number[]) {
  const store = getLayoutStore();
  const rack = store.addRack("Test Rack", 12)!;
  const device = createTestDeviceType({
    slug: "test-moi",
    model: "test moi",
    u_height: 1,
    width_mm: 100,
  });
  store.addDeviceTypeRaw(device);
  for (let i = 0; i < cellCount; i++) {
    store.placeDeviceSmart(rack.id, device.slug, 5);
  }
  const carrier = store
    .getRackById(rack.id)!
    .devices.find((d) => !d.container_id)!;
  if (gaps) store.updateDeviceTypeSlotGaps(rack.id, carrier.id, gaps);
  return { store, rackId: rack.id, carrierId: carrier.id };
}

function carrierType(
  store: ReturnType<typeof getLayoutStore>,
  rackId: string,
  carrierId: string,
) {
  const carrier = store
    .getRackById(rackId)!
    .devices.find((d) => d.id === carrierId)!;
  return store.device_types.find((dt) => dt.slug === carrier.device_type)!;
}

function removeChildInSlot(
  store: ReturnType<typeof getLayoutStore>,
  rackId: string,
  slotId: string,
) {
  const devices = store.getRackById(rackId)!.devices;
  const index = devices.findIndex((d) => d.slot_id === slotId);
  store.removeDeviceFromRack(rackId, index);
}

describe("removing a device from a custom split", () => {
  it("drops the cell and the gap to its left", () => {
    const { store, rackId, carrierId } = splitOf(3, [10, 20]);

    // Cell 3's left gap is the 20. Dropping the cell drops that gap, so the
    // 10 between cells 1 and 2 survives untouched.
    removeChildInSlot(store, rackId, "col-3");

    const type = carrierType(store, rackId, carrierId);
    expect(type.slots?.length).toBe(2);
    expect(type.slot_gaps).toEqual([10]);
  });

  it("takes the right gap when the first cell goes", () => {
    const { store, rackId, carrierId } = splitOf(3, [10, 20]);

    // Cell 1 has no left gap, so it takes the 10 on its right instead.
    removeChildInSlot(store, rackId, "col-1");

    const type = carrierType(store, rackId, carrierId);
    expect(type.slots?.length).toBe(2);
    expect(type.slot_gaps).toEqual([20]);
  });

  it("renumbers the survivors so none points at a cell that is gone", () => {
    const { store, rackId, carrierId } = splitOf(3);

    removeChildInSlot(store, rackId, "col-1");

    const type = carrierType(store, rackId, carrierId);
    const cellIds = new Set(type.slots?.map((s) => s.id));
    const children = store
      .getRackById(rackId)!
      .devices.filter((d) => d.container_id === carrierId);

    expect(children.length).toBe(2);
    for (const child of children) {
      expect(cellIds.has(child.slot_id!)).toBe(true);
    }
  });

  it("collects the generated type once no carrier uses it", () => {
    const { store, rackId } = splitOf(1);
    const before = store.device_types.filter(
      (dt) => dt.auto_created === true,
    ).length;

    removeChildInSlot(store, rackId, "col-1");

    expect(
      store.device_types.filter((dt) => dt.auto_created === true).length,
    ).toBe(before - 1);
  });

  it("restores the whole split on undo", () => {
    const { store, rackId, carrierId } = splitOf(3, [10, 20]);

    removeChildInSlot(store, rackId, "col-2");
    store.undo();

    const type = carrierType(store, rackId, carrierId);
    expect(type.slots?.length).toBe(3);
    expect(type.slot_gaps).toEqual([10, 20]);
    expect(
      store.getRackById(rackId)!.devices.filter((d) => d.container_id).length,
    ).toBe(3);
  });
});
