/**
 * PlacedPort Tests
 * Tests for port instantiation when devices are placed
 */

import { describe, it, expect } from "vitest";
import { PlacedPortSchema } from "$lib/schemas";
import type { DeviceType } from "$lib/types";
import { instantiatePorts } from "$lib/utils/port-utils";

// ============================================================================
// PlacedPortSchema Tests
// ============================================================================

describe("PlacedPortSchema", () => {
  describe("valid PlacedPort", () => {
    it("accepts minimal valid port", () => {
      const port = {
        id: "port-uuid-123",
        template_name: "eth0",
        template_index: 0,
        type: "1000base-t",
      };
      expect(PlacedPortSchema.safeParse(port).success).toBe(true);
    });

    it("accepts port with optional label", () => {
      const port = {
        id: "port-uuid-123",
        template_name: "eth0",
        template_index: 0,
        type: "1000base-t",
        label: "Management Port",
      };
      expect(PlacedPortSchema.safeParse(port).success).toBe(true);
    });
  });

  describe("invalid PlacedPort", () => {
    it("rejects missing id", () => {
      const port = {
        template_name: "eth0",
        template_index: 0,
        type: "1000base-t",
      };
      expect(PlacedPortSchema.safeParse(port).success).toBe(false);
    });

    it("rejects missing template_name", () => {
      const port = {
        id: "port-uuid-123",
        template_index: 0,
        type: "1000base-t",
      };
      expect(PlacedPortSchema.safeParse(port).success).toBe(false);
    });

    it("rejects missing template_index", () => {
      const port = {
        id: "port-uuid-123",
        template_name: "eth0",
        type: "1000base-t",
      };
      expect(PlacedPortSchema.safeParse(port).success).toBe(false);
    });

    it("rejects missing type", () => {
      const port = {
        id: "port-uuid-123",
        template_name: "eth0",
        template_index: 0,
      };
      expect(PlacedPortSchema.safeParse(port).success).toBe(false);
    });

    it("rejects empty id", () => {
      const port = {
        id: "",
        template_name: "eth0",
        template_index: 0,
        type: "1000base-t",
      };
      expect(PlacedPortSchema.safeParse(port).success).toBe(false);
    });

    it("rejects empty template_name", () => {
      const port = {
        id: "port-uuid-123",
        template_name: "",
        template_index: 0,
        type: "1000base-t",
      };
      expect(PlacedPortSchema.safeParse(port).success).toBe(false);
    });

    it("rejects negative template_index", () => {
      const port = {
        id: "port-uuid-123",
        template_name: "eth0",
        template_index: -1,
        type: "1000base-t",
      };
      expect(PlacedPortSchema.safeParse(port).success).toBe(false);
    });

    it("rejects invalid type", () => {
      const port = {
        id: "port-uuid-123",
        template_name: "eth0",
        template_index: 0,
        type: "invalid-type",
      };
      expect(PlacedPortSchema.safeParse(port).success).toBe(false);
    });
  });
});

// ============================================================================
// instantiatePorts Tests
// ============================================================================

