/**
 * Image Audit Script
 * Compares source images with processed images to detect clipping
 */

import sharp from "sharp";
import { readdir } from "fs/promises";
import { join } from "path";

const sourceDir = "assets-source/device-images/ubiquiti";
const processedDir = "src/lib/assets/device-images/ubiquiti";

async function getImageDims(path: string) {
  try {
    const meta = await sharp(path).metadata();
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

async function main() {
  const sourceFiles = await readdir(sourceDir).catch(() => []);

  console.log("=== IMAGE DIMENSION COMPARISON ===\n");

  let clippingFound = false;
  let count = 0;

  for (const file of sourceFiles) {
    if (!file.endsWith(".png")) continue;

    const baseName = file.replace(".png", "");
    const sourcePath = join(sourceDir, file);
    const processedPath = join(processedDir, baseName + ".webp");

    const sourceDims = await getImageDims(sourcePath);
    const processedDims = await getImageDims(processedPath);

    if (!sourceDims || !processedDims) continue;

    const widthRatio = processedDims.width! / sourceDims.width!;
    const heightRatio = processedDims.height! / sourceDims.height!;

    // Check if aspect ratio changed (sign of clipping)
    if (Math.abs(widthRatio - heightRatio) > 0.01) {
      console.log(`⚠️  ${baseName}:`);
      console.log(`   Source:    ${sourceDims.width} x ${sourceDims.height}`);
      console.log(
        `   Processed: ${processedDims.width} x ${processedDims.height}`,
      );
      console.log(
        `   Scale:     ${(widthRatio * 100).toFixed(1)}% width, ${(heightRatio * 100).toFixed(1)}% height`,
      );
      console.log(`   ASPECT RATIO MISMATCH - possible clipping!\n`);
      clippingFound = true;
    }
    count++;
  }

  console.log(`\nAudited ${count} images.`);

  if (!clippingFound) {
    console.log("✅ No clipping detected - all aspect ratios preserved.");
  } else {
    console.log("⚠️  Some images may have clipping issues.");
  }

  // Show sample dimensions
  console.log("\n=== SAMPLE DIMENSIONS ===\n");
  for (const file of sourceFiles.slice(0, 5)) {
    if (!file.endsWith(".png")) continue;

    const baseName = file.replace(".png", "");
    const sourcePath = join(sourceDir, file);
    const processedPath = join(processedDir, baseName + ".webp");

    const sourceDims = await getImageDims(sourcePath);
    const processedDims = await getImageDims(processedPath);

    if (!sourceDims || !processedDims) continue;

    console.log(`${baseName}:`);
    console.log(`   Source:    ${sourceDims.width} x ${sourceDims.height}`);
    console.log(
      `   Processed: ${processedDims.width} x ${processedDims.height}`,
    );
  }
}

main().catch(console.error);
