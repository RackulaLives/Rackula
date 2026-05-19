import { describe, it, expect } from "vitest";
import {
  canResizeRackTo,
  getDeviceRangeText,
  formatConflictMessage,
  getConflictDetails,
} from "$lib/utils/rack-resize";
import {
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";

describe("rack-resize", () => {
  describe("canResizeRackTo", () => {
    it("allows growing the rack regardless of contents", () => {
      const device = createTestDevice({ position: 40 });
      const rack = createTestRack({ height: 24, devices: [device] });
      const dt = createTestDeviceType({
        slug: device.device_type,
        u_height: 1,
      });

      const result = canResizeRackTo(rack, 42, [dt]);
      expect(result.allowed).toBe(true);
      expect(result.conflicts).toEqual([]);
    });

    it("allows shrinking when all devices fit in the new height (#1683)", () => {
      // Repro from #1683: place a device at U5, then attempt resize to 42U.
      // device.position is stored in internal units; the validator must
      // convert before comparing against the new (human) height.
      const device = createTestDevice({ position: 5 });
      const rack = createTestRack({ height: 42, devices: [device] });
      const dt = createTestDeviceType({
        slug: device.device_type,
        u_height: 1,
      });

      const result = canResizeRackTo(rack, 12, [dt]);
      expect(result.allowed).toBe(true);
      expect(result.conflicts).toEqual([]);
    });

    it("blocks shrinking when a device would exceed the new height", () => {
      const device = createTestDevice({ position: 20 });
      const rack = createTestRack({ height: 42, devices: [device] });
      const dt = createTestDeviceType({
        slug: device.device_type,
        u_height: 2,
      });

      const result = canResizeRackTo(rack, 10, [dt]);
      expect(result.allowed).toBe(false);
      expect(result.conflicts).toContain(device);
    });
  });

  describe("getDeviceRangeText", () => {
    it("renders a single-U device as U<position>", () => {
      const device = createTestDevice({ position: 5 });
      const dt = createTestDeviceType({
        slug: device.device_type,
        u_height: 1,
      });

      expect(getDeviceRangeText(device, dt)).toBe("U5");
    });

    it("renders a multi-U device as U<bottom>-<top>", () => {
      const device = createTestDevice({ position: 10 });
      const dt = createTestDeviceType({
        slug: device.device_type,
        u_height: 3,
      });

      expect(getDeviceRangeText(device, dt)).toBe("U10-12");
    });

    it("displays human U, not internal units (#1683)", () => {
      // Without conversion, this would render as "U228" because the device's
      // internal position is 38 * UNITS_PER_U = 228 and earlier code wrote
      // that raw value into the U message.
      const device = createTestDevice({ position: 38 });
      const dt = createTestDeviceType({
        slug: device.device_type,
        u_height: 1,
      });

      expect(getDeviceRangeText(device, dt)).toBe("U38");
    });
  });

  describe("formatConflictMessage", () => {
    it("joins multiple conflicts with comma", () => {
      const d1 = createTestDevice({ device_type: "switch-slug", position: 10 });
      const d2 = createTestDevice({
        device_type: "storage-slug",
        position: 20,
      });
      const dt1 = createTestDeviceType({
        slug: "switch-slug",
        model: "Switch",
        u_height: 1,
      });
      const dt2 = createTestDeviceType({
        slug: "storage-slug",
        model: "Storage",
        u_height: 3,
      });

      const conflicts = getConflictDetails([d1, d2], [dt1, dt2]);
      expect(formatConflictMessage(conflicts)).toBe(
        "Switch at U10, Storage at U20-22",
      );
    });
  });
});
