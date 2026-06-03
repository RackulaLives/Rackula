import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStorageQuotaMiddleware } from "./storage-quota-middleware";

const originalDataDir = process.env.DATA_DIR;

let testDir: string;
let layoutDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "rackula-quota-mw-test-"));
  // Set DATA_DIR so findFolderByUuid (which uses getDataDir()) finds our test dir
  process.env.DATA_DIR = testDir;

  layoutDir = join(testDir, "Test-Layout-a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  await mkdir(layoutDir);
  await writeFile(
    join(layoutDir, "test-layout.rackula.yaml"),
    "name: Test Layout\nversion: '1'",
  );
});

afterEach(async () => {
  // Restore original DATA_DIR to prevent env leak
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

function createTestApp(config: {
  maxLayouts: number;
  maxAssetsPerLayout: number;
}) {
  const app = new Hono();
  app.use(
    "*",
    createStorageQuotaMiddleware({
      dataDir: testDir,
      maxLayouts: config.maxLayouts,
      maxAssetsPerLayout: config.maxAssetsPerLayout,
    }),
  );

  // Simulate layout routes
  app.put("/layouts/:uuid", (c) =>
    c.json({ id: c.req.param("uuid"), message: "Layout created" }, 201),
  );
  app.put("/api/layouts/:uuid", (c) =>
    c.json({ id: c.req.param("uuid"), message: "Layout created" }, 201),
  );

  // Simulate asset routes
  app.put("/assets/:layoutId/:deviceSlug/:face", (c) =>
    c.json({ message: "Asset uploaded" }, 201),
  );
  app.put("/api/assets/:layoutId/:deviceSlug/:face", (c) =>
    c.json({ message: "Asset uploaded" }, 201),
  );

  // Other methods pass through
  app.get("/layouts/:uuid", (c) => c.json({ id: c.req.param("uuid") }));

  return app;
}

describe("createStorageQuotaMiddleware", () => {
  describe("layout quota", () => {
    it("allows layout creation when under the limit", async () => {
      const app = createTestApp({ maxLayouts: 5, maxAssetsPerLayout: 50 });
      const res = await app.request("/layouts/new-uuid-here", {
        method: "PUT",
      });
      expect(res.status).toBe(201);
    });

    it("allows layout creation via /api/ prefix", async () => {
      const app = createTestApp({ maxLayouts: 5, maxAssetsPerLayout: 50 });
      const res = await app.request("/api/layouts/new-uuid-here", {
        method: "PUT",
      });
      expect(res.status).toBe(201);
    });

    it("rejects layout creation when at the limit", async () => {
      // Already have 1 layout (created in beforeEach), set limit to 1
      const app = createTestApp({ maxLayouts: 1, maxAssetsPerLayout: 50 });
      const res = await app.request("/layouts/new-uuid-here", {
        method: "PUT",
      });
      expect(res.status).toBe(429);

      const body = await res.json();
      expect(body.error).toBe("Storage quota exceeded");
      expect(body.current).toBe(1);
      expect(body.max).toBe(1);
      expect(body.message).toContain("Layout limit reached");
    });

    it("allows layout update when at the limit (existing UUID)", async () => {
      // Already have 1 layout at limit 1 — updating should be allowed
      const app = createTestApp({ maxLayouts: 1, maxAssetsPerLayout: 50 });
      const res = await app.request(
        "/layouts/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        { method: "PUT" },
      );
      expect(res.status).toBe(201);
    });

    it("allows all requests when both quotas are unlimited (max=0)", async () => {
      const app = createTestApp({ maxLayouts: 0, maxAssetsPerLayout: 0 });
      const res = await app.request("/layouts/new-uuid-here", {
        method: "PUT",
      });
      expect(res.status).toBe(201);
    });

    it("passes through GET requests without quota checks", async () => {
      const app = createTestApp({ maxLayouts: 1, maxAssetsPerLayout: 1 });
      const res = await app.request(
        "/layouts/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      );
      expect(res.status).toBe(200);
    });

    it("does not include Retry-After header for hard quota errors", async () => {
      const app = createTestApp({ maxLayouts: 1, maxAssetsPerLayout: 50 });
      const res = await app.request("/layouts/new-uuid-here", {
        method: "PUT",
      });
      // Retry-After is for rate limits, not hard storage quotas
      expect(res.headers.get("Retry-After")).toBeNull();
    });
  });

  describe("asset quota", () => {
    it("allows asset upload when under the limit", async () => {
      const app = createTestApp({ maxLayouts: 5, maxAssetsPerLayout: 50 });
      const res = await app.request(
        "/assets/a1b2c3d4-e5f6-7890-abcd-ef1234567890/dell-r640/front",
        { method: "PUT" },
      );
      expect(res.status).toBe(201);
    });

    it("rejects asset upload when at the limit", async () => {
      // Create assets that fill the quota
      const assetsDir = join(layoutDir, "assets", "dell-r640");
      await mkdir(assetsDir, { recursive: true });
      await writeFile(join(assetsDir, "front.png"), "fake");
      await writeFile(join(assetsDir, "rear.png"), "fake");

      const app = createTestApp({ maxLayouts: 5, maxAssetsPerLayout: 2 });
      const res = await app.request(
        "/assets/a1b2c3d4-e5f6-7890-abcd-ef1234567890/hp-dl380/front",
        { method: "PUT" },
      );
      expect(res.status).toBe(507);

      const body = await res.json();
      expect(body.error).toBe("Storage quota exceeded");
      expect(body.current).toBe(2);
      expect(body.max).toBe(2);
      expect(body.message).toContain("Asset limit reached");
    });

    it("allows asset upload via /api/ prefix", async () => {
      const app = createTestApp({ maxLayouts: 5, maxAssetsPerLayout: 50 });
      const res = await app.request(
        "/api/assets/a1b2c3d4-e5f6-7890-abcd-ef1234567890/dell-r640/front",
        { method: "PUT" },
      );
      expect(res.status).toBe(201);
    });

    it("passes through asset request for non-existent layout", async () => {
      const app = createTestApp({ maxLayouts: 5, maxAssetsPerLayout: 1 });
      // UUID doesn't match any layout — middleware skips quota check
      const res = await app.request(
        "/assets/00000000-0000-0000-0000-000000000000/dell-r640/front",
        { method: "PUT" },
      );
      // The route handler returns 201 (our test app doesn't check existence)
      expect(res.status).toBe(201);
    });
  });
});
