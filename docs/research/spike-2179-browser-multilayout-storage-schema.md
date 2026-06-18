# Spike #2179: Browser-mode Multi-layout Storage Schema

Date: 2026-06-14 Parent epic: #2017 (Canvas UX Overhaul, milestone M14) Pairs with: spike #2018 (interaction model, which does not own persistence)

---

## Problem

Five planned issues presume a durable browser-mode multi-layout store that nothing defines. Today the app persists exactly one localStorage key, `Rackula:autosave`, holding a single `SessionData` blob (`src/lib/storage/working-copy.ts`); #2034 put the `changesSinceExport` counter inside that same blob. The tab strip (#2079), lazy restore (#2080), sidebar library (#2082), export-all per-layout counter reset (#2045), and the storage chip rollup (#2035) all need per-layout persisted copies and a per-layout durability source. This spike defines that schema.

## Decisions (maintainer-steered, 2026-06-14)

- Backend: localStorage only for now. The hybrid IndexedDB option (layout bodies in IndexedDB, index in localStorage) is tabled as a follow-up triggered by observed quota failures. Rationale: browser-only mode may be retired once the Cloudflare Workers storage migration lands, so the investment here is kept minimal and dependency-free.
- Existing data: one-time adoption. On first launch under the new schema the old `Rackula:autosave` slot is read once, seeded as the first layout, then deleted. A single import, not an ongoing legacy path, so it stays within the greenfield principle.
- Quota posture: trust the model (inherited from #2018 and #2019). Never auto-evict a user's layout; on a failed write keep the in-memory copy and surface the state through the chip, never silently lose work.

## Current state this replaces

`src/lib/storage/working-copy.ts`:

- `saveSession(layout, backup)` writes one `SessionData { layout, savedAt, changesSinceExport, hasEverExported, storageMode }` to `Rackula:autosave` via `safeSetItem` (which already returns false on `QuotaExceededError`).
- `loadSessionWithTimestamp()` reads and migrates it (keeps the v0.6 to v0.7 body migration in `migrateLayout`).
- `clearSession()`, `detectModeFlip()`, `isServerNewer()` round out the module. `src/lib/utils/safe-storage.ts` provides `safeGetItem`, `safeGetItemWithStatus` (distinguishes missing from unavailable), `safeSetItem` (false on quota/unavailable), `safeRemoveItem`.

## Schema

Four key families under the existing `Rackula:` namespace.

### 1. Workspace index, one key: `Rackula:workspace`

```jsonc
{
  "schemaVersion": 2,
  "activeId": "uuid-or-null",
  "openTabs": ["uuid-a", "uuid-b"], // ordered open set (the session working set)
  "library": {
    // every layout that exists (the durable list)
    "uuid-a": {
      "name": "Homelab",
      "updatedAt": "2026-06-14T09:00:00.000Z",
      "changesSinceExport": 0,
      "hasEverExported": true,
      "writeFailed": false,
      "storageMode": "browser",
    },
  },
}
```

- Small (no layout bodies), so it is read synchronously at launch to paint tab shells (#2080) and the sidebar list (#2082) before any body is parsed.
- Per-layout durability (`changesSinceExport`, `hasEverExported`, `writeFailed`) lives here so the chip rollup (#2035), tab dots (#2079), and sidebar dots (#2082) all read one source without loading bodies. No second bookkeeping. (`writeFailed` semantics: see Durability rollup.)
- `openTabs` is the session working set and is a subset of `library`. Closing a tab removes an id from `openTabs` only; the `library` entry and the body persist (this is #2079's "closing keeps the layout").

### 2. Per-layout body, one key each: `Rackula:layout:<id>`

```jsonc
{
  "schemaVersion": 2,
  "layout": {
    /* full Layout, including base64 images */
  },
  "savedAt": "2026-06-14T09:00:00.000Z",
}
```

- Loaded lazily on tab focus. Holds the full layout, the large part (base64 device images, #617).

### 3. First-layout marker, one key: `Rackula:everHadLayouts`

A standalone flag, value `"1"`, set the first time any layout is created or adopted and never cleared. It is a separate key on purpose: it must survive a wipe of `Rackula:workspace` so the app can tell a returning user whose data was lost (flag present, workspace empty or missing) from a genuine fresh install (flag absent). The launch flow reads it to route the empty state (lost- data recovery vs WelcomeScreen, feeding #2018 and #2081).

### 4. Legacy single slot: `Rackula:autosave`

Removed after one-time adoption (below). Not read again afterwards.

Layout id is the layout's `metadata.id` (a UUID) where present, else a freshly generated one, so the same identity is reusable across browser and server modes.

## Operations (the module that replaces working-copy.ts for browser mode)

Index-only operations (cheap, no body read/write):

- `loadIndex()` / `getOpenSet()`: `{ activeId, openTabs }` and the `library` map.
- `listLibrary()`: library entries (id, name, updatedAt, durability) with no bodies.
- `setOpenSet(openTabs, activeId)`: tab open, close, reorder, switch. Index-only.
- `updateDurability(id, { changesSinceExport, hasEverExported })`: e.g. `markExported` per layout (#2045) without rewriting the body.
- `renameLayout(id, name)`: index-only, live-syncs the tab title (#2018).
- `deleteLayout(id)`: removes the body key and the library entry. It does not drop the id from `openTabs`: per #2018, deleting a layout that is currently open leaves the tab in place as a recoverable orphan (offering Save as new), so whether the tab closes is the interaction layer's call, not a side effect of the storage delete. This is the sidebar Delete, distinct from tab close.

Body operations:

- `loadLayoutBody(id)`: reads `Rackula:layout:<id>`, runs the existing `migrateLayout`, returns the Layout or an unreadable marker (which #2018 renders as the on-focus orphan/error state).
- `saveLayoutBody(id, layout)`: writes the body and updates the index entry (`updatedAt`, durability). Returns false on quota (propagated from `safeSetItem`).
- `createLayout(name)`: new id, an empty body, and a library entry.

## One-time adoption (off `Rackula:autosave`)

On launch in browser mode, if `Rackula:workspace` is absent:

- If `Rackula:autosave` is present: `loadSessionWithTimestamp()`, create a library entry under the layout's id, write its body, set `openTabs = [id]` and `activeId = id`, carry over `changesSinceExport` and `hasEverExported`. Only after both the body write and the index write succeed (`safeSetItem` returned true for each), `safeRemoveItem("Rackula:autosave")`. If either write fails (quota or storage unavailable), keep the legacy slot intact as the durable fallback and surface the failure per the quota strategy; never delete the only copy on a failed migration.
- Else: empty workspace (`activeId = null`, `openTabs = []`, `library = {}`).

Adoption runs once and is idempotent: it only proceeds when `Rackula:workspace` is absent, and it deletes the legacy slot only after the new writes have landed, so a failed or interrupted run retries cleanly on the next launch. After a successful run `Rackula:workspace` exists and the old key is gone, so no legacy code path lingers.

Returning-user vs fresh-install (feeds #2018 and #2081): set a persisted `Rackula:everHadLayouts` flag the first time a layout is created or adopted. An empty workspace with the flag set is lost-data-empty (recovery state); without it, fresh-install-empty (WelcomeScreen).

## Quota strategy

- The localStorage cap is roughly 5MB. Base64 images (#617) times N layouts is the risk that pushes a browser-mode workspace past it.
- Detection: `safeSetItem` already returns false on `QuotaExceededError`; `saveLayoutBody` surfaces that boolean.
- Posture (trust the model): on a failed write, do not auto-evict any layout. Keep the in-memory copy, set the layout's `writeFailed` flag in the index (see Durability rollup), and surface it through:
  - the chip (#2035), which goes to an error state because that layout's working copy cannot be persisted;
  - a user-facing prompt to Export or remove layouts to free space.
- No silent data loss: a body that failed to write stays in memory and remains exportable.
- Escape valve and follow-up trigger: when quota failures show up in real use, lift the tabled hybrid plan (IndexedDB for bodies, this index stays in localStorage). The `schemaVersion` field plus the body/index split keep that migration localized to `loadLayoutBody` and `saveLayoutBody`. File the IndexedDB follow-up issue at that point. Browser mode may be retired first via the Cloudflare Workers migration, in which case the follow-up is moot.

## Twin-tab guard re-key (#2044)

- Web Lock name is per layout: `rackula:layout:<id>` (matches #2018's per-layout pause). One editable in-app tab per layout; editing layout A locks only A.
- Storage events: a write to `Rackula:layout:<id>` notifies other tabs watching that id (the body changed, so offer Reload for that one layout). A write to `Rackula:workspace` notifies all tabs of library and open-set changes (a layout deleted elsewhere becomes the #2018 orphan).
- Per-key writes mean no app-wide write lock is needed; if one is added later, scope it to the index-key writes only.

## Durability rollup (one source for #2035, #2079, #2082)

- `getDurability(id) -> { changesSinceExport, hasEverExported, backed, writeFailed }` reads the index. `backed` is the export-durability signal: `changesSinceExport === 0` (the #2019 chip rule, green only at zero changes since export). `writeFailed` records whether the last attempt to persist this layout's body to localStorage failed (quota or unavailable); `saveLayoutBody` sets it on failure and clears it on the next successful write, and it is persisted in the index entry so it survives reload. The two signals are distinct: `changesSinceExport` tracks edits not yet exported to a file; `writeFailed` tracks whether the browser working copy could be saved at all.
- Chip (#2035): error when any open layout has `writeFailed` (its working copy cannot be saved locally); otherwise green only when every id in `openTabs` is `backed`; otherwise amber. Tab dots (#2079) and sidebar dots (#2082) read the same per-id values, so the error, amber, and green states come from one source, not three.

## Schema versioning

- `schemaVersion: 2` (version 1 is the implicit single-slot `Rackula:autosave` format). The index and bodies carry the field; the existing `migrateLayout` still handles body content migration (v0.6 to v0.7). The body/index split isolates a future IndexedDB swap behind the two body operations.

## Handoff to presuming issues

| Issue | What it consumes |
| --- | --- |
| #2079 tab strip | `setOpenSet` for open/close/reorder/switch (index-only); close keeps the body; tab dots from `getDurability` |
| #2080 lazy restore | `getOpenSet` + `listLibrary` paint shells; `loadLayoutBody` on focus; unreadable body becomes the #2018 orphan/error |
| #2082 sidebar library | `listLibrary` is the durable list; dots from `getDurability`; `renameLayout` / `deleteLayout` |
| #2045 export-all | per-layout `updateDurability(id, { changesSinceExport: 0, hasEverExported: true })` |
| #2035 chip | rollup over `openTabs` via `getDurability` |
| #2044 twin-tab guard | per-layout Web Lock `rackula:layout:<id>` + the storage-event keys above |

## Out of scope

- IndexedDB / hybrid backend (tabled; quota-triggered follow-up).
- Server-mode persistence (unchanged; this schema is browser-mode only).
- Undo/redo across tab switch and restore (#2182).
