# Storage Abuse Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add storage quota enforcement (layout count and per-layout asset count) with safe defaults and env-configurable controls to prevent unauthenticated disk-fill attacks.

**Architecture:** New `storage/quota.ts` module provides filesystem-based quota checking functions. New `security/storage-quota-middleware.ts` enforces quotas via Hono middleware before write route handlers. Config is resolved in `security/config.ts` from env vars. Follows the existing rate-limiter pattern (separate module, separate middleware, config in security types).

**Tech Stack:** TypeScript, Hono, Bun test runner, Node.js fs/promises

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `api/src/storage/quota.ts` | Create | Quota check functions (`checkLayoutQuota`, `checkAssetQuota`) |
| `api/src/storage/quota.test.ts` | Create | Tests for quota module |
| `api/src/security/storage-quota-middleware.ts` | Create | Hono middleware enforcing quotas on write routes |
| `api/src/security/storage-quota-middleware.test.ts` | Create | Tests for quota middleware |
| `api/src/security/config.ts` | Modify | Add `maxLayouts` and `maxAssetsPerLayout` config resolution |
| `api/src/security/types.ts` | Modify | Add quota fields to `ApiSecurityConfig` |
| `api/src/security/index.ts` | Modify | Export new middleware and types |
| `api/src/app.ts` | Modify | Register storage quota middleware |
| `api/.env.example` | Modify | Document new env vars |
| `docs/deployment/SELF-HOSTING.md` | Modify | Document quota configuration |

---

### Task 1: Add quota config to security types

**Files:**

- Modify: `api/src/security/types.ts`

- [ ] **Step 1: Add quota fields to `ApiSecurityConfig` interface**

Add `maxLayouts` and `maxAssetsPerLayout` fields after the existing `rateLimitReadWindowMs` field:

```typescript
  rateLimitReadMaxRequests: number;
  rateLimitReadWindowMs: number;
  maxLayouts: number;
  maxAssetsPerLayout: number;
}
```

The full interface addition is two lines: `maxLayouts: number;` and `maxAssetsPerLayout: number;`.

- [ ] **Step 2: Run existing security tests to verify types compile**

Run: `cd api && bun test src/security/security.test.ts` Expected: All tests pass (no behavior change, just new interface fields)

- [ ] **Step 3: Commit**

```bash
git add api/src/security/types.ts
git commit -m "feat(api): add quota fields to ApiSecurityConfig type (#1780)"
```

---

### Task 2: Add quota config resolution

**Files:**

- Modify: `api/src/security/config.ts`

- [ ] **Step 1: Add `parseQuotaValue` helper function**

Add a new parsing function after `parseNonNegativeInteger` (around line 230) that accepts `0` as "unlimited" and positive integers up to a max:

```typescript
/**
 * Parse a quota value from environment variables.
 * Accepts 0 (unlimited) or positive integers up to `max`.
 * Falls back to `fallback` when unset or empty.
 */
function parseQuotaValue(
  name: string,
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return fallback;
  }

  if (!/^\d+$/.test(trimmedValue)) {
    throw new Error(`${name} must be 0 (unlimited) or a positive integer.`);
  }

  const parsed = Number.parseInt(trimmedValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be 0 (unlimited) or a positive integer.`);
  }

  // 0 means unlimited — no upper bound check needed
  if (parsed === 0) {
    return 0;
  }

  if (parsed > max) {
    throw new Error(`${name} must be <= ${max} or 0 for unlimited.`);
  }

  return parsed;
}
```

- [ ] **Step 2: Add quota config parsing in `resolveApiSecurityConfig`**

After the rate limit config block (after `rateLimitReadWindowMs`), add the storage quota config:

```typescript
// Storage quota configuration
const DEFAULT_MAX_LAYOUTS = 100;
const DEFAULT_MAX_ASSETS_PER_LAYOUT = 50;

const maxLayouts = parseQuotaValue(
  "RACKULA_MAX_LAYOUTS",
  env.RACKULA_MAX_LAYOUTS,
  DEFAULT_MAX_LAYOUTS,
  10_000,
);

