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
 * Get a single layout by UUID
 * Returns the YAML content or null if not found
 */
export async function getLayout(uuid: string): Promise<string | null> {
  // Validate UUID to prevent path traversal attacks
  if (!isUuid(uuid)) {
    return null;
  }

  const folder = await findFolderByUuid(uuid);
  if (!folder) {
    return null;
  }

  const yamlFilename = await findYamlInFolder(folder);
  if (!yamlFilename) {
    return null;
  }

  try {
    return await readFile(join(folder, yamlFilename), "utf-8");
  } catch {
    return null;
  }
}

/**
 * Save a layout (create or update)
 * Creates folder structure: /data/{Name}-{UUID}/{name}.rackula.yaml
 * Returns the layout UUID and whether it was a new layout
 */
export async function saveLayout(
  yamlContent: string,
  existingUuid?: string,
): Promise<{ id: string; isNew: boolean }> {
  await ensureDataDir();

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

  // Validate existingUuid if provided
  if (existingUuid && !isUuid(existingUuid)) {
    throw new Error(`Invalid UUID format: ${existingUuid}`);
  }

  // Determine UUID: use validated metadata.id > existingUuid > generate new
  // Validate metadata.id before using it to prevent malformed UUIDs
  const metadataId = layout.data.metadata?.id;
  const validMetadataId = metadataId && isUuid(metadataId) ? metadataId : null;
  const uuid = validMetadataId ?? existingUuid ?? crypto.randomUUID();
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
