import { describe, it, expect } from "vitest";
import { findCollisions } from "$lib/utils/collision";
import type { PlacedDevice, DeviceType } from "$lib/types";

describe("Collision Toast Notifications", () => {
  // Sample device library for testing
  const deviceLibrary: DeviceType[] = [
    {
      slug: "server-1u",
      manufacturer: "Generic",
      model: "1U Server",
      u_height: 1,
      is_full_depth: true,
      form_factor: "rack-mount",
      category: "server",
    },
    {
      slug: "server-2u",
      manufacturer: "Dell",
      model: "PowerEdge R740",
      u_height: 2,
      is_full_depth: true,
      form_factor: "rack-mount",
      category: "server",
    },
    {
      slug: "switch-1u",
      manufacturer: "Cisco",
      model: "Catalyst 9300",
      u_height: 1,
      is_full_depth: false,
      form_factor: "rack-mount",
      category: "network",
    },
    {
      slug: "ups-2u",
      manufacturer: "APC",
      model: "Smart-UPS 1500",
      u_height: 2,
      is_full_depth: true,
      form_factor: "rack-mount",
      category: "power",
    },
    {
      slug: "no-model-device",
      manufacturer: "Unknown Manufacturer",
      u_height: 1,
      is_full_depth: true,
      form_factor: "rack-mount",
      category: "other",
    },
    {
      slug: "bare-device",
      u_height: 1,
      is_full_depth: true,
      form_factor: "rack-mount",
      category: "other",
    },
  ];

  describe("Collision Detection", () => {
    it("should detect collision with existing device", () => {
      const placedDevices: PlacedDevice[] = [
        {
          id: "placed-1",
          device_type: "server-2u",
          position: 10,
          face: "front",
        },
      ];

      const rack = {
        name: "Test Rack",
        u_height: 42,
        rack_width: 19,
        devices: placedDevices,
      };

      const collisions = findCollisions(
        rack,
        deviceLibrary,
        1,
        10,
        -1,
        "front",
      );

      expect(collisions.length).toBe(1);
      expect(collisions[0].device_type).toBe("server-2u");
    });

    it("should detect collision with multi-U device spanning target position", () => {
      const placedDevices: PlacedDevice[] = [
        {
          id: "placed-1",
          device_type: "server-2u",
          position: 10,
          face: "front",
        },
      ];

      const rack = {
        name: "Test Rack",
        u_height: 42,
        rack_width: 19,
        devices: placedDevices,
      };

      const collisions = findCollisions(
        rack,
        deviceLibrary,
        1,
        11,
        -1,
        "front",
      );

      expect(collisions.length).toBe(1);
    });

    it("should not detect collision for valid position", () => {
      const placedDevices: PlacedDevice[] = [
        {
          id: "placed-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
        },
      ];

      const rack = {
        name: "Test Rack",
        u_height: 42,
        rack_width: 19,
        devices: placedDevices,
      };

      const collisions = findCollisions(
        rack,
        deviceLibrary,
        1,
        20,
        -1,
        "front",
      );

      expect(collisions.length).toBe(0);
    });

    it("should detect multiple collisions", () => {
      const placedDevices: PlacedDevice[] = [
        {
          id: "placed-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
        },
        {
          id: "placed-2",
          device_type: "switch-1u",
          position: 11,
          face: "front",
        },
      ];

      const rack = {
        name: "Test Rack",
        u_height: 42,
        rack_width: 19,
        devices: placedDevices,
      };

      const collisions = findCollisions(
        rack,
        deviceLibrary,
        2,
        10,
        -1,
        "front",
      );

      expect(collisions.length).toBe(2);
    });
  });

  describe("Toast Message Formatting", () => {
    it("should format single collision message correctly", () => {
      const collisions: PlacedDevice[] = [
        {
          id: "placed-1",
          device_type: "server-2u",
          position: 10,
          face: "front",
        },
      ];

      const blockingNames = collisions.map((placed) => {
        if (placed.name) return placed.name;
        const deviceType = deviceLibrary.find(
          (d) => d.slug === placed.device_type,
        );
        if (deviceType) {
          if (deviceType.model) return deviceType.model;
          if (deviceType.manufacturer) return deviceType.manufacturer;
        }
        return placed.device_type;
      });

      const message =
        blockingNames.length === 1
          ? `Position blocked by ${blockingNames[0]}`
          : `Position blocked by ${blockingNames.join(", ")}`;

      expect(message).toBe("Position blocked by PowerEdge R740");
    });

    it("should format multiple collision message correctly", () => {
      const collisions: PlacedDevice[] = [
        {
          id: "placed-1",
          device_type: "server-2u",
          position: 10,
          face: "front",
        },
        {
          id: "placed-2",
          device_type: "switch-1u",
          position: 11,
          face: "front",
        },
      ];

      const blockingNames = collisions.map((placed) => {
        if (placed.name) return placed.name;
        const deviceType = deviceLibrary.find(
          (d) => d.slug === placed.device_type,
        );
        if (deviceType) {
          if (deviceType.model) return deviceType.model;
          if (deviceType.manufacturer) return deviceType.manufacturer;
        }
        return placed.device_type;
      });

      const message =
        blockingNames.length === 1
          ? `Position blocked by ${blockingNames[0]}`
          : `Position blocked by ${blockingNames.join(", ")}`;

      expect(message).toBe("Position blocked by PowerEdge R740, Catalyst 9300");
    });

    it("should use custom name when device has one", () => {
      const collisions: PlacedDevice[] = [
        {
          id: "placed-1",
          device_type: "server-2u",
          name: "Production DB Server",
          position: 10,
          face: "front",
        },
      ];

      const blockingNames = collisions.map((placed) => {
        if (placed.name) return placed.name;
        const deviceType = deviceLibrary.find(
          (d) => d.slug === placed.device_type,
        );
        if (deviceType) {
          if (deviceType.model) return deviceType.model;
          if (deviceType.manufacturer) return deviceType.manufacturer;
        }
        return placed.device_type;
      });

      expect(blockingNames[0]).toBe("Production DB Server");
    });
  });

  describe("Name Resolution Fallback Chain", () => {
    it("should use placed.name first if available", () => {
      const placed: PlacedDevice = {
        id: "p1",
        device_type: "server-2u",
        name: "My Custom Name",
        position: 10,
        face: "front",
      };

      const resolveName = (p: PlacedDevice): string => {
        if (p.name) return p.name;
        const deviceType = deviceLibrary.find((d) => d.slug === p.device_type);
        if (deviceType) {
          if (deviceType.model) return deviceType.model;
          if (deviceType.manufacturer) return deviceType.manufacturer;
        }
        return p.device_type;
      };

      expect(resolveName(placed)).toBe("My Custom Name");
    });

    it("should fallback to model if no custom name", () => {
      const placed: PlacedDevice = {
        id: "p1",
        device_type: "server-2u",
        position: 10,
        face: "front",
      };

      const resolveName = (p: PlacedDevice): string => {
        if (p.name) return p.name;
        const deviceType = deviceLibrary.find((d) => d.slug === p.device_type);
        if (deviceType) {
          if (deviceType.model) return deviceType.model;
          if (deviceType.manufacturer) return deviceType.manufacturer;
        }
        return p.device_type;
      };

      expect(resolveName(placed)).toBe("PowerEdge R740");
    });

    it("should fallback to manufacturer if no model", () => {
      const placed: PlacedDevice = {
        id: "p1",
        device_type: "no-model-device",
        position: 10,
        face: "front",
      };

      const resolveName = (p: PlacedDevice): string => {
        if (p.name) return p.name;
        const deviceType = deviceLibrary.find((d) => d.slug === p.device_type);
        if (deviceType) {
          if (deviceType.model) return deviceType.model;
          if (deviceType.manufacturer) return deviceType.manufacturer;
        }
        return p.device_type;
      };

      expect(resolveName(placed)).toBe("Unknown Manufacturer");
    });

    it("should fallback to device_type slug as last resort", () => {
      const placed: PlacedDevice = {
        id: "p1",
        device_type: "bare-device",
        position: 10,
        face: "front",
      };

      const resolveName = (p: PlacedDevice): string => {
        if (p.name) return p.name;
        const deviceType = deviceLibrary.find((d) => d.slug === p.device_type);
        if (deviceType) {
          if (deviceType.model) return deviceType.model;
          if (deviceType.manufacturer) return deviceType.manufacturer;
        }
        return p.device_type;
      };

      expect(resolveName(placed)).toBe("bare-device");
    });

    it("should use slug for unknown device type", () => {
      const placed: PlacedDevice = {
        id: "p1",
        device_type: "unknown-device-slug",
        position: 10,
        face: "front",
      };

      const resolveName = (p: PlacedDevice): string => {
        if (p.name) return p.name;
        const deviceType = deviceLibrary.find((d) => d.slug === p.device_type);
        if (deviceType) {
          if (deviceType.model) return deviceType.model;
          if (deviceType.manufacturer) return deviceType.manufacturer;
        }
        return p.device_type;
      };

      expect(resolveName(placed)).toBe("unknown-device-slug");
    });
  });

  describe("Half-Depth Device Collisions", () => {
    it("should allow half-depth devices on opposite faces", () => {
      const placedDevices: PlacedDevice[] = [
        {
          id: "placed-1",
          device_type: "switch-1u",
          position: 10,
          face: "front",
        },
      ];

      const rack = {
        name: "Test Rack",
        u_height: 42,
        rack_width: 19,
        devices: placedDevices,
      };

      const collisions = findCollisions(rack, deviceLibrary, 1, 10, -1, "rear");

      expect(collisions.length).toBe(0);
    });

    it("should block device on same face", () => {
      const placedDevices: PlacedDevice[] = [
        {
          id: "placed-1",
          device_type: "switch-1u",
          position: 10,
          face: "front",
        },
      ];

      const rack = {
        name: "Test Rack",
        u_height: 42,
        rack_width: 19,
        devices: placedDevices,
      };

      const collisions = findCollisions(
        rack,
        deviceLibrary,
        1,
        10,
        -1,
        "front",
      );

      expect(collisions.length).toBe(1);
    });

    it("should block device placing at same position and face", () => {
      const placedDevices: PlacedDevice[] = [
        {
          id: "placed-1",
          device_type: "switch-1u",
          position: 10,
          face: "front",
        },
      ];

      const rack = {
        name: "Test Rack",
        u_height: 42,
        rack_width: 19,
        devices: placedDevices,
      };

      const collisions = findCollisions(
        rack,
        deviceLibrary,
        1,
        10,
        -1,
        "front",
      );

      expect(collisions.length).toBe(1);
    });
  });
});
