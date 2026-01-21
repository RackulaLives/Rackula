# Persistent Storage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable self-hosted Rackula deployments to persist layouts to Docker volumes via an optional API sidecar, while maintaining the zero-config static deployment model for SaaS.

**Architecture:** Filesystem-based persistence with a tiny API sidecar. The SPA communicates with `/api/layouts/*` and `/api/assets/*` endpoints when persistence is enabled. nginx proxies API requests to the sidecar container. When `RACKULA_PERSIST_ENABLED=false` (default), the app behaves exactly as today.

**Tech Stack:** Bun (API sidecar), YAML files on disk, Docker Compose profiles, Zod validation, bits-ui Progress

---

## Design Decisions (from Architectural Review)

| Decision          | Choice                                     | Rationale                                   |
| ----------------- | ------------------------------------------ | ------------------------------------------- |
| Image assets      | Add `/api/assets/*` endpoints              | Complete solution for custom device images  |
| Conflict handling | Last-write-wins                            | KISS - users unlikely to have multiple tabs |
| Save feedback     | Subtle status indicator (bits-ui Progress) | Non-intrusive but informative               |
| ID collisions     | Track `currentLayoutId`, handle rename     | Explicit behavior, delete old + create new  |
| Import support    | Add Import button to StartScreen           | Common onboarding flow                      |
| List metadata     | Add rack/device counts                     | Lightweight, helps identify layouts         |
| API fallback      | Fall back to localStorage with warning     | App remains usable if API down              |
| Unicode names     | UUID suffix for empty slugs                | Supports all-Unicode names like "我的机架"  |
| Corrupted files   | Show with error badge, block opening       | Users see their files, can delete them      |
| Multi-user        | Document as single-user design             | KISS - no locking, no sessions              |

---

## Phase 1: API Sidecar Implementation

### Task 1: Create API Sidecar Package Structure

**Files:**

- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/.gitignore`

#### Step 1: Create package.json

```json
{
  "name": "@rackula/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "test": "bun test",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.7.0",
    "zod": "^3.24.1",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@types/bun": "^1.1.14",
    "@types/js-yaml": "^4.0.9",
    "typescript": "^5.7.3"
  }
}
```

#### Step 2: Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

#### Step 3: Create .gitignore

```
node_modules/
*.log
```

#### Step 4: Commit

```bash
git add api/
git commit -m "chore: scaffold API sidecar package structure"
```

---

### Task 2: Implement Layout Schema for API

**Files:**

- Create: `api/src/schemas/layout.ts`

#### Step 1: Create the schema file

```typescript
/**
 * Layout validation schemas for API
 * Mirrors src/lib/schemas/index.ts from main app
 */
import { z } from "zod";

// Minimal schema for layout metadata (we don't need full validation here)
// The full schema validation happens in the SPA
export const LayoutMetadataSchema = z.object({
  version: z.string(),
  name: z.string().min(1, "Layout name is required"),
  racks: z
    .array(
      z.object({
        devices: z.array(z.unknown()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
});

// Schema for layout ID (filename without extension)
export const LayoutIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
    "Layout ID must be lowercase alphanumeric with hyphens, not starting/ending with hyphen",
  );

// Layout list item returned by GET /api/layouts (with counts)
export const LayoutListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  updatedAt: z.string().datetime(),
  rackCount: z.number(),
  deviceCount: z.number(),
  valid: z.boolean().default(true), // false if YAML is corrupted
});

export type LayoutMetadata = z.infer<typeof LayoutMetadataSchema>;
export type LayoutListItem = z.infer<typeof LayoutListItemSchema>;
```

#### Step 2: Commit

```bash
git add api/src/schemas/layout.ts
git commit -m "feat(api): add layout validation schemas with counts"
```

---

### Task 3: Implement File System Storage Layer

**Files:**

- Create: `api/src/storage/filesystem.ts`

#### Step 1: Create the storage layer

```typescript
/**
 * Filesystem storage layer for layouts
 * Reads/writes YAML files to DATA_DIR
 */
import {
  readdir,
  readFile,
  writeFile,
  unlink,
  stat,
  mkdir,
} from "node:fs/promises";
import { join, basename } from "node:path";
import * as yaml from "js-yaml";
import { LayoutMetadataSchema, type LayoutListItem } from "../schemas/layout";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const ASSETS_DIR = "assets";

/**
 * Ensure data directory exists
 */
export async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(join(DATA_DIR, ASSETS_DIR), { recursive: true });
}

/**
 * Slugify a layout name to create a safe filename
 * Handles Unicode names by appending UUID suffix if result is empty
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  // Handle empty results (e.g., all-Unicode names like "我的机架")
  if (!slug) {
    const uuid = crypto.randomUUID().slice(0, 8);
    return `untitled-${uuid}`;
  }

  return slug;
}

/**
 * Count devices across all racks in a layout
 */
function countDevices(racks: Array<{ devices?: unknown[] }>): number {
  return racks.reduce((sum, rack) => sum + (rack.devices?.length ?? 0), 0);
}

/**
 * List all layouts in the data directory
 * Returns invalid files with valid: false so UI can show error badge
 */
