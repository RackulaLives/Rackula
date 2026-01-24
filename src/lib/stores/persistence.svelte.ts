/**
 * Persistence Store
 * Manages runtime API availability detection
 *
 * This replaces the build-time VITE_PERSIST_ENABLED flag with runtime detection.
 * The same Docker image can now work with or without the API sidecar by
 * checking /health at startup.
 */

import { checkApiHealth } from "$lib/utils/persistence-api";
import { persistenceDebug } from "$lib/utils/debug";

const log = persistenceDebug.health;

/** localStorage key for tracking if API was ever successfully connected */
const API_CONNECTED_KEY = "rackula.persistence.apiConnected";

/**
 * Check if user has ever successfully connected to persistence API
 */
export function hasEverConnectedToApi(): boolean {
  try {
    return localStorage.getItem(API_CONNECTED_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Mark that user has successfully connected to persistence API
 */
function markApiConnected(): void {
  try {
    localStorage.setItem(API_CONNECTED_KEY, "true");
  } catch {
    // Ignore localStorage errors
  }
}

// Reactive state for API availability
let apiAvailable = $state<boolean | null>(null); // null = not checked yet
let checking = $state(false);

// Pending promise to prevent race conditions during initialization
let pendingCheck: Promise<boolean> | null = null;

/**
 * Check if API is available (cached result)
 */
export function isApiAvailable(): boolean {
  return apiAvailable === true;
}

/**
 * Check if we're still determining API availability
 */
export function isCheckingApi(): boolean {
  return checking || apiAvailable === null;
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
  checking = true;

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
      checking = false;
      pendingCheck = null;
    });

  return pendingCheck;
}

/**
 * Force re-check API availability
 */
export async function recheckApiAvailability(): Promise<boolean> {
  log("recheckApiAvailability: starting recheck");
  checking = true;
  try {
    apiAvailable = await checkApiHealth();
    if (apiAvailable) {
      markApiConnected();
    }
    log("recheckApiAvailability: recheck result: %s", apiAvailable);
    return apiAvailable;
  } finally {
    checking = false;
  }
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

// Export reactive getters
export const persistenceStore = {
  get apiAvailable() {
    return apiAvailable;
  },
  get checking() {
    return checking;
  },
  isApiAvailable,
  isCheckingApi,
  getApiAvailableState,
  hasEverConnectedToApi,
  initializePersistence,
  recheckApiAvailability,
  setApiAvailable,
};
