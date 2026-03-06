type StorageType = "local" | "session";

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

export function safeRemoveItem(key: string, type: StorageType = "local"): void {
  try {
    const storage = type === "local" ? localStorage : sessionStorage;
    storage.removeItem(key);
  } catch {
    // Storage not available
  }
}
