/**
 * Rack Width Filter Tests
 *
 * Tests for device filtering by rack width compatibility.
 * Uses "minimum width" logic: rack width >= device width means compatible.
 * This allows 19" devices to fit in 21" and 23" racks.
 */

import { describe, it, expect } from "vitest";
import {
  isDeviceCompatibleWithRackWidth,
  filterDevicesByRackWidth,
} from "$lib/utils/deviceFilters";
import { createTestDeviceType } from "./factories";

describe("isDeviceCompatibleWithRackWidth", () => {
  describe("default behavior (no rack_widths)", () => {
    it("device without rack_widths defaults to 19-inch and fits 19+ racks", () => {
      const device = createTestDeviceType({ slug: "standard-server" });

      // Default 19" device fits in 19", 21", 23" racks
      expect(isDeviceCompatibleWithRackWidth(device, 19)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(device, 21)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(device, 23)).toBe(true);
      // But not in 10" rack (too narrow)
      expect(isDeviceCompatibleWithRackWidth(device, 10)).toBe(false);
    });

    it("device with empty rack_widths array is treated as 19-inch compatible", () => {
      const device = createTestDeviceType({
        slug: "empty-array-device",
        rack_widths: [],
      });

      expect(isDeviceCompatibleWithRackWidth(device, 19)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(device, 21)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(device, 10)).toBe(false);
    });
  });

  describe("10-inch devices (mini rack form factor)", () => {
    it("10-inch device fits in any rack (smallest form factor)", () => {
      const device = createTestDeviceType({
        slug: "ten-inch-device",
        rack_widths: [10],
      });

      // 10" devices can fit in any rack since they're the smallest
      expect(isDeviceCompatibleWithRackWidth(device, 10)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(device, 19)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(device, 21)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(device, 23)).toBe(true);
    });
  });

  describe("19-inch devices (standard rack)", () => {
    it("19-inch device fits in 19, 21, and 23-inch racks", () => {
      const device = createTestDeviceType({
        slug: "nineteen-inch-device",
        rack_widths: [19],
      });

      // 19" device fits in any rack >= 19"
      expect(isDeviceCompatibleWithRackWidth(device, 19)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(device, 21)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(device, 23)).toBe(true);
      // But not 10" (too narrow)
      expect(isDeviceCompatibleWithRackWidth(device, 10)).toBe(false);
    });
  });

  describe("23-inch devices (telecom/wide rack)", () => {
    it("23-inch device only fits in 23-inch rack", () => {
      const device = createTestDeviceType({
        slug: "twentythree-inch-device",
        rack_widths: [23],
      });

      // 23" device needs at least 23" rack
      expect(isDeviceCompatibleWithRackWidth(device, 23)).toBe(true);
      // Doesn't fit in narrower racks
      expect(isDeviceCompatibleWithRackWidth(device, 21)).toBe(false);
      expect(isDeviceCompatibleWithRackWidth(device, 19)).toBe(false);
      expect(isDeviceCompatibleWithRackWidth(device, 10)).toBe(false);
    });
  });

  describe("21-inch racks (issue #665 fix)", () => {
    it("21-inch rack shows 19-inch compatible devices", () => {
      const standardDevice = createTestDeviceType({
        slug: "standard-19-inch",
        rack_widths: [19],
      });
      const telecomDevice = createTestDeviceType({
        slug: "telecom-23-inch",
        rack_widths: [23],
      });

      // 19" device fits in 21" rack
      expect(isDeviceCompatibleWithRackWidth(standardDevice, 21)).toBe(true);
      // 23" device doesn't fit in 21" rack (needs more width)
      expect(isDeviceCompatibleWithRackWidth(telecomDevice, 21)).toBe(false);
    });
  });

  describe("universal/multi-width devices", () => {
    it("device with rack_widths=[10, 19, 23] fits all racks", () => {
      const universalDevice = createTestDeviceType({
        slug: "universal-accessory",
        rack_widths: [10, 19, 23],
      });

      expect(isDeviceCompatibleWithRackWidth(universalDevice, 10)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(universalDevice, 19)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(universalDevice, 21)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(universalDevice, 23)).toBe(true);
    });

    it("device with rack_widths=[10, 19] fits all racks (smallest width is 10)", () => {
      const hybridDevice = createTestDeviceType({
        slug: "hybrid-device",
        rack_widths: [10, 19],
      });

      // Since it supports 10", it fits any rack >= 10"
      expect(isDeviceCompatibleWithRackWidth(hybridDevice, 10)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(hybridDevice, 19)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(hybridDevice, 21)).toBe(true);
      expect(isDeviceCompatibleWithRackWidth(hybridDevice, 23)).toBe(true);
    });
  });
});

