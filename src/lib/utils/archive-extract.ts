/**
 * Archive extraction (ZIP reader).
 *
 * The dual-format reader for folder-based ZIP archives: detects the new folder
 * structure (#919) and the old flat structure, enforces the size/entry/ratio
 * guardrails, and decodes the YAML plus nested image assets. archive.ts holds
 * the writer and re-exports extractFolderArchive (and getJSZip) so consumers
 * importing from "$lib/utils/archive" are unchanged.
 *
 * @see docs/plans/2026-01-22-data-directory-refactor-design.md
 */

import type { Layout } from "$lib/types";
import type { ImageData, ImageStoreMap } from "$lib/types/images";
import { parseLayoutYaml, parseLayoutYamlWithImages } from "./yaml";
import { extractUuidFromFolderName } from "./folder-structure";
import { placementKey } from "./placement-key";
import { archiveDebug } from "./debug";
import { detectImageMime } from "./image-encoding";
import {
  SUPPORTED_IMAGE_FORMATS,
  MAX_IMAGE_SIZE_BYTES,
} from "$lib/types/constants";

/**
 * Lazily load JSZip library
 * Cached after first load for subsequent calls
 */
type JSZipConstructor = typeof import("jszip");
type JSZipInstance = ReturnType<JSZipConstructor>;

let jsZipConstructor: JSZipConstructor | null = null;

/** A single ZIP entry, as exposed on `zip.files[name]`. */
type JSZipFileEntry = JSZipInstance["files"][string];

/**
 * JSZip's per-entry streaming surface. The bundled JSZip types only expose
 * `async()` (which buffers the whole entry into memory) and `nodeStream()`
 * (Node only), but `internalStream()` is a documented, browser-safe method that
 * emits the inflated output in chunks. We type just the slice we use so the size
 * guard can count an entry's inflated bytes incrementally and stop early.
 */
interface ZipEntryStream {
  on(event: "data", handler: (chunk: Uint8Array) => void): ZipEntryStream;
  on(event: "end", handler: () => void): ZipEntryStream;
  on(event: "error", handler: (error: Error) => void): ZipEntryStream;
  pause(): ZipEntryStream;
  resume(): ZipEntryStream;
}

interface StreamableZipEntry {
  internalStream(type: "uint8array"): ZipEntryStream;
}

/**
 * Measure a ZIP entry's uncompressed size by streaming its inflated output and
 * counting bytes, aborting as soon as the running total would exceed
 * `byteBudget`. Chunks are counted then discarded, so peak memory stays at a
 * single inflate chunk no matter how large the entry decompresses to. This is
 * what stops a ZIP bomb from being fully inflated into memory before the size
 * guard can reject it: trusting the ZIP header's declared uncompressed size is
 * not safe (it is attacker-controlled and may under-report), so we measure the
 * real inflated output instead. Resolves with the entry's uncompressed byte
 * length when it fits within the budget.
 */
function measureUncompressedSize(
  entry: JSZipFileEntry,
  byteBudget: number,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const stream = (entry as unknown as StreamableZipEntry).internalStream(
      "uint8array",
    );
    let size = 0;
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      // Stop the inflate pump so no further chunks are produced.
      stream.pause();
      action();
    };
    stream
      .on("data", (chunk) => {
        if (settled) return;
        size += chunk.length;
        if (size > byteBudget) {
          finish(() =>
            reject(
              new Error(
                `Archive uncompressed size is too large (exceeds ${Math.round(
                  LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES / 1024 / 1024,
                )}MB).`,
              ),
            ),
          );
        }
      })
      .on("error", (error) => finish(() => reject(error)))
      .on("end", () => finish(() => resolve(size)))
      .resume();
  });
}

export async function getJSZip(): Promise<JSZipConstructor> {
  if (!jsZipConstructor) {
    const module = (await import("jszip")) as unknown as {
      default?: JSZipConstructor;
    };
    jsZipConstructor =
      module.default ?? (module as unknown as JSZipConstructor);
  }
  return jsZipConstructor;
}

/**
 * Supported image file extensions.
 *
 * SECURITY: gif/svg are intentionally excluded, matching SUPPORTED_IMAGE_FORMATS
 * (the raster-only allowlist enforced by detectImageMime). SVG can carry
 * embedded scripts; excluding it here means an entry named `front.svg` is never
 * even considered a candidate image (#2933).
 */
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

