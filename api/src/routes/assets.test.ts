/**
 * Asset GET response-header tests (#2529)
 *
 * Covers:
 * - A served asset carries X-Content-Type-Options: nosniff so a polyglot
 *   upload cannot be MIME-sniffed into active content.
 * - The served Content-Type matches the stored raster format.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import type { EnvMap } from "../security";

type App = Awaited<ReturnType<typeof createApp>>;

const LAYOUT_UUID = "550e8400-e29b-41d4-a716-446655440000";
const DEVICE_UUID = "660e8400-e29b-41d4-a716-446655440001";

// Minimal valid 1x1 RGBA PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

const originalDataDir = process.env.DATA_DIR;
let testDir: string;
let app: App;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "rackula-assets-test-"));
  process.env.DATA_DIR = testDir;
  app = await createApp({
    NODE_ENV: "test",
    DATA_DIR: testDir,
    RACKULA_RATE_LIMIT_ENABLED: "false",
  } satisfies EnvMap);
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

async function createLayout(uuid: string): Promise<void> {
  const yaml = `version: "1.0.0"\nname: Test\nracks: []`;
  const res = await app.request(`/layouts/${uuid}`, {
    method: "PUT",
    headers: { "Content-Type": "text/yaml" },
    body: yaml,
  });
  expect(res.status).toBe(201);
}

async function putAsset(): Promise<Response> {
  const bytes = Buffer.from(PNG_BASE64, "base64");
  return app.request(`/assets/${LAYOUT_UUID}/${DEVICE_UUID}/front`, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: bytes,
  });
}

describe("GET /assets response headers", () => {
  it("serves a stored asset with X-Content-Type-Options: nosniff", async () => {
    await createLayout(LAYOUT_UUID);

    const putRes = await putAsset();
    expect(putRes.status).toBe(200);

    const res = await app.request(
      `/assets/${LAYOUT_UUID}/${DEVICE_UUID}/front`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });
});
