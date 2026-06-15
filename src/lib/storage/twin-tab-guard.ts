/**
 * Twin-tab guard for the shared browser working copy (#2044).
 *
 * Two same-origin browser tabs editing the same layout both autosave into the
 * one localStorage body key (`Rackula:layout:<id>`), so without a guard their
 * writes silently clobber each other (ping-pong). This module stops that:
 *
 * - Every body write is stamped with a per-tab id (`getTabId`). A tab can tell
 *   its own echoed write from a foreign tab's write.
 * - The `storage` event fires in every OTHER same-origin tab when a layout body
 *   key changes. `detectForeignLayoutWrite` reads the stamp; a write whose id is
 *   not ours pauses THIS tab's autosave for THAT layout id.
 * - Pause is per layout (keyed by `layout.metadata.id`), never per workspace:
 *   M14's tabs let two browser tabs hold disjoint open sets, so editing layout A
 *   in one tab must not pause layout B open elsewhere (spike #2018).
 * - Web Locks (`rackula:layout:<id>`) serialise the read-modify-write WHERE
 *   AVAILABLE. Without Web Locks the tab-id check alone still prevents silent
 *   ping-pong (it is detect-and-pause, not leader election).
 *
 * Recovery is by design manual: a paused layout stays paused until the user
 * Reloads (a spurious foreign-write signal therefore leaves the tab paused, the
 * documented recovery, not an oversight).
 */

import { generateId } from "$lib/utils/device";
import { sessionDebug } from "$lib/utils/debug";

const log = sessionDebug.storage;

const LAYOUT_KEY_PREFIX = "Rackula:layout:";
const LOCK_PREFIX = "rackula:layout:";

/**
 * The single source of truth for the writer-tab-id field name in a serialized
 * body. The write side (saveLayoutBody) and the read side (readWriterTabId) both
 * key off this constant so the stamp shape can never drift between them.
 */
export const WRITER_TAB_ID_FIELD = "writerTabId";

/** The localStorage key holding a layout body. */
export function layoutBodyStorageKey(layoutId: string): string {
  return `${LAYOUT_KEY_PREFIX}${layoutId}`;
}

/** The per-layout Web Lock name. */
export function layoutLockName(layoutId: string): string {
  return `${LOCK_PREFIX}${layoutId}`;
}

/** Extract the layout id from a body key, or null if the key is not a body key. */
function layoutIdFromKey(key: string | null): string | null {
  if (!key || !key.startsWith(LAYOUT_KEY_PREFIX)) return null;
  const id = key.slice(LAYOUT_KEY_PREFIX.length);
  return id.length > 0 ? id : null;
}

/**
 * The stable id for this browser tab, minted once per page. Stamped into every
 * body write so a peer tab can attribute the write and a tab can ignore its own
 * echoed `storage` event.
 */
let tabId: string | null = null;
/** Return this tab's stable id, minting it on first use. */
export function getTabId(): string {
  if (tabId === null) tabId = generateId();
  return tabId;
}

/** Read the writer tab id stamped into a serialized body, or null. */
export function readWriterTabId(serialized: string | null): string | null {
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const writer = (parsed as Record<string, unknown>)[WRITER_TAB_ID_FIELD];
    return typeof writer === "string" ? writer : null;
  } catch {
    return null;
  }
}

/** The relevant fields of a `storage` event for foreign-write detection. */
export interface StorageEventLike {
  key: string | null;
  newValue: string | null;
}

/** Result of inspecting a storage event for a foreign layout-body write. */
export type ForeignWriteResult =
  | { foreign: true; layoutId: string }
  | { foreign: false };

/**
 * Decide whether a `storage` event is a foreign tab writing a layout body.
 *
 * A removal (`newValue === null`) is not a competing write. A write whose stamp
 * matches this tab is our own echo. A write with no parseable stamp cannot be
 * proven ours, so it is treated as foreign (safer than ignoring a real twin).
 */
