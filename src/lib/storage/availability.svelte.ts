/**
 * Persistence Store
 * Manages runtime API availability detection
 *
 * This replaces the build-time VITE_PERSIST_ENABLED flag with runtime detection.
 * The same Docker image can now work with or without the API sidecar by
 * checking /health at startup.
 */

import { checkApiHealth } from "./api";
import { persistenceDebug } from "$lib/utils/debug";
import { safeGetItem, safeSetItem } from "$lib/utils/safe-storage";

const log = persistenceDebug.health;

/** localStorage key for tracking if API was ever successfully connected */
const API_CONNECTED_KEY = "rackula.persistence.apiConnected";

/**
 * Check if user has ever successfully connected to persistence API
 */
export function hasEverConnectedToApi(): boolean {
  return safeGetItem(API_CONNECTED_KEY) === "true";
}

/**
 * Mark that user has successfully connected to persistence API
 */
function markApiConnected(): void {
  safeSetItem(API_CONNECTED_KEY, "true");
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
 * Call this once on app startup
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
      if (result) {
        markApiConnected();
      }
      log("initializePersistence: API availability determined: %s", result);
      return result;
    })
    .finally(() => {
      pendingCheck = null;
    });

  return pendingCheck;
}

/**
 * Set API availability state directly (for error recovery)
 * Note: Does NOT call markApiConnected() because this is for temporary
 * overrides, not confirmed API connectivity. Only health checks should
 * mark the API as "ever connected".
 */
export function setApiAvailable(available: boolean): void {
  log("setApiAvailable: setting to %s", available);
  apiAvailable = available;
}
