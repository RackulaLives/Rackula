import { describe, it, expect, vi } from "vitest";
import {
  createAddDeviceTypeCommand,
  createUpdateDeviceTypeCommand,
  createDeleteDeviceTypeCommand,
  type DeviceTypeCommandStore,
} from "$lib/stores/commands/device-type";
import type { DeviceType } from "$lib/types";
import { createTestDeviceType, createTestDevice } from "./factories";
import { toInternalUnits } from "$lib/utils/position";

function createMockStore(): DeviceTypeCommandStore & {
  addDeviceTypeRaw: ReturnType<typeof vi.fn>;
  removeDeviceTypeRaw: ReturnType<typeof vi.fn>;
  updateDeviceTypeRaw: ReturnType<typeof vi.fn>;
  placeDeviceRaw: ReturnType<typeof vi.fn>;
  removeDeviceAtIndexRaw: ReturnType<typeof vi.fn>;
  getPlacedDevicesForType: ReturnType<typeof vi.fn>;
  getDeviceAtIndex: ReturnType<typeof vi.fn>;
  setActiveRackId: ReturnType<typeof vi.fn>;
  getActiveRackId: ReturnType<typeof vi.fn>;
  addCableRaw: ReturnType<typeof vi.fn>;
  removeCableRaw: ReturnType<typeof vi.fn>;
} {
  let activeRackId: string | null = null;
  return {
    addDeviceTypeRaw: vi.fn(),
    removeDeviceTypeRaw: vi.fn(),
    updateDeviceTypeRaw: vi.fn(),
    placeDeviceRaw: vi.fn().mockReturnValue(0),
    removeDeviceAtIndexRaw: vi.fn(),
    getPlacedDevicesForType: vi.fn().mockReturnValue([]),
    getDeviceAtIndex: vi.fn().mockReturnValue(undefined),
    setActiveRackId: vi.fn((id: string | null) => {
      activeRackId = id;
    }),
    getActiveRackId: vi.fn(() => activeRackId),
    addCableRaw: vi.fn(),
    removeCableRaw: vi.fn(),
  };
}

