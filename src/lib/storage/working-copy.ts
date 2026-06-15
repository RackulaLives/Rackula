import type { Layout } from "$lib/types";
import type { BackupState } from "$lib/stores/layout.svelte";
import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
} from "$lib/utils/safe-storage";
import { sessionDebug } from "$lib/utils/debug";
import { getStorageMode, type StorageMode } from "./availability.svelte";
import { parseLayoutObject } from "$lib/utils/yaml";

const log = sessionDebug.storage;
const STORAGE_KEY = "Rackula:autosave";

/**
 * Session data wrapper with timestamp for conflict resolution
 * @since v0.7.8
 */
interface SessionData {
  layout: Layout;
  savedAt: string; // ISO 8601 timestamp
  serverUpdatedAt: string | null; // server updatedAt this copy was reconciled against
  changesSinceExport: number;
  hasEverExported: boolean;
  storageMode: StorageMode; // mode this copy was saved under
}

/**
 * Result of loading a session with timestamp information
 */
export interface SessionLoadResult {
  layout: Layout;
  savedAt: string | null; // null for legacy data without timestamp
  serverUpdatedAt: string | null; // server updatedAt this copy was reconciled against
  changesSinceExport: number;
  hasEverExported: boolean;
  /** Storage mode the copy was saved under (defaults to "browser" if missing) */
  storageMode: StorageMode;
}

/**
 * Coerce a stored storageMode value to a valid StorageMode.
 * Missing or unknown values default to "browser" (legacy sessions predate the
 * field and were always browser-stored).
 */
function parseStorageMode(value: unknown): StorageMode {
  return value === "server" ? "server" : "browser";
}

/**
 * Save the current layout to localStorage with timestamp.
 * @param layout - The layout to save
 * @param backup - Backup state persisted alongside the layout
 * @returns true if successful, false if failed (e.g., quota exceeded)
 */
export function saveSession(
  layout: Layout,
  backup: BackupState,
  serverUpdatedAt: string | null = null,
): boolean {
  try {
    const sessionData: SessionData = {
      layout,
      savedAt: new Date().toISOString(),
      serverUpdatedAt,
      changesSinceExport: backup.changesSinceExport,
      hasEverExported: backup.hasEverExported,
      storageMode: getStorageMode(),
    };
    const serialized = JSON.stringify(sessionData);
    if (!safeSetItem(STORAGE_KEY, serialized)) {
      log("failed to save session: storage unavailable or quota exceeded");
      return false;
    }
    return true;
  } catch (error) {
    // Handle QuotaExceededError or other storage errors
    log("failed to save session: %O", error);
    return false;
  }
}

/**
 * Load the autosaved layout from localStorage with timestamp information.
 * The body is validated through `LayoutSchema` (the same ingress as file/server
 * load) so the forward-compat gate and schema invariants apply uniformly and no
 * read door bypasses the schema. Handles migration from:
 * - Legacy formats (v0.6.x → v0.7.0+)
 * - Old format without timestamp wrapper (pre-v0.7.8)
 * @returns SessionLoadResult with layout and savedAt, or null if none exists
 */
export function loadSessionWithTimestamp(): SessionLoadResult | null {
  try {
    const serialized = safeGetItem(STORAGE_KEY);
    if (!serialized) {
      return null;
    }
    const parsed = JSON.parse(serialized) as unknown;
    // Validate parsed value is a proper object before migrating
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      log("invalid session data format - expected object");
      return null;
    }

    const obj = parsed as Record<string, unknown>;

    // Check if this is the new SessionData format (has layout and savedAt)
    if (
      "layout" in obj &&
      "savedAt" in obj &&
      typeof obj.savedAt === "string"
    ) {
      // New format with timestamp wrapper - validate the body through the schema
      const layout = parseLayoutObject(obj.layout);
      if (!layout) {
        log("invalid layout data in session wrapper - schema validation failed");
        return null;
      }
      return {
        layout,
        savedAt: obj.savedAt as string,
        serverUpdatedAt:
          typeof obj.serverUpdatedAt === "string" ? obj.serverUpdatedAt : null,
        changesSinceExport:
          typeof obj.changesSinceExport === "number" &&
          obj.changesSinceExport >= 0
            ? obj.changesSinceExport
            : 0,
        hasEverExported: obj.hasEverExported === true,
        storageMode: parseStorageMode(obj.storageMode),
      };
    }

    // Legacy format: direct layout object without timestamp
    const layout = parseLayoutObject(obj);
    if (!layout) return null;
    return {
      layout,
      savedAt: null, // No timestamp for legacy data
      serverUpdatedAt: null,
      changesSinceExport: 0,
      hasEverExported: false,
      storageMode: "browser",
    };
  } catch (error) {
    log("failed to load session: %O", error);
    return null;
  }
}

/**
 * Clear the autosaved session from localStorage.
 */
export function clearSession(): void {
  safeRemoveItem(STORAGE_KEY);
}

/** Result of comparing the session's saved mode to the configured mode. */
export type ModeFlip = "none" | "server-to-browser" | "browser-to-server";

/**
 * Compare the mode a session was saved under to the currently configured mode.
 * A flip means the deployment changed storage backend between visits, which must
 * be surfaced rather than silently degrading data.
 * @param sessionMode - The mode the loaded session was saved under
 * @returns "server-to-browser", "browser-to-server", or "none"
 */
export function detectModeFlip(sessionMode: StorageMode): ModeFlip {
  const current = getStorageMode();
  if (sessionMode === current) return "none";
  return sessionMode === "server" ? "server-to-browser" : "browser-to-server";
}

/**
 * Compare two ISO 8601 timestamps.
 * @param localTimestamp - Local session timestamp (may be null for legacy data)
 * @param serverTimestamp - Server layout updatedAt timestamp
 * @returns true if server data is newer than local data
 */
export function isServerNewer(
  localTimestamp: string | null,
  serverTimestamp: string,
): boolean {
  // If local has no timestamp (legacy data), server is considered newer
  if (!localTimestamp) {
    return true;
  }

  try {
    const localDate = new Date(localTimestamp);
    const serverDate = new Date(serverTimestamp);

    // Handle invalid dates - if either is invalid, prefer server
    if (isNaN(localDate.getTime()) || isNaN(serverDate.getTime())) {
      log(
        "invalid timestamp comparison: local=%s server=%s",
        localTimestamp,
        serverTimestamp,
      );
      return true;
    }

    return serverDate.getTime() > localDate.getTime();
  } catch {
    // On any error, prefer server data as authoritative
    return true;
  }
}
