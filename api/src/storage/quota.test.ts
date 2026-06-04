import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLayoutQuota, checkAssetQuota } from "./quota";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "rackula-quota-test-"));
});

afterEach(async () => {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures
  }
});

describe("checkLayoutQuota", () => {
  it("returns allowed when under the limit", async () => {
    const result = await checkLayoutQuota(testDir, 5);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
    expect(result.max).toBe(5);
  });

  it("returns denied when at the limit", async () => {
    await mkdir(join(testDir, "Layout-a1b2c3d4-e5f6-7890-abcd-ef1234567890"));
    await mkdir(join(testDir, "Layout-b2c3d4e5-f6a7-8901-bcde-f12345678901"));
    await mkdir(join(testDir, "Layout-c3d4e5f6-a7b8-9012-cdef-123456789012"));

    const result = await checkLayoutQuota(testDir, 3);
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(3);
    expect(result.max).toBe(3);
  });

  it("returns allowed when unlimited (max=0)", async () => {
    await mkdir(join(testDir, "Layout-a1b2c3d4-e5f6-7890-abcd-ef1234567890"));

    const result = await checkLayoutQuota(testDir, 0);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
    expect(result.max).toBe(0);
  });

  it("counts legacy flat YAML files", async () => {
    await writeFile(
      join(testDir, "old-layout.yaml"),
      "name: Old Layout\nversion: '1'",
    );
    await writeFile(
      join(testDir, "another-layout.yml"),
      "name: Another Layout\nversion: '1'",
    );

    const result = await checkLayoutQuota(testDir, 5);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(2);
  });

  it("counts both UUID directories and legacy flat files together", async () => {
    await mkdir(join(testDir, "Layout-a1b2c3d4-e5f6-7890-abcd-ef1234567890"));
    await writeFile(
      join(testDir, "old-layout.yaml"),
      "name: Old Layout\nversion: '1'",
    );

    const result = await checkLayoutQuota(testDir, 5);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(2);
  });

  it("ignores directories without UUID suffixes", async () => {
    await mkdir(join(testDir, "not-a-layout"));

    const result = await checkLayoutQuota(testDir, 5);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
  });

  it("returns allowed when one below limit", async () => {
    await mkdir(join(testDir, "Layout-a1b2c3d4-e5f6-7890-abcd-ef1234567890"));
    await mkdir(join(testDir, "Layout-b2c3d4e5-f6a7-8901-bcde-f12345678901"));

    const result = await checkLayoutQuota(testDir, 3);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(2);
    expect(result.max).toBe(3);
  });

  it("propagates non-ENOENT errors (does not fail open)", async () => {
    // Only ENOENT (directory not found) should allow writes.
    // All other errors (permission, I/O, etc.) must propagate.
    // /dev/null/subdir throws ENOTDIR, not ENOENT, so it should propagate.
    await expect(checkLayoutQuota("/dev/null/subdir", 5)).rejects.toThrow();
  });
});

describe("checkAssetQuota", () => {
  it("returns allowed when under the limit", async () => {
    const result = await checkAssetQuota(testDir, 10);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
    expect(result.max).toBe(10);
  });

  it("returns denied when at the limit", async () => {
    const assetsDir = join(testDir, "assets", "dell-r640");
    await mkdir(assetsDir, { recursive: true });
    await writeFile(join(assetsDir, "front.png"), "fake");
    await writeFile(join(assetsDir, "rear.png"), "fake");

    const result = await checkAssetQuota(testDir, 2);
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(2);
    expect(result.max).toBe(2);
  });

  it("returns allowed when unlimited (max=0)", async () => {
    const assetsDir = join(testDir, "assets", "dell-r640");
    await mkdir(assetsDir, { recursive: true });
    await writeFile(join(assetsDir, "front.png"), "fake");

    const result = await checkAssetQuota(testDir, 0);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
    expect(result.max).toBe(0);
  });

  it("counts image files across multiple device directories", async () => {
    const dir1 = join(testDir, "assets", "dell-r640");
    const dir2 = join(testDir, "assets", "hp-dl380");
    await mkdir(dir1, { recursive: true });
    await mkdir(dir2, { recursive: true });
    await writeFile(join(dir1, "front.png"), "fake");
    await writeFile(join(dir1, "rear.png"), "fake");
    await writeFile(join(dir2, "front.webp"), "fake");

    const result = await checkAssetQuota(testDir, 10);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(3);
  });

  it("ignores non-image files", async () => {
    const assetsDir = join(testDir, "assets", "dell-r640");
    await mkdir(assetsDir, { recursive: true });
    await writeFile(join(assetsDir, "front.png"), "fake");
    await writeFile(join(assetsDir, "side.jpeg"), "fake");
    await writeFile(join(assetsDir, "notes.txt"), "not an image");
    await writeFile(join(assetsDir, ".DS_Store"), "macOS junk");

    const result = await checkAssetQuota(testDir, 10);
    expect(result.current).toBe(2);
  });

  it("returns allowed when one below limit", async () => {
    const assetsDir = join(testDir, "assets", "dell-r640");
    await mkdir(assetsDir, { recursive: true });
    await writeFile(join(assetsDir, "front.png"), "fake");
    await writeFile(join(assetsDir, "rear.png"), "fake");

    const result = await checkAssetQuota(testDir, 3);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(2);
  });

  it("propagates non-ENOENT errors (does not fail open)", async () => {
    // Same principle as checkLayoutQuota: non-ENOENT errors must propagate.
    // /dev/null throws ENOTDIR, not ENOENT.
    await expect(checkAssetQuota("/dev/null", 5)).rejects.toThrow();
  });
});
