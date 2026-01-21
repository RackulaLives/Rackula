/**
 * Persistence API Client
 * Communicates with the API sidecar for layout CRUD
 */
import { API_BASE_URL, PERSIST_ENABLED } from "./persistence-config";
import type { Layout } from "$lib/types";
import { serializeLayoutToYaml, parseLayoutYaml } from "./yaml";
import { slugify } from "./slug";
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
 */
export interface SavedLayoutItem {
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
 */
export async function checkApiHealth(): Promise<boolean> {
  if (!PERSIST_ENABLED) {
    log("checkApiHealth: persistence not available");
    return false;
  }

  const baseUrl = new URL(API_BASE_URL);
  const healthUrl = `${baseUrl.origin}/health`;
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
  if (!PERSIST_ENABLED) {
    log("listSavedLayouts: persistence not available");
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
 * Load a layout by ID
 */
export async function loadSavedLayout(id: string): Promise<Layout> {
  log("loadSavedLayout: id=%s", id);

  if (!PERSIST_ENABLED) {
    log("loadSavedLayout: persistence not available");
    throw new PersistenceError("Persistence not available");
  }

  const url = `${API_BASE_URL}/layouts/${encodeURIComponent(id)}`;
  log("loadSavedLayout: fetching %s", url);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 404) {
      log("loadSavedLayout: not found id=%s", id);
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
  log("loadSavedLayout: loaded id=%s size=%d bytes", id, yamlContent.length);
  return parseLayoutYaml(yamlContent);
}

/**
 * Save a layout (create or update)
 * @param layout - The layout to save
 * @param currentId - The current layout ID (for rename detection)
 * @returns The saved layout ID
 */
export async function saveLayoutToServer(
  layout: Layout,
  currentId?: string,
): Promise<string> {
  log("saveLayoutToServer: name=%s currentId=%s", layout.name, currentId);

  if (!PERSIST_ENABLED) {
    log("saveLayoutToServer: persistence not available");
    throw new PersistenceError("Persistence not available");
  }

  const newId = slugify(layout.name) || "untitled";
  const yamlContent = await serializeLayoutToYaml(layout);
  log(
    "saveLayoutToServer: newId=%s yamlSize=%d bytes",
    newId,
    yamlContent.length,
  );

  // Use current ID in path for rename handling (not a query param)
  const url =
    currentId && currentId !== newId
      ? `${API_BASE_URL}/layouts/${encodeURIComponent(currentId)}`
      : `${API_BASE_URL}/layouts/${encodeURIComponent(newId)}`;

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
  log("saveLayoutToServer: saved id=%s", id);
  return id;
}

/**
 * Delete a saved layout
 */
export async function deleteSavedLayout(id: string): Promise<void> {
  log("deleteSavedLayout: id=%s", id);

  if (!PERSIST_ENABLED) {
    log("deleteSavedLayout: persistence not available");
    throw new PersistenceError("Persistence not available");
  }

  const url = `${API_BASE_URL}/layouts/${encodeURIComponent(id)}`;
  log("deleteSavedLayout: DELETE %s", url);

  const response = await fetch(url, {
    method: "DELETE",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 404) {
      log("deleteSavedLayout: not found id=%s", id);
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

  log("deleteSavedLayout: deleted id=%s", id);
}

/**
 * Upload an asset image
 */
export async function uploadAsset(
  layoutId: string,
  deviceSlug: string,
  face: "front" | "rear",
  blob: Blob,
): Promise<void> {
  log(
    "uploadAsset: layoutId=%s deviceSlug=%s face=%s size=%d type=%s",
    layoutId,
    deviceSlug,
    face,
    blob.size,
    blob.type,
  );

  if (!PERSIST_ENABLED) {
    log("uploadAsset: persistence not available");
    throw new PersistenceError("Persistence not available");
  }

  const url = `${API_BASE_URL}/assets/${encodeURIComponent(layoutId)}/${encodeURIComponent(deviceSlug)}/${face}`;
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
    "uploadAsset: uploaded layoutId=%s deviceSlug=%s face=%s",
    layoutId,
    deviceSlug,
    face,
  );
}

/**
 * Get asset URL for display
 */
export function getAssetUrl(
  layoutId: string,
  deviceSlug: string,
  face: "front" | "rear",
): string {
  return `${API_BASE_URL}/assets/${encodeURIComponent(layoutId)}/${encodeURIComponent(deviceSlug)}/${face}`;
}
