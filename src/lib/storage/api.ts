/**
 * Persistence API Client
 * Communicates with the API sidecar for layout CRUD
 * Uses UUID-based routing for stable URLs across renames
 */
import { isApiAvailable, getStorageMode } from "./availability.svelte";
import { eagerFetchServerImages } from "./server-load-images";
import {
  hasPreCarrierMigrationPending,
  clearPreCarrierMigrationPending,
} from "./pre-carrier-migration-pending";
import {
  putAsset,
  deleteAsset,
  listAssets,
  deviceKeyForWire,
  type AssetFace,
} from "./assets-api";
import { isPlacementKey } from "$lib/utils/placement-key";
import type { Layout } from "$lib/types";
import type {
  ImageStoreMap,
  ImageData,
  SupportedImageFormat,
} from "$lib/types/images";
import {
  serializeLayoutToYaml,
  parseLayoutYamlWithImages,
} from "$lib/utils/yaml";
import {
  encodeUserImagesToYaml,
  decodeDataUrl,
  detectImageMime,
} from "$lib/utils/image-encoding";
import { persistenceDebug } from "$lib/utils/debug";
import { z } from "zod";

const log = persistenceDebug.api;

/**
 * API base URL for persistence endpoints
 * Defaults to /api (proxied by nginx in Docker)
 * Normalized: empty or unset falls back to /api, trailing slashes stripped,
 * relative values get a leading slash so health and CRUD resolve identically
 */
function normalizeApiBaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  if (trimmed === "") return "/api";
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) return trimmed;
  return `/${trimmed}`;
}

/**
 * Normalized API base URL with no trailing slash. Either an absolute
 * `http(s)://` origin (from `VITE_API_URL`) or a relative path (default
 * `/api`). Callers append their route to it directly.
 */
export const API_BASE_URL: string = normalizeApiBaseUrl(
  import.meta.env.VITE_API_URL,
);

/**
 * Human-readable label for the server instance, used in offline/recovery toasts.
 * Prefers the API host when the base URL is absolute, falls back to the page
 * host, then to a generic phrase when neither is available.
 */
export function getServerInstanceLabel(): string {
  try {
    if (/^https?:\/\//i.test(API_BASE_URL)) {
      return new URL(API_BASE_URL).host;
    }
  } catch {
    // fall through to page host
  }
  if (typeof window !== "undefined" && window.location?.host) {
    return window.location.host;
  }
  return "the server";
}

/** Default timeout for API requests (10 seconds) */
const API_TIMEOUT_MS = 10_000;

/** Max bytes accepted for a layout GET, matching the server's 1MB PUT cap. */
const MAX_LAYOUT_RESPONSE_BYTES = 1024 * 1024;

/** Health check timeout, shorter so availability probes fail fast (3 seconds) */
const HEALTH_CHECK_TIMEOUT_MS = 3_000;

/**
 * Zod schema for SavedLayoutItem
 */
const SavedLayoutItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  version: z.string(),
  updatedAt: z.string().datetime(),
  rackCount: z.number().int().nonnegative(),
  deviceCount: z.number().int().nonnegative(),
  valid: z.boolean(),
});

/**
 * Layout list response schema
 */
const LayoutListResponseSchema = z.object({
  layouts: z.array(SavedLayoutItemSchema),
});

/**
 * Snapshot list entry from the API. The filename carries a UTC
 * YYYYMMDD-HHMMSS suffix; timestamp is the file mtime (ISO 8601).
 */
const SnapshotItemSchema = z.object({
  filename: z.string().min(1),
  timestamp: z.string().datetime(),
  size: z.number().int().nonnegative(),
});

const SnapshotListResponseSchema = z.object({
  snapshots: z.array(SnapshotItemSchema),
});

export interface SnapshotItem {
  filename: string;
  timestamp: string;
  size: number;
}

/**
 * Save (PUT) response schema. The server echoes the stored updatedAt.
 */
const SaveLayoutResponseSchema = z.object({
  id: z.string().uuid(),
  updatedAt: z.string().datetime(),
});

export interface SaveLayoutResult {
  id: string;
  updatedAt: string;
}