/**
 * File extension to expected image MIME type, for the extension-to-content
 * parity check. Every key is an allowed raster extension (IMAGE_EXTENSIONS); the
 * detected magic-byte MIME must match the extension's entry here (#2972).
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/**
 * Archive extraction limits (guardrails)
 */
const LIMITS = {
  /** Max ZIP file size: 50MB */
  MAX_ZIP_SIZE_BYTES: 50 * 1024 * 1024,
  /** Max uncompressed size: 250MB */
  MAX_TOTAL_UNCOMPRESSED_BYTES: 250 * 1024 * 1024,
  /** Max files in archive: 500 */
  MAX_ENTRY_COUNT: 500,
  /** Max YAML file size: 5MB */
  MAX_YAML_BYTES: 5 * 1024 * 1024,
  /** Max compression ratio: 100:1 */
  MAX_COMPRESSION_RATIO: 100,
};

/**
 * Check if a file path is an image file
 */
function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Detected ZIP format information
 */
interface ZipFormat {
  /** Format type: new folder structure, old flat structure, or invalid */
  type: "new-folder" | "old-flat" | "invalid";
  /** Folder name for new format (e.g., "My Layout-UUID") */
  folderName?: string;
  /** Path to the YAML file within the zip */
  yamlPath?: string;
  /** Path to assets folder (new format) or images folder (old format) */
  assetsPath?: string;
}

/**
 * Detect the format of a ZIP archive
 * Supports both new folder structure (#919) and old flat structure
 */
async function detectZipFormat(zip: JSZipInstance): Promise<ZipFormat> {
  const entries = Object.keys(zip.files);

  // Look for new format: folder with UUID and .rackula.yaml
  for (const entry of entries) {
    const parts = entry.split("/");
    if (parts.length >= 2 && parts[0]) {
      const folderName = parts[0];
      const uuid = extractUuidFromFolderName(folderName);
      if (uuid) {
        // Found a UUID folder - look for .rackula.yaml
        const yamlFile = entries.find(
          (e) => e.startsWith(`${folderName}/`) && e.endsWith(".rackula.yaml"),
        );
        if (yamlFile) {
          return {
            type: "new-folder",
            folderName,
            yamlPath: yamlFile,
            assetsPath: `${folderName}/assets/`,
          };
        }
      }
    }
  }

  // Look for old format: flat .yaml file at root
  const flatYaml = entries.find(
    (e) => !e.includes("/") && (e.endsWith(".yaml") || e.endsWith(".yml")),
  );
  if (flatYaml) {
    // Check if there's an images/ folder
    const hasImagesFolder = entries.some((e) => e.startsWith("images/"));
    return {
      type: "old-flat",
      yamlPath: flatYaml,
      assetsPath: hasImagesFolder ? "images/" : undefined,
    };
  }

  // Look for legacy folder format: folder without UUID containing a .yaml file
  // e.g., "5123home/5123home.yaml" (pre-#919 archives)
  const folderYaml = entries.find((e) => {
    const parts = e.split("/");
    return (
      parts.length === 2 &&
      parts[0] !== "" &&
      (parts[1]!.endsWith(".yaml") || parts[1]!.endsWith(".yml"))
    );
  });
  if (folderYaml) {
    const folderName = folderYaml.split("/")[0]!;
    const hasAssetsFolder = entries.some((e) =>
      e.startsWith(`${folderName}/assets/`),
    );
    return {
      type: "old-flat",
      yamlPath: folderYaml,
      assetsPath: hasAssetsFolder ? `${folderName}/assets/` : undefined,
    };
  }

  return { type: "invalid" };
}

/**
 * Extract a folder-based ZIP archive
 * Supports both new format ({Name}-{UUID}/) and old flat format
 * Returns layout, images map, and list of any images that failed to load
 */
