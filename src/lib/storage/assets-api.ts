/**
 * Client transport for the server-mode asset API (#2513).
 *
 * Wraps the endpoints under `/assets`:
 *   PUT/GET/DELETE /assets/:layoutId/:deviceId/:face
 *   GET            /assets/:layoutId            (listing, for the save reconcile)
 *
 * The `:deviceId` path segment is ALWAYS the placed-device instance UUID (the
 * `deviceId` portion of a placement key), never the device-type slug and never
 * the full colon-namespaced placement key. `deviceKeyForWire` enforces this:
 * it extracts the device id and asserts it is a bare lowercase UUID with no
 * colon and no path characters, so a malformed key can never widen the
 * server's path-traversal surface. The server `DeviceSlugSchema`
 * (`api/src/storage/assets.ts`) is the backstop; a bare lowercase UUID passes
 * it unchanged.
 *
 * Server-mode only. No save/load wiring lives here; the Save (#2530) and Load
 * (#2531) layers build on these helpers.
 */
import { z } from "zod";
import { API_BASE_URL, PersistenceError } from "./api";
import { isApiAvailable } from "./availability.svelte";
import {
  SUPPORTED_IMAGE_FORMATS,
  MAX_IMAGE_SIZE_BYTES,
} from "$lib/types/constants";
import {
  deviceIdFromPlacementKey,
  isPlacementKey,
} from "$lib/utils/placement-key";
import { persistenceDebug } from "$lib/utils/debug";

const log = persistenceDebug.api;

/** Default timeout for asset requests (10 seconds), matching the layout API. */
const ASSET_TIMEOUT_MS = 10_000;

/** A persisted asset is stored per physical face; "both" is not an on-disk face. */
export type AssetFace = "front" | "rear";

/**
 * A bare lowercase UUID: 32 hex digits in 8-4-4-4-12 groups. This is what
 * `generateId()` (`src/lib/utils/device.ts`) emits and what the server
 * `DeviceSlugSchema` accepts unchanged. The pattern forbids colons, dots,
 * slashes, and backslashes by construction, so it doubles as the wire-safety
 * gate for the `:deviceId` path segment.
 */
const BARE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Resolve the wire-safe `:deviceId` path segment from a placement image key.
 *
 * Extracts the device id via {@link deviceIdFromPlacementKey} (handling both
 * the namespaced `placement-{layoutId}:{deviceId}` and legacy
 * `placement-{deviceId}` shapes), then asserts the result is a bare lowercase
 * UUID. Throws a {@link PersistenceError} otherwise, so a colon-bearing or
 * path-character-bearing segment can never reach the server.
 */
export function deviceKeyForWire(placementKey: string): string {
  if (!isPlacementKey(placementKey)) {
    throw new PersistenceError(
      `Unsafe asset device key: expected a "placement-" key, got "${placementKey}"`,
    );
  }
  const deviceId = deviceIdFromPlacementKey(placementKey);
  if (!BARE_UUID.test(deviceId)) {
    throw new PersistenceError(
      `Unsafe asset device key: expected a bare lowercase UUID, got "${deviceId}"`,
    );
  }
  return deviceId;
}

/**
 * Listing entry from `GET /assets/:layoutId` (route added in the Save issue).
 * `deviceSlug` is constrained to the same bare lowercase UUID as the wire path
 * segment, so malformed server data (a colon, a path char, an unexpected
 * device-type slug) is rejected before it reaches the save reconcile.
 */
const AssetListItemSchema = z.object({
  deviceSlug: z.string().regex(BARE_UUID),
  face: z.enum(["front", "rear"]),
  ext: z.string().min(1),
  size: z.number().int().nonnegative(),
});

const AssetListResponseSchema = z.object({
  assets: z.array(AssetListItemSchema),
});

/**
 * One on-disk asset face for a placed device, as returned by `listAssets`.
 * `deviceSlug` is the placed-device instance UUID; `face` is the physical face;
 * `ext` is the stored file extension; `size` is the byte length on disk. The
 * save reconcile set-diffs these against the layout's current custom faces.
 */
export type AssetListItem = z.infer<typeof AssetListItemSchema>;

/**
 * Build the asset endpoint URL for one placed-device image face.
 *
 * Every path segment is percent-encoded; the `:deviceId` segment must already
 * be a bare lowercase UUID (use {@link deviceKeyForWire} to derive it from a
 * placement key). Exported so the load layer can address a face directly (for
 * example as an `<img>` src) without re-fetching it as a Blob.
 */
