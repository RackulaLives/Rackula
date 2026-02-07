/**
 * Folder Structure Utilities
 * For folder-based ZIP exports with UUID-based naming (#919)
 *
 * Part of the data directory refactor (#570).
 * @see docs/plans/2026-01-22-data-directory-refactor-design.md
 */

/**
 * UUID format: 8-4-4-4-12 hex characters with hyphens
 * Accepts any valid UUID (not just v4) since we generate UUIDs but may import from other sources
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID format
 */
export function isUuid(str: string): boolean {
  return UUID_PATTERN.test(str);
}

/**
 * Extract UUID from a folder name in format "{name}-{uuid}"
 * Returns null if no valid UUID found
 *
 * @example
 * extractUuidFromFolderName('My Homelab-550e8400-e29b-41d4-a716-446655440000')
 * // '550e8400-e29b-41d4-a716-446655440000'
 */
export function extractUuidFromFolderName(folderName: string): string | null {
  // UUID is always 36 characters at the end after a hyphen separator
  // Pattern: {name}-{8-4-4-4-12} (hyphen required before UUID)
  const match = folderName.match(
    /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  return match ? match[1]! : null;
}

/**
 * Build a folder name from human name and UUID
 *
 * @example
 * buildFolderName('My Homelab', '550e8400-e29b-41d4-a716-446655440000')
 * // 'My Homelab-550e8400-e29b-41d4-a716-446655440000'
 */
export function buildFolderName(name: string, uuid: string): string {
  if (!isUuid(uuid)) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }

  const sanitizedName = sanitizeFolderNameForZip(name);
  return `${sanitizedName}-${uuid}`;
}

/**
 * Sanitize layout name for ZIP folder component safety.
 * Removes path separators/control chars and strips "."/".." segments.
 */
function sanitizeFolderNameForZip(name: string): string {
  const cleaned = name
    .replace(/[\\/]/g, " ")
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? " " : char;
    })
    .join("")
    .split(/\s+/)
    .filter((segment) => segment !== "." && segment !== "..")
    .join(" ")
    .trim();

  return cleaned || "layout";
}

/**
 * Build YAML filename from layout name
 * Uses slugified name with .rackula.yaml extension
 *
 * @example
 * buildYamlFilename('My Homelab')
 * // 'my-homelab.rackula.yaml'
 */
export function buildYamlFilename(name: string): string {
  const slug = slugifyForFilename(name);
  return `${slug || "layout"}.rackula.yaml`;
}

/**
 * Slugify a name for use in filenames
 * Lowercase, hyphens, no special chars
 *
 * @example
 * slugifyForFilename('My Homelab Setup!')
 * // 'my-homelab-setup'
 */
export function slugifyForFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
