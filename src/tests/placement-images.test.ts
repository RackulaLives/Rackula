/**
 * Placement Images Tests
 * Tests for per-placement device image overrides (Issue #184)
 */

import { describe, it, expect, beforeEach } from "vitest";
import JSZip from "jszip";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getImageStore, resetImageStore } from "$lib/stores/images.svelte";
import { createFolderArchive, extractFolderArchive } from "$lib/utils/archive";
import { sanitizeFilename } from "$lib/utils/imageUpload";
import {
  createTestDeviceType,
  createTestDevice,
  createTestLayout,
} from "./factories";
import type { ImageData, ImageStoreMap } from "$lib/types/images";

// Helper to create mock ImageData (user upload)
function createMockImageData(filename = "test.png"): ImageData {
  return {
    blob: new Blob(["test-content"], { type: "image/png" }),
    dataUrl: "data:image/png;base64,dGVzdC1jb250ZW50",
    filename,
  };
}

describe("Placement Images", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetImageStore();
  });

  describe("Image Store - Placement Keys", () => {
    it("stores placement images with placement-{deviceId} key", () => {
      const store = getImageStore();
      const imageData = createMockImageData("front.png");

      store.setDeviceImage("placement-abc123", "front", imageData);

      expect(store.hasImage("placement-abc123", "front")).toBe(true);
    });

    it("stores both front and rear placement images", () => {
      const store = getImageStore();
      const frontImage = createMockImageData("front.png");
      const rearImage = createMockImageData("rear.png");

      store.setDeviceImage("placement-abc123", "front", frontImage);
      store.setDeviceImage("placement-abc123", "rear", rearImage);

      expect(store.hasImage("placement-abc123", "front")).toBe(true);
      expect(store.hasImage("placement-abc123", "rear")).toBe(true);
    });

    it("placement images are separate from device type images", () => {
      const store = getImageStore();
      const deviceTypeImage = createMockImageData("device-type.png");
      const placementImage = createMockImageData("placement.png");

      store.setDeviceImage("my-server", "front", deviceTypeImage);
      store.setDeviceImage("placement-abc123", "front", placementImage);

      expect(store.getDeviceImage("my-server", "front")?.filename).toBe(
        "device-type.png",
      );
      expect(store.getDeviceImage("placement-abc123", "front")?.filename).toBe(
        "placement.png",
      );
    });

    it("removeAllDeviceImages removes placement images", () => {
      const store = getImageStore();
      store.setDeviceImage("placement-abc123", "front", createMockImageData());
      store.setDeviceImage("placement-abc123", "rear", createMockImageData());

      store.removeAllDeviceImages("placement-abc123");

      expect(store.hasImage("placement-abc123", "front")).toBe(false);
      expect(store.hasImage("placement-abc123", "rear")).toBe(false);
    });

    it("getImageUrl returns placement image URL", () => {
      const store = getImageStore();
      const imageData = createMockImageData();
      store.setDeviceImage("placement-abc123", "front", imageData);

      const url = store.getImageUrl("placement-abc123", "front");

      expect(url).toBe(imageData.dataUrl);
    });
  });

  describe("Layout Store - updateDevicePlacementImage", () => {
    beforeEach(() => {
      const store = getLayoutStore();
      store.addDeviceTypeRaw(createTestDeviceType({ slug: "test-server" }));
      store.placeDeviceRaw(
        createTestDevice({ id: "device-1", device_type: "test-server" }),
      );
    });

    it("updates front_image field on device", () => {
      const store = getLayoutStore();

      store.updateDevicePlacementImage(
        "rack-0",
        0,
        "front",
        "custom-front.png",
      );

      expect(store.rack.devices[0]?.front_image).toBe("custom-front.png");
    });

    it("updates rear_image field on device", () => {
      const store = getLayoutStore();

      store.updateDevicePlacementImage("rack-0", 0, "rear", "custom-rear.png");

      expect(store.rack.devices[0]?.rear_image).toBe("custom-rear.png");
    });

    it("can set both front and rear images", () => {
      const store = getLayoutStore();

      store.updateDevicePlacementImage("rack-0", 0, "front", "front.png");
      store.updateDevicePlacementImage("rack-0", 0, "rear", "rear.png");

      expect(store.rack.devices[0]?.front_image).toBe("front.png");
      expect(store.rack.devices[0]?.rear_image).toBe("rear.png");
    });

    it("clears image when undefined is passed", () => {
      const store = getLayoutStore();
      store.updateDevicePlacementImage("rack-0", 0, "front", "image.png");

      store.updateDevicePlacementImage("rack-0", 0, "front", undefined);

      expect(store.rack.devices[0]?.front_image).toBeUndefined();
    });

    it("sanitizes filename to prevent path traversal", () => {
      const store = getLayoutStore();

      store.updateDevicePlacementImage(
        "rack-0",
        0,
        "front",
        "../../../etc/passwd",
      );

      // Sanitized filename should not contain path traversal
      expect(store.rack.devices[0]?.front_image).not.toContain("..");
      expect(store.rack.devices[0]?.front_image).not.toContain("/");
    });

    it("marks layout as dirty", () => {
      const store = getLayoutStore();
      store.markClean();
      expect(store.isDirty).toBe(false);

      store.updateDevicePlacementImage("rack-0", 0, "front", "image.png");

      expect(store.isDirty).toBe(true);
    });

    it("does nothing for invalid device index", () => {
      const store = getLayoutStore();
      const originalDevices = [...store.rack.devices];

      store.updateDevicePlacementImage("rack-0", 999, "front", "image.png");

      expect(store.rack.devices).toEqual(originalDevices);
    });
  });

  describe("Layout Store - Device Deletion Cleanup", () => {
    it("cleans up placement images when device is deleted", () => {
      const layoutStore = getLayoutStore();
      const imageStore = getImageStore();

      // Setup: Add device type and place a device
      layoutStore.addDeviceTypeRaw(
        createTestDeviceType({ slug: "test-server" }),
      );
      const deviceId = "device-to-delete";
      layoutStore.placeDeviceRaw(
        createTestDevice({ id: deviceId, device_type: "test-server" }),
      );

      // Add placement images
      imageStore.setDeviceImage(
        `placement-${deviceId}`,
        "front",
        createMockImageData(),
      );
      imageStore.setDeviceImage(
        `placement-${deviceId}`,
        "rear",
        createMockImageData(),
      );
      expect(imageStore.hasImage(`placement-${deviceId}`, "front")).toBe(true);

      // Delete the device
      layoutStore.removeDeviceAtIndexRaw(0);

      // Placement images should be cleaned up
      expect(imageStore.hasImage(`placement-${deviceId}`, "front")).toBe(false);
      expect(imageStore.hasImage(`placement-${deviceId}`, "rear")).toBe(false);
    });

    it("does not affect other devices when one is deleted", () => {
      const layoutStore = getLayoutStore();
      const imageStore = getImageStore();

      layoutStore.addDeviceTypeRaw(
        createTestDeviceType({ slug: "test-server" }),
      );
      layoutStore.placeDeviceRaw(
        createTestDevice({
          id: "device-1",
          device_type: "test-server",
          position: 5,
        }),
      );
      layoutStore.placeDeviceRaw(
        createTestDevice({
          id: "device-2",
          device_type: "test-server",
          position: 10,
        }),
      );

      imageStore.setDeviceImage(
        "placement-device-1",
        "front",
        createMockImageData(),
      );
      imageStore.setDeviceImage(
        "placement-device-2",
        "front",
        createMockImageData(),
      );

      // Delete first device
      layoutStore.removeDeviceAtIndexRaw(0);

      // Device 1's images should be gone
      expect(imageStore.hasImage("placement-device-1", "front")).toBe(false);
      // Device 2's images should remain
      expect(imageStore.hasImage("placement-device-2", "front")).toBe(true);
    });
  });

  describe("sanitizeFilename", () => {
    it("removes path separators", () => {
      expect(sanitizeFilename("path/to/file.png")).not.toContain("/");
      expect(sanitizeFilename("path\\to\\file.png")).not.toContain("\\");
    });

    it("removes parent directory traversal", () => {
      expect(sanitizeFilename("../../../etc/passwd")).not.toContain("..");
      expect(sanitizeFilename("..\\..\\windows\\system32")).not.toContain("..");
    });

    it("removes null bytes", () => {
      expect(sanitizeFilename("file\0.png")).not.toContain("\0");
    });

    it("removes special characters", () => {
      const result = sanitizeFilename('file<>:"|?*.png');
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
      expect(result).not.toContain(":");
      expect(result).not.toContain('"');
      expect(result).not.toContain("|");
      expect(result).not.toContain("?");
      expect(result).not.toContain("*");
    });

    it("removes leading dots", () => {
      expect(sanitizeFilename(".htaccess")).not.toMatch(/^\./);
      expect(sanitizeFilename("...hidden")).not.toMatch(/^\./);
    });

    it("truncates to 255 characters", () => {
      const longName = "a".repeat(300) + ".png";
      expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(255);
    });

    it("preserves valid filenames", () => {
      expect(sanitizeFilename("valid-file_name.png")).toBe(
        "valid-file_name.png",
      );
      expect(sanitizeFilename("image123.webp")).toBe("image123.webp");
    });

    it("returns empty string for empty input", () => {
      expect(sanitizeFilename("")).toBe("");
    });
  });

  describe("Archive - Export Placement Images", () => {
    it("exports placement images to assets/{device-slug}/{deviceId}-{face}.{ext}", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.device_types = [createTestDeviceType({ slug: "my-server" })];
      layout.racks[0].devices = [
        createTestDevice({
          id: "device-abc",
          device_type: "my-server",
          position: 5,
        }),
      ];

      const images: ImageStoreMap = new Map([
        ["placement-device-abc", { front: createMockImageData("front.png") }],
      ]);

      const blob = await createFolderArchive(layout, images);
      const zip = await JSZip.loadAsync(blob);

      // Placement image should be at: assets/{device-slug}/{deviceId}-front.{ext}
      const frontFile = zip.file("test/assets/my-server/device-abc-front.png");
      expect(frontFile).not.toBeNull();
    });

    it("exports both front and rear placement images", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.device_types = [createTestDeviceType({ slug: "my-server" })];
      layout.racks[0].devices = [
        createTestDevice({
          id: "device-123",
          device_type: "my-server",
          position: 5,
        }),
      ];

      const images: ImageStoreMap = new Map([
        [
          "placement-device-123",
          {
            front: createMockImageData("front.png"),
            rear: createMockImageData("rear.png"),
          },
        ],
      ]);

      const blob = await createFolderArchive(layout, images);
      const zip = await JSZip.loadAsync(blob);

      expect(
        zip.file("test/assets/my-server/device-123-front.png"),
      ).not.toBeNull();
      expect(
        zip.file("test/assets/my-server/device-123-rear.png"),
      ).not.toBeNull();
    });

    it("exports both device type and placement images", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.device_types = [createTestDeviceType({ slug: "my-server" })];
      layout.racks[0].devices = [
        createTestDevice({
          id: "device-xyz",
          device_type: "my-server",
          position: 5,
        }),
      ];

      const images: ImageStoreMap = new Map([
        ["my-server", { front: createMockImageData("device-type-front.png") }],
        [
          "placement-device-xyz",
          { front: createMockImageData("placement-front.png") },
        ],
      ]);

      const blob = await createFolderArchive(layout, images);
      const zip = await JSZip.loadAsync(blob);

      // Device type image
      expect(zip.file("test/assets/my-server/front.png")).not.toBeNull();
      // Placement image
      expect(
        zip.file("test/assets/my-server/device-xyz-front.png"),
      ).not.toBeNull();
    });

    it("does not export placement images for devices not in layout", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.device_types = [createTestDeviceType({ slug: "my-server" })];
      layout.racks[0].devices = []; // No devices

      const images: ImageStoreMap = new Map([
        [
          "placement-orphan-device",
          { front: createMockImageData("orphan.png") },
        ],
      ]);

      const blob = await createFolderArchive(layout, images);
      const zip = await JSZip.loadAsync(blob);

      // Should not have any placement images
      const files = Object.keys(zip.files);
      const placementImages = files.filter(
        (f) => f.includes("-front.png") || f.includes("-rear.png"),
      );
      expect(placementImages).toHaveLength(0);
    });
  });

  describe("Archive - Import Placement Images", () => {
    it("imports placement images with correct key format", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.device_types = [createTestDeviceType({ slug: "my-server" })];
      layout.racks[0].devices = [
        createTestDevice({
          id: "device-abc",
          device_type: "my-server",
          position: 5,
        }),
      ];

      const images: ImageStoreMap = new Map([
        ["placement-device-abc", { front: createMockImageData("front.png") }],
      ]);

      // Export and re-import
      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      // Should have placement image with correct key
      expect(result.images.has("placement-device-abc")).toBe(true);
      expect(result.images.get("placement-device-abc")?.front).toBeDefined();
    });

    it("imports both front and rear placement images", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.device_types = [createTestDeviceType({ slug: "my-server" })];
      layout.racks[0].devices = [
        createTestDevice({
          id: "device-123",
          device_type: "my-server",
          position: 5,
        }),
      ];

      const images: ImageStoreMap = new Map([
        [
          "placement-device-123",
          {
            front: createMockImageData("front.png"),
            rear: createMockImageData("rear.png"),
          },
        ],
      ]);

      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      const placementImages = result.images.get("placement-device-123");
      expect(placementImages?.front).toBeDefined();
      expect(placementImages?.rear).toBeDefined();
    });

    it("imports both device type and placement images", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.device_types = [createTestDeviceType({ slug: "my-server" })];
      layout.racks[0].devices = [
        createTestDevice({
          id: "device-xyz",
          device_type: "my-server",
          position: 5,
        }),
      ];

      const images: ImageStoreMap = new Map([
        ["my-server", { front: createMockImageData("device-type.png") }],
        [
          "placement-device-xyz",
          { front: createMockImageData("placement.png") },
        ],
      ]);

      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      // Device type image
      expect(result.images.has("my-server")).toBe(true);
      expect(result.images.get("my-server")?.front).toBeDefined();

      // Placement image
      expect(result.images.has("placement-device-xyz")).toBe(true);
      expect(result.images.get("placement-device-xyz")?.front).toBeDefined();
    });

    it("round-trips multiple placement images", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.device_types = [createTestDeviceType({ slug: "my-server" })];
      layout.racks[0].devices = [
        createTestDevice({
          id: "device-1",
          device_type: "my-server",
          position: 5,
        }),
        createTestDevice({
          id: "device-2",
          device_type: "my-server",
          position: 10,
        }),
        createTestDevice({
          id: "device-3",
          device_type: "my-server",
          position: 15,
        }),
      ];

      const images: ImageStoreMap = new Map([
        ["placement-device-1", { front: createMockImageData("1-front.png") }],
        [
          "placement-device-2",
          {
            front: createMockImageData("2-front.png"),
            rear: createMockImageData("2-rear.png"),
          },
        ],
        ["placement-device-3", { rear: createMockImageData("3-rear.png") }],
      ]);

      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      expect(result.images.has("placement-device-1")).toBe(true);
      expect(result.images.get("placement-device-1")?.front).toBeDefined();

      expect(result.images.has("placement-device-2")).toBe(true);
      expect(result.images.get("placement-device-2")?.front).toBeDefined();
      expect(result.images.get("placement-device-2")?.rear).toBeDefined();

      expect(result.images.has("placement-device-3")).toBe(true);
      expect(result.images.get("placement-device-3")?.rear).toBeDefined();
    });
  });

  describe("Schema Validation", () => {
    it("PlacedDevice schema accepts front_image field", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.device_types = [createTestDeviceType({ slug: "my-server" })];
      layout.racks[0].devices = [
        {
          ...createTestDevice({ id: "device-1", device_type: "my-server" }),
          front_image: "custom-front.png",
        },
      ];

      const images: ImageStoreMap = new Map();
      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      expect(result.layout.racks[0].devices[0]?.front_image).toBe(
        "custom-front.png",
      );
    });

    it("PlacedDevice schema accepts rear_image field", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.device_types = [createTestDeviceType({ slug: "my-server" })];
      layout.racks[0].devices = [
        {
          ...createTestDevice({ id: "device-1", device_type: "my-server" }),
          rear_image: "custom-rear.png",
        },
      ];

      const images: ImageStoreMap = new Map();
      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      expect(result.layout.racks[0].devices[0]?.rear_image).toBe(
        "custom-rear.png",
      );
    });

    it("PlacedDevice schema accepts both image fields", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.device_types = [createTestDeviceType({ slug: "my-server" })];
      layout.racks[0].devices = [
        {
          ...createTestDevice({ id: "device-1", device_type: "my-server" }),
          front_image: "front.png",
          rear_image: "rear.png",
        },
      ];

      const images: ImageStoreMap = new Map();
      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      expect(result.layout.racks[0].devices[0]?.front_image).toBe("front.png");
      expect(result.layout.racks[0].devices[0]?.rear_image).toBe("rear.png");
    });
  });
});
