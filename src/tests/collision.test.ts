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
import { UNITS_PER_U } from "$lib/utils/position";
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
    ...(options?.slot_width !== undefined && {
      slot_width: options.slot_width,
    }),
  };
}

// Helper to create test rack
// Note: positions are in internal units (e.g., 6 for U1)
function createTestRack(
  height: number,
  devices: {
    device_type: string;
    position: number; // Internal units (6 = U1)
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
    it("returns correct range for 1U device at U5 (position 30)", () => {
      // Position 30 = U5 in internal units, 1U height = 6 internal units
      const range = getDeviceURange(30, 1);
      expect(range).toEqual({ bottom: 30, top: 35 }); // 30 + 6 - 1 = 35
    });

    it("returns correct range for 2U device at U5 (position 30)", () => {
      // Position 30 = U5, 2U height = 12 internal units
      const range = getDeviceURange(30, 2);
      expect(range).toEqual({ bottom: 30, top: 41 }); // 30 + 12 - 1 = 41
    });

    it("returns correct range for 4U device at U10 (position 60)", () => {
      // Position 60 = U10, 4U height = 24 internal units
      const range = getDeviceURange(60, 4);
      expect(range).toEqual({ bottom: 60, top: 83 }); // 60 + 24 - 1 = 83
    });

    it("returns correct range for 1U device at U1 (position 6)", () => {
      // Position 6 = U1 in internal units
      const range = getDeviceURange(6, 1);
      expect(range).toEqual({ bottom: 6, top: 11 }); // 6 + 6 - 1 = 11
    });
  });

  describe("doRangesOverlap", () => {
    // Note: These tests use internal unit values
    it("returns false for adjacent ranges (6-11 and 12-17)", () => {
      // U1 device (6-11) and U2 device (12-17) are adjacent, not overlapping
      expect(
        doRangesOverlap({ bottom: 6, top: 11 }, { bottom: 12, top: 17 }),
      ).toBe(false);
    });

    it("returns true for partial overlap (6-17 and 12-23)", () => {
      expect(
        doRangesOverlap({ bottom: 6, top: 17 }, { bottom: 12, top: 23 }),
      ).toBe(true);
    });

    it("returns true for containment (6-23 and 12-17)", () => {
      expect(
        doRangesOverlap({ bottom: 6, top: 23 }, { bottom: 12, top: 17 }),
      ).toBe(true);
    });

    it("returns true for reverse containment (12-17 and 6-23)", () => {
      expect(
        doRangesOverlap({ bottom: 12, top: 17 }, { bottom: 6, top: 23 }),
      ).toBe(true);
    });

    it("returns true for edge touch (6-11 and 11-17)", () => {
      expect(
        doRangesOverlap({ bottom: 6, top: 11 }, { bottom: 11, top: 17 }),
      ).toBe(true);
    });
  });

  describe("canPlaceDevice", () => {
    it("returns true for empty rack", () => {
      const rack = createTestRack(42);
      const deviceLibrary: DeviceType[] = [];

      // Position 6 = U1 in internal units
      expect(canPlaceDevice(rack, deviceLibrary, 1, UNITS_PER_U)).toBe(true);
      // Position 60 = U10 in internal units
      expect(canPlaceDevice(rack, deviceLibrary, 4, 60)).toBe(true);
    });

    it("returns false when device would exceed rack top", () => {
      const rack = createTestRack(42);
      const deviceLibrary: DeviceType[] = [];

      // 4U device at U40 (position 240) would exceed rack (42U = 252 internal units)
      // Top would be at 240 + 24 - 1 = 263 > 252
      expect(canPlaceDevice(rack, deviceLibrary, 4, 240)).toBe(false);
    });

    it("returns false for position less than UNITS_PER_U (U1)", () => {
      const rack = createTestRack(42);
      const deviceLibrary: DeviceType[] = [];

      expect(canPlaceDevice(rack, deviceLibrary, 1, 0)).toBe(false);
      expect(canPlaceDevice(rack, deviceLibrary, 1, 5)).toBe(false); // Less than 6
      expect(canPlaceDevice(rack, deviceLibrary, 1, -1)).toBe(false);
    });

    it("returns false for collision with existing device", () => {
      const device1 = createTestDevice("device-1", 2);
      // Device at U5 (position 30), 2U occupies internal units 30-41
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30 },
      ]);

      // 2U device at U4 (position 24) would occupy 24-35, overlaps with 30-41
      expect(canPlaceDevice(rack, [device1], 2, 24)).toBe(false);
      // 1U at U5 (position 30) - collision with 30-41
      expect(canPlaceDevice(rack, [device1], 1, 30)).toBe(false);
      // 1U at U6 (position 36) - collision with 30-41
      expect(canPlaceDevice(rack, [device1], 1, 36)).toBe(false);
    });

    it("returns true for position adjacent to existing device", () => {
      const device1 = createTestDevice("device-1", 2);
      // Device at U5 (position 30), 2U occupies internal units 30-41
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30 },
      ]);

      // 1U at U7 (position 42) - adjacent, valid (device ends at 41)
      expect(canPlaceDevice(rack, [device1], 1, 42)).toBe(true);
      // 1U at U4 (position 24) - ends at 29, adjacent to 30
      expect(canPlaceDevice(rack, [device1], 1, 24)).toBe(true);
    });
  });

  describe("findCollisions", () => {
    it("returns empty array when no collisions", () => {
      const device1 = createTestDevice("device-1", 2);
      // Device at U5 (position 30)
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30 },
      ]);

      // Check at U10 (position 60) - no collision
      const collisions = findCollisions(rack, [device1], 1, 60);
      expect(collisions).toEqual([]);
    });

    it("returns colliding devices", () => {
      const device1 = createTestDevice("device-1", 2);
      // Device at U5 (position 30), occupies 30-41
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30 },
      ]);

      // 2U device at U4 (position 24) would occupy 24-35, overlaps with 30-41
      const collisions = findCollisions(rack, [device1], 2, 24);
      // eslint-disable-next-line no-restricted-syntax -- Testing collision detection (exactly 1 collision)
      expect(collisions).toHaveLength(1);
      expect(collisions[0]).toEqual({
        device_type: "device-1",
        position: 30,
        face: "front",
      });
    });

    it("excludes device at excludeIndex (for move operations)", () => {
      const device1 = createTestDevice("device-1", 2);
      const device2 = createTestDevice("device-2", 1);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30 },
        { device_type: "device-2", position: 60 },
      ]);

      // Moving device at index 0 - should exclude it from collision check
      const collisions = findCollisions(rack, [device1, device2], 2, 30, 0);
      expect(collisions).toEqual([]);
    });
  });

  describe("findValidDropPositions", () => {
    it("returns all valid internal unit positions for empty rack", () => {
      const rack = createTestRack(10); // 10U rack = 60 internal units
      const deviceLibrary: DeviceType[] = [];

      // 1U device (6 internal units) can go at positions 6-60
      // (U1 to U10, device ends at top of rack)
      // Max position calculation: maxValidTop - deviceHeight + 1
      // maxValidTop = rack.height * UNITS_PER_U + (UNITS_PER_U - 1) = 65
      // maxPosition = 65 - 6 + 1 = 60
      const positions1U = findValidDropPositions(rack, deviceLibrary, 1);
      expect(positions1U[0]).toBe(6); // U1
      expect(positions1U[positions1U.length - 1]).toBe(60); // U10 (device top at 65)

      // 2U device (12 internal units) can go at positions 6-54
      // maxPosition = 65 - 12 + 1 = 54
      const positions2U = findValidDropPositions(rack, deviceLibrary, 2);
      expect(positions2U[0]).toBe(6);
      expect(positions2U[positions2U.length - 1]).toBe(54);
    });

    it("excludes positions that would collide", () => {
      const device1 = createTestDevice("device-1", 2);
      // Device at U5 (position 30), 2U occupies 30-41
      const rack = createTestRack(10, [
        { device_type: "device-1", position: 30 },
      ]);

      // 1U device: check that positions overlapping 30-41 are excluded
      const positions1U = findValidDropPositions(rack, [device1], 1);
      // Positions 25-35 would overlap (since 1U is 6 units wide)
      expect(positions1U).not.toContain(30);
      expect(positions1U).not.toContain(35);
      expect(positions1U).toContain(6); // U1 is valid
      expect(positions1U).toContain(42); // U7 is valid (starts after 41)
    });

    it("returns empty array when rack is full", () => {
      // Fill 5U rack completely with 1U devices at U1-U5
      const devices: DeviceType[] = [];
      const placedDevices: { device_type: string; position: number }[] = [];
      for (let i = 1; i <= 5; i++) {
        devices.push(createTestDevice(`device-${i}`, 1));
        // Position in internal units: U1=6, U2=12, etc.
        placedDevices.push({ device_type: `device-${i}`, position: i * 6 });
      }
      const rack = createTestRack(5, placedDevices);

      const positions = findValidDropPositions(rack, devices, 1);
      expect(positions).toEqual([]);
    });
  });

  describe("snapToNearestValidPosition", () => {
    const uHeight = 22; // pixels per U

    it("returns position in internal units when valid", () => {
      const rack = createTestRack(42);
      const deviceLibrary: DeviceType[] = [];

      // Target Y for U5 (from top of rack)
      const targetY = (42 - 5) * uHeight;
      const result = snapToNearestValidPosition(
        rack,
        deviceLibrary,
        1,
        targetY,
        uHeight,
      );
      // Result should be in internal units (U5 = 30)
      expect(result).toBe(30);
    });

    it("returns nearest valid position in internal units", () => {
      const device1 = createTestDevice("device-1", 2);
      // Device at U5 (position 30), occupies 30-41
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30 },
      ]);

      // Target somewhere near U5 (which is blocked)
      const targetY = (42 - 5) * uHeight;
      const result = snapToNearestValidPosition(
        rack,
        [device1],
        1,
        targetY,
        uHeight,
      );
      // Should snap to nearest valid position in internal units
      // Either before 30 or at/after 42
      expect(result !== null && (result < 30 || result >= 42)).toBe(true);
    });

    it("returns null when no valid positions", () => {
      // Fill 5U rack completely with 1U devices
      const devices: DeviceType[] = [];
      const placedDevices: { device_type: string; position: number }[] = [];
      for (let i = 1; i <= 5; i++) {
        devices.push(createTestDevice(`device-${i}`, 1));
        placedDevices.push({ device_type: `device-${i}`, position: i * 6 });
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
      // Half-depth device mounted on front at U5 (position 30)
      const device = createTestDevice("device-1", 2, { is_full_depth: false });
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "front" },
      ]);

      // Should be able to place a 2U half-depth device on rear at same position
      expect(
        canPlaceDevice(rack, [device], 2, 30, undefined, "rear", "full"),
      ).toBe(true);
    });

    it("allows placing half-depth device on front when half-depth rear is occupied at same position", () => {
      // Half-depth device mounted on rear at U5 (position 30)
      const device = createTestDevice("device-1", 2, { is_full_depth: false });
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "rear" },
      ]);

      // Should be able to place a 2U half-depth device on front at same position
      expect(
        canPlaceDevice(rack, [device], 2, 30, undefined, "front", "full"),
      ).toBe(true);
    });

    it("blocks placement on same face at overlapping position", () => {
      // Device mounted on front at U5 (position 30)
      const device = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "front" },
      ]);

      // Should NOT be able to place on front at same position
      expect(canPlaceDevice(rack, [device], 2, 30, undefined, "front")).toBe(
        false,
      );
    });

    it("blocks rear placement when existing device is full-depth", () => {
      // Full-depth device occupies both faces at U5 (position 30)
      const device = createTestDevice("device-1", 2, { is_full_depth: true });
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "both" },
      ]);

      // Should NOT be able to place on rear at same position
      expect(canPlaceDevice(rack, [device], 1, 30, undefined, "rear")).toBe(
        false,
      );
    });

    it("blocks front placement when existing device is full-depth", () => {
      // Full-depth device occupies both faces at U5 (position 30)
      const device = createTestDevice("device-1", 2, { is_full_depth: true });
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "both" },
      ]);

      // Should NOT be able to place on front at same position
      expect(canPlaceDevice(rack, [device], 1, 30, undefined, "front")).toBe(
        false,
      );
    });

    it("blocks placement when new device is full-depth and position is occupied", () => {
      // Half-depth device on front at U5 (position 30)
      const existingDevice = createTestDevice("device-1", 2, {
        is_full_depth: false,
      });
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "front" },
      ]);

      // Placing a full-depth device ('both') should be blocked
      expect(
        canPlaceDevice(rack, [existingDevice], 2, 30, undefined, "both"),
      ).toBe(false);
    });

    it("allows adjacent positions regardless of face", () => {
      // Device on front at U5 (position 30), occupies 30-41
      const device = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "front" },
      ]);

      // Should be able to place on front at U7 (position 42, adjacent)
      expect(canPlaceDevice(rack, [device], 2, 42, undefined, "front")).toBe(
        true,
      );
      // Should also work for rear
      expect(canPlaceDevice(rack, [device], 2, 42, undefined, "rear")).toBe(
        true,
      );
    });
  });

  describe("findCollisions with face awareness", () => {
    it("does not report collision when devices are on different faces", () => {
      const device = createTestDevice("device-1", 2, { is_full_depth: false });
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "front" },
      ]);

      // Face is authoritative: different faces don't collide
      const collisions = findCollisions(
        rack,
        [device],
        2,
        30,
        undefined,
        "rear",
      );
      expect(collisions).toEqual([]);
    });

    it("reports collision when devices are on same face", () => {
      const device = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "front" },
      ]);

      // Checking for collisions on front should find the device
      const collisions = findCollisions(
        rack,
        [device],
        2,
        30,
        undefined,
        "front",
      );
      // eslint-disable-next-line no-restricted-syntax -- Testing collision detection (exactly 1 collision)
      expect(collisions).toHaveLength(1);
    });

    it("reports collision when placing both-face device against front device", () => {
      const device = createTestDevice("device-1", 2); // default full-depth
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "front" },
      ]);

      // Placing with face: "both" collides with any existing device
      const collisions = findCollisions(
        rack,
        [device],
        2,
        30,
        undefined,
        "both",
      );
      // eslint-disable-next-line no-restricted-syntax -- Testing collision detection (exactly 1 collision)
      expect(collisions).toHaveLength(1);
    });
  });

  describe("findValidDropPositions with face awareness", () => {
    it("returns all positions when placing on opposite face of front devices", () => {
      const device = createTestDevice("device-1", 2, { is_full_depth: false });
      // Front is fully occupied with 2U devices at U1, U3, U5, U7, U9
      const placedDevices = [];
      for (let i = 1; i <= 9; i += 2) {
        placedDevices.push({
          device_type: "device-1",
          position: i * UNITS_PER_U, // Internal units
          face: "front" as DeviceFace,
        });
      }
      const rack = createTestRack(10, placedDevices);

      // Rear should have all positions available - face is authoritative
      const positions = findValidDropPositions(rack, [device], 2, "rear");
      // Should have positions from U1 (6) to U9 (54) in internal units
      expect(positions[0]).toBe(6);
      expect(positions).toContain(12);
      expect(positions).toContain(48);
    });
  });
});

