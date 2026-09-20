/**
 * More than two measured devices in one carrier (#3310 follow-up).
 *
 * A custom split grows a cell at a time. The row's budget is the rack
 * opening: cells plus gaps. Past that the drop is refused, and the message
 * says what is left rather than "No space".
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { isGeneratedCarrier } from "$lib/utils/custom-carrier";
import { createTestDeviceType } from "./factories";

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
});

function setup(widthMm: number, rackWidth = 19) {
  const store = getLayoutStore();
  const rack = store.addRack("Test Rack", 12)!;
  if (rackWidth !== rack.width) store.updateRack(rack.id, { width: rackWidth });
  const device = createTestDeviceType({
    slug: "test-moi",
    model: "test moi",
    u_height: 1,
    width_mm: widthMm,
  });
  store.addDeviceTypeRaw(device);
  return { store, rackId: rack.id, slug: device.slug };
}

function devicesIn(store: ReturnType<typeof getLayoutStore>, rackId: string) {
  return store.getRackById(rackId)!.devices;
}

function carrierIn(store: ReturnType<typeof getLayoutStore>, rackId: string) {
  return devicesIn(store, rackId).find((d) => !d.container_id)!;
}

function childrenIn(store: ReturnType<typeof getLayoutStore>, rackId: string) {
  return devicesIn(store, rackId).filter((d) => d.container_id);
}

describe("custom split", () => {
  it("puts four 100 mm devices in one carrier on a 19 inch rack", () => {
    const { store, rackId, slug } = setup(100);

    for (let i = 0; i < 4; i++) {
      expect(store.placeDeviceSmart(rackId, slug, 5)).toBe(true);
    }

    const carriers = devicesIn(store, rackId).filter((d) => !d.container_id);
    const children = childrenIn(store, rackId);

    expect(carriers.length).toBe(1);
    expect(children.length).toBe(4);
    expect(new Set(children.map((c) => c.slot_id)).size).toBe(4);
  });

  it("refuses the fifth, which would overflow the opening", () => {
    const { store, rackId, slug } = setup(100);
    for (let i = 0; i < 4; i++) store.placeDeviceSmart(rackId, slug, 5);

    expect(store.placeDeviceSmart(rackId, slug, 5)).toBe(false);
    expect(childrenIn(store, rackId).length).toBe(4);
  });

  it("fits five 100 mm devices on a 23 inch rack", () => {
    const { store, rackId, slug } = setup(100, 23);

    for (let i = 0; i < 5; i++) {
      expect(store.placeDeviceSmart(rackId, slug, 5)).toBe(true);
    }

    expect(childrenIn(store, rackId).length).toBe(5);
  });

  it("keeps the carrier type generated as it grows, with a zero gap per join", () => {
    const { store, rackId, slug } = setup(100);
    store.placeDeviceSmart(rackId, slug, 5);
    store.placeDeviceSmart(rackId, slug, 5);

    const carrier = carrierIn(store, rackId);
    const type = store.device_types.find(
      (dt) => dt.slug === carrier.device_type,
    )!;

    expect(isGeneratedCarrier(type)).toBe(true);
    expect(type.slots?.length).toBe(2);
    expect(type.slot_gaps).toEqual([0]);
  });

  it("leaves one generated type behind, however many cells the row grew", () => {
    const { store, rackId, slug } = setup(100);

    for (let i = 0; i < 4; i++) store.placeDeviceSmart(rackId, slug, 5);

    // Each growth retypes the carrier, so without collecting the split it
    // just left, a row grown to four cells strands three dead types.
    expect(store.device_types.filter((dt) => dt.auto_created).length).toBe(1);
  });

  it("undoes a grown cell in one step", () => {
    const { store, rackId, slug } = setup(100);
    store.placeDeviceSmart(rackId, slug, 5);
    store.placeDeviceSmart(rackId, slug, 5);

    store.undo();

    expect(childrenIn(store, rackId).length).toBe(1);
    const type = store.device_types.find(
      (dt) => dt.slug === carrierIn(store, rackId).device_type,
    )!;
    expect(type.slots?.length).toBe(1);
  });
});