export function assetUrl(
  layoutId: string,
  deviceId: string,
  face: AssetFace,
): string {
  return `${API_BASE_URL}/assets/${encodeURIComponent(
    layoutId,
  )}/${encodeURIComponent(deviceId)}/${encodeURIComponent(face)}`;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const data: unknown = JSON.parse(text);
      if (data && typeof data === "object" && "error" in data) {
        return String((data as { error: unknown }).error);
      }
    } catch {
      // fall through to raw text
    }
    return text || response.statusText || "Unknown error";
  } catch {
    return response.statusText || "Unknown error";
  }
}

/**
 * Upload one image face for a placed device.
 *
 * Pre-checks the content type against the raster allowlist (rejecting SVG and
 * anything else) and the 5MB size limit client-side, so a doomed PUT is never
 * issued. The server is the backstop: it re-validates the type, the 5MB body
 * limit (413), and the per-layout asset quota (507). Those server statuses
 * surface as typed {@link PersistenceError}s.
 */
export async function putAsset(
  layoutId: string,
  deviceId: string,
  face: AssetFace,
  blob: Blob,
  contentType: string,
): Promise<void> {
  if (!isApiAvailable()) {
    throw new PersistenceError("API not available");
  }

  if (!SUPPORTED_IMAGE_FORMATS.includes(contentType)) {
    const allowed = SUPPORTED_IMAGE_FORMATS.map((f) =>
      f.replace("image/", "").toUpperCase(),
    ).join(", ");
    throw new PersistenceError(
      `Unsupported image type: ${contentType}. Must be ${allowed}.`,
    );
  }

  if (blob.size > MAX_IMAGE_SIZE_BYTES) {
    throw new PersistenceError(
      `Image too large: ${blob.size} bytes (max ${MAX_IMAGE_SIZE_BYTES})`,
      413,
    );
  }

  const url = assetUrl(layoutId, deviceId, face);
  log("putAsset: PUT %s (%s)", url, contentType);

  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
    signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
  });

  if (!response.ok) {
    const message = await errorMessage(response);
    log("putAsset: error status=%d message=%s", response.status, message);
    throw new PersistenceError(message, response.status);
  }
}

/**
 * Fetch one image face for a placed device as a Blob. The load layer
 * eager-fetches every custom face with this and stores the bytes so render and
 * export reuse the existing blob path.
 */
export async function getAssetBlob(
  layoutId: string,
  deviceId: string,
  face: AssetFace,
): Promise<Blob> {
  if (!isApiAvailable()) {
    throw new PersistenceError("API not available");
  }

  const url = assetUrl(layoutId, deviceId, face);
  log("getAssetBlob: GET %s", url);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
  });

  if (!response.ok) {
    const message = await errorMessage(response);
    log("getAssetBlob: error status=%d message=%s", response.status, message);
    throw new PersistenceError(message, response.status);
  }

  return response.blob();
}

/**
 * Delete one image face for a placed device (used by the save reconcile).
 *
 * Idempotent: a 404 means the face is already absent, which is the desired end
 * state for a reconcile, so it resolves as a successful no-op rather than
 * failing the save. A concurrent delete or a stale listing must not abort the
 * reconcile loop.
 */
export async function deleteAsset(
  layoutId: string,
  deviceId: string,
  face: AssetFace,
): Promise<void> {
  if (!isApiAvailable()) {
    throw new PersistenceError("API not available");
  }

  const url = assetUrl(layoutId, deviceId, face);
  log("deleteAsset: DELETE %s", url);

  const response = await fetch(url, {
    method: "DELETE",
    signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
  });

  if (response.status === 404) {
    log("deleteAsset: 404 (already absent), treating as no-op");
    return;
  }

  if (!response.ok) {
    const message = await errorMessage(response);
    log("deleteAsset: error status=%d message=%s", response.status, message);
    throw new PersistenceError(message, response.status);
  }
}

/**
 * List the faces present on disk for a layout, for the save-time set-diff
 * reconcile. Targets `GET /assets/:layoutId` (the listing route is added in the
 * Save issue, #2530; this helper is its client).
 */
export async function listAssets(layoutId: string): Promise<AssetListItem[]> {
  if (!isApiAvailable()) {
    throw new PersistenceError("API not available");
  }

  const url = `${API_BASE_URL}/assets/${encodeURIComponent(layoutId)}`;
  log("listAssets: GET %s", url);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
  });

  if (!response.ok) {
    const message = await errorMessage(response);
    log("listAssets: error status=%d message=%s", response.status, message);
    throw new PersistenceError(message, response.status);
  }

  try {
    const raw: unknown = await response.json();
    return AssetListResponseSchema.parse(raw).assets;
  } catch (error) {
    log("listAssets: validation failed %O", error);
    throw new PersistenceError("Invalid asset listing from API server");
  }
}