describe("filterDevicesByRackWidth", () => {
  // Test device set with various rack width configurations
  const devices = [
    createTestDeviceType({ slug: "standard-server-1" }), // No rack_widths = 19" default
    createTestDeviceType({ slug: "standard-server-2" }), // No rack_widths = 19" default
    createTestDeviceType({ slug: "deskpi-device", rack_widths: [10] }), // 10" mini rack
    createTestDeviceType({
      slug: "universal-shelf",
      rack_widths: [10, 19, 23],
    }), // Universal
    createTestDeviceType({ slug: "telecom-device", rack_widths: [23] }), // 23" telecom only
    createTestDeviceType({
      slug: "explicit-19-inch",
      rack_widths: [19],
    }), // Explicit 19"
  ];

  it("10-inch rack shows only 10-inch compatible devices", () => {
    const result = filterDevicesByRackWidth(devices, 10);
    const slugs = result.map((d) => d.slug);

    // Only devices with 10" support fit in 10" rack
    expect(slugs).toContain("deskpi-device");
    expect(slugs).toContain("universal-shelf");
    // 19" and 23" devices don't fit
    expect(slugs).not.toContain("standard-server-1");
    expect(slugs).not.toContain("telecom-device");
    expect(slugs).not.toContain("explicit-19-inch");
  });

  it("19-inch rack shows 10-inch and 19-inch devices (minimum width logic)", () => {
    const result = filterDevicesByRackWidth(devices, 19);
    const slugs = result.map((d) => d.slug);

    // 10" and 19" devices fit in 19" rack
    expect(slugs).toContain("deskpi-device"); // 10" fits in larger rack
    expect(slugs).toContain("universal-shelf"); // Has 10", fits anywhere
    expect(slugs).toContain("standard-server-1"); // Default 19"
    expect(slugs).toContain("standard-server-2"); // Default 19"
    expect(slugs).toContain("explicit-19-inch"); // Explicit 19"
    // 23" device doesn't fit (too wide)
    expect(slugs).not.toContain("telecom-device");
  });

  it("21-inch rack shows all devices except 23-inch only (issue #665)", () => {
    const result = filterDevicesByRackWidth(devices, 21);
    const slugs = result.map((d) => d.slug);

    // All devices with width <= 21" fit
    expect(slugs).toContain("deskpi-device"); // 10" fits
    expect(slugs).toContain("universal-shelf"); // Has 10", fits
    expect(slugs).toContain("standard-server-1"); // 19" fits
    expect(slugs).toContain("standard-server-2"); // 19" fits
    expect(slugs).toContain("explicit-19-inch"); // 19" fits
    // 23" device doesn't fit in 21" rack
    expect(slugs).not.toContain("telecom-device");
  });

  it("23-inch rack shows all devices (widest rack)", () => {
    const result = filterDevicesByRackWidth(devices, 23);
    const slugs = result.map((d) => d.slug);

    // All devices fit in 23" rack
    expect(slugs).toContain("deskpi-device");
    expect(slugs).toContain("universal-shelf");
    expect(slugs).toContain("standard-server-1");
    expect(slugs).toContain("standard-server-2");
    expect(slugs).toContain("explicit-19-inch");
    expect(slugs).toContain("telecom-device"); // Finally fits!
  });

  it("returns empty array when no devices match narrow rack", () => {
    const onlyWideDevices = [
      createTestDeviceType({ slug: "wide-only", rack_widths: [23] }),
    ];

    // 23" device doesn't fit in 10" rack
    const result = filterDevicesByRackWidth(onlyWideDevices, 10);

    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: no devices match narrow rack
    expect(result).toHaveLength(0);
  });

  it("10-inch devices fit in all racks due to minimum width logic", () => {
    const smallDevices = [
      createTestDeviceType({ slug: "mini-1", rack_widths: [10] }),
      createTestDeviceType({ slug: "mini-2", rack_widths: [10] }),
    ];

    // 10" devices fit in any rack
    expect(
      filterDevicesByRackWidth(smallDevices, 10).map((d) => d.slug),
    ).toEqual(["mini-1", "mini-2"]);
    expect(
      filterDevicesByRackWidth(smallDevices, 19).map((d) => d.slug),
    ).toEqual(["mini-1", "mini-2"]);
    expect(
      filterDevicesByRackWidth(smallDevices, 21).map((d) => d.slug),
    ).toEqual(["mini-1", "mini-2"]);
    expect(
      filterDevicesByRackWidth(smallDevices, 23).map((d) => d.slug),
    ).toEqual(["mini-1", "mini-2"]);
  });

  it("handles empty input array", () => {
    const result = filterDevicesByRackWidth([], 19);

    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: empty input produces empty output
    expect(result).toHaveLength(0);
  });
});
