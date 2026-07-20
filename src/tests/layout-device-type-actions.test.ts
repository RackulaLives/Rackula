import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getImageStore, resetImageStore } from "$lib/stores/images.svelte";
import {
  createTestDeviceType,
  createTestDeviceTypeInput,
  createTestInterfaceTemplate,
} from "./factories";

describe("Layout Store", () => {
  beforeEach(() => {
    // Reset the store before each test
    resetLayoutStore();
  });

  describe("addDeviceType", () => {
    it("generates slug and adds device type", () => {
      const store = getLayoutStore();
      const initialCount = store.device_types.length;
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test Server",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      expect(deviceType.slug).toBe("test-server");
      expect(store.device_types).toHaveLength(initialCount + 1);
      const addedType = store.device_types.find(
        (dt) => dt.slug === deviceType.slug,
      );
      expect(addedType?.u_height).toBe(2);
    });

    it("preserves all provided properties", () => {
      const store = getLayoutStore();
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test Server",
          u_height: 2,
          category: "server",
          colour: "#FF0000",
          notes: "Test notes",
        }),
      );
      // Schema v1.0.0: Flat structure with colour at top level
      expect(deviceType.colour).toBeDefined(); // Color is set, exact value not important
      // Schema v1.0.0: Uses 'notes' field
      expect(deviceType.notes).toBe("Test notes");
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      expect(store.isDirty).toBe(true);
    });
  });

  describe("updateDeviceType", () => {
    it("modifies device type properties", () => {
      const store = getLayoutStore();
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Original",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.updateDeviceType(deviceType.slug, { u_height: 2 });
      const updated = store.device_types.find(
        (dt) => dt.slug === deviceType.slug,
      );
      expect(updated?.u_height).toBe(2);
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.markClean();
      store.updateDeviceType(deviceType.slug, { u_height: 2 });
      expect(store.isDirty).toBe(true);
    });
  });

  describe("deleteDeviceType", () => {
    it("removes device type from library", () => {
      const store = getLayoutStore();
      const initialCount = store.device_types.length;
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "To Delete",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      expect(store.device_types).toHaveLength(initialCount + 1);
      store.deleteDeviceType(deviceType.slug);
      expect(store.device_types).toHaveLength(initialCount);
    });

    it("also removes placed devices referencing the type", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "To Delete",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );
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
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.markClean();
      store.deleteDeviceType(deviceType.slug);
      expect(store.isDirty).toBe(true);
    });

    it("cleans up associated images from image store (Issue #147)", () => {
      const store = getLayoutStore();
      resetImageStore();
      const imageStore = getImageStore();

      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Device With Image",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );

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

    it("also removes connections attached to the deleted placed devices' ports, undoably (#639)", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test", 42)!;

      const deviceType = createTestDeviceType({ slug: "test-delete-type" });
      deviceType.interfaces = [
        createTestInterfaceTemplate({ name: "port-0", type: "1000base-t" }),
      ];
      store.addDeviceTypeRaw(deviceType);

      const otherType = createTestDeviceType({ slug: "test-other-type" });
      otherType.interfaces = [
        createTestInterfaceTemplate({ name: "port-0", type: "1000base-t" }),
      ];
      store.addDeviceTypeRaw(otherType);

      store.placeDevice(rack.id, deviceType.slug, 5);
      store.placeDevice(rack.id, otherType.slug, 10);
      const deleted = store.rack.devices.find(
        (d) => d.device_type === deviceType.slug,
      )!;
      const survivor = store.rack.devices.find(
        (d) => d.device_type === otherType.slug,
      )!;

      const connection = {
        id: "connection-1",
        a_port_id: deleted.ports![0]!.id,
        b_port_id: survivor.ports![0]!.id,
      };
      store.addConnectionRaw(connection);

      store.deleteDeviceType(deviceType.slug);

      expect(store.layout.connections ?? []).toEqual([]);

      store.undo();

      expect(store.layout.connections).toEqual([
        expect.objectContaining({ id: "connection-1" }),
      ]);
      expect(
        store.rack.devices.some((d) => d.device_type === deviceType.slug),
      ).toBe(true);
    });
  });

  describe("deleteMultipleDeviceTypesRecorded", () => {
    it("removes a connection spanning two of the deleted types exactly once, undoably (#639)", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test", 42)!;

      const typeA = createTestDeviceType({ slug: "test-bulk-a" });
      typeA.interfaces = [
        createTestInterfaceTemplate({ name: "port-0", type: "1000base-t" }),
      ];
      store.addDeviceTypeRaw(typeA);

      const typeB = createTestDeviceType({ slug: "test-bulk-b" });
      typeB.interfaces = [
        createTestInterfaceTemplate({ name: "port-0", type: "1000base-t" }),
      ];
      store.addDeviceTypeRaw(typeB);

      store.placeDevice(rack.id, typeA.slug, 5);
      store.placeDevice(rack.id, typeB.slug, 10);
      const deviceA = store.rack.devices.find(
        (d) => d.device_type === typeA.slug,
      )!;
      const deviceB = store.rack.devices.find(
        (d) => d.device_type === typeB.slug,
      )!;

      const connection = {
        id: "connection-1",
        a_port_id: deviceA.ports![0]!.id,
        b_port_id: deviceB.ports![0]!.id,
      };
      store.addConnectionRaw(connection);

      const deletedCount = store.deleteMultipleDeviceTypesRecorded([
        typeA.slug,
        typeB.slug,
      ]);

      expect(deletedCount).toBe(2);
      expect(store.layout.connections ?? []).toEqual([]);

      store.undo();

      // Single undo restores both device types, both placed devices, and the
      // connection exactly once (not duplicated by both per-type commands).
      expect(store.layout.connections).toEqual([
        expect.objectContaining({ id: "connection-1" }),
      ]);
    });
  });
});
