/**
 * Layout preview rendering
 *
 * Turns a layout into a small SVG string for the cached thumbnail shown in the
 * Layouts sidebar tab (#2083). It reuses the export renderer (`generateExportSVG`)
 * rather than introducing a second renderer, so a thumbnail always matches what
 * an export would produce.
 *
 * Safety: `generateExportSVG` builds the SVG with the DOM API and sets every
 * user-controlled string (device and rack names) via `textContent`/attributes,
 * never via raw-HTML injection. `XMLSerializer` then escapes the result, so the
 * returned string is safe to mount with `{@html}` (the same contract the export
 * preview relies on). No user text is interpolated into markup here.
 */

import type { Layout, ExportOptions } from "$lib/types";
import { generateExportSVG, exportAsSVG } from "$lib/utils/export";

/**
 * Fixed options for the thumbnail render. Front view only, label display mode
 * (so previews work without device images), and no names/legend/QR chrome so
 * the miniature stays compact. The transparent background lets the row's own
 * surface colour show through and keeps light/dark themes consistent.
 */
const PREVIEW_OPTIONS: ExportOptions = {
  format: "svg",
  scope: "all",
  includeNames: false,
  includeLegend: false,
  background: "transparent",
  exportView: "front",
  displayMode: "label",
  includeQR: false,
};

/**
 * Render a layout to an SVG string for its preview thumbnail.
 *
 * Returns null when the layout has no racks to draw (an empty thumbnail adds no
 * information; the row falls back to a placeholder). The render does not pass an
 * image map: thumbnails render in label mode, so device images are not needed
 * and the preview never depends on the per-image store.
 */
export function renderLayoutPreviewSvg(layout: Layout): string | null {
  const racks = layout.racks ?? [];
  if (racks.length === 0) return null;

  const svg = generateExportSVG(
    racks,
    layout.device_types ?? [],
    PREVIEW_OPTIONS,
    undefined,
    layout.rack_groups,
  );
  return exportAsSVG(svg);
}