describe("Face-Authoritative Collision Detection", () => {
  describe("doFacesCollide - face is authoritative", () => {
    // Same face always collides
    it("returns true for front + front", () => {
      expect(doFacesCollide("front", "front")).toBe(true);
    });

    it("returns true for rear + rear", () => {
      expect(doFacesCollide("rear", "rear")).toBe(true);
    });

    // 'both' face always collides with everything
    it("returns true for both + any face", () => {
      expect(doFacesCollide("both", "front")).toBe(true);
      expect(doFacesCollide("both", "rear")).toBe(true);
      expect(doFacesCollide("front", "both")).toBe(true);
      expect(doFacesCollide("rear", "both")).toBe(true);
      expect(doFacesCollide("both", "both")).toBe(true);
    });

    // Opposite explicit faces never collide (face is authoritative)
    it("returns false for front + rear (face is authoritative)", () => {
      expect(doFacesCollide("front", "rear")).toBe(false);
      expect(doFacesCollide("rear", "front")).toBe(false);
    });
  });

  describe("canPlaceDevice with face-based collision", () => {
    it("allows placing rear device when front device exists at same U", () => {
      // Device on front at U5 (position 30)
      const device = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "front" },
      ]);

      // Face is authoritative: front doesn't block rear
      expect(canPlaceDevice(rack, [device], 2, 30, undefined, "rear")).toBe(
        true,
      );
    });

    it("allows placing front device when rear device exists at same U", () => {
      // Device on rear at U5 (position 30)
      const device = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "rear" },
      ]);

      // Face is authoritative: rear doesn't block front
      expect(canPlaceDevice(rack, [device], 2, 30, undefined, "front")).toBe(
        true,
      );
    });

    it("blocks placing rear device when both-face device exists at same U", () => {
      // Device with face: "both" at U5 (position 30)
      const device = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "both" },
      ]);

      // "both" blocks everything
      expect(canPlaceDevice(rack, [device], 2, 30, undefined, "rear")).toBe(
        false,
      );
    });

    it("blocks placing front device when both-face device exists at same U", () => {
      // Device with face: "both" at U5 (position 30)
      const device = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "both" },
      ]);

      // "both" blocks everything
      expect(canPlaceDevice(rack, [device], 2, 30, undefined, "front")).toBe(
        false,
      );
    });

    it("allows rear placement when full-depth device face is overridden to front", () => {
      // This is the key fix for issue #444
      // Full-depth device with face explicitly set to 'front'
      const device = createTestDevice("full-depth", 2, { is_full_depth: true });
      const rack = createTestRack(42, [
        { device_type: "full-depth", position: 30, face: "front" }, // Face overridden!
      ]);

      // Face is authoritative: even though device type is full-depth,
      // the placed device's face is 'front', so it only blocks front
      expect(canPlaceDevice(rack, [device], 2, 30, undefined, "rear")).toBe(
        true,
      );
    });

    it("still blocks same-face placement", () => {
      const device = createTestDevice("device-1", 2);
      const rack = createTestRack(42, [
        { device_type: "device-1", position: 30, face: "front" },
      ]);

      // Same face always blocks
      expect(canPlaceDevice(rack, [device], 2, 30, undefined, "front")).toBe(
        false,
      );
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
      // Device at U5 (position 30)
      const rack = createTestRack(42, [
        {
          device_type: "half-width",
          position: 30,
          face: "front",
          slot_position: "left",
        },
      ]);

      // Placing in right slot at same position should succeed
      expect(
        canPlaceDevice(
          rack,
          [halfWidthDevice],
          1,
          30,
          undefined,
          "front",
          "right",
        ),
      ).toBe(true);
    });

    it("blocks half-width device in same slot at same U", () => {
      const rack = createTestRack(42, [
        {
          device_type: "half-width",
          position: 30,
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
          30,
          undefined,
          "front",
          "left",
        ),
      ).toBe(false);
    });

    it("blocks full-width device when half-width exists at same U", () => {
      const rack = createTestRack(42, [
        {
          device_type: "half-width",
          position: 30,
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
          30,
          undefined,
          "front",
          "full",
        ),
      ).toBe(false);
    });

    it("blocks half-width device when full-width exists at same U", () => {
      const rack = createTestRack(42, [
        {
          device_type: "full-width",
          position: 30,
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
          30,
          undefined,
          "front",
          "left",
        ),
      ).toBe(false);
    });

    it("allows adjacent U positions regardless of slot", () => {
      // Device at U5 (position 30), 1U occupies 30-35
      const rack = createTestRack(42, [
        {
          device_type: "half-width",
          position: 30,
          face: "front",
          slot_position: "left",
        },
      ]);

      // Device at U6 (position 36) should succeed even in left slot
      expect(
        canPlaceDevice(
          rack,
          [halfWidthDevice],
          1,
          36,
          undefined,
          "front",
          "left",
        ),
      ).toBe(true);
    });
  });
});