describe("Device Type Commands", () => {
  describe("createAddDeviceTypeCommand", () => {
    it("creates command with correct type and description", () => {
      const store = createMockStore();
      const deviceType = createTestDeviceType({ model: "PowerEdge R740" });

      const command = createAddDeviceTypeCommand(deviceType, store);

      expect(command.type).toBe("ADD_DEVICE_TYPE");
      expect(command.description).toBe("Add PowerEdge R740");
      expect(typeof command.timestamp).toBe("number");
    });

    it("uses slug when model is not provided", () => {
      const store = createMockStore();
      // Create minimal device type without model to test slug fallback
      const deviceType: DeviceType = {
        slug: "my-server",
        u_height: 1,
        category: "server",
        colour: "#336699",
      };

      const command = createAddDeviceTypeCommand(deviceType, store);

      expect(command.description).toBe("Add my-server");
    });

    it("execute calls addDeviceTypeRaw with device type", () => {
      const store = createMockStore();
      const deviceType = createTestDeviceType();

      const command = createAddDeviceTypeCommand(deviceType, store);
      command.execute();

      expect(store.addDeviceTypeRaw).toHaveBeenCalledTimes(1);
      expect(store.addDeviceTypeRaw).toHaveBeenCalledWith(deviceType);
    });

    it("undo calls removeDeviceTypeRaw with slug", () => {
      const store = createMockStore();
      const deviceType = createTestDeviceType({ slug: "server-1" });

      const command = createAddDeviceTypeCommand(deviceType, store);
      command.execute();
      command.undo();

      expect(store.removeDeviceTypeRaw).toHaveBeenCalledTimes(1);
      expect(store.removeDeviceTypeRaw).toHaveBeenCalledWith("server-1");
    });

    it("undo skips removal when another device still references the type", () => {
      const store = createMockStore();
      const deviceType = createTestDeviceType({ slug: "server-1" });
      const existingDevice = createTestDevice({ device_type: "server-1" });
      store.getPlacedDevicesForType.mockReturnValue([existingDevice]);

      const command = createAddDeviceTypeCommand(deviceType, store);
      command.execute();
      command.undo();

      expect(store.removeDeviceTypeRaw).not.toHaveBeenCalled();
    });

    it("redo does not re-add type when undo skipped removal", () => {
      const store = createMockStore();
      const deviceType = createTestDeviceType({ slug: "server-1" });
      const existingDevice = createTestDevice({ device_type: "server-1" });

      const command = createAddDeviceTypeCommand(deviceType, store);
      command.execute();
      store.addDeviceTypeRaw.mockClear();

      store.getPlacedDevicesForType.mockReturnValue([existingDevice]);
      command.undo();
      command.execute(); // redo — type was not removed, must not add duplicate

      expect(store.addDeviceTypeRaw).not.toHaveBeenCalled();
    });

    it("redo re-adds type when undo removed it", () => {
      const store = createMockStore();
      const deviceType = createTestDeviceType({ slug: "server-1" });

      const command = createAddDeviceTypeCommand(deviceType, store);
      command.execute();
      command.undo(); // no references (default mock []), type is removed
      store.addDeviceTypeRaw.mockClear();

      command.execute(); // redo — type was removed, must re-add

      expect(store.addDeviceTypeRaw).toHaveBeenCalledTimes(1);
      expect(store.addDeviceTypeRaw).toHaveBeenCalledWith(deviceType);
    });
  });

  describe("createUpdateDeviceTypeCommand", () => {
    it("creates command with correct type and description", () => {
      const store = createMockStore();
      const before = { model: "Old Model" };
      const after = { model: "New Model" };

      const command = createUpdateDeviceTypeCommand(
        "my-device",
        before,
        after,
        store,
      );

      expect(command.type).toBe("UPDATE_DEVICE_TYPE");
      expect(command.description).toBe("Update my-device");
      expect(typeof command.timestamp).toBe("number");
    });

    it("execute calls updateDeviceTypeRaw with after values", () => {
      const store = createMockStore();
      const before = { model: "Old Model" };
      const after = { model: "New Model" };

      const command = createUpdateDeviceTypeCommand(
        "my-device",
        before,
        after,
        store,
      );
      command.execute();

      expect(store.updateDeviceTypeRaw).toHaveBeenCalledTimes(1);
      expect(store.updateDeviceTypeRaw).toHaveBeenCalledWith(
        "my-device",
        after,
      );
    });

    it("undo calls updateDeviceTypeRaw with before values", () => {
      const store = createMockStore();
      const before = { model: "Old Model", height: 2 };
      const after = { model: "New Model", height: 4 };

      const command = createUpdateDeviceTypeCommand(
        "my-device",
        before,
        after,
        store,
      );
      command.execute();
      command.undo();

      expect(store.updateDeviceTypeRaw).toHaveBeenCalledTimes(2);
      expect(store.updateDeviceTypeRaw).toHaveBeenLastCalledWith(
        "my-device",
        before,
      );
    });
  });

  describe("createDeleteDeviceTypeCommand", () => {
    it("creates command with correct type and description", () => {
      const store = createMockStore();
      const deviceType = createTestDeviceType({ model: "Dell Server" });

      const command = createDeleteDeviceTypeCommand(deviceType, [], store);

      expect(command.type).toBe("DELETE_DEVICE_TYPE");
      expect(command.description).toBe("Delete Dell Server");
      expect(typeof command.timestamp).toBe("number");
    });

    it("uses slug when model is not provided", () => {
      const store = createMockStore();
      // Create minimal device type without model to test slug fallback
      const deviceType: DeviceType = {
        slug: "rack-server",
        u_height: 1,
        category: "server",
        colour: "#336699",
      };

      const command = createDeleteDeviceTypeCommand(deviceType, [], store);

      expect(command.description).toBe("Delete rack-server");
    });

    it("execute calls removeDeviceTypeRaw", () => {
      const store = createMockStore();
      const deviceType = createTestDeviceType({ slug: "test-slug" });

      const command = createDeleteDeviceTypeCommand(deviceType, [], store);
      command.execute();

      expect(store.removeDeviceTypeRaw).toHaveBeenCalledTimes(1);
      expect(store.removeDeviceTypeRaw).toHaveBeenCalledWith("test-slug");
    });

    it("undo restores device type", () => {
      const store = createMockStore();
      const deviceType = createTestDeviceType();

      const command = createDeleteDeviceTypeCommand(deviceType, [], store);
      command.execute();
      command.undo();

      expect(store.addDeviceTypeRaw).toHaveBeenCalledTimes(1);
      expect(store.addDeviceTypeRaw).toHaveBeenCalledWith(deviceType);
    });

    it("undo restores placed devices to their original racks", () => {
      const store = createMockStore();
      const deviceType = createTestDeviceType({ slug: "server-type" });
      const placedDevices = [
        {
          rackId: "rack-a",
          device: createTestDevice({ device_type: "server-type", position: 5 }),
        },
        {
          rackId: "rack-b",
          device: createTestDevice({
            device_type: "server-type",
            position: 10,
          }),
        },
      ];

      const command = createDeleteDeviceTypeCommand(
        deviceType,
        placedDevices,
        store,
      );
      command.execute();
      command.undo();

      expect(store.placeDeviceRaw).toHaveBeenCalledTimes(2);
      // Verify devices restored with correct active rack targeting
      expect(store.setActiveRackId).toHaveBeenCalledWith("rack-a");
      expect(store.setActiveRackId).toHaveBeenCalledWith("rack-b");
      // createTestDevice converts position to internal units
      expect(store.placeDeviceRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          device_type: "server-type",
          position: toInternalUnits(5),
        }),
      );
      expect(store.placeDeviceRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          device_type: "server-type",
          position: toInternalUnits(10),
        }),
      );
    });

    it("stores copies of placed devices to avoid mutation", () => {
      const store = createMockStore();
      const deviceType = createTestDeviceType();
      const placedDevices = [
        { rackId: "rack-1", device: createTestDevice({ position: 5 }) },
      ];

      const command = createDeleteDeviceTypeCommand(
        deviceType,
        placedDevices,
        store,
      );

      // Mutate original array
      placedDevices[0]!.device.position = 99;

      command.execute();
      command.undo();

      // Should restore with original position (5 in internal units), not mutated (99)
      expect(store.placeDeviceRaw).toHaveBeenCalledWith(
        expect.objectContaining({ position: toInternalUnits(5) }),
      );
    });

    it("removes connected cables on execute and restores them on undo (#1483)", () => {
      const store = createMockStore();
      const deviceType = createTestDeviceType({ slug: "switch-type" });
      const devA = createTestDevice({
        device_type: "switch-type",
        position: 1,
      });
      const devB = createTestDevice({
        device_type: "switch-type",
        position: 2,
      });
      const placedDevices = [
        { rackId: "rack-1", device: devA },
        { rackId: "rack-1", device: devB },
      ];
      const cables = [
        {
          id: "cable-1",
          a_device_id: devA.id,
          a_interface: "eth0",
          b_device_id: devB.id,
          b_interface: "eth1",
        },
      ];

      const command = createDeleteDeviceTypeCommand(
        deviceType,
        placedDevices,
        store,
        cables,
      );

      command.execute();
      expect(store.removeCableRaw).toHaveBeenCalledWith("cable-1");

      command.undo();
      expect(store.addCableRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "cable-1",
          a_device_id: devA.id,
          b_device_id: devB.id,
        }),
      );
    });
  });
});