export async function extractFolderArchive(
  blob: Blob,
): Promise<{ layout: Layout; images: ImageStoreMap; failedImages: string[] }> {
  // Guardrail: Empty blob
  if (blob.size === 0) {
    throw new Error("Archive file is empty (0 bytes).");
  }

  // Detect plain YAML files by checking ZIP magic bytes (PK = 0x50 0x4B).
  // YAML files don't start with these bytes, so we handle them directly.
  const headerBuffer = await blob.slice(0, 2).arrayBuffer();
  const header = new Uint8Array(headerBuffer);
  const isZip = header[0] === 0x50 && header[1] === 0x4b;

  if (!isZip) {
    // Whole-file cap before parse. Local YAML load allows up to 5MB
    // (MAX_YAML_BYTES) while the server PUT caps a layout at 1MB, so
    // image-heavy YAML that loads locally fails server save loudly. That
    // mismatch is intentional until storage quotas exist (#617).
    if (blob.size > LIMITS.MAX_YAML_BYTES) {
      throw new Error(
        `Layout file too large (${Math.round(blob.size / 1024 / 1024)}MB). Max size is ${Math.round(LIMITS.MAX_YAML_BYTES / 1024 / 1024)}MB.`,
      );
    }
    const yamlText = await blob.text();
    const { layout, images, failedImagesCount } =
      await parseLayoutYamlWithImages(yamlText);
    // finalizeLayoutLoad uses failedImages.length, so surface the count as that
    // many entries; the placeholder strings are never read individually.
    const failedImages = Array.from(
      { length: failedImagesCount },
      (_, i) => `embedded-image-${i}`,
    );
    return { layout, images, failedImages };
  }

  // Guardrail: Max ZIP size
  if (blob.size > LIMITS.MAX_ZIP_SIZE_BYTES) {
    throw new Error(
      `Archive too large (${Math.round(blob.size / 1024 / 1024)}MB). Max size is 50MB.`,
    );
  }

  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(blob);

  // Guardrail: Max entry count
  const entries = Object.keys(zip.files);
  if (entries.length > LIMITS.MAX_ENTRY_COUNT) {
    throw new Error(
      `Archive contains too many files (${entries.length}). Max is 500.`,
    );
  }

  // Guardrail: Total uncompressed size and compression ratio.
  // Stream each entry's inflated output and count bytes, aborting the moment the
  // running total would exceed MAX_TOTAL_UNCOMPRESSED_BYTES. Counting bytes
  // incrementally (instead of buffering each entry via file.async) keeps peak
  // memory at a single inflate chunk, so a ZIP bomb is rejected mid-inflation
  // rather than after being fully decompressed into memory. Extraction later
  // re-inflates only the YAML/image files it needs; that overlap is small and
  // bounded by the per-file caps below.
  let totalUncompressedSize = 0;
  // Retain each entry's measured inflated size so image extraction can reject an
  // oversized entry BEFORE inflating it into memory, reusing this streamed
  // measurement instead of inflating a second time just to check the cap (#2972).
  const uncompressedSizes = new Map<string, number>();
  for (const name of entries) {
    const file = zip.files[name];
    if (!file || file.dir) continue;
    // Pass the remaining global budget as this entry's cap so the stream aborts
    // as soon as the cumulative total would exceed the limit.
    const size = await measureUncompressedSize(
      file,
      LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES - totalUncompressedSize,
    );
    uncompressedSizes.set(name, size);
    totalUncompressedSize += size;
  }

  const ratio = totalUncompressedSize / blob.size;
  if (ratio > LIMITS.MAX_COMPRESSION_RATIO) {
    throw new Error(
      `Archive has suspicious compression ratio (${Math.round(ratio)}:1).`,
    );
  }

  // Detect format
  const format = await detectZipFormat(zip);

  if (format.type === "invalid") {
    throw new Error("No valid layout file found in archive");
  }

  if (format.type === "new-folder") {
    return await extractNewFormatZip(zip, format, uncompressedSizes);
  }

  // Old flat format
  return await extractOldFormatZip(zip, format, uncompressedSizes);
}

/**
 * Extract from new folder-structure ZIP format (#919)
 * Structure: {Name}-{UUID}/{slug}.rackula.yaml + assets/
 */
