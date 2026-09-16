/**
 * Browser multi-layout storage (spike #2179).
 *
 * The browser-mode persistence schema for the workspace of open layout tabs:
 *
 * - `Rackula:workspace` - a small index read synchronously at launch to paint
 *   tab shells before any body is parsed. Holds the ordered open set, the active
 *   id, and a per-layout library map (name, durability) for the whole library.
 * - `Rackula:layout:<id>` - one key per layout, holding the full Layout body
 *   (the large part: base64 device images). Read lazily on tab focus.
 * - `Rackula:everHadLayouts` - a standalone returning-user marker kept separate
 *   so it survives a wipe of the index and can distinguish lost-data-empty from
 *   fresh-install-empty.
 *
 * Everything read out of localStorage here is untrusted: the index and bodies
 * are parsed defensively (malformed JSON, wrong shapes, and out-of-range values
 * resolve to safe defaults or an unreadable marker rather than throwing). A bad
 * body can never block startup; it surfaces on focus as the orphan/error state
 * (#2018).
 */

import type { Layout } from "$lib/types";
import {
  safeGetItem,
  safeSetItem,
  safeSetItemWithStatus,
  safeRemoveItem,
  type StorageWriteResult,
} from "$lib/utils/safe-storage";
import { generateId } from "$lib/utils/device";
import { sessionDebug } from "$lib/utils/debug";
import { migrateLayout } from "./migrate-layout";
import { parseLayoutObject } from "$lib/utils/yaml";
import { assertSchemaVersionSupported } from "$lib/schemas";
import { stampLayoutForWrite } from "$lib/schemas/migrations";
import { loadSessionWithTimestamp } from "./working-copy";
import { type StorageMode } from "./availability.svelte";
import { getTabId, WRITER_TAB_ID_FIELD } from "./twin-tab-guard";

const log = sessionDebug.storage;

const WORKSPACE_KEY = "Rackula:workspace";
const EVER_KEY = "Rackula:everHadLayouts";
const AUTOSAVE_KEY = "Rackula:autosave";
const SCHEMA_VERSION = 2;

const layoutBodyKey = (id: string) => `Rackula:layout:${id}`;

/** Per-layout durability and naming, stored in the index (no body). */
export interface LibraryEntry {
  name: string;
  updatedAt: string;
  changesSinceExport: number;
  hasEverExported: boolean;
  /** ISO timestamp of the last export to a file; null if never exported. */
  lastExportedAt: string | null;
  writeFailed: boolean;
  storageMode: StorageMode;
}

/** The workspace index: open set plus the durable library map. */
export interface WorkspaceIndex {
  schemaVersion: number;
  /** Active tab's layout id, or null for an empty workspace. */
  activeId: string | null;
  /** Ordered open set (the session working set); a subset of library. */
  openTabs: string[];
  /** Every layout that exists, keyed by id. */
  library: Record<string, LibraryEntry>;
}

/** Result of reading a layout body: the migrated layout, or unreadable. */
export type LayoutBodyResult = { ok: true; layout: Layout } | { ok: false };

/** Durability fields a caller can update without rewriting the body. */
export interface DurabilityInput {
  changesSinceExport: number;
  hasEverExported?: boolean;
  lastExportedAt?: string | null;
  writeFailed?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Reject prototype-polluting layout ids. Stored ids are untrusted; using
 * `__proto__`/`constructor`/`prototype` as an object key would corrupt
 * Object.prototype, so they are never accepted as a layout id.
 */
function isSafeLayoutId(id: string): boolean {
  return id !== "__proto__" && id !== "constructor" && id !== "prototype";
}

function coerceStorageMode(value: unknown): StorageMode {
  return value === "server" ? "server" : "browser";
}

/** Coerce an untrusted library entry into a complete, safe LibraryEntry. */
function coerceLibraryEntry(
  value: unknown,
  fallbackName: string,
): LibraryEntry {
  const obj = isRecord(value) ? value : {};
  const changes = obj.changesSinceExport;
  return {
    name: typeof obj.name === "string" ? obj.name : fallbackName,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : "",
    changesSinceExport:
      typeof changes === "number" && Number.isFinite(changes) && changes >= 0
        ? changes
        : 0,
    hasEverExported: obj.hasEverExported === true,
    lastExportedAt:
      typeof obj.lastExportedAt === "string" ? obj.lastExportedAt : null,
    writeFailed: obj.writeFailed === true,
    storageMode: coerceStorageMode(obj.storageMode),
  };
}

/**
 * Read and validate the workspace index. Returns null when absent, unparseable,
 * or structurally invalid (a wrong shape is treated as no workspace rather than
 * crashing launch). openTabs is filtered to ids that have a library entry, and
 * activeId is repaired to an open tab so a stale pointer cannot dangle.
 */
export function loadWorkspaceIndex(): WorkspaceIndex | null {
  const serialized = safeGetItem(WORKSPACE_KEY);
  if (!serialized) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    log("invalid workspace index JSON: %O", error);
    return null;
  }

