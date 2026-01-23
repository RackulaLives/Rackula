/**
 * Filesystem storage layer for layouts
 * Uses folder-per-layout structure: /data/{Name}-{UUID}/{name}.rackula.yaml
 */
import {
  readdir,
  readFile,
  writeFile,
  stat,
  mkdir,
  rm,
  rename,
} from "node:fs/promises";
import { join } from "node:path";
import * as yaml from "js-yaml";
import {
  LayoutFileSchema,
  isUuid,
  extractUuidFromFolderName,
  buildFolderName,
  buildYamlFilename,
  slugify,
  type LayoutListItem,
} from "../schemas/layout";

const DATA_DIR = process.env.DATA_DIR ?? "/data";

/**
 * Ensure data directory exists
 */
export async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

/**
 * Count devices across all racks in a layout
 */
function countDevices(racks: Array<{ devices?: unknown[] }>): number {
  return racks.reduce((sum, rack) => sum + (rack.devices?.length ?? 0), 0);
}

/**
 * Find a layout folder by UUID
 * Scans DATA_DIR for folders ending with the given UUID
 * Returns the full folder path or null if not found
 */
export async function findFolderByUuid(uuid: string): Promise<string | null> {
  // Validate UUID format to prevent path traversal
  if (!isUuid(uuid)) {
    return null;
  }

  await ensureDataDir();

  const entries = await readdir(DATA_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const extractedUuid = extractUuidFromFolderName(entry.name);
      if (extractedUuid && extractedUuid.toLowerCase() === uuid.toLowerCase()) {
        return join(DATA_DIR, entry.name);
      }
    }
  }
  return null;
}

/**
 * Find the .rackula.yaml file inside a layout folder
 * Returns the filename (not full path) or null if not found
 */
async function findYamlInFolder(folderPath: string): Promise<string | null> {
  const files = await readdir(folderPath);
  const yamlFile = files.find((f) => f.endsWith(".rackula.yaml"));
  return yamlFile ?? null;
}

/**
 * Read a legacy flat YAML file (old format: {name}.yaml directly in DATA_DIR)
 * Returns LayoutListItem with slug as ID (will become UUID on save)
 */
async function readLegacyLayout(
  filename: string,
): Promise<LayoutListItem | null> {
  const filepath = join(DATA_DIR, filename);
  try {
    const content = await readFile(filepath, "utf-8");
    const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as unknown;
    const metadata = LayoutFileSchema.safeParse(parsed);
    const stats = await stat(filepath);

    // Generate slug from filename (strip extension)
    const slug = filename.replace(/\.ya?ml$/i, "");

    if (metadata.success) {
      return {
        // Use slug as ID for legacy layouts (will become UUID on save)
        id: slug,
        name: metadata.data.name,
        version: metadata.data.version,
        updatedAt: stats.mtime.toISOString(),
        rackCount: metadata.data.racks?.length ?? 0,
        deviceCount: countDevices(metadata.data.racks ?? []),
        valid: true,
      };
    } else {
      return {
        id: slug,
        name: filename.replace(/\.ya?ml$/i, ""),
        version: "unknown",
        updatedAt: stats.mtime.toISOString(),
        rackCount: 0,
        deviceCount: 0,
        valid: false,
      };
    }
  } catch (e) {
    console.warn(`Failed to read legacy layout: ${filename}`, e);
    return null;
  }
}

/**
 * Read a layout from a folder structure
 */
async function readLayoutFromFolder(
  folderName: string,
): Promise<LayoutListItem | null> {
  const folderPath = join(DATA_DIR, folderName);
  const uuid = extractUuidFromFolderName(folderName);
  if (!uuid) return null;

  const yamlFilename = await findYamlInFolder(folderPath);
  if (!yamlFilename) return null;

  const yamlPath = join(folderPath, yamlFilename);

  try {
    const content = await readFile(yamlPath, "utf-8");
    // Use JSON_SCHEMA to prevent JavaScript tag execution (security)
    const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as unknown;
    const metadata = LayoutFileSchema.safeParse(parsed);
    const stats = await stat(yamlPath);

    if (metadata.success) {
      const racks = metadata.data.racks ?? [];
      return {
        id: uuid,
        name: metadata.data.name,
        version: metadata.data.version,
        updatedAt: stats.mtime.toISOString(),
        rackCount: racks.length,
        deviceCount: countDevices(racks),
        valid: true,
      };
    } else {
      // Invalid YAML structure - include with error flag
      return {
        id: uuid,
        name: folderName.replace(`-${uuid}`, ""), // Extract human name from folder
        version: "unknown",
        updatedAt: stats.mtime.toISOString(),
        rackCount: 0,
        deviceCount: 0,
        valid: false,
      };
    }
  } catch (e) {
    // File read/parse error - include with error flag
    const stats = await stat(folderPath).catch(() => ({ mtime: new Date() }));
    console.warn(`Failed to read layout from folder: ${folderName}`, e);
    return {
      id: uuid,
      name: folderName.replace(`-${uuid}`, ""),
      version: "unknown",
      updatedAt: stats.mtime.toISOString(),
      rackCount: 0,
      deviceCount: 0,
      valid: false,
    };
  }
}

