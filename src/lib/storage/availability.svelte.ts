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

// One-way latch: true once the API has answered at least once since load, and
// never reset on a later loss. This is what lets the chip tell a broken
// deployment (server mode, API never reached) apart from a transient outage
// (reached, then lost). See computeLayoutStatus and issue #2063.
let apiEverReached = $state(false);

// Browser-mode-only misconfiguration signal: a server answered /api/health while
// this instance is configured for browser storage. Kept SEPARATE from
// apiAvailable on purpose. apiAvailable is the server-mode autosave/load signal:
// the server-autosave effect (manager Effect 2) keys off isApiAvailable(), so
// writing a reachable result into apiAvailable in browser mode would wrongly wake
// server autosave and push browser-mode layouts to the server. This signal only
// ever feeds the passive chip hint (#2063); it never enables any write path.
let serverReachableInBrowser = $state(false);

// Pending promise to prevent race conditions during initialization
let pendingCheck: Promise<boolean> | null = null;

// Bumped by resetAvailabilityState so an in-flight health check started before a
// reset cannot resolve later and repopulate the freshly-cleared state (test-only
// concern; production never resets). The init promise captures the generation at
// start and discards its result if the generation changed while it was in flight.
let availabilityGeneration = 0;

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
 * Whether the API has answered at least once since this page load. Latches true
 * on the first reach and never falls back, so a reconnect-then-drop reads as an
 * outage rather than a never-reached misconfiguration.
 */
export function getApiEverReached(): boolean {
  return apiEverReached;
}

/**
 * Whether a server is reachable while this instance is in browser mode (#2063).
 * Drives the passive chip hint only; never gates any read/write path.
 */
export function isServerReachableInBrowser(): boolean {
  return serverReachableInBrowser;
}

/**
 * Reset availability state (cached availability, the ever-reached latch, and the
 * browser-mode reachability signal) to its pre-check baseline. Test-only seam:
 * production has a single page lifetime, so this is never reset at runtime.
 */
export function resetAvailabilityState(): void {
  apiAvailable = null;
  apiEverReached = false;
  serverReachableInBrowser = false;
  // Invalidate any in-flight init check and drop the cached pending promise so a
  // stale resolution cannot repopulate the state we just cleared.
  availabilityGeneration++;
  pendingCheck = null;
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

  // Capture the generation so a reset that fires while this check is in flight
  // invalidates the result rather than letting it repopulate cleared state.
  const generation = availabilityGeneration;

  // Create and store the pending promise
  pendingCheck = checkApiHealth()
    .then((result) => {
      if (generation !== availabilityGeneration) {
        log("initializePersistence: stale check ignored (state was reset)");
        return result;
      }
      apiAvailable = result;
      if (result) apiEverReached = true;
      log("initializePersistence: API availability determined: %s", result);
      return result;
    })
    .finally(() => {
      // Only clear the cached promise if it is still ours; a reset may have
      // already replaced it with null and a newer check.
      if (generation === availabilityGeneration) {
        pendingCheck = null;
      }
    });

  return pendingCheck;
}

/**
 * Set API availability state directly (for error recovery).
 */
export function setApiAvailable(available: boolean): void {
  log("setApiAvailable: setting to %s", available);
  apiAvailable = available;
  if (available) apiEverReached = true;
}

/**
 * Browser-mode misconfiguration probe (#2063). Browser mode declares no server,
 * so it never runs the server-mode autosave/health machinery. This one-shot
 * background probe asks the same hardened /api/health endpoint purely so the chip
 * can surface a passive popover hint when a server is in fact reachable (a
 * compose --profile persist install left in browser mode, say).
 *
 * It writes only the browser-only serverReachableInBrowser signal, and only on a
 * positive result, so it never touches apiAvailable (the server-mode write/load
 * gate) and a failure or missing server stays the expected silent case. It shows
 * no toast and is fire-and-forget; the caller never awaits it on the entry path.
 */
export async function probeServerForBrowserHint(): Promise<void> {
  if (getStorageMode() !== "browser") return;
  if (serverReachableInBrowser) return;
  // Same generation guard as initializePersistence: a reset that fires while this
  // probe is in flight must invalidate its result so it cannot set the signal
  // after the pre-check baseline was cleared.
  const generation = availabilityGeneration;
  try {
    const healthy = await checkApiHealth();
    if (generation !== availabilityGeneration) {
      log("probeServerForBrowserHint: stale probe ignored (state was reset)");
      return;
    }
    if (healthy) {
      log("probeServerForBrowserHint: server reachable in browser mode");
      serverReachableInBrowser = true;
    }
  } catch (error) {
    log("probeServerForBrowserHint: probe failed %O", error);
  }
}
