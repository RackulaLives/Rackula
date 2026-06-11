/**
 * Pre-overwrite snapshot tests (#2040)
 *
 * Covers echoed-updatedAt conflict detection on PUT, snapshot listing and
 * upload routes, pruning, auth gating, and invisibility of the snapshots
 * folder to quota counting and layout discovery.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { checkLayoutQuota } from "./storage/quota";
import type { EnvMap } from "./security";

type App = Awaited<ReturnType<typeof createApp>>;

const UPDATED_AT_HEADER = "X-Rackula-Updated-At";
const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";
const UNKNOWN_UUID = "00000000-0000-0000-0000-000000000999";
const STALE_UPDATED_AT = "1999-01-01T00:00:00.000Z";
const TEST_TOKEN = "test-write-token";

const originalDataDir = process.env.DATA_DIR;
let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "rackula-snapshots-test-"));
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

async function postSnapshot(
  app: App,
  uuid: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request(`/layouts/${uuid}/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "text/yaml", ...headers },
    body,
  });
}

/**
 * Read snapshot filenames directly from disk for the layout folder
 * matching the given UUID. Returns [] when no folder or no snapshots exist.
 */
async function snapshotFilesOnDisk(uuid: string): Promise<string[]> {
  const entries = await readdir(testDir, { withFileTypes: true });
  const folder = entries.find(
    (entry) => entry.isDirectory() && entry.name.toLowerCase().endsWith(uuid),
  );
  if (!folder) {
    return [];
  }

  try {
    return await readdir(join(testDir, folder.name, "snapshots"));
  } catch {
    return [];
  }
}

async function readSnapshotContents(uuid: string): Promise<string[]> {
  const entries = await readdir(testDir, { withFileTypes: true });
  const folder = entries.find(
    (entry) => entry.isDirectory() && entry.name.toLowerCase().endsWith(uuid),
  );
  if (!folder) {
    return [];
  }

  const snapshotsDir = join(testDir, folder.name, "snapshots");
  const files = await readdir(snapshotsDir);
  return Promise.all(
    files.map((file) => readFile(join(snapshotsDir, file), "utf-8")),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("PUT echoed updatedAt conflict detection", () => {
  it("first save without header creates no snapshot and returns updatedAt", async () => {
    const app = await createApp(buildEnv());

    const response = await putLayout(
      app,
      TEST_UUID,
      createLayoutYaml("My Layout", "v1"),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe(TEST_UUID);
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);
    expect(response.headers.get(UPDATED_AT_HEADER)).toBe(body.updatedAt);
    expect(await snapshotFilesOnDisk(TEST_UUID)).toEqual([]);
  });

  it("first save with an echoed header creates no snapshot", async () => {
    const app = await createApp(buildEnv());

    const response = await putLayout(
      app,
      TEST_UUID,
      createLayoutYaml("My Layout", "v1"),
      { [UPDATED_AT_HEADER]: STALE_UPDATED_AT },
    );

    expect(response.status).toBe(201);
    expect(await snapshotFilesOnDisk(TEST_UUID)).toEqual([]);
  });

  it("overwrite without header creates no snapshot (legacy client)", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));

    const response = await putLayout(
      app,
      TEST_UUID,
      createLayoutYaml("My Layout", "v2"),
    );

    expect(response.status).toBe(200);
    expect(await snapshotFilesOnDisk(TEST_UUID)).toEqual([]);

    const stored = await app.request(`/layouts/${TEST_UUID}`);
    expect(await stored.text()).toContain("v2");
  });

  it("overwrite with matching echoed updatedAt creates no snapshot", async () => {
    const app = await createApp(buildEnv());
    const first = await putLayout(
      app,
      TEST_UUID,
      createLayoutYaml("My Layout", "v1"),
    );
    const { updatedAt } = await first.json();

    const response = await putLayout(
      app,
      TEST_UUID,
      createLayoutYaml("My Layout", "v2"),
      { [UPDATED_AT_HEADER]: updatedAt },
    );

    expect(response.status).toBe(200);
    expect(await snapshotFilesOnDisk(TEST_UUID)).toEqual([]);

    const stored = await app.request(`/layouts/${TEST_UUID}`);
    expect(await stored.text()).toContain("v2");
  });

  it("mismatched echoed updatedAt snapshots the existing copy then writes", async () => {
    const app = await createApp(buildEnv());
    const v1 = createLayoutYaml("My Layout", "v1");
    const v2 = createLayoutYaml("My Layout", "v2");
    await putLayout(app, TEST_UUID, v1);

    const response = await putLayout(app, TEST_UUID, v2, {
      [UPDATED_AT_HEADER]: STALE_UPDATED_AT,
    });

    // Last write wins: the save is never rejected
    expect(response.status).toBe(200);

    const snapshots = await snapshotFilesOnDisk(TEST_UUID);
    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: one mismatch produces exactly one snapshot
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatch(/^my-layout~\d{8}-\d{6}(-\d+)?\.yaml$/);

    const contents = await readSnapshotContents(TEST_UUID);
    expect(contents[0]).toBe(v1);

    const stored = await app.request(`/layouts/${TEST_UUID}`);
    expect(await stored.text()).toContain("v2");
  });
});

