/**
 * Collision Toast Tests
 * Tests for toast notifications when device drops are blocked
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { DeviceType, PlacedDevice, Rack } from "$lib/types";
import { findCollisions } from "$lib/utils/collision";
import { getDropFeedback } from "$lib/utils/dragdrop";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";

describe("Collision Toast Notifications", () => {
  // Test devices
  const serverDevice: DeviceType = {
    slug: "server-1",
    model: "PowerEdge R740",
    manufacturer: "Dell",
    u_height: 2,
    colour: "#4A90D9",
    category: "server",
    is_full_depth: true,
  };

  const switchDevice: DeviceType = {
    slug: "switch-1",
    model: "Catalyst 9300",
    manufacturer: "Cisco",
    u_height: 1,
    colour: "#7B68EE",
    category: "network",
    is_full_depth: true,
  };

  const halfDepthSwitch: DeviceType = {
    slug: "half-switch-1",
    model: "UniFi Switch 24",
    manufacturer: "Ubiquiti",
    u_height: 1,
    colour: "#50fa7b",
    category: "network",
    is_full_depth: false,
  };

  const deviceLibrary: DeviceType[] = [
    serverDevice,
    switchDevice,
    halfDepthSwitch,
  ];

  const baseRack: Rack = {
    name: "Test Rack",
    height: 12,
    width: 19,
    position: 0,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post",
    starting_unit: 1,
    devices: [],
  };

  beforeEach(() => {
    resetToastStore();
  });

  describe("findCollisions with blocking device identification", () => {
    it("returns empty array when no collisions", () => {
      const rack: Rack = {
        ...baseRack,
        devices: [
          { id: "id-1", device_type: "server-1", position: 1, face: "front" },
        ],
      };

      const collisions = findCollisions(rack, deviceLibrary, 1, 5);
      expect(collisions).toHaveLength(0);
    });

    it("returns single blocking device on collision", () => {
      const rack: Rack = {
        ...baseRack,
        devices: [
          { id: "id-1", device_type: "server-1", position: 5, face: "front" },
        ],
      };

      // Try to place at position 5 where server already is (server is 2U, occupies 5-6)
      const collisions = findCollisions(rack, deviceLibrary, 2, 5);
      expect(collisions).toHaveLength(1);
      expect(collisions[0]!.device_type).toBe("server-1");
    });

    it("returns multiple blocking devices when overlapping several", () => {
      const rack: Rack = {
        ...baseRack,
        devices: [
          { id: "id-1", device_type: "switch-1", position: 5, face: "front" },
          { id: "id-2", device_type: "switch-1", position: 6, face: "front" },
        ],
      };

      // Try to place 2U device at position 5 - would overlap both switches
      const collisions = findCollisions(rack, deviceLibrary, 2, 5);
      expect(collisions).toHaveLength(2);
    });

    it("identifies blocking device for half-depth collision", () => {
      const rack: Rack = {
        ...baseRack,
        devices: [
          { id: "id-1", device_type: "server-1", position: 5, face: "front" },
        ],
      };

      // Half-depth switch on rear should still collide with full-depth server on front
      const collisions = findCollisions(
        rack,
        deviceLibrary,
        1,
        5,
        undefined,
        "rear",
        false,
      );
      // Full-depth server blocks the position even from rear
      expect(collisions).toHaveLength(1);
      expect(collisions[0]!.device_type).toBe("server-1");
    });

    it("allows half-depth devices on opposite faces with no collision", () => {
      const rack: Rack = {
        ...baseRack,
        devices: [
          {
            id: "id-1",
            device_type: "half-switch-1",
            position: 5,
            face: "front",
          },
        ],
      };

      // Another half-depth on rear should NOT collide
      const collisions = findCollisions(
        rack,
        deviceLibrary,
        1,
        5,
        undefined,
        "rear",
        false,
      );
      expect(collisions).toHaveLength(0);
    });
  });

  describe("getDropFeedback returns correct state", () => {
    it("returns blocked when collision detected", () => {
      const rack: Rack = {
        ...baseRack,
        devices: [
          { id: "id-1", device_type: "server-1", position: 5, face: "front" },
        ],
      };

      const feedback = getDropFeedback(rack, deviceLibrary, 2, 5);
      expect(feedback).toBe("blocked");
    });

    it("returns invalid when device exceeds rack height", () => {
      const feedback = getDropFeedback(baseRack, deviceLibrary, 2, 12);
      expect(feedback).toBe("invalid");
    });

    it("returns valid when placement is allowed", () => {
      const feedback = getDropFeedback(baseRack, deviceLibrary, 2, 5);
      expect(feedback).toBe("valid");
    });
  });

  describe("Toast store integration", () => {
    it("showToast creates warning notification", () => {
      const toastStore = getToastStore();
      toastStore.showToast(
        "Position blocked by PowerEdge R740",
        "warning",
        3000,
      );

      expect(toastStore.toasts).toHaveLength(1);
      expect(toastStore.toasts[0]!.type).toBe("warning");
      expect(toastStore.toasts[0]!.message).toBe(
        "Position blocked by PowerEdge R740",
      );
      expect(toastStore.toasts[0]!.duration).toBe(3000);
    });

    it("handles multiple blocking device message format", () => {
      const blockingNames = ["PowerEdge R740", "Catalyst 9300"];
      const message = `Position blocked by ${blockingNames.join(", ")}`;

      const toastStore = getToastStore();
      toastStore.showToast(message, "warning", 3000);

      expect(toastStore.toasts[0]!.message).toBe(
        "Position blocked by PowerEdge R740, Catalyst 9300",
      );
    });
  });

  describe("Blocking device name resolution", () => {
    it("uses placement name when available", () => {
      const placedDevice: PlacedDevice = {
        id: "id-1",
        device_type: "server-1",
        position: 5,
        face: "front",
        name: "Primary Database Server",
      };

      // Name should take priority
      expect(placedDevice.name).toBe("Primary Database Server");
    });

    it("falls back to device model when no placement name", () => {
      const placedDevice: PlacedDevice = {
        id: "id-1",
        device_type: "server-1",
        position: 5,
        face: "front",
      };

      const deviceType = deviceLibrary.find(
        (d) => d.slug === placedDevice.device_type,
      );
      expect(deviceType?.model).toBe("PowerEdge R740");
    });

    it("falls back to manufacturer when no model", () => {
      const deviceWithOnlyManufacturer: DeviceType = {
        slug: "no-model-device",
        manufacturer: "Generic Co",
        u_height: 1,
        colour: "#888888",
        category: "other",
      };

      expect(deviceWithOnlyManufacturer.model).toBeUndefined();
      expect(deviceWithOnlyManufacturer.manufacturer).toBe("Generic Co");
    });

    it("falls back to slug when no name, model, or manufacturer", () => {
      const minimalDevice: DeviceType = {
        slug: "minimal-device",
        u_height: 1,
        colour: "#888888",
        category: "other",
      };

      expect(minimalDevice.model).toBeUndefined();
      expect(minimalDevice.manufacturer).toBeUndefined();
      expect(minimalDevice.slug).toBe("minimal-device");
    });
  });
});
