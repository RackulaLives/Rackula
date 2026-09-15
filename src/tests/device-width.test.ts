/**
 * Measured device width (#3310)
 *
 * A device type may carry its physical width in millimetres (width_mm). Inside
 * a container, the device fits a slot when its share of the rack's clear
 * opening is no wider than the slot's width_fraction. Devices without width_mm
 * keep the slot_width mapping (1 = half, 2 = full).
 */
import { describe, it, expect } from "vitest";
import { LayoutSchema } from "$lib/schemas";
import {
  canPlaceInSlot,
  requiresCarrier,
  synthesizeCarrierForDevice,
  CARRIER_2COL_SLUG,
} from "$lib/utils/collision";
import {
  getRackOpeningMm,
  toMillimetres,
  formatWidthMm,
} from "$lib/utils/device-width";
import { findStarterDevice } from "$lib/data/starterLibrary";
import { serializeLayoutToYaml, parseLayoutYaml } from "$lib/utils/yaml";
import { encodeLayout, decodeLayout } from "$lib/utils/share";
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

describe("rack clear opening", () => {
  it("is the nominal width minus 1.25 in", () => {
    expect(getRackOpeningMm(19)).toBeCloseTo(450.85);
    expect(getRackOpeningMm(10)).toBeCloseTo(222.25);
  });
});

describe("canPlaceInSlot with width_mm", () => {
  it("fits a third-width slot in a 19 inch rack when narrow enough", () => {
    expect(canPlaceInSlot(measuredDevice(140), thirdSlot, 19)).toBe(true);
    expect(canPlaceInSlot(measuredDevice(160), thirdSlot, 19)).toBe(false);
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

  it("lets the starter 3-slot shelf hold a measured device", () => {
    const shelf = findStarterDevice("shelf-1u-3slot")!;
    const fitting = shelf.slots!.filter((s) =>
      canPlaceInSlot(measuredDevice(140), s, 19),
    );
    expect(fitting.map((s) => s.id)).toEqual(["left", "center", "right"]);
  });
});

describe("carrier-first rule for measured devices", () => {
  it("requires a carrier and synthesises the column carrier", () => {
    const device = measuredDevice(72);
    expect(requiresCarrier(device)).toBe(true);
    expect(synthesizeCarrierForDevice(device)).toBe(CARRIER_2COL_SLUG);
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

describe("width units", () => {
  it("converts metric and imperial input to millimetres", () => {
    expect(toMillimetres(72, "mm")).toBe(72);
    expect(toMillimetres(7.2, "cm")).toBe(72);
    expect(toMillimetres(2.83, "in")).toBe(71.9);
  });

  it("formats a width in both unit systems", () => {
    expect(formatWidthMm(72)).toBe("72 mm (2.83 in)");
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

  it("survives a share link round-trip", () => {
    const shelf = findStarterDevice("shelf-1u-3slot")!;
    const device = measuredDevice(140);
    const layout = createTestLayout({
      racks: [
        createTestRack({
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
    ).toBe(140);
  });
});
