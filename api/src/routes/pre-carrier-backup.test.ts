/**
 * Pre-carrier server backup route + end-to-end header tests (#2517).
 *
 * Covers the X-Rackula-Pre-Carrier-Migration PUT header that triggers a durable
 * one-time backup of the prior on-disk YAML, the read-only restore endpoint
 * GET /layouts/:uuid/pre-carrier-backup, idempotency, and the backup's
 * invisibility to layout listing and retrieval.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import type { EnvMap } from "../security";
import { PRE_CARRIER_MIGRATION_HEADER } from "./layouts";

type App = Awaited<ReturnType<typeof createApp>>;

// Use the route's own constant so the test cannot drift from the real header.
const MIGRATION_HEADER = PRE_CARRIER_MIGRATION_HEADER;
const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";
const UNKNOWN_UUID = "00000000-0000-0000-0000-000000000999";

const originalDataDir = process.env.DATA_DIR;
let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "rackula-pre-carrier-test-"));
  process.env.DATA_DIR = testDir;
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

function buildEnv(overrides: EnvMap = {}): EnvMap {
  return {
    NODE_ENV: "test",
    DATA_DIR: testDir,
    RACKULA_RATE_LIMIT_ENABLED: "false",
    ...overrides,
  };
}

function createLayoutYaml(name: string, marker: string): string {
  return `version: "1.0.0"\nname: ${name}\ndescription: ${marker}\nracks: []`;
}

async function putLayout(
  app: App,
  uuid: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request(`/layouts/${uuid}`, {
    method: "PUT",
    headers: { "Content-Type": "text/yaml", ...headers },
    body,
  });
}

describe("GET /layouts/:uuid/pre-carrier-backup", () => {
  it("returns the prior YAML after a migrating PUT", async () => {
    const app = await createApp(buildEnv());
    const v1 = createLayoutYaml("My Layout", "v1");
    await putLayout(app, TEST_UUID, v1);

    const v2 = createLayoutYaml("My Layout", "v2");
    await putLayout(app, TEST_UUID, v2, { [MIGRATION_HEADER]: "1" });

    const response = await app.request(
      `/layouts/${TEST_UUID}/pre-carrier-backup`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/yaml");
    expect(await response.text()).toBe(v1);
  });

  it("returns 404 when no backup exists", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));

    const response = await app.request(
      `/layouts/${TEST_UUID}/pre-carrier-backup`,
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 for an unknown uuid", async () => {
    const app = await createApp(buildEnv());

    const response = await app.request(
      `/layouts/${UNKNOWN_UUID}/pre-carrier-backup`,
    );
    expect(response.status).toBe(404);
  });

  it("returns 400 for a malformed uuid", async () => {
    const app = await createApp(buildEnv());

    const response = await app.request(
      "/layouts/not-a-uuid/pre-carrier-backup",
    );
    expect(response.status).toBe(400);
  });

  it("keeps the bytes from before the FIRST migrating PUT across two migrations", async () => {
    const app = await createApp(buildEnv());
    const v1 = createLayoutYaml("My Layout", "v1");
    await putLayout(app, TEST_UUID, v1);

    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v2"), {
      [MIGRATION_HEADER]: "1",
    });
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v3"), {
      [MIGRATION_HEADER]: "1",
    });

    const response = await app.request(
      `/layouts/${TEST_UUID}/pre-carrier-backup`,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(v1);
  });
});

describe("pre-carrier backup invisibility", () => {
  it("does not surface the backup in layout listing or retrieval", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));
    const latest = createLayoutYaml("My Layout", "v2");
    await putLayout(app, TEST_UUID, latest, { [MIGRATION_HEADER]: "1" });

    const list = await app.request("/layouts");
    const body = await list.json();
    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: the durable backup must never surface as a layout
    expect(body.layouts).toHaveLength(1);
    expect(body.layouts[0].id).toBe(TEST_UUID);

    const single = await app.request(`/layouts/${TEST_UUID}`);
    expect(single.status).toBe(200);
    expect(await single.text()).toBe(latest);
  });
});

describe("pre-carrier migration PUT header", () => {
  it("writes no backup on a PUT without the header", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v2"));

    const response = await app.request(
      `/layouts/${TEST_UUID}/pre-carrier-backup`,
    );
    expect(response.status).toBe(404);
  });
});
