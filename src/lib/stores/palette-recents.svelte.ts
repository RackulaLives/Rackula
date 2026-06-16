/**
 * Palette recents store: an MRU of the last few command ids actually executed
 * from the command palette (#2213). Recents are a separate concern from undo
 * history; they record "what command did the user run", not document state.
 *
 * Persisted via the existing safe-storage helpers. On load the stored value is
 * untrusted: it is validated to an array of strings, filtered to ids that exist
 * in the registry, and capped, tolerating malformed/oversized/missing data.
 */
import { getActionById, type ActionId } from "$lib/actions/registry";
import { safeGetItem, safeSetItem } from "$lib/utils/safe-storage";

const RECENTS_KEY = "rackula:palette:recents";
const MAX_RECENTS = 5;

function sanitise(parsed: unknown): ActionId[] {
  if (!Array.isArray(parsed)) return [];
  const result: ActionId[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "string") continue;
    const action = getActionById(entry as ActionId);
    if (!action) continue;
    if (result.includes(action.id)) continue;
    result.push(action.id);
    if (result.length >= MAX_RECENTS) break;
  }
  return result;
}

function loadFromStorage(): ActionId[] {
  const raw = safeGetItem(RECENTS_KEY);
  if (raw === null) return [];
  try {
    return sanitise(JSON.parse(raw));
  } catch {
    return [];
  }
}

let recents = $state<ActionId[]>(loadFromStorage());

function persist(): void {
  safeSetItem(RECENTS_KEY, JSON.stringify(recents));
}

/** Record a command id as just executed: move-to-front, dedupe, cap at 5. */
export function recordCommand(id: ActionId): void {
  recents = [id, ...recents.filter((existing) => existing !== id)].slice(
    0,
    MAX_RECENTS,
  );
  persist();
}

/** Snapshot of current recents (MRU order, newest first). */
export function getRecents(): ActionId[] {
  return recents;
}

/** Reset the store from storage (primarily for testing). */
export function resetPaletteRecents(): void {
  recents = loadFromStorage();
}
