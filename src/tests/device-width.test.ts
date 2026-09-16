/**
 * Measured device width (#3310)
 *
 * A device type may carry its physical width in millimetres (width_mm). Inside
 * a container, the device fits a slot when width_mm is no more than the slot's
 * share of the rack's clear opening. Devices without width_mm keep the
 * slot_width mapping (1 = half, 2 = full). Because fit depends on the rack,
 * changing a rack's width or moving a carrier to another rack re-checks it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { LayoutSchema } from "$lib/schemas";
import {
  canPlaceInSlot,
  requiresChassisBay,
  synthesizeCarrierForDevice,
  CARRIER_2COL_SLUG,
} from "$lib/utils/collision";
import { requiresCarrier, toMillimetres } from "$lib/utils/device-width";
import { adaptLegacyLayout } from "$lib/storage";
import {
  filterDevicesByAttributes,
  type HeightBucket,
} from "$lib/utils/deviceFilters";
import { findStarterDevice } from "$lib/data/starterLibrary";
import { serializeLayoutToYaml, parseLayoutYaml } from "$lib/utils/yaml";
import { encodeLayout, decodeLayout } from "$lib/utils/share";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import type { DeviceType } from "$lib/types";
import {
  createTestContainerChild,
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
  createTestSlot,
} from "./factories";

function measuredDevice(width_mm: number, slug = "mini-pc"): DeviceType {
  return { ...createTestDeviceType({ slug, u_height: 1 }), width_mm };
}

const thirdSlot = createTestSlot({ id: "left", width_fraction: 0.33 });

describe("canPlaceInSlot with width_mm", () => {
  it("fits a third-width slot in a 19 inch rack when narrow enough", () => {
    expect(canPlaceInSlot(measuredDevice(140), thirdSlot, 19)).toBe(true);
    expect(canPlaceInSlot(measuredDevice(160), thirdSlot, 19)).toBe(false);
  });

  it("reads a 0.33 cell as a true third, with no fraction-sized overlap", () => {
    // A third of the 19" opening is 150.3 mm.
    expect(canPlaceInSlot(measuredDevice(150), thirdSlot, 19)).toBe(true);
    expect(canPlaceInSlot(measuredDevice(152), thirdSlot, 19)).toBe(false);
  });

  it("keeps a deliberate custom fraction instead of snapping it to a third", () => {
    // 0.343 of the 19" opening is 154.6 mm. Snapping it down to a third (150.3)
    // would reject a 152 mm device that fits, and snapping 0.657 up to two
    // thirds would accept one that does not.
    const custom = createTestSlot({ id: "left", width_fraction: 0.343 });
    expect(canPlaceInSlot(measuredDevice(152), custom, 19)).toBe(true);

    const wide = createTestSlot({ id: "left", width_fraction: 0.657 });
    // 0.657 of the opening is 296.2 mm; two thirds would be 300.6.
    expect(canPlaceInSlot(measuredDevice(299), wide, 19)).toBe(false);
  });

  it("depends on the rack width", () => {
    // 140 mm is under a third of a 19" opening but over half of a 10" one.
    expect(canPlaceInSlot(measuredDevice(140), thirdSlot, 10)).toBe(false);
    expect(canPlaceInSlot(measuredDevice(72), thirdSlot, 10)).toBe(true);
  });

  it("keeps the slot_width mapping when width_mm is not set", () => {
    const half = createTestDeviceType({ slot_width: 1 });
    const halfSlot = createTestSlot({ width_fraction: 0.5 });
    expect(canPlaceInSlot(half, halfSlot, 10)).toBe(true);
    expect(canPlaceInSlot(half, thirdSlot, 19)).toBe(false);
  });
});

describe("carrier-first rule for measured devices", () => {
  it("requires a carrier and synthesises the column carrier when it fits", () => {
    const device = measuredDevice(72);
    expect(requiresCarrier(device)).toBe(true);
    expect(synthesizeCarrierForDevice(device, 19)).toBe(CARRIER_2COL_SLUG);
    expect(requiresChassisBay(device, 19)).toBe(false);
  });

  it("synthesises no carrier when the device is wider than a half-width cell", () => {
    for (const [widthMm, rackWidth] of [
      [300, 19],
      [140, 10],
    ] as const) {
      const device = measuredDevice(widthMm);
      expect(synthesizeCarrierForDevice(device, rackWidth)).toBeNull();
      expect(requiresChassisBay(device, rackWidth)).toBe(true);
    }
  });
});

describe("LayoutSchema width fit", () => {
  function shelfLayout(childWidthMm: number) {
    const shelf = findStarterDevice("shelf-1u-3slot")!;
    const child = measuredDevice(childWidthMm);
    return createTestLayout({
      racks: [
        createTestRack({
          id: "rack-1",
          width: 19,
          devices: [
            createTestDevice({
              id: "shelf-1",
              device_type: shelf.slug,
              position: 30,
            }),
            createTestContainerChild({
              id: "child-1",
              device_type: child.slug,
              container_id: "shelf-1",
              slot_id: "center",
            }),
          ],
        }),
      ],
      device_types: [shelf, child],
    });
  }

  it("accepts a measured child that fits its cell", () => {
    expect(LayoutSchema.safeParse(shelfLayout(140)).success).toBe(true);
  });

  it("rejects a measured child wider than its cell", () => {
    const result = LayoutSchema.safeParse(shelfLayout(160));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /too wide/i.test(i.message))).toBe(
        true,
      );
    }
  });

  it("rejects a measured device mounted directly on the rails", () => {
    const device = measuredDevice(72);
    const layout = createTestLayout({
      racks: [
        createTestRack({
          id: "rack-1",
          devices: [
            createTestDevice({
              id: "d1",
              device_type: device.slug,
              position: 30,
            }),
          ],
        }),
      ],
      device_types: [device],
    });
    const result = LayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /carrier/i.test(i.message))).toBe(
        true,
      );
    }
  });
});

describe("rack changes re-check measured children", () => {
  let store: ReturnType<typeof getLayoutStore>;

  /** A 19" rack with a 3-slot shelf holding a measured child in its centre cell. */
  function rackWithShelfChild(childWidthMm: number) {
    const rack = store.addRack("Rack A", 42)!;
    store.addDeviceTypeRaw(measuredDevice(childWidthMm));
    store.placeDevice(rack.id, "shelf-1u-3slot", 5);
    const shelf = store
      .getRackById(rack.id)!
      .devices.find((d) => d.device_type === "shelf-1u-3slot")!;
    expect(
      store.placeInContainer(rack.id, "mini-pc", shelf.id, "center", 0),
    ).toBe(true);
    return { rack, shelf };
  }

  beforeEach(() => {
    resetLayoutStore();
    resetHistoryStore();
    store = getLayoutStore();
  });

  it("refuses a rack width change that leaves a child too wide for its cell", () => {
    const { rack } = rackWithShelfChild(140);

    store.updateRack(rack.id, { width: 10 });

    expect(store.getRackById(rack.id)!.width).toBe(19);
  });

  it("allows a rack width change when every child still fits", () => {
    const { rack } = rackWithShelfChild(72);

    store.updateRack(rack.id, { width: 10 });

    expect(store.getRackById(rack.id)!.width).toBe(10);
  });

  it("refuses moving a shelf to a narrower rack its children do not fit", () => {
    const { rack, shelf } = rackWithShelfChild(140);
    const narrow = store.addRack("Rack B", 42)!;
    store.updateRack(narrow.id, { width: 10 });
    const shelfIndex = store.getRackById(rack.id)!.devices.indexOf(shelf);

    expect(store.moveDeviceToRack(rack.id, shelfIndex, narrow.id, 10)).toBe(
      false,
    );
    expect(store.getRackById(narrow.id)!.devices).toEqual([]);
  });
});