const maxAssetsPerLayout = parseQuotaValue(
  "RACKULA_MAX_ASSETS_PER_LAYOUT",
  env.RACKULA_MAX_ASSETS_PER_LAYOUT,
  DEFAULT_MAX_ASSETS_PER_LAYOUT,
  1_000,
);
```

Then add `maxLayouts` and `maxAssetsPerLayout` to the return object:

```typescript
return {
  // ... existing fields ...
  rateLimitReadWindowMs,
  maxLayouts,
  maxAssetsPerLayout,
};
```

- [ ] **Step 3: Run config tests to verify parsing**

Run: `cd api && bun test src/security/security.test.ts` Expected: Existing tests pass (new fields have defaults, no env var required)

- [ ] **Step 4: Commit**

```bash
git add api/src/security/config.ts
git commit -m "feat(api): add storage quota config resolution (#1780)"
```

---

### Task 3: Create quota module

**Files:**

- Create: `api/src/storage/quota.ts`
- Create: `api/src/storage/quota.test.ts`

- [ ] **Step 1: Write the quota module**

Create `api/src/storage/quota.ts`:

```typescript
/**
 * Storage quota enforcement for layouts and assets.
 *
 * Checks filesystem-based quota limits before write operations.
 * Uses directory counts (fast, no disk-size scanning required).
 *
 * @module quota
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import createDebug from "debug";
import { extractUuidFromFolderName } from "../schemas/layout";

const quotaDebug = createDebug("rackula:quota");

/**
 * Result of a storage quota check.
 */
export interface QuotaCheckResult {
  /** Whether the operation is allowed within quota. */
  allowed: boolean;
  /** Current count against the quota. */
  current: number;
  /** Maximum allowed count. 0 means unlimited. */
  max: number;
}

/**
 * Check whether creating a new layout would exceed the layout count quota.
 *
 * Counts both UUID-suffixed directories (new format) and legacy .yaml/.yml
 * flat files (old format) in the data directory. If `maxLayouts` is 0,
 * returns immediately with `allowed: true` (unlimited mode).
 *
 * @param dataDir - Path to the data directory containing layouts.
 * @param maxLayouts - Maximum number of layouts allowed. 0 = unlimited.
 * @returns Quota check result with current count and max limit.
 */
export async function checkLayoutQuota(
  dataDir: string,
  maxLayouts: number,
): Promise<QuotaCheckResult> {
  if (maxLayouts === 0) {
    quotaDebug("layout quota: unlimited mode, skipping check");
    return { allowed: true, current: 0, max: 0 };
  }

  const entries = await readdir(dataDir, { withFileTypes: true });

  let layoutCount = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // New format: directories with UUID suffix
      const uuid = extractUuidFromFolderName(entry.name);
      if (uuid) {
        layoutCount += 1;
      }
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))
    ) {
      // Legacy format: flat YAML files
      layoutCount += 1;
    }
  }

  const allowed = layoutCount < maxLayouts;
  quotaDebug(
    "layout quota check: %d/%d %s",
    layoutCount,
    maxLayouts,
    allowed ? "allowed" : "exceeded",
  );

  return { allowed, current: layoutCount, max: maxLayouts };
}

/**
 * Check whether adding an asset to a layout would exceed the per-layout asset quota.
 *
 * Counts all files (not directories) recursively in the layout's assets directory.
 * If the assets directory does not exist, current count is 0. If `maxAssetsPerLayout`
 * is 0, returns immediately with `allowed: true` (unlimited mode).
 *
 * @param layoutDir - Path to the layout's folder (containing the assets/ subdirectory).
 * @param maxAssetsPerLayout - Maximum number of assets per layout. 0 = unlimited.
 * @returns Quota check result with current count and max limit.
 */
