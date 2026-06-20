/**
 * Asset storage layer tests
 *
 * Focus: the server-side magic-byte sniff inside saveAsset (#2528). The byte
 * sniff is the security authority for the asset write path: the declared
 * Content-Type is advisory and the on-disk extension is derived from the
 * sniffed type, never the header. SVG/GIF/polyglot/mismatch are rejected with
 * nothing written.
 */
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { mkdtemp, mkdir, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Override DATA_DIR before importing storage modules (same pattern as filesystem.test.ts)
const testDir = await mkdtemp(join(tmpdir(), "rackula-assets-test-"));
process.env.DATA_DIR = testDir;

const { saveAsset, getAsset, MAX_SIZE, AssetRejectedError } =
  await import("./assets");

// ============================================================================
// Test fixtures: real magic-byte headers
// ============================================================================

/** PNG signature: 89 50 4E 47 0D 0A 1A 0A, then a tiny body. */
function pngBytes(): ArrayBuffer {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]).buffer;
}

/** JPEG signature: FF D8 FF, then a tiny body. */
function jpegBytes(): ArrayBuffer {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
    .buffer;
}

/** WebP: "RIFF" at 0-3, size, "WEBP" at 8-11, then a tiny body. */
function webpBytes(): ArrayBuffer {
  return Uint8Array.from([
    0x52,
    0x49,
    0x46,
    0x46, // RIFF
    0x1a,
    0x00,
    0x00,
    0x00, // chunk size (arbitrary)
    0x57,
    0x45,
    0x42,
    0x50, // WEBP
    0x56,
    0x50,
    0x38,
    0x20, // VP8 chunk header
  ]).buffer;
}

/** GIF signature: 47 49 46 38 ("GIF8"). Not in the raster allowlist. */
function gifBytes(): ArrayBuffer {
  return Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00])
    .buffer;
}

/** Plain SVG markup. Starts with "<", sniffs to null. */
function svgBytes(): ArrayBuffer {
  return new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
  ).buffer as ArrayBuffer;
}

/** Stored-XSS payload: an SVG event handler. Sniffs to null. */
function svgOnloadBytes(): ArrayBuffer {
  return new TextEncoder().encode('<svg onload="alert(document.domain)">')
    .buffer as ArrayBuffer;
}

/** HTML/JS polyglot served as image/png. Sniffs to null (no PNG header). */
function htmlPolyglotBytes(): ArrayBuffer {
  return new TextEncoder().encode("<!doctype html><script>alert(1)</script>")
    .buffer as ArrayBuffer;
}

// ============================================================================
// Test layout setup
// ============================================================================

const LAYOUT_UUID = "11111111-2222-4333-8444-555555555555";
const DEVICE_SLUG = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/**
 * Create a layout folder so getLayoutAssetsDir resolves. The asset layer
 * resolves the assets dir by scanning for a `{slug}-{uuid}` folder, so a
 * directory is all that is needed; the YAML body is irrelevant here.
 */
async function createLayoutFolder(): Promise<void> {
  await mkdir(join(testDir, `test-layout-${LAYOUT_UUID}`), { recursive: true });
}

async function cleanupTestDir(): Promise<void> {
  const files = await readdir(testDir);
  for (const file of files) {
    await rm(join(testDir, file), { recursive: true, force: true });
  }
}

/** Count files written under the layout's assets dir (across all faces/devices). */
async function countAssetFiles(): Promise<number> {
  const assetsDir = join(testDir, `test-layout-${LAYOUT_UUID}`, "assets");
  let count = 0;
  try {
    const devices = await readdir(assetsDir);
    for (const device of devices) {
      try {
        const files = await readdir(join(assetsDir, device));
        count += files.length;
      } catch {
        // not a directory
      }
    }
  } catch {
    // assets dir never created
  }
  return count;
}