describe("instantiatePorts", () => {
  it("creates correct number of ports from DeviceType.interfaces", () => {
    const deviceType: DeviceType = {
      slug: "test-switch",
      u_height: 1,
      colour: "#4A90D9",
      category: "network",
      interfaces: [
        { name: "eth0", type: "1000base-t" },
        { name: "eth1", type: "1000base-t" },
        { name: "sfp0", type: "10gbase-x-sfpp" },
      ],
    };

    const ports = instantiatePorts(deviceType);

    expect(ports).toHaveLength(3);
  });

  it("each port has unique UUID", () => {
    const deviceType: DeviceType = {
      slug: "test-switch",
      u_height: 1,
      colour: "#4A90D9",
      category: "network",
      interfaces: [
        { name: "eth0", type: "1000base-t" },
        { name: "eth1", type: "1000base-t" },
      ],
    };

    const ports = instantiatePorts(deviceType);

    const ids = ports.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("template_name matches original interface name", () => {
    const deviceType: DeviceType = {
      slug: "test-switch",
      u_height: 1,
      colour: "#4A90D9",
      category: "network",
      interfaces: [
        { name: "Gi1/0/1", type: "1000base-t" },
        { name: "Gi1/0/2", type: "1000base-t" },
      ],
    };

    const ports = instantiatePorts(deviceType);

    expect(ports[0]?.template_name).toBe("Gi1/0/1");
    expect(ports[1]?.template_name).toBe("Gi1/0/2");
  });

  it("template_index matches interface array position", () => {
    const deviceType: DeviceType = {
      slug: "test-switch",
      u_height: 1,
      colour: "#4A90D9",
      category: "network",
      interfaces: [
        { name: "eth0", type: "1000base-t" },
        { name: "eth1", type: "1000base-t" },
        { name: "sfp0", type: "10gbase-x-sfpp" },
      ],
    };

    const ports = instantiatePorts(deviceType);

    expect(ports[0]?.template_index).toBe(0);
    expect(ports[1]?.template_index).toBe(1);
    expect(ports[2]?.template_index).toBe(2);
  });

  it("type is cached from interface template", () => {
    const deviceType: DeviceType = {
      slug: "test-switch",
      u_height: 1,
      colour: "#4A90D9",
      category: "network",
      interfaces: [
        { name: "eth0", type: "1000base-t" },
        { name: "sfp0", type: "10gbase-x-sfpp" },
        { name: "mgmt", type: "100base-tx" },
      ],
    };

    const ports = instantiatePorts(deviceType);

    expect(ports[0]?.type).toBe("1000base-t");
    expect(ports[1]?.type).toBe("10gbase-x-sfpp");
    expect(ports[2]?.type).toBe("100base-tx");
  });

  it("devices without interfaces get empty ports array", () => {
    const deviceType: DeviceType = {
      slug: "blank-panel",
      u_height: 1,
      colour: "#333333",
      category: "blank",
      // No interfaces field
    };

    const ports = instantiatePorts(deviceType);

    expect(ports).toEqual([]);
  });

  it("devices with empty interfaces array get empty ports array", () => {
    const deviceType: DeviceType = {
      slug: "blank-panel",
      u_height: 1,
      colour: "#333333",
      category: "blank",
      interfaces: [],
    };

    const ports = instantiatePorts(deviceType);

    expect(ports).toEqual([]);
  });

  it("ports validate against PlacedPortSchema", () => {
    const deviceType: DeviceType = {
      slug: "test-switch",
      u_height: 1,
      colour: "#4A90D9",
      category: "network",
      interfaces: [{ name: "eth0", type: "1000base-t" }],
    };

    const ports = instantiatePorts(deviceType);

    for (const port of ports) {
      expect(PlacedPortSchema.safeParse(port).success).toBe(true);
    }
  });

  it("generates different UUIDs on each call", () => {
    const deviceType: DeviceType = {
      slug: "test-switch",
      u_height: 1,
      colour: "#4A90D9",
      category: "network",
      interfaces: [{ name: "eth0", type: "1000base-t" }],
    };

    const ports1 = instantiatePorts(deviceType);
    const ports2 = instantiatePorts(deviceType);

    expect(ports1[0]?.id).not.toBe(ports2[0]?.id);
  });
});

// ============================================================================
// PlacedDevice ports Integration Tests
// ============================================================================

describe("PlacedDevice with ports", () => {
  it("PlacedDeviceSchema accepts device with ports array", async () => {
    const { PlacedDeviceSchema } = await import("$lib/schemas");

    const device = {
      id: "device-uuid-123",
      device_type: "test-switch",
      position: 1,
      face: "front",
      ports: [
        { id: "port-1", template_name: "eth0", template_index: 0, type: "1000base-t" },
        { id: "port-2", template_name: "eth1", template_index: 1, type: "1000base-t" },
      ],
    };

    expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
  });

  it("PlacedDeviceSchema defaults ports to empty array when not provided", async () => {
    const { PlacedDeviceSchema } = await import("$lib/schemas");

    const device = {
      id: "device-uuid-123",
      device_type: "test-switch",
      position: 1,
      face: "front",
      // No ports field - should default to []
    };

    const result = PlacedDeviceSchema.safeParse(device);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ports).toEqual([]);
    }
  });

  it("PlacedDeviceSchema accepts device with empty ports array", async () => {
    const { PlacedDeviceSchema } = await import("$lib/schemas");

    const device = {
      id: "device-uuid-123",
      device_type: "blank-panel",
      position: 1,
      face: "front",
      ports: [],
    };

    expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
  });
});

