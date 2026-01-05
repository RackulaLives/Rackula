import { describe, it, expect } from "vitest";
import {
  getDeviceURange,
  doRangesOverlap,
  doFacesCollide,
  doSlotsOverlap,
  canPlaceDevice,
  findCollisions,
  findValidDropPositions,
  snapToNearestValidPosition,
} from "$lib/utils/collision";
import type {
  DeviceType,
  Rack,
  DeviceFace,
  SlotPosition,
  SlotWidth,
} from "$lib/types";

// Helper to create test devices
function createTestDevice(
  slug: string,
  u_height: number,
  options?: {
    is_full_depth?: boolean;
    face?: DeviceFace;
    slot_width?: SlotWidth;
  },
): DeviceType {
  return {
    slug,
    model: `Test Device ${slug}`,
    u_height,
    colour: "#4A90D9",
    category: "server",
    ...(options?.is_full_depth !== undefined && {
      is_full_depth: options.is_full_depth,
    }),
    ...(options?.face !== undefined && { face: options.face }),
    ...(options?.slot_width !== undefined && {
      slot_width: options.slot_width,
    }),
  };
}

// Helper to create test rack
function createTestRack(
  height: number,
  devices: {
    device_type: string;
    position: number;
    face?: DeviceFace;
    slot_position?: SlotPosition;
  }[] = [],
): Rack {
  return {
    name: "Test Rack",
    height,
    width: 19,
    position: 0,
    desc_units: false,
    form_factor: "4-post",
    starting_unit: 1,
    devices: devices.map((d) => ({
      ...d,
      face: d.face ?? ("front" as const),
      ...(d.slot_position && { slot_position: d.slot_position }),
    })),
  };
}