describe("legacy adapter", () => {
  it("wraps a rail-mounted measured device in a carrier", () => {
    const device = measuredDevice(72);
    const layout = createTestLayout({
      racks: [
        createTestRack({
          devices: [
            createTestDevice({
              id: "d1",
              device_type: device.slug,
              position: 30,
            }),
          ],
        }),
      ],
      device_types: [device],
    });

    const adapted = adaptLegacyLayout(layout);

    const placed = adapted.racks[0]!.devices.find((d) => d.id === "d1");
    expect(placed?.container_id).toBeDefined();
  });
});

describe("palette width filter", () => {
  it("lists a measured device under narrow gear, not full width", () => {
    const device = measuredDevice(72);
    const filters = {
      heights: new Set<HeightBucket>(),
      hasImage: false,
      customOnly: false,
    };
    const notCustom = () => false;

    expect(
      filterDevicesByAttributes(
        [device],
        { ...filters, halfWidth: true, fullWidth: false },
        notCustom,
      ),
    ).toContain(device);
    expect(
      filterDevicesByAttributes(
        [device],
        { ...filters, halfWidth: false, fullWidth: true },
        notCustom,
      ),
    ).not.toContain(device);
  });
});

describe("width units", () => {
  it("converts metric and imperial input to millimetres", () => {
    expect(toMillimetres(72, "mm")).toBe(72);
    expect(toMillimetres(7.2, "cm")).toBe(72);
    expect(toMillimetres(2.83, "in")).toBe(71.9);
  });
});

describe("width_mm persistence", () => {
  it("survives a YAML round-trip", async () => {
    const device = measuredDevice(72.5);
    const layout = createTestLayout({ device_types: [device] });
    const restored = await parseLayoutYaml(await serializeLayoutToYaml(layout));
    expect(
      restored.device_types.find((dt) => dt.slug === device.slug)?.width_mm,
    ).toBe(72.5);
  });

  it("survives a share link round-trip, keeping a 23 inch rack width", () => {
    const shelf = findStarterDevice("shelf-1u-3slot")!;
    const device = measuredDevice(180);
    const layout = createTestLayout({
      racks: [
        createTestRack({
          width: 23,
          devices: [
            createTestDevice({
              id: "shelf-1",
              device_type: shelf.slug,
              position: 30,
            }),
            createTestContainerChild({
              id: "child-1",
              device_type: device.slug,
              container_id: "shelf-1",
              slot_id: "left",
            }),
          ],
        }),
      ],
      device_types: [shelf, device],
    });
    const encoded = encodeLayout(layout);
    expect(typeof encoded).toBe("string");
    const { layout: decoded } = decodeLayout(encoded as string);
    expect(
      decoded?.device_types.find((dt) => dt.slug === device.slug)?.width_mm,
    ).toBe(180);
    expect(decoded?.racks[0]?.width).toBe(23);
  });
});
