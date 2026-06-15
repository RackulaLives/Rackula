import { safeGetItem, safeSetItem } from "$lib/utils/safe-storage";
import { sessionDebug } from "$lib/utils/debug";

const log = sessionDebug.storage;

/** Dedicated key holding the one-time snapshot taken before carrier-first writes. */
export const PRE_CARRIER_BACKUP_KEY = "Rackula:pre-carrier-backup";

/** Prefixes of the layout/workspace keys captured in the backup. */
const BACKED_UP_PREFIXES = ["Rackula:layout:", "Rackula:workspace"] as const;

interface BackupPayload {
  createdAt: string;
  entries: Record<string, string>;
}

function enumerateKeys(): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

function isBackedUpKey(key: string): boolean {
  return BACKED_UP_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Whether the one-time pre-carrier backup has already been written. */
export function hasPreCarrierBackup(): boolean {
  return safeGetItem(PRE_CARRIER_BACKUP_KEY) !== null;
}

/**
 * Snapshot the current layout bodies and workspace index into the dedicated
 * backup key, exactly once. Call this immediately before the first carrier-first
 * write so the original pre-migration data is recoverable. Returns true when a
 * backup was written, false when one already exists or there is nothing to save.
 */
export function writePreCarrierBackupOnce(): boolean {
  if (hasPreCarrierBackup()) return false;

  const entries: Record<string, string> = {};
  for (const key of enumerateKeys()) {
    if (!isBackedUpKey(key)) continue;
    const value = safeGetItem(key);
    if (value !== null) entries[key] = value;
  }

  if (Object.keys(entries).length === 0) return false;

  const payload: BackupPayload = {
    createdAt: new Date().toISOString(),
    entries,
  };
  const wrote = safeSetItem(PRE_CARRIER_BACKUP_KEY, JSON.stringify(payload));
  if (wrote) log("wrote pre-carrier backup (%d keys)", Object.keys(entries).length);
  return wrote;
}

/**
 * Restore the layout bodies and workspace index captured in the backup,
 * overwriting the current carrier-first data. The restore affordance for users
 * who want their pre-migration layouts back. Returns true when a backup was
 * found and applied.
 */
export function restorePreCarrierBackup(): boolean {
  const serialized = safeGetItem(PRE_CARRIER_BACKUP_KEY);
  if (serialized === null) return false;

  let payload: BackupPayload;
  try {
    payload = JSON.parse(serialized) as BackupPayload;
  } catch (error) {
    log("pre-carrier backup is unreadable: %O", error);
    return false;
  }
  if (!payload || typeof payload.entries !== "object") return false;

  for (const [key, value] of Object.entries(payload.entries)) {
    safeSetItem(key, value);
  }
  log("restored pre-carrier backup (%d keys)", Object.keys(payload.entries).length);
  return true;
}