describe("Collision Detection", () => {
  describe("getDeviceURange", () => {
    it("returns {bottom:5, top:5} for 1U device at position 5", () => {
      const range = getDeviceURange(5, 1);
      expect(range).toEqual({ bottom: 5, top: 5 });
    });

    it("returns {bottom:5, top:6} for 2U device at position 5", () => {
      const range = getDeviceURange(5, 2);
      expect(range).toEqual({ bottom: 5, top: 6 });
    });

    it("returns {bottom:10, top:13} for 4U device at position 10", () => {
      const range = getDeviceURange(10, 4);
      expect(range).toEqual({ bottom: 10, top: 13 });
    });
  });

  describe("doRangesOverlap", () => {
    it("returns false for {1,2} and {3,4} (adjacent)", () => {
      expect(
        doRangesOverlap({ bottom: 1, top: 2 }, { bottom: 3, top: 4 }),
      ).toBe(false);
    });

    it("returns true for {1,3} and {2,4} (partial overlap)", () => {
      expect(
        doRangesOverlap({ bottom: 1, top: 3 }, { bottom: 2, top: 4 }),
      ).toBe(true);
    });

    it("returns true for {1,4} and {2,3} (containment)", () => {
      expect(
        doRangesOverlap({ bottom: 1, top: 4 }, { bottom: 2, top: 3 }),
      ).toBe(true);
    });

    it("returns true for {2,3} and {1,4} (reverse containment)", () => {
      expect(
        doRangesOverlap({ bottom: 2, top: 3 }, { bottom: 1, top: 4 }),
      ).toBe(true);
    });

    it("returns true for {1,2} and {2,3} (edge touch)", () => {
      expect(
        doRangesOverlap({ bottom: 1, top: 2 }, { bottom: 2, top: 3 }),
      ).toBe(true);
    });
  });

  describe("canPlaceDevice", () => {
    it("returns true for empty rack", () => {
      const rack = createTestRack(42);
      const deviceLibrary: DeviceType[] = [];

      expect(canPlaceDevice(rack, deviceLibrary, 1, 1)).toBe(true);
      expect(canPlaceDevice(rack, deviceLibrary, 4, 10)).toBe(true);
    });

    it("returns false when device would exceed rack top", () => {
      const rack = createTestRack(42);
      const deviceLibrary: DeviceType[] = [];

      // 4U device at position 40 would occupy 40,41,42,43 - but rack only has 42
      expect(canPlaceDevice(rack, deviceLibrary, 4, 40)).toBe(false);
    });

    it("returns false for position less than 1", () => {
      const rack = createTestRack(42);
      const deviceLibrary: DeviceType[] = [];

      expect(canPlaceDevice(rack, deviceLibrary, 1, 0)).toBe(false);
      expect(canPlaceDevice(rack, deviceLibrary, 1, -1)).toBe(false);
    });

    it("returns false for collision with existing device", () => {
      const device1 = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5 },
      ]);

      // device-1 occupies 5,6. Placing 2U device at 4 would occupy 4,5 - collision!
      expect(canPlaceDevice(rack, [device1], 2, 4)).toBe(false);
      // Placing at 5 - collision!
      expect(canPlaceDevice(rack, [device1], 1, 5)).toBe(false);
      // Placing at 6 - collision!
      expect(canPlaceDevice(rack, [device1], 1, 6)).toBe(false);
    });

    it("returns true for position adjacent to existing device", () => {
      const device1 = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5 },
      ]);

      // device-1 occupies 5,6. Position 7 is adjacent and valid
      expect(canPlaceDevice(rack, [device1], 1, 7)).toBe(true);
      // Position 4 with 1U device occupies only 4 - valid
      expect(canPlaceDevice(rack, [device1], 1, 4)).toBe(true);
    });
  });

  describe("findCollisions", () => {
    it("returns empty array when no collisions", () => {
      const device1 = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5 },
      ]);

      const collisions = findCollisions(rack, [device1], 1, 10);
      expect(collisions).toEqual([]);
    });

    it("returns colliding devices", () => {
      const device1 = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5 },
      ]);

      const collisions = findCollisions(rack, [device1], 2, 4);
      expect(collisions).toHaveLength(1);
      expect(collisions[0]).toEqual({
        device_type: "device-1",
        position: 5,
        face: "front",
      });
    });

    it("excludes device at excludeIndex (for move operations)", () => {
      const device1 = createTestDevice("device-1", 2);
      const device2 = createTestDevice("device-2", 1);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5 },
        { device_type: "device-2", position: 10 },
      ]);

      // Moving device at index 0 - should exclude it from collision check
      const collisions = findCollisions(rack, [device1, device2], 2, 5, 0);
      expect(collisions).toEqual([]);
    });
  });

  describe("findValidDropPositions", () => {
    it("returns [1..rackHeight-deviceHeight+1] for empty rack", () => {
      const rack = createTestRack(10);
      const deviceLibrary: DeviceType[] = [];

      // 1U device can go in positions 1-10
      const positions1U = findValidDropPositions(rack, deviceLibrary, 1);
      expect(positions1U).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      // 2U device can go in positions 1-9 (top at 10)
      const positions2U = findValidDropPositions(rack, deviceLibrary, 2);
      expect(positions2U).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it("excludes positions that would collide", () => {
      const device1 = createTestDevice("device-1", 2);
      const rack = createTestRack(10, [
        { device_type: "device-1", position: 5 },
      ]);

      // 1U device: device-1 at 5,6 blocks positions 5 and 6
      const positions1U = findValidDropPositions(rack, [device1], 1);
      expect(positions1U).toEqual([1, 2, 3, 4, 7, 8, 9, 10]);

      // 2U device: positions 4,5,6 would collide with device at 5,6
      const positions2U = findValidDropPositions(rack, [device1], 2);
      expect(positions2U).toEqual([1, 2, 3, 7, 8, 9]);
    });

    it("returns empty array when rack is full", () => {
      // Fill rack completely with 1U devices
      const devices: DeviceType[] = [];
      const placedDevices: { device_type: string; position: number }[] = [];
      for (let i = 1; i <= 5; i++) {
        devices.push(createTestDevice(`device-${i}`, 1));
        placedDevices.push({ device_type: `device-${i}`, position: i });
      }
      const rack = createTestRack(5, placedDevices);

      const positions = findValidDropPositions(rack, devices, 1);
      expect(positions).toEqual([]);
    });
  });

  describe("snapToNearestValidPosition", () => {
    const uHeight = 22; // pixels per U

    it("returns exact position if valid", () => {
      const rack = createTestRack(42);
      const deviceLibrary: DeviceType[] = [];

      // Target Y for position 5 (from top of rack)
      const targetY = (42 - 5) * uHeight;
      const result = snapToNearestValidPosition(
        rack,
        deviceLibrary,
        1,
        targetY,
        uHeight,
      );
      expect(result).toBe(5);
    });

    it("returns nearest valid position", () => {
      const device1 = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5 },
      ]);

      // Target somewhere near position 5 (which is blocked)
      const targetY = (42 - 5) * uHeight;
      const result = snapToNearestValidPosition(
        rack,
        [device1],
        1,
        targetY,
        uHeight,
      );
      // Should snap to nearest valid: either 4 or 7
      expect(result === 4 || result === 7).toBe(true);
    });

    it("returns null when no valid positions", () => {
      // Fill rack completely
      const devices: DeviceType[] = [];
      const placedDevices: { device_type: string; position: number }[] = [];
      for (let i = 1; i <= 5; i++) {
        devices.push(createTestDevice(`device-${i}`, 1));
        placedDevices.push({ device_type: `device-${i}`, position: i });
      }
      const rack = createTestRack(5, placedDevices);

      const result = snapToNearestValidPosition(rack, devices, 1, 50, uHeight);
      expect(result).toBeNull();
    });
  });
});

