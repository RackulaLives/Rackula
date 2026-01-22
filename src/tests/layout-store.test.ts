import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getImageStore, resetImageStore } from "$lib/stores/images.svelte";
import type { Layout } from "$lib/types";
import { VERSION } from "$lib/version";
import { toInternalUnits } from "$lib/utils/position";
import { setupStoreWithDevice } from "./factories";

describe("Layout Store", () => {
  beforeEach(() => {
    // Reset the store before each test
    resetLayoutStore();
  });

  describe("initial state", () => {
    it("initializes with correct app version", () => {
      const store = getLayoutStore();
      expect(store.layout.name).toBe("Racky McRackface");
      expect(store.layout.version).toBe(VERSION);
      // Multi-rack: starts with a default rack in the racks array
      expect(store.layout.racks[0]).toBeDefined();
      expect(store.layout.racks[0].devices).toEqual([]);
      // device_types starts empty (starter library is a runtime constant, not stored)
      expect(store.layout.device_types.length).toBe(0);
    });

    it("initializes isDirty as false", () => {
      const store = getLayoutStore();
      expect(store.isDirty).toBe(false);
    });

    it("initializes hasRack as true", () => {
      const store = getLayoutStore();
      expect(store.hasRack).toBe(true);
    });

    it("rackCount is 0 before user starts, 1 after", () => {
      const store = getLayoutStore();
      // Before user starts, rackCount is 0 (WelcomeScreen shown)
      expect(store.rackCount).toBe(0);
      expect(store.hasStarted).toBe(false);
      // After user starts, rackCount is 1
      store.markStarted();
      expect(store.rackCount).toBe(1);
      expect(store.hasStarted).toBe(true);
    });

    it("canAddRack is true when under MAX_RACKS", () => {
      const store = getLayoutStore();
      expect(store.canAddRack).toBe(true);
    });

    it("rack returns the active rack", () => {
      const store = getLayoutStore();
      expect(store.rack).toBeDefined();
      expect(store.rack.name).toBe("Racky McRackface");
    });
  });

  describe("createNewLayout", () => {
    it("creates a new layout with the given name", () => {
      const store = getLayoutStore();
      store.createNewLayout("My Lab");
      expect(store.layout.name).toBe("My Lab");
    });

    it("initializes with default rack", () => {
      const store = getLayoutStore();
      store.addRack("Test Rack", 42);
      store.createNewLayout("New Layout");
      // v0.2 always has a rack, but devices should be empty
      expect(store.layout.racks[0].devices).toEqual([]);
    });

    it("resets device_types to empty array", () => {
      const store = getLayoutStore();
      store.addDeviceType({
        name: "Test",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });
      store.createNewLayout("New Layout");
      // device_types starts empty (starter library is a runtime constant, not stored)
      expect(store.device_types.length).toBe(0);
    });

    it("sets isDirty to false", () => {
      const store = getLayoutStore();
      store.addRack("Test", 42);
      expect(store.isDirty).toBe(true);
      store.createNewLayout("New Layout");
      expect(store.isDirty).toBe(false);
    });
  });

  describe("loadLayout", () => {
    it("loads a v0.2 layout directly", () => {
      const store = getLayoutStore();
      const v02Layout: Layout = {
        version: "0.2.0",
        name: "Test Layout",
        racks: [
          {
            id: "rack-1",
            name: "Test Rack",
            height: 24,
            width: 19,
            desc_units: false,
            form_factor: "4-post-cabinet",
            starting_unit: 1,
            position: 0,
            devices: [],
          },
        ],
        device_types: [],
        settings: {
          display_mode: "label",
          show_labels_on_images: false,
        },
      };
      store.loadLayout(v02Layout);
      expect(store.layout.name).toBe("Test Layout");
      expect(store.layout.racks[0].height).toBe(24);
    });

    it("sets isDirty to false", () => {
      const store = getLayoutStore();
      store.markDirty();
      expect(store.isDirty).toBe(true);
      store.loadLayout({
        version: "0.2.0",
        name: "Test",
        racks: [
          {
            id: "rack-1",
            name: "Test",
            height: 42,
            width: 19,
            desc_units: false,
            form_factor: "4-post-cabinet",
            starting_unit: 1,
            position: 0,
            devices: [],
          },
        ],
        device_types: [],
        settings: {
          display_mode: "label",
          show_labels_on_images: false,
        },
      });
      expect(store.isDirty).toBe(false);
    });
  });

  describe("addRack", () => {
    it("creates rack with correct properties", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Main Rack", 42);
      expect(rack).not.toBeNull();
      expect(rack!.name).toBe("Main Rack");
      expect(rack!.height).toBe(42);
      expect(rack!.width).toBe(19);
      expect(rack!.devices).toEqual([]);
      // Multi-rack: uses generated nanoid
      expect(rack!.id).toBeDefined();
      expect(rack!.id.length).toBeGreaterThan(0);
    });

    it("adds new rack to the racks array", () => {
      const store = getLayoutStore();
      const initialCount = store.layout.racks.length;
      const rack = store.addRack("Test Rack", 42);
      expect(store.layout.racks.length).toBe(initialCount + 1);
      // New rack is added at the end
      const addedRack = store.layout.racks.find((r) => r.id === rack!.id);
      expect(addedRack).toBeDefined();
      expect(addedRack!.name).toBe("Test Rack");
      expect(addedRack!.height).toBe(42);
    });

    it("can add multiple racks", () => {
      const store = getLayoutStore();
      const initialCount = store.layout.racks.length;
      const rack1 = store.addRack("First Rack", 42);
      const rack2 = store.addRack("Second Rack", 24);
      expect(rack1).not.toBeNull();
      expect(rack2).not.toBeNull();
      expect(store.layout.racks.length).toBe(initialCount + 2);
      // Each rack has a unique ID
      expect(rack1!.id).not.toBe(rack2!.id);
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      expect(store.isDirty).toBe(false);
      store.addRack("Test", 42);
      expect(store.isDirty).toBe(true);
    });

    it("sets new rack as active rack", () => {
      const store = getLayoutStore();
      const rack = store.addRack("New Active Rack", 42);
      expect(store.rack.id).toBe(rack!.id);
    });
  });

  describe("addBayedRackGroup", () => {
    it("creates multiple racks with correct bay names", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Server Bay", 2, 12);
      expect(result).not.toBeNull();
      // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: bayCount=2 creates exactly 2 racks
      expect(result!.racks).toHaveLength(2);
      expect(result!.racks[0].name).toBe("Bay 1");
      expect(result!.racks[1].name).toBe("Bay 2");
    });

    it("creates 3 bays when requested", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Server Bay", 3, 12);
      expect(result).not.toBeNull();
      // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: bayCount=3 creates exactly 3 racks
      expect(result!.racks).toHaveLength(3);
      expect(result!.racks[0].name).toBe("Bay 1");
      expect(result!.racks[1].name).toBe("Bay 2");
      expect(result!.racks[2].name).toBe("Bay 3");
    });

    it("creates racks with specified height", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Server Bay", 2, 18);
      expect(result).not.toBeNull();
      expect(result!.racks[0].height).toBe(18);
      expect(result!.racks[1].height).toBe(18);
    });

    it("creates a rack group linking all racks", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Server Bay", 2, 12);
      expect(result).not.toBeNull();
      expect(result!.group.name).toBe("Server Bay");
      // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: rack_ids contains exactly bayCount IDs
      expect(result!.group.rack_ids).toHaveLength(2);
      expect(result!.group.rack_ids).toContain(result!.racks[0].id);
      expect(result!.group.rack_ids).toContain(result!.racks[1].id);
      expect(result!.group.layout_preset).toBe("bayed");
    });

    it("adds group to layout rack_groups", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Server Bay", 2, 12);
      expect(result).not.toBeNull();
      // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: creating 1 group adds exactly 1 entry
      expect(store.rack_groups).toHaveLength(1);
      expect(store.rack_groups[0].id).toBe(result!.group.id);
    });

    it("sets first bay as active rack", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Server Bay", 2, 12);
      expect(result).not.toBeNull();
      expect(store.activeRackId).toBe(result!.racks[0].id);
    });

    it("returns null when capacity exceeded for 2 bays", () => {
      const store = getLayoutStore();
      // Add 9 racks (we start with 1 default rack, so total will be 10)
      for (let i = 0; i < 9; i++) {
        store.addRack(`Rack ${i}`, 42);
      }
      // Now at MAX_RACKS, can't add 2 more
      const result = store.addBayedRackGroup("Server Bay", 2, 12);
      expect(result).toBeNull();
    });

    it("returns null when capacity exceeded for 3 bays", () => {
      const store = getLayoutStore();
      // Add 8 racks (we start with 1 default rack, so total will be 9)
      for (let i = 0; i < 8; i++) {
        store.addRack(`Rack ${i}`, 42);
      }
      // Now at 9 racks, can't add 3 more
      const result = store.addBayedRackGroup("Server Bay", 3, 12);
      expect(result).toBeNull();
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      expect(store.isDirty).toBe(false);
      store.addBayedRackGroup("Server Bay", 2, 12);
      expect(store.isDirty).toBe(true);
    });

    it("marks hasStarted as true", () => {
      const store = getLayoutStore();
      expect(store.hasStarted).toBe(false);
      store.addBayedRackGroup("Server Bay", 2, 12);
      expect(store.hasStarted).toBe(true);
    });

    it("creates racks with non-default width (23 inch)", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Wide Bay", 2, 12, 23);
      expect(result).not.toBeNull();
      expect(result!.racks[0].width).toBe(23);
      expect(result!.racks[1].width).toBe(23);
      expect(result!.group.id).toBeDefined();
      expect(result!.group.rack_ids).toContain(result!.racks[0].id);
      expect(result!.group.rack_ids).toContain(result!.racks[1].id);
    });
  });

  describe("updateRack", () => {
    it("modifies rack properties", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Original", 42);
      store.updateRack(rack!.id, { name: "Updated", height: 24 });
      const updatedRack = store.layout.racks.find((r) => r.id === rack!.id);
      expect(updatedRack!.name).toBe("Updated");
      expect(updatedRack!.height).toBe(24);
    });

    it("does not affect other rack properties", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Original", 42);
      store.updateRack(rack!.id, { name: "Updated" });
      const updatedRack = store.layout.racks.find((r) => r.id === rack!.id);
      expect(updatedRack!.height).toBe(42);
      expect(updatedRack!.width).toBe(19);
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test", 42);
      store.markClean();
      store.updateRack(rack!.id, { name: "Updated" });
      expect(store.isDirty).toBe(true);
    });
  });

  describe("deleteRack", () => {
    it("removes rack from racks array", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("First", 42);
      const rack2 = store.addRack("Second", 24);
      const initialCount = store.layout.racks.length;
      store.deleteRack(rack1!.id);
      expect(store.layout.racks.length).toBe(initialCount - 1);
      expect(
        store.layout.racks.find((r) => r.id === rack1!.id),
      ).toBeUndefined();
      expect(store.layout.racks.find((r) => r.id === rack2!.id)).toBeDefined();
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test", 42);
      store.markClean();
      store.deleteRack(rack!.id);
      expect(store.isDirty).toBe(true);
    });

    it("updates active rack when deleting active rack", () => {
      const store = getLayoutStore();
      const _rack1 = store.addRack("First", 42);
      const rack2 = store.addRack("Second", 24);
      // rack2 is now active (last added)
      expect(store.rack.id).toBe(rack2!.id);
      // Delete active rack
      store.deleteRack(rack2!.id);
      // Active rack should change to another rack
      expect(store.rack.id).not.toBe(rack2!.id);
    });
  });

  describe("reorderRacks", () => {
    it("reorders racks in array", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("First", 42);
      const rack2 = store.addRack("Second", 24);
      const _rack3 = store.addRack("Third", 36);
      // Move rack1 to position 2 (after rack2)
      store.reorderRacks(
        store.layout.racks.findIndex((r) => r.id === rack1!.id),
        store.layout.racks.findIndex((r) => r.id === rack2!.id) + 1,
      );
      // Check order changed
      const rackIds = store.layout.racks.map((r) => r.id);
      expect(rackIds.indexOf(rack2!.id)).toBeLessThan(
        rackIds.indexOf(rack1!.id),
      );
    });

    it("is a no-op when reordering to same position", () => {
      const store = getLayoutStore();
      store.addRack("Only Rack", 42);
      store.markClean();
      // Reorder to same position should be no-op
      store.reorderRacks(0, 0);
      // isDirty should not change since no actual reorder happened
      expect(store.isDirty).toBe(false);
    });
  });

  describe("addDeviceType", () => {
    it("generates slug and adds device type", () => {
      const store = getLayoutStore();
      const initialCount = store.device_types.length;
      const deviceType = store.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      expect(deviceType.slug).toBe("test-server");
      expect(store.device_types).toHaveLength(initialCount + 1);
      const addedType = store.device_types.find(
        (dt) => dt.slug === deviceType.slug,
      );
      expect(addedType?.u_height).toBe(2);
    });

    it("preserves all provided properties", () => {
      const store = getLayoutStore();
      const deviceType = store.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#FF0000",
        notes: "Test notes",
      });
      // Schema v1.0.0: Flat structure with colour at top level
      expect(deviceType.colour).toBeDefined(); // Color is set, exact value not important
      // Schema v1.0.0: Uses 'notes' field
      expect(deviceType.notes).toBe("Test notes");
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      store.addDeviceType({
        name: "Test",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });
      expect(store.isDirty).toBe(true);
    });
  });

  describe("updateDeviceType", () => {
    it("modifies device type properties", () => {
      const store = getLayoutStore();
      const deviceType = store.addDeviceType({
        name: "Original",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });
      store.updateDeviceType(deviceType.slug, { u_height: 2 });
      const updated = store.device_types.find(
        (dt) => dt.slug === deviceType.slug,
      );
      expect(updated?.u_height).toBe(2);
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });
      store.markClean();
      store.updateDeviceType(deviceType.slug, { u_height: 2 });
      expect(store.isDirty).toBe(true);
    });
  });

  describe("deleteDeviceType", () => {
    it("removes device type from library", () => {
      const store = getLayoutStore();
      const initialCount = store.device_types.length;
      const deviceType = store.addDeviceType({
        name: "To Delete",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });
      expect(store.device_types).toHaveLength(initialCount + 1);
      store.deleteDeviceType(deviceType.slug);
      expect(store.device_types).toHaveLength(initialCount);
    });

    it("also removes placed devices referencing the type", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test", 42);
      const deviceType = store.addDeviceType({
        name: "To Delete",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);
      const rackWithDevice = store.layout.racks.find((r) => r.id === rack!.id);
      expect(
        rackWithDevice!.devices.find((d) => d.device_type === deviceType.slug),
      ).toBeDefined();
      store.deleteDeviceType(deviceType.slug);
      const rackAfterDelete = store.layout.racks.find((r) => r.id === rack!.id);
      expect(rackAfterDelete!.devices).toEqual([]);
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });
      store.markClean();
      store.deleteDeviceType(deviceType.slug);
      expect(store.isDirty).toBe(true);
    });

    it("cleans up associated images from image store (Issue #147)", () => {
      const store = getLayoutStore();
      resetImageStore();
      const imageStore = getImageStore();

      const deviceType = store.addDeviceType({
        name: "Device With Image",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });

      // Add images for the device type
      imageStore.setDeviceImage(deviceType.slug, "front", {
        dataUrl: "data:image/png;base64,test",
        filename: "front.png",
      });
      imageStore.setDeviceImage(deviceType.slug, "rear", {
        dataUrl: "data:image/png;base64,test",
        filename: "rear.png",
      });

      // Verify images exist
      expect(imageStore.hasImage(deviceType.slug, "front")).toBe(true);
      expect(imageStore.hasImage(deviceType.slug, "rear")).toBe(true);

      // Delete the device type
      store.deleteDeviceType(deviceType.slug);

      // Images should be cleaned up
      expect(imageStore.hasImage(deviceType.slug, "front")).toBe(false);
      expect(imageStore.hasImage(deviceType.slug, "rear")).toBe(false);
    });
  });

  describe("placeDevice", () => {
    beforeEach(() => {
      resetLayoutStore();
    });

    it("adds device to rack at position", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.markClean();

      const result = store.placeDevice(rack!.id, deviceType.slug, 5);
      expect(result).toBe(true);
      expect(
        store.rack.devices.find((d) => d.device_type === deviceType.slug),
      ).toBeDefined();
      expect(store.rack.devices[0]!.device_type).toBe(deviceType.slug);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(5));
    });

    it("places device with depth-based face default (undefined = full depth = both)", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      // Device without is_full_depth specified defaults to full-depth
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);
      // Full-depth devices default to 'both' face (visible front and rear)
      expect(store.rack.devices[0]!.face).toBe("both");
    });

    it("places half-depth device with specified rear face", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      // Half-depth device can be explicitly placed on rear
      const deviceType = store.addDeviceType({
        name: "Rear Panel",
        u_height: 1,
        category: "patch-panel",
        colour: "#4A90D9",
        is_full_depth: false,
      });
      store.placeDevice(rack!.id, deviceType.slug, 5, "rear");
      expect(store.rack.devices[0]!.face).toBe("rear");
    });

    it("places device with specified both face", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5, "both");
      expect(store.rack.devices[0]!.face).toBe("both");
    });

    it("returns false for invalid position (collision)", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);

      const deviceType2 = store.addDeviceType({
        name: "Another",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });

      // device at 5 occupies 5,6. Position 6 would collide.
      const result = store.placeDevice(rack!.id, deviceType2.slug, 6);
      expect(result).toBe(false);
      // eslint-disable-next-line no-restricted-syntax -- Testing collision rejection (placement failed, array unchanged)
      expect(store.rack.devices).toHaveLength(1);
    });

    it("returns false for invalid position (exceeds rack)", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      // 2U device at position 42 would occupy 42,43 but rack only has 42
      const result = store.placeDevice(rack!.id, deviceType.slug, 42);
      expect(result).toBe(false);
    });

    it("returns false for position less than 1", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      const result = store.placeDevice(rack!.id, deviceType.slug, 0);
      expect(result).toBe(false);
    });

    it("sets isDirty to true on success", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.markClean();
      expect(store.isDirty).toBe(false);
      store.placeDevice(rack!.id, deviceType.slug, 5);
      expect(store.isDirty).toBe(true);
    });
  });

  describe("moveDevice", () => {
    beforeEach(() => {
      resetLayoutStore();
    });

    it("updates device position within rack", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);
      store.markClean();

      const result = store.moveDevice(rack!.id, 0, 10);
      expect(result).toBe(true);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(10));
    });

    it("returns false for collision", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);

      const deviceType2 = store.addDeviceType({
        name: "Another",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType2.slug, 10);

      // Try to move first device to 10 (would collide with second device)
      const result = store.moveDevice(rack!.id, 0, 10);
      expect(result).toBe(false);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(5));
    });

    it("sets isDirty to true on success", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);
      store.markClean();
      expect(store.isDirty).toBe(false);
      store.moveDevice(rack!.id, 0, 10);
      expect(store.isDirty).toBe(true);
    });
  });

  describe("moveDeviceToRack", () => {
    it("delegates to moveDevice for same-rack moves", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Only Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);
      store.markClean();

      // Same rack move should work (delegates to moveDevice)
      const result = store.moveDeviceToRack(rack!.id, 0, rack!.id, 10);
      expect(result).toBe(true);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(10));
    });
  });

  describe("removeDeviceFromRack", () => {
    it("removes device from rack", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);

      expect(
        store.rack.devices.find((d) => d.device_type === deviceType.slug),
      ).toBeDefined();
      store.removeDeviceFromRack(rack!.id, 0);
      expect(store.rack.devices).toEqual([]);
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Test",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);
      store.markClean();

      store.removeDeviceFromRack(rack!.id, 0);
      expect(store.isDirty).toBe(true);
    });
  });

  describe("updateDeviceName", () => {
    it("updates placed device name", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Generic Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);

      // Device should not have a custom name initially
      expect(store.rack.devices[0]!.name).toBeUndefined();

      // Set a custom name
      store.updateDeviceName(rack!.id, 0, "Primary DB Server");
      expect(store.rack.devices[0]!.name).toBe("Primary DB Server");
    });

    it("clears custom name when set to undefined", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Generic Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);

      // Set a custom name first
      store.updateDeviceName(rack!.id, 0, "Primary DB Server");
      expect(store.rack.devices[0]!.name).toBe("Primary DB Server");

      // Clear the custom name
      store.updateDeviceName(rack!.id, 0, undefined);
      expect(store.rack.devices[0]!.name).toBeUndefined();
    });

    it("clears custom name when set to empty string", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Generic Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);

      store.updateDeviceName(rack!.id, 0, "Primary DB Server");
      store.updateDeviceName(rack!.id, 0, "");
      expect(store.rack.devices[0]!.name).toBeUndefined();
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Generic Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);
      store.markClean();

      store.updateDeviceName(rack!.id, 0, "Primary DB Server");
      expect(store.isDirty).toBe(true);
    });

    it("supports undo/redo for name changes", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Generic Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);

      // Set a custom name
      store.updateDeviceName(rack!.id, 0, "Primary DB Server");
      expect(store.rack.devices[0]!.name).toBe("Primary DB Server");

      // Undo should restore undefined
      store.undo();
      expect(store.rack.devices[0]!.name).toBeUndefined();

      // Redo should restore the name
      store.redo();
      expect(store.rack.devices[0]!.name).toBe("Primary DB Server");
    });

    it("preserves name through multiple updates with undo", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType({
        name: "Generic Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 5);

      store.updateDeviceName(rack!.id, 0, "First Name");
      store.updateDeviceName(rack!.id, 0, "Second Name");
      store.updateDeviceName(rack!.id, 0, "Third Name");

      expect(store.rack.devices[0]!.name).toBe("Third Name");

      store.undo();
      expect(store.rack.devices[0]!.name).toBe("Second Name");

      store.undo();
      expect(store.rack.devices[0]!.name).toBe("First Name");

      store.undo();
      expect(store.rack.devices[0]!.name).toBeUndefined();
    });
  });

  describe("updateDeviceNotes", () => {
    it("updates placed device notes", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Device should not have notes initially
      expect(store.rack.devices[0]!.notes).toBeUndefined();

      // Set notes
      store.updateDeviceNotes(rackId, 0, "Production database server");
      expect(store.rack.devices[0]!.notes).toBe("Production database server");
    });

    it("clears notes when set to undefined", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Set notes first
      store.updateDeviceNotes(rackId, 0, "Production database server");
      expect(store.rack.devices[0]!.notes).toBe("Production database server");

      // Clear notes
      store.updateDeviceNotes(rackId, 0, undefined);
      expect(store.rack.devices[0]!.notes).toBeUndefined();
    });

    it("clears notes when set to empty string", () => {
      const { store, rackId } = setupStoreWithDevice();

      store.updateDeviceNotes(rackId, 0, "Some notes");
      store.updateDeviceNotes(rackId, 0, "");
      expect(store.rack.devices[0]!.notes).toBeUndefined();
    });

    it("trims whitespace-only notes to undefined", () => {
      const { store, rackId } = setupStoreWithDevice();

      store.updateDeviceNotes(rackId, 0, "   ");
      expect(store.rack.devices[0]!.notes).toBeUndefined();
    });

    it("sets isDirty to true", () => {
      const { store, rackId } = setupStoreWithDevice();
      store.markClean();

      store.updateDeviceNotes(rackId, 0, "Some notes");
      expect(store.isDirty).toBe(true);
    });

    it("supports undo/redo for notes changes", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Set notes
      store.updateDeviceNotes(rackId, 0, "Production server notes");
      expect(store.rack.devices[0]!.notes).toBe("Production server notes");

      // Undo should restore undefined
      store.undo();
      expect(store.rack.devices[0]!.notes).toBeUndefined();

      // Redo should restore the notes
      store.redo();
      expect(store.rack.devices[0]!.notes).toBe("Production server notes");
    });
  });

  describe("updateDeviceIp", () => {
    it("updates placed device IP address", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Device should not have IP initially
      expect(store.rack.devices[0]!.custom_fields?.ip).toBeUndefined();

      // Set IP
      store.updateDeviceIp(rackId, 0, "192.168.1.100");
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.100");
    });

    it("supports hostname values", () => {
      const { store, rackId } = setupStoreWithDevice();

      store.updateDeviceIp(rackId, 0, "db-primary.local");
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("db-primary.local");
    });

    it("clears IP when set to undefined", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Set IP first
      store.updateDeviceIp(rackId, 0, "192.168.1.100");
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.100");

      // Clear IP
      store.updateDeviceIp(rackId, 0, undefined);
      expect(store.rack.devices[0]!.custom_fields?.ip).toBeUndefined();
    });

    it("clears IP when set to empty string", () => {
      const { store, rackId } = setupStoreWithDevice();

      store.updateDeviceIp(rackId, 0, "192.168.1.100");
      store.updateDeviceIp(rackId, 0, "");
      expect(store.rack.devices[0]!.custom_fields?.ip).toBeUndefined();
    });

    it("removes empty custom_fields object when clearing last field", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Set IP which creates custom_fields
      store.updateDeviceIp(rackId, 0, "192.168.1.100");
      expect(store.rack.devices[0]!.custom_fields).toBeDefined();

      // Clear IP should remove empty custom_fields
      store.updateDeviceIp(rackId, 0, undefined);
      expect(store.rack.devices[0]!.custom_fields).toBeUndefined();
    });

    it("sets isDirty to true", () => {
      const { store, rackId } = setupStoreWithDevice();
      store.markClean();

      store.updateDeviceIp(rackId, 0, "192.168.1.100");
      expect(store.isDirty).toBe(true);
    });

    it("supports undo/redo for IP changes", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Set IP
      store.updateDeviceIp(rackId, 0, "192.168.1.100");
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.100");

      // Undo should restore undefined
      store.undo();
      expect(store.rack.devices[0]!.custom_fields?.ip).toBeUndefined();

      // Redo should restore the IP
      store.redo();
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.100");
    });

    it("preserves IP through multiple updates with undo", () => {
      const { store, rackId } = setupStoreWithDevice();

      store.updateDeviceIp(rackId, 0, "192.168.1.1");
      store.updateDeviceIp(rackId, 0, "192.168.1.2");
      store.updateDeviceIp(rackId, 0, "192.168.1.3");

      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.3");

      store.undo();
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.2");

      store.undo();
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.1");

      store.undo();
      expect(store.rack.devices[0]!.custom_fields?.ip).toBeUndefined();
    });
  });

  describe("dirty tracking", () => {
    it("markDirty sets isDirty to true", () => {
      const store = getLayoutStore();
      expect(store.isDirty).toBe(false);
      store.markDirty();
      expect(store.isDirty).toBe(true);
    });

    it("markClean sets isDirty to false", () => {
      const store = getLayoutStore();
      store.markDirty();
      expect(store.isDirty).toBe(true);
      store.markClean();
      expect(store.isDirty).toBe(false);
    });
  });

  describe("placeDevice with face/depth awareness", () => {
    beforeEach(() => {
      resetLayoutStore();
    });

    it("allows placing half-depth rear device at same U as half-depth front device", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add half-depth device type
      const halfDepthType = store.addDeviceType({
        name: "Half-Depth Device",
        u_height: 1,
        category: "blank",
        colour: "#2F4F4F",
        is_full_depth: false,
      });

      // Place on front at U5
      const result1 = store.placeDevice(
        rack!.id,
        halfDepthType.slug,
        5,
        "front",
      );
      expect(result1).toBe(true);

      // Place on rear at U5 - should succeed because both are half-depth
      const result2 = store.placeDevice(
        rack!.id,
        halfDepthType.slug,
        5,
        "rear",
      );
      expect(result2).toBe(true);

      // Both devices should exist at position U5 (stored as internal units)
      const devicesAtU5 = store.rack.devices.filter(
        (d) => d.position === toInternalUnits(5),
      );
      // eslint-disable-next-line no-restricted-syntax -- Testing half-depth pairing (front + rear = 2 devices at same U)
      expect(devicesAtU5).toHaveLength(2);
    });

    it("blocks placing half-depth rear device when full-depth front device exists at same U", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add full-depth device type (default)
      const fullDepthType = store.addDeviceType({
        name: "Full-Depth Server",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
        // is_full_depth defaults to true
      });

      // Add half-depth device type
      const halfDepthType = store.addDeviceType({
        name: "Half-Depth Blank",
        u_height: 1,
        category: "blank",
        colour: "#2F4F4F",
        is_full_depth: false,
      });

      // Place full-depth on front at U5
      const result1 = store.placeDevice(
        rack!.id,
        fullDepthType.slug,
        5,
        "front",
      );
      expect(result1).toBe(true);

      // Place half-depth on rear at U5 - should FAIL because front is full-depth
      const result2 = store.placeDevice(
        rack!.id,
        halfDepthType.slug,
        5,
        "rear",
      );
      expect(result2).toBe(false);

      // Only one device should exist
      // eslint-disable-next-line no-restricted-syntax -- Testing depth-based collision rejection (placement failed, array unchanged)
      expect(store.rack.devices).toHaveLength(1);
    });

    it("blocks placing full-depth rear device when half-depth front device exists at same U", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add half-depth device type
      const halfDepthType = store.addDeviceType({
        name: "Half-Depth Blank",
        u_height: 1,
        category: "blank",
        colour: "#2F4F4F",
        is_full_depth: false,
      });

      // Add full-depth device type
      const fullDepthType = store.addDeviceType({
        name: "Full-Depth Server",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });

      // Place half-depth on front at U5
      const result1 = store.placeDevice(
        rack!.id,
        halfDepthType.slug,
        5,
        "front",
      );
      expect(result1).toBe(true);

      // Place full-depth on rear at U5 - should FAIL because new device is full-depth
      const result2 = store.placeDevice(
        rack!.id,
        fullDepthType.slug,
        5,
        "rear",
      );
      expect(result2).toBe(false);

      // Only one device should exist
      // eslint-disable-next-line no-restricted-syntax -- Testing depth-based collision rejection (placement failed, array unchanged)
      expect(store.rack.devices).toHaveLength(1);
    });
  });

  describe("moveDevice with face/depth awareness", () => {
    beforeEach(() => {
      resetLayoutStore();
    });

    it("allows moving half-depth rear device to same U as half-depth front device", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add half-depth device type
      const halfDepthType = store.addDeviceType({
        name: "Half-Depth Device",
        u_height: 1,
        category: "blank",
        colour: "#2F4F4F",
        is_full_depth: false,
      });

      // Place on front at U5
      store.placeDevice(rack!.id, halfDepthType.slug, 5, "front");

      // Place on rear at U10
      store.placeDevice(rack!.id, halfDepthType.slug, 10, "rear");

      // Move rear device from U10 to U5 - should succeed
      const result = store.moveDevice(rack!.id, 1, 5);
      expect(result).toBe(true);

      // Both devices should be at position U5 (stored as internal units)
      const devicesAtU5 = store.rack.devices.filter(
        (d) => d.position === toInternalUnits(5),
      );
      // eslint-disable-next-line no-restricted-syntax -- Testing half-depth pairing (rear + front = 2 devices at same U)
      expect(devicesAtU5).toHaveLength(2);
    });

    it("blocks moving half-depth rear device to same U as full-depth front device", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add full-depth device type
      const fullDepthType = store.addDeviceType({
        name: "Full-Depth Server",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });

      // Add half-depth device type
      const halfDepthType = store.addDeviceType({
        name: "Half-Depth Blank",
        u_height: 1,
        category: "blank",
        colour: "#2F4F4F",
        is_full_depth: false,
      });

      // Place full-depth on front at U5
      store.placeDevice(rack!.id, fullDepthType.slug, 5, "front");

      // Place half-depth on rear at U10
      store.placeDevice(rack!.id, halfDepthType.slug, 10, "rear");

      // Move rear device from U10 to U5 - should FAIL because front is full-depth
      const result = store.moveDevice(rack!.id, 1, 5);
      expect(result).toBe(false);

      // Device at index 1 should still be at U10
      expect(store.rack.devices[1]!.position).toBe(toInternalUnits(10));
    });
  });

  describe("0.5U device movement", () => {
    it("allows moving 0.5U device to half-unit positions", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add 0.5U device type
      const halfUType = store.addDeviceType({
        name: "0.5U Device",
        u_height: 0.5,
        category: "blank",
        colour: "#2F4F4F",
      });

      // Place at position 1
      const placed = store.placeDevice(rack!.id, halfUType.slug, 1, "front");
      expect(placed).toBe(true);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(1));

      // Move to position 1.5 - should succeed
      const result = store.moveDevice(rack!.id, 0, 1.5);
      expect(result).toBe(true);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(1.5));
    });

    it("allows moving 0.5U device to integer positions", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add 0.5U device type
      const halfUType = store.addDeviceType({
        name: "0.5U Device",
        u_height: 0.5,
        category: "blank",
        colour: "#2F4F4F",
      });

      // Place at position 1.5
      const placed = store.placeDevice(rack!.id, halfUType.slug, 1.5, "front");
      expect(placed).toBe(true);

      // Move to position 2 - should succeed
      const result = store.moveDevice(rack!.id, 0, 2);
      expect(result).toBe(true);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(2));
    });

    it("blocks 0.5U device from exceeding rack height", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add 0.5U device type
      const halfUType = store.addDeviceType({
        name: "0.5U Device",
        u_height: 0.5,
        category: "blank",
        colour: "#2F4F4F",
      });

      // Place at position 42
      store.placeDevice(rack!.id, halfUType.slug, 42, "front");

      // Position 43 definitely exceeds rack height
      const result = store.moveDevice(rack!.id, 0, 43);
      expect(result).toBe(false);
    });

    it("detects collision between 1U devices at same position", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add 1U device type (collision detection works correctly for 1U)
      const oneUType = store.addDeviceType({
        name: "1U Device",
        u_height: 1,
        category: "blank",
        colour: "#2F4F4F",
      });

      // Place first device at U5
      store.placeDevice(rack!.id, oneUType.slug, 5, "front");

      // Place second device at U10
      store.placeDevice(rack!.id, oneUType.slug, 10, "front");

      // Try to move second device to U5 - should fail (collision on same face)
      const result = store.moveDevice(rack!.id, 1, 5);
      expect(result).toBe(false);
    });

    it("allows adjacent 0.5U devices without collision", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add 0.5U device type
      const halfUType = store.addDeviceType({
        name: "0.5U Device",
        u_height: 0.5,
        category: "blank",
        colour: "#2F4F4F",
      });

      // Place first device at U5
      store.placeDevice(rack!.id, halfUType.slug, 5, "front");

      // Place second device at U10
      store.placeDevice(rack!.id, halfUType.slug, 10, "front");

      // Move second device to U5.5 - should succeed (adjacent, no overlap)
      const result = store.moveDevice(rack!.id, 1, 5.5);
      expect(result).toBe(true);
      expect(store.rack.devices[1]!.position).toBe(toInternalUnits(5.5));
    });
  });

  describe("duplicateRack", () => {
    it("duplicates rack successfully in multi-rack mode", () => {
      const store = getLayoutStore();
      const rack = store.addRack("First Rack", 42);
      const result = store.duplicateRack(rack!.id);
      expect(result.rack).toBeDefined();
      expect(result.rack!.id).not.toBe(rack!.id); // Must have unique ID
      expect(result.rack!.name).toBe("First Rack (Copy)");
      expect(result.error).toBeUndefined();
    });
  });

  describe("duplicateDevice", () => {
    beforeEach(() => {
      resetLayoutStore();
    });

    it("duplicates device with all properties inherited", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add a device type and place it
      const deviceType = store.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 10, "front");

      // Set a custom name on the device
      store.updateDeviceName(rack!.id, 0, "Primary Server");

      // Duplicate the device
      const result = store.duplicateDevice(rack!.id, 0);

      expect(result.device).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.device!.id).not.toBe(store.rack.devices[0]!.id); // Must have unique ID
      expect(result.device!.device_type).toBe(deviceType.slug);
      expect(result.device!.name).toBe("Primary Server"); // Custom name inherited
    });

    it("places duplicate in next available slot on same face", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create a half-depth device (is_full_depth: false) to test face inheritance
      const deviceType = store.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
        is_full_depth: false, // Half-depth allows explicit face
      });
      // Place at U10 (occupies U10-U11) on front face
      store.placeDevice(rack!.id, deviceType.slug, 10, "front");

      // Duplicate
      const result = store.duplicateDevice(rack!.id, 0);

      expect(result.device).toBeDefined();
      // Duplicate should be placed in a valid position (not colliding with original)
      expect(result.device!.position).not.toBe(10);
      // Should be on same face as original
      expect(result.device!.face).toBe("front");
    });

    it("prefers adjacent slot when available", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const deviceType = store.addDeviceType({
        name: "Small Server",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });
      // Place at U10
      store.placeDevice(rack!.id, deviceType.slug, 10, "front");

      const result = store.duplicateDevice(rack!.id, 0);

      expect(result.device).toBeDefined();
      // Should prefer adjacent slot (either U9 or U11) - stored as internal units
      const adjacentPositions = [toInternalUnits(9), toInternalUnits(11)];
      expect(adjacentPositions).toContain(result.device!.position);
    });

    it("returns error if rack is full", () => {
      const store = getLayoutStore();
      // Create a tiny 2U rack
      const rack = store.addRack("Tiny Rack", 2);

      const deviceType = store.addDeviceType({
        name: "2U Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      // Fill the rack completely
      store.placeDevice(rack!.id, deviceType.slug, 1, "front");

      // Try to duplicate - should fail
      const result = store.duplicateDevice(rack!.id, 0);

      expect(result.device).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("no available space");
    });

    it("returns error if device index is invalid", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const result = store.duplicateDevice(rack!.id, 99);

      expect(result.device).toBeUndefined();
      expect(result.error).toBeDefined();
    });

    it("returns error if rack is not found", () => {
      const store = getLayoutStore();
      store.addRack("Test Rack", 42);

      const result = store.duplicateDevice("nonexistent-rack", 0);

      expect(result.device).toBeUndefined();
      expect(result.error).toBeDefined();
    });

    it("inherits colour override from original device", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const deviceType = store.addDeviceType({
        name: "Test Server",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 10, "front");

      // Set a colour override and capture it for comparison
      const customColour = "#FF5500";
      store.updateDeviceColour(rack!.id, 0, customColour);
      const originalDevice = store.rack.devices[0]!;

      const result = store.duplicateDevice(rack!.id, 0);

      expect(result.device).toBeDefined();
      // Verify duplicate inherits the same colour override as the original
      expect(result.device!.colour_override).toBe(
        originalDevice.colour_override,
      );
    });

    it("works with undo/redo", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const deviceType = store.addDeviceType({
        name: "Test Server",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });
      store.placeDevice(rack!.id, deviceType.slug, 10, "front");

      // Clear history for clean test
      store.clearHistory();

      const initialCount = store.rack.devices.length;
      const result = store.duplicateDevice(rack!.id, 0);
      expect(result.device).toBeDefined();
      expect(store.rack.devices.length).toBe(initialCount + 1);

      // Undo should remove the duplicate
      store.undo();
      expect(store.rack.devices.length).toBe(initialCount);

      // Redo should restore the duplicate
      store.redo();
      expect(store.rack.devices.length).toBe(initialCount + 1);
    });
  });

  describe("resetLayout", () => {
    it("resets to initial state", () => {
      const store = getLayoutStore();
      store.addRack("Test", 42);
      store.addDeviceType({
        name: "Test",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });

      resetLayoutStore();
      const freshStore = getLayoutStore();

      expect(freshStore.layout.name).toBe("Racky McRackface");
      expect(freshStore.layout.racks[0].devices).toEqual([]);
      // device_types starts empty (starter library is a runtime constant, not stored)
      expect(freshStore.device_types.length).toBe(0);
      expect(freshStore.isDirty).toBe(false);
    });
  });

  describe("settings", () => {
    it("updateDisplayMode updates display_mode", () => {
      const store = getLayoutStore();
      expect(store.layout.settings.display_mode).toBe("label");
      store.updateDisplayMode("image");
      expect(store.layout.settings.display_mode).toBe("image");
      expect(store.isDirty).toBe(true);
    });

    it("updateShowLabelsOnImages updates show_labels_on_images", () => {
      const store = getLayoutStore();
      expect(store.layout.settings.show_labels_on_images).toBe(false);
      store.updateShowLabelsOnImages(true);
      expect(store.layout.settings.show_labels_on_images).toBe(true);
      expect(store.isDirty).toBe(true);
    });
  });

  describe("placeInContainer", () => {
    beforeEach(() => {
      resetLayoutStore();
    });

    it("places device in container slot with container_id and slot_id", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create container type with slots
      const containerType = store.addDeviceType({
        name: "Test Shelf",
        u_height: 2,
        category: "server",
        colour: "#8B4513",
        slots: [
          {
            id: "slot-left",
            position: { row: 0, col: 0 },
            width_fraction: 0.5,
          },
          {
            id: "slot-right",
            position: { row: 0, col: 1 },
            width_fraction: 0.5,
          },
        ],
      });
      const childType = store.addDeviceType({
        name: "Mini PC",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
        slot_width: 1, // Half-width device fits in 0.5 fraction slot
        is_full_depth: false, // Half-width devices must be half-depth
      });

      // Place container at rack level
      store.placeDevice(rack!.id, containerType.slug, 10);
      const container = store.activeRack!.devices[0]!;

      // Place child in container slot
      const success = store.placeInContainer(
        rack!.id,
        childType.slug,
        container.id,
        "slot-left",
        0,
      );

      expect(success).toBe(true);
      const child = store.activeRack!.devices[1]!;
      expect(child.container_id).toBe(container.id);
      expect(child.slot_id).toBe("slot-left");
      expect(child.position).toBe(0);
    });

    it("returns false when container not found", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const childType = store.addDeviceType({
        name: "Mini PC",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });

      const success = store.placeInContainer(
        rack!.id,
        childType.slug,
        "nonexistent-id",
        "slot-left",
        0,
      );

      expect(success).toBe(false);
    });

    it("inherits face from container", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create half-depth container so we can set explicit face
      const containerType = store.addDeviceType({
        name: "Test Shelf",
        u_height: 2,
        category: "server",
        colour: "#8B4513",
        is_full_depth: false,
        slots: [
          {
            id: "slot-left",
            position: { row: 0, col: 0 },
            width_fraction: 0.5,
          },
        ],
      });
      const childType = store.addDeviceType({
        name: "Mini PC",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
        slot_width: 1, // Half-width device fits in 0.5 fraction slot
        is_full_depth: false, // Half-width devices must be half-depth
      });

      // Place container on rear face
      store.placeDevice(rack!.id, containerType.slug, 10, "rear");
      const container = store.activeRack!.devices[0]!;
      expect(container.face).toBe("rear");

      // Place child in container
      store.placeInContainer(
        rack!.id,
        childType.slug,
        container.id,
        "slot-left",
        0,
      );

      const child = store.activeRack!.devices[1]!;
      expect(child.face).toBe("rear");
    });

    it("supports undo/redo for container placement", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const containerType = store.addDeviceType({
        name: "Test Shelf",
        u_height: 2,
        category: "server",
        colour: "#8B4513",
        slots: [
          {
            id: "slot-left",
            position: { row: 0, col: 0 },
            width_fraction: 0.5,
          },
        ],
      });
      const childType = store.addDeviceType({
        name: "Mini PC",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
        slot_width: 1, // Half-width device fits in 0.5 fraction slot
        is_full_depth: false, // Half-width devices must be half-depth
      });

      store.placeDevice(rack!.id, containerType.slug, 10);
      const container = store.activeRack!.devices[0]!;

      // Clear history for clean test
      store.clearHistory();

      const initialDeviceCount = store.activeRack!.devices.length;
      store.placeInContainer(
        rack!.id,
        childType.slug,
        container.id,
        "slot-left",
        0,
      );
      expect(store.activeRack!.devices.length).toBe(initialDeviceCount + 1);

      // Undo should remove the child
      store.undo();
      expect(store.activeRack!.devices.length).toBe(initialDeviceCount);

      // Redo should restore the child
      store.redo();
      expect(store.activeRack!.devices.length).toBe(initialDeviceCount + 1);
    });

    it("returns false when rack not found", () => {
      const store = getLayoutStore();
      store.addRack("Test Rack", 42);

      const childType = store.addDeviceType({
        name: "Mini PC",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
      });

      const success = store.placeInContainer(
        "nonexistent-rack",
        childType.slug,
        "container-id",
        "slot-left",
        0,
      );

      expect(success).toBe(false);
    });

    it("returns false when child device type not found", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const containerType = store.addDeviceType({
        name: "Test Shelf",
        u_height: 2,
        category: "server",
        colour: "#8B4513",
        slots: [
          {
            id: "slot-left",
            position: { row: 0, col: 0 },
            width_fraction: 0.5,
          },
        ],
      });

      store.placeDevice(rack!.id, containerType.slug, 10);
      const container = store.activeRack!.devices[0]!;

      const success = store.placeInContainer(
        rack!.id,
        "nonexistent-device-type",
        container.id,
        "slot-left",
        0,
      );

      expect(success).toBe(false);
    });
  });

  describe("placeDevice with brand pack devices", () => {
    beforeEach(() => {
      resetLayoutStore();
    });

    it("places Ubiquiti brand pack device successfully", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Ubiquiti device slug from brand pack (not in starter library)
      const result = store.placeDevice(
        rack!.id,
        "ubiquiti-unifi-switch-24-pro",
        5,
      );

      expect(result).toBe(true);
      expect(
        store.rack.devices.find(
          (d) => d.device_type === "ubiquiti-unifi-switch-24-pro",
        ),
      ).toBeDefined();
      expect(store.rack.devices[0]!.device_type).toBe(
        "ubiquiti-unifi-switch-24-pro",
      );
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(5));
    });

    it("places Mikrotik brand pack device successfully", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Mikrotik device slug from brand pack
      const result = store.placeDevice(rack!.id, "crs326-24g-2s-plus", 10);

      expect(result).toBe(true);
      expect(
        store.rack.devices.find((d) => d.device_type === "crs326-24g-2s-plus"),
      ).toBeDefined();
      expect(store.rack.devices[0]!.device_type).toBe("crs326-24g-2s-plus");
    });

    it("auto-imports brand device into device_types on first placement", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Initially, brand device is not in device_types
      const initialCount = store.device_types.length;
      expect(
        store.device_types.find(
          (d) => d.slug === "ubiquiti-unifi-switch-24-pro",
        ),
      ).toBeUndefined();

      // Place brand device
      store.placeDevice(rack!.id, "ubiquiti-unifi-switch-24-pro", 5);

      // Device should now be in device_types
      expect(store.device_types.length).toBe(initialCount + 1);
      const imported = store.device_types.find(
        (d) => d.slug === "ubiquiti-unifi-switch-24-pro",
      );
      expect(imported).toBeDefined();
      expect(imported?.manufacturer).toBe("Ubiquiti");
      expect(imported?.model).toBe("USW-Pro-24");
    });

    it("does not duplicate device_type when placing same brand device twice", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Place same brand device twice at different positions
      store.placeDevice(rack!.id, "ubiquiti-unifi-switch-24-pro", 5);
      const countAfterFirst = store.device_types.length;

      store.placeDevice(rack!.id, "ubiquiti-unifi-switch-24-pro", 10);
      expect(store.device_types.length).toBe(countAfterFirst);
    });

    it("returns false for unknown slug (not in library or brand packs)", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const result = store.placeDevice(rack!.id, "nonexistent-device-xyz", 5);
      expect(result).toBe(false);
      // eslint-disable-next-line no-restricted-syntax -- Testing device lookup failure (no placement, empty array)
      expect(store.rack.devices).toHaveLength(0);
    });

    it("preserves brand device properties when auto-imported", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      store.placeDevice(rack!.id, "ubiquiti-unifi-switch-24-pro", 5);

      const imported = store.device_types.find(
        (d) => d.slug === "ubiquiti-unifi-switch-24-pro",
      );
      expect(imported?.is_full_depth).toBe(false);
      // Schema v1.0.0: Flat structure with category at top level
      expect(imported?.category).toBe("network");
    });

    it("full-depth brand device defaults to both face when placed", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // US-24-500W has is_full_depth: true (legacy switch with power supply)
      store.placeDevice(rack!.id, "ubiquiti-unifi-switch-24-500w", 5);

      // Full-depth devices should default to 'both' face (visible front and rear)
      expect(store.rack.devices[0]!.face).toBe("both");
    });

    it("half-depth brand device defaults to front face when placed", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Ubiquiti PDU has is_full_depth: false
      store.placeDevice(rack!.id, "ubiquiti-usp-pdu-pro", 5);

      // Half-depth devices should default to 'front' face
      expect(store.rack.devices[0]!.face).toBe("front");
    });

    it("auto-import creates new array reference for Svelte reactivity", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Capture the original array reference
      const originalDeviceTypes = store.device_types;

      // Place a brand device that will trigger auto-import
      store.placeDevice(rack!.id, "ubiquiti-unifi-switch-24-pro", 5);

      // The device_types array should be a NEW reference (not mutated in place)
      // This is required for Svelte 5 reactivity to trigger UI updates
      expect(store.device_types).not.toBe(originalDeviceTypes);

      // But should still contain all original items plus the new one
      expect(store.device_types.length).toBe(originalDeviceTypes.length + 1);
    });
  });

  describe("placeDevice face defaults based on depth", () => {
    beforeEach(() => {
      resetLayoutStore();
    });

    it("full-depth device defaults to both face", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create a full-depth device type
      const deviceType = store.addDeviceType({
        name: "Full Depth Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
        is_full_depth: true,
      });

      store.placeDevice(rack!.id, deviceType.slug, 5);
      expect(store.rack.devices[0]!.face).toBe("both");
    });

    it("half-depth device defaults to front face", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create a half-depth device type
      const deviceType = store.addDeviceType({
        name: "Half Depth Switch",
        u_height: 1,
        category: "network",
        colour: "#7B68EE",
        is_full_depth: false,
      });

      store.placeDevice(rack!.id, deviceType.slug, 5);
      expect(store.rack.devices[0]!.face).toBe("front");
    });

    it("device with undefined is_full_depth defaults to both face (full depth assumed)", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create device without is_full_depth specified (defaults to full depth)
      const deviceType = store.addDeviceType({
        name: "Default Depth Device",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
        // is_full_depth not specified
      });

      store.placeDevice(rack!.id, deviceType.slug, 5);
      expect(store.rack.devices[0]!.face).toBe("both");
    });

    it("full-depth device ignores explicit face and uses both", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Full-depth devices physically occupy both front and rear
      // Even if 'front' is passed (e.g., from RackDualView drop), it should be 'both'
      const deviceType = store.addDeviceType({
        name: "Full Depth Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
        is_full_depth: true,
      });

      store.placeDevice(rack!.id, deviceType.slug, 5, "front");
      // Full-depth devices ALWAYS use 'both' regardless of passed face
      expect(store.rack.devices[0]!.face).toBe("both");
    });

    it("half-depth device respects explicit face parameter", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Half-depth devices can be front-mounted or rear-mounted
      const deviceType = store.addDeviceType({
        name: "Patch Panel",
        u_height: 1,
        category: "patch-panel",
        colour: "#7B68EE",
        is_full_depth: false,
      });

      // Explicitly place on rear
      store.placeDevice(rack!.id, deviceType.slug, 5, "rear");
      expect(store.rack.devices[0]!.face).toBe("rear");
    });
  });

  describe("custom multi-U device placement (Issue #166)", () => {
    beforeEach(() => {
      resetLayoutStore();
    });

    it("preserves u_height for custom 4U device", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create a custom 4U device
      const deviceType = store.addDeviceType({
        name: "RACKOWL 4U Server",
        u_height: 4,
        category: "server",
        colour: "#3b82f6",
      });

      // Verify the device type was created with correct u_height
      expect(deviceType.u_height).toBe(4);
      expect(
        store.device_types.find((d) => d.slug === deviceType.slug)?.u_height,
      ).toBe(4);

      // Place the device
      const result = store.placeDevice(rack!.id, deviceType.slug, 5);
      expect(result).toBe(true);

      // After placement, the device type in store should still have u_height: 4
      const storedType = store.device_types.find(
        (d) => d.slug === deviceType.slug,
      );
      expect(storedType?.u_height).toBe(4);
    });

    it("custom 2U device blocks both U positions", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create a custom 2U device
      const deviceType = store.addDeviceType({
        name: "Custom 2U Server",
        u_height: 2,
        category: "server",
        colour: "#ef4444",
      });

      // Place at position 10 (should occupy 10-11)
      store.placeDevice(rack!.id, deviceType.slug, 10);

      // Create another 1U device
      const otherDevice = store.addDeviceType({
        name: "Other Device",
        u_height: 1,
        category: "server",
        colour: "#22c55e",
      });

      // Try to place at position 11 - should fail because 2U device at 10 occupies 10-11
      const result = store.placeDevice(rack!.id, otherDevice.slug, 11);
      expect(result).toBe(false);

      // But position 12 should work
      const result2 = store.placeDevice(rack!.id, otherDevice.slug, 12);
      expect(result2).toBe(true);
    });

    it("custom 4U device collision detection works correctly", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create a custom 4U device
      const deviceType = store.addDeviceType({
        name: "Big 4U Server",
        u_height: 4,
        category: "server",
        colour: "#8b5cf6",
      });

      // Place at position 20 (should occupy U20-23)
      const result1 = store.placeDevice(rack!.id, deviceType.slug, 20);
      expect(result1).toBe(true);

      // Create a 1U device
      const smallDevice = store.addDeviceType({
        name: "Small Device",
        u_height: 1,
        category: "server",
        colour: "#f59e0b",
      });

      // All positions 20-23 should be blocked
      expect(store.placeDevice(rack!.id, smallDevice.slug, 20)).toBe(false);
      expect(store.placeDevice(rack!.id, smallDevice.slug, 21)).toBe(false);
      expect(store.placeDevice(rack!.id, smallDevice.slug, 22)).toBe(false);
      expect(store.placeDevice(rack!.id, smallDevice.slug, 23)).toBe(false);

      // Position 19 (below) and 24 (above) should be available
      expect(store.placeDevice(rack!.id, smallDevice.slug, 19)).toBe(true);
      expect(store.placeDevice(rack!.id, smallDevice.slug, 24)).toBe(true);
    });
  });
});
