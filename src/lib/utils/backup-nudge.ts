/**
 * Backup nudge: change-based export reminder for browser mode.
 *
 * The storage chip is the always-on honest signal. This nudge is the single
 * escalation on top of it: a non-modal toast that fires when the user has
 * accumulated enough unexported changes to risk losing a meaningful editing
 * session. Tone is factual, not nagging (Excalidraw honest-copy precedent).
 *
 * Cadence:
 * - A never-exported layout fires once on the first edit (cold start). Without
 *   this, a brand-new session that never exports gets no reminder until 30
 *   changes, which is too late for a first-time user.
 * - After that, the nudge re-fires each time changesSinceExport crosses the
 *   next multiple of 30 (30, 60, 90, ...).
 *
 * The last checkpoint the user was nudged at is persisted in localStorage so
 * reloads do not re-nag for changes they already saw a nudge about. The key is
 * per layout: each open tab tracks its own changesSinceExport, so a shared key
 * would let one tab suppress or re-fire another tab's nudge. Exporting resets
 * the counter, which clears the persisted checkpoint so the cadence restarts.
 */

import { safeGetItem, safeSetItem, safeRemoveItem } from "./safe-storage";

const NUDGE_THRESHOLD_KEY_PREFIX = "Rackula:backup-nudge-threshold:";

/** Changes between nudges once the user has exported at least once. */
export const NUDGE_INTERVAL = 30;

/** Factual nudge copy: states the situation and the remedy, no nagging. */
export const NUDGE_MESSAGE =
  "This layout lives only in this browser. Export a file to keep a copy.";

function thresholdKey(layoutId: string): string {
  return NUDGE_THRESHOLD_KEY_PREFIX + layoutId;
}

/**
 * The change checkpoint the user has reached, or 0 when below the first
 * checkpoint. Checkpoints are: 1 (cold start, never exported), then every
 * multiple of NUDGE_INTERVAL (30, 60, ...).
 *
 * Pure: same inputs always yield the same checkpoint.
 */
export function currentNudgeCheckpoint(
  changesSinceExport: number,
  hasEverExported: boolean,
): number {
  if (changesSinceExport <= 0) return 0;

  const intervalCheckpoint =
    Math.floor(changesSinceExport / NUDGE_INTERVAL) * NUDGE_INTERVAL;

  // A never-exported layout gets a one-time cold-start checkpoint at the first
  // edit, before it has reached the first interval.
  if (!hasEverExported && intervalCheckpoint === 0) {
    return 1;
  }

  return intervalCheckpoint;
}

/**
 * Decide whether to fire the nudge and, if so, the checkpoint to record.
 * Returns the checkpoint to persist when the nudge should fire, or null when it
 * should not (below the first checkpoint, or already nudged at this checkpoint).
 *
 * Pure: no storage reads. The caller supplies the last persisted checkpoint.
 */
export function nudgeCheckpointToFire(
  changesSinceExport: number,
  hasEverExported: boolean,
  lastNudgedCheckpoint: number,
): number | null {
  const checkpoint = currentNudgeCheckpoint(
    changesSinceExport,
    hasEverExported,
  );
  if (checkpoint === 0) return null;
  if (checkpoint <= lastNudgedCheckpoint) return null;
  return checkpoint;
}

/** Read the last checkpoint the layout was nudged at (0 when none). */
export function loadLastNudgedCheckpoint(layoutId: string): number {
  const raw = safeGetItem(thresholdKey(layoutId));
  if (raw === null) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Persist the checkpoint the layout was just nudged at. */
export function saveLastNudgedCheckpoint(
  layoutId: string,
  checkpoint: number,
): void {
  safeSetItem(thresholdKey(layoutId), String(checkpoint));
}

/**
 * Clear the layout's persisted checkpoint so its cadence restarts. Called when
 * the changes-since-export counter resets to 0 (an export happened).
 */
export function clearNudgeCheckpoint(layoutId: string): void {
  safeRemoveItem(thresholdKey(layoutId));
}

/**
 * Evaluate the nudge for the current change state and fire it through the
 * provided callback when a new checkpoint is crossed. Reads and updates the
 * layout's persisted checkpoint. When the counter has reset to 0 (an export
 * happened), clears the persisted checkpoint so the cadence restarts.
 *
 * The `fire` callback is injected so this stays free of store/toast imports and
 * is unit-testable: callers pass a function that shows the toast.
 */
export function evaluateBackupNudge(
  layoutId: string,
  changesSinceExport: number,
  hasEverExported: boolean,
  fire: (checkpoint: number) => void,
): void {
  if (changesSinceExport === 0) {
    clearNudgeCheckpoint(layoutId);
    return;
  }

  const checkpoint = nudgeCheckpointToFire(
    changesSinceExport,
    hasEverExported,
    loadLastNudgedCheckpoint(layoutId),
  );
  if (checkpoint === null) return;

  saveLastNudgedCheckpoint(layoutId, checkpoint);
  fire(checkpoint);
}
