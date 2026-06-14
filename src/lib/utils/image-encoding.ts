/**
 * Image encoding for the plain-YAML save/load path (#617)
 *
 * User-uploaded device images are embedded as base64 data URLs in the YAML so
 * the default `.rackula.yaml` save no longer drops them. On load the payload is
 * sniffed by magic bytes (never trusting the declared MIME), validated against
 * the allowed raster formats, and stripped if bad so one corrupt image never
 * rejects the whole file.
 *
 * SIZE DIVERGENCE (intentional, until storage quotas are designed):
 * Local YAML load allows images up to MAX_IMAGE_SIZE_BYTES (5MB) each, while the
 * server PUT caps an entire layout at 1MB. So an image-heavy YAML that loads
 * fine locally will fail the server save loudly. That mismatch is deliberate:
 * local files are trusted, the server is shared storage.
 *
 * This module is intentionally neutral: it imports only from $lib/types so it
 * can be used by both yaml.ts and archive.ts without circular imports.
 */

import type { ImageData, ImageStoreMap } from "$lib/types/images";
import {
  SUPPORTED_IMAGE_FORMATS,
  MAX_IMAGE_SIZE_BYTES,
} from "$lib/types/constants";

/** Faces serialized per device key. */
export interface SerializedFaces {
  front?: string;
  rear?: string;
}

/** Map of store key to its serialized image faces. */
export type SerializedImages = Record<string, SerializedFaces>;

/**
 * Warn-on-save threshold: images larger than this trigger a single
 * non-blocking toast so users can optimise before files balloon.
 */
const SAVE_WARN_BYTES = 100 * 1024;

const FACES: readonly ("front" | "rear")[] = ["front", "rear"];

/** MIME type to file extension for deriving filenames. */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Detect an image MIME type purely from leading magic bytes.
 *
 * Recognises PNG, JPEG, and WebP. Returns null for anything unrecognised
 * (including GIF, SVG, and text starting with "<"), so callers can reject untrusted or
 * disallowed content without trusting any declared prefix.
 */
