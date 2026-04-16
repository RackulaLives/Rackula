/**
 * Theme utilities for persistence and document updates
 */

import { safeGetItem, safeSetItem } from "$lib/utils/safe-storage";

const THEME_STORAGE_KEY = "Rackula_theme";

export type Theme = "dark" | "light";

/**
 * Load theme preference from localStorage
 * @returns The stored theme, or 'dark' as default
 */
export function loadThemeFromStorage(): Theme {
  const stored = safeGetItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return "dark";
}

/**
 * Save theme preference to localStorage
 * @param theme - Theme to save
 */
export function saveThemeToStorage(theme: Theme): void {
  safeSetItem(THEME_STORAGE_KEY, theme);
}

/**
 * Apply theme to document element
 * @param theme - Theme to apply
 */
export function applyThemeToDocument(theme: Theme): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset["theme"] = theme;
  }
}
