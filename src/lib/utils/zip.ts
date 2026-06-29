/**
 * JSZip wrapper for multi-rack export
 * Provides a simple interface for creating ZIP archives with images
 */

import { getJSZip } from "./archive";
import { slugifyForFilename } from "$lib/utils/slug";

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
  const JSZip = await getJSZip();
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
  // Slugify the rack name through the shared filename sanitizer.
  const baseName = slugifyForFilename(rackName, "rack");

  return `${baseName}-${view}.${format}`;
}
