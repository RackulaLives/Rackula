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
