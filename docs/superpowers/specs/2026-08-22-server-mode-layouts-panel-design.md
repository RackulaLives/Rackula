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

1. `src/lib/components/LayoutsLibrary.svelte:66` derives its rows only from `buildLayoutRows(workspaceStore.tabs, activeId, workspaceStore.library)`. The component references neither the storage mode nor the API.
2. `workspaceStore.library` is seeded only in `restoreWorkspace()` (`src/lib/stores/workspace.svelte.ts:397-407`), whose single call site is `src/App.svelte:348`, inside the `if (!serverMode)` branch. Server mode starts every load with an empty library.
3. `src/lib/components/PersistenceEffects.svelte:144` and `:169` short-circuit workspace persistence with `if (getStorageMode() === "server") return;`, so the index that would seed the library is never written either.
4. All five callers of `listSavedLayouts()` (`src/lib/storage/api.ts:277`) are elsewhere: startup reconcile (`src/App.svelte:415`), the Open dialog (`src/lib/components/LoadDialog.svelte:74`), export-all (`src/lib/storage/manager.svelte.ts:426`), and server opt-in (`src/lib/storage/server-opt-in.svelte.ts:133`). None writes to the workspace store.
5. In server mode a library entry can only appear through `openTab(layout)` (`src/lib/stores/workspace.svelte.ts:192-196`), for layouts opened or created in the current session. It does not survive a reload.

This accounts for all three reported symptoms: the save succeeds because the PUT path is independent; a reload leaves one row because reconcile restores a single working copy into the one open tab; a fresh browser shows none because there is no local state to render.

`src/App.svelte:365-366` claims "The server library is reachable through the sidebar Layouts tab and the app menu". That comment is false in the current code and describes the behaviour the reporter expected.

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
}
```

Browser mode maps its `library` record to entries; server mode maps `items`. The open-versus-closed de-duplication by `tab.layoutId` is unchanged, so a server layout open in a tab still renders once, as an open row. Closed server rows carry real `rackCount` and `deviceCount` from the API; closed browser rows keep their zeros as today.

### 3. Consuming surfaces

`src/lib/components/LayoutsLibrary.svelte` and `src/lib/components/mobile/MobileLayoutsSheet.svelte` both select their catalogue source with `getStorageMode()`.

### 4. Actions in server mode

| Action | Behaviour |
| --- | --- |
| Activate a closed row | `runOpenFileFlow(guarded => loadFromApi(id, ...))`, the same call `src/lib/components/LoadDialog.svelte:97` already makes |
| Activate an open row | `switchTo(tabId)`, unchanged |
| Delete | Existing in-panel `ConfirmDialog`, then `deleteSavedLayout(id)`, then `removeServerLibraryItem(id)`; closes the tab if that layout is open, mirroring browser `deleteLayout` |
| New layout | Unchanged (`openTab`); the layout enters the list on its first successful save |
| Rename, Duplicate, Export | Offered on open rows only. Omitted on closed server rows in this change: each needs a body fetch, and rename additionally needs a server PUT that would duplicate the save funnel. Opening a layout is one click, so nothing becomes unreachable. |

### 5. Freshness

Refetch on panel mount. Local mutations update the list in place rather than refetching: a delete calls `removeServerLibraryItem(id)`, and on a successful save `finalizeSuccessfulSave()` (`src/lib/storage/manager.svelte.ts:130`), the single funnel for both manual and automatic server saves, calls `upsertServerLibraryItem()` with the locally known id, name, and counts plus the returned `updatedAt`.

The upsert rather than a refetch is deliberate: autosave fires every 2 seconds while editing, so invalidating on save would mean one `GET /api/layouts` per save. The upsert keeps the row label live at no request cost.

### 6. Offline

When `status` is `unavailable`, open rows still render and the closed-row section is replaced by a short "Cannot reach `<server>`" line with a retry that calls `refreshServerLibrary()`. The existing 30 second health-check recovery (`src/lib/storage/manager.svelte.ts`, effect 3) also refills the list. The panel never renders a bare empty state that implies the layouts are gone.

## Testing

Follow the project testing rules: behaviour only, no DOM-structure or class assertions, no exact lengths on data arrays.

Unit:

- `buildLayoutRows` with the new entry shape: an open server layout de-duplicates to a single open row; closed rows carry counts when the source supplies them and zeros when it does not
- `server-library.svelte.ts` state transitions, including the `unavailable` path when the API is down

Behaviour:

- Server mode, activating a closed row invokes the open-file guard and calls `loadFromApi` with that row's id
- Server mode, deleting a row calls `deleteSavedLayout` and closes the tab when that layout is open
- Browser mode rows are unaffected by the catalogue-shape change

E2E is not warranted: the existing suite has no server-mode harness, and adding one is disproportionate to this fix.

## Follow-up found during investigation

Not part of this change, worth its own issue. `handleNewLayout` (`src/App.svelte:518`) opens a new tab in both modes, and `LayoutTabs` is not mode-gated, so server mode already renders multiple tabs while only the active one is persisted, against a single global `serverBaseUpdatedAt`. Switching tabs in server mode therefore arms autosave for the newly active layout against the previous layout's base.