// ============================================================================
// Layout Store Port Integration Tests
// ============================================================================

describe("Layout Store port instantiation", () => {
  it("placeDevice creates ports from device type interfaces", async () => {
    const { getLayoutStore, resetLayoutStore } =
      await import("$lib/stores/layout.svelte");
    resetLayoutStore();

    const store = getLayoutStore();

    // Add a device type with interfaces
    store.addDeviceType({
      name: "Test Switch",
      u_height: 1,
      category: "network",
      colour: "#4A90D9",
      interfaces: [
        { name: "eth0", type: "1000base-t" },
        { name: "eth1", type: "1000base-t" },
        { name: "sfp0", type: "10gbase-x-sfpp" },
      ],
    });

    // Create a rack first
    store.addRack("Test Rack", 42);

    // Place the device
    const result = store.placeDevice("rack-0", "test-switch", 1);
    expect(result).toBe(true);

    // Check the placed device has ports
    const placedDevice = store.rack.devices[0];
    expect(placedDevice).toBeDefined();
    expect(placedDevice?.ports).toBeDefined();
    expect(placedDevice?.ports).toHaveLength(3);

    // Verify port template names match interfaces
    expect(placedDevice?.ports?.[0]?.template_name).toBe("eth0");
    expect(placedDevice?.ports?.[1]?.template_name).toBe("eth1");
    expect(placedDevice?.ports?.[2]?.template_name).toBe("sfp0");

    // Verify template_index is set correctly
    expect(placedDevice?.ports?.[0]?.template_index).toBe(0);
    expect(placedDevice?.ports?.[1]?.template_index).toBe(1);
    expect(placedDevice?.ports?.[2]?.template_index).toBe(2);

    // Verify type is cached correctly
    expect(placedDevice?.ports?.[0]?.type).toBe("1000base-t");
    expect(placedDevice?.ports?.[1]?.type).toBe("1000base-t");
    expect(placedDevice?.ports?.[2]?.type).toBe("10gbase-x-sfpp");

    // Verify each port has a unique ID
    const portIds = placedDevice?.ports?.map((p) => p.id) ?? [];
    const uniqueIds = new Set(portIds);
    expect(uniqueIds.size).toBe(portIds.length);
  });

  it("placeDevice creates empty ports array for device without interfaces", async () => {
    const { getLayoutStore, resetLayoutStore } =
      await import("$lib/stores/layout.svelte");
    resetLayoutStore();

    const store = getLayoutStore();

    // Add a device type without interfaces
    store.addDeviceType({
      name: "Blank Panel",
      u_height: 1,
      category: "blank",
      colour: "#333333",
      // No interfaces
    });

    // Create a rack
    store.addRack("Test Rack", 42);

    // Place the device
    const result = store.placeDevice("rack-0", "blank-panel", 1);
    expect(result).toBe(true);

    // Check the placed device has empty ports array
    const placedDevice = store.rack.devices[0];
    expect(placedDevice).toBeDefined();
    expect(placedDevice?.ports).toEqual([]);
  });
});
