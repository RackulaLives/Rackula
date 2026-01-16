/**
 * Device Movement Utility Tests
 * Tests for shared device movement logic used by keyboard and mobile handlers
 */

import { describe, it, expect } from "vitest";
import {
  findNextValidPosition,
  canMoveUp,
  canMoveDown,
  getDeviceWithType,
} from "$lib/utils/device-movement";
import type { Rack, DeviceType, PlacedDevice } from "$lib/types";
import { toInternalUnits } from "$lib/utils/position";

// Helper to create a placed device with internal unit position
function pd(
  device_type: string,
  positionU: number,
  face: "front" | "rear" | "both",
): PlacedDevice {
  return {
    id: `${device_type}-${positionU}`,
    device_type,
    position: toInternalUnits(positionU),
    face,
  };
}

describe("Device Movement Utility", () => {
  // Helper to create a test rack
  function createTestRack(
    height: number = 42,
    devices: PlacedDevice[] = [],
  ): Rack {
    return {
      id: "rack-0",
      name: "Test Rack",
      height,
      width: 19,
      view: "front",
      devices,
    };
  }

  // Helper to create device types
  function createDeviceTypes(): DeviceType[] {
    return [
      {
        slug: "1u-server",
        u_height: 1,
        model: "1U Server",
        colour: "#4A90D9",
        category: "server",
      },
      {
        slug: "2u-server",
        u_height: 2,
        model: "2U Server",
        colour: "#4A90D9",
        category: "server",
      },
      {
        slug: "4u-storage",
        u_height: 4,
        model: "4U Storage",
        colour: "#4A90D9",
        category: "storage",
      },
      {
        slug: "half-u-patch",
        u_height: 0.5,
        model: "0.5U Patch Panel",
        colour: "#4A90D9",
        category: "patch-panel",
      },
      {
        slug: "front-only-device",
        u_height: 1,
        model: "Front Only",
        colour: "#4A90D9",
        category: "server",
        is_full_depth: false,
      },
    ];
  }

  describe("findNextValidPosition", () => {
    describe("Basic Movement", () => {
      it("moves a 1U device up by 1U", () => {
        const rack = createTestRack(42, [pd("1u-server", 10, "front")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(11));
        expect(result.reason).toBe("moved");
      });

      it("moves a 1U device down by 1U", () => {
        const rack = createTestRack(42, [pd("1u-server", 10, "front")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, -1);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(9));
        expect(result.reason).toBe("moved");
      });

      it("moves a 2U device up by 2U (device height)", () => {
        const rack = createTestRack(42, [pd("2u-server", 10, "front")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(12));
        expect(result.reason).toBe("moved");
      });

      it("moves a 4U device down by 4U (device height)", () => {
        const rack = createTestRack(42, [pd("4u-storage", 10, "front")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, -1);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(6));
        expect(result.reason).toBe("moved");
      });

      it("respects stepOverride for fine movement", () => {
        const rack = createTestRack(42, [pd("2u-server", 10, "front")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1, 0.5);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(10.5));
        expect(result.reason).toBe("moved");
      });
    });

    describe("Boundary Conditions", () => {
      it("returns at_boundary when device is at top and trying to move up", () => {
        const rack = createTestRack(42, [pd("1u-server", 42, "front")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(false);
        expect(result.newPosition).toBeNull();
        expect(result.reason).toBe("at_boundary");
      });

      it("returns at_boundary when device is at bottom and trying to move down", () => {
        const rack = createTestRack(42, [pd("1u-server", 1, "front")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, -1);

        expect(result.success).toBe(false);
        expect(result.newPosition).toBeNull();
        expect(result.reason).toBe("at_boundary");
      });

      it("returns at_boundary when 2U device is at top (position 41)", () => {
        const rack = createTestRack(42, [pd("2u-server", 41, "front")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(false);
        expect(result.newPosition).toBeNull();
        expect(result.reason).toBe("at_boundary");
      });

      it("returns at_boundary when 4U device at position 39 tries to move up", () => {
        const rack = createTestRack(42, [pd("4u-storage", 39, "front")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(false);
        expect(result.newPosition).toBeNull();
        expect(result.reason).toBe("at_boundary");
      });
    });

    describe("Leapfrog Behavior", () => {
      it("leapfrogs over a blocking device when moving up", () => {
        const rack = createTestRack(42, [
          pd("1u-server", 10, "front"), // Device to move
          pd("1u-server", 11, "front"), // Blocking device
        ]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(12));
        expect(result.reason).toBe("moved");
      });

      it("leapfrogs over a blocking device when moving down", () => {
        const rack = createTestRack(42, [
          pd("1u-server", 10, "front"), // Device to move
          pd("1u-server", 9, "front"), // Blocking device
        ]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, -1);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(8));
        expect(result.reason).toBe("moved");
      });

      it("leapfrogs over multiple blocking devices", () => {
        const rack = createTestRack(42, [
          pd("1u-server", 10, "front"), // Device to move
          pd("1u-server", 11, "front"), // Blocking
          pd("1u-server", 12, "front"), // Blocking
          pd("1u-server", 13, "front"), // Blocking
        ]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(14));
        expect(result.reason).toBe("moved");
      });

      it("leapfrogs over a multi-U blocking device", () => {
        const rack = createTestRack(42, [
          pd("1u-server", 10, "front"), // Device to move
          pd("4u-storage", 11, "front"), // 4U blocking device (U11-U14)
        ]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(15));
        expect(result.reason).toBe("moved");
      });

      it("returns no_valid_position when blocked all the way to boundary", () => {
        const rack = createTestRack(10, [
          pd("1u-server", 5, "front"), // Device to move
          pd("1u-server", 6, "front"),
          pd("1u-server", 7, "front"),
          pd("1u-server", 8, "front"),
          pd("1u-server", 9, "front"),
          pd("1u-server", 10, "front"),
        ]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(false);
        expect(result.newPosition).toBeNull();
        expect(result.reason).toBe("no_valid_position");
      });
    });

    describe("Face-Aware Collisions", () => {
      it("does not collide with device on opposite face", () => {
        const rack = createTestRack(42, [
          pd("front-only-device", 10, "front"), // Device to move
          pd("front-only-device", 11, "rear"), // Opposite face
        ]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(11));
        expect(result.reason).toBe("moved");
      });

      it("collides with device on same face", () => {
        const rack = createTestRack(42, [
          pd("front-only-device", 10, "front"),
          pd("front-only-device", 11, "front"),
        ]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(12)); // Leapfrogs
        expect(result.reason).toBe("moved");
      });

      it("face-front device does not collide with rear device (face-authoritative)", () => {
        // With face-authoritative model, face: "front" only blocks front
        const rack = createTestRack(42, [
          pd("1u-server", 10, "front"), // Front face only
          pd("front-only-device", 11, "rear"), // Rear device
        ]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        // Device with face: "front" can move to U11 (rear device doesn't block)
        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(11));
        expect(result.reason).toBe("moved");
      });

      it("handles both-face device correctly", () => {
        const rack = createTestRack(42, [pd("1u-server", 10, "both")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(11));
        expect(result.reason).toBe("moved");
      });
    });

    describe("0.5U Device Support", () => {
      it("moves 0.5U device up by 0.5U", () => {
        const rack = createTestRack(42, [pd("half-u-patch", 10, "front")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(10.5));
        expect(result.reason).toBe("moved");
      });

      it("moves 0.5U device down by 0.5U", () => {
        const rack = createTestRack(42, [pd("half-u-patch", 10.5, "front")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, -1);

        expect(result.success).toBe(true);
        expect(result.newPosition).toBe(toInternalUnits(10));
        expect(result.reason).toBe("moved");
      });
    });

    describe("Error Handling", () => {
      it("returns failure for invalid device index", () => {
        const rack = createTestRack(42, [pd("1u-server", 10, "front")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 99, 1);

        expect(result.success).toBe(false);
        expect(result.newPosition).toBeNull();
        expect(result.reason).toBe("no_valid_position");
      });

      it("returns failure for unknown device type", () => {
        const rack = createTestRack(42, [pd("unknown-device", 10, "front")]);
        const deviceTypes = createDeviceTypes();

        const result = findNextValidPosition(rack, deviceTypes, 0, 1);

        expect(result.success).toBe(false);
        expect(result.newPosition).toBeNull();
        expect(result.reason).toBe("no_valid_position");
      });
    });
  });

  describe("canMoveUp", () => {
    it("returns true when device can move up", () => {
      const rack = createTestRack(42, [pd("1u-server", 10, "front")]);
      const deviceTypes = createDeviceTypes();

      expect(canMoveUp(rack, deviceTypes, 0)).toBe(true);
    });

    it("returns false when device is at top", () => {
      const rack = createTestRack(42, [pd("1u-server", 42, "front")]);
      const deviceTypes = createDeviceTypes();

      expect(canMoveUp(rack, deviceTypes, 0)).toBe(false);
    });

    it("returns false when blocked to top boundary", () => {
      const rack = createTestRack(10, [
        pd("1u-server", 5, "front"),
        pd("1u-server", 6, "front"),
        pd("1u-server", 7, "front"),
        pd("1u-server", 8, "front"),
        pd("1u-server", 9, "front"),
        pd("1u-server", 10, "front"),
      ]);
      const deviceTypes = createDeviceTypes();

      expect(canMoveUp(rack, deviceTypes, 0)).toBe(false);
    });
  });

  describe("canMoveDown", () => {
    it("returns true when device can move down", () => {
      const rack = createTestRack(42, [pd("1u-server", 10, "front")]);
      const deviceTypes = createDeviceTypes();

      expect(canMoveDown(rack, deviceTypes, 0)).toBe(true);
    });

    it("returns false when device is at bottom", () => {
      const rack = createTestRack(42, [pd("1u-server", 1, "front")]);
      const deviceTypes = createDeviceTypes();

      expect(canMoveDown(rack, deviceTypes, 0)).toBe(false);
    });

    it("returns false when blocked to bottom boundary", () => {
      const rack = createTestRack(10, [
        pd("1u-server", 5, "front"),
        pd("1u-server", 4, "front"),
        pd("1u-server", 3, "front"),
        pd("1u-server", 2, "front"),
        pd("1u-server", 1, "front"),
      ]);
      const deviceTypes = createDeviceTypes();

      expect(canMoveDown(rack, deviceTypes, 0)).toBe(false);
    });
  });

  describe("getDeviceWithType", () => {
    it("returns device and type for valid index", () => {
      const rack = createTestRack(42, [pd("1u-server", 10, "front")]);
      const deviceTypes = createDeviceTypes();

      const result = getDeviceWithType(rack, deviceTypes, 0);

      expect(result).not.toBeNull();
      expect(result!.device.position).toBe(toInternalUnits(10));
      expect(result!.deviceType.slug).toBe("1u-server");
    });

    it("returns null for invalid index", () => {
      const rack = createTestRack(42, [pd("1u-server", 10, "front")]);
      const deviceTypes = createDeviceTypes();

      const result = getDeviceWithType(rack, deviceTypes, 99);

      expect(result).toBeNull();
    });

    it("returns null for unknown device type", () => {
      const rack = createTestRack(42, [pd("unknown-device", 10, "front")]);
      const deviceTypes = createDeviceTypes();

      const result = getDeviceWithType(rack, deviceTypes, 0);

      expect(result).toBeNull();
    });
  });
});
