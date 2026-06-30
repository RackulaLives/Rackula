import { describe, it, expect, beforeEach } from "vitest";
import {
  canResizeRackTo,
  getDeviceRangeText,
  formatConflictMessage,
  getConflictDetails,
  getMinResizeHeight,
  snapResizeHeight,
} from "$lib/utils/rack-resize";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
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

    it("allows shrinking when a device is exactly at the target height boundary", () => {
      const device = createTestDevice({ position: 12 });
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

  describe("getMinResizeHeight", () => {
    it("returns the single-U floor for an empty rack", () => {
      const rack = createTestRack({ height: 42, devices: [] });
      expect(getMinResizeHeight(rack, [])).toBe(1);
    });

    it("returns the highest occupied U for a single device", () => {
      const device = createTestDevice({ position: 40 });
      const rack = createTestRack({ height: 42, devices: [device] });
      const dt = createTestDeviceType({
        slug: device.device_type,
        u_height: 1,
      });
      expect(getMinResizeHeight(rack, [dt])).toBe(40);
    });

    it("accounts for a multi-U device's top edge", () => {
      const device = createTestDevice({ position: 20 });
      const rack = createTestRack({ height: 42, devices: [device] });
      const dt = createTestDeviceType({
        slug: device.device_type,
        u_height: 3,
      });
      // U20 + 3U occupies U20-22, so the rack cannot shrink below 22.
      expect(getMinResizeHeight(rack, [dt])).toBe(22);
    });

    it("takes the maximum top across several devices", () => {
      const low = createTestDevice({ device_type: "a", position: 5 });
      const high = createTestDevice({ device_type: "b", position: 30 });
      const rack = createTestRack({ height: 42, devices: [low, high] });
      const dtA = createTestDeviceType({ slug: "a", u_height: 1 });
      const dtB = createTestDeviceType({ slug: "b", u_height: 2 });
      expect(getMinResizeHeight(rack, [dtA, dtB])).toBe(31);
    });
  });

  describe("snapResizeHeight", () => {
    const base = { minHeight: 1, maxHeight: 100 };

    it("snaps a drag to the nearest whole U", () => {
      // 46px at 20px/U is 2.3U, which rounds down to +2U.
      expect(
        snapResizeHeight({ ...base, startHeight: 10, growPx: 46, pxPerU: 20 }),
      ).toBe(12);
      // 54px at 20px/U is 2.7U, which rounds up to +3U.
      expect(
        snapResizeHeight({ ...base, startHeight: 10, growPx: 54, pxPerU: 20 }),
      ).toBe(13);
    });

    it("shrinks on a negative (toward-body) drag", () => {
      expect(
        snapResizeHeight({ ...base, startHeight: 24, growPx: -40, pxPerU: 20 }),
      ).toBe(22);
    });

    it("clamps growth to the schema maximum", () => {
      expect(
        snapResizeHeight({
          ...base,
          startHeight: 90,
          growPx: 10000,
          pxPerU: 20,
        }),
      ).toBe(100);
    });

    it("clamps a shrink to the highest occupied U (no clipping)", () => {
      // A device fixes the floor at 12U; an aggressive shrink stops there.
      expect(
        snapResizeHeight({
          startHeight: 24,
          growPx: -10000,
          pxPerU: 20,
          minHeight: 12,
          maxHeight: 100,
        }),
      ).toBe(12);
    });

    it("holds the start height when pxPerU is degenerate", () => {
      expect(
        snapResizeHeight({ ...base, startHeight: 24, growPx: 100, pxPerU: 0 }),
      ).toBe(24);
    });
  });

  describe("resize via the layout store", () => {
    beforeEach(() => {
      resetLayoutStore();
    });

    it("keeps device positions across grow then shrink, and undo reverts one step", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 24)!;
      const dt = createTestDeviceType({ slug: "server-2u", u_height: 2 });
      store.addDeviceTypeRaw(dt);
      store.placeDevice(rack.id, dt.slug, 10);

      const positionsBefore = store
        .getRackById(rack.id)!
        .devices.map((d) => d.position);

      // Grow: empty U is added at the open end, placed gear keeps its U-number.
      store.updateRack(rack.id, { height: 42 });
      expect(store.getRackById(rack.id)!.height).toBe(42);
      expect(
        store.getRackById(rack.id)!.devices.map((d) => d.position),
      ).toEqual(positionsBefore);

      // Shrink back to a height that still clears the device's top (U11).
      store.updateRack(rack.id, { height: 12 });
      expect(store.getRackById(rack.id)!.height).toBe(12);
      expect(
        store.getRackById(rack.id)!.devices.map((d) => d.position),
      ).toEqual(positionsBefore);

      // A single undo reverts the last resize, not the device placement: the
      // height returns and every device keeps its U-number (no renumbering).
      store.undo();
      expect(store.getRackById(rack.id)!.height).toBe(42);
      expect(
        store.getRackById(rack.id)!.devices.map((d) => d.position),
      ).toEqual(positionsBefore);

      // Redo reapplies the shrink step and still preserves device U-numbers.
      store.redo();
      expect(store.getRackById(rack.id)!.height).toBe(12);
      expect(
        store.getRackById(rack.id)!.devices.map((d) => d.position),
      ).toEqual(positionsBefore);
    });

    it("updateRackRaw targets the given rack id, not the active rack", () => {
      // The live resize preview writes to the dragged rack by id. If a
      // cycle-rack shortcut changes the active rack mid-drag, the preview must
      // still resize the rack under the grip, never the newly active one.
      const store = getLayoutStore();
      const rackA = store.addRack("Rack A", 24)!;
      const rackB = store.addRack("Rack B", 18)!;
      store.setActiveRack(rackB.id);

      store.updateRackRaw({ height: 30 }, rackA.id);

      expect(store.getRackById(rackA.id)!.height).toBe(30);
      expect(store.getRackById(rackB.id)!.height).toBe(18);
    });

    it("updateRackRaw falls back to the active rack when rack id is omitted", () => {
      const store = getLayoutStore();
      const rackA = store.addRack("Rack A", 24)!;
      const rackB = store.addRack("Rack B", 18)!;
      store.setActiveRack(rackB.id);

      store.updateRackRaw({ height: 30 });

      expect(store.getRackById(rackA.id)!.height).toBe(24);
      expect(store.getRackById(rackB.id)!.height).toBe(30);
    });
  });
});
