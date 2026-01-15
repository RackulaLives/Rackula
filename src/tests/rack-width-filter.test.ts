/**
 * Rack Width Filter Tests
 *
 * Tests for device filtering by rack width compatibility.
 * Core algorithm testing: filtering devices for 10", 19", and 23" racks.
 */

import { describe, it, expect } from "vitest";
import {
  isDeviceCompatibleWithRackWidth,
  filterDevicesByRackWidth,
} from "$lib/utils/deviceFilters";
import { createTestDeviceType } from "./factories";

describe("isDeviceCompatibleWithRackWidth", () => {
  it("device without rack_widths is compatible with 19-inch rack (default)", () => {
    const device = createTestDeviceType({ slug: "standard-server" });

    expect(isDeviceCompatibleWithRackWidth(device, 19)).toBe(true);
    expect(isDeviceCompatibleWithRackWidth(device, 10)).toBe(false);
    expect(isDeviceCompatibleWithRackWidth(device, 23)).toBe(false);
  });

  it("device with empty rack_widths array is treated as 19-inch compatible", () => {
    const device = createTestDeviceType({
      slug: "empty-array-device",
      rack_widths: [],
    });

    expect(isDeviceCompatibleWithRackWidth(device, 19)).toBe(true);
    expect(isDeviceCompatibleWithRackWidth(device, 10)).toBe(false);
  });

  it("device with rack_widths=[10] is only compatible with 10-inch rack", () => {
    const device = createTestDeviceType({
      slug: "ten-inch-device",
      rack_widths: [10],
    });

    expect(isDeviceCompatibleWithRackWidth(device, 10)).toBe(true);
    expect(isDeviceCompatibleWithRackWidth(device, 19)).toBe(false);
    expect(isDeviceCompatibleWithRackWidth(device, 23)).toBe(false);
  });

  it("device with rack_widths=[19] is only compatible with 19-inch rack", () => {
    const device = createTestDeviceType({
      slug: "nineteen-inch-device",
      rack_widths: [19],
    });

    expect(isDeviceCompatibleWithRackWidth(device, 19)).toBe(true);
    expect(isDeviceCompatibleWithRackWidth(device, 10)).toBe(false);
    expect(isDeviceCompatibleWithRackWidth(device, 23)).toBe(false);
  });

  it("device with rack_widths=[23] is only compatible with 23-inch rack", () => {
    const device = createTestDeviceType({
      slug: "twentythree-inch-device",
      rack_widths: [23],
    });

    expect(isDeviceCompatibleWithRackWidth(device, 23)).toBe(true);
    expect(isDeviceCompatibleWithRackWidth(device, 10)).toBe(false);
    expect(isDeviceCompatibleWithRackWidth(device, 19)).toBe(false);
  });

  it("device with multiple rack_widths is compatible with all listed widths", () => {
    const universalDevice = createTestDeviceType({
      slug: "universal-accessory",
      rack_widths: [10, 19, 23],
    });

    expect(isDeviceCompatibleWithRackWidth(universalDevice, 10)).toBe(true);
    expect(isDeviceCompatibleWithRackWidth(universalDevice, 19)).toBe(true);
    expect(isDeviceCompatibleWithRackWidth(universalDevice, 23)).toBe(true);
  });

  it("device with rack_widths=[10, 19] is compatible with both sizes", () => {
    const hybridDevice = createTestDeviceType({
      slug: "hybrid-device",
      rack_widths: [10, 19],
    });

    expect(isDeviceCompatibleWithRackWidth(hybridDevice, 10)).toBe(true);
    expect(isDeviceCompatibleWithRackWidth(hybridDevice, 19)).toBe(true);
    expect(isDeviceCompatibleWithRackWidth(hybridDevice, 23)).toBe(false);
  });
});

describe("filterDevicesByRackWidth", () => {
  const devices = [
    createTestDeviceType({ slug: "standard-server-1" }), // No rack_widths = 19" only
    createTestDeviceType({ slug: "standard-server-2" }), // No rack_widths = 19" only
    createTestDeviceType({ slug: "deskpi-device", rack_widths: [10] }), // 10" only
    createTestDeviceType({
      slug: "universal-shelf",
      rack_widths: [10, 19, 23],
    }), // Universal
    createTestDeviceType({ slug: "telecom-device", rack_widths: [23] }), // 23" only
    createTestDeviceType({
      slug: "explicit-19-inch",
      rack_widths: [19],
    }), // Explicit 19"
  ];

  it("filters devices for 10-inch rack correctly", () => {
    const result = filterDevicesByRackWidth(devices, 10);

    expect(result).toHaveLength(2);
    expect(result.map((d) => d.slug)).toContain("deskpi-device");
    expect(result.map((d) => d.slug)).toContain("universal-shelf");
    expect(result.map((d) => d.slug)).not.toContain("standard-server-1");
    expect(result.map((d) => d.slug)).not.toContain("telecom-device");
  });

  it("filters devices for 19-inch rack correctly", () => {
    const result = filterDevicesByRackWidth(devices, 19);

    expect(result).toHaveLength(4);
    expect(result.map((d) => d.slug)).toContain("standard-server-1");
    expect(result.map((d) => d.slug)).toContain("standard-server-2");
    expect(result.map((d) => d.slug)).toContain("universal-shelf");
    expect(result.map((d) => d.slug)).toContain("explicit-19-inch");
    expect(result.map((d) => d.slug)).not.toContain("deskpi-device");
    expect(result.map((d) => d.slug)).not.toContain("telecom-device");
  });

  it("filters devices for 23-inch rack correctly", () => {
    const result = filterDevicesByRackWidth(devices, 23);

    expect(result).toHaveLength(2);
    expect(result.map((d) => d.slug)).toContain("telecom-device");
    expect(result.map((d) => d.slug)).toContain("universal-shelf");
    expect(result.map((d) => d.slug)).not.toContain("standard-server-1");
    expect(result.map((d) => d.slug)).not.toContain("deskpi-device");
  });

  it("returns empty array when no devices match", () => {
    const onlyTenInchDevices = [
      createTestDeviceType({ slug: "ten-inch-only", rack_widths: [10] }),
    ];

    const result = filterDevicesByRackWidth(onlyTenInchDevices, 23);

    expect(result).toHaveLength(0);
  });

  it("returns all devices when all are compatible", () => {
    const universalDevices = [
      createTestDeviceType({
        slug: "universal-1",
        rack_widths: [10, 19, 23],
      }),
      createTestDeviceType({
        slug: "universal-2",
        rack_widths: [10, 19, 23],
      }),
    ];

    const result = filterDevicesByRackWidth(universalDevices, 10);

    expect(result).toHaveLength(2);
  });

  it("handles empty input array", () => {
    const result = filterDevicesByRackWidth([], 19);

    expect(result).toHaveLength(0);
  });
});
