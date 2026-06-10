# Spike #2019 codebase exploration

Codebase ground truth for the storage model and data safety spike. All paths relative to repo root unless noted.

## Files Examined

- `docs/superpowers/specs/2026-06-09-canvas-ux-overhaul-design.md`: parent epic spec (storage sections)
- `docs/superpowers/specs/2026-06-04-save-indicator-design.md`: save-indicator spec (#1901, approved, implemented)
- `docs/superpowers/specs/2026-06-02-storage-abuse-guardrails-design.md`: server quota spec (#1780, implemented)
- `docs/research/spike-1995-unraid-distribution.md`: Unraid two-template decision feeding #2008
- `src/lib/utils/persistence-manager.svelte.ts`: autosave effects, circuit breaker, save/export entry points
- `src/lib/utils/persistence-api.ts`: API client (health, layouts CRUD, assets)
- `src/lib/utils/persistence-config.ts`: API_BASE_URL resolution
- `src/lib/stores/persistence.svelte.ts`: runtime API availability detection
- `src/lib/utils/session-storage.ts`: localStorage working copy + timestamp conflict helpers
- `src/lib/utils/safe-storage.ts`: try/catch localStorage wrappers
- `src/App.svelte` (onMount, lines 175-317): startup load priority and timestamp conflict resolution
- `src/lib/components/PersistenceEffects.svelte`: visibilitychange/beforeunload flush, dirty-leave warning
- `src/lib/utils/archive.ts`: file export (browser-fs-access fileSave, ZIP archive, YAML)
- `src/lib/utils/load-pipeline.ts`: unified load from API or file
- `src/lib/utils/file.ts`: file picker for import
- `src/lib/utils/yaml.ts`: layout YAML serialization
- `src/lib/utils/share.ts`: lz-string URL share encoding
- `src/lib/stores/layout.svelte.ts`: isDirty / markClean / markDirty
- `src/lib/stores/images.svelte.ts`: in-memory image store (not persisted to browser storage)
- `src/lib/components/KeyboardHandler.svelte`: Ctrl+S/O/E wiring
- `api/src/routes/layouts.ts`, `api/src/storage/filesystem.ts`, `api/src/storage/assets.ts`, `api/src/storage/quota.ts`: server storage
- `api/src/app.ts`: middleware chain, /health, auth gating of /layouts and /assets
- `deploy/nginx.conf.template`, `deploy/docker-entrypoint-wrapper.sh`: container runtime config and /api proxy
- `vite.config.ts`: build-time env injection (`__BUILD_ENV__`, VITE_BASE_PATH)

## Specs Summary

### Canvas UX overhaul (parent epic spec)

`docs/superpowers/specs/2026-06-09-canvas-ux-overhaul-design.md`

Storage-relevant content (lines 135-193, 235-256, 265-286):

- Explicit storage mode: `storage: browser` or `storage: server`, declared by configuration, not inferred at runtime (lines 139-144). Explicitly replaces "always probing /api and guessing intent from connection history", which made a backendless build indistinguishable from a down server.
- Three-tier model (lines 146-150): file on disk (portable), browser (live working copy, autosaved), server (durable library, server build only). Browser build: durable home is the file. Server build: durable home is the server; file is a portable copy.
- Concurrency target (lines 152-156): one user on multiple devices. Divergence resolves last-write-wins with an automatic pre-overwrite snapshot of the losing copy; no merge or prompt UX. Snapshot mechanics delegated to this spike.
- Storage chip (lines 159-180): single compact chip, top-right, workspace-wide; green only when every open layout is in its durable home. Browser build states: green "In your browser, backed up" (recent file backup exists), amber "In your browser, backup needed". Labels differ as well as colours. The app can only know an export event happened, not that the file still exists; "recent" needs a definition (change-based vs time-based), delegated to this spike. Server build states: green "Saved to <instance>", neutral "Saving", red "<instance> unreachable". Chip click opens a popover with facts (where stored, last backup/sync) and actions (export all, import, browser-build restore from file).
- Messaging (lines 183-193): browser build gets a one-time first-run notice (runs in your browser, nothing uploaded, clearing browser data erases layouts, export to keep a copy) and never the "server unavailable" toast. Server build keeps one instance-named toast on genuine backend drop, fired once, with a quiet recovery toast. The generic "Server unavailable, working offline" toast is removed.
- Inactive tabs carry an unbacked-changes dot identifying which layout the amber chip state refers to (lines 66-69, 163-164).
- Open questions assigned to this spike (lines 250-252): browser-mode data-loss recovery (nudge cadence, restore flow, recent-backup definition), pre-overwrite snapshot mechanics, the twin-tab case, and the mechanics of the explicit storage mode.
- Decision log (lines 265-286) confirms: no persistent-file-handle mechanism for now; storage spike runs before the tabs spike.

### Save-indicator spec (#1901, implemented)

`docs/superpowers/specs/2026-06-04-save-indicator-design.md`

Removed the toolbar `SaveStatus` component; all save feedback moved to toasts. Key decisions the new chip must reconcile with:

- Auto-save is silent; only manual Ctrl+S shows a success toast (3000ms, role=status).
- Save failures are persistent toasts (duration 0) with a Retry action and dedup via a tracked toast ID.
- Offline produces "Server save unavailable, working offline. Use Ctrl+S to retry." (persistence-manager) and "Server unavailable, working offline" (App init).
- Internal `_saveStatus` state kept (idle/saving/saved/error/offline/disabled) to gate health-check polling, but the exported SaveStatus API was deleted. The chip effectively reintroduces a visible save state surface, reversing the visual half of #1901 while the toast decisions about spam (silent autosave) still stand.

### Storage-abuse-guardrails spec (#1780, implemented)

`docs/superpowers/specs/2026-06-02-storage-abuse-guardrails-design.md`

- Server-side quota enforcement: `RACKULA_MAX_LAYOUTS` (default 100) and `RACKULA_MAX_ASSETS_PER_LAYOUT` (default 50), `0` = unlimited. Implemented in `api/src/storage/quota.ts` and `api/src/security/storage-quota-middleware.ts`.
- Layout quota counts directory entries on every create (no cache); update of an existing UUID skips the check (`findFolderByUuid`). Responses: 429 (layout quota) and 507 (asset quota) with `current`/`max` in the body.
- No retention or cleanup policy: "the quota cap IS the guardrail". Pre-overwrite snapshots will add stored objects; whether snapshots count against `RACKULA_MAX_LAYOUTS` (and how snapshot retention interacts with "no cleanup policy") is a direct reconciliation point for this spike.
- Frontend already special-cases quota errors: `persistence-manager.svelte.ts:131-151` detects 507, and 429-with-"quota" text, shows a "Storage full" toast, and explicitly does not flip to offline or trip the circuit breaker.

## Current Persistence Architecture

Working copy: a single layout in localStorage under key `Rackula:autosave` (`src/lib/utils/session-storage.ts:11`). Stored as JSON `{ layout, savedAt }` where `savedAt` is an ISO timestamp added for conflict resolution (`SessionData`, lines 17-20). There is exactly one autosave slot; the app is currently single-layout (no tabs, no multi-layout browser storage). No IndexedDB anywhere in src/.

Autosave pipeline (`src/lib/utils/persistence-manager.svelte.ts:412-509`, registered by `src/lib/components/PersistenceEffects.svelte:24`):

- Effect 1 (lines 419-447): debounced 1s localStorage save via `saveSession()` whenever the layout changes and `hasRack`. Clears the session when racks drop to zero (guarded against the initial-mount race).
- Effect 2 (lines 450-484): debounced 2s server auto-save via `saveLayoutToServer()` when `isApiAvailable()`, gated by a circuit breaker (`MAX_SAVE_FAILURES = 3`, line 43). On success: `clearSession()` (localStorage copy is deleted once the server holds it; the server is treated as the durable home and localStorage purely as offline fallback).
- Effect 3 (lines 487-508): 30s health-check polling while offline, only if `hasEverConnectedToApi()` and the breaker has not opened.
- `flushSessionSave()` (lines 403-410) force-writes the pending debounce; called from `visibilitychange` (hidden) and `beforeunload` (`PersistenceEffects.svelte:29-34, 68-77`).

Save status: internal only. `_saveStatus` (`persistence-manager.svelte.ts:39-40`) holds idle/saving/saved/error/offline/disabled but nothing renders it since #1901; feedback is toasts (`getToastStore()`). The chip will need this state exported again (or a new store) plus a "last export" record that does not exist today.

Dirty tracking: `isDirty` boolean in `src/lib/stores/layout.svelte.ts:146` with `markDirty()`/`markClean()` (lines 1149-1155); set true by mutating actions. `markClean()` is called after server save, YAML file save, and any layout load. Note: dirty is a single boolean, not a change counter; a change-based "recent backup" definition for the chip would need a revision counter or content hash, neither of which exists. There is no record of export events at all (exports do not even call `markClean()` unless via `handleSaveAsArchive`).

API availability detection (`src/lib/stores/persistence.svelte.ts`): runtime probe, not build flag. `initializePersistence()` (lines 67-99) fetches `/api/health` once on startup; `checkApiHealth()` (`persistence-api.ts:117-169`) requires a structured JSON payload (`service: "rackula-persistence-api"`) to guard against SPA-fallback false positives. `hasEverConnectedToApi()` persists `rackula.persistence.apiConnected = "true"` in localStorage (lines 17-31) and is what gates the "Server unavailable, working offline" toast, this is exactly the "guessing intent from connection history" the spec is replacing.

Startup load priority (`src/App.svelte:175-317`):

1. Share URL param (decode, load, return).
2. No local session: reset and show StartScreen (the spec removes this).
3. API available + local session: fetch layout list, sort by `updatedAt` desc, compare against `localSession.savedAt` via `isServerNewer()`; if server newer, load server copy and `clearSession()` (toast: `Loaded "<name>" from server`); if local newer, load local, `markDirty()`, toast "Loaded unsaved local changes (newer than server)" and let next autosave push it up. This is the existing timestamp conflict resolution the issue references. It is last-write-wins with no snapshot: whichever copy loses is silently discarded (the local copy via `clearSession()`, or the server copy on the next 2s autosave overwrite).
4. Fallback: load local session, markDirty.

`isServerNewer()` (`session-storage.ts:215-243`): prefers server on null/invalid local timestamps. Server `updatedAt` comes from file mtime (`api/src/storage/filesystem.ts:121,131,145,183`), not from a logical clock, so it is sensitive to clock skew between server filesystem time and the browser's `new Date().toISOString()`.

Serialization: layouts serialize to YAML via `serializeLayoutToYaml()` (`src/lib/utils/yaml.ts:248`); localStorage uses plain JSON of the Layout object with version-based migrations on load (`session-storage.ts:62-102`). Images are in-memory only (`src/lib/stores/images.svelte.ts`, a `SvelteMap`); custom images survive only via server assets or ZIP export, not via the localStorage working copy. Any browser-mode durability story has to account for images being lost on reload unless bundled or re-imported.

## API / Server Storage

Bun + Hono app (`api/src/app.ts`). Routes:

- `GET /layouts` list (name, version, updatedAt, rackCount, deviceCount, valid) via `listLayouts()` (`filesystem.ts:222`)
- `GET /layouts/:uuid` returns raw YAML
- `PUT /layouts/:uuid` create-or-update (`api/src/routes/layouts.ts:64-131`); validates UUID format and metadata.id-matches-URL; `saveLayout()` (`filesystem.ts:448-539`) writes `/data/{Name}-{UUID}/{name}.rackula.yaml`, handles folder rename on layout rename
- `DELETE /layouts/:uuid` removes the folder recursively
- `PUT/GET/DELETE /assets/:layoutId/:deviceSlug/:face` device images inside the layout folder (`api/src/storage/assets.ts`)
- `GET /health` (and `/api/health`) structured payload; `GET /version`
- Auth routes (`/auth/*`, `/api/auth/*`) for `none|local|oidc` modes

All routes are mounted twice, bare and with `/api` prefix (`app.ts:885-886` `mountWithAlias`); nginx strips `/api` before proxying (`deploy/nginx.conf.template:178-196`).

Storage backend is plain filesystem under DATA_DIR (no DB). Writes are `writeFile` (`filesystem.ts:536`), not atomic temp+rename for the YAML itself (assets use an atomic pattern per the guardrails spec). No versioning, no backups, no soft delete: a PUT replaces the YAML in place and DELETE is final. Pre-overwrite snapshots therefore have no existing mechanism to build on; candidate homes are a sibling file in the layout folder (counted or not by quota, decide explicitly) or a `/data/.snapshots/` area outside `checkLayoutQuota`'s directory scan (`quota.ts` counts UUID-suffixed dirs and legacy flat YAML in DATA_DIR root, per spec lines 69-75).

Concurrency: no ETag, no If-Match, no optimistic locking. `PUT` is unconditional; the server never sees the client's notion of the base version. Last-write-wins already happens implicitly between two devices autosaving. The known quota race (two concurrent creates both pass) is documented as acceptable (guardrails spec, lines 162-164).

Middleware chain (`app.ts:808-886`): writeAuth and requireAdmin on `/layouts/*` and `/assets/*`, body limits (1MB layout YAML, 5MB asset), then `storageQuotaMiddleware`. Auth modes: `none` (anonymous read/write), `local` (argon2 password), `oidc`; session tokens are HMAC-signed cookies. In `none` mode the frontend talks to the API with no credentials.

Frontend client (`src/lib/utils/persistence-api.ts`): zod-validated list response, 10s request timeout, `PersistenceError` with statusCode. `saveLayoutToServer()` (lines 267-327) requires `layout.metadata.id` UUID; accesses it via a type assertion, i.e. metadata.id is not yet a first-class Layout field on the frontend type.

## Export/Import Flows

- Ctrl+S → `maybeSave()` (`persistence-manager.svelte.ts:236-243`, wired in `src/lib/components/KeyboardHandler.svelte:203-225`): if API available, manual server save; otherwise `handleSaveAsArchive()` which calls `downloadYamlFile()`.
- `downloadYamlFile()` (`src/lib/utils/archive.ts:750-761`): bare YAML via `browser-fs-access` `fileSave()`, native Save As dialog on Chromium (File System Access API), anchor fallback on Firefox/Safari. `downloadArchive()` (lines 718-744) builds a `.Rackula.zip` folder archive (YAML + `assets/` images + metadata) via JSZip. Both throw `AbortError` on user cancel, which `handleSaveAsArchive()` swallows (lines 219-222), so "user cancelled the save dialog" is already distinguishable from "saved", useful for the chip's last-backup bookkeeping.
- browser-fs-access is in `package.json:79` (`^0.38.0`), dynamically imported. Note the spec decision log: no persistent file handle for now, so `fileSave` is used one-shot; the handle it can return is not retained.
- Ctrl+O → `handleLoad()` (`persistence-manager.svelte.ts:255-261`): LoadDialog (server list) when API available, else `loadFromFile()`. `loadFromFile()` (`src/lib/utils/load-pipeline.ts:104-123`) accepts `.yaml` and `.Rackula.zip` via a hidden input picker (`src/lib/utils/file.ts`), extracts with `extractFolderArchive()`, then `finalizeLayoutLoad()` resets images, loads, `markClean()`, `clearSession()`. This is the existing restore-from-file flow the chip popover would invoke.
- Ctrl+E → export dialog (`handleExport`, SVG/PNG/JPEG/PDF/CSV image exports in `src/lib/utils/export.ts`); these are renders, not backups.
- Share URLs (`src/lib/utils/share.ts`): lz-string `compressToEncodedURIComponent` of a MinimalLayout in the URL; decode-only legacy pako path. Loaded at startup priority 1.
- There is no "export all": every save/export path operates on the single current layout. A multi-layout workspace needs a new export-all artifact (likely a multi-layout ZIP).

## Runtime Config Mechanics

- Build-time: `VITE_API_URL` baked into the bundle as `API_BASE_URL`, default `/api` (`src/lib/utils/persistence-config.ts:10`). `__BUILD_ENV__` from `VITE_ENV` (`vite.config.ts:167`) is only used for the window-title prefix. `VITE_BASE_PATH` for GitHub Pages base. There is no runtime config endpoint (no `/config.json`, no injected `window.__RACKULA_CONFIG__`).
- Container runtime: `deploy/docker-entrypoint-wrapper.sh` normalizes `RACKULA_AUTH_MODE` (none|local|oidc), `RACKULA_TRUST_PROXY`, IPv6, `NGINX_RESOLVER`, `API_HOST`/`API_PORT`, then envsubsts `deploy/nginx.conf.template`. All of this configures nginx, none of it reaches the SPA. The frontend discovers the API solely by probing `/api/health` at runtime (`persistence.svelte.ts`, header comment: "This replaces the build-time VITE_PERSIST_ENABLED flag with runtime detection. The same Docker image can now work with or without the API sidecar").
- The one-image constraint (#2008 / spike #1995): Unraid CA installs one container per template; the model is a `rackula` frontend template always installed plus an optional `rackula-api` template. The same `ghcr.io/rackulalives/rackula` image must therefore serve both storage modes, which rules out baking `storage: server` at build time. Natural implementation points for a runtime `storage` flag: (a) extend the entrypoint to envsubst a tiny config endpoint or inject a `<script>`/meta into index.html, (b) have nginx serve a `/config.json` rendered from env (`RACKULA_STORAGE_MODE=browser|server`), or (c) derive it in nginx from whether `API_HOST` is configured. GitHub Pages (d.racku.la) and the static Cloudflare prod (per memory: prod is static-only) have no entrypoint, so the browser build needs a sane no-config default (`storage: browser` when no config endpoint exists).
- nginx already returns deliberate 502/503 from `/api/health` when the sidecar is down ("No fallback - let it fail to signal API unavailability", `nginx.conf.template:101-112`), which under explicit modes becomes a genuine "server down" signal rather than an ambiguity.

## Multi-Tab Handling

Effectively none. The only cross-tab-adjacent code is:

- `visibilitychange`/`beforeunload` flush of the pending localStorage write (`PersistenceEffects.svelte:26-34, 68-77`).
- `beforeunload` confirm dialog when `uiStore.warnOnUnsavedChanges && layoutStore.isDirty` (lines 72-76); the setting is user-toggleable and persisted (`ui.svelte.ts` WARN_UNSAVED_KEY). This is the existing "beforeunload decision" baseline.

No `BroadcastChannel`, no `storage` event listener, no Web Locks, no tab ID. Two same-origin tabs both debounce-write the single `Rackula:autosave` key and (in server mode) both autosave to the same UUID every 2s; last writer wins at both tiers, silently. The twin-tab case the spike must design for is currently unmitigated and undetected.

## Integration Points

For the chip:

- State source: resurrect/export save state from `persistence-manager.svelte.ts` (`_saveStatus`, `_consecutiveSaveFailures`) plus `persistence.svelte.ts` availability; add a "last backup" record (no such record exists; `handleSaveAsArchive`/`downloadYamlFile` success and `markClean()` are the hook points, `AbortError` already distinguishes cancellation).
- Render slot: top-right toolbar region freed by SaveStatus removal (`src/lib/components/Toolbar.svelte`); #1901's reflow lesson says reserve fixed space rather than `{#if}` insert/remove.
- A change-based "recent backup" definition needs a change counter or content hash in `layout.svelte.ts`; today there is only the `isDirty` boolean (line 146).
- "Workspace-wide aggregation across open layouts" has no current substrate: one layout, one autosave key. The chip design must define its state model against the future tabs work (the storage spike deliberately runs first).

For snapshots:

- Server side: add to `saveLayout()` in `api/src/storage/filesystem.ts:448` (copy existing YAML aside before `writeFile` at line 536), or a dedicated route. Must decide interaction with `checkLayoutQuota`'s directory scan (`api/src/storage/quota.ts`) and the guardrails "no retention policy" stance; snapshots inside the layout folder dodge the layout count but could collide with `findYamlInFolder` (`filesystem.ts:515`) if stored as `.yaml` in the folder root, so use a subdirectory (e.g. `{folder}/snapshots/`) or non-YAML extension.
- Trigger condition: the client currently has no way to know it is about to overwrite newer server data; PUT is unconditional. Options: client sends last-known `updatedAt` (If-Unmodified-Since-style) so the server can snapshot on mismatch, or server snapshots unconditionally pre-overwrite with retention N.
- Find/restore UX: LoadDialog (`src/lib/components/LoadDialog.svelte`) lists layouts from `GET /layouts` and is the natural home for surfacing snapshots.

For nudges and messaging:

- Toast system supports persistent toasts, actions, dedup, ARIA role split (`src/lib/stores/toast.svelte.ts`, `Toast.svelte`); nudges with an "Export now" action are a direct fit.
- The toasts to remove/replace per the spec: "Server unavailable, working offline" at `App.svelte:225-231` and `App.svelte:293-299` (gated on `hasEverConnectedToApi()`), and "Server save unavailable, working offline. Use Ctrl+S to retry." at `persistence-manager.svelte.ts:104-109`.
- First-run notice: one-shot flag in localStorage via `safe-storage.ts` helpers, same pattern as `rackula.persistence.apiConnected`.

For storage mode:

- Replace the probe-and-guess in `persistence.svelte.ts` (`initializePersistence`, `hasEverConnectedToApi`) and the `isApiAvailable()` branching in `maybeSave`/`handleLoad` (`persistence-manager.svelte.ts:232-261`) with mode-driven behaviour; in server mode health state means up/down, never "switch to file saves".

## Constraints

- One frontend image must serve both modes (Unraid #2008, LXC, Pages, static CF prod), so storage mode must be runtime-deliverable with a default of `browser` when no config is present; build flags are out.
- localStorage is the only browser persistence in use; the working copy is one slot, JSON, ~5MB quota ceiling shared with UI prefs, and `saveSession` already handles quota failure by returning false silently (`session-storage.ts:109-126`). Multi-layout tabs in browser mode will pressure this; images are not in it at all.
- Server `updatedAt` is filesystem mtime; timestamp comparisons cross machine clocks (`isServerNewer`). Snapshot/LWW design should not assume well-ordered timestamps.
- Quota guardrails (#1780): snapshots must not break `RACKULA_MAX_LAYOUTS` semantics or the create-vs-update skip in `storage-quota-middleware`; pick snapshot placement that the directory-count scan ignores deliberately, and document it.
- Save-indicator decisions (#1901) to preserve: silent autosave, persistent error toasts with Retry and dedup, ARIA role split, no DOM insert/remove reflow in the toolbar.
- Layout YAML PUT body limit is 1MB and asset limit 5MB (guardrails spec); export-all and snapshot payloads live within these.
- `metadata.id` is accessed by type assertion on the frontend (`persistence-api.ts:277-285`); making storage identity first-class likely requires promoting it into the Layout type/schema.
- No backend code paths are shared with the share-URL flow; share remains orthogonal (URL-encoded MinimalLayout).
- API runs on Bun; argon2 and fs usage keep it container-bound (cannot become serverless), consistent with the one-container-everywhere direction in project memory.