describe("snapshot pruning", () => {
  it("prunes to the 5 most recent snapshots", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));

    for (let i = 2; i <= 8; i += 1) {
      await sleep(2);
      const response = await putLayout(
        app,
        TEST_UUID,
        createLayoutYaml("My Layout", `v${i}`),
        { [UPDATED_AT_HEADER]: STALE_UPDATED_AT },
      );
      expect(response.status).toBe(200);
    }

    const snapshots = await snapshotFilesOnDisk(TEST_UUID);
    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: retention bound is exactly 5 snapshots
    expect(snapshots).toHaveLength(5);

    // 7 mismatch saves snapshot v1..v7; pruning keeps the newest 5 (v3..v7)
    const contents = await readSnapshotContents(TEST_UUID);
    const markers = contents
      .map((content) => content.match(/description: (v\d+)/)?.[1])
      .sort();
    expect(markers).toEqual(["v3", "v4", "v5", "v6", "v7"]);
  });

  it("prunes the base snapshot before its suffixed siblings when mtimes tie", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));

    const entries = await readdir(testDir, { withFileTypes: true });
    const folder = entries.find(
      (entry) =>
        entry.isDirectory() && entry.name.toLowerCase().endsWith(TEST_UUID),
    );
    if (!folder) {
      throw new Error("layout folder not found");
    }

    // Forge a same-second collision set with identical mtimes: the base
    // file is the oldest write, suffixes 1-5 are progressively newer.
    const snapshotsDir = join(testDir, folder.name, "snapshots");
    await mkdir(snapshotsDir, { recursive: true });
    const names = [
      "my-layout~20260101-000000.yaml",
      ...[1, 2, 3, 4, 5].map((n) => `my-layout~20260101-000000-${n}.yaml`),
    ];
    for (const name of names) {
      await writeFile(join(snapshotsDir, name), `marker: ${name}`, "utf-8");
    }
    const sharedMtime = new Date("2026-01-01T00:00:00Z");
    for (const name of names) {
      await utimes(join(snapshotsDir, name), sharedMtime, sharedMtime);
    }

    // A new upload prunes 7 files down to 5: the two oldest of the tied
    // set (base, then -1) must go.
    const response = await postSnapshot(
      app,
      TEST_UUID,
      createLayoutYaml("My Layout", "new"),
    );
    expect(response.status).toBe(201);

    const remaining = await snapshotFilesOnDisk(TEST_UUID);
    expect(remaining).not.toContain("my-layout~20260101-000000.yaml");
    expect(remaining).not.toContain("my-layout~20260101-000000-1.yaml");
    expect(remaining).toContain("my-layout~20260101-000000-2.yaml");
    expect(remaining).toContain("my-layout~20260101-000000-5.yaml");
  });

  it("manual uploads count toward the prune bound", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));

    for (let i = 1; i <= 6; i += 1) {
      await sleep(2);
      const response = await postSnapshot(
        app,
        TEST_UUID,
        createLayoutYaml("My Layout", `local-${i}`),
      );
      expect(response.status).toBe(201);
    }

    const snapshots = await snapshotFilesOnDisk(TEST_UUID);
    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: retention bound is exactly 5 snapshots
    expect(snapshots).toHaveLength(5);
  });
});

