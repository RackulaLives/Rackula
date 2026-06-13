import type { ExportBackground } from "$lib/types";

// Note: jsPDF and svg2pdf.js are imported dynamically in PDF export functions
// to avoid loading the large jsPDF bundle (~200KB) on app startup.
// See issue #68 for details.

/**
 * Export SVG element as string with XML declaration
 */
export function exportAsSVG(svg: SVGElement): string {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;
}

/**
 * Normalise an export SVG so svg2pdf.js renders it faithfully.
 *
 * svg2pdf does not implement every SVG/CSS feature the browser does, so the
 * shared export SVG needs two adjustments before vector PDF conversion (these
 * are applied to the re-parsed copy only — the PNG path keeps the original):
 *
 *  - `dominant-baseline` is ignored by svg2pdf; it reads `alignment-baseline`
 *    instead. Mirror the value across so vertically-centred text (device names,
 *    U numbers) stays centred rather than shifting up to the baseline (#1738).
 *  - Numeric `font-weight` values other than 400/700 yield an invalid jsPDF
 *    style (e.g. "normal600") and fall back to the serif font (times). Collapse
 *    weights to the supported 400/700, treating >= 500 as bold (#1739).
 */
export function prepareSvgForPdf(svgElement: Element): void {
  const textLike = [
    ...Array.from(svgElement.getElementsByTagName("text")),
    ...Array.from(svgElement.getElementsByTagName("tspan")),
  ];

  for (const el of textLike) {
    const dominantBaseline = el.getAttribute("dominant-baseline");
    if (dominantBaseline && !el.getAttribute("alignment-baseline")) {
      el.setAttribute("alignment-baseline", dominantBaseline);
    }

    const fontWeight = el.getAttribute("font-weight");
    if (fontWeight) {
      const isBold =
        fontWeight === "bold" ||
        fontWeight === "bolder" ||
        Number(fontWeight) >= 500;
      el.setAttribute("font-weight", isBold ? "700" : "400");
    }
  }
}

/**
 * Export SVG string as PDF blob (US Letter size, centered)
 */
export async function exportAsPDF(
  svgString: string,
  // Background is embedded in the SVG element; vector PDF conversion preserves it directly
  _background: ExportBackground,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");

  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
  const svgElement = svgDoc.documentElement;

  // svg2pdf lacks support for some SVG features the browser renders; normalise
  // this re-parsed copy so the vector PDF matches the on-screen/PNG output.
  prepareSvgForPdf(svgElement);

  const imgWidth = parseInt(svgElement.getAttribute("width") || "0", 10);
  const imgHeight = parseInt(svgElement.getAttribute("height") || "0", 10);

  if (imgWidth === 0 || imgHeight === 0) {
    throw new Error("Invalid SVG dimensions");
  }

  // US Letter dimensions in points (72 dpi)
  const letterWidth = 612; // 8.5 inches
  const letterHeight = 792; // 11 inches

  // Create PDF (landscape if image is wider than tall)
  const isLandscape = imgWidth > imgHeight;

  const pdf = new jsPDF({
    orientation: isLandscape ? "landscape" : "portrait",
    unit: "pt",
    format: "letter",
  });

  // Calculate scaling to fit on page with margins
  const margin = 36; // 0.5 inch margins
  const pageWidth = isLandscape ? letterHeight : letterWidth;
  const pageHeight = isLandscape ? letterWidth : letterHeight;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;

  const scale = Math.min(
    availableWidth / imgWidth,
    availableHeight / imgHeight,
  );

  const scaledWidth = imgWidth * scale;
  const scaledHeight = imgHeight * scale;

  // Center on page
  const x = (pageWidth - scaledWidth) / 2;
  const y = (pageHeight - scaledHeight) / 2;

  // Convert SVG to vector PDF commands
  await pdf.svg(svgElement, { x, y, width: scaledWidth, height: scaledHeight });

  return pdf.output("blob");
}
