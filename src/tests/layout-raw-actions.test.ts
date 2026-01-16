import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { createTestDeviceType, createTestDevice } from "./factories";
import { toInternalUnits } from "$lib/utils/position";

describe("Layout Store - Raw Actions", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  describe("Device Type Raw Actions", () => {
    it("addDeviceTypeRaw adds a device type", () => {
      const store = getLayoutStore();
      const deviceType = createTestDeviceType({ slug: "new-device" });

      store.addDeviceTypeRaw(deviceType);

      expect(store.device_types).toContainEqual(
        expect.objectContaining({ slug: "new-device" }),
      );
    });

    it("removeDeviceTypeRaw removes a device type", () => {
      const store = getLayoutStore();
      const deviceType = createTestDeviceType({ slug: "to-remove" });

      store.addDeviceTypeRaw(deviceType);
      expect(store.device_types.some((dt) => dt.slug === "to-remove")).toBe(
        true,
      );

      store.removeDeviceTypeRaw("to-remove");
      expect(store.device_types.some((dt) => dt.slug === "to-remove")).toBe(
        false,
      );
    });

    it("removeDeviceTypeRaw also removes placed devices", () => {
      const store = getLayoutStore();
      const deviceType = createTestDeviceType({ slug: "server-1" });
      store.addDeviceTypeRaw(deviceType);
      store.placeDeviceRaw({
        device_type: "server-1",
        position: toInternalUnits(5),
        face: "front",
      });
      store.placeDeviceRaw({
        device_type: "server-1",
        position: toInternalUnits(15),
        face: "front",
      });

      expect(store.rack.devices.length).toBe(2);

      store.removeDeviceTypeRaw("server-1");

      expect(store.rack.devices.length).toBe(0);
    });

    it("updateDeviceTypeRaw updates a device type", () => {
      const store = getLayoutStore();
      const deviceType = createTestDeviceType({
        slug: "updatable",
        model: "Old Name",
      });
      store.addDeviceTypeRaw(deviceType);

      store.updateDeviceTypeRaw("updatable", { model: "New Name" });

      const updated = store.device_types.find((dt) => dt.slug === "updatable");
      expect(updated?.model).toBe("New Name");
    });

    it("getPlacedDevicesForType returns devices for a type", () => {
      const store = getLayoutStore();
      store.addDeviceTypeRaw(createTestDeviceType({ slug: "type-a" }));
      store.addDeviceTypeRaw(createTestDeviceType({ slug: "type-b" }));
      store.placeDeviceRaw({
        device_type: "type-a",
        position: toInternalUnits(5),
        face: "front",
      });
      store.placeDeviceRaw({
        device_type: "type-b",
        position: toInternalUnits(10),
        face: "front",
      });
      store.placeDeviceRaw({
        device_type: "type-a",
        position: toInternalUnits(20),
        face: "front",
      });

      const typeADevices = store.getPlacedDevicesForType("type-a");

      expect(typeADevices.length).toBe(2);
      expect(typeADevices.every((d) => d.device_type === "type-a")).toBe(true);
    });
  });

  describe("Device Raw Actions", () => {
    beforeEach(() => {
      const store = getLayoutStore();
      store.addDeviceTypeRaw(createTestDeviceType({ slug: "test-device" }));
    });

    it("placeDeviceRaw places a device and returns index", () => {
      const store = getLayoutStore();

      const index = store.placeDeviceRaw(createTestDevice({ position: 5 }));

      expect(index).toBe(0);
      expect(store.rack.devices.length).toBe(1);
      // createTestDevice converts position to internal units
      expect(store.rack.devices[0]?.position).toBe(toInternalUnits(5));
    });

    it("removeDeviceAtIndexRaw removes a device", () => {
      const store = getLayoutStore();
      store.placeDeviceRaw(createTestDevice({ position: 5 }));
      store.placeDeviceRaw(createTestDevice({ position: 10 }));

      const removed = store.removeDeviceAtIndexRaw(0);

      // createTestDevice converts position to internal units
      expect(removed?.position).toBe(toInternalUnits(5));
      expect(store.rack.devices.length).toBe(1);
      expect(store.rack.devices[0]?.position).toBe(toInternalUnits(10));
    });

    it("removeDeviceAtIndexRaw returns undefined for invalid index", () => {
      const store = getLayoutStore();

      const removed = store.removeDeviceAtIndexRaw(99);

      expect(removed).toBeUndefined();
    });

    it("moveDeviceRaw moves a device", () => {
      const store = getLayoutStore();
      store.placeDeviceRaw(createTestDevice({ position: 5 }));

      const success = store.moveDeviceRaw(0, 20);

      expect(success).toBe(true);
      expect(store.rack.devices[0]?.position).toBe(20);
    });

    it("moveDeviceRaw returns false for invalid index", () => {
      const store = getLayoutStore();

      const success = store.moveDeviceRaw(99, 20);

      expect(success).toBe(false);
    });

    it("updateDeviceFaceRaw updates device face", () => {
      const store = getLayoutStore();
      store.placeDeviceRaw(createTestDevice({ position: 5, face: "front" }));

      store.updateDeviceFaceRaw(0, "rear");

      expect(store.rack.devices[0]?.face).toBe("rear");
    });

    it("getDeviceAtIndex returns device", () => {
      const store = getLayoutStore();
      store.placeDeviceRaw(createTestDevice({ position: 15 }));

      const device = store.getDeviceAtIndex(0);

      // createTestDevice converts position to internal units
      expect(device?.position).toBe(toInternalUnits(15));
    });

    it("getDeviceAtIndex returns undefined for invalid index", () => {
      const store = getLayoutStore();

      const device = store.getDeviceAtIndex(99);

      expect(device).toBeUndefined();
    });
  });

  describe("Rack Raw Actions", () => {
    it("updateRackRaw updates rack settings", () => {
      const store = getLayoutStore();

      store.updateRackRaw({ height: 48, name: "Updated Rack" });

      expect(store.rack.height).toBe(48);
      expect(store.rack.name).toBe("Updated Rack");
    });

    it("updateRackRaw syncs layout name with rack name", () => {
      const store = getLayoutStore();

      store.updateRackRaw({ name: "New Name" });

      expect(store.layout.name).toBe("New Name");
    });

    it("replaceRackRaw replaces entire rack", () => {
      const store = getLayoutStore();
      const newRack = {
        name: "Replaced Rack",
        height: 24,
        width: 10 as const,
        desc_units: true,
        form_factor: "2-post" as const,
        starting_unit: 0,
        position: 0,
        devices: [],
      };

      store.replaceRackRaw(newRack);

      expect(store.rack.name).toBe("Replaced Rack");
      expect(store.rack.height).toBe(24);
      expect(store.rack.width).toBe(10);
      expect(store.layout.name).toBe("Replaced Rack");
    });

    it("clearRackDevicesRaw clears all devices", () => {
      const store = getLayoutStore();
      store.addDeviceTypeRaw(createTestDeviceType());
      store.placeDeviceRaw(createTestDevice({ position: 5 }));
      store.placeDeviceRaw(createTestDevice({ position: 15 }));

      const removed = store.clearRackDevicesRaw();

      expect(removed.length).toBe(2);
      expect(store.rack.devices.length).toBe(0);
    });

    it("restoreRackDevicesRaw restores devices", () => {
      const store = getLayoutStore();
      const devices = [
        createTestDevice({ position: 5 }),
        createTestDevice({ position: 15 }),
      ];

      store.restoreRackDevicesRaw(devices);

      expect(store.rack.devices.length).toBe(2);
      // createTestDevice converts position to internal units
      expect(store.rack.devices[0]?.position).toBe(toInternalUnits(5));
      expect(store.rack.devices[1]?.position).toBe(toInternalUnits(15));
    });
  });
});