describe("GET /layouts/:uuid/snapshots", () => {
  it("lists snapshots with filename, timestamp, and size, newest first", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));
    for (let i = 2; i <= 3; i += 1) {
      await sleep(2);
      await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", `v${i}`), {
        [UPDATED_AT_HEADER]: STALE_UPDATED_AT,
      });
    }

    const response = await app.request(`/layouts/${TEST_UUID}/snapshots`);
    expect(response.status).toBe(200);

    const body = await response.json();
    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: two mismatch saves produce exactly two snapshots
    expect(body.snapshots).toHaveLength(2);
    for (const snapshot of body.snapshots) {
      expect(typeof snapshot.filename).toBe("string");
      expect(new Date(snapshot.timestamp).toISOString()).toBe(
        snapshot.timestamp,
      );
      expect(snapshot.size).toBeGreaterThan(0);
    }
    expect(body.snapshots[0].timestamp >= body.snapshots[1].timestamp).toBe(
      true,
    );
  });

  it("returns an empty list when the layout has no snapshots", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));

    const response = await app.request(`/layouts/${TEST_UUID}/snapshots`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ snapshots: [] });
  });

  it("returns 404 for an unknown layout", async () => {
    const app = await createApp(buildEnv());

    const response = await app.request(`/layouts/${UNKNOWN_UUID}/snapshots`);
    expect(response.status).toBe(404);
  });

  it("returns 400 for an invalid uuid", async () => {
    const app = await createApp(buildEnv());

    const response = await app.request("/layouts/not-a-uuid/snapshots");
    expect(response.status).toBe(400);
  });
});

describe("POST /layouts/:uuid/snapshots", () => {
  it("stores an uploaded losing copy as a snapshot", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));
    const losingCopy = createLayoutYaml("My Layout", "losing-local-copy");

    const response = await postSnapshot(app, TEST_UUID, losingCopy);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.filename).toMatch(/^my-layout~\d{8}-\d{6}(-\d+)?\.yaml$/);

    const contents = await readSnapshotContents(TEST_UUID);
    expect(contents).toContain(losingCopy);
  });

  it("returns 404 for an unknown layout", async () => {
    const app = await createApp(buildEnv());

    const response = await postSnapshot(
      app,
      UNKNOWN_UUID,
      createLayoutYaml("My Layout", "v1"),
    );
    expect(response.status).toBe(404);
  });

  it("returns 400 for an empty body", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));

    const response = await postSnapshot(app, TEST_UUID, "   ");
    expect(response.status).toBe(400);
  });

  it("returns 400 for unparseable YAML", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));

    const response = await postSnapshot(app, TEST_UUID, "not valid yaml: [");
    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid uuid", async () => {
    const app = await createApp(buildEnv());

    const response = await postSnapshot(app, "not-a-uuid", "version: 1");
    expect(response.status).toBe(400);
  });

  it("returns 413 for a body over the layout size limit", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));

    const oversized = createLayoutYaml("My Layout", "x".repeat(1024 * 1024));
    const response = await postSnapshot(app, TEST_UUID, oversized);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "Layout data too large" });
  });
});

