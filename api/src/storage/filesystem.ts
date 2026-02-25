/**
 * Filesystem storage layer for layouts
 * Uses folder-per-layout structure: {DATA_DIR}/{Name}-{UUID}/{name}.rackula.yaml
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

function getDataDir(): string {
  return process.env.DATA_DIR ?? "./data";
}

function isSafeLegacySlug(id: string): boolean {
  if (!id || id.includes("/") || id.includes("\\") || id.includes(".")) {
    return false;
  }

  for (let i = 0; i < id.length; i += 1) {
    const code = id.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return false;
    }
  }

  return true;
}

/**
 * Ensure data directory exists
 */
export async function ensureDataDir(): Promise<void> {
  await mkdir(getDataDir(), { recursive: true });
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

  const dataDir = getDataDir();
  const entries = await readdir(dataDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const extractedUuid = extractUuidFromFolderName(entry.name);
      if (extractedUuid && extractedUuid.toLowerCase() === uuid.toLowerCase()) {
        return join(dataDir, entry.name);
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
  const filepath = join(getDataDir(), filename);
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
        name: slug,
        version: "unknown",
        updatedAt: stats.mtime.toISOString(),
        rackCount: 0,
        deviceCount: 0,
        valid: false,
      };
    }
  } catch (e) {
    const slug = filename.replace(/\.ya?ml$/i, "");
    const stats = await stat(filepath).catch(() => ({ mtime: new Date() }));
    console.warn(`Failed to read legacy layout: ${filename}`, e);
    return {
      id: slug,
      name: slug,
      version: "unknown",
      updatedAt: stats.mtime.toISOString(),
      rackCount: 0,
      deviceCount: 0,
      valid: false,
    };
  }
}

/**
 * Read a layout from a folder structure
 */
async function readLayoutFromFolder(
  folderName: string,
  yamlFilenameFromList?: string,
): Promise<LayoutListItem | null> {
  const folderPath = join(getDataDir(), folderName);
  const uuid = extractUuidFromFolderName(folderName);
  if (!uuid) return null;

  const yamlFilename =
    yamlFilenameFromList ?? (await findYamlInFolder(folderPath));
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

  const dataDir = getDataDir();
  const entries = await readdir(dataDir, { withFileTypes: true });
  const layouts: LayoutListItem[] = [];
  const migratedLegacySlugs = new Set<string>();

  // Scan for folders with UUID suffix (new folder-per-layout format)
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const uuid = extractUuidFromFolderName(entry.name);
      if (uuid) {
        const folderPath = join(dataDir, entry.name);
        const yamlFilename = await findYamlInFolder(folderPath);
        if (yamlFilename) {
          migratedLegacySlugs.add(
            yamlFilename.replace(/\.rackula\.yaml$/i, ""),
          );
        }

        const layout = await readLayoutFromFolder(
          entry.name,
          yamlFilename ?? undefined,
        );
        if (layout) {
          layouts.push(layout);
        }
      }
    }
  }

  // Also scan for old flat .yaml/.yml files (backwards compatibility)
  for (const entry of entries) {
    if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
      const legacySlug = entry.name.replace(/\.ya?ml$/i, "");
      if (migratedLegacySlugs.has(legacySlug)) {
        continue;
      }

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
  if (!isSafeLegacySlug(id)) {
    return null;
  }

  const dataDir = getDataDir();
  const legacyPaths = [join(dataDir, `${id}.yaml`), join(dataDir, `${id}.yml`)];

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
  if (!isSafeLegacySlug(oldSlug)) {
    throw new Error("Invalid legacy layout id");
  }

  const dataDir = getDataDir();
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
  const uuid =
    metadataId && isUuid(metadataId) ? metadataId : crypto.randomUUID();

  const layoutName = layout.data.metadata?.name ?? layout.data.name;
  const folderName = buildFolderName(layoutName, uuid);
  const folderPath = join(dataDir, folderName);
  const yamlFilename = buildYamlFilename(layoutName);
  const oldAssetsDir = join(dataDir, "assets", oldSlug);
  const newAssetsDir = join(folderPath, "assets");
  let assetsMoved = false;

  try {
    // Create new folder
    await mkdir(folderPath, { recursive: true });

    // Write YAML to new location
    await writeFile(join(folderPath, yamlFilename), yamlContent, "utf-8");

    // Move assets if they exist in old location
    try {
      await stat(oldAssetsDir);
      await rename(oldAssetsDir, newAssetsDir);
      assetsMoved = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      // No old assets, that's fine
    }

    // Delete old flat file(s)
    for (const ext of [".yaml", ".yml"]) {
      try {
        await rm(join(dataDir, `${oldSlug}${ext}`));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
        // File doesn't exist, that's fine
      }
    }

    return { id: uuid, isNew: false };
  } catch (error) {
    if (assetsMoved) {
      try {
        await mkdir(join(dataDir, "assets"), { recursive: true });
        await rename(newAssetsDir, oldAssetsDir);
      } catch (restoreError) {
        console.warn(
          `Failed to restore legacy assets for ${oldSlug}`,
          restoreError,
        );
      }
    }

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
  if (!isSafeLegacySlug(slug)) {
    return false;
  }

  const dataDir = getDataDir();
  for (const ext of [".yaml", ".yml"]) {
    try {
      await stat(join(dataDir, `${slug}${ext}`));
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

  const existingUuid =
    existingId && isUuid(existingId) ? existingId : undefined;
  const legacySlug =
    existingId && !existingUuid && isSafeLegacySlug(existingId)
      ? existingId
      : undefined;
  const isLegacyMigration = legacySlug
    ? await legacyLayoutExists(legacySlug)
    : false;

  if (isLegacyMigration && legacySlug) {
    return await migrateLegacyLayout(legacySlug, yamlContent);
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

  // Determine UUID: use validated metadata.id > existingId > generate new
  // Validate metadata.id before using it to prevent malformed UUIDs
  const metadataId = layout.data.metadata?.id;
  const validMetadataId = metadataId && isUuid(metadataId) ? metadataId : null;
  const uuid = validMetadataId ?? existingUuid ?? crypto.randomUUID();
  const layoutName = layout.data.metadata?.name ?? layout.data.name;

  const folderName = buildFolderName(layoutName, uuid);
  const yamlFilename = buildYamlFilename(layoutName);
  const folderPath = join(getDataDir(), folderName);

  // Check if this is a new layout
  const existingFolder = await findFolderByUuid(uuid);
  let isNew = existingFolder === null;

  // Handle rename: if the folder name changed (name change), rename the folder
  if (existingFolder && existingFolder !== folderPath) {
    // Handle concurrent folder changes gracefully.
    try {
      await rename(existingFolder, folderPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      isNew = true;
    }

    // Delete old yaml file if it has a different name
    const oldYamlFilename = await findYamlInFolder(folderPath).catch(
      () => null,
    );
    if (oldYamlFilename && oldYamlFilename !== yamlFilename) {
      try {
        await rm(join(folderPath, oldYamlFilename));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.warn(
            `Failed to delete stale YAML file "${oldYamlFilename}" in "${folderPath}"`,
            error,
          );
        }
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