export function detectForeignLayoutWrite(
  event: StorageEventLike,
  ownTabId: string,
): ForeignWriteResult {
  const layoutId = layoutIdFromKey(event.key);
  if (layoutId === null) return { foreign: false };
  if (event.newValue === null) return { foreign: false };
  const writer = readWriterTabId(event.newValue);
  if (writer === ownTabId) return { foreign: false };
  return { foreign: true, layoutId };
}

/** Construction options for {@link createTwinTabGuard}. */
export interface TwinTabGuardOptions {
  /** This tab's id. Defaults to the module-stable `getTabId()`. */
  tabId?: string;
  /** Called once when a layout is first paused by a foreign write. */
  onForeignWrite?: (layoutId: string) => void;
  /**
   * The Web Locks manager, or undefined where unavailable. Defaults to
   * `navigator.locks` in a browser. Injected for testing.
   */
  locks?: LockManager;
}

/** The twin-tab guard instance: pause tracking plus the Web-Lock wrapper. */
export interface TwinTabGuard {
  /** Whether autosave for this layout is paused by a detected foreign write. */
  isPaused(layoutId: string): boolean;
  /** Feed a `storage` event; pauses the targeted layout if the write is foreign. */
  handleStorageEvent(event: StorageEventLike): void;
  /**
   * Run a body write through the per-layout Web Lock where available. The write
   * runs regardless (the tab-id stamp is the real ping-pong guard); the lock
   * only serialises concurrent writers when it can be acquired.
   */
  withLayoutLock<T>(layoutId: string, write: () => T): Promise<T>;
}

function resolveLocks(explicit: LockManager | undefined): LockManager | undefined {
  if (explicit !== undefined) return explicit;
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    return navigator.locks;
  }
  return undefined;
}

/** Create a twin-tab guard: per-layout pause tracking plus the Web-Lock wrapper. */
export function createTwinTabGuard(
  options: TwinTabGuardOptions = {},
): TwinTabGuard {
  const ownTabId = options.tabId ?? getTabId();
  const locks = resolveLocks(options.locks);
  // Once a layout is paused it stays paused: recovery is a manual Reload.
  const paused = new Set<string>();

  function isPaused(layoutId: string): boolean {
    return paused.has(layoutId);
  }

  function handleStorageEvent(event: StorageEventLike): void {
    const result = detectForeignLayoutWrite(event, ownTabId);
    if (!result.foreign) return;
    if (paused.has(result.layoutId)) return;
    paused.add(result.layoutId);
    log("twin-tab: foreign write detected for layout %s, pausing", result.layoutId);
    options.onForeignWrite?.(result.layoutId);
  }

  async function withLayoutLock<T>(
    layoutId: string,
    write: () => T,
  ): Promise<T> {
    if (!locks) return write();
    let captured: T;
    await locks.request(layoutLockName(layoutId), { ifAvailable: true }, () => {
      captured = write();
    });
    // The callback runs synchronously (own write) whether or not the lock was
    // granted (ifAvailable yields a null lock when held), so captured is set.
    return captured!;
  }

  return { isPaused, handleStorageEvent, withLayoutLock };
}

/**
 * Process-wide guard for the browser workspace. One instance per page so the
 * persist path and the `storage`-event listener share the same pause set. The
 * foreign-write notifier is settable so the UI layer can attach the "Open in
 * another tab" toast without the storage module importing a store.
 */
let singleton: TwinTabGuard | null = null;
let foreignWriteNotifier: ((layoutId: string) => void) | null = null;

/** Return the process-wide twin-tab guard, creating it on first use. */
export function getTwinTabGuard(): TwinTabGuard {
  if (singleton === null) {
    singleton = createTwinTabGuard({
      onForeignWrite: (layoutId) => foreignWriteNotifier?.(layoutId),
    });
  }
  return singleton;
}

/** Attach the UI notifier called once when a layout is first paused. */
export function setForeignWriteNotifier(
  notifier: (layoutId: string) => void,
): void {
  foreignWriteNotifier = notifier;
}

/** Reset the singleton and notifier (tests). */
export function resetTwinTabGuard(): void {
  singleton = null;
  foreignWriteNotifier = null;
}