async function extractNewFormatZip(
  zip: JSZipInstance,
  format: ZipFormat,
  uncompressedSizes: Map<string, number>,
): Promise<{ layout: Layout; images: ImageStoreMap; failedImages: string[] }> {
  // Extract YAML
  const yamlPath = format.yamlPath;
  if (!yamlPath) {
    throw new Error("YAML path missing for new-format archive");
  }
  const yamlFile = zip.file(yamlPath);
  if (!yamlFile) {
    throw new Error(`YAML file not found: ${yamlPath}`);
  }

  // Guardrail: Max YAML bytes (decompress once, reuse for parsing)
  const yamlBytes = await yamlFile.async("uint8array");
  if (yamlBytes.byteLength > LIMITS.MAX_YAML_BYTES) {
    throw new Error(
      `Layout file too large (${Math.round(yamlBytes.byteLength / 1024 / 1024)}MB).`,
    );
  }

  const yamlContent = new TextDecoder().decode(yamlBytes);
  const layout = await parseLayoutYaml(yamlContent);

  // Derive the layout id from the folder name UUID (canonical persisted identity).
  const layoutId =
    (format.folderName && extractUuidFromFolderName(format.folderName)) ||
    layout.metadata?.id ||
    "";

  // Extract images from assets folder
  const images: ImageStoreMap = new Map();
  const failedImages: string[] = [];

  const assetsPath = format.assetsPath;
  if (assetsPath) {
    const imageFiles = Object.keys(zip.files).filter(
      (name) =>
        name.startsWith(assetsPath) && !name.endsWith("/") && isImageFile(name),
    );

    for (const imagePath of imageFiles) {
      // Parse path: folder/assets/[slug]/[filename].[ext]
      const relativePath = imagePath.substring(assetsPath.length);
      const parts = relativePath.split("/");

      if (parts.length !== 2) continue;

      const deviceSlug = parts[0];
      const filename = parts[1];
      if (!deviceSlug || !filename) continue;

      const result = await extractImageFromZip(
        zip,
        imagePath,
        deviceSlug,
        filename,
        layoutId,
        uncompressedSizes,
      );

      if (result.error) {
        failedImages.push(imagePath);
      } else if (result.imageKey && result.face && result.imageData) {
        const existing = images.get(result.imageKey) ?? {};
        images.set(result.imageKey, {
          ...existing,
          [result.face]: result.imageData,
        });
      }
    }
  }

  return { layout, images, failedImages };
}

/**
 * Extract from old flat ZIP format (backwards compatibility)
 * Structure: {name}.yaml at root, images/ folder optional
 */
async function extractOldFormatZip(
  zip: JSZipInstance,
  format: ZipFormat,
  uncompressedSizes: Map<string, number>,
): Promise<{ layout: Layout; images: ImageStoreMap; failedImages: string[] }> {
  // Extract YAML from root
  const yamlPath = format.yamlPath;
  if (!yamlPath) {
    throw new Error("YAML path missing for old-format archive");
  }
  const yamlFile = zip.file(yamlPath);
  if (!yamlFile) {
    throw new Error(`YAML file not found: ${yamlPath}`);
  }

  // Guardrail: Max YAML bytes (decompress once, reuse for parsing)
  const yamlBytes = await yamlFile.async("uint8array");
  if (yamlBytes.byteLength > LIMITS.MAX_YAML_BYTES) {
    throw new Error(
      `Layout file too large (${Math.round(yamlBytes.byteLength / 1024 / 1024)}MB).`,
    );
  }

  const yamlContent = new TextDecoder().decode(yamlBytes);
  const layout = await parseLayoutYaml(yamlContent);

  const layoutId = layout.metadata?.id ?? "";

  // Old format: images at root level or in images/ folder
  const images: ImageStoreMap = new Map();
  const failedImages: string[] = [];

  // Find all image files (both at root and in images/ folder)
  const imageFiles = Object.keys(zip.files).filter(
    (path) =>
      !zip.files[path]!.dir && isImageFile(path) && path !== format.yamlPath,
  );

  for (const imagePath of imageFiles) {
    // Normalize path: strip the detected assets prefix (or legacy "images/")
    const prefix = format.assetsPath ?? "images/";
    const normalizedPath = imagePath.startsWith(prefix)
      ? imagePath.substring(prefix.length)
      : imagePath;
    const parts = normalizedPath.split("/");

    // Expected structure: [slug]/[filename].[ext]
    if (parts.length === 2) {
      const deviceSlug = parts[0];
      const filename = parts[1];
      if (!deviceSlug || !filename) continue;

      const result = await extractImageFromZip(
        zip,
        imagePath,
        deviceSlug,
        filename,
        layoutId,
        uncompressedSizes,
      );

      if (result.error) {
        failedImages.push(imagePath);
      } else if (result.imageKey && result.face && result.imageData) {
        const existing = images.get(result.imageKey) ?? {};
        images.set(result.imageKey, {
          ...existing,
          [result.face]: result.imageData,
        });
      }
    } else if (parts.length === 1) {
      // Single image at root - try to infer slug from filename
      // e.g., "device-slug-front.png"
      const filename = parts[0];
      if (!filename) continue;

      const match = /^(.+)-(front|rear)\.\w+$/.exec(filename);
      if (match) {
        const [, deviceSlug, faceToken] = match;
        if (!deviceSlug || !faceToken) continue;
        const face = faceToken as "front" | "rear";

        const result = await extractImageFromZip(
          zip,
          imagePath,
          deviceSlug,
          filename,
          "",
          uncompressedSizes,
        );

        if (result.error) {
          failedImages.push(imagePath);
        } else if (result.imageData) {
          const existing = images.get(deviceSlug) ?? {};
          images.set(deviceSlug, {
            ...existing,
            [face]: result.imageData,
          });
        }
      }
    }
  }

  return { layout, images, failedImages };
}

