/**
 * Persistence API Client
 * Communicates with the API sidecar for layout CRUD
 */
import { API_BASE_URL, isPersistenceAvailable } from "./persistence-config";
import type { Layout } from "$lib/types";
import { serializeLayoutToYaml, parseLayoutYaml } from "./yaml";
import { slugify } from "./slug";

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

interface ErrorResponse {
  error: string;
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
 */
export async function checkApiHealth(): Promise<boolean> {
  if (!isPersistenceAvailable()) return false;

  try {
    const response = await fetch(`${API_BASE_URL.replace("/api", "")}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List all saved layouts
 */
export async function listSavedLayouts(): Promise<SavedLayoutItem[]> {
  if (!isPersistenceAvailable()) {
    return [];
  }

  const response = await fetch(`${API_BASE_URL}/layouts`);

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse;
    throw new PersistenceError(
      error.error ?? "Failed to list layouts",
      response.status,
    );
  }

  const data = (await response.json()) as { layouts: SavedLayoutItem[] };
  return data.layouts;
}

/**
 * Load a layout by ID
 */
export async function loadSavedLayout(id: string): Promise<Layout> {
  if (!isPersistenceAvailable()) {
    throw new PersistenceError("Persistence not available");
  }

  const response = await fetch(
    `${API_BASE_URL}/layouts/${encodeURIComponent(id)}`,
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new PersistenceError("Layout not found", 404);
    }
    const error = (await response.json()) as ErrorResponse;
    throw new PersistenceError(
      error.error ?? "Failed to load layout",
      response.status,
    );
  }

  const yamlContent = await response.text();
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
  if (!isPersistenceAvailable()) {
    throw new PersistenceError("Persistence not available");
  }

  const newId = slugify(layout.name) || "untitled";
  const yamlContent = await serializeLayoutToYaml(layout);

  // Pass current ID as query param for rename handling
  const url =
    currentId && currentId !== newId
      ? `${API_BASE_URL}/layouts/${encodeURIComponent(currentId)}`
      : `${API_BASE_URL}/layouts/${encodeURIComponent(newId)}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "text/yaml" },
    body: yamlContent,
  });

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse;
    throw new PersistenceError(
      error.error ?? "Failed to save layout",
      response.status,
    );
  }

  const { id } = (await response.json()) as { id: string };
  return id;
}

/**
 * Delete a saved layout
 */
export async function deleteSavedLayout(id: string): Promise<void> {
  if (!isPersistenceAvailable()) {
    throw new PersistenceError("Persistence not available");
  }

  const response = await fetch(
    `${API_BASE_URL}/layouts/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new PersistenceError("Layout not found", 404);
    }
    const error = (await response.json()) as ErrorResponse;
    throw new PersistenceError(
      error.error ?? "Failed to delete layout",
      response.status,
    );
  }
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
  if (!isPersistenceAvailable()) {
    throw new PersistenceError("Persistence not available");
  }

  const response = await fetch(
    `${API_BASE_URL}/assets/${encodeURIComponent(layoutId)}/${encodeURIComponent(deviceSlug)}/${face}`,
    {
      method: "PUT",
      headers: { "Content-Type": blob.type },
      body: blob,
    },
  );

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse;
    throw new PersistenceError(
      error.error ?? "Failed to upload asset",
      response.status,
    );
  }
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
