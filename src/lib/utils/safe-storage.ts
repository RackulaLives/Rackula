type StorageType = "local" | "session";

/**
 * Why a write failed. "quota" means the origin's storage budget is full, which
 * is recoverable by the user (export, or delete a layout); "unavailable" means
 * storage is blocked outright (private mode, disabled site data), which is not.
 * The two need different copy, so the distinction is carried rather than
 * collapsed into a bare false (#3375).
 */
export type StorageWriteFailure = "quota" | "unavailable";

export interface StorageWriteResult {
  ok: boolean;
  failure: StorageWriteFailure | null;
}

/**
 * Whether a thrown storage error is the origin running out of room. Chrome and
 * Safari throw a DOMException named QuotaExceededError (legacy code 22);
 * Firefox throws NS_ERROR_DOM_QUOTA_REACHED (legacy code 1014). Both names and
 * both codes are checked because the name is absent on some older engines.
 */
function isQuotaFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014
  );
}

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
 * Safely reads a value from Web Storage, reporting whether access failed.
 * Unlike `safeGetItem`, this distinguishes "key missing" from "storage unavailable".
 */
export function safeGetItemWithStatus(
  key: string,
  type: StorageType = "local",
): { value: string | null; failed: boolean } {
  try {
    const storage = type === "local" ? localStorage : sessionStorage;
    return { value: storage.getItem(key), failed: false };
  } catch {
    return { value: null, failed: true };
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
  return safeSetItemWithStatus(key, value, type).ok;
}

/**
 * Safely writes a value to Web Storage, reporting why a write failed.
 * Unlike `safeSetItem`, this distinguishes a full origin ("quota") from storage
 * being blocked ("unavailable"), so the caller can tell the user which it is
 * and what to do about it (#3375).
 */
export function safeSetItemWithStatus(
  key: string,
  value: string,
  type: StorageType = "local",
): StorageWriteResult {
  try {
    const storage = type === "local" ? localStorage : sessionStorage;
    storage.setItem(key, value);
    return { ok: true, failure: null };
  } catch (error) {
    return {
      ok: false,
      failure: isQuotaFailure(error) ? "quota" : "unavailable",
    };
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
