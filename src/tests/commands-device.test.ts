import { describe, it, expect, vi } from "vitest";
import {
  createPlaceDeviceCommand,
  createMoveDeviceCommand,
  createRemoveDeviceCommand,
  createUpdateDeviceFaceCommand,
  createUpdateDeviceSlotPositionCommand,
  type DeviceCommandStore,
} from "$lib/stores/commands/device";
import {
  createAddDeviceTypeCommand,
  type DeviceTypeCommandStore,
} from "$lib/stores/commands/device-type";
import { createBatchCommand } from "$lib/stores/commands/types";
import { createTestDevice, createTestDeviceType } from "./factories";
import { toInternalUnits } from "$lib/utils/position";

function createMockStore(): DeviceCommandStore & {
  placeDeviceRaw: ReturnType<typeof vi.fn>;
  removeDeviceAtIndexRaw: ReturnType<typeof vi.fn>;
  moveDeviceRaw: ReturnType<typeof vi.fn>;
  updateDeviceFaceRaw: ReturnType<typeof vi.fn>;
  updateDeviceNameRaw: ReturnType<typeof vi.fn>;
  updateDeviceSlotPositionRaw: ReturnType<typeof vi.fn>;
  getDeviceAtIndex: ReturnType<typeof vi.fn>;
} {
  return {
    placeDeviceRaw: vi.fn().mockReturnValue(0),
    removeDeviceAtIndexRaw: vi.fn(),
    moveDeviceRaw: vi.fn().mockReturnValue(true),
    updateDeviceFaceRaw: vi.fn(),
    updateDeviceNameRaw: vi.fn(),
    updateDeviceSlotPositionRaw: vi.fn(),
    getDeviceAtIndex: vi.fn(),
  };
}

