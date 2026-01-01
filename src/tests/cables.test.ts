import { describe, it, expect, beforeEach } from "vitest";
import {
  CableSchema,
  CableTypeSchema,
  CableStatusSchema,
  LengthUnitSchema,
} from "$lib/schemas";
import {
  getCableStore,
  validateCable,
  type CreateCableInput,
} from "$lib/stores/cables.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import type { Cable, Layout, DeviceType, PlacedDevice } from "$lib/types";
import { VERSION } from "$lib/version";

// Test fixtures
const createTestDeviceType = (
  slug: string,
  interfaces?: { name: string; type: string }[],
): DeviceType => ({
  slug,
  u_height: 1,
  colour: "#4A90D9",
  category: "network",
  interfaces: interfaces?.map((i) => ({ ...i, type: i.type as "1000base-t" })),
});

const createTestPlacedDevice = (
  id: string,
  device_type: string,
  position: number,
): PlacedDevice => ({
  id,
  device_type,
  position,
  face: "front",
});

const createTestLayout = (): Layout => ({
  version: VERSION,
  name: "Test Layout",
  rack: {
    name: "Test Rack",
    height: 42,
    width: 19,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post-cabinet",
    starting_unit: 1,
    position: 0,
    devices: [
      createTestPlacedDevice("device-1", "switch-24", 1),
      createTestPlacedDevice("device-2", "switch-48", 3),
    ],
  },
  device_types: [
    createTestDeviceType("switch-24", [
      { name: "Gi1/0/1", type: "1000base-t" },
      { name: "Gi1/0/2", type: "1000base-t" },
    ]),
    createTestDeviceType("switch-48", [
      { name: "Gi1/0/1", type: "1000base-t" },
      { name: "Gi1/0/2", type: "1000base-t" },
    ]),
  ],
  settings: {
    display_mode: "label",
    show_labels_on_images: false,
  },
  cables: [],
});

