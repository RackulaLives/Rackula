/**
 * Asset route tests.
 *
 * PUT sniff enforcement (#2528): the declared Content-Type passes the route's
 * allowlist check, then saveAsset's magic-byte sniff is the authority. A body
 * that does not sniff to the declared raster type is rejected at the route with
 * a 400 (not a 500), and nothing is written.
 *
 * GET response headers (#2529): a served asset carries
 * X-Content-Type-Options: nosniff so a polyglot upload cannot be MIME-sniffed
 * into active content, and the served Content-Type matches the stored format.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import type { EnvMap } from "../security";

type App = Awaited<ReturnType<typeof createApp>>;

const LAYOUT_UUID = "550e8400-e29b-41d4-a716-446655440000";
const DEVICE_SLUG = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const originalDataDir = process.env.DATA_DIR;
let testDir: string;
let app: App;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "rackula-assets-route-test-"));
  process.env.DATA_DIR = testDir;
  app = await createApp({
    NODE_ENV: "test",
    DATA_DIR: testDir,
    RACKULA_RATE_LIMIT_ENABLED: "false",
  } satisfies EnvMap);

  // Create the layout so the assets dir can resolve on accept-path tests.
  const yamlBody = `version: "1.0.0"\nname: Test\nmetadata:\n  id: "${LAYOUT_UUID}"\n  name: "Test"\n  schema_version: "1.0.0"\nracks: []`;
  const res = await app.request(`/layouts/${LAYOUT_UUID}`, {
    method: "PUT",
    headers: { "Content-Type": "text/yaml" },
    body: yamlBody,
  });
  expect(res.status).toBe(201);
});

afterEach(async () => {
  if (originalDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = originalDataDir;
  }
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures
  }
});

async function putAsset(
  body: ArrayBuffer,
  contentType: string,
): Promise<Response> {
  return app.request(`/assets/${LAYOUT_UUID}/${DEVICE_SLUG}/front`, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
}

async function assetFileCount(): Promise<number> {
  const assetsDir = join(testDir);
  let count = 0;
  // The layout folder is `{slug}-{uuid}`; find it then walk assets/.
  const folders = await readdir(assetsDir);
  const layoutFolder = folders.find((f) => f.endsWith(LAYOUT_UUID));
  if (!layoutFolder) return 0;
  try {
    const devices = await readdir(join(assetsDir, layoutFolder, "assets"));
    for (const device of devices) {
      try {
        const files = await readdir(
          join(assetsDir, layoutFolder, "assets", device),
        );
        count += files.length;
      } catch {
        // not a directory
      }
    }
  } catch {
    // no assets dir
  }
  return count;
}

/** A 12-byte PNG body: full 8-byte signature plus a short tail. */
function pngBytes(): ArrayBuffer {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]).buffer;
}

describe("PUT /assets sniff enforcement", () => {
  it("accepts a real PNG declared as image/png (200)", async () => {
    const res = await putAsset(pngBytes(), "image/png");
    expect(res.status).toBe(200);
    expect(await assetFileCount()).toBe(1);
  });

  it("rejects an <svg onload=...> body declared as image/png with 400 and writes nothing", async () => {
    const svg = new TextEncoder().encode('<svg onload="alert(1)">')
      .buffer as ArrayBuffer;
    const res = await putAsset(svg, "image/png");
    expect(res.status).toBe(400);
    expect(await assetFileCount()).toBe(0);
  });

  it("rejects a PNG body declared as image/jpeg (sniff/header mismatch) with 400", async () => {
    const res = await putAsset(pngBytes(), "image/jpeg");
    expect(res.status).toBe(400);
    expect(await assetFileCount()).toBe(0);
  });

  it("rejects a content type outside the allowlist (image/gif) with 400", async () => {
    const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38]).buffer;
    const res = await putAsset(gif, "image/gif");
    expect(res.status).toBe(400);
    expect(await assetFileCount()).toBe(0);
  });
});

describe("GET /assets response headers", () => {
  it("serves a stored asset with X-Content-Type-Options: nosniff", async () => {
    const putRes = await putAsset(pngBytes(), "image/png");
    expect(putRes.status).toBe(200);

    const res = await app.request(
      `/assets/${LAYOUT_UUID}/${DEVICE_SLUG}/front`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });
});
