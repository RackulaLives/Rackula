/**
 * Runtime-agnostic asset validation (#2625).
 *
 * The magic-byte sniff and the allowed-format rules are pure (no node:fs), so
 * both the filesystem driver and the R2 driver share one chokepoint for what is
 * allowed to be stored, and the layout routes can import the validators without
 * dragging the filesystem module (and node:fs) into the Workers bundle.
 */
import { z } from "zod";
import { isUuid } from "../schemas/layout";

/** Image MIME types accepted for stored device assets. */
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
/** File extensions the storage layer may use for validated device assets. */
export const ALLOWED_EXTS = new Set(["png", "jpg", "webp"]);
/** Maximum accepted asset size in bytes. */
export const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/** Supported device image face identifiers. */
export type AssetFace = "front" | "rear";

/** Metadata returned when listing a layout's stored assets. */
export interface AssetInfo {
  layoutId: string;
  deviceSlug: string;
  face: AssetFace;
  ext: string;
  size: number;
}

/**
 * Reduce a Content-Type header to its bare media-type token: drop any
 * parameters (e.g. `; charset=binary`) and lowercase. Lets a parameterized or
 * differently-cased header still match the allowlist and the sniffed type.
 */
function normalizeMediaType(contentType: string): string {
  return (contentType.split(";")[0] ?? "").trim().toLowerCase();
}

/**
 * Detect an image MIME type purely from leading magic bytes.
 *
 * Recognises PNG, JPEG, and WebP. Returns null for anything unrecognised
 * (including GIF, SVG, and text/HTML starting with "<"), so the asset write
 * path can reject untrusted or disallowed content without trusting the
 * declared Content-Type. SVG is excluded by construction (it has no raster
 * magic bytes), which keeps stored-XSS payloads off the app origin.
 *
 * ALLOWLIST PARITY: this is an independent copy of the client detector
 * `detectImageMime` in `src/lib/utils/image-encoding.ts` (the Bun API cannot
 * import the Svelte bundle). The two must accept the same formats; if you
 * change one, change the other. The client pre-check is advisory; this server
 * copy is the authority for what lands in storage.
 */
export function detectImageMime(bytes: Uint8Array): string | null {
  // PNG: full 8-byte signature 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
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
 * Thrown when an asset write is rejected because the bytes fail the magic-byte
 * sniff (non-raster, SVG/GIF/polyglot) or sniff to a type that disagrees with
 * the declared Content-Type. This is a client error (the upload is bad), so the
 * route maps it to a 400. A typed error keeps that mapping robust against
 * message rewording (a plain Error would fall through to a 500).
 */
export class AssetRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetRejectedError";
  }
}

// Schema for device slug validation
// Prevents path traversal attacks
// Note: Device slugs allow underscores (unlike LayoutIdSchema) to support
// device type slugs like "dell_r640" that come from external sources
export const DeviceSlugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(
    /^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$/,
    "Device slug must be lowercase alphanumeric with hyphens/underscores, not starting/ending with special chars",
  );

/**
 * Validate image content type
 */
export function isValidImageType(contentType: string): boolean {
  return ALLOWED_TYPES.has(normalizeMediaType(contentType));
}

/**
 * Get extension from content type
 * Throws for unsupported content types
 */
export function getExtFromContentType(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      throw new Error(`Unsupported content type: ${contentType}`);
  }
}

/**
 * Get content type from extension
 */
export function getContentTypeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      // Defensive fallback for an unknown extension. Callers only pass entries
      // from ALLOWED_EXTS, so this is unreachable in practice; kept dependency
      // free (no logger) so this module stays pure for the Workers bundle.
      return "application/octet-stream";
  }
}

/**
 * Validate layout UUID format
 * Returns null if invalid
 */
export function validateLayoutUuid(layoutId: string): string | null {
  return isUuid(layoutId) ? layoutId : null;
}

/**
 * Validate and sanitize device slug
 * Returns null if invalid
 */
export function validateDeviceSlug(deviceSlug: string): string | null {
  const parsed = DeviceSlugSchema.safeParse(deviceSlug);
  return parsed.success ? parsed.data : null;
}

/**
 * Check if device slug is valid (exported for use in routes)
 */
export function isValidDeviceSlug(slug: string): boolean {
  return DeviceSlugSchema.safeParse(slug).success;
}

/**
 * The shared write chokepoint: validate the declared type, enforce the size
 * cap, and sniff the magic bytes. The on-disk/object extension is derived from
 * the SNIFFED type, never the declared header, so a spoofed Content-Type cannot
 * pick the filename. Throws a plain Error for a disallowed type or oversized
 * body, and {@link AssetRejectedError} when the bytes do not vouch for the
 * declared type. Returns the storage extension on success.
 */
export function validateAssetBytes(
  data: ArrayBuffer,
  contentType: string,
): { ext: string } {
  // Compare against the bare media type so a parameterized/cased header (e.g.
  // "image/png; charset=binary") is handled the same as "image/png".
  const mediaType = normalizeMediaType(contentType);
  if (!ALLOWED_TYPES.has(mediaType)) {
    throw new Error(`Invalid content type: ${contentType}`);
  }

  if (data.byteLength > MAX_SIZE) {
    throw new Error(
      `Image too large: ${data.byteLength} bytes (max ${MAX_SIZE})`,
    );
  }

  // Magic-byte sniff is the authority for what reaches storage. The declared
  // Content-Type is advisory: a non-image body sent as image/png, an SVG, a
  // GIF, or an HTML/JS polyglot would otherwise be stored and served from the
  // app origin (stored XSS / MIME confusion). Reject when the bytes do not
  // sniff to a raster format, or sniff to a format that disagrees with the
  // declared type.
  const sniffedType = detectImageMime(new Uint8Array(data));
  if (!sniffedType) {
    throw new AssetRejectedError(
      "Rejected asset: bytes do not match an allowed image format (png/jpeg/webp)",
    );
  }
  if (sniffedType !== mediaType) {
    throw new AssetRejectedError(
      `Rejected asset: declared content type ${mediaType} disagrees with sniffed type ${sniffedType}`,
    );
  }

  return { ext: getExtFromContentType(sniffedType) };
}