export function detectImageMime(bytes: Uint8Array): string | null {
  // PNG: 89 50 4E 47
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  // WebP: "RIFF" at 0-3 and "WEBP" at 8-11
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Reserved keys that must never be copied from untrusted parsed YAML onto a plain
 * object: assigning them would mutate the prototype (prototype-pollution vector).
 * Mirrors the serializer's UNSAFE_KEYS guard (#2208).
 */
const UNSAFE_KEYS = new Set<string>(["__proto__", "constructor", "prototype"]);

/**
 * Decode the base64 payload of a `data:<mime>;base64,<payload>` URL.
 * Returns null if the string is not a base64 data URL or fails to decode.
 */
export function decodeDataUrl(value: string): Uint8Array<ArrayBuffer> | null {
  const match = /^data:[^,]*;base64,(.*)$/s.exec(value);
  if (!match) return null;
  const payload = match[1] ?? "";
  try {
    const binary = atob(payload);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Estimate the decoded byte length of a base64 data URL without allocating the
 * full buffer (cheap oversized check). Returns null if not a base64 data URL.
 */
export function dataUrlByteLength(value: string): number | null {
  const match = /^data:[^,]*;base64,(.*)$/s.exec(value);
  if (!match) return null;
  const payload = match[1] ?? "";
  const len = payload.length;
  if (len === 0) return 0;
  let padding = 0;
  if (payload.endsWith("==")) padding = 2;
  else if (payload.endsWith("=")) padding = 1;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Encode a map of user images into the YAML `images` record.
 *
 * Uses each ImageData's existing `dataUrl` (already a base64 data URL), so this
 * is synchronous. Counts faces whose underlying image exceeds the save warning
 * threshold (~100KB) into `oversized`.
 */
export function encodeUserImagesToYaml(images: ImageStoreMap): {
  serialized: SerializedImages;
  oversized: number;
} {
  const serialized: SerializedImages = {};
  let oversized = 0;

  for (const [key, deviceImages] of images) {
    // Never write reserved/prototype keys into the plain serialized object: a
    // device id of "__proto__" would otherwise mutate the prototype on assignment.
    if (UNSAFE_KEYS.has(key)) continue;
    const faces: SerializedFaces = {};

    for (const face of FACES) {
      const image = deviceImages[face];
      const dataUrl = image?.dataUrl;
      if (!image || !dataUrl) continue;

      faces[face] = dataUrl;

      const size = image.blob?.size ?? dataUrlByteLength(dataUrl) ?? 0;
      if (size > SAVE_WARN_BYTES) {
        oversized++;
      }
    }

    if (faces.front || faces.rear) {
      serialized[key] = faces;
    }
  }

  return { serialized, oversized };
}

/**
 * Decode and validate the `images` section parsed from untrusted YAML.
 *
 * Each face value must be a base64 data URL whose decoded bytes sniff to an
 * allowed raster format and stay within MAX_IMAGE_SIZE_BYTES. Anything that
 * fails (not a string, malformed data URL, unknown/disallowed MIME via magic
 * bytes, or oversized) is skipped and counted in `failedImagesCount` so the
 * existing "N images couldn't be read" toast fires. A bad image never rejects
 * the layout.
 *
 * The decoded `dataUrl` keeps the ORIGINAL string verbatim (not rebuilt from the
 * sniffed MIME) so a load -> save cycle is byte-stable. The detected MIME is
 * still used for the Blob type and filename extension.
 *
 * `failedKeys` lists the store keys whose face was rejected, so callers can log
 * them to help a confused user. `failedImagesCount` is the count the existing
 * toast uses.
 */
export function decodeYamlImages(raw: unknown): {
  images: ImageStoreMap;
  failedImagesCount: number;
  failedKeys: string[];
} {
  const images: ImageStoreMap = new Map();
  const failedKeys: string[] = [];
  let failedImagesCount = 0;

  if (raw === null || typeof raw !== "object") {
    return { images, failedImagesCount, failedKeys };
  }

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    // Defense-in-depth: never read reserved/prototype keys off untrusted YAML.
    if (UNSAFE_KEYS.has(key)) continue;
    if (value === null || typeof value !== "object") {
      continue;
    }
    const faceRecord = value as Record<string, unknown>;

    for (const face of FACES) {
      // Own properties only: `in` would read a face injected via the prototype
      // chain (e.g. a crafted YAML `__proto__: { front: ... }`).
      if (!Object.hasOwn(faceRecord, face)) continue;
      const faceValue = faceRecord[face];

      // Malformed shape (missing/non-string) counts as a failed image.
      if (typeof faceValue !== "string") {
        failedImagesCount++;
        failedKeys.push(key);
        continue;
      }

      // Reject oversized faces BEFORE allocating: the cheap base64 length check
      // skips multi-MB payloads without an atob() allocation.
      const estimatedSize = dataUrlByteLength(faceValue);
      if (estimatedSize !== null && estimatedSize > MAX_IMAGE_SIZE_BYTES) {
        failedImagesCount++;
        failedKeys.push(key);
        continue;
      }

      const declaredMimeMatch = /^data:([^;,]+)[^,]*;base64,/i.exec(faceValue);
      const declaredMime = declaredMimeMatch?.[1]?.toLowerCase();

      const bytes = decodeDataUrl(faceValue);
      if (!bytes) {
        failedImagesCount++;
        failedKeys.push(key);
        continue;
      }

      // Backstop the pre-alloc estimate after the exact decode.
      if (bytes.byteLength > MAX_IMAGE_SIZE_BYTES) {
        failedImagesCount++;
        failedKeys.push(key);
        continue;
      }

      const detected = detectImageMime(bytes);
      if (
        !detected ||
        !SUPPORTED_IMAGE_FORMATS.includes(detected) ||
        declaredMime !== detected
      ) {
        failedImagesCount++;
        failedKeys.push(key);
        continue;
      }

      const ext = MIME_TO_EXT[detected] ?? "png";
      const imageData: ImageData = {
        blob: new Blob([bytes], { type: detected }),
        // Keep the original data URL verbatim for a byte-stable round-trip.
        dataUrl: faceValue,
        filename: `${key}-${face}.${ext}`,
      };

      const existing = images.get(key) ?? {};
      images.set(key, { ...existing, [face]: imageData });
    }
  }

  return { images, failedImagesCount, failedKeys };
}