export async function listLayouts(): Promise<LayoutListItem[]> {
  await ensureDataDir();

  const files = await readdir(DATA_DIR);
  const yamlFiles = files.filter(
    (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
  );

  const layouts: LayoutListItem[] = [];

  for (const file of yamlFiles) {
    const filePath = join(DATA_DIR, file);
    const id = basename(file, ".yaml").replace(".yml", "");

    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = yaml.load(content) as unknown;
      const metadata = LayoutMetadataSchema.safeParse(parsed);
      const stats = await stat(filePath);

      if (metadata.success) {
        const racks = metadata.data.racks ?? [];
        layouts.push({
          id,
          name: metadata.data.name,
          version: metadata.data.version,
          updatedAt: stats.mtime.toISOString(),
          rackCount: racks.length,
          deviceCount: countDevices(racks),
          valid: true,
        });
      } else {
        // Invalid YAML structure - include with error flag
        layouts.push({
          id,
          name: id, // Use filename as name
          version: "unknown",
          updatedAt: stats.mtime.toISOString(),
          rackCount: 0,
          deviceCount: 0,
          valid: false,
        });
        console.warn(`Invalid layout file: ${file}`, metadata.error.message);
      }
    } catch (e) {
      // File read/parse error - include with error flag
      const stats = await stat(filePath).catch(() => ({ mtime: new Date() }));
      layouts.push({
        id,
        name: id,
        version: "unknown",
        updatedAt: stats.mtime.toISOString(),
        rackCount: 0,
        deviceCount: 0,
        valid: false,
      });
      console.warn(`Failed to read layout file: ${file}`, e);
    }
  }

  // Sort by most recently updated
  return layouts.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/**
 * Get a single layout by ID
 */
export async function getLayout(id: string): Promise<string | null> {
  await ensureDataDir();

  // Try .yaml first, then .yml
  for (const ext of [".yaml", ".yml"]) {
    const filePath = join(DATA_DIR, `${id}${ext}`);
    try {
      return await readFile(filePath, "utf-8");
    } catch {
      // File doesn't exist with this extension
    }
  }

  return null;
}

/**
 * Save a layout (create or update)
 * Returns the layout ID (may differ from input if name changed)
 */
export async function saveLayout(
  yamlContent: string,
  existingId?: string,
): Promise<{ id: string; isNew: boolean }> {
  await ensureDataDir();

  // Parse to get the name for the filename
  const parsed = yaml.load(yamlContent) as unknown;
  const metadata = LayoutMetadataSchema.parse(parsed);
  const newId = slugify(metadata.name);

  // If updating and the ID changed (name changed), delete the old file
  if (existingId && existingId !== newId) {
    await deleteLayout(existingId);
  }

  const filePath = join(DATA_DIR, `${newId}.yaml`);

  // Check if this is a new layout
  let isNew = true;
  try {
    await stat(filePath);
    isNew = false;
  } catch {
    // File doesn't exist, it's new
  }

  await writeFile(filePath, yamlContent, "utf-8");

  return { id: newId, isNew };
}

/**
 * Delete a layout by ID
 */
export async function deleteLayout(id: string): Promise<boolean> {
  for (const ext of [".yaml", ".yml"]) {
    const filePath = join(DATA_DIR, `${id}${ext}`);
    try {
      await unlink(filePath);
      return true;
    } catch {
      // File doesn't exist with this extension
    }
  }
  return false;
}

/**
 * Get assets directory path for a layout
 */
export function getAssetsDir(): string {
  return join(DATA_DIR, ASSETS_DIR);
}

/**
 * Get asset path for a specific layout/device/face
 */
export function getAssetPath(
  layoutId: string,
  deviceSlug: string,
  face: "front" | "rear",
  ext: string,
): string {
  return join(getAssetsDir(), layoutId, deviceSlug, `${face}.${ext}`);
}
```

#### Step 2: Commit

```bash
git add api/src/storage/filesystem.ts
git commit -m "feat(api): implement filesystem storage layer with counts"
```

---

### Task 4: Implement Asset Storage Layer

**Files:**

- Create: `api/src/storage/assets.ts`

#### Step 1: Create the asset storage layer

```typescript
/**
 * Asset storage layer for device images
 * Handles upload/download of images to DATA_DIR/assets/
 */
import {
  readFile,
  writeFile,
  unlink,
  mkdir,
  readdir,
  rm,
} from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { getAssetsDir } from "./filesystem";

// Allowed image types
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export interface AssetInfo {
  layoutId: string;
  deviceSlug: string;
  face: "front" | "rear";
  ext: string;
  size: number;
}

/**
 * Validate image content type
 */
export function isValidImageType(contentType: string): boolean {
  return ALLOWED_TYPES.has(contentType);
}

/**
 * Get extension from content type
 */
export function getExtFromContentType(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

/**
 * Get content type from extension
 */
export function getContentTypeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

/**
 * Build asset path
 */
function buildAssetPath(
  layoutId: string,
  deviceSlug: string,
  face: string,
  ext: string,
): string {
  return join(getAssetsDir(), layoutId, deviceSlug, `${face}.${ext}`);
}

/**
 * Save an asset image
 */
export async function saveAsset(
  layoutId: string,
  deviceSlug: string,
  face: "front" | "rear",
  data: ArrayBuffer,
  contentType: string,
): Promise<void> {
  if (!isValidImageType(contentType)) {
    throw new Error(`Invalid content type: ${contentType}`);
  }

  if (data.byteLength > MAX_SIZE) {
    throw new Error(
      `Image too large: ${data.byteLength} bytes (max ${MAX_SIZE})`,
    );
  }

  const ext = getExtFromContentType(contentType);
  const assetPath = buildAssetPath(layoutId, deviceSlug, face, ext);

  // Ensure directory exists
  await mkdir(dirname(assetPath), { recursive: true });

  // Delete any existing file with different extension
  for (const oldExt of ["png", "jpg", "webp"]) {
    if (oldExt !== ext) {
      try {
        await unlink(buildAssetPath(layoutId, deviceSlug, face, oldExt));
      } catch {
        // Ignore if doesn't exist
      }
    }
  }

  // Write new file
  await writeFile(assetPath, Buffer.from(data));
}

/**
 * Get an asset image
 */
export async function getAsset(
  layoutId: string,
  deviceSlug: string,
  face: "front" | "rear",
): Promise<{ data: Buffer; contentType: string } | null> {
  // Try each extension
  for (const ext of ["png", "jpg", "webp"]) {
    const assetPath = buildAssetPath(layoutId, deviceSlug, face, ext);
    try {
      const data = await readFile(assetPath);
      return {
        data,
        contentType: getContentTypeFromExt(ext),
      };
    } catch {
      // Try next extension
    }
  }

  return null;
}

/**
 * Delete an asset image
 */
export async function deleteAsset(
  layoutId: string,
  deviceSlug: string,
  face: "front" | "rear",
): Promise<boolean> {
  let deleted = false;

  for (const ext of ["png", "jpg", "webp"]) {
    const assetPath = buildAssetPath(layoutId, deviceSlug, face, ext);
    try {
      await unlink(assetPath);
      deleted = true;
    } catch {
      // Ignore if doesn't exist
    }
  }

  return deleted;
}

/**
 * Delete all assets for a layout
 */
export async function deleteLayoutAssets(layoutId: string): Promise<void> {
  const layoutAssetsDir = join(getAssetsDir(), layoutId);
  try {
    await rm(layoutAssetsDir, { recursive: true });
  } catch {
    // Ignore if doesn't exist
  }
}

/**
 * List all assets for a layout
 */
export async function listLayoutAssets(layoutId: string): Promise<AssetInfo[]> {
  const layoutAssetsDir = join(getAssetsDir(), layoutId);
  const assets: AssetInfo[] = [];

  try {
    const deviceDirs = await readdir(layoutAssetsDir);

    for (const deviceSlug of deviceDirs) {
      const deviceDir = join(layoutAssetsDir, deviceSlug);
      try {
        const files = await readdir(deviceDir);

        for (const file of files) {
          const match = file.match(/^(front|rear)\.(png|jpg|webp)$/);
          if (match) {
            const filePath = join(deviceDir, file);
            const { size } = await import("node:fs/promises").then((fs) =>
              fs.stat(filePath),
            );
            assets.push({
              layoutId,
              deviceSlug,
              face: match[1] as "front" | "rear",
              ext: match[2],
              size,
            });
          }
        }
      } catch {
        // Skip invalid directories
      }
    }
  } catch {
    // Layout has no assets
  }

  return assets;
}
```

#### Step 2: Commit

```bash
git add api/src/storage/assets.ts
git commit -m "feat(api): implement asset storage layer for images"
```

---

### Task 5: Implement Hono API Routes

**Files:**

- Create: `api/src/routes/layouts.ts`
- Create: `api/src/routes/assets.ts`
- Create: `api/src/index.ts`

#### Step 1: Create the layouts routes

```typescript
/**
 * Layout API routes
 * GET    /api/layouts     - List all layouts
 * GET    /api/layouts/:id - Get layout by ID
 * PUT    /api/layouts/:id - Create or update layout
 * DELETE /api/layouts/:id - Delete layout
 */
import { Hono } from "hono";
import { LayoutIdSchema } from "../schemas/layout";
import {
  listLayouts,
  getLayout,
  saveLayout,
  deleteLayout,
} from "../storage/filesystem";
import { deleteLayoutAssets } from "../storage/assets";

const layouts = new Hono();

// List all layouts
layouts.get("/", async (c) => {
  try {
    const items = await listLayouts();
    return c.json({ layouts: items });
  } catch (error) {
    console.error("Failed to list layouts:", error);
    return c.json({ error: "Failed to list layouts" }, 500);
  }
});

// Get a single layout
layouts.get("/:id", async (c) => {
  const id = c.req.param("id");

  const idResult = LayoutIdSchema.safeParse(id);
  if (!idResult.success) {
    return c.json({ error: "Invalid layout ID format" }, 400);
  }

  try {
    const content = await getLayout(id);
    if (!content) {
      return c.json({ error: "Layout not found" }, 404);
    }

    return c.text(content, 200, { "Content-Type": "text/yaml" });
  } catch (error) {
    console.error(`Failed to get layout ${id}:`, error);
    return c.json({ error: "Failed to get layout" }, 500);
  }
});

// Create or update a layout
layouts.put("/:id", async (c) => {
  const id = c.req.param("id");

  const idResult = LayoutIdSchema.safeParse(id);
  if (!idResult.success) {
    return c.json({ error: "Invalid layout ID format" }, 400);
  }

  try {
    const yamlContent = await c.req.text();

    if (!yamlContent.trim()) {
      return c.json({ error: "Request body is empty" }, 400);
    }

    const result = await saveLayout(yamlContent, id);

    return c.json(
      {
        id: result.id,
        message: result.isNew ? "Layout created" : "Layout updated",
      },
      result.isNew ? 201 : 200,
    );
  } catch (error) {
    console.error(`Failed to save layout ${id}:`, error);

    if (error instanceof Error && error.message.includes("required")) {
      return c.json({ error: error.message }, 400);
    }

    return c.json({ error: "Failed to save layout" }, 500);
  }
});

// Delete a layout
layouts.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const idResult = LayoutIdSchema.safeParse(id);
  if (!idResult.success) {
    return c.json({ error: "Invalid layout ID format" }, 400);
  }

  try {
    const deleted = await deleteLayout(id);
    if (!deleted) {
      return c.json({ error: "Layout not found" }, 404);
    }

    // Also delete associated assets
    await deleteLayoutAssets(id);

    return c.json({ message: "Layout deleted" }, 200);
  } catch (error) {
    console.error(`Failed to delete layout ${id}:`, error);
    return c.json({ error: "Failed to delete layout" }, 500);
  }
});

