/**
 * Archive Format Detection Tests
 *
 * Tests the extractFolderArchive function which supports both:
 * - New folder structure (#919): {Name}-{UUID}/{slug}.rackula.yaml
 * - Old flat structure: {name}.yaml at root
 */
import { describe, it, expect, beforeEach } from "vitest";
import JSZip from "jszip";
import { extractFolderArchive } from "$lib/utils/archive";
import { serializeLayoutToYaml } from "$lib/utils/yaml";
import { createTestLayout, createTestRack } from "./factories";
import { MAX_IMAGE_SIZE_BYTES } from "$lib/types/constants";

// Create a valid layout YAML using factories
let SAMPLE_LAYOUT_YAML: string;

beforeEach(async () => {
  const layout = createTestLayout({
    name: "Test Layout",
    racks: [createTestRack({ id: "rack-1", name: "Test Rack" })],
  });
  SAMPLE_LAYOUT_YAML = await serializeLayoutToYaml(layout);
});

describe("extractFolderArchive", () => {
  describe("new folder-structure format (#919)", () => {
    it("extracts from folder with UUID and .rackula.yaml", async () => {
      const zip = new JSZip();
      const folder = zip.folder(
        "My Layout-550e8400-e29b-41d4-a716-446655440000",
      );
      folder?.file("my-layout.rackula.yaml", SAMPLE_LAYOUT_YAML);

      const blob = await zip.generateAsync({ type: "blob" });
      const result = await extractFolderArchive(blob);

      expect(result.layout.name).toBe("Test Layout");
      expect(result.failedImages).toEqual([]);
    });

    it("extracts images from assets folder", async () => {
      const zip = new JSZip();
      const folderName = "My Layout-550e8400-e29b-41d4-a716-446655440000";
      const folder = zip.folder(folderName);
      folder?.file("my-layout.rackula.yaml", SAMPLE_LAYOUT_YAML);

      // Add a test image
      const assetsFolder = folder?.folder("assets")?.folder("test-device");
      // Create a 1x1 transparent PNG
      const pngData = new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0,
        1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65,
        84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73,
        69, 78, 68, 174, 66, 96, 130,
      ]);
      assetsFolder?.file("front.png", pngData);

      const blob = await zip.generateAsync({ type: "blob" });
      const result = await extractFolderArchive(blob);

      expect(result.layout.name).toBe("Test Layout");
      expect(result.images.has("test-device")).toBe(true);
      expect(result.images.get("test-device")?.front).toBeDefined();
    });
  });

  describe("old flat format (backwards compatibility)", () => {
    it("extracts from flat .yaml at root", async () => {
      const zip = new JSZip();
      zip.file("my-layout.yaml", SAMPLE_LAYOUT_YAML);

      const blob = await zip.generateAsync({ type: "blob" });
      const result = await extractFolderArchive(blob);

      expect(result.layout.name).toBe("Test Layout");
      expect(result.failedImages).toEqual([]);
    });

    it("extracts from flat .yml at root", async () => {
      const zip = new JSZip();
      zip.file("my-layout.yml", SAMPLE_LAYOUT_YAML);

      const blob = await zip.generateAsync({ type: "blob" });
      const result = await extractFolderArchive(blob);

      expect(result.layout.name).toBe("Test Layout");
    });

    it("extracts images from images/ folder", async () => {
      const zip = new JSZip();
      zip.file("layout.yaml", SAMPLE_LAYOUT_YAML);

      // Add a test image in old format
      const imagesFolder = zip.folder("images")?.folder("test-device");
      const pngData = new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0,
        1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65,
        84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73,
        69, 78, 68, 174, 66, 96, 130,
      ]);
      imagesFolder?.file("front.png", pngData);

      const blob = await zip.generateAsync({ type: "blob" });
      const result = await extractFolderArchive(blob);

      expect(result.layout.name).toBe("Test Layout");
      expect(result.images.has("test-device")).toBe(true);
    });
  });

  describe("error handling", () => {
    it("throws on invalid archive with no YAML", async () => {
      const zip = new JSZip();
      zip.file("readme.txt", "Not a layout file");

      const blob = await zip.generateAsync({ type: "blob" });

      await expect(extractFolderArchive(blob)).rejects.toThrow(
        "No valid layout file found",
      );
    });

    it("throws on empty archive", async () => {
      const zip = new JSZip();
      const blob = await zip.generateAsync({ type: "blob" });

      await expect(extractFolderArchive(blob)).rejects.toThrow(
        "No valid layout file found",
      );
    });
  });

  describe("image validation (magic bytes + size cap, #2933)", () => {
    it("rejects a ZIP-extracted image whose bytes don't match its extension", async () => {
      const zip = new JSZip();
      const folderName = "My Layout-550e8400-e29b-41d4-a716-446655440000";
      const folder = zip.folder(folderName);
      folder?.file("my-layout.rackula.yaml", SAMPLE_LAYOUT_YAML);

      // Extension claims PNG; content is SVG text. Extension/blob-type alone
      // would accept this, but magic-byte sniffing must catch the mismatch.
      const assetsFolder = folder?.folder("assets")?.folder("test-device");
      const svgBytes = new TextEncoder().encode(
        "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
      );
      assetsFolder?.file("front.png", svgBytes);

      const blob = await zip.generateAsync({ type: "blob" });
      const result = await extractFolderArchive(blob);

      expect(result.layout.name).toBe("Test Layout");
      expect(result.images.has("test-device")).toBe(false);
      expect(result.failedImages).toContain(
        `${folderName}/assets/test-device/front.png`,
      );
    });

    it("rejects a ZIP-extracted image exceeding the per-image size cap", async () => {
      const zip = new JSZip();
      const folderName = "My Layout-550e8400-e29b-41d4-a716-446655440000";
      const folder = zip.folder(folderName);
      folder?.file("my-layout.rackula.yaml", SAMPLE_LAYOUT_YAML);

      // Real PNG header, but the total size pushes past MAX_IMAGE_SIZE_BYTES.
      const assetsFolder = folder?.folder("assets")?.folder("test-device");
      const oversizedPng = new Uint8Array(MAX_IMAGE_SIZE_BYTES + 1024);
      oversizedPng.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
      assetsFolder?.file("front.png", oversizedPng);

      const blob = await zip.generateAsync({ type: "blob" });
      const result = await extractFolderArchive(blob);

      expect(result.images.has("test-device")).toBe(false);
      expect(result.failedImages).toContain(
        `${folderName}/assets/test-device/front.png`,
      );
    });

    it("excludes .svg and .gif entries entirely, even with valid magic bytes", async () => {
      const zip = new JSZip();
      const folderName = "My Layout-550e8400-e29b-41d4-a716-446655440000";
      const folder = zip.folder(folderName);
      folder?.file("my-layout.rackula.yaml", SAMPLE_LAYOUT_YAML);

      const assetsFolder = folder?.folder("assets")?.folder("test-device");
      assetsFolder?.file(
        "front.svg",
        "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
      );
      // Real GIF magic bytes ("GIF89a"), still must be excluded by extension.
      assetsFolder?.file(
        "rear.gif",
        new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
      );

      const blob = await zip.generateAsync({ type: "blob" });
      const result = await extractFolderArchive(blob);

      expect(result.images.has("test-device")).toBe(false);
      expect(result.failedImages).toEqual([]);
    });
  });

  describe("format precedence", () => {
    it("prefers new folder format when both exist", async () => {
      // Create two different layouts
      const oldLayout = createTestLayout({ name: "Old Layout" });
      const newLayout = createTestLayout({ name: "New Layout" });
      const oldYaml = await serializeLayoutToYaml(oldLayout);
      const newYaml = await serializeLayoutToYaml(newLayout);

      const zip = new JSZip();

      // Add old format at root
      zip.file("old-layout.yaml", oldYaml);

      // Add new format in folder
      const folder = zip.folder(
        "New Layout-550e8400-e29b-41d4-a716-446655440000",
      );
      folder?.file("new-layout.rackula.yaml", newYaml);

      const blob = await zip.generateAsync({ type: "blob" });
      const result = await extractFolderArchive(blob);

      // Should prefer the new folder format
      expect(result.layout.name).toBe("New Layout");
    });
  });
});
