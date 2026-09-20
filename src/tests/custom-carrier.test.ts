/**
 * Generated carrier types for a custom split.
 *
 * A custom split matches no shipped carrier, so one type is generated per
 * distinct split. The slug is a fingerprint of the split itself, so two
 * carriers cut the same way share one type, including across two merged
 * files, and the library does not grow once per placed carrier.
 */
import { describe, it, expect } from "vitest";
import {
  customCarrierSlug,
  buildCustomCarrierType,
  cellForDevice,
  isGeneratedCarrier,
  orphanGeneratedTypes,
} from "$lib/utils/custom-carrier";
import { getRackOpeningMm } from "$lib/utils/device-width";
import {
  createTestDevice,
  createTestDeviceType,
  createTestRack,
} from "./factories";

const cells = [
  { widthFraction: 0.25, heightUnits: 1 },
  { widthFraction: 0.25, heightUnits: 1 },
];

describe("customCarrierSlug", () => {
  it("gives the same split the same slug every time", () => {
    expect(customCarrierSlug(1, cells, [20])).toBe(
      customCarrierSlug(1, cells, [20]),
    );
  });

  it("gives different splits different slugs", () => {
    const base = customCarrierSlug(1, cells, [20]);

    expect(customCarrierSlug(1, cells, [30])).not.toBe(base);
    expect(customCarrierSlug(2, cells, [20])).not.toBe(base);
    expect(
      customCarrierSlug(
        1,
        [...cells, { widthFraction: 0.1, heightUnits: 1 }],
        [20, 0],
      ),
    ).not.toBe(base);
  });

  it("names the height so a slug reads at a glance", () => {
    expect(customCarrierSlug(2, cells, [0])).toMatch(/^carrier-2u-custom-/);
  });
});

describe("buildCustomCarrierType", () => {
  it("builds one cell per entry, numbered left to right", () => {
    const type = buildCustomCarrierType(1, cells, [20]);

    expect(type.slots?.map((s) => [s.id, s.position.col])).toEqual([
      ["col-1", 0],
      ["col-2", 1],
    ]);
    expect(type.slots?.every((s) => s.position.row === 0)).toBe(true);
    expect(type.slot_gaps).toEqual([20]);
    expect(type.u_height).toBe(1);
  });

  it("marks the type generated so it stays out of the catalogue", () => {
    expect(isGeneratedCarrier(buildCustomCarrierType(1, cells, [0]))).toBe(
      true,
    );
    expect(isGeneratedCarrier(createTestDeviceType())).toBe(false);
  });
});

describe("cellForDevice", () => {
  it("sizes a measured device's cell to its exact width", () => {
    const device = createTestDeviceType({ u_height: 1, width_mm: 100 });
    const cell = cellForDevice(device, 19);

    expect(cell.widthFraction).toBeCloseTo(100 / getRackOpeningMm(19), 6);
    expect(cell.heightUnits).toBe(1);
  });

  it("gives half-width gear a half cell", () => {
    const device = createTestDeviceType({ u_height: 1, slot_width: 1 });

    expect(cellForDevice(device, 19).widthFraction).toBe(0.5);
  });
});

describe("orphanGeneratedTypes", () => {
  it("lists generated types no placed carrier uses any more", () => {
    const used = buildCustomCarrierType(1, cells, [0]);
    const stale = buildCustomCarrierType(1, cells, [20]);
    const rack = createTestRack({
      devices: [createTestDevice({ device_type: used.slug, position: 1 })],
    });

    expect(orphanGeneratedTypes([used, stale], [rack])).toEqual([stale.slug]);
  });

  it("never lists an authored type", () => {
    const authored = createTestDeviceType({ slug: "my-shelf" });

    expect(orphanGeneratedTypes([authored], [createTestRack()])).toEqual([]);
  });
});