export default layouts;
```

#### Step 2: Create the assets routes

```typescript
/**
 * Asset API routes
 * GET    /api/assets/:layoutId/:deviceSlug/:face - Get asset image
 * PUT    /api/assets/:layoutId/:deviceSlug/:face - Upload asset image
 * DELETE /api/assets/:layoutId/:deviceSlug/:face - Delete asset image
 */
import { Hono } from "hono";
import { LayoutIdSchema } from "../schemas/layout";
import {
  getAsset,
  saveAsset,
  deleteAsset,
  isValidImageType,
} from "../storage/assets";

const assets = new Hono();

// Validate face parameter
function isValidFace(face: string): face is "front" | "rear" {
  return face === "front" || face === "rear";
}

// Get an asset
assets.get("/:layoutId/:deviceSlug/:face", async (c) => {
  const { layoutId, deviceSlug, face } = c.req.param();

  const idResult = LayoutIdSchema.safeParse(layoutId);
  if (!idResult.success) {
    return c.json({ error: "Invalid layout ID format" }, 400);
  }

  if (!isValidFace(face)) {
    return c.json({ error: "Face must be 'front' or 'rear'" }, 400);
  }

  try {
    const asset = await getAsset(layoutId, deviceSlug, face);
    if (!asset) {
      return c.json({ error: "Asset not found" }, 404);
    }

    return c.body(asset.data, 200, {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  } catch (error) {
    console.error(`Failed to get asset:`, error);
    return c.json({ error: "Failed to get asset" }, 500);
  }
});

// Upload an asset
assets.put("/:layoutId/:deviceSlug/:face", async (c) => {
  const { layoutId, deviceSlug, face } = c.req.param();

  const idResult = LayoutIdSchema.safeParse(layoutId);
  if (!idResult.success) {
    return c.json({ error: "Invalid layout ID format" }, 400);
  }

  if (!isValidFace(face)) {
    return c.json({ error: "Face must be 'front' or 'rear'" }, 400);
  }

  const contentType = c.req.header("Content-Type") ?? "";
  if (!isValidImageType(contentType)) {
    return c.json(
      {
        error:
          "Invalid content type. Must be image/png, image/jpeg, or image/webp",
      },
      400,
    );
  }

  try {
    const data = await c.req.arrayBuffer();
    await saveAsset(layoutId, deviceSlug, face, data, contentType);

    return c.json({ message: "Asset uploaded" }, 200);
  } catch (error) {
    console.error(`Failed to save asset:`, error);

    if (error instanceof Error && error.message.includes("too large")) {
      return c.json({ error: error.message }, 413);
    }

    return c.json({ error: "Failed to save asset" }, 500);
  }
});

// Delete an asset
assets.delete("/:layoutId/:deviceSlug/:face", async (c) => {
  const { layoutId, deviceSlug, face } = c.req.param();

  const idResult = LayoutIdSchema.safeParse(layoutId);
  if (!idResult.success) {
    return c.json({ error: "Invalid layout ID format" }, 400);
  }

  if (!isValidFace(face)) {
    return c.json({ error: "Face must be 'front' or 'rear'" }, 400);
  }

  try {
    const deleted = await deleteAsset(layoutId, deviceSlug, face);
    if (!deleted) {
      return c.json({ error: "Asset not found" }, 404);
    }

    return c.json({ message: "Asset deleted" }, 200);
  } catch (error) {
    console.error(`Failed to delete asset:`, error);
    return c.json({ error: "Failed to delete asset" }, 500);
  }
});

export default assets;
```

#### Step 3: Create the main entry point

```typescript
/**
 * Rackula API Sidecar
 * Provides persistence layer for self-hosted deployments
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import layouts from "./routes/layouts";
import assets from "./routes/assets";
import { ensureDataDir } from "./storage/filesystem";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

// Health check
app.get("/health", (c) => c.text("OK"));

// Mount routes
app.route("/api/layouts", layouts);
app.route("/api/assets", assets);

// 404 handler
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Startup
const port = parseInt(process.env.PORT ?? "3001", 10);

await ensureDataDir();

console.log(`Rackula API listening on port ${port}`);
console.log(`Data directory: ${process.env.DATA_DIR ?? "/data"}`);

export default {
  port,
  fetch: app.fetch,
};
```

#### Step 4: Commit

```bash
git add api/src/
git commit -m "feat(api): implement Hono API routes for layouts and assets"
```

---

### Task 6: Add API Tests

**Files:**

- Create: `api/src/storage/filesystem.test.ts`
- Create: `api/src/routes/layouts.test.ts`

#### Step 1: Create storage tests

```typescript
/**
 * Filesystem storage tests
 */
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Override DATA_DIR before importing storage module
const testDir = await mkdtemp(join(tmpdir(), "rackula-test-"));
process.env.DATA_DIR = testDir;

const { listLayouts, getLayout, saveLayout, deleteLayout, slugify } =
  await import("./filesystem");

describe("slugify", () => {
  it("converts name to lowercase slug", () => {
    expect(slugify("My Home Lab")).toBe("my-home-lab");
  });

  it("handles special characters", () => {
    expect(slugify("Rack #1 (Main)")).toBe("rack-1-main");
  });

  it("handles empty string with UUID suffix", () => {
    const result = slugify("");
    expect(result).toMatch(/^untitled-[a-f0-9]{8}$/);
  });

  it("handles all-Unicode names with UUID suffix", () => {
    const result = slugify("我的机架");
    expect(result).toMatch(/^untitled-[a-f0-9]{8}$/);
  });

  it("truncates long names", () => {
    const longName = "a".repeat(200);
    expect(slugify(longName).length).toBeLessThanOrEqual(100);
  });
});

describe("listLayouts", () => {
  it("returns empty array when no layouts exist", async () => {
    const layouts = await listLayouts();
    expect(layouts).toEqual([]);
  });

  it("lists valid YAML files with counts", async () => {
    await writeFile(
      join(testDir, "test-layout.yaml"),
      `version: "1.0.0"
name: Test Layout
racks:
  - devices:
      - id: d1
      - id: d2
  - devices:
      - id: d3`,
    );

    const layouts = await listLayouts();
    expect(layouts.length).toBe(1);
    expect(layouts[0].id).toBe("test-layout");
    expect(layouts[0].name).toBe("Test Layout");
    expect(layouts[0].rackCount).toBe(2);
    expect(layouts[0].deviceCount).toBe(3);
  });
});

describe("saveLayout and getLayout", () => {
  it("saves and retrieves layout", async () => {
    const yamlContent = 'version: "1.0.0"\nname: My Layout\nracks: []';
    const result = await saveLayout(yamlContent, "my-layout");

    expect(result.id).toBe("my-layout");
    expect(result.isNew).toBe(true);

    const retrieved = await getLayout("my-layout");
    expect(retrieved).toBe(yamlContent);
  });

  it("handles rename by deleting old file", async () => {
    // Create original
    await saveLayout('version: "1.0.0"\nname: Original\nracks: []', "original");

    // Rename by saving with new name but passing old ID
    await saveLayout('version: "1.0.0"\nname: Renamed\nracks: []', "original");

    // Old file should be gone
    const oldLayout = await getLayout("original");
    expect(oldLayout).toBeNull();

    // New file should exist
    const newLayout = await getLayout("renamed");
    expect(newLayout).toContain("Renamed");
  });
});

describe("deleteLayout", () => {
  it("deletes existing layout", async () => {
    await writeFile(
      join(testDir, "to-delete.yaml"),
      'version: "1.0.0"\nname: To Delete\nracks: []',
    );

    const deleted = await deleteLayout("to-delete");
    expect(deleted).toBe(true);

    const result = await getLayout("to-delete");
    expect(result).toBeNull();
  });

  it("returns false for non-existent layout", async () => {
    const deleted = await deleteLayout("does-not-exist");
    expect(deleted).toBe(false);
  });
});

// Cleanup
afterAll(async () => {
  await rm(testDir, { recursive: true });
});
```

#### Step 2: Run tests

Run: `cd api && bun test`
Expected: All tests pass

#### Step 3: Commit

```bash
git add api/src/*.test.ts
git commit -m "test(api): add storage and route tests"
```

---

### Task 7: Create API Dockerfile

**Files:**

- Create: `api/Dockerfile`

#### Step 1: Create the Dockerfile

```dockerfile
# Rackula API Sidecar
# Tiny Bun-based API for layout persistence
FROM oven/bun:1-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Production image
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 rackula && \
    adduser --system --uid 1001 rackula

# Copy dependencies and source
COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/

# Create data directory
RUN mkdir -p /data && chown rackula:rackula /data

# OCI labels
LABEL org.opencontainers.image.source="https://github.com/RackulaLives/Rackula"
LABEL org.opencontainers.image.description="Rackula API Sidecar for persistent storage"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.title="Rackula API"

USER rackula

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3001/health || exit 1

CMD ["bun", "src/index.ts"]
```

#### Step 2: Commit

```bash
git add api/Dockerfile
git commit -m "build(api): add Dockerfile for API sidecar"
```

---

## Phase 2: SPA Client Integration

### Task 8: Add Persistence Configuration

**Files:**

- Create: `src/lib/utils/persistence-config.ts`

#### Step 1: Create the configuration module

```typescript
/**
 * Persistence Configuration
 * Reads environment variables to determine persistence mode
 */

/**
 * Whether persistence is enabled
 * Set via VITE_PERSIST_ENABLED at build time
 */
export const PERSIST_ENABLED: boolean =
  import.meta.env.VITE_PERSIST_ENABLED === "true";

/**
 * API base URL for persistence endpoints
 * Defaults to /api (proxied by nginx in Docker)
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "/api";

/**
 * Check if persistence features should be shown
 */
export function isPersistenceAvailable(): boolean {
  return PERSIST_ENABLED;
}
```

#### Step 2: Commit

```bash
git add src/lib/utils/persistence-config.ts
git commit -m "feat: add persistence configuration module"
```

---

### Task 9: Implement Persistence API Client

**Files:**

- Create: `src/lib/utils/persistence-api.ts`

#### Step 1: Create the API client

```typescript
/**
 * Persistence API Client
 * Communicates with the API sidecar for layout CRUD
 */
import { API_BASE_URL, isPersistenceAvailable } from "./persistence-config";
import type { Layout } from "$lib/types";
import { serializeLayoutToYaml, parseLayoutYaml } from "./yaml";
import { slugify } from "./slug";

/**
 * Layout list item from API
 */
export interface SavedLayoutItem {
  id: string;
  name: string;
  version: string;
  updatedAt: string;
  rackCount: number;
  deviceCount: number;
  valid: boolean; // false if YAML is corrupted
}

/**
 * Save status for UI feedback
 */
export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

interface ListResponse {
  layouts: SavedLayoutItem[];
}

interface SaveResponse {
  id: string;
  message: string;
}

interface ErrorResponse {
  error: string;
}

/**
 * Custom error for API failures
 */
export class PersistenceError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "PersistenceError";
  }
}