describe("snapshot route auth gating", () => {
  it("rejects snapshot upload without write token when token auth is enabled", async () => {
    const app = await createApp(
      buildEnv({ RACKULA_API_WRITE_TOKEN: TEST_TOKEN }),
    );

    const response = await postSnapshot(
      app,
      TEST_UUID,
      createLayoutYaml("My Layout", "v1"),
    );
    expect(response.status).toBe(401);
  });

  it("rejects snapshot upload with a wrong write token", async () => {
    const app = await createApp(
      buildEnv({ RACKULA_API_WRITE_TOKEN: TEST_TOKEN }),
    );

    const response = await postSnapshot(
      app,
      TEST_UUID,
      createLayoutYaml("My Layout", "v1"),
      { Authorization: "Bearer wrong-token" },
    );
    expect(response.status).toBe(403);
  });

  it("accepts snapshot upload with a valid write token", async () => {
    const app = await createApp(
      buildEnv({ RACKULA_API_WRITE_TOKEN: TEST_TOKEN }),
    );
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };
    await putLayout(
      app,
      TEST_UUID,
      createLayoutYaml("My Layout", "v1"),
      authHeader,
    );

    const response = await postSnapshot(
      app,
      TEST_UUID,
      createLayoutYaml("My Layout", "losing-copy"),
      authHeader,
    );
    expect(response.status).toBe(201);
  });

  it("serves snapshot listings without a token in write-token mode", async () => {
    const app = await createApp(
      buildEnv({ RACKULA_API_WRITE_TOKEN: TEST_TOKEN }),
    );
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"), {
      Authorization: `Bearer ${TEST_TOKEN}`,
    });

    const response = await app.request(`/layouts/${TEST_UUID}/snapshots`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ snapshots: [] });
  });

  it("does not serve snapshot listings without a session when auth is enabled", async () => {
    const app = await createApp(
      buildEnv({
        RACKULA_AUTH_MODE: "oidc",
        RACKULA_AUTH_SESSION_SECRET:
          "rackula-auth-session-secret-for-tests-0123456789",
        CORS_ORIGIN: "https://rack.example.com",
      }),
    );

    const response = await app.request(`/layouts/${TEST_UUID}/snapshots`);
    expect(response.status).toBe(401);
  });
});

describe("snapshot folder invisibility", () => {
  it("snapshots are invisible to checkLayoutQuota", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));
    for (let i = 2; i <= 6; i += 1) {
      await sleep(2);
      await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", `v${i}`), {
        [UPDATED_AT_HEADER]: STALE_UPDATED_AT,
      });
    }
    expect((await snapshotFilesOnDisk(TEST_UUID)).length).toBeGreaterThan(0);

    const quota = await checkLayoutQuota(testDir, 2);
    expect(quota.current).toBe(1);
    expect(quota.allowed).toBe(true);
  });

  it("snapshots are invisible to layout discovery (findYamlInFolder)", async () => {
    const app = await createApp(buildEnv());
    await putLayout(app, TEST_UUID, createLayoutYaml("My Layout", "v1"));
    const latest = createLayoutYaml("My Layout", "v2");
    await putLayout(app, TEST_UUID, latest, {
      [UPDATED_AT_HEADER]: STALE_UPDATED_AT,
    });
    expect((await snapshotFilesOnDisk(TEST_UUID)).length).toBeGreaterThan(0);

    const single = await app.request(`/layouts/${TEST_UUID}`);
    expect(single.status).toBe(200);
    expect(await single.text()).toBe(latest);

    const list = await app.request("/layouts");
    const body = await list.json();
    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: snapshots must never surface as layouts
    expect(body.layouts).toHaveLength(1);
    expect(body.layouts[0].id).toBe(TEST_UUID);
    expect(body.layouts[0].name).toBe("My Layout");
  });
});

describe("updatedAt echo surface", () => {
  it("PUT and GET expose the same updatedAt as the list endpoint", async () => {
    const app = await createApp(buildEnv());

    const put = await putLayout(
      app,
      TEST_UUID,
      createLayoutYaml("My Layout", "v1"),
    );
    const { updatedAt } = await put.json();

    const single = await app.request(`/layouts/${TEST_UUID}`);
    expect(single.headers.get(UPDATED_AT_HEADER)).toBe(updatedAt);

    const list = await app.request("/layouts");
    const body = await list.json();
    expect(body.layouts[0].updatedAt).toBe(updatedAt);
  });
});