describe("Face Independence", () => {
  describe("canPlaceDevice with face parameter", () => {
    it("allows placing half-depth device on rear when half-depth front is occupied at same position", () => {
      // Half-depth device mounted on front at position 5
      const device = createTestDevice("device-1", 2, { is_full_depth: false });
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5, face: "front" },
      ]);

      // Should be able to place a 2U half-depth device on rear at same position
      expect(
        canPlaceDevice(rack, [device], 2, 5, undefined, "rear", false),
      ).toBe(true);
    });

    it("allows placing half-depth device on front when half-depth rear is occupied at same position", () => {
      // Half-depth device mounted on rear at position 5
      const device = createTestDevice("device-1", 2, { is_full_depth: false });
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5, face: "rear" },
      ]);

      // Should be able to place a 2U half-depth device on front at same position
      expect(
        canPlaceDevice(rack, [device], 2, 5, undefined, "front", false),
      ).toBe(true);
    });

    it("blocks placement on same face at overlapping position", () => {
      // Device mounted on front at position 5
      const device = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5, face: "front" },
      ]);

      // Should NOT be able to place on front at same position
      expect(canPlaceDevice(rack, [device], 2, 5, undefined, "front")).toBe(
        false,
      );
    });

    it("blocks rear placement when existing device is full-depth", () => {
      // Full-depth device occupies both faces
      const device = createTestDevice("device-1", 2, { is_full_depth: true });
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5, face: "both" },
      ]);

      // Should NOT be able to place on rear at same position
      expect(canPlaceDevice(rack, [device], 1, 5, undefined, "rear")).toBe(
        false,
      );
    });

    it("blocks front placement when existing device is full-depth", () => {
      // Full-depth device occupies both faces
      const device = createTestDevice("device-1", 2, { is_full_depth: true });
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5, face: "both" },
      ]);

      // Should NOT be able to place on front at same position
      expect(canPlaceDevice(rack, [device], 1, 5, undefined, "front")).toBe(
        false,
      );
    });

    it("blocks placement when new device is full-depth and position is occupied", () => {
      // Half-depth device on front
      const existingDevice = createTestDevice("device-1", 2, {
        is_full_depth: false,
      });
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5, face: "front" },
      ]);

      // Placing a full-depth device ('both') should be blocked
      expect(
        canPlaceDevice(rack, [existingDevice], 2, 5, undefined, "both"),
      ).toBe(false);
    });

    it("allows adjacent positions regardless of face", () => {
      // Device on front at position 5-6
      const device = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5, face: "front" },
      ]);

      // Should be able to place on front at position 7 (adjacent, no overlap)
      expect(canPlaceDevice(rack, [device], 2, 7, undefined, "front")).toBe(
        true,
      );
      // Should also work for rear
      expect(canPlaceDevice(rack, [device], 2, 7, undefined, "rear")).toBe(
        true,
      );
    });
  });

  describe("findCollisions with face awareness", () => {
    it("does not report collision when half-depth devices are on different faces", () => {
      const device = createTestDevice("device-1", 2, { is_full_depth: false });
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5, face: "front" },
      ]);

      // Checking for collisions on rear with half-depth device should find none
      const collisions = findCollisions(
        rack,
        [device],
        2,
        5,
        undefined,
        "rear",
        false,
      );
      expect(collisions).toEqual([]);
    });

    it("reports collision when devices are on same face", () => {
      const device = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5, face: "front" },
      ]);

      // Checking for collisions on front should find the device
      const collisions = findCollisions(
        rack,
        [device],
        2,
        5,
        undefined,
        "front",
      );
      expect(collisions).toHaveLength(1);
    });

    it("reports collision when full-depth devices are on different faces", () => {
      const device = createTestDevice("device-1", 2); // default full-depth
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 5, face: "front" },
      ]);

      // Checking for collisions on rear with full-depth should find collision
      const collisions = findCollisions(
        rack,
        [device],
        2,
        5,
        undefined,
        "rear",
        true,
      );
      expect(collisions).toHaveLength(1);
    });
  });

  describe("findValidDropPositions with face awareness", () => {
    it("returns all positions when placing half-depth on opposite face of half-depth devices", () => {
      const device = createTestDevice("device-1", 2, { is_full_depth: false });
      // Front is fully occupied from position 1-10 with half-depth devices
      const placedDevices = [];
      for (let i = 1; i <= 9; i += 2) {
        placedDevices.push({
          device_type: "device-1",
          position: i,
          face: "front" as DeviceFace,
        });
      }
      const rack = createTestRack(10, placedDevices);

      // Rear should have all positions available for half-depth devices
      const positions = findValidDropPositions(
        rack,
        [device],
        2,
        "rear",
        false,
      );
      expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });
});

