import { describe, it, expect } from "vitest";
import type { DeviceType, Rack, PlacedDevice } from "$lib/types";
import {
  createRackDeviceDragData,
  serializeDragData,
  parseDragData,
  getDropFeedback,
} from "$lib/utils/dragdrop";
import { toInternalUnits } from "$lib/utils/position";

// Helper to create a placed device with internal unit position
function pd(
  id: string,
  device_type: string,
  positionU: number,
  face: "front" | "rear" | "both",
): PlacedDevice {
  return {
    id,
    device_type,
    position: toInternalUnits(positionU),
    face,
  };
}

describe("DnD Within Rack", () => {
  // Test device data
  const testDevice: DeviceType = {
    slug: "device-1",
    model: "Test Server",
    u_height: 2,
    colour: "#4A90D9",
    category: "server",
  };

  const testDevice2: DeviceType = {
    slug: "device-2",
    model: "Test Switch",
    u_height: 1,
    colour: "#7B68EE",
    category: "network",
  };

  const deviceLibrary: DeviceType[] = [testDevice, testDevice2];

  const emptyRack: Rack = {
    name: "Test Rack",
    height: 12,
    width: 19,
    position: 0,
    desc_units: false,
    form_factor: "4-post",
    starting_unit: 1,
    devices: [],
  };

  describe("createRackDeviceDragData", () => {
    it("creates drag data with rack-device type", () => {
      const dragData = createRackDeviceDragData(testDevice, "rack-1", 0);
      expect(dragData.type).toBe("rack-device");
    });

    it("includes device reference", () => {
      const dragData = createRackDeviceDragData(testDevice, "rack-1", 0);
      expect(dragData.device).toBe(testDevice);
    });

    it("includes source rack ID", () => {
      const dragData = createRackDeviceDragData(testDevice, "rack-1", 0);
      expect(dragData.sourceRackId).toBe("rack-1");
    });

    it("includes source device index", () => {
      const dragData = createRackDeviceDragData(testDevice, "rack-1", 2);
      expect(dragData.sourceIndex).toBe(2);
    });
  });

  describe("getDropFeedback with excludeIndex", () => {
    it("returns valid when excluding source device from collision check", () => {
      // Rack with device at U5-U6
      const rackWithDevice: Rack = {
        ...emptyRack,
        devices: [pd("test-id-1", "device-1", 5, "front")],
      };

      // Without exclusion, dropping at U5 would be blocked
      const feedbackBlocked = getDropFeedback(
        rackWithDevice,
        deviceLibrary,
        2,
        5,
      );
      expect(feedbackBlocked).toBe("blocked");

      // With exclusion (moving the same device), dropping at U5 should be valid
      const feedbackValid = getDropFeedback(
        rackWithDevice,
        deviceLibrary,
        2,
        5,
        0,
      );
      expect(feedbackValid).toBe("valid");
    });

    it("returns blocked when collision with different device", () => {
      // Rack with two devices
      const rackWithDevices: Rack = {
        ...emptyRack,
        devices: [
          pd("test-id-2", "device-1", 5, "front"), // Index 0: U5-U6
          pd("test-id-3", "device-2", 8, "front"), // Index 1: U8
        ],
      };

      // Trying to move device at index 0 to U7-U8 (collides with device-2 at U8)
      const feedback = getDropFeedback(rackWithDevices, deviceLibrary, 2, 7, 0);
      expect(feedback).toBe("blocked");
    });

    it("returns valid for same position (no-op move)", () => {
      const rackWithDevice: Rack = {
        ...emptyRack,
        devices: [pd("test-id-4", "device-1", 5, "front")],
      };

      // Moving device back to its original position is valid
      const feedback = getDropFeedback(rackWithDevice, deviceLibrary, 2, 5, 0);
      expect(feedback).toBe("valid");
    });

    it("returns valid for new position without collision", () => {
      const rackWithDevice: Rack = {
        ...emptyRack,
        devices: [pd("test-id-5", "device-1", 5, "front")],
      };

      // Moving device from U5 to U8 (empty space)
      const feedback = getDropFeedback(rackWithDevice, deviceLibrary, 2, 8, 0);
      expect(feedback).toBe("valid");
    });
  });

  describe("Drag data serialization", () => {
    it("serializes and deserializes rack-device drag data correctly", () => {
      const original = createRackDeviceDragData(testDevice, "rack-1", 3);
      const serialized = serializeDragData(original);
      const deserialized = parseDragData(serialized);

      expect(deserialized).not.toBeNull();
      expect(deserialized?.type).toBe("rack-device");
      expect(deserialized?.device.slug).toBe(testDevice.slug);
      expect(deserialized?.sourceRackId).toBe("rack-1");
      expect(deserialized?.sourceIndex).toBe(3);
    });
  });

  describe("Keyboard movement logic", () => {
    // These tests verify the movement logic that will be used for keyboard navigation
    const deviceLibraryMultiple: DeviceType[] = [
      {
        slug: "dev-1",
        model: "Server 1",
        u_height: 2,
        colour: "#4A90D9",
        category: "server",
      },
      {
        slug: "dev-2",
        model: "Server 2",
        u_height: 2,
        colour: "#4A90D9",
        category: "server",
      },
    ];

    it("moving up 1U from valid position is valid", () => {
      // Device at U5, moving to U6
      const rack: Rack = {
        ...emptyRack,
        devices: [pd("test-id-6", "dev-1", 5, "front")],
      };

      const feedback = getDropFeedback(rack, deviceLibraryMultiple, 2, 6, 0);
      expect(feedback).toBe("valid");
    });

    it("moving down 1U from valid position is valid", () => {
      // Device at U5, moving to U4
      const rack: Rack = {
        ...emptyRack,
        devices: [pd("test-id-7", "dev-1", 5, "front")],
      };

      const feedback = getDropFeedback(rack, deviceLibraryMultiple, 2, 4, 0);
      expect(feedback).toBe("valid");
    });

    it("moving up beyond rack height is invalid", () => {
      // 2U device at U11, moving to U12 would go beyond rack (12U rack)
      const rack: Rack = {
        ...emptyRack,
        devices: [pd("test-id-8", "dev-1", 11, "front")],
      };

      // Device at U11-U12, moving to U12-U13 is invalid (beyond 12U)
      const feedback = getDropFeedback(rack, deviceLibraryMultiple, 2, 12, 0);
      expect(feedback).toBe("invalid");
    });

    it("moving down below U1 is invalid", () => {
      // Device at U1, cannot move below
      const rack: Rack = {
        ...emptyRack,
        devices: [pd("test-id-9", "dev-1", 1, "front")],
      };

      const feedback = getDropFeedback(rack, deviceLibraryMultiple, 2, 0, 0);
      expect(feedback).toBe("invalid");
    });

    it("moving into collision with another device is blocked", () => {
      // Two devices: one at U3-U4, one at U7-U8
      const rack: Rack = {
        ...emptyRack,
        devices: [
          pd("test-id-10", "dev-1", 3, "front"),
          pd("test-id-11", "dev-2", 7, "front"),
        ],
      };

      // Moving device at U3 up to U6 would overlap with device at U7 (2U device at U6 occupies U6-U7)
      const feedback = getDropFeedback(rack, deviceLibraryMultiple, 2, 6, 0);
      expect(feedback).toBe("blocked");
    });

    it("adjacent move does not collide", () => {
      // Two devices: one at U3-U4, one at U7-U8
      const rack: Rack = {
        ...emptyRack,
        devices: [
          pd("test-id-12", "dev-1", 3, "front"),
          pd("test-id-13", "dev-2", 7, "front"),
        ],
      };

      // Moving device at U3 up to U5 (occupies U5-U6) does not collide with device at U7
      const feedback = getDropFeedback(rack, deviceLibraryMultiple, 2, 5, 0);
      expect(feedback).toBe("valid");
    });
  });
});
