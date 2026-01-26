/**
 * Persistence API Client
 * Communicates with the API sidecar for layout CRUD
 * Uses UUID-based routing for stable URLs across renames
 */
import { API_BASE_URL } from "./persistence-config";
import { isApiAvailable } from "$lib/stores/persistence.svelte";
import type { Layout } from "$lib/types";
import { serializeLayoutToYaml, parseLayoutYaml } from "./yaml";
import { persistenceDebug } from "./debug";

const log = persistenceDebug.api;

/** Default timeout for API requests (10 seconds) */
const API_TIMEOUT_MS = 10_000;

/**
 * Safely parse JSON from response, falling back to text or default message
 */
async function safeParseErrorJson(
  response: Response,
): Promise<{ error: string }> {
  try {
    const data = await response.json();
    if (data && typeof data === "object" && "error" in data) {
      return data as { error: string };
    }
    return { error: response.statusText || "Unknown error" };
  } catch {
    try {
      const text = await response.text();
      return { error: text || response.statusText || "Unknown error" };
    } catch {
      return { error: response.statusText || "Unknown error" };
    }
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
 * Save status for UI feedback
 */
export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

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
  // Build health URL from API_BASE_URL
  // Handle both relative (/api) and absolute URLs
  const baseUrl = new URL(API_BASE_URL, window.location.origin);
  const basePath = baseUrl.pathname.replace(/\/$/, "");
  const healthUrl = new URL(`${basePath}/health`, baseUrl.origin).toString();
  log("checkApiHealth: checking %s", healthUrl);

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    log(
      "checkApiHealth: response status=%d ok=%s",
      response.status,
      response.ok,
    );
    return response.ok;
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

  const data = (await response.json()) as { layouts: SavedLayoutItem[] };
  log("listSavedLayouts: found %d layouts", data.layouts.length);
  return data.layouts;
}

/**
 * Load a layout by UUID
 * @param uuid - The layout's UUID (stable identity)
 */
export async function loadSavedLayout(uuid: string): Promise<Layout> {
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

  const yamlContent = await response.text();
  log(
    "loadSavedLayout: loaded uuid=%s size=%d bytes",
    uuid,
    yamlContent.length,
  );
  return parseLayoutYaml(yamlContent);
}

/**
 * Save a layout (create or update)
 * Uses the UUID from layout metadata for routing
 * @param layout - The layout to save (must have metadata.id for existing layouts)
 * @returns The saved layout UUID
 */
export async function saveLayoutToServer(layout: Layout): Promise<string> {
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

  const yamlContent = await serializeLayoutToYaml(layout);
  log(
    "saveLayoutToServer: uuid=%s yamlSize=%d bytes",
    uuid,
    yamlContent.length,
  );

  const url = `${API_BASE_URL}/layouts/${encodeURIComponent(uuid)}`;
  log("saveLayoutToServer: PUT %s", url);

  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "text/yaml" },
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

  const { id } = (await response.json()) as { id: string };
  log("saveLayoutToServer: saved uuid=%s", id);
  return id;
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

/**
 * Upload an asset image
 * @param layoutUuid - The layout's UUID
 */
export async function uploadAsset(
  layoutUuid: string,
  deviceSlug: string,
  face: "front" | "rear",
  blob: Blob,
): Promise<void> {
  log(
    "uploadAsset: layoutUuid=%s deviceSlug=%s face=%s size=%d type=%s",
    layoutUuid,
    deviceSlug,
    face,
    blob.size,
    blob.type,
  );

  if (!isApiAvailable()) {
    log("uploadAsset: API not available");
    throw new PersistenceError("API not available");
  }

  const url = `${API_BASE_URL}/assets/${encodeURIComponent(layoutUuid)}/${encodeURIComponent(deviceSlug)}/${face}`;
  log("uploadAsset: PUT %s", url);

  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": blob.type },
    body: blob,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await safeParseErrorJson(response);
    log(
      "uploadAsset: error status=%d message=%s",
      response.status,
      error.error,
    );
    throw new PersistenceError(
      error.error ?? "Failed to upload asset",
      response.status,
    );
  }

  log(
    "uploadAsset: uploaded layoutUuid=%s deviceSlug=%s face=%s",
    layoutUuid,
    deviceSlug,
    face,
  );
}

/**
 * Get asset URL for display
 * @param layoutUuid - The layout's UUID
 */
export function getAssetUrl(
  layoutUuid: string,
  deviceSlug: string,
  face: "front" | "rear",
): string {
  return `${API_BASE_URL}/assets/${encodeURIComponent(layoutUuid)}/${encodeURIComponent(deviceSlug)}/${face}`;
}
