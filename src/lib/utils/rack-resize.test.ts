import { describe, it, expect } from "vitest";
import { canResizeRackTo, getDeviceRangeText } from "./rack-resize";
import { createTestRack, createTestDeviceType } from "../../tests/factories";
import { toInternalUnits } from "./position";
import type { PlacedDevice } from "$lib/types";

/**
 * Regression tests for the rack-resize unit-mismatch bug.
 *
 * Background: `PlacedDevice.position` is stored in internal units (1/6U,
 * UNITS_PER_U = 6). `DeviceType.u_height` and `Rack.height` are in human U.
 * The old implementation mixed the two:
 *   - canResizeRackTo computed `position + uHeight - 1` then compared to
 *     `newHeight` (human U), producing phantom conflicts (#1624).
 *   - getDeviceRangeText returned the raw internal position as the bottom U
 *     label, producing nonsense like "U30" or "U228" (#1683).
 */

describe("canResizeRackTo — unit-mismatch regression (#1624)", () => {
  it("allows shrink when devices fit in human-U terms", () => {
    const deviceType = createTestDeviceType({ slug: "srv-1u", u_height: 1 });
    const rack = createTestRack({
      height: 12,
      devices: [
        {
          id: "d1",
          device_type: "srv-1u",
          position: toInternalUnits(1),
          face: "front",
        },
        {
          id: "d2",
          device_type: "srv-1u",
          position: toInternalUnits(2),
          face: "front",
        },
        {
          id: "d3",
          device_type: "srv-1u",
          position: toInternalUnits(3),
          face: "front",
        },
      ],
    });

    const result = canResizeRackTo(rack, 6, [deviceType]);
    expect(result.allowed).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it("correctly rejects shrink when device top exceeds new height", () => {
    const deviceType = createTestDeviceType({ slug: "srv-2u", u_height: 2 });
    const rack = createTestRack({
      height: 12,
      devices: [
        {
          id: "d1",
          device_type: "srv-2u",
          position: toInternalUnits(10),
          face: "front",
        }, // occupies U10–U11
      ],
    });

    const result = canResizeRackTo(rack, 9, [deviceType]);
    expect(result.allowed).toBe(false);
    expect(result.conflicts.map((c) => c.id)).toEqual(["d1"]);
  });

  it("allows shrink that exactly matches the highest device top", () => {
    const deviceType = createTestDeviceType({ slug: "srv-2u", u_height: 2 });
    const rack = createTestRack({
      height: 12,
      devices: [
        {
          id: "d1",
          device_type: "srv-2u",
          position: toInternalUnits(9),
          face: "front",
        }, // occupies U9–U10
      ],
    });

    // New height 10 should fit the device that ends at U10 exactly.
    const result = canResizeRackTo(rack, 10, [deviceType]);
    expect(result.allowed).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it("treats growing the rack as always allowed", () => {
    const deviceType = createTestDeviceType({ slug: "srv-1u", u_height: 1 });
    const rack = createTestRack({
      height: 12,
      devices: [
        {
          id: "d1",
          device_type: "srv-1u",
          position: toInternalUnits(11),
          face: "front",
        },
      ],
    });

    const result = canResizeRackTo(rack, 42, [deviceType]);
    expect(result.allowed).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it("handles half-U devices on fractional boundaries", () => {
    // A 0.5U device at U6 occupies the lower half of U6 (positions 36–38
    // internally). It fits in a 6U rack but not in a 5U one.
    const deviceType = createTestDeviceType({
      slug: "srv-half",
      u_height: 0.5,
    });
    const rack = createTestRack({
      height: 12,
      devices: [
        {
          id: "d1",
          device_type: "srv-half",
          position: toInternalUnits(6),
          face: "front",
        },
      ],
    });

    expect(canResizeRackTo(rack, 6, [deviceType]).allowed).toBe(true);
    expect(canResizeRackTo(rack, 5, [deviceType]).allowed).toBe(false);
  });
});

describe("getDeviceRangeText — display regression (#1683)", () => {
  it("renders single-U device as human U, not internal units", () => {
    const deviceType = createTestDeviceType({ slug: "srv-1u", u_height: 1 });
    const device: PlacedDevice = {
      id: "d1",
      device_type: "srv-1u",
      position: toInternalUnits(5), // internal = 30
      face: "front",
    };

    expect(getDeviceRangeText(device, deviceType)).toBe("U5");
  });

  it("renders multi-U device range as human U", () => {
    const deviceType = createTestDeviceType({ slug: "srv-2u", u_height: 2 });
    const device: PlacedDevice = {
      id: "d1",
      device_type: "srv-2u",
      position: toInternalUnits(5),
      face: "front",
    };

    expect(getDeviceRangeText(device, deviceType)).toBe("U5-6");
  });

  it("renders 3U device range correctly", () => {
    const deviceType = createTestDeviceType({ slug: "srv-3u", u_height: 3 });
    const device: PlacedDevice = {
      id: "d1",
      device_type: "srv-3u",
      position: toInternalUnits(10),
      face: "front",
    };

    expect(getDeviceRangeText(device, deviceType)).toBe("U10-12");
  });

  it("falls back to 1U when the device type is unknown", () => {
    const device: PlacedDevice = {
      id: "d1",
      device_type: "missing",
      position: toInternalUnits(7),
      face: "front",
    };

    expect(getDeviceRangeText(device, undefined)).toBe("U7");
  });
});