  if (!isRecord(parsed)) {
    log("workspace index is not an object");
    return null;
  }
  if (!Array.isArray(parsed.openTabs)) {
    log("workspace index openTabs is not an array");
    return null;
  }

  // Null-prototype map so a hostile stored key cannot reach Object.prototype.
  const rawLibrary = isRecord(parsed.library) ? parsed.library : {};
  const library: Record<string, LibraryEntry> = Object.create(null);
  for (const [id, entry] of Object.entries(rawLibrary)) {
    if (!isSafeLayoutId(id)) continue;
    library[id] = coerceLibraryEntry(entry, id);
  }

  // Only open ids that resolve to a library entry; drop dangling/unsafe refs.
  const openTabs = parsed.openTabs.filter(
    (id): id is string =>
      typeof id === "string" &&
      isSafeLayoutId(id) &&
      Object.prototype.hasOwnProperty.call(library, id),
  );

  let activeId = typeof parsed.activeId === "string" ? parsed.activeId : null;
  if (activeId === null || !openTabs.includes(activeId)) {
    activeId = openTabs[0] ?? null;
  }

  return {
    schemaVersion:
      typeof parsed.schemaVersion === "number"
        ? parsed.schemaVersion
        : SCHEMA_VERSION,
    activeId,
    openTabs,
    library,
  };
}

/**
 * Persist the workspace index. Reports why the write failed, because a refused
 * index write loses data exactly like a refused body write does: the body may
 * be on disk, but nothing points at it, so it is gone on the next launch
 * (#3375).
 */
export function saveWorkspaceIndex(index: WorkspaceIndex): StorageWriteResult {
  try {
    return safeSetItemWithStatus(WORKSPACE_KEY, JSON.stringify(index));
  } catch (error) {
    log("failed to serialize workspace index: %O", error);
    return { ok: false, failure: "unavailable" };
  }
}

/**
 * Read a layout body lazily by id and validate it through the shared schema
 * chokepoint (#2657). The body is untrusted localStorage: after JSON.parse the
 * forward-compat gate (assertSchemaVersionSupported) refuses a future-major
 * document, then parseLayoutObject runs the same LayoutSchema validation the
 * legacy autosave path uses, so a malformed body (for example a null device) is
 * rejected here rather than crashing startup. migrateLayout still runs first to
 * apply the legacy v0.6 structural conversion (single `rack` -> `racks[]`,
 * U-value positions -> internal units) before validation. A missing, unreadable,
 * or schema-invalid body returns { ok: false } (the #2018 on-focus orphan state)
 * rather than throwing, so one bad layout cannot take down the workspace.
 */
export function loadLayoutBody(id: string): LayoutBodyResult {
  const serialized = safeGetItem(layoutBodyKey(id));
  if (!serialized) return { ok: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    log("invalid layout body JSON for %s: %O", id, error);
    return { ok: false };
  }

  if (!isRecord(parsed) || !isRecord(parsed.layout)) {
    log("layout body for %s has no layout object", id);
    return { ok: false };
  }

  // Legacy structural conversion first (v0.6 single `rack`, pre-0.7.0 positions),
  // then the read-door validation. migrateLayout is idempotent so re-reading a
  // body it has already converted is a no-op.
  const migrated = migrateLayout(parsed.layout as Record<string, unknown>);
  if (!migrated) return { ok: false };

  // Forward-compat gate (#2205): refuse a body whose data-format MAJOR is newer
  // than this app. assertSchemaVersionSupported throws on a future major; treat
  // that as unreadable so the orphan/error state surfaces instead of an
  // uncaught throw at startup.
  try {
    assertSchemaVersionSupported(
      typeof migrated.metadata?.schema_version === "string"
        ? migrated.metadata.schema_version
        : undefined,
    );
  } catch (error) {
    log("layout body for %s refused by version gate: %O", id, error);
    return { ok: false };
  }

  // Schema validation (#2657): the same LayoutSchema chokepoint the legacy
  // autosave path uses, so no read door bypasses the schema. A malformed shape
  // (e.g. a null device) is rejected here as { ok: false } rather than reaching
  // the store and crashing startup.
  const layout = parseLayoutObject(migrated);
  if (!layout) {
    log("layout body for %s failed schema validation", id);
    return { ok: false };
  }
  return { ok: true, layout };
}

