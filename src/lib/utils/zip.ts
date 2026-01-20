/**
 * JSZip wrapper for multi-rack export
 * Provides a simple interface for creating ZIP archives with images
 */

import JSZip from "jszip";

export interface ZipFile {
  /** Filename within the ZIP (e.g., 'rack-name-front.png') */
  name: string;
  /** File content as Blob */
  blob: Blob;
}

/**
 * Create a ZIP file containing multiple image files
 *
 * @param files - Array of files to include in the ZIP
 * @returns Promise resolving to the ZIP file as a Blob
 */
export async function createZip(files: ZipFile[]): Promise<Blob> {
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.name, file.blob);
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

/**
 * Generate a sanitized filename for a rack in multi-export
 * Pattern: {rack-slug}-{view}.{ext}
 *
 * @param rackName - The rack name to sanitize
 * @param view - The view (front, rear, both)
 * @param format - The export format extension
 */
export function generateRackFilename(
  rackName: string,
  view: "front" | "rear" | "both",
  format: string,
): string {
  // Slugify the rack name: lowercase, hyphens, no special chars
  const slugified = rackName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const baseName = slugified || "rack";

  return `${baseName}-${view}.${format}`;
}
