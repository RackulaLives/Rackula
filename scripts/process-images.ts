/**
 * Image Processing Script
 * Processes device images from assets-source/ to src/lib/assets/device-images/
 *
 * - Resizes images to 400px max width (preserves aspect ratio)
 * - Converts to WebP format
 * - Preserves directory structure
 *
 * Usage:
 *   npm run process-images                    # process every vendor
 *   npx tsx scripts/process-images.ts --vendor mikrotik   # process one vendor only
 *
 * Scoping to a vendor avoids re-encoding unrelated vendors' images (each
 * encode is lossy, so an unscoped run churns every vendor's webp output even
 * when only one vendor changed, e.g. during a NetBox import).
 */

import sharp from "sharp";
import { readdir, mkdir, stat } from "fs/promises";
import { join, parse, relative } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_DIR = join(__dirname, "..", "assets-source", "device-images");
const OUTPUT_DIR = join(
  __dirname,
  "..",
  "src",
  "lib",
  "assets",
  "device-images",
);
const MAX_WIDTH = 400;
const SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

function parseVendorArg(argv: string[]): string | undefined {
  const index = argv.indexOf("--vendor");
  if (index === -1) return undefined;
  return argv[index + 1];
}

interface ProcessResult {
  file: string;
  status: "processed" | "skipped" | "error";
  reason?: string;
  originalSize?: { width: number; height: number };
  newSize?: { width: number; height: number };
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // Directory already exists
  }
}

async function getFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await getFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = parse(entry.name).ext.toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Directory doesn't exist or is empty
  }

  return files;
}

async function processImage(sourcePath: string): Promise<ProcessResult> {
  const relativePath = relative(SOURCE_DIR, sourcePath);
  const parsed = parse(relativePath);
  const outputPath = join(OUTPUT_DIR, parsed.dir, `${parsed.name}.webp`);

  try {
    // Get original image metadata
    const metadata = await sharp(sourcePath).metadata();
    const originalWidth = metadata.width ?? 0;
    const originalHeight = metadata.height ?? 0;

    // Calculate new dimensions
    let newWidth = originalWidth;
    let newHeight = originalHeight;

    if (originalWidth > MAX_WIDTH) {
      newWidth = MAX_WIDTH;
      newHeight = Math.round((originalHeight / originalWidth) * MAX_WIDTH);
    }

    // Ensure output directory exists
    await ensureDir(join(OUTPUT_DIR, parsed.dir));

    // Process image
    await sharp(sourcePath)
      .resize(newWidth, newHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toFile(outputPath);

    return {
      file: relativePath,
      status: "processed",
      originalSize: { width: originalWidth, height: originalHeight },
      newSize: { width: newWidth, height: newHeight },
    };
  } catch (error) {
    return {
      file: relativePath,
      status: "error",
      reason: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function processImages(vendor?: string): Promise<ProcessResult[]> {
  const scanDir = vendor ? join(SOURCE_DIR, vendor.toLowerCase()) : SOURCE_DIR;

  console.log("🖼️  Device Image Processor");
  console.log("========================\n");
  console.log(`Source: ${scanDir}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Max width: ${MAX_WIDTH}px`);
  console.log(`Output format: WebP\n`);

  // Check if source directory exists
  try {
    await stat(scanDir);
  } catch {
    console.log("⚠️  Source directory does not exist. Nothing to process.");
    console.log(
      vendor
        ? `   No images found for vendor "${vendor}" in assets-source/device-images/.\n`
        : "   Place images in assets-source/device-images/ and run again.\n",
    );
    return [];
  }

  // Get all image files
  const files = await getFiles(scanDir);

  if (files.length === 0) {
    console.log("⚠️  No images found in source directory.");
    console.log("   Supported formats: PNG, JPG, JPEG, WebP\n");
    return [];
  }

  console.log(`Found ${files.length} image(s) to process...\n`);

  // Process all images
  const results: ProcessResult[] = [];
  for (const file of files) {
    const result = await processImage(file);
    results.push(result);

    if (result.status === "processed") {
      const sizeInfo =
        result.originalSize && result.newSize
          ? ` (${result.originalSize.width}x${result.originalSize.height} → ${result.newSize.width}x${result.newSize.height})`
          : "";
      console.log(`✅ ${result.file}${sizeInfo}`);
    } else if (result.status === "error") {
      console.log(`❌ ${result.file}: ${result.reason}`);
    }
  }

  // Summary
  const processed = results.filter((r) => r.status === "processed").length;
  const errors = results.filter((r) => r.status === "error").length;

  console.log("\n------------------------");
  console.log(`✅ Processed: ${processed}`);
  if (errors > 0) {
    console.log(`❌ Errors: ${errors}`);
  }
  console.log("Done!\n");

  return results;
}

async function main(): Promise<void> {
  const vendor = parseVendorArg(process.argv.slice(2));
  await processImages(vendor);
}

// Only run when invoked directly (e.g. `npx tsx scripts/process-images.ts`), not
// when imported as a module (e.g. by scripts/import-netbox-devices.ts). Compares
// via pathToFileURL rather than a raw `file://` template, since a plain
// concatenation doesn't URL-encode spaces/non-ASCII characters or normalise
// Windows path separators, so it can silently mismatch and never run.
const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch(console.error);
}

export { processImages };