describe("Depth-Aware Collision Detection", () => {
  describe("doFacesCollide with depth parameters", () => {
    // Same face always collides regardless of depth
    it("returns true for front + front (any depth)", () => {
      expect(doFacesCollide("front", "front", true, true)).toBe(true);
      expect(doFacesCollide("front", "front", false, false)).toBe(true);
      expect(doFacesCollide("front", "front", true, false)).toBe(true);
    });

    it("returns true for rear + rear (any depth)", () => {
      expect(doFacesCollide("rear", "rear", true, true)).toBe(true);
      expect(doFacesCollide("rear", "rear", false, false)).toBe(true);
      expect(doFacesCollide("rear", "rear", true, false)).toBe(true);
    });

    // 'both' face always collides
    it("returns true for both + any face (any depth)", () => {
      expect(doFacesCollide("both", "front", true, true)).toBe(true);
      expect(doFacesCollide("both", "rear", false, false)).toBe(true);
      expect(doFacesCollide("front", "both", true, false)).toBe(true);
      expect(doFacesCollide("rear", "both", false, true)).toBe(true);
      expect(doFacesCollide("both", "both", true, true)).toBe(true);
    });

    // Opposite faces: collision depends on depth
    it("returns false for front(half) + rear(half) - NEW BEHAVIOR", () => {
      // Two half-depth devices on opposite faces do NOT collide
      expect(doFacesCollide("front", "rear", false, false)).toBe(false);
      expect(doFacesCollide("rear", "front", false, false)).toBe(false);
    });

    it("returns true for front(full) + rear(any)", () => {
      // Full-depth device on front blocks rear
      expect(doFacesCollide("front", "rear", true, true)).toBe(true);
      expect(doFacesCollide("front", "rear", true, false)).toBe(true);
    });

    it("returns true for front(any) + rear(full)", () => {
      // Full-depth device on rear blocks front
      expect(doFacesCollide("front", "rear", false, true)).toBe(true);
      expect(doFacesCollide("front", "rear", true, true)).toBe(true);
    });

    // Default behavior (no depth params) should assume full-depth
    it("defaults to full-depth when depth params not provided", () => {
      // Calling with 2 params should behave as if both are full-depth
      expect(doFacesCollide("front", "rear")).toBe(true);
      expect(doFacesCollide("rear", "front")).toBe(true);
    });
  });

  describe("canPlaceDevice with depth awareness", () => {
    it("allows placing half-depth rear device when half-depth front device exists at same U", () => {
      // Half-depth device on front at position 5
      const halfDepthDevice = createTestDevice("half-depth", 2, {
        is_full_depth: false,
      });
      const rack = createTestRack(42, [
        { device_type: "half-depth", position: 5, face: "front" },
      ]);

      // Should be able to place another half-depth device on rear at same position
      // Note: Need to pass isFullDepth=false for the new device
      expect(
        canPlaceDevice(rack, [halfDepthDevice], 2, 5, undefined, "rear", false),
      ).toBe(true);
    });

    it("blocks placing half-depth rear device when full-depth front device exists at same U", () => {
      // Full-depth device on front at position 5
      const fullDepthDevice = createTestDevice("full-depth", 2, {
        is_full_depth: true,
      });
      const rack = createTestRack(42, [
        { device_type: "full-depth", position: 5, face: "front" },
      ]);

      // Should NOT be able to place on rear at same position (full-depth blocks it)
      expect(
        canPlaceDevice(rack, [fullDepthDevice], 2, 5, undefined, "rear", false),
      ).toBe(false);
    });

    it("blocks placing full-depth rear device when half-depth front device exists at same U", () => {
      // Half-depth device on front at position 5
      const halfDepthDevice = createTestDevice("half-depth", 2, {
        is_full_depth: false,
      });
      const rack = createTestRack(42, [
        { device_type: "half-depth", position: 5, face: "front" },
      ]);

      // Should NOT be able to place full-depth on rear at same position
      expect(
        canPlaceDevice(rack, [halfDepthDevice], 2, 5, undefined, "rear", true),
      ).toBe(false);
    });

    it("allows placing half-depth front device when half-depth rear device exists at same U", () => {
      // Half-depth device on rear at position 5
      const halfDepthDevice = createTestDevice("half-depth", 2, {
        is_full_depth: false,
      });
      const rack = createTestRack(42, [
        { device_type: "half-depth", position: 5, face: "rear" },
      ]);

      // Should be able to place another half-depth device on front at same position
      expect(
        canPlaceDevice(
          rack,
          [halfDepthDevice],
          2,
          5,
          undefined,
          "front",
          false,
        ),
      ).toBe(true);
    });

    it("defaults to full-depth when isFullDepth param not provided", () => {
      // Half-depth device on front at position 5
      const halfDepthDevice = createTestDevice("half-depth", 2, {
        is_full_depth: false,
      });
      const rack = createTestRack(42, [
        { device_type: "half-depth", position: 5, face: "front" },
      ]);

      // Without isFullDepth param, should default to full-depth (true) and block
      expect(
        canPlaceDevice(rack, [halfDepthDevice], 2, 5, undefined, "rear"),
      ).toBe(false);
    });

    it("handles undefined is_full_depth on existing device as full-depth", () => {
      // Device without explicit is_full_depth (defaults to true/full-depth)
      const defaultDevice = createTestDevice("default-device", 2);
      const rack = createTestRack(42, [
        { device_type: "default-device", position: 5, face: "front" },
      ]);

      // Should block rear placement because default is full-depth
      expect(
        canPlaceDevice(rack, [defaultDevice], 2, 5, undefined, "rear", false),
      ).toBe(false);
    });
  });
});