describe("Cable Schema Validation", () => {
  describe("CableTypeSchema", () => {
    it("accepts valid cable types", () => {
      expect(CableTypeSchema.parse("cat5e")).toBe("cat5e");
      expect(CableTypeSchema.parse("cat6")).toBe("cat6");
      expect(CableTypeSchema.parse("cat6a")).toBe("cat6a");
      expect(CableTypeSchema.parse("cat7")).toBe("cat7");
      expect(CableTypeSchema.parse("cat8")).toBe("cat8");
      expect(CableTypeSchema.parse("dac-passive")).toBe("dac-passive");
      expect(CableTypeSchema.parse("dac-active")).toBe("dac-active");
      expect(CableTypeSchema.parse("mmf-om3")).toBe("mmf-om3");
      expect(CableTypeSchema.parse("mmf-om4")).toBe("mmf-om4");
      expect(CableTypeSchema.parse("smf-os2")).toBe("smf-os2");
      expect(CableTypeSchema.parse("aoc")).toBe("aoc");
      expect(CableTypeSchema.parse("power")).toBe("power");
      expect(CableTypeSchema.parse("serial")).toBe("serial");
    });

    it("rejects invalid cable types", () => {
      expect(() => CableTypeSchema.parse("invalid")).toThrow();
      expect(() => CableTypeSchema.parse("cat9")).toThrow();
      expect(() => CableTypeSchema.parse("")).toThrow();
    });
  });

  describe("CableStatusSchema", () => {
    it("accepts valid cable statuses", () => {
      expect(CableStatusSchema.parse("connected")).toBe("connected");
      expect(CableStatusSchema.parse("planned")).toBe("planned");
      expect(CableStatusSchema.parse("decommissioning")).toBe(
        "decommissioning",
      );
    });

    it("rejects invalid cable statuses", () => {
      expect(() => CableStatusSchema.parse("invalid")).toThrow();
      expect(() => CableStatusSchema.parse("disconnected")).toThrow();
    });
  });

  describe("LengthUnitSchema", () => {
    it("accepts valid length units", () => {
      expect(LengthUnitSchema.parse("m")).toBe("m");
      expect(LengthUnitSchema.parse("cm")).toBe("cm");
      expect(LengthUnitSchema.parse("ft")).toBe("ft");
      expect(LengthUnitSchema.parse("in")).toBe("in");
    });

    it("rejects invalid length units", () => {
      expect(() => LengthUnitSchema.parse("mm")).toThrow();
      expect(() => LengthUnitSchema.parse("")).toThrow();
    });
  });

  describe("CableSchema", () => {
    it("accepts valid cable with required fields only", () => {
      const cable = {
        id: "cable-1",
        a_device_id: "device-1",
        a_interface: "eth0",
        b_device_id: "device-2",
        b_interface: "eth0",
      };
      expect(CableSchema.parse(cable)).toMatchObject(cable);
    });

    it("accepts valid cable with all fields", () => {
      const cable: Cable = {
        id: "cable-1",
        a_device_id: "device-1",
        a_interface: "Gi1/0/1",
        b_device_id: "device-2",
        b_interface: "Gi1/0/1",
        type: "cat6a",
        color: "#FF5500",
        label: "Uplink 1",
        length: 3,
        length_unit: "m",
        status: "connected",
      };
      expect(CableSchema.parse(cable)).toMatchObject(cable);
    });

    it("rejects cable without id", () => {
      const cable = {
        a_device_id: "device-1",
        a_interface: "eth0",
        b_device_id: "device-2",
        b_interface: "eth0",
      };
      expect(() => CableSchema.parse(cable)).toThrow();
    });

    it("rejects cable with invalid color format", () => {
      const cable = {
        id: "cable-1",
        a_device_id: "device-1",
        a_interface: "eth0",
        b_device_id: "device-2",
        b_interface: "eth0",
        color: "red",
      };
      expect(() => CableSchema.parse(cable)).toThrow(/hex color/);
    });

    it("accepts valid hex color formats", () => {
      const baseProps = {
        id: "cable-1",
        a_device_id: "device-1",
        a_interface: "eth0",
        b_device_id: "device-2",
        b_interface: "eth0",
      };

      expect(
        CableSchema.parse({ ...baseProps, color: "#FF5500" }),
      ).toMatchObject(baseProps);
      expect(
        CableSchema.parse({ ...baseProps, color: "#ff5500" }),
      ).toMatchObject(baseProps);
      expect(
        CableSchema.parse({ ...baseProps, color: "#123ABC" }),
      ).toMatchObject(baseProps);
    });

    it("rejects invalid hex color formats", () => {
      const baseProps = {
        id: "cable-1",
        a_device_id: "device-1",
        a_interface: "eth0",
        b_device_id: "device-2",
        b_interface: "eth0",
      };

      expect(() =>
        CableSchema.parse({ ...baseProps, color: "#FFF" }),
      ).toThrow();
      expect(() =>
        CableSchema.parse({ ...baseProps, color: "FF5500" }),
      ).toThrow();
      expect(() =>
        CableSchema.parse({ ...baseProps, color: "#GGGGGG" }),
      ).toThrow();
    });

    it("rejects cable with negative length", () => {
      const cable = {
        id: "cable-1",
        a_device_id: "device-1",
        a_interface: "eth0",
        b_device_id: "device-2",
        b_interface: "eth0",
        length: -1,
      };
      expect(() => CableSchema.parse(cable)).toThrow();
    });

    it("rejects cable with zero length", () => {
      const cable = {
        id: "cable-1",
        a_device_id: "device-1",
        a_interface: "eth0",
        b_device_id: "device-2",
        b_interface: "eth0",
        length: 0,
      };
      expect(() => CableSchema.parse(cable)).toThrow();
    });

    it("accepts cable with positive length and length_unit", () => {
      const cable = {
        id: "cable-1",
        a_device_id: "device-1",
        a_interface: "eth0",
        b_device_id: "device-2",
        b_interface: "eth0",
        length: 0.5,
        length_unit: "m",
      };
      expect(CableSchema.parse(cable)).toMatchObject(cable);
    });

    it("rejects cable with length but no length_unit", () => {
      const cable = {
        id: "cable-1",
        a_device_id: "device-1",
        a_interface: "eth0",
        b_device_id: "device-2",
        b_interface: "eth0",
        length: 0.5,
      };
      expect(() => CableSchema.parse(cable)).toThrow("length_unit is required");
    });
  });
});