interface PersistenceHealthPayload {
  ok: true;
  status: "ok";
  service: "rackula-persistence-api";
  version: number;
}

function isPersistenceHealthPayload(
  value: unknown,
): value is PersistenceHealthPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    payload.ok === true &&
    payload.status === "ok" &&
    payload.service === "rackula-persistence-api" &&
    typeof payload.version === "number" &&
    Number.isFinite(payload.version)
  );
}

/**
 * Safely parse JSON from response, falling back to text or default message
 */
async function safeParseErrorJson(
  response: Response,
): Promise<{ error: string }> {
  try {
    const text = await response.text();
    try {
      const data: unknown = JSON.parse(text);
      if (data && typeof data === "object" && "error" in data) {
        return data as { error: string };
      }
    } catch {
      // fall through to raw text
    }
    return { error: text || response.statusText || "Unknown error" };
  } catch {
    return { error: response.statusText || "Unknown error" };
  }
}

/**
 * Layout list item from API
 * The id field is a UUID - stable identity that doesn't change on renames
 */
export interface SavedLayoutItem {
  /** UUID - stable identity across renames/moves */
  id: string;
  name: string;
  version: string;
  updatedAt: string;
  rackCount: number;
  deviceCount: number;
  valid: boolean; // false if YAML is corrupted
}

/**
 * Custom error for API failures
 */
export class PersistenceError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "PersistenceError";
  }
}

/**
 * Check if API is reachable
 * Note: This is called during initialization before API availability is known,
 * so it does not check isApiAvailable() first.
 */
export async function checkApiHealth(): Promise<boolean> {
  // API_BASE_URL is normalized (leading slash or absolute, no trailing
  // slash), so health and CRUD endpoints share identical path rules
  const healthUrl = `${API_BASE_URL}/health`;
  log("checkApiHealth: checking %s", healthUrl);

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });
    if (!response.ok) {
      log(
        "checkApiHealth: response status=%d ok=%s",
        response.status,
        response.ok,
      );
      return false;
    }

    // Guard against frontend SPA fallback responses and other false positives.
    // Only structured JSON health payloads from the persistence API are accepted.
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      log(
        "checkApiHealth: rejecting non-JSON health response content-type=%s",
        contentType || "(missing)",
      );
      return false;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      log("checkApiHealth: failed to parse JSON payload %O", error);
      return false;
    }

    if (!isPersistenceHealthPayload(payload)) {
      log("checkApiHealth: unexpected health payload shape %O", payload);
      return false;
    }

    return true;
  } catch (error) {
    log("checkApiHealth: error %O", error);
    return false;
  }
}

/**
 * List all saved layouts
 */
export async function listSavedLayouts(): Promise<SavedLayoutItem[]> {
  if (!isApiAvailable()) {
    log("listSavedLayouts: API not available");
    return [];
  }

  const url = `${API_BASE_URL}/layouts`;
  log("listSavedLayouts: fetching %s", url);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await safeParseErrorJson(response);
    log(
      "listSavedLayouts: error status=%d message=%s",
      response.status,
      error.error,
    );
    throw new PersistenceError(
      error.error ?? "Failed to list layouts",
      response.status,
    );
  }

  try {
    const rawData: unknown = await response.json();
    const data = LayoutListResponseSchema.parse(rawData);
    log("listSavedLayouts: found %d layouts", data.layouts.length);
    return data.layouts;
  } catch (error) {
    log("listSavedLayouts: validation failed %O", error);
    throw new PersistenceError("Invalid response from API server");
  }
}

/**
 * Load a layout by UUID, decoding any embedded user images (#617).
 * @param uuid - The layout's UUID (stable identity)
 */
