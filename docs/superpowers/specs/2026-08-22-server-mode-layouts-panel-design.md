# Server-mode Layouts panel design

Issue: [#3151](https://github.com/RackulaLives/Rackula/issues/3151) Date: 2026-08-22 Status: approved, ready for planning

## Problem

In server storage mode the Layouts panel does not list the layouts the API returns. `GET /api/layouts` responds correctly and the layout files exist on disk, but the panel shows only the layout currently open. A fresh browser or a second device shows none of the saved layouts.

### Root cause

The panel is browser-mode-only by construction. Nothing feeds the server's layout list into it.

Rackula runs two persistence models:

|  | Browser mode | Server mode |
| --- | --- | --- |
| Model | Multi-layout workspace: `Rackula:workspace` index plus `Rackula:layout:<id>` bodies (spike #2179) | Single working copy in the legacy `Rackula:autosave` slot, reconciled against the API on load |
| Feeds the Layouts panel | Yes, through `workspaceStore.library` | No |

Evidence:

1. `src/lib/components/LayoutsLibrary.svelte:63-69` derives its rows only from `buildLayoutRows(workspaceStore.tabs, activeId, workspaceStore.library)`. The component references neither the storage mode nor the API.
2. `workspaceStore.library` is seeded only in `restoreWorkspace()` (`src/lib/stores/workspace.svelte.ts:397-407`), whose single call site is `src/App.svelte:348`, inside the `if (!serverMode)` branch. Server mode starts every load with an empty library.
3. `src/lib/components/PersistenceEffects.svelte:144` and `:169` short-circuit workspace persistence with `if (getStorageMode() === "server") return;`, so the index that would seed the library is never written either.
4. All four production callers of `listSavedLayouts()` (`src/lib/storage/api.ts:277`) are elsewhere: startup reconcile (`src/App.svelte:415`), the Open dialog (`src/lib/components/LoadDialog.svelte:74`), export-all (`src/lib/storage/manager.svelte.ts:426`), and server opt-in (`src/lib/storage/server-opt-in.svelte.ts:133`). None writes to the workspace store. The re-export at `src/lib/storage/index.ts:20` is not a call site.
5. In server mode a library entry can only appear through `openTab(layout)` (`src/lib/stores/workspace.svelte.ts:192-199`), for layouts opened or created in the current session. It does not survive a reload.

This accounts for all three reported symptoms: the save succeeds because the PUT path is independent; a reload leaves one row because reconcile restores a single working copy into the one open tab; a fresh browser shows none because there is no local state to render.

`src/App.svelte:366-367` claims "The server library is reachable through the sidebar Layouts tab and the app menu". That comment is false in the current code and describes the behaviour the reporter expected.

Note this is not a regression. Multi-layout workspace was scoped localStorage-only in spike #2179 and server mode never got a parallel implementation.

## Scope

Fix the panel within the existing single-working-copy server model. Server mode continues to hold one working copy; the panel lists the server library and opening a row replaces that working copy behind the existing replace-confirm guard, exactly as the Open dialog does today.

Out of scope, by decision:

- Per-layout `serverBaseUpdatedAt`
- Per-tab server save scheduling
- Unifying server mode onto the multi-layout workspace model

## Constraints discovered

- `serverBaseUpdatedAt` (`src/lib/storage/server-base.ts`) is a single global module variable, and server autosave (`src/lib/storage/manager.svelte.ts:575-600`) reads `layoutStore.layout`, the active-tab facade. Server mode is architecturally single-working-copy, which forces replace-on-open rather than open-in-new-tab.
- `restoreWorkspace({ index, loadBody, deleteBody })` looks like a reusable seam, but `loadBody` is synchronous and a server read is not. Feeding the server list through it would push async into lazy hydration, restore shells, and the twin-tab guard.
- `LayoutsLibrary` is mounted conditionally (`src/App.svelte:652`, `{:else if uiStore.sidebarTab === "layouts"}`), so component mount is a usable panel-open hook.
- `src/lib/components/mobile/MobileLayoutsSheet.svelte:52-55` has the identical defect and is in scope.
- Server mode never sets `tab.layoutId`. It is written in exactly one place, `openTab` (`src/lib/stores/workspace.svelte.ts:181`); no server load path touches it (`grep layoutId` returns nothing in `load-pipeline.ts` or `reconcile.ts`). The open working copy therefore has no `layoutId`, and a tab created by New layout keeps the id `createLayout()` generated (`src/lib/utils/serialization.ts:25`) even after `loadFromApi` replaces its contents. Any de-duplication keyed on `tab.layoutId` is wrong in server mode, in both directions.
- There is no exported way to cancel a pending server autosave. `cancelSessionSave` is module-private (`src/lib/storage/manager.svelte.ts:60`) and nothing exposes `serverSaveTimer`.
- `initializePersistence()` is cached and de-duplicates concurrent calls (`src/lib/storage/availability.svelte.ts:160-171`), so it is safe to await from anywhere.
- `apiAvailable` starts `null` (`src/lib/storage/availability.svelte.ts:82`) and the sidebar tab is restored from storage (`src/lib/stores/ui.svelte.ts:257`), so the panel can mount before the first health check resolves.
- `LayoutTabs.svelte` imports only `nextDuplicateName` from the panel module and needs no change.

## Approach

A separate reactive server-library store, with the panel choosing its catalogue source by storage mode. Rejected alternatives: feeding `workspaceStore.library` from the server (forces async through browser hydration, and `openLayout()` is the wrong path for replace-on-open); a mode-agnostic catalogue interface with two drivers (the differing open semantics leak through the interface, and it is more abstraction than the fix warrants).

### 1. New module: `src/lib/storage/server-library.svelte.ts`

Reactive state:

- `items: SavedLayoutItem[]`
- `status: "idle" | "loading" | "ready" | "unavailable"`

Exports:

- `refreshServerLibrary(): Promise<void>` calls `listSavedLayouts()`; sets `unavailable` when `isApiAvailable()` is false or a `PersistenceError` is thrown
- `upsertServerLibraryItem(item: SavedLayoutItem): void`
- `removeServerLibraryItem(id: string): void`

The module owns no UI and no tab semantics.

### 2. Row model

`buildLayoutRows` takes its catalogue as `readonly CatalogueEntry[]` instead of `Record<string, LibraryLayout>`, where:

```ts
interface CatalogueEntry {
  id: string;
  name: string;
  rackCount?: number;
  deviceCount?: number;
  /** False when the stored YAML is corrupted. Server catalogue only. */
  valid?: boolean;
}
```

Browser mode maps its `library` record to entries; server mode maps `items`.

Open-versus-closed de-duplication cannot key on `tab.layoutId`, which server mode never sets. `buildLayoutRows` gains a `resolveOpenId: (tab: WorkspaceTab) => string | undefined` parameter:

- Browser mode passes `t => t.layoutId`. Unhydrated restore shells have no loaded body, so the tab record is the only identity available.
- Server mode passes `t => t.store.layout.metadata?.id`. Every server-mode tab is hydrated, and reading the live body means a tab whose contents were replaced by `loadFromApi` resolves to the layout it now holds rather than a stale id.

Keeping the resolution in the panel is deliberate. The alternative, writing `tab.layoutId` from the server open and save paths, couples persistence to the workspace store and re-creates the same stale-id class of bug the moment a path is missed.

Closed server rows carry real `rackCount` and `deviceCount` from the API; closed browser rows keep their zeros as today.

Closed server rows always render the hatched placeholder thumbnail, because `previewFor` reads `workspaceStore.peekLibraryBody` (`src/lib/components/LayoutsLibrary.svelte:128`), which is null-returning in server mode. This is accepted: fetching a body per row to draw a preview would mean one GET per listed layout.

### 3. Consuming surfaces

`src/lib/components/LayoutsLibrary.svelte` and `src/lib/components/mobile/MobileLayoutsSheet.svelte` both select their catalogue source with `getStorageMode()`.

The mobile sheet needs more than a source swap. `activateRow` (`src/lib/components/mobile/MobileLayoutsSheet.svelte:81-88`) sends any row with a `layoutId` to `workspaceStore.openFromLibrary`, and in server mode `loadBodyFn` is null, so that falls through to the unreadable-shell branch (`src/lib/stores/workspace.svelte.ts:222-241`) and opens an empty tab flagged unreadable with no replace guard and no server fetch. Mobile closed-row activation must route through the same `runOpenFileFlow` plus `loadFromApi` path as desktop, with the sheet dismissing _before_ the guard runs, not after. Dismissing first clears the sheet off screen before the replace-confirm dialog appears; dismissing after would leave the sheet sitting on top of the confirm dialog while the user decides. Pinned by a test in commit `0b16209f`.

### 4. Actions in server mode

| Action | Behaviour |
| --- | --- |
| Activate a closed row | `runOpenFileFlow(guarded => loadFromApi(id, ...))`, the same call `src/lib/components/LoadDialog.svelte:97` already makes |
| Activate an open row | `switchTo(tabId)`, unchanged |
| Delete | Existing in-panel `ConfirmDialog`, then `deleteSavedLayout(id)`, then `removeServerLibraryItem(id)`. See "Deleting the open working copy" below when the deleted layout is the one currently open |
| New layout | Unchanged (`openTab`); the layout enters the list on its first successful save |
| Open a corrupted row (`valid: false`) | Blocked before the replace guard runs, with the same named toast the Open dialog raises (`src/lib/components/LoadDialog.svelte:84-91`). Delete stays available: it is the recovery path, and `exportAllServer` already filters on `valid` (`src/lib/storage/manager.svelte.ts:427`) |
| Rename, Duplicate, Export | Offered on open rows only. Omitted on closed server rows in this change: each needs a body fetch, and rename additionally needs a server PUT that would duplicate the save funnel. Opening a layout is one click, so nothing becomes unreachable. |

#### Deleting the open working copy

Deleting the layout that is currently open is not just a tab close. The working copy survives in `Rackula:autosave` with a live `serverBaseUpdatedAt`, so a debounced autosave (Effect 2, 2 second debounce, `src/lib/storage/manager.svelte.ts:575-631`) can PUT the layout straight back after the DELETE, and even without that the next reload reconciles the surviving session as `unknown-to-server` (`src/lib/storage/reconcile.ts`) and restores it.

The panel must, in order:

1. Call a new exported `abandonWorkingCopy()` in `manager.svelte.ts`: clear `serverSaveTimer`, bump `_serverSaveScheduleId` so a settling save is treated as stale, call the module-private `cancelSessionSave()`, `clearSession()` (`src/lib/storage/working-copy.ts:160`), and `setServerBaseUpdatedAt(null)`
2. Issue `deleteSavedLayout(id)`
3. `removeServerLibraryItem(id)` and close the tab via `closeTab(tabId)`, resolving the tab with the same `resolveOpenId` rule from section 2

`closeTab`'s fresh-blank-tab fallback (`src/lib/stores/workspace.svelte.ts:327-337`) is the intended canvas outcome.

Accepted residual race: a PUT already on the wire when the user confirms the delete can recreate the layout server-side. Step 1 cancels the debounced timer, which is the common case; building a save barrier for the sub-second in-flight window is disproportionate here.

### 5. Freshness

Refetch on panel mount. Local mutations update the list in place rather than refetching: a delete calls `removeServerLibraryItem(id)`, and on a successful save `finalizeSuccessfulSave()` (`src/lib/storage/manager.svelte.ts:130`), the single funnel for both manual and automatic server saves, calls `upsertServerLibraryItem()` with the locally known id, name, and counts plus the returned `updatedAt`.

The upsert rather than a refetch is deliberate: autosave fires every 2 seconds while editing, so invalidating on save would mean one `GET /api/layouts` per save. The upsert keeps the row label live at no request cost.

Payload construction. `SavedLayoutItem` (`src/lib/storage/api.ts:193-202`) requires `version`, `valid`, and a non-null `updatedAt`, while `finalizeSuccessfulSave`'s `newUpdatedAt` parameter is nullable (`src/lib/storage/manager.svelte.ts:130-132`). Build the item from `getLayoutStore().layout` with `valid: true` and the layout's `version`, and skip the upsert entirely when `newUpdatedAt` is null, since that branch means the server returned no new timestamp. The id is guaranteed present at this point: `saveLayoutToServer` throws without `metadata.id` (`src/lib/storage/api.ts:544-549`).

Import direction. `manager` imports `server-library`, never the reverse. `server-library` must catch `PersistenceError` itself and must not import `handlePersistenceError`, or the cycle that `server-base.ts` was deliberately kept a pure module to avoid reappears.

Refetch versus upsert race. A mount refetch that replaces `items` wholesale can drop a row that an upsert added while the GET was in flight, leaving it missing until the next mount. `refreshServerLibrary` carries a request-sequence token and merges any upsert recorded after its fetch started. The delete direction self-heals, because `removeServerLibraryItem` runs after the awaited DELETE.

### 6. Offline

When `status` is `unavailable`, open rows still render and the closed-row section is replaced by a short "Cannot reach `<server>`" line with a retry that calls `refreshServerLibrary()`. The panel never renders a bare empty state that implies the layouts are gone.

Recovery needs explicit wiring. Effect 3 (`src/lib/storage/manager.svelte.ts:634-666`) only calls `setApiAvailable(true)` and raises a toast; nothing there refills a layout list. The panel reacts to `getApiAvailableState()` flipping to true by calling `refreshServerLibrary()`, so a server that comes back repopulates the list without a manual retry.

Startup ordering. `refreshServerLibrary` awaits `initializePersistence()` before reading availability. Without it the panel can mount ahead of the first health check, read `apiAvailable === null` as unavailable, and show the offline notice against a healthy server.

## Testing

Follow the project testing rules: behaviour only, no DOM-structure or class assertions, no exact lengths on data arrays.

Unit:

- `buildLayoutRows` with the new entry shape: an open server layout de-duplicates to a single open row; closed rows carry counts when the source supplies them and zeros when it does not
- `server-library.svelte.ts` state transitions, including the `unavailable` path when the API is down

Behaviour:

- Server mode, activating a closed row invokes the open-file guard and calls `loadFromApi` with that row's id
- Server mode, deleting a row calls `deleteSavedLayout` and closes the tab when that layout is open
- Browser mode rows are unaffected by the catalogue-shape change

Existing suite. `src/tests/layouts-library.test.ts` calls `buildLayoutRows(ws.tabs, ws.activeId, ws.library)` at lines 30, 41, 66, 78, 108, and 138 and must be rewritten to the entry-array plus resolver signature. The two cases that build catalogues through `restoreWorkspace` need reworking rather than a mechanical edit.

E2E is not warranted: the existing suite has no server-mode harness, and adding one is disproportionate to this fix.

## Follow-up found during investigation

Not part of this change, worth its own issue. `handleNewLayout` (`src/App.svelte:518`) opens a new tab in both modes, and `LayoutTabs` is not mode-gated, so server mode already renders multiple tabs while only the active one is persisted, against a single global `serverBaseUpdatedAt`. Switching tabs in server mode therefore arms autosave for the newly active layout against the previous layout's base.

Duplicating an open row still routes through `openTab` (`src/lib/components/LayoutsLibrary.svelte:274`), creating exactly that second server-mode tab. The hazard is pre-existing, but a working Layouts panel makes it easier to reach.
