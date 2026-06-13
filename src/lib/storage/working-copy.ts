import type { Layout } from "$lib/types";
import type { BackupState } from "$lib/stores/layout.svelte";
import { UNITS_PER_U } from "$lib/types/constants";
import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
} from "$lib/utils/safe-storage";
import { sessionDebug } from "$lib/utils/debug";
import { getStorageMode, type StorageMode } from "./availability.svelte";

const log = sessionDebug.storage;
const STORAGE_KEY = "Rackula:autosave";

/**
 * Session data wrapper with timestamp for conflict resolution
 * @since v0.7.8
 */
interface SessionData {
  layout: Layout;
  savedAt: string; // ISO 8601 timestamp
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
  changesSinceExport: number;
  hasEverExported: boolean;
  /** Storage mode the copy was saved under (defaults to "browser" if missing) */
  storageMode: StorageMode;
}

/**
 * Compare semver versions (simplified).
 * Handles pre-release suffixes like -dev, -alpha.1, etc.
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  // Strip pre-release (-dev, -alpha.1, etc.) and build metadata (+build)
  const stripSuffix = (v: string) => v.split(/[-+]/)[0] ?? v;
  const cleanA = stripSuffix(a.trim());
  const cleanB = stripSuffix(b.trim());

  const partsA = cleanA.split(".").map((p) => parseInt(p) || 0);
  const partsB = cleanB.split(".").map((p) => parseInt(p) || 0);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] ?? 0;
    const partB = partsB[i] ?? 0;
    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }
  return 0;
}

/**
 * Migrate legacy layout formats to current schema.
 * Handles:
 * - v0.6.x: rack (single) → racks[] (array)
 * - v0.6.x: position in U-values → internal units (×UNITS_PER_U)
 *
 * @param raw - Raw parsed JSON object from localStorage
 * @returns Migrated Layout object, or null if migration fails
 */
function migrateLayout(raw: Record<string, unknown>): Layout | null {
  try {
    // Migration 1: rack → racks
    if ("rack" in raw && !("racks" in raw)) {
      const rack = raw.rack;
      // Validate rack is a proper object before migrating
      if (rack !== null && typeof rack === "object" && !Array.isArray(rack)) {
        raw.racks = [rack as Record<string, unknown>];
        delete raw.rack;
      }
    }

    // Migration 2: Position units (U-values → internal units)
    // Layouts before 0.7.0 used U-values (1, 2, 3...)
    // New format uses internal units (6, 12, 18...) where 1U = UNITS_PER_U units
    const version = (raw.version as string) || "0.0.0";
    const needsPositionMigration = compareVersions(version, "0.7.0") < 0;

    if (needsPositionMigration && Array.isArray(raw.racks)) {
      for (const rack of raw.racks as Record<string, unknown>[]) {
        if (Array.isArray(rack.devices)) {
          for (const device of rack.devices as Record<string, unknown>[]) {
            // Only migrate rack-level devices (not container children)
            // Container children have container_id set and use 0-indexed positions
            if (
              device.container_id === undefined &&
              typeof device.position === "number"
            ) {
              device.position = Math.round(device.position * UNITS_PER_U);
            }
          }
        }
      }
    }

    return raw as unknown as Layout;
  } catch (error) {
    log("migration failed: %O", error);
    return null;
  }
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
export function saveSession(layout: Layout, backup: BackupState): boolean {
  try {
    const sessionData: SessionData = {
      layout,
      savedAt: new Date().toISOString(),
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
 * Handles migration from:
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
      // New format with timestamp wrapper - validate layoutData before migration
      const layoutData = obj.layout;
      if (
        layoutData === null ||
        typeof layoutData !== "object" ||
        Array.isArray(layoutData)
      ) {
        log("invalid layout data in session wrapper - expected object");
        return null;
      }
      const layout = migrateLayout(layoutData as Record<string, unknown>);
      if (!layout) return null;
      return {
        layout,
        savedAt: obj.savedAt as string,
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
    const layout = migrateLayout(obj);
    if (!layout) return null;
    return {
      layout,
      savedAt: null, // No timestamp for legacy data
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
