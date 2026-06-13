/**
 * Persistence Store
 * Manages the explicit storage mode and runtime API availability.
 *
 * The storage mode is read from runtime config (window.__RACKULA_CONFIG__),
 * not probed. The app runs in exactly one mode: "browser" (default) or
 * "server". Availability (apiAvailable) only tracks whether the server is
 * currently reachable while in server mode.
 */

import { checkApiHealth } from "./api";
import { persistenceDebug } from "$lib/utils/debug";

const log = persistenceDebug.health;

export type StorageMode = "browser" | "server";

/**
 * The single source of truth for the storage mode. Reads
 * window.__RACKULA_CONFIG__.storage; returns "server" only when the value is
 * exactly "server", otherwise "browser" (including missing or unknown values).
 * No other module re-derives the mode: everything reads this accessor.
 */
export function getStorageMode(): StorageMode {
  if (typeof window === "undefined") return "browser";
  return window.__RACKULA_CONFIG__?.storage === "server" ? "server" : "browser";
}

// Reactive state for API availability
let apiAvailable = $state<boolean | null>(null); // null = not checked yet

// Pending promise to prevent race conditions during initialization
let pendingCheck: Promise<boolean> | null = null;

/**
 * Check if API is available (cached result)
 */
export function isApiAvailable(): boolean {
  return apiAvailable === true;
}

/**
 * Get the raw API availability state (null = not checked, true/false = checked)
 */
export function getApiAvailableState(): boolean | null {
  return apiAvailable;
}

/**
 * Perform initial API health check
 * Call this once on app startup (server mode only)
 *
 * Thread-safe: multiple concurrent calls will share the same pending check
 */
export async function initializePersistence(): Promise<boolean> {
  // Return cached result if already checked
  if (apiAvailable !== null) {
    log("initializePersistence: returning cached result %s", apiAvailable);
    return apiAvailable;
  }

  // Return pending check if one is already in progress
  if (pendingCheck) {
    log("initializePersistence: returning pending check");
    return pendingCheck;
  }

  log("initializePersistence: starting API health check");

  // Create and store the pending promise
  pendingCheck = checkApiHealth()
    .then((result) => {
      apiAvailable = result;
      log("initializePersistence: API availability determined: %s", result);
      return result;
    })
    .finally(() => {
      pendingCheck = null;
    });

  return pendingCheck;
}

/**
 * Set API availability state directly (for error recovery).
 */
export function setApiAvailable(available: boolean): void {
  log("setApiAvailable: setting to %s", available);
  apiAvailable = available;
}
