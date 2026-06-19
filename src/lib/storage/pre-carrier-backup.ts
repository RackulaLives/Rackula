/**
 * One-time pre-carrier-first migration backup (#2290, decision D3).
 *
 * The carrier-first read-path adapter (adapt-legacy-layout.ts) rewrites legacy
 * placements on load, and the next autosave overwrites the original body. That
 * is irreversible, so before the FIRST carrier-first adaptation actually
 * changes a layout we snapshot the entire browser-mode persistence state to a
 * dedicated key. A restore affordance writes the snapshot back.
 *
 * The snapshot is taken exactly once (guarded by the snapshot key's presence)
 * and covers the multi-layout workspace index, every layout body, and the
 * legacy single-slot autosave. Everything goes through quota-safe storage
 * helpers that never throw; a failed snapshot leaves the original data intact.
 */

import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
} from "$lib/utils/safe-storage";
import { sessionDebug } from "$lib/utils/debug";

const log = sessionDebug.storage;

const BACKUP_KEY = "Rackula:pre-carrier-backup";
const WORKSPACE_KEY = "Rackula:workspace";
const EVER_KEY = "Rackula:everHadLayouts";
const AUTOSAVE_KEY = "Rackula:autosave";
const LAYOUT_BODY_PREFIX = "Rackula:layout:";

interface PreCarrierBackup {
  version: 1;
  createdAt: string;
  /** Raw serialized values keyed by their original localStorage key. */
  entries: Record<string, string>;
}

/**
 * Reject prototype-polluting keys before using one as an object property, so a
 * hostile stored layout id cannot reach Object.prototype during snapshot.
 */
function isSafeBackupKey(key: string): boolean {
  const suffix = key.slice(LAYOUT_BODY_PREFIX.length);
  return (
    suffix !== "__proto__" && suffix !== "constructor" && suffix !== "prototype"
  );
}

/** Whether the one-time pre-carrier snapshot has already been written. */
export function hasPreCarrierBackup(): boolean {
  return safeGetItem(BACKUP_KEY) !== null;
}

/**
 * Collect every browser-mode persistence key. localStorage is enumerated so
 * per-layout body keys (Rackula:layout:<id>) are captured without needing the
 * workspace index, which may itself be unreadable.
 */
function collectKeys(): string[] {
  const keys = new Set<string>([WORKSPACE_KEY, EVER_KEY, AUTOSAVE_KEY]);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LAYOUT_BODY_PREFIX) && isSafeBackupKey(key)) {
        keys.add(key);
      }
    }
  } catch {
    // localStorage unavailable; fall back to the fixed keys only.
  }
  return [...keys];
}

/**
 * Take the one-time backup if it has not been taken yet. No-op when a backup
 * already exists or there is nothing to back up. Call this just before the
 * first carrier-first adaptation is committed.
 */
export function ensurePreCarrierBackup(): void {
  if (hasPreCarrierBackup()) return;

  const entries: Record<string, string> = Object.create(null);
  let captured = 0;
  for (const key of collectKeys()) {
    const value = safeGetItem(key);
    if (value !== null) {
      entries[key] = value;
      captured++;
    }
  }

  // Nothing persisted yet (fresh install): no legacy data can be lost, so skip
  // the backup. The next launch with real data will take it.
  if (captured === 0) return;

  const backup: PreCarrierBackup = {
    version: 1,
    createdAt: new Date().toISOString(),
    entries,
  };

  let serialized: string;
  try {
    serialized = JSON.stringify(backup);
  } catch (error) {
    log("pre-carrier backup serialize failed: %O", error);
    return;
  }

  if (!safeSetItem(BACKUP_KEY, serialized)) {
    log("pre-carrier backup write failed (quota or storage unavailable)");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Restore the pre-carrier snapshot, overwriting current browser-mode state with
 * the captured legacy values. Returns false when no backup exists or the
 * snapshot is unreadable. The backup key is left in place so a restore can be
 * repeated; the caller decides when to discard it.
 */
export function restorePreCarrierBackup(): boolean {
  const serialized = safeGetItem(BACKUP_KEY);
  if (serialized === null) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    log("pre-carrier backup parse failed: %O", error);
    return false;
  }

  if (!isRecord(parsed) || !isRecord(parsed.entries)) return false;

  // Clear current layout bodies and index so the restore is not a merge: a
  // body present now but absent in the snapshot would otherwise survive.
  for (const key of collectKeys()) {
    safeRemoveItem(key);
  }

  // Track write failures so the caller never reports a successful restore when
  // storage (quota/unavailable) silently dropped every entry.
  let attempted = 0;
  let failed = 0;
  for (const [key, value] of Object.entries(parsed.entries)) {
    if (typeof value !== "string") continue;
    if (key.startsWith(LAYOUT_BODY_PREFIX) && !isSafeBackupKey(key)) continue;
    attempted++;
    if (!safeSetItem(key, value)) failed++;
  }
  // Success means at least one entry was written and none failed; an empty
  // snapshot (nothing to restore) is treated as a no-op success.
  return attempted === 0 || failed === 0;
}

/** Discard the pre-carrier snapshot (after the user accepts the migration). */
export function discardPreCarrierBackup(): void {
  safeRemoveItem(BACKUP_KEY);
}
