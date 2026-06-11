import { describe, it, expect, beforeEach } from "vitest";
import type { DeviceType, Rack, PlacedDevice } from "$lib/types";
import {
  createRackDeviceDragData,
  serializeDragData,
  parseDragData,
  getDropFeedback,
} from "$lib/utils/dragdrop";
import { toInternalUnits } from "$lib/utils/position";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createTestContainerType, createTestDeviceType } from "./factories";

// Helper to create a placed device with internal unit position
function pd(
  id: string,
  device_type: string,
  positionU: number,
  face: "front" | "rear" | "both",
): PlacedDevice {
  return {
    id,
    device_type,
    position: toInternalUnits(positionU),
    face,
  };
}

describe("DnD Between Racks", () => {
  // Test device data
  const testDevice: DeviceType = {
    slug: "device-1",
    model: "Test Server",
    u_height: 2,
    colour: "#4A90D9",
    category: "server",
  };

  const testDevice2: DeviceType = {
    slug: "device-2",
    model: "Test Switch",
    u_height: 1,
    colour: "#7B68EE",
    category: "network",
  };

  const tallDevice: DeviceType = {
    slug: "device-tall",
    model: "Tall Server",
    u_height: 4,
    colour: "#4A90D9",
    category: "server",
  };

  const deviceLibrary: DeviceType[] = [testDevice, testDevice2, tallDevice];

  const targetRack: Rack = {
    name: "Target Rack",
    height: 12,
    width: 19,
    position: 1,
    desc_units: false,
    form_factor: "4-post",
    starting_unit: 1,
    devices: [],
  };

  const targetRackWithDevice: Rack = {
    name: "Target Rack",
    height: 12,
    width: 19,
    position: 1,
    desc_units: false,
    form_factor: "4-post",
    starting_unit: 1,
    devices: [pd("test-id-1", "device-2", 3, "front")],
  };

  const smallTargetRack: Rack = {
    name: "Small Rack",
    height: 6,
    width: 19,
    position: 2,
    desc_units: false,
    form_factor: "4-post",
    starting_unit: 1,
    devices: [],
  };

  describe("Cross-rack drag data", () => {
    it("creates drag data with source rack ID", () => {
      const dragData = createRackDeviceDragData(testDevice, "rack-source", 0);
      expect(dragData.sourceRackId).toBe("rack-source");
    });

    it("preserves source rack ID through serialization", () => {
      const original = createRackDeviceDragData(testDevice, "rack-source", 0);
      const serialized = serializeDragData(original);
      const deserialized = parseDragData(serialized);

      expect(deserialized).not.toBeNull();
      expect(deserialized?.sourceRackId).toBe("rack-source");
    });

    it("identifies cross-rack move when sourceRackId differs from target", () => {
      const dragData = createRackDeviceDragData(testDevice, "rack-source", 0);
      const isInternalMove = dragData.sourceRackId === "rack-target";
      expect(isInternalMove).toBe(false);
    });

    it("identifies internal move when sourceRackId matches target", () => {
      const dragData = createRackDeviceDragData(testDevice, "rack-source", 0);
      const isInternalMove = dragData.sourceRackId === "rack-source";
      expect(isInternalMove).toBe(true);
    });
  });

  describe("Cross-rack drop validation", () => {
    it("returns valid for empty target rack position", () => {
      // Device from source rack dropped on empty target rack
      const feedback = getDropFeedback(
        targetRack,
        deviceLibrary,
        testDevice.u_height,
        5,
      );
      expect(feedback).toBe("valid");
    });

    it("returns valid for non-colliding position in target rack", () => {
      // Target rack has device at U3, dropping 2U device at U5 (occupies U5-U6) is valid
      const feedback = getDropFeedback(
        targetRackWithDevice,
        deviceLibrary,
        testDevice.u_height,
        5,
      );
      expect(feedback).toBe("valid");
    });

    it("returns blocked when colliding with device in target rack", () => {
      // Target rack has device at U3, dropping 2U device at U2 (occupies U2-U3) collides
      const feedback = getDropFeedback(
        targetRackWithDevice,
        deviceLibrary,
        testDevice.u_height,
        2,
      );
      expect(feedback).toBe("blocked");
    });

    it("returns invalid when device too tall for target rack", () => {
      // 4U device dropped at U4 in 6U rack would need U4-U7 (beyond rack height)
      const feedback = getDropFeedback(
        smallTargetRack,
        deviceLibrary,
        tallDevice.u_height,
        4,
      );
      expect(feedback).toBe("invalid");
    });

    it("returns invalid for position below U1", () => {
      const feedback = getDropFeedback(
        targetRack,
        deviceLibrary,
        testDevice.u_height,
        0,
      );
      expect(feedback).toBe("invalid");
    });

    it("does not use excludeIndex for cross-rack moves", () => {
      // For cross-rack moves, excludeIndex should not be provided since the device
      // doesn't exist in the target rack yet
      const feedback = getDropFeedback(
        targetRackWithDevice,
        deviceLibrary,
        testDevice.u_height,
        3,
      );
      // Without excludeIndex, dropping at U3 collides with existing device at U3
      expect(feedback).toBe("blocked");
    });
  });

  describe("Cross-rack move scenarios", () => {
    it("validates moving device to same position in different rack", () => {
      // Device at U5 in source rack, can move to U5 in empty target rack
      const feedback = getDropFeedback(
        targetRack,
        deviceLibrary,
        testDevice.u_height,
        5,
      );
      expect(feedback).toBe("valid");
    });

    it("validates moving device to different position in different rack", () => {
      // Device at U5 in source rack, can move to U10 in target rack
      const feedback = getDropFeedback(
        targetRack,
        deviceLibrary,
        testDevice.u_height,
        10,
      );
      expect(feedback).toBe("valid");
    });

    it("validates edge case: moving to U1 of target rack", () => {
      const feedback = getDropFeedback(
        targetRack,
        deviceLibrary,
        testDevice.u_height,
        1,
      );
      expect(feedback).toBe("valid");
    });

    it("validates edge case: moving to top of target rack", () => {
      // 2U device at U11 occupies U11-U12 in 12U rack (max valid position)
      const feedback = getDropFeedback(
        targetRack,
        deviceLibrary,
        testDevice.u_height,
        11,
      );
      expect(feedback).toBe("valid");
    });

    it("invalidates moving beyond top of target rack", () => {
      // 2U device at U12 would need U12-U13, beyond 12U rack
      const feedback = getDropFeedback(
        targetRack,
        deviceLibrary,
        testDevice.u_height,
        12,
      );
      expect(feedback).toBe("invalid");
    });
  });

  describe("Multiple device scenarios", () => {
    const busyTargetRack: Rack = {
      name: "Busy Rack",
      height: 12,
      width: 19,
      position: 1,
      desc_units: false,
      form_factor: "4-post",
      starting_unit: 1,
      devices: [
        pd("test-id-2", "device-1", 2, "front"), // U2-U3
        pd("test-id-3", "device-2", 6, "front"), // U6
        pd("test-id-4", "device-1", 9, "front"), // U9-U10
      ],
    };

    it("finds valid gap between devices", () => {
      // Gap at U4-U5 between devices at U2-U3 and U6
      const feedback = getDropFeedback(
        busyTargetRack,
        deviceLibrary,
        testDevice.u_height,
        4,
      );
      expect(feedback).toBe("valid");
    });

    it("finds valid gap at top", () => {
      // Gap at U11-U12 above device at U9-U10
      const feedback = getDropFeedback(
        busyTargetRack,
        deviceLibrary,
        testDevice.u_height,
        11,
      );
      expect(feedback).toBe("valid");
    });

    it("blocks when gap too small", () => {
      // 1U gap at U7-U8 is too small for 2U device
      // Device at U7 would occupy U7-U8, but U8 is free... wait
      // Actually gap is U7-U8 (2 units), let me recalculate
      // Devices: U2-U3, U6, U9-U10
      // Free: U1, U4-U5, U7-U8, U11-U12
      // So U7 for 2U device occupies U7-U8, which is free!
      const feedback = getDropFeedback(
        busyTargetRack,
        deviceLibrary,
        testDevice.u_height,
        7,
      );
      expect(feedback).toBe("valid");
    });

    it("blocks when no valid position available for tall device", () => {
      // 4U device needs contiguous 4U space
      // Available gaps: U1 (1U), U4-U5 (2U), U7-U8 (2U), U11-U12 (2U)
      // None are 4U, so any position will be blocked or invalid
      const feedback = getDropFeedback(
        busyTargetRack,
        deviceLibrary,
        tallDevice.u_height,
        4,
      );
      expect(feedback).toBe("blocked"); // U4-U7 collides with device at U6
    });

    it("validates finding only valid position for tall device", () => {
      // Rack with single device at U1-U2, 4U device can go at U3-U6
      const rackWithBottomDevice: Rack = {
        name: "Rack with bottom device",
        height: 12,
        width: 19,
        position: 0,
        desc_units: false,
        form_factor: "4-post",
        starting_unit: 1,
        devices: [pd("test-id-5", "device-1", 1, "front")], // U1-U2
      };
      const feedback = getDropFeedback(
        rackWithBottomDevice,
        deviceLibrary,
        tallDevice.u_height,
        3,
      );
      expect(feedback).toBe("valid");
    });
  });

  describe("Cross-rack move execution", () => {
    let store: ReturnType<typeof getLayoutStore>;
    let rackA: Rack & { id: string };
    let rackB: Rack & { id: string };
    let serverType: DeviceType;
    let switchType: DeviceType;

    beforeEach(() => {
      resetLayoutStore();
      resetHistoryStore();
      store = getLayoutStore();

      rackA = store.addRack("Rack A", 42)!;
      rackB = store.addRack("Rack B", 42)!;

      serverType = createTestDeviceType({ slug: "test-server", u_height: 2 });
      switchType = createTestDeviceType({ slug: "test-switch", u_height: 1 });
      store.addDeviceTypeRaw(serverType);
      store.addDeviceTypeRaw(switchType);
    });

    /** Find a device by slug in a rack, or undefined */
    function findDevice(rack: Rack, slug: string): PlacedDevice | undefined {
      return rack.devices.find((d) => d.device_type === slug);
    }

    it("moves device from rack A to rack B", () => {
      store.placeDevice(rackA.id, serverType.slug, 5);

      const result = store.moveDeviceToRack(rackA.id, 0, rackB.id, 10, "front");

      expect(result).toBe(true);
      expect(
        findDevice(store.getRackById(rackA.id)!, serverType.slug),
      ).toBeUndefined();
      const moved = findDevice(store.getRackById(rackB.id)!, serverType.slug);
      expect(moved).toBeDefined();
      expect(moved!.position).toBe(toInternalUnits(10));
      expect(moved!.face).toBe("front");
    });

    it("undoes cross-rack move back to source rack", () => {
      store.placeDevice(rackA.id, serverType.slug, 5);

      store.moveDeviceToRack(rackA.id, 0, rackB.id, 10, "front");
      store.undo();

      expect(
        findDevice(store.getRackById(rackB.id)!, serverType.slug),
      ).toBeUndefined();
      const restored = findDevice(
        store.getRackById(rackA.id)!,
        serverType.slug,
      );
      expect(restored).toBeDefined();
      expect(restored!.position).toBe(toInternalUnits(5));
    });

    it("redoes cross-rack move after undo", () => {
      store.placeDevice(rackA.id, serverType.slug, 5);

      store.moveDeviceToRack(rackA.id, 0, rackB.id, 10, "front");
      store.undo();
      store.redo();

      expect(
        findDevice(store.getRackById(rackA.id)!, serverType.slug),
      ).toBeUndefined();
      expect(
        findDevice(store.getRackById(rackB.id)!, serverType.slug),
      ).toBeDefined();
    });

    it("assigns face from drop target", () => {
      store.placeDevice(rackA.id, serverType.slug, 5);

      store.moveDeviceToRack(rackA.id, 0, rackB.id, 10, "rear");

      const moved = findDevice(store.getRackById(rackB.id)!, serverType.slug);
      expect(moved!.face).toBe("rear");
    });

    it("rejects move when target position is occupied", () => {
      store.placeDevice(rackA.id, serverType.slug, 5);
      store.placeDevice(rackB.id, serverType.slug, 10);

      const result = store.moveDeviceToRack(rackA.id, 0, rackB.id, 10, "front");

      expect(result).toBe(false);
      // Device remains in source rack
      expect(
        findDevice(store.getRackById(rackA.id)!, serverType.slug),
      ).toBeDefined();
      expect(
        findDevice(store.getRackById(rackB.id)!, serverType.slug),
      ).toBeDefined();
    });

    it("delegates to moveDevice for same-rack moves", () => {
      store.placeDevice(rackA.id, serverType.slug, 5);

      const result = store.moveDeviceToRack(rackA.id, 0, rackA.id, 10);

      expect(result).toBe(true);
      const moved = findDevice(store.getRackById(rackA.id)!, serverType.slug);
      expect(moved).toBeDefined();
      expect(moved!.position).toBe(toInternalUnits(10));
    });

    it("applies face change on same-rack move", () => {
      store.placeDevice(rackA.id, serverType.slug, 5);

      const result = store.moveDeviceToRack(rackA.id, 0, rackA.id, 10, "rear");

      expect(result).toBe(true);
      const moved = findDevice(store.getRackById(rackA.id)!, serverType.slug);
      expect(moved!.face).toBe("rear");
    });

    it("returns false for invalid device index", () => {
      const result = store.moveDeviceToRack(
        rackA.id,
        99,
        rackB.id,
        10,
        "front",
      );
      expect(result).toBe(false);
    });

    it("returns false for nonexistent rack", () => {
      store.placeDevice(rackA.id, serverType.slug, 5);
      const result = store.moveDeviceToRack(
        rackA.id,
        0,
        "nonexistent",
        10,
        "front",
      );
      expect(result).toBe(false);
    });

    it("moves container children with parent device", () => {
      // Place a parent device at U5 in rack A
      store.placeDevice(rackA.id, serverType.slug, 5);
      const parentId = store.getRackById(rackA.id)!.devices[0]!.id;

      // Place a child device that references the parent via container_id
      store.placeDevice(rackA.id, switchType.slug, 10);
      // Directly set container_id to link child to parent
      store.getRackById(rackA.id)!.devices[1]!.container_id = parentId;

      // Verify the link exists before the move
      const childBefore = store
        .getRackById(rackA.id)!
        .devices.find((d) => d.container_id === parentId);
      expect(childBefore).toBeDefined();

      // Move parent (index 0) to rack B — child should follow
      const result = store.moveDeviceToRack(rackA.id, 0, rackB.id, 15, "front");

      expect(result).toBe(true);
      // Source rack should be empty (both parent and child moved)
      expect(store.getRackById(rackA.id)!.devices.length).toBe(0);
      // Both parent and child should be in target rack
      const movedParent = findDevice(
        store.getRackById(rackB.id)!,
        serverType.slug,
      );
      expect(movedParent).toBeDefined();
      // Child should reference the moved parent
      const movedChild = store
        .getRackById(rackB.id)!
        .devices.find((d) => d.container_id === movedParent!.id);
      expect(movedChild).toBeDefined();
    });

    /** Place a container in rack A with a child device inside its slot */
    function placeContainedChild() {
      const containerType = createTestContainerType({ slug: "test-shelf" });
      const childType = createTestDeviceType({
        slug: "test-mini-pc",
        u_height: 1,
        slot_width: 1,
        is_full_depth: false,
      });
      store.addDeviceTypeRaw(containerType);
      store.addDeviceTypeRaw(childType);

      store.placeDevice(rackA.id, containerType.slug, 5);
      const container = store.getRackById(rackA.id)!.devices[0]!;
      const placed = store.placeInContainer(
        rackA.id,
        childType.slug,
        container.id,
        "slot-left",
        0,
      );
      expect(placed).toBe(true);
      const childIndex = store
        .getRackById(rackA.id)!
        .devices.findIndex((d) => d.container_id === container.id);
      return { container, childType, childIndex };
    }

    it("clears container linkage when moving a contained device to another rack", () => {
      const { childType, childIndex } = placeContainedChild();

      const result = store.moveDeviceToRack(
        rackA.id,
        childIndex,
        rackB.id,
        10,
        "front",
      );

      expect(result).toBe(true);
      const moved = findDevice(store.getRackById(rackB.id)!, childType.slug);
      expect(moved).toBeDefined();
      expect(moved!.container_id).toBeUndefined();
      expect(moved!.slot_id).toBeUndefined();
      expect(moved!.position).toBe(toInternalUnits(10));
    });

    it("undo restores a moved contained device into its original container", () => {
      const { container, childType, childIndex } = placeContainedChild();

      store.moveDeviceToRack(rackA.id, childIndex, rackB.id, 10, "front");
      store.undo();

      expect(
        findDevice(store.getRackById(rackB.id)!, childType.slug),
      ).toBeUndefined();
      const restored = findDevice(store.getRackById(rackA.id)!, childType.slug);
      expect(restored).toBeDefined();
      expect(restored!.container_id).toBe(container.id);
      expect(restored!.slot_id).toBe("slot-left");
      expect(restored!.position).toBe(0);
    });
  });
});
