# Spike #2019: Storage Model and Data Safety

**Date:** 2026-06-10 **Parent Epic:** #2017 **Spec:** docs/superpowers/specs/2026-06-09-canvas-ux-overhaul-design.md

## Executive Summary

This spike resolves the three storage questions the canvas UX overhaul spec delegated.

Browser-mode data loss. The chip is the always-on signal and is strictly honest: green only when zero changes exist since the last successful file export, tracked by a new `changesSinceExport` counter. One non-modal toast nudge fires at 30-change multiples with an Export action and a persisted snooze. Restore-from-file reuses the existing load pipeline with a single confirm when unbacked changes would be replaced. `beforeunload` warns only on genuine in-flight loss risk, never on unbacked-but-persisted changes.

Server-down recovery. Pre-overwrite snapshots live server-side in a `snapshots/` subdirectory of each layout folder, created only when a PUT's echoed `updatedAt` does not match the stored copy (a genuine divergence), keeping the 5 most recent. The startup timestamp comparison moves from mtime-versus-browser-clock to server-echo semantics, and the localStorage working copy is kept (not cleared) after server saves. Twin tabs are handled by detect-and-pause via the `storage` event plus a per-tab id, with Web Locks serialising writes where available.

Mode mechanics. Storage mode is an explicit env var, `RACKULA_STORAGE_MODE=browser|server`, injected by the container entrypoint as a synchronous `window.__RACKULA_CONFIG__` script. Absent config means browser mode, which is what static hosts get for free. The probe-and-guess machinery (`hasEverConnectedToApi`) is deleted. Server-mode first load is mode-driven with no StartScreen, and export-all is one ZIP artifact with mode-specific framing: a backup in browser mode (resets the chip), a portable copy in server mode.

## Recommendations

### Nudge cadence and tone

Decision. The amber chip carries the always-on signal. One non-modal toast nudge fires when `changesSinceExport` crosses 30, with an "Export now" action and a dismiss. Dismissal snoozes until the counter crosses the next multiple of 30 (60, 90, and so on), persisted in localStorage so reloads do not re-nag. The nudge also fires once on the first edit after the first-run notice if the user has never exported. Tone is factual: "This layout lives only in this browser. Export a file to keep a copy."

Mechanics. Counter increments in `markDirty()`; nudge threshold checked there; snooze state in localStorage via the existing `safe-storage.ts` helpers; toast uses the existing action and dedup support in the toast store.

Alternatives considered. No nudge at all (Excalidraw, tldraw): documented failure mode, users lose work. Time-based nudges: nag people who changed nothing. Modal or blocking banner: trains instant dismissal.