/**
 * List all layouts in the data directory
 * Scans for folder-per-layout structure (folders ending with UUID)
 * Also includes legacy flat YAML files for backwards compatibility
 * Returns invalid files with valid: false so UI can show error badge
 */
export async function listLayouts(): Promise<LayoutListItem[]> {
  await ensureDataDir();

  const entries = await readdir(DATA_DIR, { withFileTypes: true });
  const layouts: LayoutListItem[] = [];

  // Scan for folders with UUID suffix (new folder-per-layout format)
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const uuid = extractUuidFromFolderName(entry.name);
      if (uuid) {
        const layout = await readLayoutFromFolder(entry.name);
        if (layout) {
          layouts.push(layout);
        }
      }
    }
  }

  // Also scan for old flat .yaml/.yml files (backwards compatibility)
  for (const entry of entries) {
    if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
      const layout = await readLegacyLayout(entry.name);
      if (layout) {
        layouts.push(layout);
      }
    }
  }

  // Sort by most recently updated
  return layouts.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/**
 * Check if a layout with the given UUID exists
 */
export async function layoutExists(uuid: string): Promise<boolean> {
  const folder = await findFolderByUuid(uuid);
  return folder !== null;
}

/**
 * Get a single layout by UUID or legacy slug
 * Returns the YAML content or null if not found
 */
export async function getLayout(id: string): Promise<string | null> {
  // First try UUID lookup (new format)
  if (isUuid(id)) {
    const folder = await findFolderByUuid(id);
    if (folder) {
      const yamlFilename = await findYamlInFolder(folder);
      if (yamlFilename) {
        try {
          return await readFile(join(folder, yamlFilename), "utf-8");
        } catch {
          return null;
        }
      }
    }
  }

  // Fallback: try reading legacy flat file by slug
  // Validate slug to prevent path traversal (no slashes, dots, etc.)
  if (/[/\\.]/.test(id) || id.includes("..")) {
    return null;
  }

  const legacyPaths = [
    join(DATA_DIR, `${id}.yaml`),
    join(DATA_DIR, `${id}.yml`),
  ];

  for (const path of legacyPaths) {
    try {
      return await readFile(path, "utf-8");
    } catch {
      // Continue to next
    }
  }

  return null;
}

/**
 * Migrate a legacy flat YAML file to the new folder-per-layout structure
 * Moves {slug}.yaml to {Name}-{UUID}/{name}.rackula.yaml
 */