export async function loadSavedLayout(uuid: string): Promise<{
  layout: Layout;
  images: ImageStoreMap;
  failedImagesCount: number;
  failedKeys: string[];
  updatedAt: string | null;
}> {
  log("loadSavedLayout: uuid=%s", uuid);

  if (!isApiAvailable()) {
    log("loadSavedLayout: API not available");
    throw new PersistenceError("API not available");
  }

  const url = `${API_BASE_URL}/layouts/${encodeURIComponent(uuid)}`;
  log("loadSavedLayout: fetching %s", url);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 404) {
      log("loadSavedLayout: not found uuid=%s", uuid);
      throw new PersistenceError("Layout not found", 404);
    }
    const error = await safeParseErrorJson(response);
    log(
      "loadSavedLayout: error status=%d message=%s",
      response.status,
      error.error,
    );
    throw new PersistenceError(
      error.error ?? "Failed to load layout",
      response.status,
    );
  }

  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_LAYOUT_RESPONSE_BYTES) {
    throw new PersistenceError("Layout data too large");
  }

  const yamlContent = await response.text();
  if (
    new TextEncoder().encode(yamlContent).length > MAX_LAYOUT_RESPONSE_BYTES
  ) {
    throw new PersistenceError("Layout data too large");
  }

  const updatedAt = response.headers.get("X-Rackula-Updated-At");
  log(
    "loadSavedLayout: loaded uuid=%s size=%d bytes",
    uuid,
    yamlContent.length,
  );
  let parsed: Awaited<ReturnType<typeof parseLayoutYamlWithImages>>;
  try {
    parsed = await parseLayoutYamlWithImages(yamlContent);
  } catch (error) {
    log("loadSavedLayout: failed to parse uuid=%s %O", uuid, error);
    throw new PersistenceError("Layout data is corrupted - could not parse");
  }

  const { layout } = parsed;

  // Server mode only: eager-fetch each placed device's custom faces from disk
  // as blobs, so render and export reuse the existing blob path. A migrated
  // layout carries face references but no embedded images; a not-yet-migrated
  // one keeps its decoded embedded bytes (merged under the same keys), so it
  // displays and then migrates on the next save (#2531). Browser/file/snapshot
  // loads never reach here and stay on the embedded-image decode unchanged.
  if (getStorageMode() === "server") {
    const layoutId = layout.metadata?.id ?? uuid;
    const { images, failedImagesCount, failedKeys } =
      await eagerFetchServerImages(layout, layoutId, parsed.images);
    return {
      layout,
      images,
      failedImagesCount: parsed.failedImagesCount + failedImagesCount,
      failedKeys: [...parsed.failedKeys, ...failedKeys],
      updatedAt,
    };
  }

  return {
    layout,
    images: parsed.images,
    failedImagesCount: parsed.failedImagesCount,
    failedKeys: parsed.failedKeys,
    updatedAt,
  };
}

/** The two physical faces written to disk; "both" is never an on-disk face. */
const DISK_FACES: readonly AssetFace[] = ["front", "rear"];

/** A user image face resolved to verbatim bytes plus its server content type. */
interface DiskFace {
  deviceId: string;
  face: AssetFace;
  blob: Blob;
  contentType: SupportedImageFormat;
}

/**
 * Resolve one user image face to the verbatim bytes that will land on disk.
 *
 * Prefers decoding the verbatim `dataUrl` (fresh uploads and #2531-rehydrated
 * migrate images both carry one) so the body PUT and the bytes sniffed for the
 * content type are the same bytes; falls back to the in-memory `blob` only when
 * no dataUrl is present. The bytes are sniffed by magic byte with the same
 * client detector the YAML path uses: a face whose bytes do not sniff to an
 * allowed raster format is NOT written to disk and is left to the caller to
 * retain in the embedded block, so a malformed migrate payload is never lost.
 * The server (#2528) re-sniffs every write as the authority.
 *
 * Returns null when no usable bytes resolve or the sniff fails; the caller then
 * keeps the face embedded rather than dropping it.
 */
function resolveDiskFace(
  deviceId: string,
  face: AssetFace,
  image: ImageData,
): DiskFace | null {
  // Decode the verbatim data URL when present so the sniffed bytes and the PUT
  // body are identical. The blob is a fallback for a blob-only image.
  const bytes = image.dataUrl ? decodeDataUrl(image.dataUrl) : null;
  if (!bytes && !image.blob) return null;

  // Content type comes from the actual bytes (never a declared MIME). With only
  // a blob and no decodable data URL, trust the blob's type if it is an allowed
  // raster format. A sniff that does not match an allowed format rejects the
  // face so it stays embedded.
  let contentType: SupportedImageFormat;
  let blob: Blob;
  if (bytes) {
    const sniffed = detectImageMime(bytes);
    if (!sniffed) return null;
    contentType = sniffed as SupportedImageFormat;
    blob = new Blob([bytes], { type: contentType });
  } else if (
    image.blob &&
    (image.blob.type === "image/png" ||
      image.blob.type === "image/jpeg" ||
      image.blob.type === "image/webp")
  ) {
    contentType = image.blob.type;
    blob = image.blob;
  } else {
    return null;
  }

  return { deviceId, face, blob, contentType };
}