Rationale. The persistent-passive pattern is the only one with production precedent (draw.io); the toast exists because a chip alone demonstrably fails (Excalidraw discussion #6463). N=30 approximates a meaningful editing session. Escalation by re-crossing multiples avoids both one-shot-and-forgotten and every-N spam.

### Restore-from-file flow

Decision. The chip popover gains a "Restore from file" action that invokes the existing `loadFromFile()` pipeline (`.yaml` and `.rackula.zip`). If `changesSinceExport > 0`, a small confirm appears first: "Replace the layout in this browser? It has changes that are not in any exported file." Buttons: "Export first" (runs export, then continues), "Replace", "Cancel". If the working copy is fully backed up, no confirm, just the picker.

Alternatives considered. Reusing Ctrl+O as-is silently destroys the working copy. A full import wizard with diff or merge is over-engineered for a whole-document LWW app.

Rationale. The pipeline already exists, restores images from ZIP, and resets state correctly; the only gap is overwrite protection. "Export first" turns the dangerous moment into the backup moment, the one point where a modal interruption is justified.

### "Recent backup" chip definition

Decision. Green means `changesSinceExport === 0`. Any unexported change flips the chip amber. The chip threshold is therefore 1 and the nudge threshold 30: two thresholds, one honest state.

Mechanics. A `changesSinceExport` counter is incremented inside `markDirty()` in `layout.svelte.ts` (the single choke point all mutating actions call), persisted in the localStorage session blob alongside `savedAt`, and reset to 0 only when `fileSave()` resolves without `AbortError` in `downloadYamlFile()` or `downloadArchive()`. Loading a layout from file sets the counter to 0. Share-URL renders and image exports (Ctrl+E) do not reset it: they are not backups.

Alternatives considered. Time-based (exported within X hours) is dishonest both ways: a 10-minute-old export can be stale after heavy editing, and a week-old export of an untouched layout is current. Threshold-based green (green while changes <= N for N > 0) contradicts the spec's rule that green means every open layout is in its durable home.

Rationale. The spec's green rule is absolute, so any N > 0 for the chip is a lie; the fatigue concern that motivates a larger N is handled by the nudge threshold instead. The counter is the cheapest possible mechanism: one integer, one increment site, one reset site, no content hashing.

### beforeunload

Decision. `beforeunload` warns only on genuine in-flight loss risk: a pending un-flushed localStorage debounce, or in server mode a dirty layout while the server is unreachable or a save is mid-flight. Unbacked-but-persisted changes never trigger it in browser mode. The listener is attached only while the risk condition holds and removed once the flush or save completes. `visibilitychange` flush remains the primary persistence mechanism. The existing `warnOnUnsavedChanges` toggle stays, redefined to gate the risk condition rather than the raw `isDirty` boolean.

Alternatives considered. Warning whenever `changesSinceExport > 0` fires on almost every close and is dishonest (closing loses nothing; the working copy is in localStorage). Never warning loses the one case where data genuinely evaporates.

Rationale. Custom messages are dead in all browsers, sticky activation already gates the prompt, and mobile never fires `beforeunload` (Chrome's guidance: `visibilitychange` to hidden is the last reliable save point). The clearing-browser-data loss vector cannot be intercepted by any event; the nudge and first-run notice mitigate that, not `beforeunload`.

### Snapshot mechanics

Decision. Snapshots are server-side, stored inside the layout folder at `/data/{Name}-{UUID}/snapshots/{name}~YYYYMMDD-HHMMSS.yaml` (Syncthing naming). The client sends the `updatedAt` it last received from the server as an If-Unmodified-Since-style header on every PUT. In `saveLayout()`, if the stored file's `updatedAt` differs from the echoed value, the existing YAML is copied into `snapshots/` before the write. LWW is preserved, nothing is rejected, but the losing copy is captured. Retention is the 5 most recent automatic snapshots per layout, pruned on write. Snapshots are YAML only, no assets. Discovery and restore: `GET /layouts/:uuid/snapshots` lists them, LoadDialog grows a per-layout snapshots expansion, and restoring loads the snapshot into the editor as the working copy. The next save writes it through the same conflict-detecting path, which snapshots the current server copy in turn: restore-as-new-write, never in-place revert.

Alternatives considered. Snapshot on every PUT: the 2s autosave would churn snapshots every keystroke burst, and retention N would hold N autosaves of one session, worthless for recovering a divergent copy. Client-side snapshots in localStorage: competes with the 5 MB ceiling, invisible to other devices, and does not survive the cache clear it guards against.

Rationale. The echo comparison compares server time to server time, immune to the clock skew that makes mtime-versus-browser-clock unsafe. Mismatch-only snapshots mean every snapshot marks a genuine divergence point, so retention of 5 covers realistic multi-device drift (bounded counts of 3 to 20 are the self-hosted norm: Home Assistant 3, Syncthing 5, Grafana 20). The `snapshots/` subdirectory is invisible to `checkLayoutQuota` and `findYamlInFolder` by construction. Worst-case disk cost is known: 5 x 1 MB per layout, capped by `RACKULA_MAX_LAYOUTS`.

### Relation to timestamp conflict resolution

Decision. Replace the `isServerNewer()` mtime-versus-browser-clock comparison with echo semantics: the localStorage session stores the server `updatedAt` it was last synced to. At startup, if the session's base `updatedAt` matches the server's current value, the local copy is simply ahead (offline edits): load local and let autosave push it; the PUT sees a matching echo and does not snapshot. If they differ, the copies genuinely diverged: keep LWW by recency, but before discarding a losing local copy, POST it to `POST /layouts/:uuid/snapshots` so both directions land in the same snapshot store. The losing-copy toast gains "Previous copy saved as a snapshot". Additionally, stop calling `clearSession()` after successful server saves: keep the localStorage working copy in server mode, stamped with the server-echoed `updatedAt`.

Alternatives considered. Bolting snapshots onto the server side only leaves the server-newer-wins direction silently discarding the local copy. A second localStorage slot for the loser is invisible and lost with the same browser data it distrusts.

Rationale. The existing compare is the weakest link (clock skew plus silent discard); the echo model removes the skew and the snapshot store removes the silence, without merge UX. Keeping the working copy is also what the parent spec's three-tier model already describes and is what makes server-down continuity seamless.

### Twin-tab case

Decision. Detect-and-pause. Each session write is stamped with a per-tab id (random, generated at startup). Each tab listens for the `storage` event on the autosave key; when a write from another tab id arrives, the receiving tab pauses its autosave effects (both localStorage and server) and shows one toast: "This layout is open in another tab, which now has the latest changes." with a "Reload this tab" action that re-reads the working copy and resumes. The session read-modify-write is wrapped in `navigator.locks.request('rackula:autosave', fn)` where available; without Web Locks the tab-id check alone still prevents silent ping-pong. No BroadcastChannel, no leader election, no live mirroring.

Alternatives considered. Full leader election (RxDB-style Web Locks leader plus BroadcastChannel fan-out) solves a collaboration problem the app does not have. Doing nothing leaves two tabs alternately destroying each other's work at both tiers, forever, invisibly.

Rationale. Roughly 30 lines, zero dependencies, converts the worst silent failure into an explicit single-toast state. The second tab behaves like a second device that has voluntarily gone read-only, consistent with the settled multi-device answer. The server-side mismatch snapshot still backstops a pre-detection PUT race.

### Setting storage mode

Decision. A single env var `RACKULA_STORAGE_MODE=browser|server` is read by the container entrypoint, which writes `/usr/share/nginx/html/config.js` containing `window.__RACKULA_CONFIG__ = { storage: "server" }` (idiomatic `/docker-entrypoint.d/` script) and ensures a `<script src="config.js">` tag loads ahead of the bundle. The app reads `window.__RACKULA_CONFIG__?.storage ?? "browser"`. Static hosts ship no config script and default to browser mode with zero configuration. Explicit config always wins; there is no probe-based fallback between modes. `hasEverConnectedToApi` and the probe-and-guess in `persistence.svelte.ts` are deleted; in server mode the health check means up or down, never "switch to file saves".

Alternatives considered. Auto-detect by probing `/api/health` is exactly the ambiguity the spec kills: a down server is indistinguishable from no server. A fetched `config.json` adds a blocking request and a no-cache serving footgun. envsubst over built bundles is the most fragile option.

Rationale. A synchronous global has no fetch race and no cache headers to get wrong, and env vars are exactly what Unraid CA templates surface as form fields (spike #1995). The data-safety framing is the decider: only explicit mode lets the app honestly say "server unreachable, changes held in this browser" instead of quietly becoming a different product.

### Server build first load

Decision. In server mode, first load checks `/api/health` once (nginx's deliberate 502/503 makes down unambiguous). If up: fetch the layout list; if empty (true first run), create a new untitled layout and let autosave establish it, no StartScreen; otherwise open the most recently updated layout, reconciled against any localStorage working copy via the echo comparison. If down: load the localStorage working copy if present (else a new empty layout), show the red unreachable chip state and the single instance-named toast, keep autosaving locally, and poll health for the quiet recovery toast. Share-URL remains priority one in both modes. In browser mode, first load shows the one-time first-run notice and never consults the API code paths.

Alternatives considered. Keeping the current four-step probe-driven priority contradicts explicit mode and the spec's StartScreen removal.

Rationale. Every branch becomes a statement of fact rather than a guess; server-down on first load becomes a continuity story instead of a silent identity change.

### Export-all framing per mode

Decision. One artifact, two framings. Export-all builds a ZIP (`rackula-export-YYYYMMDD-HHMMSS.zip`) containing each layout's existing folder-archive form (YAML plus assets), reusing `downloadArchive()` mechanics; with a single layout open it degrades to today's single-layout archive. In browser mode the chip popover labels it "Back up all layouts" and a successful run resets `changesSinceExport` for every included layout. In server mode it is labelled "Export a copy" with subtext "Your layouts are stored on <instance>; this makes a portable copy", never affects chip state, and pulls authoritative YAML from `GET /layouts` rather than browser state. Automatic snapshots are excluded from export-all.

Alternatives considered. One shared wording misses that the same artifact is a backup in one mode and a convenience copy in the other.

Rationale. The chip's green rule defines what counts as backup per mode, so the wording must follow it; identical mechanics with different labels is the minimum that stays honest.

## Technical Findings

Condensed from docs/research/2019-codebase.md.

Current persistence. One localStorage slot (`Rackula:autosave`) holding `{ layout, savedAt }` JSON; no IndexedDB. Autosave is a 1s debounced localStorage write plus a 2s debounced server save gated by a circuit breaker (3 failures), with 30s health polling while offline. After a successful server save the localStorage copy is deleted (`clearSession()`), which contradicts the spec's three-tier model and changes under this spike. Dirty tracking is a single `isDirty` boolean in `layout.svelte.ts`; there is no change counter and no record of export events, so the chip's backup state requires new state. Save status exists internally (`_saveStatus`) but renders nowhere since #1901.

Startup and conflicts. Startup priority is share URL, then a probe-driven branch between server list and local session using `isServerNewer()`, which compares server file mtime against the browser clock and silently discards the loser. API availability is a runtime probe plus a `hasEverConnectedToApi` localStorage flag, the exact guess-from-history the spec removes.

Server storage. Bun and Hono on a plain filesystem under DATA_DIR. `PUT /layouts/:uuid` is an unconditional in-place `writeFile`: no ETag, no If-Match, no versioning, no backups. Snapshots are greenfield. Quota guardrails (#1780) count DATA_DIR root entries (`RACKULA_MAX_LAYOUTS`, default 100) and skip the check on updates of an existing UUID. Layout YAML body limit is 1 MB.

Multi-tab. Effectively nothing: no `storage` listener, no tab id, no locks. Two tabs silently ping-pong both the localStorage key and the server UUID.

Runtime config. `VITE_API_URL` is baked at build time; the entrypoint configures nginx only and nothing reaches the SPA. There is no config endpoint. The one-image constraint (Unraid #2008, LXC, Pages, static Cloudflare prod) rules out build-time mode flags and requires a sane no-config default of browser.

What must change. `persistence-manager.svelte.ts` (keep working copy, echo stamping, pause-on-foreign-write, beforeunload condition), `layout.svelte.ts` (counter in `markDirty()`), `session-storage.ts` (tab id, base `updatedAt`, counter in blob, delete `isServerNewer()`), `persistence.svelte.ts` (mode-driven, delete probe-and-guess), `App.svelte` (mode-driven startup), `archive.ts` (counter reset, export-all), `api/src/storage/filesystem.ts` and `api/src/routes/layouts.ts` (echo header, snapshot write, snapshot routes), `deploy/docker-entrypoint-wrapper.sh` and the nginx image setup (config.js injection), LoadDialog (snapshots), and the chip itself (new component plus re-exported save state).

## External Research Highlights

Condensed from docs/research/2019-external.md.

- Honest copy is the strongest signal. Excalidraw shipped "stored locally in your browser" for years, users lost work to cache clears and the 5 MB localStorage ceiling (issues #8395, #10664), and the accepted fix (PR #10721) was rewording to "export to files regularly". Browser-mode copy must never say "saved".
- Production tools converge on passive persistent indicators, not interruptive nudges: draw.io's toolbar "Unsaved changes" notice, VS Code's dirty dot plus aggregate badge, Figma's alert-only-on-risk. NN/g alert-fatigue research: interruptive nudges train instant dismissal.
- beforeunload custom messages are ignored by all browsers; Chrome and Firefox require sticky activation; mobile kills background tabs without firing it. Chrome guidance: attach the listener only while unsaved changes exist, and treat `visibilitychange` to hidden as the last reliable save point (developer.chrome.com Page Lifecycle API).
- Snapshot retention norms are small bounded counts (Home Assistant recommends 3, Syncthing defaults 5, Grafana 20), timestamp-suffix file naming (Syncthing `~yyyymmdd-hhmmss`), and restore-as-new-version rather than destructive revert (Grafana, Joplin).
- For multi-tab, Web Locks (broad support since 2022) plus the `storage` event cover the single-key LWW case in about 30 lines; full leader election (RxDB, Yjs, Replicache) is for apps with live sync, which this is not.
- For runtime SPA config, the entrypoint-written `window.__CONFIG__` script is the idiomatic nginx-container pattern (synchronous, no fetch race); env vars are the configuration surface Unraid CA templates expose as form fields.

## Spec Reconciliation

Save-indicator spec (#1901, docs/superpowers/specs/2026-06-04-save-indicator-design.md):

- What it said: removed the visible SaveStatus surface; all save feedback is toasts; autosave silent; failures are persistent toasts with Retry and dedup.
- What changes: the storage chip reintroduces a visible persistent save-state surface, reversing the visual half of #1901, and needs the internal `_saveStatus` exported again.
- Resolution: amend the #1901 decision record to state the chip supersedes the "toasts only, no persistent indicator" decision. Standing unchanged: silent autosave (the chip changes state, it does not toast), the manual Ctrl+S success toast, persistent failure toasts with Retry and dedup, the ARIA role split, and reserving fixed toolbar space (the #1901 reflow lesson). The chip replaces the two "working offline" toasts being deleted (App.svelte:225-231, 293-299; persistence-manager.svelte.ts:104-109).

Storage-abuse-guardrails spec (#1780, docs/superpowers/specs/2026-06-02-storage-abuse-guardrails-design.md):

- What it said: server quotas (`RACKULA_MAX_LAYOUTS`, `RACKULA_MAX_ASSETS_PER_LAYOUT`) with no retention or cleanup policy ("the quota cap IS the guardrail"); quota counts DATA_DIR root entries; updates of an existing UUID skip the check.
- What changes: snapshots add stored objects and a bounded prune (keep 5, delete oldest), plus a new write endpoint (`POST /layouts/:uuid/snapshots`).
- Resolution: amend the guardrails spec to scope the no-retention stance to user layouts. Automatic pre-overwrite snapshots are system artifacts with a fixed bound (5 per layout, YAML only), preserving the spirit: a hard cap, not a background cleanup job over user data. Document explicitly that `{layout-folder}/snapshots/` is excluded from the `RACKULA_MAX_LAYOUTS` directory scan and from `findYamlInFolder()`, so a future quota refactor does not start counting them. The new snapshot POST endpoint sits behind the same writeAuth and body-limit middleware as `PUT /layouts/:uuid` and counts against the per-layout bound of 5. The create-versus-update quota skip is unaffected.

Parent epic spec (minor): it describes the browser tier as the live working copy in both modes, but the code deletes the localStorage copy after each server save. This spike resolves the code toward the spec (keep the working copy, stamped with the server echo); flag it as a behavioural change to `persistence-manager.svelte.ts` in the implementation plan.

## Implementation Phases

Ordered for decomposition into GitHub issues. Sizes: small (under half a day), medium (about a day), large (multiple days). Phases 1 and 2 are independent of each other; everything else depends on at least one of them as noted.

### Phase 1: change counter and chip state plumbing (frontend)

1. Add `changesSinceExport` counter to `layout.svelte.ts` (increment in `markDirty()`), persist it in the session blob in `session-storage.ts`, reset on successful `fileSave()` (non-AbortError) in `archive.ts` and on file load. Small.
2. Re-export save state from `persistence-manager.svelte.ts` (status, failures) plus the new backup state as the chip's data source. Small.
3. Build the storage chip component (states, labels, popover shell with facts and action slots) in the reserved toolbar slot. Medium. Depends on 1 and 2.

### Phase 2: runtime config injection and explicit mode (frontend, api/deploy)

4. Entrypoint writes `config.js` from `RACKULA_STORAGE_MODE` and index.html loads it ahead of the bundle; image default browser; LXC, compose, and Unraid server-mode wiring. Medium. Deploy.
5. Frontend reads `window.__RACKULA_CONFIG__?.storage ?? "browser"`; delete `hasEverConnectedToApi` and probe-and-guess in `persistence.svelte.ts`; mode-driven branching in `maybeSave` and `handleLoad`. Medium. Frontend.
6. Mode-driven startup in `App.svelte`: browser-mode path with first-run notice, server-mode path with health check, empty-list first run, server-down continuity; remove the two "working offline" toasts; add the instance-named drop and recovery toasts. Medium. Frontend. Depends on 5; full conflict handling lands in Phase 4.

### Phase 3: nudges and restore flow (frontend)

7. Backup nudge: threshold-30 toast with Export action, persisted snooze at multiples, never-exported cold-start case. Small. Depends on Phase 1.
8. Restore-from-file popover action: `loadFromFile()` behind the conditional confirm with Export first, Replace, Cancel. Small. Depends on Phase 1 (counter) and 3 (popover).
9. beforeunload rework: attach conditionally on in-flight risk only, redefine the `warnOnUnsavedChanges` condition, keep `visibilitychange` flush. Small.

### Phase 4: server snapshots and echo-based conflict detection (api, frontend)

10. API: accept the echoed `updatedAt` header on PUT; on mismatch copy the existing YAML to `{folder}/snapshots/{name}~YYYYMMDD-HHMMSS.yaml` before write; prune to 5. Medium. API.
11. API: `GET /layouts/:uuid/snapshots` (list) and `POST /layouts/:uuid/snapshots` (client uploads a losing local copy), behind writeAuth and body limits. Medium. API. Depends on 10.
12. Frontend: store the server-echoed `updatedAt` in the session blob, send it on PUT, stop calling `clearSession()` after server saves. Medium. Depends on 10.
13. Frontend: replace `isServerNewer()` startup comparison with the echo model; POST the losing local copy to the snapshot endpoint before discarding; update toasts. Medium. Depends on 11 and 12.
14. Frontend: LoadDialog snapshots expansion with restore-as-working-copy. Medium. Depends on 11.
15. Guardrails spec amendment (#1780 doc) and #1901 decision-record amendment per Spec Reconciliation. Small. Docs.

### Phase 5: twin-tab guard (frontend)

16. Per-tab id stamped into session writes; `storage`-event foreign-write detection; pause autosave effects; "open in another tab" toast with Reload action; Web Locks wrap around the session read-modify-write. Medium. Independent of Phases 2 to 4; touches the same autosave effects as 12, so sequence after Phase 4 to avoid churn.

### Phase 6: export-all (frontend)

17. Multi-layout ZIP via `downloadArchive()` mechanics; browser-mode "Back up all layouts" with per-layout counter reset; server-mode "Export a copy" pulling YAML from `GET /layouts`. Medium. Depends on Phase 1 (counter reset) and Phase 2 (mode framing). Until the tabs work lands, "all layouts" degrades to the single open layout in browser mode and the server list in server mode.
