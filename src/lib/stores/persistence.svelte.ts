/**
 * Persistence Store
 * Manages runtime API availability detection
 *
 * This replaces the build-time VITE_PERSIST_ENABLED flag with runtime detection.
 * The same Docker image can now work with or without the API sidecar by
 * checking /health at startup.
 */

import { checkApiHealth } from "$lib/utils/persistence-api";

// Reactive state for API availability
let apiAvailable = $state<boolean | null>(null); // null = not checked yet
let checking = $state(false);

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
 */
export async function initializePersistence(): Promise<boolean> {
  if (apiAvailable !== null) {
    return apiAvailable;
  }

  checking = true;
  try {
    apiAvailable = await checkApiHealth();
    return apiAvailable;
  } finally {
    checking = false;
  }
}

/**
 * Force re-check API availability
 */
export async function recheckApiAvailability(): Promise<boolean> {
  checking = true;
  try {
    apiAvailable = await checkApiHealth();
    return apiAvailable;
  } finally {
    checking = false;
  }
}

/**
 * Set API availability state directly (for error recovery)
 */
export function setApiAvailable(available: boolean): void {
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
  initializePersistence,
  recheckApiAvailability,
  setApiAvailable,
};