describe("Device Commands", () => {
  describe("createPlaceDeviceCommand", () => {
    it("creates command with correct type and description", () => {
      const store = createMockStore();
      const device = createTestDevice();

      const command = createPlaceDeviceCommand(device, store, "PowerEdge R740");

      expect(command.type).toBe("PLACE_DEVICE");
      expect(command.description).toBe("Place PowerEdge R740");
      expect(typeof command.timestamp).toBe("number");
    });

    it("uses default device name when not provided", () => {
      const store = createMockStore();
      const device = createTestDevice();

      const command = createPlaceDeviceCommand(device, store);

      expect(command.description).toBe("Place device");
    });

    it("execute calls placeDeviceRaw", () => {
      const store = createMockStore();
      const device = createTestDevice();

      const command = createPlaceDeviceCommand(device, store);
      command.execute();

      expect(store.placeDeviceRaw).toHaveBeenCalledTimes(1);
      expect(store.placeDeviceRaw).toHaveBeenCalledWith(device);
    });

    it("undo calls removeDeviceAtIndexRaw with placed index", () => {
      const store = createMockStore();
      store.placeDeviceRaw.mockReturnValue(5);
      const device = createTestDevice();

      const command = createPlaceDeviceCommand(device, store);
      command.execute();
      command.undo();

      expect(store.removeDeviceAtIndexRaw).toHaveBeenCalledTimes(1);
      expect(store.removeDeviceAtIndexRaw).toHaveBeenCalledWith(5);
    });

    it("undo does nothing if execute was not called", () => {
      const store = createMockStore();
      const device = createTestDevice();

      const command = createPlaceDeviceCommand(device, store);
      command.undo();

      expect(store.removeDeviceAtIndexRaw).not.toHaveBeenCalled();
    });
  });

  describe("createMoveDeviceCommand", () => {
    it("creates command with correct type and description", () => {
      const store = createMockStore();

      const command = createMoveDeviceCommand(0, 10, 15, store, "Server");

      expect(command.type).toBe("MOVE_DEVICE");
      expect(command.description).toBe("Move Server");
      expect(typeof command.timestamp).toBe("number");
    });

    it("uses default device name when not provided", () => {
      const store = createMockStore();

      const command = createMoveDeviceCommand(0, 10, 15, store);

      expect(command.description).toBe("Move device");
    });

    it("execute calls moveDeviceRaw with new position", () => {
      const store = createMockStore();

      const command = createMoveDeviceCommand(2, 10, 20, store);
      command.execute();

      expect(store.moveDeviceRaw).toHaveBeenCalledTimes(1);
      expect(store.moveDeviceRaw).toHaveBeenCalledWith(2, 20);
    });

    it("undo calls moveDeviceRaw with old position", () => {
      const store = createMockStore();

      const command = createMoveDeviceCommand(2, 10, 20, store);
      command.execute();
      command.undo();

      expect(store.moveDeviceRaw).toHaveBeenCalledTimes(2);
      expect(store.moveDeviceRaw).toHaveBeenLastCalledWith(2, 10);
    });
  });

  describe("createRemoveDeviceCommand", () => {
    it("creates command with correct type and description", () => {
      const store = createMockStore();
      const device = createTestDevice();

      const command = createRemoveDeviceCommand(0, device, store, "Switch");

      expect(command.type).toBe("REMOVE_DEVICE");
      expect(command.description).toBe("Remove Switch");
      expect(typeof command.timestamp).toBe("number");
    });

    it("uses default device name when not provided", () => {
      const store = createMockStore();
      const device = createTestDevice();

      const command = createRemoveDeviceCommand(0, device, store);

      expect(command.description).toBe("Remove device");
    });

    it("execute calls removeDeviceAtIndexRaw", () => {
      const store = createMockStore();
      const device = createTestDevice();

      const command = createRemoveDeviceCommand(3, device, store);
      command.execute();

      expect(store.removeDeviceAtIndexRaw).toHaveBeenCalledTimes(1);
      expect(store.removeDeviceAtIndexRaw).toHaveBeenCalledWith(3);
    });

    it("undo calls placeDeviceRaw with device copy", () => {
      const store = createMockStore();
      const device = createTestDevice({
        position: 15,
        device_type: "my-device",
      });

      const command = createRemoveDeviceCommand(0, device, store);
      command.execute();
      command.undo();

      expect(store.placeDeviceRaw).toHaveBeenCalledTimes(1);
      // createTestDevice converts position to internal units
      expect(store.placeDeviceRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          position: toInternalUnits(15),
          device_type: "my-device",
        }),
      );
    });

    it("stores copy of device to avoid mutation issues", () => {
      const store = createMockStore();
      const device = createTestDevice({ position: 15 });

      const command = createRemoveDeviceCommand(0, device, store);

      // Mutate original
      device.position = 99;

      command.execute();
      command.undo();

      // Should restore with original position (createTestDevice converts to internal units)
      expect(store.placeDeviceRaw).toHaveBeenCalledWith(
        expect.objectContaining({ position: toInternalUnits(15) }),
      );
    });
  });

  describe("batch move + slot-position command", () => {
    it("undo reverses both position and slot_position", () => {
      const store = createMockStore();

      const moveCmd = createMoveDeviceCommand(0, 10, 20, store, "Server");
      const slotCmd = createUpdateDeviceSlotPositionCommand(
        0,
        "left",
        "right",
        store,
        "Server",
      );
      const batch = createBatchCommand("Move Server", [moveCmd, slotCmd]);

      batch.execute();

      expect(store.moveDeviceRaw).toHaveBeenCalledWith(0, 20);
      expect(store.updateDeviceSlotPositionRaw).toHaveBeenCalledWith(
        0,
        "right",
      );

      batch.undo();

      // Undo reverses in reverse order: slot first, then position
      expect(store.updateDeviceSlotPositionRaw).toHaveBeenLastCalledWith(
        0,
        "left",
      );
      expect(store.moveDeviceRaw).toHaveBeenLastCalledWith(0, 10);
    });

    it("redo restores both position and slot_position", () => {
      const store = createMockStore();

      const moveCmd = createMoveDeviceCommand(0, 10, 20, store, "Server");
      const slotCmd = createUpdateDeviceSlotPositionCommand(
        0,
        "left",
        "right",
        store,
        "Server",
      );
      const batch = createBatchCommand("Move Server", [moveCmd, slotCmd]);

      batch.execute();
      batch.undo();
      batch.execute(); // redo

      // Last calls should be the forward direction again
      expect(store.moveDeviceRaw).toHaveBeenLastCalledWith(0, 20);
      expect(store.updateDeviceSlotPositionRaw).toHaveBeenLastCalledWith(
        0,
        "right",
      );
    });

    it("move without slot change uses simple move command", () => {
      const store = createMockStore();

      const moveCmd = createMoveDeviceCommand(0, 10, 20, store, "Server");
      moveCmd.execute();

      expect(store.moveDeviceRaw).toHaveBeenCalledWith(0, 20);
      expect(store.updateDeviceSlotPositionRaw).not.toHaveBeenCalled();

      moveCmd.undo();

      expect(store.moveDeviceRaw).toHaveBeenLastCalledWith(0, 10);
      expect(store.updateDeviceSlotPositionRaw).not.toHaveBeenCalled();
    });
  });

  describe("batch auto-import + placement", () => {
    function createCombinedMockStore(): DeviceCommandStore &
      DeviceTypeCommandStore & {
        placeDeviceRaw: ReturnType<typeof vi.fn>;
        removeDeviceAtIndexRaw: ReturnType<typeof vi.fn>;
        moveDeviceRaw: ReturnType<typeof vi.fn>;
        updateDeviceFaceRaw: ReturnType<typeof vi.fn>;
        updateDeviceNameRaw: ReturnType<typeof vi.fn>;
        updateDeviceSlotPositionRaw: ReturnType<typeof vi.fn>;
        getDeviceAtIndex: ReturnType<typeof vi.fn>;
        addDeviceTypeRaw: ReturnType<typeof vi.fn>;
        removeDeviceTypeRaw: ReturnType<typeof vi.fn>;
        updateDeviceTypeRaw: ReturnType<typeof vi.fn>;
        getPlacedDevicesForType: ReturnType<typeof vi.fn>;
      } {
      return {
        placeDeviceRaw: vi.fn().mockReturnValue(0),
        removeDeviceAtIndexRaw: vi.fn(),
        moveDeviceRaw: vi.fn().mockReturnValue(true),
        updateDeviceFaceRaw: vi.fn(),
        updateDeviceNameRaw: vi.fn(),
        updateDeviceSlotPositionRaw: vi.fn(),
        getDeviceAtIndex: vi.fn(),
        addDeviceTypeRaw: vi.fn(),
        removeDeviceTypeRaw: vi.fn(),
        updateDeviceTypeRaw: vi.fn(),
        getPlacedDevicesForType: vi.fn().mockReturnValue([]),
      };
    }

    it("undo removes both device type and placed device", () => {
      const store = createCombinedMockStore();
      const device = createTestDevice();
      const deviceType = createTestDeviceType({ slug: "test-server" });

      const importCmd = createAddDeviceTypeCommand(deviceType, store);
      const placeCmd = createPlaceDeviceCommand(device, store, "Test Server");
      const batch = createBatchCommand("Place Test Server", [
        importCmd,
        placeCmd,
      ]);

      batch.execute();

      expect(store.addDeviceTypeRaw).toHaveBeenCalledWith(deviceType);
      expect(store.placeDeviceRaw).toHaveBeenCalledWith(device);

      batch.undo();

      // Undo reverses in order: placement undone first, then import undone
      expect(store.removeDeviceAtIndexRaw).toHaveBeenCalledTimes(1);
      expect(store.removeDeviceTypeRaw).toHaveBeenCalledWith("test-server");
    });

    it("redo restores both device type and placed device", () => {
      const store = createCombinedMockStore();
      const device = createTestDevice();
      const deviceType = createTestDeviceType({ slug: "test-server" });

      const importCmd = createAddDeviceTypeCommand(deviceType, store);
      const placeCmd = createPlaceDeviceCommand(device, store, "Test Server");
      const batch = createBatchCommand("Place Test Server", [
        importCmd,
        placeCmd,
      ]);

      batch.execute();
      batch.undo();
      batch.execute(); // redo

      // After redo, both should be called again
      expect(store.addDeviceTypeRaw).toHaveBeenCalledTimes(2);
      expect(store.placeDeviceRaw).toHaveBeenCalledTimes(2);
    });

    it("place without import uses simple place command (no import side effects)", () => {
      const store = createCombinedMockStore();
      const device = createTestDevice();

      const placeCmd = createPlaceDeviceCommand(device, store, "Test Server");
      placeCmd.execute();

      expect(store.placeDeviceRaw).toHaveBeenCalledWith(device);
      expect(store.addDeviceTypeRaw).not.toHaveBeenCalled();

      placeCmd.undo();

      expect(store.removeDeviceTypeRaw).not.toHaveBeenCalled();
    });
  });

  describe("createUpdateDeviceFaceCommand", () => {
    it("creates command with correct type and description", () => {
      const store = createMockStore();

      const command = createUpdateDeviceFaceCommand(
        0,
        "front",
        "rear",
        store,
        "UPS",
      );

      expect(command.type).toBe("UPDATE_DEVICE_FACE");
      expect(command.description).toBe("Flip UPS");
      expect(typeof command.timestamp).toBe("number");
    });

    it("uses default device name when not provided", () => {
      const store = createMockStore();

      const command = createUpdateDeviceFaceCommand(0, "front", "rear", store);

      expect(command.description).toBe("Flip device");
    });

    it("execute calls updateDeviceFaceRaw with new face", () => {
      const store = createMockStore();

      const command = createUpdateDeviceFaceCommand(1, "front", "rear", store);
      command.execute();

      expect(store.updateDeviceFaceRaw).toHaveBeenCalledTimes(1);
      expect(store.updateDeviceFaceRaw).toHaveBeenCalledWith(1, "rear");
    });

    it("undo calls updateDeviceFaceRaw with old face", () => {
      const store = createMockStore();

      const command = createUpdateDeviceFaceCommand(1, "front", "rear", store);
      command.execute();
      command.undo();

      expect(store.updateDeviceFaceRaw).toHaveBeenCalledTimes(2);
      expect(store.updateDeviceFaceRaw).toHaveBeenLastCalledWith(1, "front");
    });
  });
});
