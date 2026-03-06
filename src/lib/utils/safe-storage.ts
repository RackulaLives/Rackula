type StorageType = "local" | "session";

/**
 * Safely reads a value from Web Storage.
 * Returns `null` when the key is missing or storage access is unavailable.
 */
export function safeGetItem(
  key: string,
  type: StorageType = "local",
): string | null {
  try {
    const storage = type === "local" ? localStorage : sessionStorage;
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Safely writes a value to Web Storage.
 * Returns `false` when storage access is unavailable or the write fails.
 */
export function safeSetItem(
  key: string,
  value: string,
  type: StorageType = "local",
): boolean {
  try {
    const storage = type === "local" ? localStorage : sessionStorage;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely removes a value from Web Storage.
 * Silently ignores storage access failures.
 */
export function safeRemoveItem(key: string, type: StorageType = "local"): void {
  try {
    const storage = type === "local" ? localStorage : sessionStorage;
    storage.removeItem(key);
  } catch {
    // Storage not available
  }
}
