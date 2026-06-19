/**
 * Image Undo Tests
 *
 * Verifies that images are properly snapshotted at command creation time
 * and restored when undoing device removal or device type deletion.
 * Bug #1477: Images were cleaned up in raw mutators (called during undo),
 * so undoing a removal lost the images permanently.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getImageStore, resetImageStore } from "$lib/stores/images.svelte";
import {
  createRemoveDeviceCommand,
  createCrossRackMoveCommand,
} from "$lib/stores/commands/device";
import { createDeleteDeviceTypeCommand } from "$lib/stores/commands/device-type";
import type {
  DeviceCommandStore,
  CrossRackMoveStore,
} from "$lib/stores/commands/device";
import type { DeviceTypeCommandStore } from "$lib/stores/commands/device-type";
import { placementKey } from "$lib/utils/placement-key";
import { createTestDevice, createTestDeviceType } from "./factories";
import type { PlacedDevice, DeviceType } from "$lib/types";
import type { ImageData } from "$lib/types/images";

const TEST_LAYOUT_ID = "test-layout-abc";

// Helper to create mock ImageData (user upload)
function createMockImageData(filename = "test-front.png"): ImageData {
  return {
    blob: new Blob(["test"], { type: "image/png" }),
    dataUrl: "data:image/png;base64,dGVzdA==",
    filename,
  };
}

// Minimal mock store that tracks placed devices
function createMockDeviceStore(devices: PlacedDevice[]): DeviceCommandStore {
  return {
    placeDeviceRaw(device: PlacedDevice) {
      devices.push(device);
      return devices.length - 1;
    },
    removeDeviceAtIndexRaw(index: number) {
      const removed = devices[index];
      devices.splice(index, 1);
      return removed;
    },
    moveDeviceRaw() {
      return true;
    },
    updateDeviceFaceRaw() {},
    updateDeviceNameRaw() {},
    updateDevicePlacementImageRaw() {},
    updateDeviceColourRaw() {},
    updateDeviceNotesRaw() {},
    updateDeviceIpRaw() {},
    getDeviceAtIndex(index: number) {
      return devices[index];
    },
  };
}

// Minimal mock store for device type commands
function createMockDeviceTypeStore(
  deviceTypes: DeviceType[],
  devices: PlacedDevice[],
): DeviceTypeCommandStore {
  let activeRackId: string | null = null;
  return {
    addDeviceTypeRaw(dt: DeviceType) {
      deviceTypes.push(dt);
    },
    removeDeviceTypeRaw(slug: string) {
      const idx = deviceTypes.findIndex((dt) => dt.slug === slug);
      if (idx >= 0) deviceTypes.splice(idx, 1);
      // Also remove placed devices of this type
      for (let i = devices.length - 1; i >= 0; i--) {
        if (devices[i].device_type === slug) devices.splice(i, 1);
      }
    },
    updateDeviceTypeRaw() {},
    placeDeviceRaw(device: PlacedDevice) {
      devices.push(device);
      return devices.length - 1;
    },
    removeDeviceAtIndexRaw() {},
    getPlacedDevicesForType(slug: string) {
      return devices.filter((d) => d.device_type === slug);
    },
    getDeviceAtIndex(index: number) {
      return devices[index];
    },
    setActiveRackId(id: string | null) {
      activeRackId = id;
    },
    getActiveRackId() {
      return activeRackId;
    },
    addCableRaw() {},
    removeCableRaw() {},
  };
}

describe("Image Undo — Device Removal", () => {
  beforeEach(() => {
    resetImageStore();
  });

  it("removing device with placement image then undoing restores image", () => {
    const imageStore = getImageStore();
    const device = createTestDevice({
      id: "dev-1",
      device_type: "test-device",
    });
    const devices = [device];
    const store = createMockDeviceStore(devices);

    // Set up a placement image for this device
    const imageKey = placementKey(TEST_LAYOUT_ID, device.id);
    const frontImage = createMockImageData("dev-1-front.png");
    imageStore.setDeviceImage(imageKey, "front", frontImage);

    // Verify image exists before removal
    expect(imageStore.hasImage(imageKey, "front")).toBe(true);

    // Create the remove command (should snapshot images)
    const cmd = createRemoveDeviceCommand(
      0,
      device,
      store,
      "Test Device",
      TEST_LAYOUT_ID,
    );

    // Execute: removes device and cleans up images
    cmd.execute();
    expect(imageStore.hasImage(imageKey, "front")).toBe(false);

    // Undo: should restore the device AND its images
    cmd.undo();
    expect(imageStore.hasImage(imageKey, "front")).toBe(true);
    expect(imageStore.getDeviceImage(imageKey, "front")?.filename).toBe(
      "dev-1-front.png",
    );
  });

  it("removing device with both front and rear images restores both on undo", () => {
    const imageStore = getImageStore();
    const device = createTestDevice({
      id: "dev-2",
      device_type: "test-device",
    });
    const devices = [device];
    const store = createMockDeviceStore(devices);

    const imageKey = placementKey(TEST_LAYOUT_ID, device.id);
    imageStore.setDeviceImage(
      imageKey,
      "front",
      createMockImageData("dev-2-front.png"),
    );
    imageStore.setDeviceImage(
      imageKey,
      "rear",
      createMockImageData("dev-2-rear.png"),
    );

    const cmd = createRemoveDeviceCommand(
      0,
      device,
      store,
      "Test Device",
      TEST_LAYOUT_ID,
    );

    cmd.execute();
    expect(imageStore.hasImage(imageKey, "front")).toBe(false);
    expect(imageStore.hasImage(imageKey, "rear")).toBe(false);

    cmd.undo();
    expect(imageStore.hasImage(imageKey, "front")).toBe(true);
    expect(imageStore.hasImage(imageKey, "rear")).toBe(true);
    expect(imageStore.getDeviceImage(imageKey, "front")?.filename).toBe(
      "dev-2-front.png",
    );
    expect(imageStore.getDeviceImage(imageKey, "rear")?.filename).toBe(
      "dev-2-rear.png",
    );
  });

  it("removing device without images does not fail on undo", () => {
    const device = createTestDevice({
      id: "dev-3",
      device_type: "test-device",
    });
    const devices = [device];
    const store = createMockDeviceStore(devices);

    const cmd = createRemoveDeviceCommand(
      0,
      device,
      store,
      "Test Device",
      TEST_LAYOUT_ID,
    );

    cmd.execute();
    // Should not throw
    expect(() => cmd.undo()).not.toThrow();
  });
});

describe("Image Undo — Device Type Deletion", () => {
  beforeEach(() => {
    resetImageStore();
  });

  it("deleting device type with images then undoing restores all images", () => {
    const imageStore = getImageStore();
    const deviceType = createTestDeviceType({ slug: "my-server", u_height: 2 });
    const device1 = createTestDevice({
      id: "placed-1",
      device_type: "my-server",
    });
    const device2 = createTestDevice({
      id: "placed-2",
      device_type: "my-server",
    });

    const deviceTypes = [deviceType];
    const devices = [device1, device2];
    const store = createMockDeviceTypeStore(deviceTypes, devices);

    const pk1 = placementKey(TEST_LAYOUT_ID, device1.id);
    const pk2 = placementKey(TEST_LAYOUT_ID, device2.id);

    // Set up type-level image
    imageStore.setDeviceImage(
      "my-server",
      "front",
      createMockImageData("my-server-front.png"),
    );

    // Set up placement-specific images
    imageStore.setDeviceImage(
      pk1,
      "front",
      createMockImageData("placed-1-front.png"),
    );
    imageStore.setDeviceImage(
      pk2,
      "rear",
      createMockImageData("placed-2-rear.png"),
    );

    const cmd = createDeleteDeviceTypeCommand(
      deviceType,
      [
        { rackId: "rack-1", device: device1 },
        { rackId: "rack-1", device: device2 },
      ],
      store,
      [],
      TEST_LAYOUT_ID,
    );

    // Execute: deletes type, devices, and images
    cmd.execute();
    expect(imageStore.hasImage("my-server", "front")).toBe(false);
    expect(imageStore.hasImage(pk1, "front")).toBe(false);
    expect(imageStore.hasImage(pk2, "rear")).toBe(false);

    // Undo: should restore everything
    cmd.undo();
    expect(imageStore.hasImage("my-server", "front")).toBe(true);
    expect(imageStore.getDeviceImage("my-server", "front")?.filename).toBe(
      "my-server-front.png",
    );
    expect(imageStore.hasImage(pk1, "front")).toBe(true);
    expect(imageStore.getDeviceImage(pk1, "front")?.filename).toBe(
      "placed-1-front.png",
    );
    expect(imageStore.hasImage(pk2, "rear")).toBe(true);
    expect(imageStore.getDeviceImage(pk2, "rear")?.filename).toBe(
      "placed-2-rear.png",
    );
  });

  it("deleting device type without images does not fail on undo", () => {
    const deviceType = createTestDeviceType({ slug: "no-image-device" });
    const deviceTypes = [deviceType];
    const devices: PlacedDevice[] = [];
    const store = createMockDeviceTypeStore(deviceTypes, devices);

    const cmd = createDeleteDeviceTypeCommand(
      deviceType,
      [],
      store,
      [],
      TEST_LAYOUT_ID,
    );

    cmd.execute();
    expect(() => cmd.undo()).not.toThrow();
  });
});

describe("Image Undo — Cross-Rack Move (#1478)", () => {
  beforeEach(() => {
    resetImageStore();
  });

  it("placement image follows device when cross-rack move remaps the device ID", () => {
    const imageStore = getImageStore();
    const device = createTestDevice({
      id: "parent-1",
      device_type: "test-server",
    });

    // Source rack starts with the device; target rack already has a device with the same UUID.
    // This forces the dedup guard in placeDeviceRaw to assign a new ID on execute.
    const sourceDevices: PlacedDevice[] = [{ ...device }];
    const targetConflict = createTestDevice({
      id: "parent-1",
      device_type: "other-server",
    });
    const targetDevices: PlacedDevice[] = [{ ...targetConflict }];
    const remappedId = "parent-1-remapped";
    let activeRack = "source";

    const store: CrossRackMoveStore = {
      setActiveRackId(id) {
        activeRack = id ?? "source";
      },
      getActiveRackId() {
        return activeRack;
      },
      placeDeviceRaw(d: PlacedDevice) {
        if (activeRack === "target") {
          // Simulate dedup: remap if the ID already exists in target
          const conflict = targetDevices.some((x) => x.id === d.id);
          const placed = conflict ? { ...d, id: remappedId } : d;
          targetDevices.push(placed);
          return targetDevices.length - 1;
        }
        sourceDevices.push(d);
        return sourceDevices.length - 1;
      },
      removeDeviceAtIndexRaw(index: number) {
        const arr = activeRack === "target" ? targetDevices : sourceDevices;
        const removed = arr[index];
        arr.splice(index, 1);
        return removed;
      },
      getDeviceAtIndex(index: number) {
        return activeRack === "target"
          ? targetDevices[index]
          : sourceDevices[index];
      },
      moveDeviceRaw() {
        return true;
      },
      updateDeviceFaceRaw() {},
      updateDeviceNameRaw() {},
      updateDevicePlacementImageRaw() {},
      updateDeviceColourRaw() {},
      updateDeviceNotesRaw() {},
      updateDeviceIpRaw() {},
    };

    const parentKey = placementKey(TEST_LAYOUT_ID, device.id);
    const remappedKey = placementKey(TEST_LAYOUT_ID, remappedId);
    imageStore.setDeviceImage(
      parentKey,
      "front",
      createMockImageData("server-front.png"),
    );

    const cmd = createCrossRackMoveCommand(
      "source",
      [0],
      "target",
      1,
      "front",
      device,
      [],
      store,
      "device",
      TEST_LAYOUT_ID,
    );

    cmd.execute();
    // After execute: device is in target with remapped ID; image must follow
    expect(imageStore.hasImage(parentKey, "front")).toBe(false);
    expect(imageStore.hasImage(remappedKey, "front")).toBe(true);

    cmd.undo();
    // After undo: device is back in source with original ID; image must follow back
    expect(imageStore.hasImage(remappedKey, "front")).toBe(false);
    expect(imageStore.hasImage(parentKey, "front")).toBe(true);
    expect(imageStore.getDeviceImage(parentKey, "front")?.filename).toBe(
      "server-front.png",
    );
  });

  it("placement images follow child devices when cross-rack move remaps child IDs", () => {
    const imageStore = getImageStore();
    const parent = createTestDevice({
      id: "parent-chassis",
      device_type: "chassis",
    });
    const child1 = createTestDevice({ id: "child-1", device_type: "blade" });
    const child2 = createTestDevice({ id: "child-2", device_type: "blade" });

    const sourceDevices: PlacedDevice[] = [
      { ...parent },
      { ...child1 },
      { ...child2 },
    ];
    // Target rack already has devices with the same child UUIDs — triggers dedup on children
    const targetDevices: PlacedDevice[] = [
      createTestDevice({ id: "child-1", device_type: "other" }),
      createTestDevice({ id: "child-2", device_type: "other" }),
    ];
    const remappedChild1 = "child-1-remapped";
    const remappedChild2 = "child-2-remapped";
    let activeRack = "source";

    const store: CrossRackMoveStore = {
      setActiveRackId(id) {
        activeRack = id ?? "source";
      },
      getActiveRackId() {
        return activeRack;
      },
      placeDeviceRaw(d: PlacedDevice) {
        if (activeRack === "target") {
          const conflict = targetDevices.some((x) => x.id === d.id);
          const remap: Record<string, string> = {
            "child-1": remappedChild1,
            "child-2": remappedChild2,
          };
          const placed = conflict
            ? { ...d, id: remap[d.id] ?? `${d.id}-r` }
            : d;
          targetDevices.push(placed);
          return targetDevices.length - 1;
        }
        sourceDevices.push(d);
        return sourceDevices.length - 1;
      },
      removeDeviceAtIndexRaw(index: number) {
        const arr = activeRack === "target" ? targetDevices : sourceDevices;
        const removed = arr[index];
        arr.splice(index, 1);
        return removed;
      },
      getDeviceAtIndex(index: number) {
        return activeRack === "target"
          ? targetDevices[index]
          : sourceDevices[index];
      },
      moveDeviceRaw() {
        return true;
      },
      updateDeviceFaceRaw() {},
      updateDeviceNameRaw() {},
      updateDevicePlacementImageRaw() {},
      updateDeviceColourRaw() {},
      updateDeviceNotesRaw() {},
      updateDeviceIpRaw() {},
    };

    const child1Key = placementKey(TEST_LAYOUT_ID, child1.id);
    const child2Key = placementKey(TEST_LAYOUT_ID, child2.id);
    const remappedChild1Key = placementKey(TEST_LAYOUT_ID, remappedChild1);
    const remappedChild2Key = placementKey(TEST_LAYOUT_ID, remappedChild2);
    imageStore.setDeviceImage(
      child1Key,
      "front",
      createMockImageData("child-1-front.png"),
    );
    imageStore.setDeviceImage(
      child2Key,
      "rear",
      createMockImageData("child-2-rear.png"),
    );

    const cmd = createCrossRackMoveCommand(
      "source",
      [0, 1, 2],
      "target",
      1,
      "front",
      parent,
      [child1, child2],
      store,
      "device",
      TEST_LAYOUT_ID,
    );

    cmd.execute();
    // Child images must follow their remapped IDs
    expect(imageStore.hasImage(child1Key, "front")).toBe(false);
    expect(imageStore.hasImage(remappedChild1Key, "front")).toBe(true);
    expect(imageStore.hasImage(child2Key, "rear")).toBe(false);
    expect(imageStore.hasImage(remappedChild2Key, "rear")).toBe(true);

    cmd.undo();
    // After undo: child images return to original keys
    expect(imageStore.hasImage(remappedChild1Key, "front")).toBe(false);
    expect(imageStore.hasImage(child1Key, "front")).toBe(true);
    expect(imageStore.hasImage(remappedChild2Key, "rear")).toBe(false);
    expect(imageStore.hasImage(child2Key, "rear")).toBe(true);
  });
});
