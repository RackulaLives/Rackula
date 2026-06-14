import type { ExportFormat } from "$lib/types";

/**
 * Trigger download of a blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Defer revocation so the URL stays valid while the browser starts the
  // download. Revoking synchronously can race the download start and produce
  // intermittent failed or empty downloads.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Generate a sanitized filename for export
 * Pattern: {layout-name}-{view}-{YYYY-MM-DD}.{ext}
 * For CSV (view=null): {layout-name}-{YYYY-MM-DD}.{ext}
 *
 * @param layoutName - The layout name to include in filename
 * @param view - The export view ('front', 'rear', 'both') or null for data exports like CSV
 * @param format - The export format extension
 */
export function generateExportFilename(
  layoutName: string,
  view: "front" | "rear" | "both" | null,
  format: ExportFormat,
): string {
  // Slugify the layout name: lowercase, hyphens, no special chars
  const slugified = layoutName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const baseName = slugified || "Rackula-export";

  // Format date as YYYY-MM-DD
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  // Build filename: include view for image exports, omit for CSV
  if (view) {
    return `${baseName}-${view}-${dateStr}.${format}`;
  }

  return `${baseName}-${dateStr}.${format}`;
}
