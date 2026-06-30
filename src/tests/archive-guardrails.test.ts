import { describe, it, expect, vi } from "vitest";
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

    await expect(extractFolderArchive(blob)).rejects.toThrow(
      /Archive too large/,
    );
  });

  it("rejects archives with too many entries (MAX_ENTRY_COUNT = 500)", async () => {
    const zip = new JSZip();
    // JSZip handles 500 files easily
    for (let i = 0; i < 501; i++) {
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

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
    });

    // Force a tiny blob size in the check
    Object.defineProperty(blob, "size", { value: 100 });

    await expect(extractFolderArchive(blob)).rejects.toThrow(
      /suspicious compression ratio/,
    );
  });

  it("rejects an oversized entry by streaming it, without buffering the whole entry (#2703)", async () => {
    // A real, tiny archive: one small YAML entry inside a UUID folder.
    const zip = new JSZip();
    const folderName = "Layout-550e8400-e29b-41d4-a716-446655440000";
    zip.folder(folderName)?.file("layout.rackula.yaml", "name: Test\n");
    const blob = await zip.generateAsync({ type: "blob" });

    // Make the size preflight observe an entry whose inflated output blows past
    // MAX_TOTAL_UNCOMPRESSED_BYTES (250MB) WITHOUT allocating that memory in the
    // test. The stub reports oversized chunks by length only, and pauses when
    // asked. It also still exposes accumulate() (the legacy file.async() path)
    // so the test can distinguish the streamed guard, which pauses mid-inflation,
    // from full buffering, which would drain the entry before checking the cap.
    const probe = new JSZip();
    probe.file("probe", "x");
    const entryPrototype = Object.getPrototypeOf(probe.file("probe")!) as {
      internalStream: (type: string) => unknown;
    };

    let pauseCalls = 0;
    let accumulateCalled = false;
    const CHUNK_BYTES = 50 * 1024 * 1024; // 50MB reported per chunk
    const CHUNK_COUNT = 6; // 300MB if fully drained; guard must stop near 250MB

    const spy = vi
      .spyOn(entryPrototype, "internalStream")
      .mockImplementation(() => {
        const handlers: Record<string, ((arg?: unknown) => void)[]> = {};
        let paused = false;
        const stream = {
          on(event: string, handler: (arg?: unknown) => void) {
            (handlers[event] ??= []).push(handler);
            return stream;
          },
          pause() {
            paused = true;
            pauseCalls += 1;
            return stream;
          },
          resume() {
            paused = false;
            for (let i = 0; i < CHUNK_COUNT && !paused; i++) {
              handlers["data"]?.forEach((fn) => fn({ length: CHUNK_BYTES }));
            }
            if (!paused) handlers["end"]?.forEach((fn) => fn());
            return stream;
          },
          // Legacy buffering path (file.async): resolve a lightweight stand-in
          // whose byteLength reports the full size without allocating it.
          accumulate() {
            accumulateCalled = true;
            return Promise.resolve({ byteLength: CHUNK_BYTES * CHUNK_COUNT });
          },
        };
        return stream;
      });

    try {
      await expect(extractFolderArchive(blob)).rejects.toThrow(
        /uncompressed size/i,
      );
      // The guard streamed the entry and paused it mid-inflation once the cap
      // was crossed, rather than draining it through the buffering async() path.
      expect(pauseCalls).toBeGreaterThan(0);
      expect(accumulateCalled).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects archives with oversized YAML (MAX_YAML_BYTES = 5MB)", async () => {
    const zip = new JSZip();
    const folderName = "Layout-550e8400-e29b-41d4-a716-446655440000";
    const folder = zip.folder(folderName);

    // 6MB YAML content
    const hugeYaml = "name: Huge\n" + "x: ".repeat(3 * 1024 * 1024);
    folder?.file("huge.rackula.yaml", hugeYaml);

    const blob = await zip.generateAsync({ type: "blob" });

    await expect(extractFolderArchive(blob)).rejects.toThrow(
      /Layout file too large/,
    );
  });
});
