/**
 * Folder Archive Utilities Tests
 * Tests for v0.2 folder-based ZIP archives
 */

import { describe, it, expect, beforeEach } from "vitest";
import JSZip from "jszip";
import { SvelteMap } from "svelte/reactivity";
import {
  createFolderArchive,
  extractFolderArchive,
  getImageExtension,
  getMimeType,
} from "$lib/utils/archive";
import { getImageStore, resetImageStore } from "$lib/stores/images.svelte";
import type { Layout } from "$lib/types";
import type { ImageStoreMap, ImageData } from "$lib/types/images";

describe("Folder Archive Utilities", () => {
  const createTestLayout = (): Layout => ({
    version: "0.2.0",
    name: "My Homelab",
    racks: [
      {
        id: "rack-1",
        name: "Main Rack",
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
      show_labels_on_images: true,
    },
  });

  const createTestImage = async (
    content: string = "test",
  ): Promise<ImageData> => {
    const blob = new Blob([content], { type: "image/png" });
    const dataUrl = `data:image/png;base64,${btoa(content)}`;
    return {
      blob,
      dataUrl,
      filename: "test.png",
    };
  };

  describe("getImageExtension", () => {
    it("returns png for image/png", () => {
      expect(getImageExtension("image/png")).toBe("png");
    });

    it("returns jpg for image/jpeg", () => {
      expect(getImageExtension("image/jpeg")).toBe("jpg");
    });

    it("returns webp for image/webp", () => {
      expect(getImageExtension("image/webp")).toBe("webp");
    });

    it("returns png for unknown MIME type", () => {
      expect(getImageExtension("unknown/type")).toBe("png");
    });

    it("returns png for empty string", () => {
      expect(getImageExtension("")).toBe("png");
    });
  });

  describe("getMimeType", () => {
    it("returns image/png for .png", () => {
      expect(getMimeType("test.png")).toBe("image/png");
    });

    it("returns image/jpeg for .jpg", () => {
      expect(getMimeType("test.jpg")).toBe("image/jpeg");
    });

    it("returns image/jpeg for .jpeg", () => {
      expect(getMimeType("test.jpeg")).toBe("image/jpeg");
    });

    it("returns image/webp for .webp", () => {
      expect(getMimeType("test.webp")).toBe("image/webp");
    });

    it("returns image/png for unknown extension", () => {
      expect(getMimeType("test.unknown")).toBe("image/png");
    });

    it("returns image/png for no extension", () => {
      expect(getMimeType("test")).toBe("image/png");
    });

    it("handles uppercase extensions", () => {
      expect(getMimeType("test.PNG")).toBe("image/png");
      expect(getMimeType("test.JPG")).toBe("image/jpeg");
    });
  });

  describe("createFolderArchive", () => {
    it("creates a valid ZIP blob", async () => {
      const layout = createTestLayout();
      const images: ImageStoreMap = new Map();

      const blob = await createFolderArchive(layout, images);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("application/zip");
    });

    it("creates ZIP with folder named after layout", async () => {
      const layout = createTestLayout();
      layout.name = "Test Layout";
      const images: ImageStoreMap = new Map();

      const blob = await createFolderArchive(layout, images);
      const zip = await JSZip.loadAsync(blob);

      // Should have a folder named after layout (slugified)
      const folderName = "test-layout";
      const folder = zip.folder(folderName);
      expect(folder).not.toBeNull();
    });

    it("includes YAML file with correct name", async () => {
      const layout = createTestLayout();
      layout.name = "My Homelab";
      const images: ImageStoreMap = new Map();

      const blob = await createFolderArchive(layout, images);
      const zip = await JSZip.loadAsync(blob);

      const yamlFile = zip.file("my-homelab/my-homelab.yaml");
      expect(yamlFile).not.toBeNull();
    });

    it("YAML file contains correct layout data", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      // Schema v1.0.0: Flat structure with colour and category at top level
      layout.device_types = [
        {
          slug: "test-device",
          u_height: 2,
          colour: "#ff0000",
          category: "server",
        },
      ];
      const images: ImageStoreMap = new Map();

      const blob = await createFolderArchive(layout, images);
      const zip = await JSZip.loadAsync(blob);

      const yamlFile = zip.file("test/test.yaml");
      expect(yamlFile).not.toBeNull();

      const yamlContent = await yamlFile!.async("string");
      expect(yamlContent).toContain("version:");
      expect(yamlContent).toContain("name: Test");
      expect(yamlContent).toContain("test-device");
    });

    it("excludes view field from YAML", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.racks[0].view = "rear";
      const images: ImageStoreMap = new Map();

      const blob = await createFolderArchive(layout, images);
      const zip = await JSZip.loadAsync(blob);

      const yamlFile = zip.file("test/test.yaml");
      const yamlContent = await yamlFile!.async("string");
      expect(yamlContent).not.toContain("view:");
    });

    it("creates assets folder when images present", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.device_types = [
        {
          slug: "my-device",
          u_height: 1,
          colour: "#000000",
          category: "server",
        },
      ];

      const frontImage = await createTestImage("front");
      const images: ImageStoreMap = new Map([
        ["my-device", { front: frontImage }],
      ]);

      const blob = await createFolderArchive(layout, images);
      const zip = await JSZip.loadAsync(blob);

      // Check assets folder exists
      const assetsFolder = zip.folder("test/assets");
      expect(assetsFolder).not.toBeNull();
    });

    it("stores images in correct nested structure", async () => {
      const layout = createTestLayout();
      layout.name = "Test";

      const frontImage = await createTestImage("front-content");
      const rearImage = await createTestImage("rear-content");
      const images: ImageStoreMap = new Map([
        ["device-slug", { front: frontImage, rear: rearImage }],
      ]);

      const blob = await createFolderArchive(layout, images);
      const zip = await JSZip.loadAsync(blob);

      const frontFile = zip.file("test/assets/device-slug/front.png");
      const rearFile = zip.file("test/assets/device-slug/rear.png");

      expect(frontFile).not.toBeNull();
      expect(rearFile).not.toBeNull();
    });

    it("handles multiple devices with images", async () => {
      const layout = createTestLayout();
      layout.name = "Test";

      const img1 = await createTestImage("img1");
      const img2 = await createTestImage("img2");
      const images: ImageStoreMap = new Map([
        ["device-a", { front: img1 }],
        ["device-b", { rear: img2 }],
      ]);

      const blob = await createFolderArchive(layout, images);
      const zip = await JSZip.loadAsync(blob);

      expect(zip.file("test/assets/device-a/front.png")).not.toBeNull();
      expect(zip.file("test/assets/device-b/rear.png")).not.toBeNull();
    });

    it("sanitizes folder name with special characters", async () => {
      const layout = createTestLayout();
      layout.name = "My Layout!@#$%";
      const images: ImageStoreMap = new Map();

      const blob = await createFolderArchive(layout, images);
      const zip = await JSZip.loadAsync(blob);

      // Should use slugified name
      const yamlFile = zip.file("my-layout/my-layout.yaml");
      expect(yamlFile).not.toBeNull();
    });
  });

  describe("extractFolderArchive", () => {
    it("extracts layout from valid ZIP", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      const images: ImageStoreMap = new Map();

      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      expect(result.layout.name).toBe("Test");
      expect(result.layout.version).toBe("0.2.0");
    });

    it("adds default view: front", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      const images: ImageStoreMap = new Map();

      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      expect(result.layout.racks[0].view).toBe("front");
    });

    it("extracts images correctly", async () => {
      const layout = createTestLayout();
      layout.name = "Test";

      const frontImage = await createTestImage("front-data");
      const images: ImageStoreMap = new Map([
        ["my-device", { front: frontImage }],
      ]);

      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      expect(result.images.has("my-device")).toBe(true);
      expect(result.images.get("my-device")?.front).toBeDefined();
    });

    it("maps images to correct device slugs", async () => {
      const layout = createTestLayout();
      layout.name = "Test";

      const img1 = await createTestImage("1");
      const img2 = await createTestImage("2");
      const images: ImageStoreMap = new Map([
        ["device-one", { front: img1 }],
        ["device-two", { rear: img2 }],
      ]);

      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      expect(result.images.get("device-one")?.front).toBeDefined();
      expect(result.images.get("device-two")?.rear).toBeDefined();
    });

    it("extracts both front and rear images", async () => {
      const layout = createTestLayout();
      layout.name = "Test";

      const frontImage = await createTestImage("front");
      const rearImage = await createTestImage("rear");
      const images: ImageStoreMap = new Map([
        ["my-device", { front: frontImage, rear: rearImage }],
      ]);

      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      const deviceImages = result.images.get("my-device");
      expect(deviceImages?.front).toBeDefined();
      expect(deviceImages?.rear).toBeDefined();
    });

    it("throws on missing YAML file", async () => {
      const zip = new JSZip();
      zip.folder("test");
      const blob = await zip.generateAsync({ type: "blob" });

      await expect(extractFolderArchive(blob)).rejects.toThrow("YAML");
    });

    it("throws on invalid YAML content", async () => {
      const zip = new JSZip();
      const folder = zip.folder("test");
      folder?.file("test.yaml", "not: valid: yaml: content: {broken");

      const blob = await zip.generateAsync({ type: "blob" });

      await expect(extractFolderArchive(blob)).rejects.toThrow();
    });

    it("throws on schema validation failure", async () => {
      const zip = new JSZip();
      const folder = zip.folder("test");
      folder?.file(
        "test.yaml",
        `
version: "0.2.0"
name: ""
rack:
  name: Test
  height: 0
  width: 15
  desc_units: false
  form_factor: invalid
  starting_unit: 1
  position: 0
  devices: []
device_types: []
settings:
  display_mode: label
  show_labels_on_images: true
`,
      );

      const blob = await zip.generateAsync({ type: "blob" });

      await expect(extractFolderArchive(blob)).rejects.toThrow();
    });
  });

  describe("round-trip", () => {
    it("preserves layout data through create and extract", async () => {
      const layout = createTestLayout();
      layout.name = "Round Trip Test";
      // Schema v1.0.0: Flat structure with colour and category at top level
      layout.device_types = [
        {
          slug: "test-server",
          u_height: 2,
          manufacturer: "Dell",
          model: "R740",
          colour: "#3b82f6",
          category: "server",
        },
      ];
      // Schema v1.0.0: PlacedDevice requires id
      layout.racks[0].devices = [
        {
          id: "device-1",
          device_type: "test-server",
          position: 5,
          face: "front",
        },
      ];
      const images: ImageStoreMap = new Map();

      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      expect(result.layout.name).toBe("Round Trip Test");
      expect(result.layout.device_types).toHaveLength(1);
      expect(result.layout.device_types[0]!.slug).toBe("test-server");
      expect(result.layout.racks[0].devices).toHaveLength(1);
    });

    it("preserves images through create and extract", async () => {
      const layout = createTestLayout();
      layout.name = "Test";

      const frontImage = await createTestImage("front-content");
      const rearImage = await createTestImage("rear-content");
      const images: ImageStoreMap = new Map([
        ["my-device", { front: frontImage, rear: rearImage }],
      ]);

      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      const deviceImages = result.images.get("my-device");
      expect(deviceImages?.front).toBeDefined();
      expect(deviceImages?.rear).toBeDefined();
      expect(deviceImages?.front?.blob).toBeInstanceOf(Blob);
      expect(deviceImages?.rear?.blob).toBeInstanceOf(Blob);
    });

    it("preserves settings through create and extract", async () => {
      const layout = createTestLayout();
      layout.name = "Test";
      layout.settings = {
        display_mode: "image",
        show_labels_on_images: false,
      };
      const images: ImageStoreMap = new Map();

      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      expect(result.layout.settings.display_mode).toBe("image");
      expect(result.layout.settings.show_labels_on_images).toBe(false);
    });

    it("preserves multiple device images", async () => {
      const layout = createTestLayout();
      layout.name = "Test";

      const images: ImageStoreMap = new Map([
        ["device-a", { front: await createTestImage("a-front") }],
        [
          "device-b",
          {
            front: await createTestImage("b-front"),
            rear: await createTestImage("b-rear"),
          },
        ],
        ["device-c", { rear: await createTestImage("c-rear") }],
      ]);

      const blob = await createFolderArchive(layout, images);
      const result = await extractFolderArchive(blob);

      expect(result.images.size).toBe(3);
      expect(result.images.get("device-a")?.front).toBeDefined();
      expect(result.images.get("device-b")?.front).toBeDefined();
      expect(result.images.get("device-b")?.rear).toBeDefined();
      expect(result.images.get("device-c")?.rear).toBeDefined();
    });
  });

  describe("Integration with Image Store", () => {
    beforeEach(() => {
      resetImageStore();
    });

    it("works with SvelteMap from getUserImages()", async () => {
      const layout = createTestLayout();
      layout.name = "Test";

      // Simulate the real flow: store sets images, then getUserImages is called
      const store = getImageStore();
      const frontImage = await createTestImage("user-front");
      store.setDeviceImage("my-device", "front", frontImage);

      // getUserImages returns a SvelteMap, not a regular Map
      const userImages = store.getUserImages();

      // This should work - SvelteMap extends Map
      const blob = await createFolderArchive(layout, userImages);
      const zip = await JSZip.loadAsync(blob);

      // Verify the image is in the archive
      const frontFile = zip.file("test/assets/my-device/front.png");
      expect(frontFile).not.toBeNull();
    });

    it("correctly excludes bundled images from archive", async () => {
      const layout = createTestLayout();
      layout.name = "Test";

      const store = getImageStore();

      // Add a bundled image (should NOT be saved)
      store.setDeviceImage("bundled-device", "front", {
        url: "/assets/bundled.webp",
        filename: "bundled.webp",
        isBundled: true,
      });

      // Add a user image (should be saved)
      const userImage = await createTestImage("user-content");
      store.setDeviceImage("user-device", "front", userImage);

      const userImages = store.getUserImages();
      const blob = await createFolderArchive(layout, userImages);
      const zip = await JSZip.loadAsync(blob);

      // User image should exist
      const userFile = zip.file("test/assets/user-device/front.png");
      expect(userFile).not.toBeNull();

      // Bundled image should NOT exist
      const bundledFile = zip.file("test/assets/bundled-device/front.webp");
      expect(bundledFile).toBeNull();
    });

    it("round-trips user images through save and load", async () => {
      const layout = createTestLayout();
      layout.name = "Test";

      const store = getImageStore();
      const frontImage = await createTestImage("original-content");
      const rearImage = await createTestImage("rear-content");
      store.setDeviceImage("my-server", "front", frontImage);
      store.setDeviceImage("my-server", "rear", rearImage);

      // Save
      const userImages = store.getUserImages();
      const blob = await createFolderArchive(layout, userImages);

      // Load
      const result = await extractFolderArchive(blob);

      // Verify images were restored
      expect(result.images.has("my-server")).toBe(true);
      expect(result.images.get("my-server")?.front?.blob).toBeInstanceOf(Blob);
      expect(result.images.get("my-server")?.rear?.blob).toBeInstanceOf(Blob);
    });

    describe("graceful image loading failure handling", () => {
      it("returns failedImages array when blob conversion fails", async () => {
        const layout = createTestLayout();
        // Schema v1.0.0: Flat structure
        layout.device_types = [
          {
            slug: "test-device",
            model: "Test Device",
            manufacturer: "Test",
            u_height: 2,
            is_full_depth: true,
            colour: "#666666",
            category: "server",
          },
        ];
        layout.racks[0].devices = [
          {
            id: "device-1",
            device_type: "test-device",
            position: 1,
            face: "front",
          },
        ];

        // Create archive with valid image
        const images: ImageStoreMap = new SvelteMap();
        const testImage = await createTestImage("test-content");
        images.set("test-device", { front: testImage });

        const blob = await createFolderArchive(layout, images);
        const result = await extractFolderArchive(blob);

        // Should have failedImages property (empty array for successful load)
        expect(result).toHaveProperty("failedImages");
        expect(Array.isArray(result.failedImages)).toBe(true);
      });

      it("continues loading other images when one fails", async () => {
        const layout = createTestLayout();
        // Schema v1.0.0: Flat structure
        layout.device_types = [
          {
            slug: "device-a",
            model: "Device A",
            manufacturer: "Test",
            u_height: 1,
            is_full_depth: true,
            colour: "#666666",
            category: "server",
          },
          {
            slug: "device-b",
            model: "Device B",
            manufacturer: "Test",
            u_height: 1,
            is_full_depth: true,
            colour: "#666666",
            category: "server",
          },
        ];

        // Create archive with two devices
        const images: ImageStoreMap = new SvelteMap();
        const imageA = await createTestImage("content-a");
        const imageB = await createTestImage("content-b");
        images.set("device-a", { front: imageA });
        images.set("device-b", { front: imageB });

        const blob = await createFolderArchive(layout, images);
        const result = await extractFolderArchive(blob);

        // Both images should be loaded when no failures
        expect(result.images.has("device-a")).toBe(true);
        expect(result.images.has("device-b")).toBe(true);
        expect(result.failedImages).toHaveLength(0);
      });

      it("does not throw when image blob is corrupted", async () => {
        const zip = new JSZip();
        const folder = zip.folder("test-layout");

        // Add valid YAML with flat structure (schema v1.0.0)
        const yamlContent = `version: "1.0.0"
name: Test Layout
racks:
  - id: rack-1
    name: Test Rack
    height: 42
    width: 19
    desc_units: false
    form_factor: 4-post-cabinet
    starting_unit: 1
    position: 0
    devices: []
device_types:
  - slug: corrupt-device
    model: Corrupt Device
    manufacturer: Test
    u_height: 1
    is_full_depth: true
    colour: "#666666"
    category: server
settings:
  display_mode: label
  show_labels_on_images: true`;
        folder?.file("test-layout.yaml", yamlContent);

        // Add "image" that's actually empty/corrupted data
        const assetsFolder = folder?.folder("assets");
        const deviceFolder = assetsFolder?.folder("corrupt-device");
        deviceFolder?.file("front.png", new Blob([], { type: "image/png" }));

        const blob = await zip.generateAsync({ type: "blob" });

        // Should NOT throw - should gracefully handle
        const result = await extractFolderArchive(blob);
        expect(result.layout).toBeDefined();
        expect(result.images).toBeDefined();
      });
    });
  });
});