/**
 * Check if API is reachable
 */
export async function checkApiHealth(): Promise<boolean> {
  if (!isPersistenceAvailable()) return false;

  try {
    const response = await fetch(`${API_BASE_URL.replace("/api", "")}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List all saved layouts
 */
export async function listSavedLayouts(): Promise<SavedLayoutItem[]> {
  if (!isPersistenceAvailable()) {
    return [];
  }

  const response = await fetch(`${API_BASE_URL}/layouts`);

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse;
    throw new PersistenceError(
      error.error ?? "Failed to list layouts",
      response.status,
    );
  }

  const data = (await response.json()) as ListResponse;
  return data.layouts;
}

/**
 * Load a layout by ID
 */
export async function loadSavedLayout(id: string): Promise<Layout> {
  if (!isPersistenceAvailable()) {
    throw new PersistenceError("Persistence not available");
  }

  const response = await fetch(
    `${API_BASE_URL}/layouts/${encodeURIComponent(id)}`,
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new PersistenceError("Layout not found", 404);
    }
    const error = (await response.json()) as ErrorResponse;
    throw new PersistenceError(
      error.error ?? "Failed to load layout",
      response.status,
    );
  }

  const yamlContent = await response.text();
  return parseLayoutYaml(yamlContent);
}

/**
 * Save a layout (create or update)
 * @param layout - The layout to save
 * @param currentId - The current layout ID (for rename detection)
 * @returns The saved layout ID
 */
export async function saveLayoutToServer(
  layout: Layout,
  currentId?: string,
): Promise<string> {
  if (!isPersistenceAvailable()) {
    throw new PersistenceError("Persistence not available");
  }

  const newId = slugify(layout.name) || "untitled";
  const yamlContent = await serializeLayoutToYaml(layout);

  // Pass current ID as query param for rename handling
  const url =
    currentId && currentId !== newId
      ? `${API_BASE_URL}/layouts/${encodeURIComponent(currentId)}`
      : `${API_BASE_URL}/layouts/${encodeURIComponent(newId)}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "text/yaml" },
    body: yamlContent,
  });

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse;
    throw new PersistenceError(
      error.error ?? "Failed to save layout",
      response.status,
    );
  }

  const data = (await response.json()) as SaveResponse;
  return data.id;
}