/**
 * Reconcile a server-mode layout's user images to disk via the asset API.
 *
 * Runs after the YAML PUT (which creates the layout folder the asset writes
 * need). Returns nothing; any failed PUT/DELETE throws so the caller's save
 * never reaches a clean state and the layout stays dirty for the next autosave
 * retry (the originating #1426 bug was flipping to "saved" before images
 * persisted).
 *
 * Set-diff: the desired set is the layout's current user faces; the on-disk set
 * is `GET /assets/:layoutId`. Faces on disk but not desired are deleted (removed
 * faces/devices and crash-leaked orphans). A face that is both replaced and at
 * the quota limit is deleted before its replacement is PUT, because the quota
 * check counts before the write (non-atomic), so a DELETE-then-PUT lets an
 * at-limit layout still replace a face without tripping the 507.
 */
async function reconcileServerAssets(
  layoutId: string,
  diskFaces: DiskFace[],
): Promise<void> {
  // Desired on-disk identity per face: `${deviceId}/${face}`.
  const desired = new Set(diskFaces.map((f) => `${f.deviceId}/${f.face}`));

  // On-disk faces not in the desired set are orphans to delete. A desired face
  // is deleted first too (DELETE-then-PUT) to dodge the non-atomic 507 on an
  // at-limit replace; deleteAsset treats a 404 as a no-op so a first write is
  // unaffected.
  const onDisk = await listAssets(layoutId);
  for (const entry of onDisk) {
    const key = `${entry.deviceSlug}/${entry.face}`;
    if (!desired.has(key)) {
      await deleteAsset(layoutId, entry.deviceSlug, entry.face);
    }
  }
  for (const f of diskFaces) {
    await deleteAsset(layoutId, f.deviceId, f.face);
    await putAsset(layoutId, f.deviceId, f.face, f.blob, f.contentType);
  }
}

/**
 * Save a layout (create or update)
 * Uses the UUID from layout metadata for routing
 * @param layout - The layout to save (must have metadata.id for existing layouts)
 * @returns The saved layout UUID
 */
