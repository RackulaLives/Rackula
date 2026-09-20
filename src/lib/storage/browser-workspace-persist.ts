/**
 * Browser-mode workspace persistence (#2080).
 *
 * Writes the current open tab set and the active tab's body into the
 * multi-layout schema (#2179): the `Rackula:workspace` index records the
 * ordered open set, the active id, and a per-layout library entry; each
 * hydrated tab's body is written to `Rackula:layout:<id>`.
 *
 * Closing a tab is non-destructive: an id that leaves the open set keeps its
 * library entry and body so it can be reopened from the sidebar (spike #2179).
 * The library is the durable list, so entries are retained across persists, not
 * pruned when a tab closes.
 */

import type { Layout } from "$lib/types";
import {
  loadWorkspaceIndex,
  saveWorkspaceIndex,
  saveLayoutBody,
  markEverHadLayouts,
  type LibraryEntry,
} from "./browser-workspace";
import type { StorageWriteFailure } from "$lib/utils/safe-storage";

/**
 * The outcome of a persist. Browser mode has no other failure channel: the
 * caller (PersistenceEffects) turns a non-ok result into the storage-full
 * warning, because nothing below here can reach the UI (#3375).
 */
export interface PersistResult {
  ok: boolean;
  /** Why the failed writes failed; the most severe reason seen this pass. */
  failure: StorageWriteFailure | null;
  /** Layouts whose body could not be written, so are not persisted at all. */
  failedLayoutIds: string[];
  /**
   * Layouts this pass actually tried to write. A layout skipped by the
   * twin-tab guard is absent, so a caller tracking failures can leave its
   * previous state alone instead of declaring it healthy on no evidence.
   */
  attemptedLayoutIds: string[];
}

/** A tab snapshot for persistence. A shell has no layout body to write. */
export type PersistTab =
  | {
      layoutId: string;
      hydrated: true;
      layout: Layout;
      changesSinceExport: number;
      hasEverExported: boolean;
      lastExportedAt: string | null;
    }
  | {
      layoutId: string;
      hydrated: false;
      /** The shell's display name, kept in the library entry. */
      name: string;
    };

export interface PersistWorkspaceArgs {
  tabs: PersistTab[];
  activeLayoutId: string | null;
  /**
   * Twin-tab guard predicate (#2044): returns true when a layout's autosave is
   * paused because a foreign tab wrote its body. A paused layout's body is left
   * untouched so this tab cannot clobber the peer's copy; its index entry is
   * still written so the open set and shell names stay current.
   */
  isPaused?: (layoutId: string) => boolean;
  /**
   * Twin-tab guard lock wrapper (#2044): runs a single layout-body write under
   * that layout's per-layout Web Lock where available. Every hydrated body write
   * (not just the active one) goes through it, so a non-active layout body is
   * still serialised against a peer tab editing that same layout. Omitted on the
   * synchronous pagehide path, where async work cannot be awaited.
   */
  withLayoutLock?: <T>(layoutId: string, write: () => T) => Promise<T>;
  /**
   * Workspace-index lock wrapper (#2930): runs the ENTIRE persist body (every
   * hydrated body write's own index update, plus the final open-set/library
   * merge and write) under the single well-known `rackula:workspace-index`
   * lock where available. `withLayoutLock` alone does not protect the shared
   * `Rackula:workspace` key: two tabs editing different layouts hold different
   * per-layout locks, so without this lock a peer's complete index write
   * landing between this call's read and its overwrite is silently dropped.
   * Omitted on the synchronous pagehide path, where async work cannot be
   * awaited (same trade-off as withLayoutLock).
   */
  withWorkspaceIndexLock?: <T>(write: () => T | Promise<T>) => Promise<T>;
}

/**
 * Persist the current workspace. Idempotent: safe to call on every change.
 *
 * Returns a promise that resolves once every body write has run. When
 * `withLayoutLock` is supplied, each hydrated body write is taken under its own
 * per-layout lock; the index write that follows reflects the completed bodies.
 * When `withWorkspaceIndexLock` is supplied, the WHOLE operation (every body's
 * own index update, plus the final merge+write) runs under the single
 * well-known workspace-index lock (#2930), so a peer tab persisting a
 * different layout under the same lock can never interleave its own
 * read-modify-write of the shared `Rackula:workspace` key with this one.
 */
