/**
 * Layout Persistence Helpers
 *
 * Extracted from layout.svelte.ts - backup-state shape and the
 * localStorage-backed "has started" flag used by the welcome flow.
 */

import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
} from "$lib/utils/safe-storage";

/** Backup state tracked alongside the layout for the storage chip. */
export interface BackupState {
  changesSinceExport: number;
  hasEverExported: boolean;
}

/** localStorage key for tracking if user has started (created/loaded a rack) */
export const HAS_STARTED_KEY = "Rackula_has_started";

/** Check if user has previously started (created or loaded a rack) */
export function loadHasStarted(): boolean {
  return safeGetItem(HAS_STARTED_KEY) === "true";
}

/** Persist the hasStarted flag to localStorage */
export function saveHasStarted(value: boolean): void {
  if (value) {
    safeSetItem(HAS_STARTED_KEY, "true");
  } else {
    safeRemoveItem(HAS_STARTED_KEY);
  }
}
