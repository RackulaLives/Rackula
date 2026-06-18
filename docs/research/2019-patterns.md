# Spike #2019 pattern analysis

Synthesis of `2019-codebase.md` and `2019-external.md` into concrete recommendations. Settled decisions (explicit mode, one honest chip, first-run notice, instance-named toast, one user on multiple devices, LWW plus pre-overwrite snapshot, manual export plus nudges, runtime config) are taken as given and not relitigated.

## Key Insights

1. The honest-copy lesson is the strongest external signal. Excalidraw shipped "stored locally in your browser" for years, users lost work to cache clears and the 5 MB ceiling, and the accepted fix (PR #10721) was rewording to "export to files regularly". Rackula's chip copy should never say "saved" in browser mode; it should say where the data is and what makes it safe.
2. Production tools converge on passive persistent indicators, not interruptive nudges (draw.io toolbar notice, VS Code dirty dot plus aggregate badge, Figma alert-only-on-risk). NN/g alert-fatigue research says interruptive nudges train instant dismissal. The chip should carry most of the load; toasts escalate rarely.
3. The codebase has no substrate for "recent backup": only a dirty boolean, no change counter, no record of export events, and exports do not reliably call `markClean()`. Whatever definition we pick requires new state, so we should pick the state that is cheapest and most honest: a counter reset on successful export.
4. Server storage has no versioning at all: `PUT` is an unconditional in-place `writeFile`, no ETag, no If-Match, and the startup LWW silently discards the loser. Snapshots are greenfield; the only constraints are the quota directory scan (`checkLayoutQuota` counts DATA_DIR root entries) and `findYamlInFolder` (must not see snapshot YAML in the folder root).
5. Timestamps cross machine clocks (server `updatedAt` is file mtime, local `savedAt` is browser clock). Any conflict detection should compare server-issued values against server-issued values (echo semantics), never browser clock against server clock.
6. Retention norms in self-hosted tools are small bounded counts (Home Assistant recommends 3, Syncthing defaults 5, Grafana 20), Syncthing-style timestamp-suffix naming, and restore-as-new-version rather than destructive revert (Grafana, Joplin).
7. For twin tabs, full leader election (RxDB-style) is overkill for one localStorage key and whole-document LWW. The `storage` event is a free foreign-write notification; Web Locks can serialize read-modify-write in a few lines if needed.
8. For runtime config, the Unraid-idiomatic and least-fragile pattern is an env var surfaced to the SPA as a synchronous `window.__RACKULA_CONFIG__` script injected by the container entrypoint, with explicit-config-wins over any probe. Static hosts have no entrypoint, so the absent-config default must be `browser`.

## A. Browser-Mode Data Loss

### Nudge cadence and tone

Options considered:

- No nudge, chip only (Excalidraw, tldraw). Documented failure mode: users never export and lose work; Excalidraw's discussion #6463 is a thread of exactly this pain.
- Time-based nudge (every M minutes/days). Nags users who changed nothing; wall-clock cadence is the pattern alert-fatigue research warns against.
- Change-based nudge (N changes since last export). Matches what the app can actually know (export events and mutation counts), scales with real risk, silent when idle.
- Persistent modal or blocking banner. Rejected outright: interruptive, trains dismissal.

Recommendation: the amber chip is the always-on signal; add one non-modal toast nudge that fires when `changesSinceExport` crosses 30, with an "Export now" action and a dismiss. Dismissal snoozes the nudge until the counter crosses the next multiple of 30 (60, 90, ...), persisted in localStorage so reloads do not re-nag. The nudge also fires once on the first edit after the first-run notice session if the user has never exported (cold-start case where 30 changes may take weeks). Tone is factual, no urgency theatre: "This layout lives only in this browser. Export a file to keep a copy." Action: Export.

Rationale: the persistent-passive pattern is the only one with production precedent (draw.io); the toast exists because a chip alone demonstrably fails (Excalidraw). N=30 is roughly a meaningful editing session (device placements, moves, renames each count one); small enough to fire before substantial loss, large enough that a quick tweak does not trigger it. Escalation by re-crossing multiples avoids both one-shot-and-forgotten and every-N-spam.

### Restore-from-file flow

Options considered:

- Reuse Ctrl+O `loadFromFile()` as-is (picker, load, `markClean()`, `clearSession()`). Works today but silently destroys the current working copy.
- Full import wizard with diff/merge. Over-engineered; the app is whole-document LWW by decision.
- Reuse the pipeline, add a guard when the current working copy has unbacked changes.

Recommendation: chip popover action "Restore from file" invokes the existing `loadFromFile()` pipeline (`.yaml` and `.rackula.zip`). If `changesSinceExport > 0`, show a small confirm first: "Replace the layout in this browser? It has changes that are not in any exported file." Buttons: "Export first" (runs export, then continues), "Replace", "Cancel". If the working copy is fully backed up, no confirm, just the picker. Wording in the popover: "Restore from file" with the subtext "Opens a .yaml or .rackula.zip export".

Rationale: the pipeline already exists (`load-pipeline.ts`), restores images from ZIP, and resets state correctly; the only gap is overwrite protection, and a single conditional confirm is the simplest honest guard. "Export first" turns the dangerous moment into the backup moment, which is the only point a modal interruption is justified.

### "Recent backup" definition for chip

Options considered:

- Time-based (exported within X hours/days). Dishonest both ways: a 10-minute-old export can already be stale after heavy editing, and a week-old export of an untouched layout is perfectly current. Also requires a wall clock judgement the app cannot defend.
- Threshold-based green (green while `changesSinceExport <= N` for some N > 0). Lies for up to N changes; "backed up" would be shown while unbacked changes exist, contradicting the settled chip rule (green only when every open layout is in its durable home).
- Exact: green if and only if zero changes since the last successful export.

Recommendation: green means `changesSinceExport === 0`; any unexported change flips amber. N is therefore 1 for the chip (amber at the first unbacked change) and 30 for the nudge (see above): two thresholds, one honest state. Mechanics: add a `changesSinceExport` counter incremented inside `markDirty()` in `layout.svelte.ts` (the single choke point all mutating actions already call), persisted in the localStorage session blob alongside `savedAt` so it survives reload, and reset to 0 only when `fileSave()` resolves without `AbortError` in `downloadYamlFile()`/`downloadArchive()` (cancellation is already distinguishable). Loading a layout from file sets the counter to 0 (the file is the durable home and it matches by construction). Share-URL renders and image exports (Ctrl+E) do not reset it: they are not backups.

Rationale: the spec's green rule is absolute, so any N > 0 for the chip is a contradiction; the fatigue concern that motivates a larger N is handled by the nudge threshold instead. The counter is the cheapest possible mechanism (one integer, one increment site, one reset site) and avoids content hashing entirely. The chip staying amber during active editing is correct: in browser mode the durable home really is out of date.

### beforeunload decision

Options considered:

- Warn whenever `changesSinceExport > 0`. Fires on almost every close (users rarely export before every close), pure habituation, and dishonest: closing the window loses nothing because the working copy is in localStorage.
- Never warn. Loses the one case where data genuinely evaporates: a pending debounced write or an in-flight/failed server save at close time.
- Warn only on genuine in-flight loss risk, attached conditionally.

Recommendation: `beforeunload` warns only when there is real in-flight risk: a pending un-flushed localStorage debounce (rare, since `visibilitychange` flush runs first) or, in server mode, a dirty layout while the server is unreachable or a save is mid-flight. Unbacked-but-persisted changes never trigger it in browser mode. Follow Chrome guidance: attach the listener only while the risk condition holds, remove it as soon as the flush or save completes, and keep flushing on `visibilitychange` as the primary mechanism (mobile never fires `beforeunload`). Keep the existing user toggle (`warnOnUnsavedChanges`) with its current default, but redefine its condition to the risk condition above rather than the raw `isDirty` boolean; users who want a belt-and-braces close prompt can leave it on.

Rationale: custom messages are dead in all browsers and sticky activation already gates the prompt, so the dialog buys very little; the localStorage working copy means close is not a loss event in browser mode. Tying the prompt to actual loss keeps the rare prompt meaningful. The clearing-browser-data loss vector cannot be intercepted by any event; the nudge and first-run notice are the mitigation for that, not `beforeunload`.

## B. Server-Down Recovery

### Snapshot mechanics

Options considered:

- Snapshot on every PUT. The 2s autosave would churn a snapshot every keystroke burst; retention N would hold the last N autosaves of the same editing session, worthless for recovering a divergent copy.
- Client-side snapshots in localStorage. Competes with the 5 MB ceiling, invisible to other devices, and does not survive the cache clear it is meant to guard against.
- Server-side snapshot only when the overwrite is conflicting, detected via an echo timestamp.

Recommendation: snapshots live server-side inside the layout folder at `/data/{Name}-{UUID}/snapshots/{name}~YYYYMMDD-HHMMSS.yaml` (Syncthing naming). The client sends the `updatedAt` it last received from the server as an `If-Unmodified-Since`-style header on every PUT. In `saveLayout()`, if the stored file's `updatedAt` differs from the echoed value (or the header is absent but a file exists with no prior knowledge), copy the existing YAML into `snapshots/` before `writeFile`, then write: LWW is preserved, nothing is rejected, but the losing copy is captured. Keep the 5 most recent automatic snapshots per layout, pruning oldest on write. Snapshot YAML only, not assets (restored snapshots referencing since-deleted images degrade to placeholders, which is acceptable). Discovery and restore: `GET /layouts/:uuid/snapshots` lists them; LoadDialog grows a per-layout "Snapshots" expansion; restoring loads the snapshot into the editor as the working copy, and the next save writes it to the server through the same conflict-detecting path (which snapshots the current server copy in turn). Restore-as-new-write, never in-place revert, per the Grafana/Joplin pattern.

Rationale: the echo comparison compares server time to server time, immune to the clock skew that makes mtime-vs-browser-clock comparisons unsafe. Mismatch-only snapshots mean every snapshot marks a genuine divergence point (the only thing worth recovering under LWW), so a small retention of 5 covers realistic multi-device drift. The `snapshots/` subdirectory is invisible to `checkLayoutQuota` (counts DATA_DIR root entries) and to `findYamlInFolder` (folder root scan) by construction; both exclusions must be stated in the guardrails spec (see Spec Reconciliation). Bound: at most 5 x 1 MB per layout, capped by `RACKULA_MAX_LAYOUTS`, so worst-case disk cost is known.

### Relation to timestamp conflict resolution

Options considered:

- Leave the App.svelte startup `isServerNewer()` compare as-is and bolt snapshots on server-side only. Covers the local-newer-wins direction (the autosave PUT triggers the mismatch snapshot) but the server-newer-wins direction still silently discards the local copy via `clearSession()`.
- Keep the losing local copy in a second localStorage slot. Invisible, single-slot, and lost with the same browser data it distrusts.
- Route both directions through the server snapshot store.

Recommendation: replace the mtime-vs-browser-clock `isServerNewer()` comparison with the echo model: the localStorage session stores the server `updatedAt` it was last synced to (instead of a browser-generated `savedAt` for comparison purposes). At startup, if the session's base `updatedAt` matches the server's current value, the local copy is simply ahead (offline edits): load local and let autosave push it; the PUT will see a matching echo and not snapshot (correct, nothing is lost). If they differ, the copies genuinely diverged: keep LWW by recency as today, but before discarding the local copy (server-newer-wins), POST it to `POST /layouts/:uuid/snapshots` so it lands in the same snapshot store; in the other direction the conflicting PUT snapshots the server copy automatically. Both losers end up findable in one place (LoadDialog snapshots). The "Loaded unsaved local changes" and "Loaded from server" toasts stay, with the losing-copy toast gaining "Previous copy saved as a snapshot".

Additionally, stop calling `clearSession()` after successful server saves (Effect 2): keep the localStorage working copy in server mode, stamped with the server-echoed `updatedAt`. This is what makes server-down continuity seamless (edits keep landing in localStorage; reconnection pushes them through the snapshot-protected PUT) and it is what the parent spec's three-tier model already describes (browser tier is the live working copy in both modes).

Rationale: the existing compare is the weakest link (clock skew plus silent discard); the echo model removes the skew and the snapshot store removes the silence, without adding merge UX. One snapshot home for both directions keeps find-and-restore to a single UI.

### Twin-tab case

Options considered:

- Full leader election (Web Locks leader plus BroadcastChannel fan-out, RxDB-style). Solves a collaboration problem the app does not have; the concurrency target is one user, and the failure today is silent clobbering, not lack of live sync.
- Do nothing (status quo). Two tabs ping-pong overwrite `Rackula:autosave` every second and the same server UUID every 2s, silently; the chip would also lie in the stale tab.
- Detect-and-pause: foreign-write detection via the `storage` event, pause the stale tab.

Recommendation: detect-and-pause. Stamp each session write with a per-tab id (random, generated at startup). Each tab listens for the `storage` event on the autosave key; when a write from another tab id arrives, the receiving tab pauses its autosave effects (both localStorage and server) and shows one toast: "This layout is open in another tab, which now has the latest changes." with a "Reload this tab" action that re-reads the working copy and resumes. Wrap the session read-modify-write in `navigator.locks.request('rackula:autosave', fn)` where available so two near-simultaneous debounce flushes cannot interleave; without Web Locks the tab-id check alone still prevents silent ping-pong. No BroadcastChannel, no leader election, no live mirroring.

Rationale: this is roughly 30 lines, zero dependencies, and converts the worst outcome (two tabs alternately destroying each other's work at both tiers, forever, invisibly) into an explicit single-toast state. It is also consistent with the settled multi-device answer: the second tab behaves like a second device that has voluntarily gone read-only. The server-side mismatch snapshot still backstops the case where both tabs raced a PUT before detection.

## C. Mode Mechanics

### Setting storage mode

Options considered:

- Auto-detect by probing `/api/health` (status quo plus `hasEverConnectedToApi`). This is exactly the ambiguity the parent spec kills: a down server is indistinguishable from no server, so the app silently degrades to browser-mode messaging while the user believes the server holds their data.
- `config.json` fetched at boot. Works, but adds a blocking fetch before mount and a no-cache serving footgun; strictly more moving parts than a synchronous global.
- envsubst over built bundles. Most fragile (bundle paths, stray `$`), rejected.
- Entrypoint-injected `window.__RACKULA_CONFIG__` script, explicit env var, absent means browser.

Recommendation: a single env var `RACKULA_STORAGE_MODE=browser|server` read by the container entrypoint, which writes `/usr/share/nginx/html/config.js` containing `window.__RACKULA_CONFIG__ = { storage: "server" }` (idiomatic `/docker-entrypoint.d/` script) and injects/maintains a `<script src="config.js">` tag ahead of the bundle in index.html at container start. The app reads `window.__RACKULA_CONFIG__?.storage ?? "browser"`. Static hosts (GitHub Pages, Cloudflare prod) ship no config script and therefore default to browser mode with zero configuration. The image default is `browser`; the LXC build, docker-compose with the API sidecar, and the Unraid `rackula` template (when paired with `rackula-api`) set `server`. Explicit config always wins; no probe-based fallback between modes. Delete `hasEverConnectedToApi` and the probe-and-guess in `persistence.svelte.ts`; in server mode the health check means up/down, never "switch to file saves".

Rationale: synchronous global, no fetch race, no cache headers to get wrong, and env vars are exactly what Unraid CA templates surface as form fields (spike #1995). The data-safety framing of this spike is the decider: only explicit mode lets the app honestly say "server unreachable, changes held in this browser" instead of quietly becoming a different product.

### Server build first load

Options considered:

- Keep the current four-step priority with probe and StartScreen. Contradicts explicit mode and the parent spec's StartScreen removal.
- Mode-driven startup.

Recommendation: in server mode, on first load: check `/api/health` once (the nginx deliberate 502/503 makes down unambiguous). If up: fetch the layout list; if the list is empty (true first run), create a new untitled layout and let autosave establish it on the server, no StartScreen; otherwise open the most recently updated layout, reconciled against any localStorage working copy via the echo comparison from section B. If down: load the localStorage working copy if present (else a new empty layout), show the red "<instance> unreachable" chip state and the single instance-named toast, keep autosaving locally, and poll health for the quiet recovery toast. Share-URL remains priority one in both modes. In browser mode, first load shows the one-time first-run notice and loads the working copy or a new layout; the API code paths are never consulted.

Rationale: every branch is now a statement of fact rather than a guess; server-down on first load becomes a continuity story (local working copy plus honest red state) instead of a silent identity change.

### Export-all and backup framing per mode

Options considered:

- One shared "Export" wording for both modes. Misses the point that the same artifact is a backup in one mode and a convenience copy in the other.
- Mode-specific framing over one shared mechanism.

Recommendation: one artifact, two framings. Build export-all as a ZIP (`rackula-export-YYYYMMDD-HHMMSS.zip`) containing each layout's existing folder-archive form (YAML plus assets), reusing `downloadArchive()` mechanics; with a single layout open it degrades to today's single-layout archive. In browser mode the chip popover labels it "Back up all layouts" and a successful run resets `changesSinceExport` for every included layout (this is what turns the chip green). In server mode the popover labels it "Export a copy" with subtext "Your layouts are stored on <instance>; this makes a portable copy", and it never affects chip state (green comes from server sync, not exports). In server mode export-all pulls authoritative YAML from `GET /layouts` rather than browser state, so the copy matches the durable home.

Rationale: the chip's green rule defines what counts as backup per mode, so the wording must follow it; identical mechanics with different labels is the minimum that stays honest. Automatic snapshots are deliberately excluded from export-all (they are recovery plumbing, not documents).

## Spec Reconciliation

Save-indicator spec (#1901, `2026-06-04-save-indicator-design.md`):

- Contradiction: #1901 removed the visible SaveStatus surface; the chip reintroduces a visible, persistent save-state surface and needs `_saveStatus` exported again.
- Resolution: amend the #1901 decision record to state that the chip supersedes the "toasts only, no persistent indicator" visual decision, while these #1901 decisions stand unchanged: autosave success is silent (the chip changes state, it does not toast), manual Ctrl+S keeps its success toast, save failures remain persistent toasts with Retry and dedup, ARIA role split stays, and the toolbar reserves fixed space for the chip (the #1901 reflow lesson). The chip replaces, rather than adds to, the two "working offline" toasts being deleted (`App.svelte:225-231, 293-299`, `persistence-manager.svelte.ts:104-109`).

Storage-abuse-guardrails spec (#1780, `2026-06-02-storage-abuse-guardrails-design.md`):

- Contradiction 1: "no retention or cleanup policy: the quota cap IS the guardrail" versus snapshot pruning (keep 5, delete oldest).
- Resolution: amend the guardrails spec to scope the no-retention stance to user layouts. Automatic pre-overwrite snapshots are system artifacts with a fixed bound (5 per layout, YAML only), which preserves the spirit of the stance: the bound is still a hard cap, not a background cleanup job over user data. Worst-case disk impact is quantifiable (5 x 1 MB x RACKULA_MAX_LAYOUTS).
- Contradiction 2: quota counts directories under /data; snapshots add stored objects.
- Resolution: snapshots live in `{layout-folder}/snapshots/`, which the DATA_DIR root scan never sees, so `RACKULA_MAX_LAYOUTS` semantics are untouched; document this exclusion explicitly in the guardrails spec so a future quota refactor does not accidentally start counting them. The non-root placement also keeps `findYamlInFolder()` safe. The create-vs-update skip in `storage-quota-middleware` is unaffected (snapshot writes happen inside an update of an existing UUID).
- New surface to note in the guardrails spec: `POST /layouts/:uuid/snapshots` (client uploads a losing local copy) is a write endpoint and must sit behind the same writeAuth and body-limit middleware as `PUT /layouts/:uuid`, and count against the per-layout snapshot bound of 5.

Parent epic spec (minor): it describes the browser tier as the live working copy in both modes, but Effect 2 currently deletes the localStorage copy after each successful server save. The recommendation in section B (keep the working copy, stamp it with the server echo) resolves the code toward the spec; flag it in the implementation plan as a behavioural change to `persistence-manager.svelte.ts`.

## Trade-offs Summary

| Decision | Chosen | Accepted cost |
| --- | --- | --- |
| Nudge | Chip-first, toast at 30-change multiples | Users who ignore both can still lose data; no nudge can stop a cache clear |
| Chip green | Strict zero changes since export | Chip is amber during normal editing; honesty over comfort |
| Backup state | Single counter in `markDirty()` | Counts changes, not magnitude; an undo back to exported state still shows amber |
| beforeunload | Only on in-flight loss risk | No prompt for unbacked-but-persisted changes; nudges carry that load |
| Snapshots | Server-side, mismatch-only, keep 5, YAML only | No asset snapshots; offline-only browser mode gets no snapshot tier at all |
| Conflict detection | Server-echo updatedAt header | Adds one header and one comparison to PUT; no full ETag machinery |
| Twin tabs | Detect-and-pause via storage event plus Web Locks | Stale tab goes passive until reload; no live cross-tab sync |
| Mode config | `RACKULA_STORAGE_MODE` env to injected `window.__RACKULA_CONFIG__` | Mode is fixed at container start; changing it needs a restart (acceptable for self-hosting) |
| Export-all | One ZIP artifact, mode-specific framing | Server-mode export-all does N+1 API requests; fine at 100-layout cap |

Every recommendation builds on an existing mechanism (markDirty, fileSave AbortError, load-pipeline, LoadDialog, toast store, entrypoint wrapper, layout folders) rather than introducing new infrastructure; the only new server surface is the snapshots subdirectory, its list/restore routes, and one request header.