/**
 * Extract a single image from the ZIP file
 * Returns image data or error
 */
async function extractImageFromZip(
  zip: JSZipInstance,
  imagePath: string,
  deviceSlug: string,
  filename: string,
  layoutId: string = "",
  uncompressedSizes?: Map<string, number>,
): Promise<{
  imageKey?: string;
  face?: "front" | "rear";
  imageData?: ImageData;
  error?: boolean;
}> {
  // Check for device type image: front.{ext} or rear.{ext}
  const deviceTypeFaceMatch = /^(front|rear)\.\w+$/.exec(filename);

  // Check for placement image: {deviceId}-front.{ext} or {deviceId}-rear.{ext}
  const placementFaceMatch = /^(.+)-(front|rear)\.\w+$/.exec(filename);

  let imageKey: string;
  let face: "front" | "rear";

  if (deviceTypeFaceMatch) {
    // Device type image
    imageKey = deviceSlug;
    face = deviceTypeFaceMatch[1] as "front" | "rear";
  } else if (placementFaceMatch) {
    // Placement-specific image — namespace by layout id
    const deviceId = placementFaceMatch[1]!;
    face = placementFaceMatch[2] as "front" | "rear";
    imageKey = placementKey(layoutId, deviceId);
  } else {
    return {}; // Unknown format, skip
  }

  const imageFile = zip.file(imagePath);
  if (!imageFile) return { error: true };

  // Reject an oversized entry BEFORE inflating it into memory, using the
  // inflated size already measured by the preflight guard so we do not stream or
  // allocate the entry twice (#2972). The map is populated for every non-dir
  // entry; a missing size falls through to the post-decode byteLength backstop.
  const measuredSize = uncompressedSizes?.get(imagePath);
  if (measuredSize !== undefined && measuredSize > MAX_IMAGE_SIZE_BYTES) {
    archiveDebug.extract("Image exceeds size cap: %s", imagePath);
    return { error: true };
  }

  try {
    // Never trust the file extension or JSZip's extension-inferred blob type:
    // decode the real bytes and validate them the same way the YAML
    // embedded-image path does (detectImageMime + allowlist + size cap, #2933).
    const bytes = await imageFile.async("uint8array");

    // Backstop the pre-decode size gate for any entry missing from the map.
    if (bytes.byteLength > MAX_IMAGE_SIZE_BYTES) {
      archiveDebug.extract("Image exceeds size cap: %s", imagePath);
      return { error: true };
    }

    // Sniff the real bytes, require an allowlisted raster format, AND require the
    // detected format to match the filename extension. That extension-to-content
    // parity mirrors the YAML path's declared-vs-detected check, so a file named
    // front.png carrying JPEG/WebP bytes is rejected rather than silently
    // accepted (#2972).
    const detected = detectImageMime(bytes);
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const expected = EXTENSION_TO_MIME[ext];
    if (
      !detected ||
      !SUPPORTED_IMAGE_FORMATS.includes(detected) ||
      detected !== expected
    ) {
      archiveDebug.extract(
        "Rejected image with unsupported, unrecognised, or mismatched format: %s",
        imagePath,
      );
      return { error: true };
    }

    // Re-wrap into a fresh, plain-ArrayBuffer-backed view: JSZip's uint8array
    // output type is too loose (ArrayBufferLike) for BlobPart.
    const imageBlob = new Blob([new Uint8Array(bytes)], { type: detected });
    const dataUrl = await blobToDataUrl(imageBlob);

    // Graceful degradation: skip images that fail to convert
    if (!dataUrl) {
      archiveDebug.extract("Failed to load image: %s", imagePath);
      return { error: true };
    }

    const imageData: ImageData = {
      blob: imageBlob,
      dataUrl,
      filename,
    };

    return { imageKey, face, imageData };
  } catch (error) {
    // Catch any unexpected errors during blob extraction
    archiveDebug.extract("Failed to extract image: %s", imagePath, error);
    return { error: true };
  }
}

/**
 * Convert a Blob to a data URL
 * Returns null on failure for graceful degradation
 */
function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Type-safe result handling
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        // Unexpected result type (ArrayBuffer when using readAsDataURL is unusual)
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null); // Graceful failure instead of reject
    reader.readAsDataURL(blob);
  });
}