export async function saveLayoutToServer(
  layout: Layout,
  userImages: ImageStoreMap,
  lastKnownUpdatedAt: string | null = null,
): Promise<SaveLayoutResult> {
  log("saveLayoutToServer: name=%s", layout.name);

  if (!isApiAvailable()) {
    log("saveLayoutToServer: API not available");
    throw new PersistenceError("API not available");
  }

  // Extract UUID from layout metadata if present
  // Type assertion to access metadata.id which may exist on Layout
  const layoutWithMetadata = layout as Layout & {
    metadata?: { id?: string };
  };
  const uuid =
    layoutWithMetadata.metadata &&
    typeof layoutWithMetadata.metadata === "object" &&
    typeof layoutWithMetadata.metadata.id === "string"
      ? layoutWithMetadata.metadata.id
      : undefined;

  if (!uuid) {
    log("saveLayoutToServer: no UUID in layout metadata, cannot save");
    throw new PersistenceError(
      "Layout must have a metadata.id UUID to save to server",
    );
  }

  // Server mode writes user images to disk via the asset API and saves the YAML
  // without the embedded base64 block, so an image-heavy layout stays under the
  // 1MB layout PUT cap (#2530, #2513, #1426). Each user face is resolved to its
  // verbatim bytes; a face whose bytes fail the magic-byte sniff is NOT written
  // to disk and stays embedded so a malformed migrate payload is never lost.
  // Browser-mode callers (none today) keep the full embed.
  const isServerMode = getStorageMode() === "server";
  const diskFaces: DiskFace[] = [];
  const retainedImages: ImageStoreMap = new Map();

  if (isServerMode) {
    for (const [key, deviceImages] of userImages) {
      // Only placement-keyed instance images go to disk. Custom device-type
      // images are keyed by the bare device-type slug (e.g. "server-1u"), which
      // is not a placement key; routing them through deviceKeyForWire would
      // throw and abort the save, so they stay embedded in the YAML.
      if (!isPlacementKey(key)) {
        retainedImages.set(key, deviceImages);
        continue;
      }
      for (const face of DISK_FACES) {
        const image = deviceImages[face];
        if (!image) continue;
        // The wire device id is the bare UUID from the placement key; a
        // malformed key throws here (path-traversal guard) and fails the save.
        const deviceId = deviceKeyForWire(key);
        const resolved = resolveDiskFace(deviceId, face, image);
        if (resolved) {
          diskFaces.push(resolved);
        } else {
          // Sniff failed: retain the embedded payload rather than drop it.
          const existing = retainedImages.get(key) ?? {};
          retainedImages.set(key, { ...existing, [face]: image });
        }
      }
    }
  }

  // Embed user images so server-mode saves do not silently drop them (#617).
  // In server mode only the retained (sniff-failed) faces are embedded; the rest
  // go to disk. In browser mode every user image is embedded.
  const { serialized } = encodeUserImagesToYaml(
    isServerMode ? retainedImages : userImages,
  );
  const yamlContent = await serializeLayoutToYaml(layout, serialized);
  log(
    "saveLayoutToServer: uuid=%s yamlSize=%d bytes diskFaces=%d",
    uuid,
    yamlContent.length,
    diskFaces.length,
  );

  const url = `${API_BASE_URL}/layouts/${encodeURIComponent(uuid)}`;
  log("saveLayoutToServer: PUT %s", url);

  const headers: Record<string, string> = { "Content-Type": "text/yaml" };
  if (lastKnownUpdatedAt) {
    headers["X-Rackula-Updated-At"] = lastKnownUpdatedAt;
  }
  // Signal the one-time carrier-first migration to the server so it durably
  // backs up the prior YAML before this overwrite (#2517). Peek here, but only
  // clear the mark after a successful save: if this request fails, the retry
  // must still carry the header so the server backup is never skipped.
  const needsPreCarrierBackup = hasPreCarrierMigrationPending(uuid);
  if (needsPreCarrierBackup) {
    headers["X-Rackula-Pre-Carrier-Migration"] = "1";
  }

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: yamlContent,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await safeParseErrorJson(response);
    log(
      "saveLayoutToServer: error status=%d message=%s",
      response.status,
      error.error,
    );
    throw new PersistenceError(
      error.error ?? "Failed to save layout",
      response.status,
    );
  }

  // The save landed (2xx), so the server has taken the durable backup; clear
  // the mark so later saves of this layout do not re-send the header.
  if (needsPreCarrierBackup) {
    clearPreCarrierMigrationPending(uuid);
  }

  // Reconcile assets to disk AFTER the YAML PUT (which created the layout
  // folder the asset writes need). This runs before the function returns its
  // success, so any failed PUT/DELETE throws and the caller never reaches a
  // clean save state: the layout stays dirty and the next autosave retries.
  if (isServerMode) {
    await reconcileServerAssets(uuid, diskFaces);
  }

  try {
    const raw: unknown = await response.json();
    const { id, updatedAt } = SaveLayoutResponseSchema.parse(raw);
    log("saveLayoutToServer: saved uuid=%s updatedAt=%s", id, updatedAt);
    return { id, updatedAt };
  } catch (error) {
    log("saveLayoutToServer: invalid save response %O", error);
    throw new PersistenceError("Invalid response from API server");
  }
}

/**
 * Upload a losing local copy to the server snapshot store before discarding it.
 * Returns true only when the snapshot was stored. Any failure (404 unknown
 * layout, network error, non-2xx) returns false so the caller keeps the copy.
 */
