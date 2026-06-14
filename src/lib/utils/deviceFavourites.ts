/**
 * Device Favourites Utilities
 * Handles localStorage persistence for pinned (favourited) device slugs in the
 * device palette. Mirrors the deviceGrouping persistence pattern.
 */

import { safeGetItem, safeSetItem } from "$lib/utils/safe-storage";

export const FAVOURITES_STORAGE_KEY = "Rackula-device-favourites";

/**
 * Load the saved favourite device slugs from localStorage.
 * Insertion order is preserved so the pinned section is stable across sessions.
 * @returns A set of slugs, empty when nothing valid is stored.
 */
export function loadFavouritesFromStorage(): Set<string> {
  const stored = safeGetItem(FAVOURITES_STORAGE_KEY);
  if (!stored) return new Set();

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((s): s is string => typeof s === "string"));
  } catch {
    return new Set();
  }
}

/**
 * Persist the favourite device slugs to localStorage.
 * @param slugs Any iterable of slugs; insertion order is retained.
 */
export function saveFavouritesToStorage(slugs: Iterable<string>): void {
  safeSetItem(FAVOURITES_STORAGE_KEY, JSON.stringify([...slugs]));
}

/**
 * Return a new set with the slug toggled: removed if present, appended if absent.
 * The input set is never mutated.
 */
export function toggleFavourite(
  favourites: Set<string>,
  slug: string,
): Set<string> {
  const next = new Set(favourites);
  if (next.has(slug)) {
    next.delete(slug);
  } else {
    next.add(slug);
  }
  return next;
}
