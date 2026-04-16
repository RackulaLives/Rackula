/**
 * Session persistence utilities
 * Manages auto-save to sessionStorage for work-in-progress protection
 */

import type { Layout } from "$lib/types";
import { LayoutSchema } from "$lib/schemas";
import {
  safeGetItemWithStatus,
  safeSetItem,
  safeRemoveItem,
} from "$lib/utils/safe-storage";
import { sessionDebug } from "$lib/utils/debug";

export const STORAGE_KEY = "Rackula_session";

/**
 * Save layout to sessionStorage
 * @param layout - Layout to save
 */
export function saveToSession(layout: Layout): void {
  try {
    const json = JSON.stringify(layout);
    const success = safeSetItem(STORAGE_KEY, json, "session");
    if (!success) {
      sessionDebug.storage("failed to save session to storage");
    }
  } catch (err) {
    sessionDebug.storage("failed to serialize layout: %O", err);
  }
}

/**
 * Load layout from sessionStorage
 * @returns Layout if valid session exists, null otherwise
 */
export function loadFromSession(): Layout | null {
  try {
    const { value: json, failed } = safeGetItemWithStatus(
      STORAGE_KEY,
      "session",
    );
    if (failed) {
      sessionDebug.storage("failed to read session from storage");
      return null;
    }
    if (json === null) return null;

    const parsed: unknown = JSON.parse(json);

    // Validate against current schema
    const result = LayoutSchema.safeParse(parsed);
    if (!result.success) {
      sessionDebug.storage("session schema validation failed, clearing");
      clearSession();
      return null;
    }

    return result.data as Layout;
  } catch (err) {
    sessionDebug.storage("failed to parse session JSON: %O", err);
    clearSession();
    return null;
  }
}

/**
 * Clear session from sessionStorage
 */
export function clearSession(): void {
  safeRemoveItem(STORAGE_KEY, "session");
}

/**
 * Check if a valid session exists
 * @returns true if valid session exists
 */
export function hasSession(): boolean {
  return loadFromSession() !== null;
}