export async function checkAssetQuota(
  layoutDir: string,
  maxAssetsPerLayout: number,
): Promise<QuotaCheckResult> {
  if (maxAssetsPerLayout === 0) {
    quotaDebug("asset quota: unlimited mode, skipping check");
    return { allowed: true, current: 0, max: 0 };
  }

  const assetsDir = join(layoutDir, "assets");

  try {
    await readdir(assetsDir);
  } catch {
    // Assets directory does not exist — no assets stored yet
    quotaDebug("asset quota: no assets directory, 0/%d", maxAssetsPerLayout);
    return { allowed: true, current: 0, max: maxAssetsPerLayout };
  }

  let assetCount = 0;
  const deviceDirs = await readdir(assetsDir, { withFileTypes: true });
  for (const deviceDir of deviceDirs) {
    if (deviceDir.isDirectory()) {
      try {
        const files = await readdir(join(assetsDir, deviceDir.name));
        for (const file of files) {
          // Count only files with known image extensions
          const ext = file.split(".").pop()?.toLowerCase() ?? "";
          if (ext === "png" || ext === "jpg" || ext === "webp") {
            assetCount += 1;
          }
        }
      } catch {
        // Directory might have been deleted between readdir and read — skip
      }
    }
  }

  const allowed = assetCount < maxAssetsPerLayout;
  quotaDebug(
    "asset quota check for %s: %d/%d %s",
    layoutDir,
    assetCount,
    maxAssetsPerLayout,
    allowed ? "allowed" : "exceeded",
  );

  return { allowed, current: assetCount, max: maxAssetsPerLayout };
}
```

- [ ] **Step 2: Write the quota module tests**

Create `api/src/storage/quota.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLayoutQuota, checkAssetQuota } from "./quota";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "rackula-quota-test-"));
});

afterAll(async () => {
  // Best-effort cleanup — tmp directories are under OS temp dir
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures
  }
});