async function migrateLegacyLayout(
  oldSlug: string,
  yamlContent: string,
): Promise<{ id: string; isNew: boolean }> {
  // Parse YAML
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA });
  } catch (e) {
    throw new Error(`Invalid YAML: ${e instanceof Error ? e.message : e}`);
  }

  const layout = LayoutFileSchema.safeParse(parsed);
  if (!layout.success) {
    const issues = layout.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid layout: ${issues}`);
  }

  // Generate UUID (use metadata.id if valid, else generate new)
  const metadataId = layout.data.metadata?.id;
  const uuid = metadataId && isUuid(metadataId) ? metadataId : crypto.randomUUID();

  const layoutName = layout.data.metadata?.name ?? layout.data.name;
  const folderName = buildFolderName(layoutName, uuid);
  const folderPath = join(DATA_DIR, folderName);
  const yamlFilename = buildYamlFilename(layoutName);

  try {
    // Create new folder
    await mkdir(folderPath, { recursive: true });

    // Write YAML to new location
    await writeFile(join(folderPath, yamlFilename), yamlContent, "utf-8");

    // Move assets if they exist in old location
    const oldAssetsDir = join(DATA_DIR, "assets", oldSlug);
    const newAssetsDir = join(folderPath, "assets");
    try {
      await stat(oldAssetsDir);
      await rename(oldAssetsDir, newAssetsDir);
    } catch {
      // No old assets, that's fine
    }

    // Delete old flat file(s)
    for (const ext of [".yaml", ".yml"]) {
      try {
        await rm(join(DATA_DIR, `${oldSlug}${ext}`));
      } catch {
        // File doesn't exist, that's fine
      }
    }

    return { id: uuid, isNew: false };
  } catch (error) {
    // Rollback: remove new folder
    try {
      await rm(folderPath, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
    throw error;
  }
}

/**
 * Check if a legacy flat YAML file exists for the given slug
 */
async function legacyLayoutExists(slug: string): Promise<boolean> {
  for (const ext of [".yaml", ".yml"]) {
    try {
      await stat(join(DATA_DIR, `${slug}${ext}`));
      return true;
    } catch {
      // Continue
    }
  }
  return false;
}

/**
 * Save a layout (create or update)
 * Creates folder structure: /data/{Name}-{UUID}/{name}.rackula.yaml
 * Also handles migration from legacy flat YAML format
 * Returns the layout UUID and whether it was a new layout
 */
export async function saveLayout(
  yamlContent: string,
  existingId?: string,
): Promise<{ id: string; isNew: boolean }> {
  await ensureDataDir();

  // Check if this is a legacy migration (existingId is slug, not UUID)
  const isLegacyMigration = existingId && !isUuid(existingId) && await legacyLayoutExists(existingId);

  if (isLegacyMigration) {
    return await migrateLegacyLayout(existingId, yamlContent);
  }

  // Parse YAML content with error handling
  // Use JSON_SCHEMA to prevent JavaScript tag execution (security)
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid YAML: ${message}`);
  }

  // Validate layout schema
  const layout = LayoutFileSchema.safeParse(parsed);
  if (!layout.success) {
    const issues = layout.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid layout metadata: ${issues}`);
  }

  // Validate existingId if provided as UUID
  if (existingId && isUuid(existingId)) {
    // existingId is a valid UUID, use it
  } else if (existingId) {
    // existingId is not a UUID and no legacy file exists - treat as new layout
    existingId = undefined;
  }

  // Determine UUID: use validated metadata.id > existingId > generate new
  // Validate metadata.id before using it to prevent malformed UUIDs
  const metadataId = layout.data.metadata?.id;
  const validMetadataId = metadataId && isUuid(metadataId) ? metadataId : null;
  const uuid = validMetadataId ?? existingId ?? crypto.randomUUID();
  const layoutName = layout.data.metadata?.name ?? layout.data.name;

  const folderName = buildFolderName(layoutName, uuid);
  const yamlFilename = buildYamlFilename(layoutName);
  const folderPath = join(DATA_DIR, folderName);

  // Check if this is a new layout
  const existingFolder = await findFolderByUuid(uuid);
  const isNew = existingFolder === null;

  // Handle rename: if the folder name changed (name change), rename the folder
  if (existingFolder && existingFolder !== folderPath) {
    // Rename folder to new name
    await rename(existingFolder, folderPath);

    // Delete old yaml file if it has a different name
    const oldYamlFilename = await findYamlInFolder(folderPath);
    if (oldYamlFilename && oldYamlFilename !== yamlFilename) {
      try {
        await rm(join(folderPath, oldYamlFilename));
      } catch {
        // Ignore if old file doesn't exist
      }
    }
  }

  // Create folder if it doesn't exist
  await mkdir(folderPath, { recursive: true });

  // Write the YAML file
  await writeFile(join(folderPath, yamlFilename), yamlContent, "utf-8");

  return { id: uuid, isNew };
}

/**
 * Delete a layout by UUID
 * Removes the entire folder including assets
 */
export async function deleteLayout(uuid: string): Promise<boolean> {
  // Validate UUID to prevent path traversal attacks
  if (!isUuid(uuid)) {
    return false;
  }

  const folder = await findFolderByUuid(uuid);
  if (!folder) {
    return false;
  }

  try {
    await rm(folder, { recursive: true });
    return true;
  } catch (error) {
    // Ignore ENOENT (folder doesn't exist), rethrow other errors
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    return false;
  }
}

/**
 * Get assets directory path for a layout by UUID
 * Returns the path to the assets folder inside the layout folder
 * Returns null if the layout folder doesn't exist
 */
export async function getLayoutAssetsDir(uuid: string): Promise<string | null> {
  const folder = await findFolderByUuid(uuid);
  if (!folder) {
    return null;
  }
  return join(folder, "assets");
}

// Re-export slugify from schemas for backwards compatibility
export { slugify };