/**
 * Write a layout body and update its index entry (updatedAt, durability).
 * Returns `ok: false` with the reason when the body write fails (quota or
 * storage unavailable); the caller keeps the in-memory copy and surfaces the
 * failure (quota strategy).
 *
 * On a failed write the index is only touched when this layout already has a
 * body on disk from an earlier successful write: that entry is a pointer to
 * real, still-loadable data, so it is kept (flagged `writeFailed`, with its
 * previous `updatedAt`). A layout whose FIRST write fails has nothing to point
 * at, so no entry is created and the id is not added to the open set (#3375).
 * Writing one anyway is what made a full localStorage restore a named tab over
 * an empty canvas.
 */
export function saveLayoutBody(
  id: string,
  layout: Layout,
  durability: DurabilityInput,
): StorageWriteResult {
  // Reject a prototype-polluting id before it is used as an index key.
  if (!isSafeLayoutId(id)) {
    log("refusing to save layout body for unsafe id %s", id);
    return { ok: false, failure: "unavailable" };
  }
  const savedAt = new Date().toISOString();
  let serialized: string;
  try {
    // Serialize the body once, stamping the writing tab's id inline so a peer
    // tab can tell this write apart from its own and pause its autosave on a
    // foreign write (twin-tab guard #2044). The field name is single-sourced via
    // WRITER_TAB_ID_FIELD so the write side cannot drift from the read side
    // (readWriterTabId), and a large body is not re-serialized to add the stamp.
    serialized = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      // Stamp the layout's own data-format version, which is separate from the
      // envelope schemaVersion above. Without it a measured layout would sit in
      // localStorage claiming 1.x and a release without width_mm would fail on
      // the placement refinement instead of asking the user to update (#3310).
      layout: stampLayoutForWrite(layout),
      savedAt,
      [WRITER_TAB_ID_FIELD]: getTabId(),
    });
  } catch (error) {
    log("failed to serialize layout body for %s: %O", id, error);
    return { ok: false, failure: "unavailable" };
  }

  const write = safeSetItemWithStatus(layoutBodyKey(id), serialized);
  const wrote = write.ok;
  const index = loadWorkspaceIndex() ?? {
    schemaVersion: SCHEMA_VERSION,
    activeId: id,
    openTabs: [id],
    library: Object.create(null) as Record<string, LibraryEntry>,
  };
  const previous = index.library[id];

  // A failed write leaves nothing worth pointing at unless a body is genuinely
  // on disk from an earlier write. Ask storage, rather than trusting the index:
  // `updatedAt` only records that a write once succeeded, so it is still set
  // for a body that has since been evicted, and it is EMPTY for a shell entry
  // whose body has never been written. Either way the entry would survive into
  // the next launch as a named tab over an empty canvas (#3375). Reading the
  // body back is only on the failure path, so its cost never touches a healthy
  // autosave.
  if (!wrote && safeGetItem(layoutBodyKey(id)) === null) {
    log(
      "dropping index entry for %s: body write failed (%s) and no body on disk",
      id,
      write.failure,
    );
    // Remove any entry and open-tab reference this layout already had, then
    // save the reduced index. Returning early instead would leave a stale shell
    // entry behind, which is the phantom tab this guard exists to prevent.
    //
    // This cleanup write can itself be refused, in which case the stale entry
    // survives. The caller still learns the save failed (the body-write result
    // below is already not ok), and persistBrowserWorkspace re-checks the body
    // for every failed layout before rebuilding the open set, so the entry
    // cannot slip back into the index by that route either.
    if (previous || index.openTabs.includes(id)) {
      delete index.library[id];
      index.openTabs = index.openTabs.filter((openId) => openId !== id);
      if (index.activeId === id) index.activeId = index.openTabs[0] ?? null;
      const cleanup = saveWorkspaceIndex(index);
      if (!cleanup.ok) {
        log(
          "index cleanup for %s failed (%s); entry is stale until the next persist",
          id,
          cleanup.failure,
        );
      }
    }
    return write;
  }

  index.library[id] = {
    name: layout.name,
    updatedAt: wrote ? savedAt : (previous?.updatedAt ?? ""),
    changesSinceExport: durability.changesSinceExport,
    hasEverExported:
      durability.hasEverExported ?? previous?.hasEverExported ?? false,
    // Distinguish an explicit null (clear, e.g. after a layout reset/load) from
    // an omitted value (undefined, preserve the prior timestamp). Nullish
    // coalescing alone would treat the intentional null as "keep previous" and
    // leave a stale "Last saved" time in the entry.
    lastExportedAt:
      durability.lastExportedAt !== undefined
        ? durability.lastExportedAt
        : (previous?.lastExportedAt ?? null),
    writeFailed: durability.writeFailed ?? !wrote,
    storageMode: previous?.storageMode ?? "browser",
  };
  if (!index.openTabs.includes(id)) index.openTabs.push(id);
  // A body on disk that the index does not reference is lost on the next
  // launch just as surely as a body that was never written, so a refused index
  // write is reported as a failed save too (#3375).
  const indexWrite = saveWorkspaceIndex(index);
  if (!indexWrite.ok) return indexWrite;

  return write;
}

