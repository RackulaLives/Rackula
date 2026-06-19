/**
 * Slug Generation and Validation Utilities
 * For v0.4 NetBox-compatible device identification
 */

/**
 * Valid slug pattern: lowercase alphanumeric with hyphens, no leading/trailing/consecutive hyphens
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Convert any string to a valid slug
 *
 * @example
 * slugify('Synology DS920+') // 'synology-ds920-plus'
 * slugify('UniFi Dream Machine') // 'unifi-dream-machine'
 */
export function slugify(input: string): string {
  if (!input) return "";

  return (
    input
      .toLowerCase()
      .trim()
      // Replace plus signs with 'plus' before other processing
      .replace(/\+/g, "-plus")
      // Replace non-alphanumeric with hyphens
      .replace(/[^a-z0-9]+/g, "-")
      // Remove leading hyphens
      .replace(/^-+/, "")
      // Remove trailing hyphens
      .replace(/-+$/, "")
      // Collapse multiple hyphens
      .replace(/-+/g, "-")
  );
}

/**
 * Generate slug from device information
 *
 * Priority:
 * 1. manufacturer + model (if both provided)
 * 2. name (if provided)
 * 3. timestamp fallback
 *
 * @example
 * generateDeviceSlug('Synology', 'DS920+') // 'synology-ds920-plus'
 * generateDeviceSlug(undefined, undefined, 'Custom Server') // 'custom-server'
 */
export function generateDeviceSlug(
  manufacturer?: string,
  model?: string,
  name?: string,
): string {
  // Try manufacturer + model first
  if (manufacturer && model) {
    return slugify(`${manufacturer}-${model}`);
  }

  // Try name
  if (name) {
    return slugify(name);
  }

  // Fallback to timestamp-based
  return `device-${Date.now()}`;
}

/**
 * Validate slug format
 *
 * Rules:
 * - Lowercase only
 * - Alphanumeric and hyphens only
 * - No leading/trailing hyphens
 * - No consecutive hyphens
 *
 * @example
 * isValidSlug('synology-ds920-plus') // true
 * isValidSlug('Invalid Slug') // false
 */
export function isValidSlug(slug: string): boolean {
  if (!slug) return false;
  return SLUG_PATTERN.test(slug);
}

/**
 * Ensure slug is unique by appending number if needed
 *
 * @example
 * ensureUniqueSlug('my-slug', new Set(['my-slug'])) // 'my-slug-2'
 * ensureUniqueSlug('my-slug', new Set(['my-slug', 'my-slug-2'])) // 'my-slug-3'
 */
export function ensureUniqueSlug(
  slug: string,
  existingSlugs: Set<string>,
): string {
  if (!existingSlugs.has(slug)) {
    return slug;
  }

  let counter = 2;
  let candidate = `${slug}-${counter}`;

  while (existingSlugs.has(candidate)) {
    counter++;
    candidate = `${slug}-${counter}`;
  }

  return candidate;
}
