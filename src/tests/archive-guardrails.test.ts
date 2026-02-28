import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { extractFolderArchive } from "$lib/utils/archive";

describe("Archive Guardrails", () => {
  it("rejects empty (zero-byte) archives", async () => {
    const emptyBlob = new Blob([], { type: "application/zip" });
    await expect(extractFolderArchive(emptyBlob)).rejects.toThrow(/empty/i);
  });

  it("rejects archives exceeding MAX_ZIP_SIZE_BYTES (50MB)", async () => {
    // Create a tiny zip but lie about its size
    const zip = new JSZip();
    zip.file("test.txt", "small");
    const blob = await zip.generateAsync({ type: "blob" });
    
    // Mock the size property
    Object.defineProperty(blob, "size", { value: 51 * 1024 * 1024 });

    await expect(extractFolderArchive(blob)).rejects.toThrow(/Archive too large/);
  });

  it("rejects archives with too many entries (MAX_ENTRY_COUNT = 500)", async () => {
    const zip = new JSZip();
    // JSZip handles 500 files easily
    for (let i = 0; i <= 501; i++) {
      zip.file(`file${i}.txt`, "content");
    }
    const blob = await zip.generateAsync({ type: "blob" });

    await expect(extractFolderArchive(blob)).rejects.toThrow(/too many files/);
  });

  it("rejects archives with suspicious compression ratio (MAX_COMPRESSION_RATIO = 100)", async () => {
    const zip = new JSZip();
    // 1MB of zeros compresses very well
    const largeContent = "0".repeat(1024 * 1024);
    zip.file("bomb.txt", largeContent);
    zip.file("bomb2.txt", largeContent);
    zip.file("bomb3.txt", largeContent);
    
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    
    // Force a tiny blob size in the check
    Object.defineProperty(blob, "size", { value: 100 }); 

    await expect(extractFolderArchive(blob)).rejects.toThrow(/suspicious compression ratio/);
  });

  it("rejects archives with oversized YAML (MAX_YAML_BYTES = 5MB)", async () => {
    const zip = new JSZip();
    const folderName = "Layout-550e8400-e29b-41d4-a716-446655440000";
    const folder = zip.folder(folderName);
    
    // 6MB YAML content
    const hugeYaml = "name: Huge\n" + "x: ".repeat(3 * 1024 * 1024);
    folder?.file("huge.rackula.yaml", hugeYaml);

    const blob = await zip.generateAsync({ type: "blob" });

    await expect(extractFolderArchive(blob)).rejects.toThrow(/Layout file too large/);
  });
});