/**
 * The last time a layout's working copy was written to localStorage, as an ISO
 * timestamp, or null when the layout has no library entry, has never been
 * written (an empty updatedAt), or the last write failed. Surfaces the
 * "Auto-saved" time in the chip popover; excludes failed writes so the chip
 * never reports a fresh autosave time after a failed write.
 */
export function getLayoutSavedAt(id: string): string | null {
  const entry = loadWorkspaceIndex()?.library[id];
  return entry && !entry.writeFailed && entry.updatedAt
    ? entry.updatedAt
    : null;
}

/**
 * Whether a layout body is actually present in storage. The index cannot answer
 * this: `updatedAt` survives an evicted body, and a shell entry never had one
 * (#3375). Callers use it to keep an entry out of the index when the body it
 * would point at is not there.
 */
export function hasLayoutBody(id: string): boolean {
  return safeGetItem(layoutBodyKey(id)) !== null;
}

/**
 * Remove a layout body and drop its library entry. Open set is left to the
 * caller. Reports whether the deletion was actually recorded.
 *
 * The index is written BEFORE the body is removed (#3375). The other order can
 * delete the body and then fail to write the index, leaving an entry that
 * points at nothing: the same phantom tab a failed save produces. Writing the
 * index first means a refused write aborts the deletion whole, with both the
 * body and its entry still intact for the user to retry.
 */
export function deleteLayoutBody(id: string): StorageWriteResult {
  const index = loadWorkspaceIndex();
  if (index) {
    delete index.library[id];
    const wrote = saveWorkspaceIndex(index);
    if (!wrote.ok) {
      log("delete of %s aborted: index write failed (%s)", id, wrote.failure);
      return wrote;
    }
  }
  safeRemoveItem(layoutBodyKey(id));
  return { ok: true, failure: null };
}

/** Whether any layout has ever existed in this browser (returning-user marker). */
export function hasEverHadLayouts(): boolean {
  return safeGetItem(EVER_KEY) === "1";
}

/** Set the returning-user marker. Never cleared once set. */
export function markEverHadLayouts(): void {
  safeSetItem(EVER_KEY, "1");
}

/**
 * One-time adoption of the legacy single `Rackula:autosave` slot into the
 * multi-layout schema. Runs only when no workspace index exists yet and an
 * autosave is present. The legacy slot is removed only after both the body and
 * the index writes land; a failed write keeps the durable fallback so the only
 * copy is never lost, and the next launch retries cleanly.
 *
 * @returns the adopted index, or null when there was nothing to adopt or the
 *   migration could not complete.
 */
export function adoptLegacyAutosave(): WorkspaceIndex | null {
  if (loadWorkspaceIndex() !== null) return null;

  const session = loadSessionWithTimestamp();
  if (!session) return null;

  const candidateId = session.layout.metadata?.id?.trim();
  const id =
    candidateId && isSafeLayoutId(candidateId) ? candidateId : generateId();
  const layout: Layout = {
    ...session.layout,
    metadata: { ...session.layout.metadata, id, name: session.layout.name },
  };

  const wroteBody = saveLayoutBody(id, layout, {
    changesSinceExport: session.changesSinceExport,
    hasEverExported: session.hasEverExported,
  });
  if (!wroteBody.ok) {
    // Never delete the only copy on a failed migration; leave the autosave and
    // any partial index for a clean retry next launch.
    safeRemoveItem(WORKSPACE_KEY);
    safeRemoveItem(layoutBodyKey(id));
    return null;
  }

  const index = loadWorkspaceIndex();
  if (!index) return null;
  index.activeId = id;
  index.openTabs = [id];
  index.library[id] = {
    name: layout.name,
    updatedAt: session.savedAt ?? new Date().toISOString(),
    changesSinceExport: session.changesSinceExport,
    hasEverExported: session.hasEverExported,
    lastExportedAt: null,
    writeFailed: false,
    storageMode: session.storageMode,
  };
  if (!saveWorkspaceIndex(index).ok) return null;

  markEverHadLayouts();
  safeRemoveItem(AUTOSAVE_KEY);
  return index;
}