beforeEach(async () => {
  await cleanupTestDir();
  await createLayoutFolder();
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ============================================================================
// Accept: real raster formats whose bytes match the declared type
// ============================================================================

describe("saveAsset accepts raster images that sniff to the declared type", () => {
  it("writes a PNG with a .png extension", async () => {
    await saveAsset(LAYOUT_UUID, DEVICE_SLUG, "front", pngBytes(), "image/png");

    const asset = await getAsset(LAYOUT_UUID, DEVICE_SLUG, "front");
    expect(asset).not.toBeNull();
    expect(asset?.contentType).toBe("image/png");
  });

  it("writes a JPEG with a .jpg extension", async () => {
    await saveAsset(
      LAYOUT_UUID,
      DEVICE_SLUG,
      "front",
      jpegBytes(),
      "image/jpeg",
    );

    const asset = await getAsset(LAYOUT_UUID, DEVICE_SLUG, "front");
    expect(asset?.contentType).toBe("image/jpeg");
  });

  it("writes a WebP with a .webp extension", async () => {
    await saveAsset(
      LAYOUT_UUID,
      DEVICE_SLUG,
      "front",
      webpBytes(),
      "image/webp",
    );

    const asset = await getAsset(LAYOUT_UUID, DEVICE_SLUG, "front");
    expect(asset?.contentType).toBe("image/webp");
  });
});

// ============================================================================
// Extension is derived from the sniffed type, never the declared header
// ============================================================================

describe("on-disk extension comes from the sniffed bytes", () => {
  it("stores PNG bytes as front.png even when nothing else is on disk", async () => {
    await saveAsset(LAYOUT_UUID, DEVICE_SLUG, "front", pngBytes(), "image/png");

    const deviceDir = join(
      testDir,
      `test-layout-${LAYOUT_UUID}`,
      "assets",
      DEVICE_SLUG,
    );
    const files = await readdir(deviceDir);
    expect(files).toContain("front.png");
  });
});

// ============================================================================
// Reject: non-raster, disallowed, mismatched, and polyglot content
// ============================================================================

describe("saveAsset rejects content the bytes do not vouch for", () => {
  it("rejects GIF (recognised header, not in the raster allowlist) and writes nothing", async () => {
    // GIF declared as PNG: declared type passes the allowlist, bytes sniff to
    // null, so the write must be rejected.
    await expect(
      saveAsset(LAYOUT_UUID, DEVICE_SLUG, "front", gifBytes(), "image/png"),
    ).rejects.toThrow(AssetRejectedError);
    expect(await countAssetFiles()).toBe(0);
  });

  it("rejects plain SVG markup declared as image/png and writes nothing", async () => {
    await expect(
      saveAsset(LAYOUT_UUID, DEVICE_SLUG, "front", svgBytes(), "image/png"),
    ).rejects.toThrow(AssetRejectedError);
    expect(await countAssetFiles()).toBe(0);
  });

  it("rejects a stored-XSS <svg onload=...> payload declared as image/png", async () => {
    await expect(
      saveAsset(
        LAYOUT_UUID,
        DEVICE_SLUG,
        "front",
        svgOnloadBytes(),
        "image/png",
      ),
    ).rejects.toThrow(AssetRejectedError);
    expect(await countAssetFiles()).toBe(0);
  });

  it("rejects an HTML/JS polyglot declared as image/png", async () => {
    await expect(
      saveAsset(
        LAYOUT_UUID,
        DEVICE_SLUG,
        "front",
        htmlPolyglotBytes(),
        "image/png",
      ),
    ).rejects.toThrow(AssetRejectedError);
    expect(await countAssetFiles()).toBe(0);
  });

  it("rejects a PNG body declared as image/jpeg (sniff disagrees with header)", async () => {
    await expect(
      saveAsset(LAYOUT_UUID, DEVICE_SLUG, "front", pngBytes(), "image/jpeg"),
    ).rejects.toThrow(AssetRejectedError);
    expect(await countAssetFiles()).toBe(0);
  });

  it("rejects a declared content type outside the allowlist (image/gif)", async () => {
    // A disallowed declared type is caught by the content-type allowlist guard
    // at the top of saveAsset (and at the route) BEFORE the sniff runs, so this
    // throws a plain Error, not an AssetRejectedError. Either way nothing is
    // written.
    await expect(
      saveAsset(LAYOUT_UUID, DEVICE_SLUG, "front", gifBytes(), "image/gif"),
    ).rejects.toThrow();
    expect(await countAssetFiles()).toBe(0);
  });

  it("rejects a truncated PNG that lacks the full 8-byte signature", async () => {
    // Only the first 4 PNG bytes (89 50 4E 47) without the 0D 0A 1A 0A
    // continuation. The full signature is required, so this sniffs to null.
    const partialPng = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x00, 0x01,
    ]).buffer;
    await expect(
      saveAsset(LAYOUT_UUID, DEVICE_SLUG, "front", partialPng, "image/png"),
    ).rejects.toThrow(AssetRejectedError);
    expect(await countAssetFiles()).toBe(0);
  });
});

// ============================================================================
// Size behaviour unchanged: 5MB cap still enforced by saveAsset
// ============================================================================

describe("size cap is unchanged", () => {
  it("rejects bytes over MAX_SIZE even with a valid PNG header", async () => {
    const oversized = new Uint8Array(MAX_SIZE + 1);
    oversized.set([0x89, 0x50, 0x4e, 0x47]); // PNG header
    await expect(
      saveAsset(
        LAYOUT_UUID,
        DEVICE_SLUG,
        "front",
        oversized.buffer,
        "image/png",
      ),
    ).rejects.toThrow(/too large/);
    expect(await countAssetFiles()).toBe(0);
  });

  it("does not write a file when an oversized image is rejected", async () => {
    const oversized = new Uint8Array(MAX_SIZE + 1);
    oversized.set([0x89, 0x50, 0x4e, 0x47]);
    await saveAsset(
      LAYOUT_UUID,
      DEVICE_SLUG,
      "front",
      oversized.buffer,
      "image/png",
    ).catch(() => {});
    const deviceDir = join(
      testDir,
      `test-layout-${LAYOUT_UUID}`,
      "assets",
      DEVICE_SLUG,
    );
    await expect(readFile(join(deviceDir, "front.png"))).rejects.toThrow();
  });
});