describe("checkLayoutQuota", () => {
  it("returns allowed when under the limit", async () => {
    // Empty data dir — 0 layouts, limit of 5
    const result = await checkLayoutQuota(testDir, 5);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
    expect(result.max).toBe(5);
  });

  it("returns denied when at the limit", async () => {
    // Create 3 layout directories with UUID suffixes
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
    expect(result.max).toBe(5);
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
});

describe("checkAssetQuota", () => {
  it("returns allowed when under the limit", async () => {
    // No assets directory — 0 assets, limit of 10
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
    await writeFile(join(assetsDir, "notes.txt"), "not an image");
    await writeFile(join(assetsDir, ".DS_Store"), "macOS junk");

    const result = await checkAssetQuota(testDir, 10);
    expect(result.current).toBe(1);
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
});
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cd api && bun test src/storage/quota.test.ts` Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add api/src/storage/quota.ts api/src/storage/quota.test.ts
git commit -m "feat(api): add storage quota module with layout and asset checks (#1780)"
```

---

### Task 4: Create storage quota middleware

**Files:**

- Create: `api/src/security/storage-quota-middleware.ts`

- [ ] **Step 1: Write the storage quota middleware**

Create `api/src/security/storage-quota-middleware.ts`:

```typescript
/**
 * Hono middleware for enforcing storage quotas on layout and asset write operations.
 *
 * Checks layout count and per-layout asset count before allowing write operations.
 * Layout quota is only enforced on create (UUID not found), not on update.
 * Asset quota is enforced on every PUT to /assets/:layoutId/:deviceSlug/:face.
 *
 * When a quota is exceeded, returns:
 * - 429 (Too Many Requests) for layout count quota
 * - 507 (Insufficient Storage) for per-layout asset count quota
 *
 * Both responses include a JSON body with error details and a Retry-After: 0 header.
 *
 * @module storage-quota-middleware
 */

import type { MiddlewareHandler } from "hono";
import { checkLayoutQuota, checkAssetQuota } from "../storage/quota";
import { findFolderByUuid } from "../storage/filesystem";
import { isUuid } from "../schemas/layout";
import createDebug from "debug";

const quotaDebug = createDebug("rackula:quota");

/**
 * Configuration for the storage quota middleware.
 */
export interface StorageQuotaMiddlewareConfig {
  /** Path to the data directory containing layouts. */
  dataDir: string;
  /** Maximum number of layouts. 0 = unlimited. */
  maxLayouts: number;
  /** Maximum number of assets per layout. 0 = unlimited. */
  maxAssetsPerLayout: number;
}

/**
 * Create a storage quota enforcement middleware for Hono.
 *
 * Applies to:
 * - PUT /layouts/:uuid — checks layout count quota (create only, not update)
 * - PUT /assets/:layoutId/:deviceSlug/:face — checks per-layout asset count quota
 *
 * All other routes and methods are passed through without quota checks.
 * When both maxLayouts and maxAssetsPerLayout are 0 (unlimited), the middleware
 * is a no-op pass-through.
 */
export function createStorageQuotaMiddleware(
  config: StorageQuotaMiddlewareConfig,
): MiddlewareHandler {
  const { dataDir, maxLayouts, maxAssetsPerLayout } = config;

  // When both quotas are unlimited, skip all checks
  const unlimited = maxLayouts === 0 && maxAssetsPerLayout === 0;

  return async (c, next) => {
    if (unlimited) {
      await next();
      return;
    }

    const method = c.req.method.toUpperCase();
    const { pathname } = new URL(c.req.url);

    // Only enforce quotas on PUT (create/update) requests
    if (method !== "PUT") {
      await next();
      return;
    }

    // Layout quota: PUT /layouts/:uuid or PUT /api/layouts/:uuid
    const layoutMatch = pathname.match(/^\/(?:api\/)?layouts\/([^/]+)$/);
    if (layoutMatch) {
      const uuid = layoutMatch[1];

      // Only enforce quota on create, not update
      if (isUuid(uuid)) {
        const existingFolder = await findFolderByUuid(uuid);
        if (existingFolder) {
          quotaDebug("layout quota: update for %s, skipping check", uuid);
          await next();
          return;
        }
      }

      // Create — enforce layout quota
      const quota = await checkLayoutQuota(dataDir, maxLayouts);
      if (!quota.allowed) {
        quotaDebug("layout quota exceeded: %d/%d", quota.current, quota.max);
        c.header("Retry-After", "0");
        return c.json(
          {
            error: "Storage quota exceeded",
            message: `Layout limit reached (${quota.current}/${quota.max}). Delete existing layouts to create new ones.`,
            current: quota.current,
            max: quota.max,
          },
          429,
        );
      }
    }

    // Asset quota: PUT /assets/:layoutId/:deviceSlug/:face or PUT /api/assets/:layoutId/:deviceSlug/:face
    const assetMatch = pathname.match(
      /^\/(?:api\/)?assets\/([^/]+)\/([^/]+)\/([^/]+)$/,
    );
    if (assetMatch) {
      const layoutId = assetMatch[1];

      // Find the layout folder to count its assets
      if (isUuid(layoutId)) {
        const layoutFolder = await findFolderByUuid(layoutId);
        if (layoutFolder) {
          const quota = await checkAssetQuota(layoutFolder, maxAssetsPerLayout);
          if (!quota.allowed) {
            quotaDebug(
              "asset quota exceeded for layout %s: %d/%d",
              layoutId,
              quota.current,
              quota.max,
            );
            c.header("Retry-After", "0");
            return c.json(
              {
                error: "Storage quota exceeded",
                message: `Asset limit reached for this layout (${quota.current}/${quota.max}). Remove existing assets to add new ones.`,
                current: quota.current,
                max: quota.max,
              },
              507,
            );
          }
        } else {
          // Layout doesn't exist — the route handler will return 404
          quotaDebug(
            "asset quota: layout %s not found, skipping check",
            layoutId,
          );
        }
      }
    }

    await next();
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add api/src/security/storage-quota-middleware.ts
git commit -m "feat(api): add storage quota middleware (#1780)"
```

---

### Task 5: Create storage quota middleware tests

**Files:**

- Create: `api/src/security/storage-quota-middleware.test.ts`

- [ ] **Step 1: Write the middleware tests**

Create `api/src/security/storage-quota-middleware.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStorageQuotaMiddleware } from "./storage-quota-middleware";

let testDir: string;
let layoutDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "rackula-quota-mw-test-"));
  layoutDir = join(testDir, "Test-Layout-a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  await mkdir(layoutDir);
  await writeFile(
    join(layoutDir, "test-layout.rackula.yaml"),
    "name: Test Layout\nversion: '1'",
  );
});

afterAll(async () => {
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

    it("includes Retry-After header in quota exceeded response", async () => {
      const app = createTestApp({ maxLayouts: 1, maxAssetsPerLayout: 50 });
      const res = await app.request("/layouts/new-uuid-here", {
        method: "PUT",
      });
      expect(res.headers.get("Retry-After")).toBe("0");
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
      // UUID doesn't match any layout — handler will 404, middleware skips quota
      const res = await app.request(
        "/assets/00000000-0000-0000-0000-000000000000/dell-r640/front",
        { method: "PUT" },
      );
      // The route handler returns 201 (our test app doesn't check existence)
      expect(res.status).toBe(201);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cd api && bun test src/security/storage-quota-middleware.test.ts src/storage/quota.test.ts` Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add api/src/security/storage-quota-middleware.test.ts
git commit -m "test(api): add storage quota middleware tests (#1780)"
```

---

### Task 6: Export quota middleware and types from security index

**Files:**

- Modify: `api/src/security/index.ts`

- [ ] **Step 1: Add exports for storage quota middleware**

Add after the rate-limit-middleware exports:

```typescript
export { createStorageQuotaMiddleware } from "./storage-quota-middleware";
export type { StorageQuotaMiddlewareConfig } from "./storage-quota-middleware";
```

- [ ] **Step 2: Verify exports compile**

Run: `cd api && bun test src/security/security.test.ts` Expected: Tests pass (no behavior change, just new exports)

- [ ] **Step 3: Commit**

```bash
git add api/src/security/index.ts
git commit -m "feat(api): export storage quota middleware from security module (#1780)"
```

---

### Task 7: Wire middleware into app.ts

**Files:**

- Modify: `api/src/app.ts`

- [ ] **Step 1: Import the storage quota middleware**

Add to the imports from `./security` at the top of `app.ts`:

```typescript
import {
  createSignedAuthSessionToken,
  createAuthSessionCookieHeader,
  createAuthGateMiddleware,
  createCsrfProtectionMiddleware,
  createExpiredAuthSessionCookieHeader,
  createOriginPolicyMiddleware,
  createRefreshedAuthSessionCookieHeader,
  createWriteAuthMiddleware,
  createRateLimitMiddleware,
  resolveClientIpFromHeaders,
  invalidateAuthSession,
  resolveAuthenticatedSessionClaims,
  resolveApiSecurityConfig,
  verifySignedAuthSessionToken,
  createStorageQuotaMiddleware,
  type AuthSessionClaims,
  type EnvMap,
} from "./security";
```

- [ ] **Step 2: Add DATA_DIR constant and wire the middleware into the chain**

After the layout body limit middleware (after `app.use("/api/layouts/*", layoutBodyLimit);`) and before the `mountWithAlias` calls, add the storage quota middleware:

```typescript
// Storage quota — enforce layout and asset count limits on write operations.
// Applied after body limits (so request body is already validated) and before
// route handlers. Skips check when both quotas are unlimited (max=0).
const dataDir = env.DATA_DIR ?? "./data";
const storageQuotaMiddleware = createStorageQuotaMiddleware({
  dataDir,
  maxLayouts: securityConfig.maxLayouts,
  maxAssetsPerLayout: securityConfig.maxAssetsPerLayout,
});

app.use("/layouts/*", storageQuotaMiddleware);
app.use("/api/layouts/*", storageQuotaMiddleware);
app.use("/assets/*", storageQuotaMiddleware);
app.use("/api/assets/*", storageQuotaMiddleware);
```

This places the quota middleware in the correct position in the chain: after auth, CSRF, origin-policy, write-auth, admin-auth, and body-limits, but before the route handlers.

- [ ] **Step 3: Run all tests to verify integration**

Run: `cd api && bun test` Expected: All tests pass, including the new quota tests

- [ ] **Step 4: Commit**

```bash
git add api/src/app.ts
git commit -m "feat(api): wire storage quota middleware into app chain (#1780)"
```

---

### Task 8: Update .env.example with quota configuration

**Files:**

- Modify: `api/.env.example`

- [ ] **Step 1: Add storage quota environment variables**

After the server configuration section (after `NODE_ENV=development`), add a new section:

```env
# ========================================
# Storage Quotas
# ========================================

# Maximum number of layouts (0 = unlimited, default: 100)
# RACKULA_MAX_LAYOUTS=100

# Maximum number of assets per layout (0 = unlimited, default: 50)
# RACKULA_MAX_ASSETS_PER_LAYOUT=50
```

- [ ] **Step 2: Commit**

```bash
git add api/.env.example
git commit -m "docs(api): add storage quota environment variables to .env.example (#1780)"
```

---

### Task 9: Update deployment documentation

**Files:**

- Modify: `docs/deployment/SELF-HOSTING.md`

- [ ] **Step 1: Read the current SELF-HOSTING.md to find the right location**

Read `docs/deployment/SELF-HOSTING.md` to understand its structure and find where to add quota configuration.

- [ ] **Step 2: Add storage quota section to deployment docs**

Add a section on storage quota configuration, following the existing document's format. Include:

- What the quotas do
- Default values
- How to configure via environment variables
- How to disable quotas (set to 0)
- Monitoring guidance (log namespace `rackula:quota`)

- [ ] **Step 3: Commit**

```bash
git add docs/deployment/SELF-HOSTING.md
git commit -m "docs: add storage quota configuration to self-hosting guide (#1780)"
```

---

### Task 10: Run full test suite and verify integration

- [ ] **Step 1: Run the full API test suite**

Run: `cd api && bun test` Expected: All tests pass, including existing security, storage, and new quota tests

- [ ] **Step 2: Run the full project lint check**

Run: `npm run lint` Expected: No lint errors

- [ ] **Step 3: Verify the app starts with default config**

Run: `cd api && DATA_DIR=/tmp/rackula-verify bun run src/index.ts &` then send a test request:

```bash
curl -s http://localhost:3001/health | head -20
kill %1
```

Expected: Health endpoint responds with `{"ok":true,"status":"ok",...}`

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(api): address any issues from integration testing (#1780)"
```

(Only commit if there were fixes needed.)

---

### Task 11: Create PR and close issue

- [ ] **Step 1: Push the branch and create a PR**

```bash
git push -u origin feat/1780-storage-quota
gh pr create \
  --title "feat(api): storage abuse guardrails (quota/retention) (#1780)" \
  --body "## Summary
- Add layout count quota (default: 100, env: RACKULA_MAX_LAYOUTS)
- Add per-layout asset count quota (default: 50, env: RACKULA_MAX_ASSETS_PER_LAYOUT)
- Quota checks happen at middleware level before write handlers
- Layout quota only enforced on create (not update)
- 429 for layout limit, 507 for asset limit
- 0 = unlimited (backward compatible)
- Debug logging via rackula:quota namespace

## Test Plan
- [x] Unit tests for checkLayoutQuota and checkAssetQuota
- [x] Unit tests for storage quota middleware (layout create/update, asset upload, unlimited mode)
- [x] Full API test suite passes
- [x] Lint check passes
- [x] App starts with default config

Closes #1780"
```

- [ ] **Step 2: Wait for CodeRabbit review and address feedback**

- [ ] **Step 3: Merge after approval**
