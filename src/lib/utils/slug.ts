/**
 * Slug Generation and Validation Utilities
 * For v0.4 NetBox-compatible device identification
 */

/**
 * Valid slug pattern: lowercase alphanumeric with hyphens, no leading/trailing/consecutive hyphens
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Maximum length of a filename slug. Applied by slugifyForFilename, not by
 * slugify itself (device slugs and NetBox slug mapping are not filenames and
 * are intentionally left untruncated).
 *
 * The api package can't import this module (it's a separate Bun package), so
 * this value is duplicated as SLUG_MAX_LENGTH in api/src/schemas/layout.ts.
 * Keep both in sync (#2932).
 */
const SLUG_MAX_LENGTH = 100;

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
 * Slugify a name for use in a filename, with a fallback when the result is
 * empty. This is the single sanitizer shared by every export path (image
 * export, multi-rack ZIP, YAML folder structure) so the same layout or rack
 * name always yields the same filename regardless of which path produced it.
 *
 * Built on slugify so the "+" rule and trim/collapse behaviour stay consistent
 * (e.g. "DS920+" becomes "ds920-plus", leading/trailing/repeated separators are
 * trimmed and collapsed). Truncated to SLUG_MAX_LENGTH to match the API's
 * slugify (api/src/schemas/layout.ts), which is the other producer of
 * layout filenames (#2932).
 *
 * @param name - The human-readable name to sanitize
 * @param fallback - Value returned when the name slugifies to an empty string
 *
 * @example
 * slugifyForFilename('My Homelab Setup!', 'layout') // 'my-homelab-setup'
 * slugifyForFilename('!!!', 'rack') // 'rack'
 */
export function slugifyForFilename(name: string, fallback: string): string {
  const slug = slugify(name).slice(0, SLUG_MAX_LENGTH).replace(/-+$/, ""); // Remove trailing hyphens exposed by truncation
  return slug || fallback;
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