describe("Slot Position Collision (Half-Width Devices)", () => {
  describe("doSlotsOverlap", () => {
    it('"full" overlaps with "full"', () => {
      expect(doSlotsOverlap("full", "full")).toBe(true);
    });

    it('"full" overlaps with "left"', () => {
      expect(doSlotsOverlap("full", "left")).toBe(true);
    });

    it('"full" overlaps with "right"', () => {
      expect(doSlotsOverlap("full", "right")).toBe(true);
    });

    it('"left" overlaps with "full"', () => {
      expect(doSlotsOverlap("left", "full")).toBe(true);
    });

    it('"right" overlaps with "full"', () => {
      expect(doSlotsOverlap("right", "full")).toBe(true);
    });

    it('"left" overlaps with "left"', () => {
      expect(doSlotsOverlap("left", "left")).toBe(true);
    });

    it('"right" overlaps with "right"', () => {
      expect(doSlotsOverlap("right", "right")).toBe(true);
    });

    it('"left" does NOT overlap with "right"', () => {
      expect(doSlotsOverlap("left", "right")).toBe(false);
    });

    it('"right" does NOT overlap with "left"', () => {
      expect(doSlotsOverlap("right", "left")).toBe(false);
    });
  });

  describe("canPlaceDevice with slot positions", () => {
    const halfWidthDevice = createTestDevice("half-width", 1, {
      slot_width: 1,
      is_full_depth: false,
    });
    const fullWidthDevice = createTestDevice("full-width", 1, {
      slot_width: 2,
    });

    it("allows two half-width devices in different slots at same U", () => {
      const rack = createTestRack(42, [
        {
          device_type: "half-width",
          position: 5,
          face: "front",
          slot_position: "left",
        },
      ]);

      // Placing in right slot at same U should succeed
      expect(
        canPlaceDevice(
          rack,
          [halfWidthDevice],
          1,
          5,
          undefined,
          "front",
          false,
          "right",
        ),
      ).toBe(true);
    });

    it("blocks half-width device in same slot at same U", () => {
      const rack = createTestRack(42, [
        {
          device_type: "half-width",
          position: 5,
          face: "front",
          slot_position: "left",
        },
      ]);

      // Placing in same (left) slot at same U should fail
      expect(
        canPlaceDevice(
          rack,
          [halfWidthDevice],
          1,
          5,
          undefined,
          "front",
          false,
          "left",
        ),
      ).toBe(false);
    });

    it("blocks full-width device when half-width exists at same U", () => {
      const rack = createTestRack(42, [
        {
          device_type: "half-width",
          position: 5,
          face: "front",
          slot_position: "left",
        },
      ]);

      // Full-width device needs both slots, should fail
      expect(
        canPlaceDevice(
          rack,
          [halfWidthDevice, fullWidthDevice],
          1,
          5,
          undefined,
          "front",
          true,
          "full",
        ),
      ).toBe(false);
    });

    it("blocks half-width device when full-width exists at same U", () => {
      const rack = createTestRack(42, [
        {
          device_type: "full-width",
          position: 5,
          face: "front",
          slot_position: "full",
        },
      ]);

      // Half-width device should be blocked by full-width
      expect(
        canPlaceDevice(
          rack,
          [halfWidthDevice, fullWidthDevice],
          1,
          5,
          undefined,
          "front",
          false,
          "left",
        ),
      ).toBe(false);
    });

    it("allows adjacent U positions regardless of slot", () => {
      const rack = createTestRack(42, [
        {
          device_type: "half-width",
          position: 5,
          face: "front",
          slot_position: "left",
        },
      ]);

      // Device at U6 should succeed even in left slot
      expect(
        canPlaceDevice(
          rack,
          [halfWidthDevice],
          1,
          6,
          undefined,
          "front",
          false,
          "left",
        ),
      ).toBe(true);
    });
  });
});
