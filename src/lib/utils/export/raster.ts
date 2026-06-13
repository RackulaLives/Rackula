/**
 * Export SVG as PNG blob
 */
export async function exportAsPNG(
  svg: SVGElement,
  scale: number = 2,
): Promise<Blob> {
  return exportAsRaster(svg, "image/png", scale);
}

/**
 * Export SVG as JPEG blob
 */
export async function exportAsJPEG(
  svg: SVGElement,
  scale: number = 2,
  quality: number = 0.92,
): Promise<Blob> {
  return exportAsRaster(svg, "image/jpeg", scale, quality);
}

/**
 * Internal function to render SVG to canvas and export as raster image
 */
async function exportAsRaster(
  svg: SVGElement,
  mimeType: string,
  scale: number,
  quality?: number,
): Promise<Blob> {
  const width = parseInt(svg.getAttribute("width") || "0", 10);
  const height = parseInt(svg.getAttribute("height") || "0", 10);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  // Scale the canvas
  ctx.scale(scale, scale);

  // For JPEG, fill with white background first (no transparency)
  if (mimeType === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  // Convert SVG to data URL
  const svgString = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svgBlob);

  try {
    // Load image
    const img = await loadImage(url);

    // Draw to canvas
    ctx.drawImage(img, 0, 0);

    // Convert to blob
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create blob"));
          }
        },
        mimeType,
        quality,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Load an image from URL
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}
