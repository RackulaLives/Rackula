/**
 * Bundled Images Generator
 *
 * Utilities for auto-generating bundledImages.ts from processed device images.
 * This module contains pure functions that can be tested independently.
 */

export interface ParsedImage {
  vendor: string;
  slug: string;
  face: "front" | "rear";
  filename: string;
}

export interface GroupedImages {
  [slug: string]: {
    vendor: string;
    front?: string;
    rear?: string;
  };
}

export interface ImportNames {
  front?: string;
  rear?: string;
}

/**
 * Parse an image path to extract vendor, slug, and face
 *
 * @param relativePath - Path relative to device-images directory (e.g., "hpe/hpe-proliant-dl380-gen10.front.webp")
 * @returns Parsed image info or null if invalid
 */
export function parseImagePath(relativePath: string): ParsedImage | null {
  // Expected format: vendor/slug.face.webp
  // Ignore nested subdirectories (e.g. "apple/apple-assets/device.front.webp") because
  // they do not map to valid device slugs and can generate invalid identifiers.
  const match = relativePath.match(/^([^/]+)\/([^/]+)\.(front|rear)\.webp$/);
  if (!match) return null;

  const [, vendor, slug, face] = match;
  return {
    vendor,
    slug,
    face: face as "front" | "rear",
    filename: `${slug}.${face}.webp`,
  };
}

/**
 * Generate a camelCase import variable name from slug and face
 *
 * @param slug - Device slug (e.g., "hpe-proliant-dl380-gen10")
 * @param face - Image face ("front" or "rear")
 * @returns camelCase variable name (e.g., "hpeProliantDl380Gen10Front")
 */
export function generateImportName(
  slug: string,
  face: "front" | "rear",
): string {
  // Convert slug to camelCase
  const camelSlug = slug
    .split("-")
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");

  // Append face with capital letter
  return camelSlug + face.charAt(0).toUpperCase() + face.slice(1);
}

/**
 * Generate an import statement for an image
 *
 * @param vendor - Vendor name (e.g., "hpe")
 * @param slug - Device slug (e.g., "hpe-proliant-dl380-gen10")
 * @param face - Image face ("front" or "rear")
 * @returns Import statement string
 */
export function generateImportStatement(
  vendor: string,
  slug: string,
  face: "front" | "rear",
): string {
  const importName = generateImportName(slug, face);
  return `import ${importName} from '$lib/assets/device-images/${vendor}/${slug}.${face}.webp';`;
}

/**
 * Generate a manifest entry for a device
 *
 * @param slug - Device slug
 * @param importNames - Object with front and/or rear import variable names
 * @returns Manifest entry string
 */
export function generateManifestEntry(
  slug: string,
  importNames: ImportNames,
): string {
  const parts: string[] = [];
  if (importNames.front) {
    parts.push(`front: ${importNames.front}`);
  }
  if (importNames.rear) {
    parts.push(`rear: ${importNames.rear}`);
  }
  return `'${slug}': { ${parts.join(", ")} }`;
}

/**
 * Group parsed images by slug, combining front and rear
 *
 * @param images - Array of parsed images
 * @returns Object mapping slug to vendor and filenames
 */
export function groupImagesBySlug(images: ParsedImage[]): GroupedImages {
  const grouped: GroupedImages = {};

  for (const image of images) {
    if (!grouped[image.slug]) {
      grouped[image.slug] = { vendor: image.vendor };
    }
    grouped[image.slug][image.face] = image.filename;
  }

  return grouped;
}