export async function persistBrowserWorkspace(
  args: PersistWorkspaceArgs,
): Promise<PersistResult> {
  const {
    tabs,
    activeLayoutId,
    isPaused,
    withLayoutLock,
    withWorkspaceIndexLock,
  } = args;

  const failedLayoutIds: string[] = [];
  const attemptedLayoutIds: string[] = [];
  let failure: StorageWriteFailure | null = null;

  const run = async (): Promise<PersistResult> => {
    // Write each hydrated body first. saveLayoutBody also refreshes that layout's
    // library entry in the index (updatedAt, durability); on a refused write it
    // reports the reason and leaves the in-memory copy intact, and it creates no
    // entry at all when the layout has never been written, so the failures
    // collected here are the only record that the layout did not persist.
    // Shells have no body to write. A paused layout (twin-tab guard) is
    // skipped so a foreign peer's copy is never clobbered. Each write runs under
    // its own per-layout lock when one is supplied; the locks are distinct per
    // layout id so writing many bodies in this loop cannot nest the same lock.
    // saveLayoutBody's own index read-modify-write is not itself lock-aware, so
    // when withWorkspaceIndexLock is supplied it relies on this whole `run`
    // already executing under that lock (see below) for its index write to be
    // safe against a peer tab persisting a different layout.
    for (const tab of tabs) {
      if (tab.hydrated && !isPaused?.(tab.layoutId)) {
        attemptedLayoutIds.push(tab.layoutId);
        const write = () =>
          saveLayoutBody(tab.layoutId, tab.layout, {
            changesSinceExport: tab.changesSinceExport,
            hasEverExported: tab.hasEverExported,
            lastExportedAt: tab.lastExportedAt,
          });
        const result = withLayoutLock
          ? await withLayoutLock(tab.layoutId, write)
          : write();
        if (!result.ok) {
          failedLayoutIds.push(tab.layoutId);
          // Quota outranks "unavailable": if any write was refused for space,
          // that is the actionable thing to tell the user about. Only ever
          // upgrade the reason, so a later result cannot blank out a known one.
          if (result.failure !== null && failure !== "quota") {
            failure = result.failure;
          }
        }
      }
    }

    // Re-read the index after the body writes so hydrated entries are current,
    // then layer in shell entries (carrying the shell name so the tab still
    // renders next launch) and the final open set.
    const current = loadWorkspaceIndex();
    const library: Record<string, LibraryEntry> = current
      ? { ...current.library }
      : {};

    for (const tab of tabs) {
      const previous = library[tab.layoutId];
      if (tab.hydrated) {
        // A non-paused hydrated tab already wrote its library entry via
        // saveLayoutBody above, so it is current and left alone. A paused tab
        // (twin-tab guard) skipped its body write, so it has no fresh entry. Its
        // id is still in openTabs below; without a library entry loadWorkspaceIndex
        // would filter it out as dangling and drop the layout even though its body
        // survives. Carry forward the existing entry (or a default named from the
        // in-memory layout) so the paused tab survives a persist+reload round-trip.
        if (!isPaused?.(tab.layoutId) || previous) continue;
        library[tab.layoutId] = {
          name: tab.layout.name,
          updatedAt: "",
          changesSinceExport: tab.changesSinceExport,
          hasEverExported: tab.hasEverExported,
          lastExportedAt: tab.lastExportedAt,
          writeFailed: false,
          storageMode: "browser",
        };
        continue;
      }
      library[tab.layoutId] = {
        name: tab.name,
        updatedAt: previous?.updatedAt ?? "",
        changesSinceExport: previous?.changesSinceExport ?? 0,
        hasEverExported: previous?.hasEverExported ?? false,
        lastExportedAt: previous?.lastExportedAt ?? null,
        writeFailed: previous?.writeFailed ?? false,
        storageMode: previous?.storageMode ?? "browser",
      };
    }

    // Only advertise tabs that resolve to a library entry. A layout whose first
    // body write failed has none (saveLayoutBody refuses to create one), so it
    // is dropped from the open set and can never be restored as an empty tab
    // wearing its name (#3375). Everything else, including shells and paused
    // tabs, has an entry by now and is unaffected.
    //
    // hasOwnProperty, not `in`: this library is a spread (so it inherits
    // Object.prototype) and isSafeLayoutId only rejects __proto__/constructor/
    // prototype, so `in` would keep an id like "toString" that has no entry --
    // reinstating the phantom tab this filter exists to prevent. Same test
    // loadWorkspaceIndex uses on the read side.
    const openTabs = tabs
      .map((tab) => tab.layoutId)
      .filter((layoutId) =>
        Object.prototype.hasOwnProperty.call(library, layoutId),
      );
    const activeId =
      activeLayoutId !== null && openTabs.includes(activeLayoutId)
        ? activeLayoutId
        : null;

    // The index is the only thing that makes a written body findable, so a
    // refused index write is a failed persist even when every body fit.
    const indexWrite = saveWorkspaceIndex({
      schemaVersion: 2,
      activeId,
      openTabs,
      library,
    });
    if (!indexWrite.ok && indexWrite.failure !== null && failure !== "quota") {
      failure = indexWrite.failure;
    }

    if (openTabs.length > 0) markEverHadLayouts();

    return {
      ok: failedLayoutIds.length === 0 && indexWrite.ok,
      failure,
      failedLayoutIds,
      attemptedLayoutIds,
    };
  };

  return withWorkspaceIndexLock
    ? await withWorkspaceIndexLock(run)
    : await run();
}