export async function uploadSnapshot(
  uuid: string,
  yamlContent: string,
): Promise<boolean> {
  if (!isApiAvailable()) return false;
  const url = `${API_BASE_URL}/layouts/${encodeURIComponent(uuid)}/snapshots`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/yaml" },
      body: yamlContent,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!response.ok) {
      log("uploadSnapshot: failed uuid=%s status=%d", uuid, response.status);
      return false;
    }
    return true;
  } catch (error) {
    log("uploadSnapshot: error uuid=%s %O", uuid, error);
    return false;
  }
}

/**
 * List pre-overwrite snapshots for a layout, newest first.
 * @param uuid - The layout's UUID (stable identity)
 */
export async function listSnapshots(uuid: string): Promise<SnapshotItem[]> {
  if (!isApiAvailable()) {
    log("listSnapshots: API not available");
    return [];
  }

  const url = `${API_BASE_URL}/layouts/${encodeURIComponent(uuid)}/snapshots`;
  log("listSnapshots: fetching %s", url);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new PersistenceError("Layout not found", 404);
    }
    const error = await safeParseErrorJson(response);
    throw new PersistenceError(
      error.error ?? "Failed to list snapshots",
      response.status,
    );
  }

  try {
    const rawData: unknown = await response.json();
    const data = SnapshotListResponseSchema.parse(rawData);
    log("listSnapshots: found %d snapshots", data.snapshots.length);
    return data.snapshots;
  } catch (error) {
    log("listSnapshots: validation failed %O", error);
    throw new PersistenceError("Invalid response from API server");
  }
}

/**
 * Load a snapshot by layout UUID and filename, routing the YAML through the
 * same parse/validate/adapt pipeline as a normal layout load (#2042). A
 * pre-schema-bump snapshot therefore hits the migration or reject path rather
 * than bypassing it.
 * @param uuid - The layout's UUID (stable identity)
 * @param filename - The snapshot filename from {@link listSnapshots}
 */
export async function loadSnapshot(
  uuid: string,
  filename: string,
): Promise<{
  layout: Layout;
  images: ImageStoreMap;
  failedImagesCount: number;
  failedKeys: string[];
}> {
  log("loadSnapshot: uuid=%s filename=%s", uuid, filename);

  if (!isApiAvailable()) {
    throw new PersistenceError("API not available");
  }

  const url = `${API_BASE_URL}/layouts/${encodeURIComponent(
    uuid,
  )}/snapshots/${encodeURIComponent(filename)}`;
  log("loadSnapshot: fetching %s", url);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new PersistenceError("Snapshot not found", 404);
    }
    const error = await safeParseErrorJson(response);
    throw new PersistenceError(
      error.error ?? "Failed to load snapshot",
      response.status,
    );
  }

  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_LAYOUT_RESPONSE_BYTES) {
    throw new PersistenceError("Snapshot data too large");
  }

  const yamlContent = await response.text();
  if (
    new TextEncoder().encode(yamlContent).length > MAX_LAYOUT_RESPONSE_BYTES
  ) {
    throw new PersistenceError("Snapshot data too large");
  }

  try {
    return await parseLayoutYamlWithImages(yamlContent);
  } catch (error) {
    log("loadSnapshot: failed to parse uuid=%s %O", uuid, error);
    throw new PersistenceError("Snapshot data is corrupted - could not parse");
  }
}

/**
 * Delete a saved layout by UUID
 * @param uuid - The layout's UUID (stable identity)
 */
export async function deleteSavedLayout(uuid: string): Promise<void> {
  log("deleteSavedLayout: uuid=%s", uuid);

  if (!isApiAvailable()) {
    log("deleteSavedLayout: API not available");
    throw new PersistenceError("API not available");
  }

  const url = `${API_BASE_URL}/layouts/${encodeURIComponent(uuid)}`;
  log("deleteSavedLayout: DELETE %s", url);

  const response = await fetch(url, {
    method: "DELETE",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 404) {
      log("deleteSavedLayout: not found uuid=%s", uuid);
      throw new PersistenceError("Layout not found", 404);
    }
    const error = await safeParseErrorJson(response);
    log(
      "deleteSavedLayout: error status=%d message=%s",
      response.status,
      error.error,
    );
    throw new PersistenceError(
      error.error ?? "Failed to delete layout",
      response.status,
    );
  }

  log("deleteSavedLayout: deleted uuid=%s", uuid);
}
