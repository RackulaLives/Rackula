import type { Rack, DeviceType, ExportOptions } from "$lib/types";
import type { ImageStoreMap } from "$lib/types/images";
import { generateSingleRackSVG } from "./svg";
import { exportAsSVG, prepareSvgForPdf } from "./vector";
import { exportAsPNG, exportAsJPEG } from "./raster";

/**
 * Progress callback for multi-rack exports
 */
export type ExportProgressCallback = (progress: {
  current: number;
  total: number;
  rackName: string;
}) => void;

/**
 * Export multiple racks as a ZIP file containing one image per rack
 *
 * @param racks - Racks to export
 * @param deviceLibrary - Device library for device definitions
 * @param options - Export options (format must be png, jpeg, or svg)
 * @param images - Optional map of device images
 * @param onProgress - Optional progress callback
 * @returns Promise resolving to ZIP blob
 */
export async function exportAsZip(
  racks: Rack[],
  deviceLibrary: DeviceType[],
  options: ExportOptions,
  images?: ImageStoreMap,
  onProgress?: ExportProgressCallback,
  layoutId?: string,
): Promise<Blob> {
  // Dynamically import JSZip wrapper
  const { createZip, generateRackFilename } = await import("../zip");

  const format = options.format === "jpeg" ? "jpg" : options.format;
  const files: { name: string; blob: Blob }[] = [];

  for (const [i, rack] of racks.entries()) {
    onProgress?.({ current: i + 1, total: racks.length, rackName: rack.name });

    // Generate SVG for this rack
    const svg = generateSingleRackSVG(rack, deviceLibrary, options, images, layoutId);

    // Convert to the requested format
    let blob: Blob;
    if (options.format === "svg") {
      const svgString = exportAsSVG(svg);
      blob = new Blob([svgString], { type: "image/svg+xml" });
    } else if (options.format === "png") {
      blob = await exportAsPNG(svg);
    } else if (options.format === "jpeg") {
      blob = await exportAsJPEG(svg);
    } else {
      throw new Error(`Unsupported format for ZIP export: ${options.format}`);
    }

    // Generate filename for this rack
    const view = options.exportView || "both";
    const filename = generateRackFilename(rack.name, view, format);

    // Ensure unique filenames by appending index if duplicate
    const existingNames = files.map((f) => f.name);
    let finalName = filename;
    let counter = 1;
    while (existingNames.includes(finalName)) {
      const ext = filename.split(".").pop();
      const base = filename.replace(`.${ext}`, "");
      finalName = `${base}-${counter}.${ext}`;
      counter++;
    }

    files.push({ name: finalName, blob });
  }

  return createZip(files);
}

/**
 * Export SVG string as multi-page PDF (one rack per page)
 *
 * @param racks - Racks to export (one per page)
 * @param deviceLibrary - Device library for device definitions
 * @param options - Export options
 * @param images - Optional map of device images
 * @param onProgress - Optional progress callback
 * @returns Promise resolving to PDF blob
 */
export async function exportAsMultiPagePDF(
  racks: Rack[],
  deviceLibrary: DeviceType[],
  options: ExportOptions,
  images?: ImageStoreMap,
  onProgress?: ExportProgressCallback,
  layoutId?: string,
): Promise<Blob> {
  // Dynamically import jsPDF to avoid loading it on app startup
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");

  // US Letter dimensions in points (72 dpi)
  const letterWidth = 612; // 8.5 inches
  const letterHeight = 792; // 11 inches
  const margin = 36; // 0.5 inch margins
  const headerHeight = 30; // Space for rack name header

  let pdf: InstanceType<typeof jsPDF> | null = null;

  for (const [i, rack] of racks.entries()) {
    onProgress?.({ current: i + 1, total: racks.length, rackName: rack.name });

    // Generate SVG for this rack
    const svg = generateSingleRackSVG(rack, deviceLibrary, options, images, layoutId);

    // Parse SVG to get dimensions
    const imgWidth = parseInt(svg.getAttribute("width") || "0", 10);
    const imgHeight = parseInt(svg.getAttribute("height") || "0", 10);

    if (imgWidth === 0 || imgHeight === 0) {
      console.warn(
        `Skipping rack "${rack.name}" due to invalid SVG dimensions (${imgWidth}x${imgHeight})`,
      );
      continue;
    }

    // Determine page orientation based on rack aspect ratio
    const isLandscape = imgWidth > imgHeight;
    const pageWidth = isLandscape ? letterHeight : letterWidth;
    const pageHeight = isLandscape ? letterWidth : letterHeight;
    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - margin * 2 - headerHeight;

    // Calculate scaling to fit on page
    const scale = Math.min(
      availableWidth / imgWidth,
      availableHeight / imgHeight,
    );
    const scaledWidth = imgWidth * scale;
    const scaledHeight = imgHeight * scale;

    // Center on page
    const x = (pageWidth - scaledWidth) / 2;
    const y = margin + headerHeight + (availableHeight - scaledHeight) / 2;

    // Initialize PDF or add new page
    if (pdf === null) {
      pdf = new jsPDF({
        orientation: isLandscape ? "landscape" : "portrait",
        unit: "pt",
        format: "letter",
      });
    } else {
      pdf.addPage("letter", isLandscape ? "landscape" : "portrait");
    }

    // Add rack name as header
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text(rack.name, pageWidth / 2, margin + 20, { align: "center" });

    // Normalise SVG for svg2pdf before conversion (baseline + font-weight).
    // This SVG is generated per page and not shared with the PNG path.
    prepareSvgForPdf(svg);

    // Convert SVG to vector PDF
    await pdf.svg(svg, { x, y, width: scaledWidth, height: scaledHeight });
  }

  if (!pdf) {
    throw new Error("No valid racks to export");
  }

  return pdf.output("blob");
}
