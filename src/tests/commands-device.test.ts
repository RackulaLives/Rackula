import { describe, it, expect, vi } from "vitest";
import {
  createPlaceDeviceCommand,
  createMoveDeviceCommand,
  createRemoveDeviceCommand,
  createUpdateDeviceFaceCommand,
  type DeviceCommandStore,
} from "$lib/stores/commands/device";
import {
  createAddDeviceTypeCommand,
  type DeviceTypeCommandStore,
} from "$lib/stores/commands/device-type";
import { createBatchCommand } from "$lib/stores/commands/types";
import { createTestDevice, createTestDeviceType } from "./factories";
import { toInternalUnits } from "$lib/utils/position";
import type { PlacedDevice, DeviceFace } from "$lib/types";

function createMockStore(): DeviceCommandStore & {
  placeDeviceRaw: ReturnType<typeof vi.fn>;
  removeDeviceAtIndexRaw: ReturnType<typeof vi.fn>;
  moveDeviceRaw: ReturnType<typeof vi.fn>;
  updateDeviceFaceRaw: ReturnType<typeof vi.fn>;
  updateDeviceNameRaw: ReturnType<typeof vi.fn>;
  getDeviceAtIndex: ReturnType<typeof vi.fn>;
} {
  return {
    placeDeviceRaw: vi.fn().mockReturnValue(0),
    removeDeviceAtIndexRaw: vi.fn(),
    moveDeviceRaw: vi.fn().mockReturnValue(true),
    updateDeviceFaceRaw: vi.fn(),
    updateDeviceNameRaw: vi.fn(),
    updateDevicePlacementImageRaw: vi.fn(),
    updateDeviceColourRaw: vi.fn(),
    updateDeviceContainerLinkageRaw: vi.fn(),
    updateDeviceNotesRaw: vi.fn(),
    updateDeviceIpRaw: vi.fn(),
    // Resolve-by-id (#2665): commands read the device at their creation index to
    // learn its stable id, then re-resolve that id on later runs. The mock backs
    // a small fixed roster (ids "mock-0".."mock-9") so an id captured at index N
    // always resolves back to index N, leaving the existing index assertions valid.
    getDeviceAtIndex: vi.fn((index: number) =>
      index >= 0 && index < 10
        ? createTestDevice({ id: `mock-${index}` })
        : undefined,
    ),
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

      const command = createRemoveDeviceCommand(device, store, "Switch");

      expect(command.type).toBe("REMOVE_DEVICE");
      expect(command.description).toBe("Remove Switch");
      expect(typeof command.timestamp).toBe("number");
    });

    it("uses default device name when not provided", () => {
      const store = createMockStore();
      const device = createTestDevice();

      const command = createRemoveDeviceCommand(device, store);

      expect(command.description).toBe("Remove device");
    });

    it("execute removes the target resolved by id at its current index", () => {
      const store = createMockStore();
      const device = createTestDevice({ id: "target" });
      // Device sits at index 3; execute resolves it by id at runtime (#2656)
      store.getDeviceAtIndex.mockImplementation((i: number) =>
        i === 3
          ? device
          : i < 3
            ? createTestDevice({ id: `other-${i}` })
            : undefined,
      );

      const command = createRemoveDeviceCommand(device, store);
      command.execute();

      expect(store.removeDeviceAtIndexRaw).toHaveBeenCalledTimes(1);
      expect(store.removeDeviceAtIndexRaw).toHaveBeenCalledWith(3);
    });

    it("execute is a no-op when the tracked device is absent from the store", () => {
      const store = createMockStore();
      const device = createTestDevice({ id: "missing" });
      // Store contains only an unrelated device; the target id is not present.
      store.getDeviceAtIndex.mockImplementation((i: number) =>
        i === 0 ? createTestDevice({ id: "someone-else" }) : undefined,
      );

      // The target id is not present — must NOT remove an unrelated device.
      const command = createRemoveDeviceCommand(device, store);
      command.execute();

      expect(store.removeDeviceAtIndexRaw).not.toHaveBeenCalled();
    });

    it("undo calls placeDeviceRaw with device copy", () => {
      const store = createMockStore();
      const device = createTestDevice({
        position: 15,
        device_type: "my-device",
      });

      const command = createRemoveDeviceCommand(device, store);
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

      const command = createRemoveDeviceCommand(device, store);

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

  describe("batch auto-import + placement", () => {
    function createCombinedMockStore(): DeviceCommandStore &
      DeviceTypeCommandStore & {
        placeDeviceRaw: ReturnType<typeof vi.fn>;
        removeDeviceAtIndexRaw: ReturnType<typeof vi.fn>;
        moveDeviceRaw: ReturnType<typeof vi.fn>;
        updateDeviceFaceRaw: ReturnType<typeof vi.fn>;
        updateDeviceNameRaw: ReturnType<typeof vi.fn>;
        getDeviceAtIndex: ReturnType<typeof vi.fn>;
        addDeviceTypeRaw: ReturnType<typeof vi.fn>;
        removeDeviceTypeRaw: ReturnType<typeof vi.fn>;
        updateDeviceTypeRaw: ReturnType<typeof vi.fn>;
        getPlacedDevicesForType: ReturnType<typeof vi.fn>;
      } {
      // Array-backed place/remove so resolve-by-id (#2665) can find the placed
      // device on undo: getDeviceAtIndex reads the same roster placeDeviceRaw
      // appends to. The spies still record their calls for assertions.
      const placed: PlacedDevice[] = [];
      return {
        placeDeviceRaw: vi.fn((device: PlacedDevice) => {
          placed.push(device);
          return placed.length - 1;
        }),
        removeDeviceAtIndexRaw: vi.fn((index: number) => {
          if (index < 0 || index >= placed.length) return undefined;
          return placed.splice(index, 1)[0];
        }),
        moveDeviceRaw: vi.fn().mockReturnValue(true),
        updateDeviceFaceRaw: vi.fn(),
        updateDeviceNameRaw: vi.fn(),
        updateDevicePlacementImageRaw: vi.fn(),
        updateDeviceColourRaw: vi.fn(),
        updateDeviceContainerLinkageRaw: vi.fn(),
        updateDeviceNotesRaw: vi.fn(),
        updateDeviceIpRaw: vi.fn(),
        getDeviceAtIndex: vi.fn((index: number) => placed[index]),
        addDeviceTypeRaw: vi.fn(),
        removeDeviceTypeRaw: vi.fn(),
        updateDeviceTypeRaw: vi.fn(),
        getPlacedDevicesForType: vi.fn().mockReturnValue([]),
        addCableRaw: vi.fn(),
        removeCableRaw: vi.fn(),
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

  describe("createRemoveDeviceCommand redo targets the right device", () => {
    // Array-backed fake store mirroring the real mutator semantics:
    // placeDeviceRaw appends to the end (mutators.ts:168), removeDeviceAtIndexRaw
    // filters positionally (mutators.ts:195), getDeviceAtIndex reads by index.
    // This faithfully models the index shift that undo's re-append causes.
    function createArrayBackedStore(
      initial: PlacedDevice[],
    ): DeviceCommandStore & {
      devices: PlacedDevice[];
    } {
      const devices = [...initial];
      return {
        devices,
        placeDeviceRaw(device: PlacedDevice): number {
          devices.push(device);
          return devices.length - 1;
        },
        removeDeviceAtIndexRaw(index: number): PlacedDevice | undefined {
          if (index < 0 || index >= devices.length) return undefined;
          const [removed] = devices.splice(index, 1);
          return removed;
        },
        moveDeviceRaw: vi.fn().mockReturnValue(true),
        updateDeviceFaceRaw: vi.fn(),
        updateDeviceNameRaw: vi.fn(),
        updateDevicePlacementImageRaw: vi.fn(),
        updateDeviceColourRaw: vi.fn(),
        updateDeviceContainerLinkageRaw: vi.fn(),
        updateDeviceNotesRaw: vi.fn(),
        updateDeviceIpRaw: vi.fn(),
        getDeviceAtIndex(index: number): PlacedDevice | undefined {
          return devices[index];
        },
      };
    }

    it("redo removes device A (not B) after undo re-appends A to the end", () => {
      const deviceA = createTestDevice({
        id: "device-a",
        device_type: "type-a",
      });
      const deviceB = createTestDevice({
        id: "device-b",
        device_type: "type-b",
      });
      const store = createArrayBackedStore([deviceA, deviceB]);

      // Remove A (index 0). undo re-appends A, shifting B to index 0.
      const command = createRemoveDeviceCommand(deviceA, store, "Device A");

      command.execute(); // [B]
      expect(store.devices).not.toContainEqual(
        expect.objectContaining({ id: "device-a" }),
      );
      expect(store.devices).toContainEqual(
        expect.objectContaining({ id: "device-b" }),
      );

      command.undo(); // [B, A] — A is now at the end, B at index 0
      expect(store.devices).toContainEqual(
        expect.objectContaining({ id: "device-a" }),
      );
      expect(store.devices).toContainEqual(
        expect.objectContaining({ id: "device-b" }),
      );

      command.execute(); // redo re-runs execute (history.redo); must remove A, not B
      expect(store.devices).not.toContainEqual(
        expect.objectContaining({ id: "device-a" }),
      );
      expect(store.devices).toContainEqual(
        expect.objectContaining({ id: "device-b" }),
      );
    });

    it("stays index-stable across undo-twice / redo-twice cycles", () => {
      const deviceA = createTestDevice({
        id: "device-a",
        device_type: "type-a",
      });
      const deviceB = createTestDevice({
        id: "device-b",
        device_type: "type-b",
      });
      const store = createArrayBackedStore([deviceA, deviceB]);

      const command = createRemoveDeviceCommand(deviceA, store, "Device A");

      // redo re-runs execute (history.redo)
      const runRedo = () => command.execute();

      // Cycle 1
      command.execute();
      command.undo();
      runRedo();
      expect(store.devices).not.toContainEqual(
        expect.objectContaining({ id: "device-a" }),
      );
      expect(store.devices).toContainEqual(
        expect.objectContaining({ id: "device-b" }),
      );

      // Cycle 2: undo again restores A, redo again must still remove A not B
      command.undo();
      expect(store.devices).toContainEqual(
        expect.objectContaining({ id: "device-a" }),
      );
      expect(store.devices).toContainEqual(
        expect.objectContaining({ id: "device-b" }),
      );

      runRedo();
      expect(store.devices).not.toContainEqual(
        expect.objectContaining({ id: "device-a" }),
      );
      expect(store.devices).toContainEqual(
        expect.objectContaining({ id: "device-b" }),
      );
    });
  });

  describe("interleaved device commands resolve their target by id (#2665)", () => {
    // Fully-functional array-backed store: place appends, remove filters
    // positionally, move/face mutate the matched index. Mirrors mutators.ts so an
    // operation recorded against device A keeps hitting A even after a command on a
    // LOWER-index device B shifts array positions.
    function createMutatingStore(
      initial: PlacedDevice[],
    ): DeviceCommandStore & {
      devices: PlacedDevice[];
    } {
      const devices = [...initial];
      return {
        devices,
        placeDeviceRaw(device: PlacedDevice): number {
          devices.push(device);
          return devices.length - 1;
        },
        removeDeviceAtIndexRaw(index: number): PlacedDevice | undefined {
          if (index < 0 || index >= devices.length) return undefined;
          return devices.splice(index, 1)[0];
        },
        moveDeviceRaw(index: number, newPosition: number): boolean {
          if (index < 0 || index >= devices.length) return false;
          devices[index] = { ...devices[index]!, position: newPosition };
          return true;
        },
        updateDeviceFaceRaw(index: number, face: DeviceFace): void {
          if (index < 0 || index >= devices.length) return;
          devices[index] = { ...devices[index]!, face };
        },
        updateDeviceNameRaw: vi.fn(),
        updateDevicePlacementImageRaw: vi.fn(),
        updateDeviceColourRaw: vi.fn(),
        updateDeviceContainerLinkageRaw: vi.fn(),
        updateDeviceNotesRaw: vi.fn(),
        updateDeviceIpRaw: vi.fn(),
        getDeviceAtIndex(index: number): PlacedDevice | undefined {
          return devices[index];
        },
      };
    }

    function findById(
      devices: PlacedDevice[],
      id: string,
    ): PlacedDevice | undefined {
      return devices.find((d) => d.id === id);
    }

    it("MOVE on device A still moves A after a lower-index B is removed then restored", () => {
      // createTestDevice takes human U and stores internal units.
      const deviceA = createTestDevice({ id: "device-a", position: 5 });
      const deviceB = createTestDevice({ id: "device-b", position: 1 });
      // B at index 0, A at index 1.
      const store = createMutatingStore([deviceB, deviceA]);

      // Record a MOVE on A (index 1) and a REMOVE on the lower-index B (index 0).
      const moveA = createMoveDeviceCommand(
        1,
        toInternalUnits(5),
        toInternalUnits(8),
        store,
        "Device A",
      );
      const removeB = createRemoveDeviceCommand(deviceB, store, "Device B");

      // Apply the move, then remove B. Removing B shifts A from index 1 to 0.
      moveA.execute();
      expect(findById(store.devices, "device-a")?.position).toBe(
        toInternalUnits(8),
      );
      removeB.execute();
      expect(findById(store.devices, "device-b")).toBeUndefined();

      // Undo the move. It must restore A (now at index 0), not whatever sits at
      // the original index 1. A captured index would target the wrong slot.
      moveA.undo();
      expect(findById(store.devices, "device-a")?.position).toBe(
        toInternalUnits(5),
      );

      // Restore B (re-appended to the end), then redo the move on A.
      removeB.undo();
      expect(findById(store.devices, "device-b")).toBeDefined();
      moveA.execute();
      expect(findById(store.devices, "device-a")?.position).toBe(
        toInternalUnits(8),
      );
      // B is untouched by A's command.
      expect(findById(store.devices, "device-b")?.position).toBe(
        toInternalUnits(1),
      );
    });

    it("UPDATE_FACE on device A targets A across undo-twice / redo-twice while B shifts", () => {
      const deviceA = createTestDevice({ id: "device-a", face: "front" });
      const deviceB = createTestDevice({ id: "device-b", face: "front" });
      // B at index 0, A at index 1.
      const store = createMutatingStore([deviceB, deviceA]);

      const flipA = createUpdateDeviceFaceCommand(
        1,
        "front",
        "rear",
        store,
        "Device A",
      );
      const removeB = createRemoveDeviceCommand(deviceB, store, "Device B");

      // Flip A, then remove B (lower index) so A shifts to index 0.
      flipA.execute();
      removeB.execute();
      expect(findById(store.devices, "device-a")?.face).toBe("rear");

      // Cycle 1: undo + redo of the flip must keep hitting A, not B.
      flipA.undo();
      expect(findById(store.devices, "device-a")?.face).toBe("front");
      flipA.execute();
      expect(findById(store.devices, "device-a")?.face).toBe("rear");

      // Restore B, re-appended at the end. A's command still resolves to A.
      removeB.undo();
      expect(findById(store.devices, "device-b")?.face).toBe("front");

      // Cycle 2: undo-twice-equivalent re-check then redo, both by id.
      flipA.undo();
      expect(findById(store.devices, "device-a")?.face).toBe("front");
      flipA.execute();
      expect(findById(store.devices, "device-a")?.face).toBe("rear");
      // B was never flipped by A's command.
      expect(findById(store.devices, "device-b")?.face).toBe("front");
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