/**
 * Delete a saved layout
 */
export async function deleteSavedLayout(id: string): Promise<void> {
  if (!isPersistenceAvailable()) {
    throw new PersistenceError("Persistence not available");
  }

  const response = await fetch(
    `${API_BASE_URL}/layouts/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new PersistenceError("Layout not found", 404);
    }
    const error = (await response.json()) as ErrorResponse;
    throw new PersistenceError(
      error.error ?? "Failed to delete layout",
      response.status,
    );
  }
}

/**
 * Upload an asset image
 */
export async function uploadAsset(
  layoutId: string,
  deviceSlug: string,
  face: "front" | "rear",
  blob: Blob,
): Promise<void> {
  if (!isPersistenceAvailable()) {
    throw new PersistenceError("Persistence not available");
  }

  const response = await fetch(
    `${API_BASE_URL}/assets/${encodeURIComponent(layoutId)}/${encodeURIComponent(deviceSlug)}/${face}`,
    {
      method: "PUT",
      headers: { "Content-Type": blob.type },
      body: blob,
    },
  );

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse;
    throw new PersistenceError(
      error.error ?? "Failed to upload asset",
      response.status,
    );
  }
}

/**
 * Get asset URL for display
 */
export function getAssetUrl(
  layoutId: string,
  deviceSlug: string,
  face: "front" | "rear",
): string {
  return `${API_BASE_URL}/assets/${encodeURIComponent(layoutId)}/${encodeURIComponent(deviceSlug)}/${face}`;
}
```

#### Step 2: Commit

```bash
git add src/lib/utils/persistence-api.ts
git commit -m "feat: implement persistence API client with asset support"
```

---

### Task 10: Create Save Status Indicator Component

**Files:**

- Create: `src/lib/components/SaveStatus.svelte`

#### Step 1: Create the component using bits-ui Progress

```svelte
<!--
  SaveStatus - Subtle save status indicator for toolbar
  Uses bits-ui Progress for indeterminate saving state
-->
<script lang="ts">
  import { Progress } from "bits-ui";
  import type { SaveStatus } from "$lib/utils/persistence-api";
  import { fade } from "svelte/transition";
  import IconCheck from "./icons/IconCheck.svelte";
  import IconWarning from "./icons/IconWarning.svelte";
  import IconCloudOff from "./icons/IconCloudOff.svelte";

  interface Props {
    status: SaveStatus;
  }

  let { status }: Props = $props();

  // Auto-hide "saved" after 2 seconds
  let showSaved = $state(false);

  $effect(() => {
    if (status === "saved") {
      showSaved = true;
      const timeout = setTimeout(() => {
        showSaved = false;
      }, 2000);
      return () => clearTimeout(timeout);
    } else {
      showSaved = false;
    }
  });

  const shouldShow = $derived(
    status === "saving" ||
      status === "error" ||
      status === "offline" ||
      (status === "saved" && showSaved),
  );
</script>

{#if shouldShow}
  <div class="save-status" transition:fade={{ duration: 150 }}>
    {#if status === "saving"}
      <Progress.Root
        value={null}
        class="progress-root"
        aria-label="Saving layout"
      >
        <Progress.Indicator class="progress-indicator" />
      </Progress.Root>
      <span class="status-text">Saving...</span>
    {:else if status === "saved"}
      <IconCheck size={14} />
      <span class="status-text">Saved</span>
    {:else if status === "error"}
      <IconWarning size={14} />
      <span class="status-text error">Save failed</span>
    {:else if status === "offline"}
      <IconCloudOff size={14} />
      <span class="status-text warning">Offline</span>
    {/if}
  </div>
{/if}

<style>
  .save-status {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: 0.75rem;
    color: var(--color-text-muted);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
  }

  .status-text {
    white-space: nowrap;
  }

  .status-text.error {
    color: var(--color-error);
  }

  .status-text.warning {
    color: var(--color-warning);
  }

  :global(.progress-root) {
    width: 40px;
    height: 3px;
    background: var(--color-border);
    border-radius: 2px;
    overflow: hidden;
  }

  :global(.progress-indicator) {
    height: 100%;
    width: 30%;
    background: var(--color-primary);
    border-radius: 2px;
    animation: indeterminate 1.5s ease-in-out infinite;
  }

  @keyframes indeterminate {
    0% {
      transform: translateX(-100%);
    }
    50% {
      transform: translateX(200%);
    }
    100% {
      transform: translateX(-100%);
    }
  }
</style>
```

#### Step 2: Commit

```bash
git add src/lib/components/SaveStatus.svelte
git commit -m "feat: add SaveStatus component with bits-ui Progress"
```

---

### Task 11: Create Start Screen Component

**Files:**

- Create: `src/lib/components/StartScreen.svelte`

#### Step 1: Create the component with Import support and fallback handling

```svelte
<!--
  StartScreen - Layout selection and creation
  Shown on app launch when persistence is enabled
  Includes: New Layout, Import from File, Saved Layouts list
  Falls back gracefully if API unavailable
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    listSavedLayouts,
    loadSavedLayout,
    deleteSavedLayout,
    checkApiHealth,
    type SavedLayoutItem,
    PersistenceError,
  } from "$lib/utils/persistence-api";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getImageStore } from "$lib/stores/images.svelte";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import { openFilePicker } from "$lib/utils/file";
  import { extractFolderArchive } from "$lib/utils/archive";
  import IconPlus from "$lib/components/icons/IconPlus.svelte";
  import IconTrash from "$lib/components/icons/IconTrash.svelte";
  import IconFolderOpen from "$lib/components/icons/IconFolderOpen.svelte";
  import IconUpload from "$lib/components/icons/IconUpload.svelte";
  import IconWarning from "$lib/components/icons/IconWarning.svelte";

  interface Props {
    onClose: (layoutId?: string) => void;
  }

  let { onClose }: Props = $props();

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  const imageStore = getImageStore();

  let layouts = $state<SavedLayoutItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let apiAvailable = $state(true);
  let deletingId = $state<string | null>(null);

  onMount(async () => {
    // Check API health first
    apiAvailable = await checkApiHealth();

    if (apiAvailable) {
      await loadLayouts();
    } else {
      loading = false;
      error = null; // Not an error, just offline mode
    }
  });

  async function loadLayouts() {
    loading = true;
    error = null;

    try {
      layouts = await listSavedLayouts();
    } catch (e) {
      error =
        e instanceof PersistenceError ? e.message : "Failed to load layouts";
      console.error("Failed to load layouts:", e);
    } finally {
      loading = false;
    }
  }

  async function handleOpenLayout(item: SavedLayoutItem) {
    // Don't allow opening invalid layouts
    if (!item.valid) {
      toastStore.error(`"${item.name}" is corrupted and cannot be opened`);
      return;
    }

    try {
      const layout = await loadSavedLayout(item.id);
      layoutStore.loadLayout(layout);
      toastStore.info(`Opened "${item.name}"`);
      onClose(item.id);
    } catch (e) {
      const message =
        e instanceof PersistenceError ? e.message : "Failed to open layout";
      toastStore.error(message);
    }
  }

  async function handleDeleteLayout(item: SavedLayoutItem, event: MouseEvent) {
    event.stopPropagation();
    if (deletingId) return;

    deletingId = item.id;

    try {
      await deleteSavedLayout(item.id);
      layouts = layouts.filter((l) => l.id !== item.id);
      toastStore.info(`Deleted "${item.name}"`);
    } catch (e) {
      const message =
        e instanceof PersistenceError ? e.message : "Failed to delete layout";
      toastStore.error(message);
    } finally {
      deletingId = null;
    }
  }

  function handleNewLayout() {
    layoutStore.resetLayout();
    dialogStore.open("newRack");
    onClose();
  }

  async function handleImportFile() {
    const file = await openFilePicker();
    if (!file) return;

    try {
      const { layout, images, failedImages } = await extractFolderArchive(file);

      layoutStore.loadLayout(layout);

      // Load images into image store
      for (const [key, deviceImages] of images) {
        if (deviceImages.front) {
          imageStore.setImage(key, "front", deviceImages.front);
        }
        if (deviceImages.rear) {
          imageStore.setImage(key, "rear", deviceImages.rear);
        }
      }

      if (failedImages.length > 0) {
        toastStore.warning(
          `Imported with ${failedImages.length} missing images`,
        );
      } else {
        toastStore.info(`Imported "${layout.name}"`);
      }

      onClose();
    } catch (e) {
      toastStore.error("Failed to import file");
      console.error("Import failed:", e);
    }
  }

  function handleContinueOffline() {
    // Load from localStorage if available, otherwise start fresh
    onClose();
  }

  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatCounts(item: SavedLayoutItem): string {
    const racks = item.rackCount === 1 ? "1 rack" : `${item.rackCount} racks`;
    const devices =
      item.deviceCount === 1 ? "1 device" : `${item.deviceCount} devices`;
    return `${racks}, ${devices}`;
  }
</script>

<div class="start-screen">
  <div class="start-screen-content">
    <header class="start-header">
      <h1>Rackula</h1>
      <p class="subtitle">Rack Layout Designer for Homelabbers</p>
    </header>

    <div class="actions">
      <button class="action-btn primary" onclick={handleNewLayout}>
        <IconPlus size={20} />
        <span>New Layout</span>
      </button>
      <button class="action-btn secondary" onclick={handleImportFile}>
        <IconUpload size={20} />
        <span>Import File</span>
      </button>
    </div>

    {#if !apiAvailable}
      <div class="offline-warning">
        <IconWarning size={18} />
        <div>
          <strong>Persistence API unavailable</strong>
          <p>
            Working in offline mode. Changes will be saved to browser storage.
          </p>
        </div>
        <button class="continue-btn" onclick={handleContinueOffline}>
          Continue
        </button>
      </div>
    {:else}
      <section class="saved-layouts">
        <h2>
          <IconFolderOpen size={18} />
          Saved Layouts
        </h2>

        {#if loading}
          <div class="loading">Loading...</div>
        {:else if error}
          <div class="error">{error}</div>
        {:else if layouts.length === 0}
          <div class="empty">
            <p>No saved layouts yet.</p>
            <p>Create a new layout or import an existing file!</p>
          </div>
        {:else}
          <ul class="layout-list">
            {#each layouts as item (item.id)}
              <li>
                <button
                  class="layout-item"
                  class:invalid={!item.valid}
                  onclick={() => handleOpenLayout(item)}
                  disabled={deletingId === item.id}
                >
                  <div class="layout-info">
                    <span class="layout-name">
                      {item.name}
                      {#if !item.valid}
                        <span class="error-badge" title="Corrupted file">
                          <IconWarning size={14} />
                        </span>
                      {/if}
                    </span>
                    <span class="layout-meta">
                      {#if item.valid}
                        {formatCounts(item)} · {formatDate(item.updatedAt)}
                      {:else}
                        <span class="error-text">File corrupted</span> · {formatDate(
                          item.updatedAt,
                        )}
                      {/if}
                    </span>
                  </div>
                  <button
                    class="delete-btn"
                    onclick={(e) => handleDeleteLayout(item, e)}
                    disabled={deletingId === item.id}
                    title="Delete layout"
                  >
                    <IconTrash size={16} />
                  </button>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .start-screen {
    position: fixed;
    inset: 0;
    background: var(--color-background);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .start-screen-content {
    max-width: 520px;
    width: 100%;
    padding: var(--spacing-lg);
  }

  .start-header {
    text-align: center;
    margin-bottom: var(--spacing-xl);
  }

  .start-header h1 {
    font-size: 2.5rem;
    color: var(--color-primary);
    margin: 0;
  }

  .subtitle {
    color: var(--color-text-muted);
    margin-top: var(--spacing-xs);
  }

  .actions {
    display: flex;
    justify-content: center;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-xl);
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-lg);
    border-radius: var(--radius-md);
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: background-color 0.15s;
  }

  .action-btn.primary {
    background: var(--color-primary);
    color: white;
  }

  .action-btn.primary:hover {
    background: var(--color-primary-hover);
  }

  .action-btn.secondary {
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }

  .action-btn.secondary:hover {
    background: var(--color-surface-hover);
  }

  .offline-warning {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    background: var(--color-warning-bg);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-xl);
    color: var(--color-warning);
  }

  .offline-warning p {
    margin: var(--spacing-xs) 0 0;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .continue-btn {
    margin-left: auto;
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-warning);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
  }

  .saved-layouts h2 {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: 1rem;
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-md);
  }

  .layout-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 320px;
    overflow-y: auto;
  }

  .layout-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--spacing-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-sm);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s;
  }

  .layout-item:hover {
    border-color: var(--color-primary);
  }

  .layout-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .layout-item.invalid {
    border-color: var(--color-error);
    background: var(--color-error-bg);
    cursor: not-allowed;
  }

  .layout-item.invalid:hover {
    border-color: var(--color-error);
  }

  .error-badge {
    display: inline-flex;
    color: var(--color-error);
    margin-left: var(--spacing-xs);
    vertical-align: middle;
  }

  .error-text {
    color: var(--color-error);
  }

  .layout-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .layout-name {
    font-weight: 500;
    color: var(--color-text);
  }

  .layout-meta {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .delete-btn {
    padding: var(--spacing-sm);
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition:
      color 0.15s,
      background-color 0.15s;
  }

  .delete-btn:hover {
    color: var(--color-error);
    background: var(--color-error-bg);
  }

  .loading,
  .error,
  .empty {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  .error {
    color: var(--color-error);
  }
</style>
```

#### Step 2: Commit

```bash
git add src/lib/components/StartScreen.svelte
git commit -m "feat: add StartScreen with import and offline fallback"
```

---

### Task 12: Integrate Persistence into App.svelte

**Files:**

- Modify: `src/App.svelte`

#### Step 1: Add imports

Add after existing imports:

```typescript
import StartScreen from "$lib/components/StartScreen.svelte";
import SaveStatus from "$lib/components/SaveStatus.svelte";
import { isPersistenceAvailable } from "$lib/utils/persistence-config";
import {
  saveLayoutToServer,
  checkApiHealth,
  type SaveStatus as SaveStatusType,
  PersistenceError,
} from "$lib/utils/persistence-api";
```

#### Step 2: Add state variables

Add after existing state declarations:

```typescript
// Persistence state
let showStartScreen = $state(isPersistenceAvailable());
let currentLayoutId = $state<string | undefined>(undefined);
let saveStatus = $state<SaveStatusType>("idle");
let apiAvailable = $state(true);
```

#### Step 3: Add auto-save effect with status tracking

Add after existing `$effect` blocks:

```typescript
// Auto-save to server when persistence enabled
$effect(() => {
  if (!isPersistenceAvailable()) return;
  if (showStartScreen) return;
  if (!apiAvailable) return;

  const layout = layoutStore.layout;
  if (!layout.name) return;

  // Debounced save with status tracking
  saveStatus = "saving";

  const timeoutId = setTimeout(async () => {
    try {
      const newId = await saveLayoutToServer(layout, currentLayoutId);
      currentLayoutId = newId;
      saveStatus = "saved";
    } catch (e) {
      console.warn("Auto-save failed:", e);
      if (e instanceof PersistenceError && e.statusCode === undefined) {
        // Network error - API might be down
        apiAvailable = false;
        saveStatus = "offline";
      } else {
        saveStatus = "error";
      }
    }
  }, 2000);

  return () => clearTimeout(timeoutId);
});

// Periodically check API health when offline
$effect(() => {
  if (!isPersistenceAvailable()) return;
  if (apiAvailable) return;

  const intervalId = setInterval(async () => {
    const healthy = await checkApiHealth();
    if (healthy) {
      apiAvailable = true;
      saveStatus = "idle";
    }
  }, 30000); // Check every 30 seconds

  return () => clearInterval(intervalId);
});
```

#### Step 4: Update StartScreen handler

```typescript
function handleStartScreenClose(layoutId?: string) {
  currentLayoutId = layoutId;
  showStartScreen = false;
}
```

#### Step 5: Update template

Add StartScreen conditional at the beginning:

```svelte
{#if showStartScreen}
  <StartScreen onClose={handleStartScreenClose} />
{:else}
  <!-- existing app content -->
{/if}
```

#### Step 6: Add SaveStatus to Toolbar area

In the Toolbar section, add the SaveStatus component (in the right zone):

```svelte
<Toolbar ...existing props...>
  <!-- Add in right zone slot if available, or modify Toolbar -->
  {#if isPersistenceAvailable()}
    <SaveStatus status={saveStatus} />
  {/if}
</Toolbar>
```

#### Step 7: Commit

```bash
git add src/App.svelte
git commit -m "feat: integrate persistence with StartScreen and SaveStatus"
```

---

### Task 13: Update Toolbar for SaveStatus

**Files:**

- Modify: `src/lib/components/Toolbar.svelte`

#### Step 1: Add SaveStatus slot/prop

Add to Props interface:

```typescript
saveStatus?: SaveStatusType;
```

Add to props destructure:

```typescript
saveStatus,
```

#### Step 2: Add SaveStatus in right zone

Add before the FileMenu in the right zone:

```svelte
{#if saveStatus}
  <SaveStatus status={saveStatus} />
{/if}
```

#### Step 3: Add import

```typescript
import SaveStatus from "./SaveStatus.svelte";
import type { SaveStatus as SaveStatusType } from "$lib/utils/persistence-api";
```

#### Step 4: Commit

```bash
git add src/lib/components/Toolbar.svelte
git commit -m "feat: add SaveStatus indicator to Toolbar"
```

---

## Phase 3: Docker Configuration

### Task 14: Update nginx Configuration

**Files:**

- Modify: `deploy/nginx.conf`

#### Step 1: Add API and assets proxy

Add before the SPA fallback (`location /`):

```nginx
    # API proxy (when sidecar is running)
    location /api/ {
        proxy_pass http://rackula-api:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 5s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;

        # Handle API unavailable gracefully
        proxy_intercept_errors on;
        error_page 502 503 504 = @api_unavailable;
    }

    location @api_unavailable {
        default_type application/json;
        return 503 '{"error": "Persistence API unavailable"}';
    }
```

#### Step 2: Update CSP header

Update `connect-src` to include `/api/`:

```nginx
connect-src 'self' https://t.racku.la https://static.cloudflareinsights.com /api/;
```

#### Step 3: Commit

```bash
git add deploy/nginx.conf
git commit -m "feat: add API proxy configuration to nginx"
```

---

### Task 15: Create Docker Compose Override

**Files:**

- Create: `docker-compose.persist.yml`

#### Step 1: Create the override file

```yaml
# Docker Compose override for persistent storage
# Usage: docker compose -f docker-compose.yml -f docker-compose.persist.yml up -d

services:
  rackula:
    build:
      context: .
      dockerfile: deploy/Dockerfile
      args:
        VITE_PERSIST_ENABLED: "true"
    depends_on:
      rackula-api:
        condition: service_healthy

  rackula-api:
    image: ghcr.io/rackulalives/rackula-api:latest
    container_name: rackula-api
    restart: unless-stopped
    stop_grace_period: 10s

    volumes:
      - ./data:/data

    environment:
      - DATA_DIR=/data
      - PORT=3001

    deploy:
      resources:
        limits:
          cpus: "0.25"
          memory: 64M
        reservations:
          cpus: "0.05"
          memory: 16M

    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      - /tmp:size=5M

    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:3001/health"]
      interval: 30s
      timeout: 3s
      start_period: 5s
      retries: 3

    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "2"

    expose:
      - "3001"
```

#### Step 2: Commit

```bash
git add docker-compose.persist.yml
git commit -m "feat: add Docker Compose override for persistence"
```

---

### Task 16: Update Build Configuration

**Files:**

- Modify: `vite.config.ts`
- Modify: `deploy/Dockerfile`

#### Step 1: Update vite.config.ts

Add to `define` section:

```typescript
'import.meta.env.VITE_PERSIST_ENABLED': JSON.stringify(
  process.env.VITE_PERSIST_ENABLED ?? 'false'
),
```

#### Step 2: Update Dockerfile

Add after existing build args:

```dockerfile
ARG VITE_PERSIST_ENABLED=false
```

#### Step 3: Commit

```bash
git add vite.config.ts deploy/Dockerfile
git commit -m "build: add VITE_PERSIST_ENABLED configuration"
```

---

## Phase 4: Documentation

### Task 17: Add Self-Hosting Guide

**Files:**

- Create: `docs/guides/SELF-HOSTING.md`

Create comprehensive self-hosting documentation covering:

- Quick start (with and without persistence)
- Architecture diagram
- Data directory structure
- Environment variables
- Security considerations
- Troubleshooting
- **Single-user design note**: Document that persistence is designed for single-user deployments (personal homelab tool). Multiple users editing concurrently will have last-write-wins behavior without warnings. For multi-user scenarios, recommend separate Rackula instances per user.

**Commit:**

```bash
git add docs/guides/SELF-HOSTING.md
git commit -m "docs: add self-hosting guide with persistence"
```

---

### Task 18: Update README

**Files:**

- Modify: `README.md`

Add persistence section after Docker section:

````markdown
### Persistent Storage (Self-Hosted)

For layouts that persist across sessions:

```bash
mkdir -p data
docker compose -f docker-compose.yml -f docker-compose.persist.yml up -d
```
````

See [Self-Hosting Guide](docs/guides/SELF-HOSTING.md) for details.

````

**Commit:**

```bash
git add README.md
git commit -m "docs: add persistent storage section to README"
````

---

## Phase 5: CI/CD

### Task 19: Add API Image Build to CI

**Files:**

- Modify: `.github/workflows/deploy-prod.yml`

Add job to build and push the API image to GHCR.

**Commit:**

```bash
git add .github/workflows/
git commit -m "ci: add API image build to deployment workflow"
```

---

## Summary

This plan implements persistent storage with the following improvements from architectural review:

| Feature                | Implementation                                                      |
| ---------------------- | ------------------------------------------------------------------- |
| **Asset endpoints**    | `/api/assets/:layoutId/:deviceSlug/:face` for image upload/download |
| **Save feedback**      | `SaveStatus.svelte` with bits-ui Progress for indeterminate state   |
| **ID tracking**        | `currentLayoutId` state in App.svelte for rename handling           |
| **Import support**     | "Import File" button on StartScreen                                 |
| **List metadata**      | `rackCount` and `deviceCount` in API response                       |
| **API fallback**       | Graceful degradation to localStorage when API unavailable           |
| **Unicode support**    | UUID suffix for slugs when all-Unicode names produce empty results  |
| **Corrupted files**    | Show with `valid: false` flag and error badge, block opening        |
| **Single-user design** | Documented in self-hosting guide, last-write-wins without warnings  |

**Total tasks:** 19
**Estimated commits:** 19

---

Plan complete. Ready for execution?

**1. Subagent-Driven (this session)** - Fresh subagent per task, review between tasks

**2. Parallel Session (separate)** - New session with executing-plans skill
