/**
 * PUT /layouts/:uuid UUID-mismatch guard tests (#2067)
 *
 * Covers:
 * - Normal metadata.id matching URL uuid (accepted)
 * - metadata.id differing from URL uuid (rejected 400)
 * - Circular-anchor YAML bypassing JSON.stringify guard (rejected 400)
 * - Invalid YAML (rejected 400, not silently skipped)
 * - Body without metadata (accepted, no guard applies)
 * - Save target derives from URL uuid, not metadata.id
 *
 * PUT /layouts/:uuid schema validation tests (#2449)
 *
 * Covers defense-in-depth schema validation before persisting:
 * - A device missing its required structural fields is rejected 400
 *   (the prior minimal schema accepted any object as a device)
 * - A structurally valid prior-release layout still saves unchanged
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import type { EnvMap } from "../security";
import type { StorageDriver } from "../storage/driver";

type App = Awaited<ReturnType<typeof createApp>>;

const URL_UUID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_UUID = "660e8400-e29b-41d4-a716-446655440001";

const originalDataDir = process.env.DATA_DIR;
let testDir: string;
let app: App;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "rackula-layouts-test-"));
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

function layoutYaml(name: string, metadataId?: string): string {
  const metadata = metadataId
    ? `\nmetadata:\n  id: "${metadataId}"\n  name: "${name}"\n  schema_version: "1.0.0"`
    : "";
  return `version: "1.0.0"\nname: ${name}${metadata}\nracks: []`;
}

async function putLayout(uuid: string, body: string): Promise<Response> {
  return app.request(`/layouts/${uuid}`, {
    method: "PUT",
    headers: { "Content-Type": "text/yaml" },
    body,
  });
}

describe("PUT /layouts/:uuid UUID-mismatch guard", () => {
  it("accepts a layout where metadata.id matches URL uuid", async () => {
    const res = await putLayout(URL_UUID, layoutYaml("Test", URL_UUID));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe(URL_UUID);
  });

  it("rejects a layout where metadata.id differs from URL uuid", async () => {
    const res = await putLayout(URL_UUID, layoutYaml("Test", OTHER_UUID));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("UUID mismatch");
    expect(data.error).toContain(URL_UUID);
    expect(data.error).toContain(OTHER_UUID);
  });

  it("rejects circular-anchor YAML that would bypass JSON.stringify guard", async () => {
    // Self-referential YAML anchor: the metadata object anchors itself with
    // &meta and references itself via *meta, creating a circular JS object.
    // Previously, JSON.stringify threw on this, the empty catch swallowed it,
    // and the UUID-mismatch guard was silently bypassed (#2067).
    // Using matching metadata.id so the UUID-mismatch guard alone would NOT
    // reject this — only the circular-reference guard catches it.
    const circularYaml = [
      'version: "1.0.0"',
      "name: Circular",
      "metadata: &meta",
      '  id: "550e8400-e29b-41d4-a716-446655440000"',
      "  name: Circular",
      '  schema_version: "1.0.0"',
      "  selfref: *meta",
      "racks: []",
    ].join("\n");

    const res = await putLayout(URL_UUID, circularYaml);
    // The circular-reference guard must fire; UUID-mismatch would not catch
    // this because metadata.id matches the URL uuid.
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("circular references");
  });

  it("rejects invalid YAML with 400, not silently skipping", async () => {
    const res = await putLayout(URL_UUID, "}}invalid yaml{{{");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid YAML");
  });

  it("accepts a layout without metadata section", async () => {
    const res = await putLayout(URL_UUID, layoutYaml("No Metadata"));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe(URL_UUID);
  });
});

describe("PUT /layouts/:uuid save target derives from URL uuid", () => {
  it("saves layout under the URL uuid, not the metadata.id", async () => {
    // Even when metadata.id matches, the URL uuid should be authoritative
    const res = await putLayout(URL_UUID, layoutYaml("Test", URL_UUID));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe(URL_UUID);
  });

  it("does not create a layout folder under a mismatched metadata.id", async () => {
    // PUT with a mismatched metadata.id must be rejected before saveLayout
    const res = await putLayout(URL_UUID, layoutYaml("Test", OTHER_UUID));
    expect(res.status).toBe(400);

    // Verify no folder was created for either UUID
    const entries = await readdir(testDir);
    const otherFolder = entries.find((e) =>
      e.toLowerCase().includes(OTHER_UUID.toLowerCase()),
    );
    expect(otherFolder).toBeUndefined();
  });
});

describe("PUT /layouts/:uuid schema validation (#2449)", () => {
  it("rejects a layout whose device is missing required fields", async () => {
    // The device object has no id/device_type/position/face. The prior minimal
    // schema typed devices as z.unknown() and accepted this, persisting a body
    // that only fails later in the frontend load.
    const body = [
      'version: "1.0.0"',
      "name: Garbage Device",
      "racks:",
      "  - devices:",
      "      - notadevice: true",
    ].join("\n");

    const res = await putLayout(URL_UUID, body);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid layout");

    // The malformed body must not have been written to disk.
    const entries = await readdir(testDir);
    expect(
      entries.find((e) => e.toLowerCase().includes(URL_UUID.toLowerCase())),
    ).toBeUndefined();
  });

  it("accepts a structurally valid prior-release layout", async () => {
    // Shape mirrors src/tests/fixtures/upgrade-corpus: a device carries
    // id/device_type/position/face plus a legacy passthrough field. Valid
    // layouts must continue to save unchanged.
    const body = [
      'version: "1.0"',
      "name: Representative Lab",
      "racks:",
      '  - id: "rack-a"',
      "    devices:",
      '      - id: "dev-switch"',
      '        device_type: "switch-1u"',
      "        position: 240",
      '        face: "front"',
      '        slot_position: "left"',
    ].join("\n");

    const res = await putLayout(URL_UUID, body);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe(URL_UUID);
  });
});

describe("createApp storage driver injection (#2624)", () => {
  it("routes resolve the storage driver provided via deps, not the filesystem", async () => {
    // A stub driver records which methods the routes call and returns a
    // sentinel updatedAt. If the routes still imported the filesystem free
    // functions directly, this driver would be ignored and the sentinel would
    // never surface — so the assertions below prove the per-request seam.
    const calls: string[] = [];
    const sentinelUpdatedAt = "2030-01-01T00:00:00.000Z";
    const stub: StorageDriver = {
      async listLayouts() {
        calls.push("listLayouts");
        return [];
      },
      async getLayout() {
        calls.push("getLayout");
        return null;
      },
      async saveLayout() {
        calls.push("saveLayout");
        return { id: URL_UUID, isNew: true, updatedAt: sentinelUpdatedAt };
      },
      async deleteLayout() {
        calls.push("deleteLayout");
        return false;
      },
      async listSnapshots() {
        calls.push("listSnapshots");
        return null;
      },
      async getSnapshot() {
        calls.push("getSnapshot");
        return null;
      },
      async saveSnapshot() {
        calls.push("saveSnapshot");
        return null;
      },
      async getPreCarrierBackup() {
        calls.push("getPreCarrierBackup");
        return null;
      },
    };

    const stubApp = await createApp(
      {
        NODE_ENV: "test",
        DATA_DIR: testDir,
        RACKULA_RATE_LIMIT_ENABLED: "false",
      } satisfies EnvMap,
      { storage: stub },
    );

    // Exercise every layout route so each one is proven to resolve the driver
    // from context. A route reverting to a direct filesystem import (the bypass
    // class this seam removes) would not record a call on the stub.
    const snapshotFilename = "injected~20260101-000000.yaml";
    await stubApp.request("/layouts");
    await stubApp.request(`/layouts/${URL_UUID}`);
    const putRes = await stubApp.request(`/layouts/${URL_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "text/yaml" },
      body: layoutYaml("Injected", URL_UUID),
    });
    await stubApp.request(`/layouts/${URL_UUID}`, { method: "DELETE" });
    await stubApp.request(`/layouts/${URL_UUID}/snapshots`);
    await stubApp.request(`/layouts/${URL_UUID}/snapshots/${snapshotFilename}`);
    await stubApp.request(`/layouts/${URL_UUID}/snapshots`, {
      method: "POST",
      headers: { "Content-Type": "text/yaml" },
      body: "version: '1'\nname: Snap\nracks: []",
    });
    await stubApp.request(`/layouts/${URL_UUID}/pre-carrier-backup`);

    // The PUT return value flows back through the route, proving the injected
    // driver's result (not the filesystem's) is what the handler returns.
    expect(putRes.status).toBe(201);
    expect(putRes.headers.get("X-Rackula-Updated-At")).toBe(sentinelUpdatedAt);

    // Every driver method backing a layout route was invoked via the context.
    const expectedDriverCalls = [
      "listLayouts",
      "getLayout",
      "saveLayout",
      "deleteLayout",
      "listSnapshots",
      "getSnapshot",
      "saveSnapshot",
      "getPreCarrierBackup",
    ];
    for (const method of expectedDriverCalls) {
      expect(calls).toContain(method);
    }
  });
});