describe("Cable Validation", () => {
  beforeEach(() => {
    resetLayoutStore();
    const store = getLayoutStore();
    store.loadLayout(createTestLayout());
  });

  describe("validateCable", () => {
    it("validates a valid cable between existing devices", () => {
      const cable = {
        a_device_id: "device-1",
        a_interface: "Gi1/0/1",
        b_device_id: "device-2",
        b_interface: "Gi1/0/1",
      };
      const result = validateCable(cable, []);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("rejects cable with non-existent A-side device", () => {
      const cable = {
        a_device_id: "non-existent",
        a_interface: "Gi1/0/1",
        b_device_id: "device-2",
        b_interface: "Gi1/0/1",
      };
      const result = validateCable(cable, []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("A-side device not found: non-existent");
    });

    it("rejects cable with non-existent B-side device", () => {
      const cable = {
        a_device_id: "device-1",
        a_interface: "Gi1/0/1",
        b_device_id: "non-existent",
        b_interface: "Gi1/0/1",
      };
      const result = validateCable(cable, []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("B-side device not found: non-existent");
    });

    it("rejects cable with non-existent A-side interface", () => {
      const cable = {
        a_device_id: "device-1",
        a_interface: "NonExistent",
        b_device_id: "device-2",
        b_interface: "Gi1/0/1",
      };
      const result = validateCable(cable, []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Interface 'NonExistent' not found on device type 'switch-24'",
      );
    });

    it("rejects cable with non-existent B-side interface", () => {
      const cable = {
        a_device_id: "device-1",
        a_interface: "Gi1/0/1",
        b_device_id: "device-2",
        b_interface: "NonExistent",
      };
      const result = validateCable(cable, []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Interface 'NonExistent' not found on device type 'switch-48'",
      );
    });

    it("rejects duplicate cable (same endpoints)", () => {
      const existingCables: Cable[] = [
        {
          id: "cable-1",
          a_device_id: "device-1",
          a_interface: "Gi1/0/1",
          b_device_id: "device-2",
          b_interface: "Gi1/0/1",
        },
      ];
      const cable = {
        a_device_id: "device-1",
        a_interface: "Gi1/0/1",
        b_device_id: "device-2",
        b_interface: "Gi1/0/1",
      };
      const result = validateCable(cable, existingCables);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Cable already exists between these endpoints",
      );
    });

    it("rejects duplicate cable (reversed endpoints)", () => {
      const existingCables: Cable[] = [
        {
          id: "cable-1",
          a_device_id: "device-1",
          a_interface: "Gi1/0/1",
          b_device_id: "device-2",
          b_interface: "Gi1/0/1",
        },
      ];
      // Same connection but with A and B reversed
      const cable = {
        a_device_id: "device-2",
        a_interface: "Gi1/0/1",
        b_device_id: "device-1",
        b_interface: "Gi1/0/1",
      };
      const result = validateCable(cable, existingCables);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Cable already exists between these endpoints",
      );
    });

    it("allows update when excluding current cable from duplicate check", () => {
      const existingCables: Cable[] = [
        {
          id: "cable-1",
          a_device_id: "device-1",
          a_interface: "Gi1/0/1",
          b_device_id: "device-2",
          b_interface: "Gi1/0/1",
        },
      ];
      // Same cable, but excluding itself from duplicate check
      const cable = {
        a_device_id: "device-1",
        a_interface: "Gi1/0/1",
        b_device_id: "device-2",
        b_interface: "Gi1/0/1",
      };
      const result = validateCable(cable, existingCables, "cable-1");
      expect(result.valid).toBe(true);
    });

    it("rejects cable connecting interface to itself", () => {
      const cable = {
        a_device_id: "device-1",
        a_interface: "Gi1/0/1",
        b_device_id: "device-1",
        b_interface: "Gi1/0/1",
      };
      const result = validateCable(cable, []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Cable cannot connect an interface to itself",
      );
    });

    it("allows different interfaces on same device", () => {
      const cable = {
        a_device_id: "device-1",
        a_interface: "Gi1/0/1",
        b_device_id: "device-1",
        b_interface: "Gi1/0/2",
      };
      const result = validateCable(cable, []);
      expect(result.valid).toBe(true);
    });
  });
});

describe("Cable Store", () => {
  beforeEach(() => {
    resetLayoutStore();
    const store = getLayoutStore();
    store.loadLayout(createTestLayout());
  });

  describe("getCables", () => {
    it("returns empty array when no cables exist", () => {
      const cableStore = getCableStore();
      expect(cableStore.cables).toEqual([]);
    });

    it("returns cables from layout", () => {
      const layoutStore = getLayoutStore();
      const testCable: Cable = {
        id: "cable-1",
        a_device_id: "device-1",
        a_interface: "Gi1/0/1",
        b_device_id: "device-2",
        b_interface: "Gi1/0/1",
      };
      layoutStore.loadLayout({
        ...layoutStore.layout,
        cables: [testCable],
      });

      const cableStore = getCableStore();
      expect(cableStore.cables).toHaveLength(1);
      expect(cableStore.cables[0]).toMatchObject(testCable);
    });
  });

  describe("getCableById", () => {
    it("returns cable when found", () => {
      const layoutStore = getLayoutStore();
      const testCable: Cable = {
        id: "cable-1",
        a_device_id: "device-1",
        a_interface: "Gi1/0/1",
        b_device_id: "device-2",
        b_interface: "Gi1/0/1",
      };
      layoutStore.loadLayout({
        ...layoutStore.layout,
        cables: [testCable],
      });

      const cableStore = getCableStore();
      expect(cableStore.getCableById("cable-1")).toMatchObject(testCable);
    });

    it("returns undefined when not found", () => {
      const cableStore = getCableStore();
      expect(cableStore.getCableById("non-existent")).toBeUndefined();
    });
  });

  describe("getCablesByDevice", () => {
    it("returns cables connected to device", () => {
      const layoutStore = getLayoutStore();
      layoutStore.loadLayout({
        ...layoutStore.layout,
        cables: [
          {
            id: "cable-1",
            a_device_id: "device-1",
            a_interface: "Gi1/0/1",
            b_device_id: "device-2",
            b_interface: "Gi1/0/1",
          },
          {
            id: "cable-2",
            a_device_id: "device-1",
            a_interface: "Gi1/0/2",
            b_device_id: "device-2",
            b_interface: "Gi1/0/2",
          },
        ],
      });

      const cableStore = getCableStore();
      const cables = cableStore.getCablesByDevice("device-1");
      expect(cables).toHaveLength(2);
    });

    it("returns empty array when no cables connected", () => {
      const cableStore = getCableStore();
      expect(cableStore.getCablesByDevice("device-1")).toEqual([]);
    });
  });

  describe("getCablesByInterface", () => {
    it("returns cables connected to specific interface", () => {
      const layoutStore = getLayoutStore();
      layoutStore.loadLayout({
        ...layoutStore.layout,
        cables: [
          {
            id: "cable-1",
            a_device_id: "device-1",
            a_interface: "Gi1/0/1",
            b_device_id: "device-2",
            b_interface: "Gi1/0/1",
          },
          {
            id: "cable-2",
            a_device_id: "device-1",
            a_interface: "Gi1/0/2",
            b_device_id: "device-2",
            b_interface: "Gi1/0/2",
          },
        ],
      });

      const cableStore = getCableStore();
      const cables = cableStore.getCablesByInterface("device-1", "Gi1/0/1");
      expect(cables).toHaveLength(1);
      expect(cables[0]!.id).toBe("cable-1");
    });
  });

  describe("addCable", () => {
    it("adds a valid cable", () => {
      const cableStore = getCableStore();
      const input: CreateCableInput = {
        a_device_id: "device-1",
        a_interface: "Gi1/0/1",
        b_device_id: "device-2",
        b_interface: "Gi1/0/1",
        type: "cat6a",
        color: "#FF5500",
      };

      const result = cableStore.addCable(input);
      expect(result.cable).not.toBeNull();
      expect(result.errors).toBeNull();
      expect(result.cable!.id).toBeDefined();
      expect(result.cable!.type).toBe("cat6a");
      expect(result.cable!.color).toBe("#FF5500");
    });

    it("rejects invalid cable", () => {
      const cableStore = getCableStore();
      const input: CreateCableInput = {
        a_device_id: "non-existent",
        a_interface: "eth0",
        b_device_id: "device-2",
        b_interface: "Gi1/0/1",
      };

      const result = cableStore.addCable(input);
      expect(result.cable).toBeNull();
      expect(result.errors).not.toBeNull();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it("marks layout as dirty after adding cable", () => {
      const layoutStore = getLayoutStore();
      layoutStore.markClean();
      expect(layoutStore.isDirty).toBe(false);

      const cableStore = getCableStore();
      cableStore.addCable({
        a_device_id: "device-1",
        a_interface: "Gi1/0/1",
        b_device_id: "device-2",
        b_interface: "Gi1/0/1",
      });

      expect(layoutStore.isDirty).toBe(true);
    });
  });

  describe("updateCable", () => {
    beforeEach(() => {
      const layoutStore = getLayoutStore();
      layoutStore.loadLayout({
        ...layoutStore.layout,
        cables: [
          {
            id: "cable-1",
            a_device_id: "device-1",
            a_interface: "Gi1/0/1",
            b_device_id: "device-2",
            b_interface: "Gi1/0/1",
          },
        ],
      });
    });

    it("updates cable properties", () => {
      const cableStore = getCableStore();
      const result = cableStore.updateCable("cable-1", {
        type: "cat6a",
        color: "#00FF00",
        label: "Updated Link",
      });

      expect(result.success).toBe(true);

      const updated = cableStore.getCableById("cable-1");
      expect(updated!.type).toBe("cat6a");
      expect(updated!.color).toBe("#00FF00");
      expect(updated!.label).toBe("Updated Link");
    });

    it("rejects update with invalid endpoint change", () => {
      const cableStore = getCableStore();
      const result = cableStore.updateCable("cable-1", {
        a_device_id: "non-existent",
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain("A-side device not found: non-existent");
    });

    it("returns error for non-existent cable", () => {
      const cableStore = getCableStore();
      const result = cableStore.updateCable("non-existent", {
        label: "New Label",
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Cable not found");
    });

    it("marks layout as dirty after updating cable", () => {
      const layoutStore = getLayoutStore();
      layoutStore.markClean();
      expect(layoutStore.isDirty).toBe(false);

      const cableStore = getCableStore();
      cableStore.updateCable("cable-1", { label: "Updated" });

      expect(layoutStore.isDirty).toBe(true);
    });
  });

  describe("removeCable", () => {
    beforeEach(() => {
      const layoutStore = getLayoutStore();
      layoutStore.loadLayout({
        ...layoutStore.layout,
        cables: [
          {
            id: "cable-1",
            a_device_id: "device-1",
            a_interface: "Gi1/0/1",
            b_device_id: "device-2",
            b_interface: "Gi1/0/1",
          },
        ],
      });
    });

    it("removes existing cable", () => {
      const cableStore = getCableStore();
      const removed = cableStore.removeCable("cable-1");

      expect(removed).toBeDefined();
      expect(removed!.id).toBe("cable-1");
      expect(cableStore.cables).toHaveLength(0);
    });

    it("returns undefined for non-existent cable", () => {
      const cableStore = getCableStore();
      const removed = cableStore.removeCable("non-existent");
      expect(removed).toBeUndefined();
    });

    it("marks layout as dirty after removing cable", () => {
      const layoutStore = getLayoutStore();
      layoutStore.markClean();
      expect(layoutStore.isDirty).toBe(false);

      const cableStore = getCableStore();
      cableStore.removeCable("cable-1");

      expect(layoutStore.isDirty).toBe(true);
    });
  });

  describe("removeCablesByDevice", () => {
    beforeEach(() => {
      const layoutStore = getLayoutStore();
      layoutStore.loadLayout({
        ...layoutStore.layout,
        cables: [
          {
            id: "cable-1",
            a_device_id: "device-1",
            a_interface: "Gi1/0/1",
            b_device_id: "device-2",
            b_interface: "Gi1/0/1",
          },
          {
            id: "cable-2",
            a_device_id: "device-1",
            a_interface: "Gi1/0/2",
            b_device_id: "device-2",
            b_interface: "Gi1/0/2",
          },
        ],
      });
    });

    it("removes all cables connected to device", () => {
      const cableStore = getCableStore();
      const count = cableStore.removeCablesByDevice("device-1");

      expect(count).toBe(2);
      expect(cableStore.cables).toHaveLength(0);
    });

    it("returns 0 when no cables connected to device", () => {
      const cableStore = getCableStore();
      const count = cableStore.removeCablesByDevice("device-3");
      expect(count).toBe(0);
    });
  });
});
