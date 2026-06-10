# Spike #2019 external research

Research date: 2026-06-10. Sources: WebSearch + WebFetch (both available).

## Backup Nudge Patterns

What comparable local-first tools actually do:

- Excalidraw: no proactive backup nudge at all. It autosaves to localStorage/IndexedDB and shows a static "All your data is stored locally in your browser" notice. This has caused real pain: users hit the ~5 MB localStorage ceiling and silently lose work ([issue #8395](https://github.com/excalidraw/excalidraw/issues/8395)), and a long discussion thread exists of users frustrated there is no save reminder on exit ([discussion #6463](https://github.com/excalidraw/excalidraw/discussions/6463)). Issue [#10664](https://github.com/excalidraw/excalidraw/issues/10664) argued the message was misleading (browser storage is clearable by updates, cache clears, etc.) and was closed via PR #10721 rewording it to warn users to export to files regularly. Lesson: the absence of a nudge is itself a documented failure mode, and honest copy about storage fragility was the accepted fix.
- draw.io: avoids the problem by forcing a storage decision up front. First-run dialog asks where to store the file (device, Google Drive, OneDrive, browser); choosing browser storage shows an explicit warning that it can be cleared. After that, a persistent "Unsaved changes. Click here to save" notification sits in the toolbar rather than popping up modals ([drawio blog: choose where to store your diagram files](https://www.drawio.com/blog/save-diagram-files)).
- tldraw: autosaves to IndexedDB via `persistenceKey` and does not nudge. Its docs treat "unsaved changes" as an app-developer concern, with an official example that enables a Save button only while the document is dirty ([tldraw unsaved changes example](https://tldraw.dev/examples/unsaved-changes), [persistence docs](https://tldraw.dev/docs/persistence)).
- Obsidian-style apps sidestep this entirely because the durable copy is a plain file on disk; there is nothing to nudge about. This is the contrast case: nudges only exist where the working copy is more durable-looking than it really is.

Cadence and nudge fatigue:

- There is no published standard for change-count vs time-based export nudges; products either nudge never (Excalidraw, tldraw) or show a persistent passive indicator (draw.io). The persistent-passive pattern is the one with real production precedent.
- UX research on notification fatigue is consistent: high frequency is the top usability complaint, interruptive nudges train users to dismiss instantly, and habituation transfers to future (legitimate) alerts ([NN/g, Alert Fatigue in User Interfaces](https://www.nngroup.com/videos/alert-fatigue-user-interfaces/), [Smashing Magazine 2025 notification guidelines](https://www.smashingmagazine.com/2025/07/design-guidelines-better-notifications-ux/)). Recommended mitigations: snooze/mute controls, context-aware timing (do not interrupt mid-task), and escalating only on genuine risk signals ([signal detection theory in UX](https://www.ux-bulletin.com/signal-detection-theory-in-ux/)).
- Practical synthesis for Rackula browser-mode: a passive, always-visible status chip (see next section) plus a soft nudge gated on meaningful deltas (N changes or M minutes of edits since last export, whichever first) is defensible; a wall-clock-only timer nags people who did nothing. Any nudge needs one-click dismiss and a snooze that persists, and should never be modal.

## Status Indicator Patterns

Two opposing philosophies in production:

- Google Docs: positive confirmation at every step. Header chip cycles "Saving..." then "Saved to Drive" with a cloud check icon; clicking it opens version history. Gmail and Medium use the same subtle saving/saved header icon pattern ([RealWorldUX #59 Auto-save UX](https://realworldux.co/59-auto-save-ux/)).
- Figma: silence-when-fine, alert-when-wrong. No message while autosaving; when offline or sync fails it shows a bottom-of-screen notification that the file has unsaved changes, stores edits locally, and syncs on reconnect ([Figma offline help](https://help.figma.com/hc/en-us/articles/360040328553-What-can-I-do-offline-in-Figma), [RealWorldUX analysis](https://realworldux.co/59-auto-save-ux/)).
- For Rackula the honest framing differs per mode: in server-mode the Google Docs pattern fits ("Saved to server"); in browser-mode "saved" is misleading because localStorage is not durable. Excalidraw's PR #10721 is the precedent for honest copy: say "stored in this browser, export to keep" rather than "saved".

Per-document dirty state and aggregation:

- VS Code: dirty dot replaces the close button on each modified tab, mirrored in the Explorer. Crucially for the aggregation question, it also shows a numeric badge on the Explorer activity-bar icon counting unsaved files, and "1 unsaved" text in the Open Editors section header ([waveguide.io Unsaved File Affordance](https://www.waveguide.io/examples/entry/unsaved-file-affordance/), [vscode issue #2357](https://github.com/microsoft/vscode/issues/2357)). On window close with dirty files it shows a native confirm dialog. This badge-count-on-one-icon pattern is the cleanest precedent for "one chip summarising many documents".
- draw.io's toolbar "Unsaved changes. Click here to save" is the single-document version: the indicator is also the action.
- Synthesis: one chip with three honest states (safe on server / in this browser only / unexported changes) plus a count when multiple layouts are at risk matches both the VS Code aggregation precedent and the Figma alert-on-risk philosophy.

## beforeunload Guidance

Current state (2025/2026):

- Custom message strings are dead everywhere: Chrome (since 51), Firefox (since 44), and Safari (since 9.1) ignore the returned string and show only a generic "Leave site? Changes you made may not be saved" dialog ([MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)).
- Chrome and Firefox also require sticky user activation: if the user never interacted with the page, the prompt does not show at all ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)).
- Chrome's explicit guidance: only add the `beforeunload` listener when unsaved changes exist, and remove it immediately once saved. Never attach it unconditionally on load ([Chrome Page Lifecycle API doc](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)).
- bfcache: in modern browsers `beforeunload` no longer makes a page ineligible for back/forward cache (it used to), but `unload` still does and is being fully deprecated by Chrome on a rollout ending around April 2026; never use `unload` ([web.dev bfcache](https://web.dev/articles/bfcache), [Chrome: deprecating unload](https://developer.chrome.com/docs/web-platform/deprecating-unload)).
- Mobile is the killer: background tabs are killed without firing `beforeunload`. Chrome's guidance is that `visibilitychange` to hidden is "the last reliable time to save app and user data". The robust pattern is: save state on `visibilitychange`/`pagehide`, and treat `beforeunload` purely as a best-effort last-resort prompt for genuinely-dirty desktop sessions ([Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)).

Implication for Rackula: since the working copy is continuously persisted to localStorage, there is rarely true "unsaved" state at unload time; `beforeunload` is only justified mid-write or if an in-flight server save could be lost. Attach conditionally, remove after flush, and flush on `visibilitychange` regardless.

## Snapshot/Version Retention in Self-Hosted Tools

Concrete retention and restore mechanics in comparable self-hosted apps:

- Grafana dashboards: keeps the last 20 versions by default, configurable via `versions_to_keep` in grafana.ini (0 = unlimited). Restore is restore-as-new-version: restoring v3 creates a new highest-numbered version with v3's content, never an in-place revert, so history is never destroyed. Includes a two-version diff view with a raw JSON diff section and a restore button in the comparison view ([Grafana manage version history](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/manage-version-history/)).
- Home Assistant (2025.1 backup overhaul): automatic backups with retention configurable by count or by days; the onboarding wizard recommends keeping 3. Manual backups are exempt from automatic cleanup, which is a nice distinction: user-initiated snapshots are sacred, automatic ones are bounded ([HA 2025.1 release](https://www.home-assistant.io/blog/2025/01/03/3-2-1-backup/), [backup integration docs](https://www.home-assistant.io/integrations/backup/)).
- Joplin: saves a revision of modified notes every 10 minutes; history kept 90 days by default, configurable; restore copies the old revision into a new note rather than overwriting ([Joplin note history](https://joplinapp.org/help/apps/note_history/)). Gotcha documented there: retention is effectively the minimum across synced devices.
- Syncthing: five strategies, useful as a taxonomy ([Syncthing versioning docs](https://docs.syncthing.net/users/versioning.html)):
  - Trash can: keep replaced/deleted files until older than N days (0 = forever).
  - Simple: keep the last N versions (UI default 5), timestamped copies in `.stversions`.
  - Staggered: thinning by age bands (versions kept at increasing intervals up to a max age), bounded disk use without losing all old history.
  - External: delegate to a user command.
  - Versions are named by appending a `~yyyymmdd-hhmmss` timestamp to the filename, which is the simplest credible naming scheme for file-on-disk snapshots.
- Gitea (and Git-backed config tools generally): every change is a commit; retention unbounded but delta-compressed. Overkill for Rackula's settled LWW-plus-snapshot design but worth noting as the ceiling.

Patterns to copy: bounded count in the 3 to 20 range is normal (HA 3, Syncthing 5, Grafana 20); timestamped filename suffixes for on-disk snapshots; restore-as-copy/new-version rather than destructive revert is the dominant UX; consider exempting explicit user snapshots from auto-pruning while bounding automatic pre-overwrite ones.

## Multi-Tab Coordination Patterns

Standard building blocks:

- Web Locks API (`navigator.locks.request`): broadly supported since 2022 (Chrome 69+, Firefox 96+, Safari 15.4+). Holding an exclusive named lock for the lifetime of a tab is the canonical zero-dependency leader election; locks are released automatically on tab crash/close, which solves the stale-leader problem that plagued localStorage-heartbeat schemes ([MDN Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), [w3c explainer](https://github.com/w3c/web-locks/blob/main/EXPLAINER.md), [Green Vitriol: leader election the easy way](https://greenvitriol.com/posts/browser-leader)).
- BroadcastChannel: same-origin pub/sub between tabs, used to announce "document changed, reload your copy" or leader handover. Typically paired with Web Locks ([Green Vitriol](https://greenvitriol.com/posts/browser-leader)).
- `storage` event: fires in other tabs (not the writer) when localStorage changes; the legacy fallback and effectively a free change notification if the store is localStorage anyway.

What production local-first apps do:

- tldraw: `persistenceKey` persists to IndexedDB and automatically syncs the document across tabs of the same browser; multi-tab is handled inside the SDK, not left to the app ([tldraw persistence](https://tldraw.dev/docs/persistence)).
- Pre-Web-Locks offline-first apps (documented in [pesterhazy's widely-cited gist](https://gist.github.com/pesterhazy/a840a21000b67cc5b7e601fdc91b9e18)) used asymmetric roles: one elected leader tab writes to IndexedDB, follower tabs run read-only/in-memory, with election via a Lamport mutual-exclusion algorithm over localStorage. RxDB ships this as a feature ([RxDB leader election](https://rxdb.info/leader-election.html)); standalone libs include [tab-election](https://github.com/dabblewriter/tab-election).
- Replicache and Yjs (y-indexeddb) similarly elect one tab to own persistence/network and fan out via broadcast; Yjs forum guidance is y-indexeddb for local storage with cross-tab sync ([Yjs discussion](https://discuss.yjs.dev/t/best-practice-to-sync-across-tabs-windows/903)).

Simplest credible option for Rackula (one localStorage key, whole-document LWW writes): full leader election is overkill. Wrap every read-modify-write of the key in `navigator.locks.request('rackula-layout', fn)` so two tabs cannot interleave, stamp the saved blob with a revision/timestamp and refuse (or snapshot-then-write) if the stored revision is newer than the one the tab loaded, and listen to the `storage` event (or BroadcastChannel) to refresh other tabs after a write. That is roughly 30 lines, uses no libraries, and degrades gracefully: without Web Locks the revision check alone still prevents silent clobbering.

## Runtime Config for Static SPAs

Standard patterns for one image, runtime config:

- config.json fetched at boot: app does `fetch('/config.json')` before mount; the file is generated or template-substituted by the container entrypoint. Pros: plain JSON, no JS generation. Cons: an extra blocking request and a caching footgun (must serve with no-cache) ([dmetzler: configure a SPA at runtime](https://dmetzler.github.io/configure-spa-at-runtime/), [jonrshar.pe: runtime configuration for SPAs](https://blog.jonrshar.pe/2020/Sep/19/spa-config.html)).
- env.js / `window.__CONFIG__`: entrypoint writes a tiny script (`window.__CONFIG__ = {...}`) that index.html loads before the bundle. Synchronous, no fetch race; the most common nginx-container idiom. The official nginx image runs any script in `/docker-entrypoint.d/` before serving, which is the idiomatic hook ([dev.to: runtime env vars with nginx and Docker](https://dev.to/imzihad21/runtime-environment-variables-for-react-apps-with-nginx-and-docker-3p62)).
- envsubst over built bundles: build with `$PLACEHOLDER` values, entrypoint runs `envsubst` across the JS output (Red Hat's documented multi-stage pattern using jq + envsubst). Works but is the most fragile: framework-specific bundle paths, and envsubst nukes any stray `$` it does not recognise ([Red Hat Developer article](https://developers.redhat.com/blog/making-environment-variables-accessible-in-front-end-containers)).

Unraid / Community Applications idiom:

- CA templates expose container env vars as form fields in the Unraid WebGUI; per-container env vars are the configuration mechanism users expect, alongside PUID/PGID/TZ conventions ([Unraid docs: managing containers](https://docs.unraid.net/unraid-os/using-unraid-to/run-docker-containers/managing-and-customizing-containers/), [selfhosters.net template guide](https://selfhosters.net/docker/templating/templating/)). Spike #1995 already settled on a two-template model (rackula, optional rackula-api), so "API may or may not exist" is a first-class deployment state.

Auto-detect API vs explicit config:

- Auto-detect (probe a same-origin `/api/health` at boot) gives zero-config when the API is reverse-proxied behind the same host, which is the nicest default for the single-container and proxied cases. Its failure mode matters for this spike specifically: a temporarily-down API is indistinguishable from "no API configured", so the app could silently fall back to browser-mode and mislead the user about data safety.
- Explicit config (env var like `RACKULA_API_URL` or `RACKULA_MODE` injected via `window.__CONFIG__`) is the Unraid-idiomatic choice and removes the ambiguity: if an API is configured but unreachable, the app can honestly show "server unreachable, changes held locally" (the Figma pattern) instead of quietly degrading.
- Pragmatic hybrid seen in self-hosted apps: explicit config wins when set; if unset, a fast same-origin probe enables server-mode opportunistically. Given the data-safety framing of this spike, explicit-config-wins with honest unreachable-state UI is the safer recommendation.

## External Resources

- https://github.com/excalidraw/excalidraw/discussions/6463 (no auto-save-to-file frustration)
- https://github.com/excalidraw/excalidraw/issues/8395 (localStorage limit data loss)
- https://github.com/excalidraw/excalidraw/issues/10664 (misleading "stored locally" copy, fixed in PR #10721)
- https://www.drawio.com/blog/save-diagram-files (draw.io storage-choice flow)
- https://tldraw.dev/docs/persistence and https://tldraw.dev/examples/unsaved-changes
- https://www.nngroup.com/videos/alert-fatigue-user-interfaces/
- https://www.smashingmagazine.com/2025/07/design-guidelines-better-notifications-ux/
- https://www.ux-bulletin.com/signal-detection-theory-in-ux/
- https://realworldux.co/59-auto-save-ux/ (Google Docs vs Figma save-status philosophies)
- https://help.figma.com/hc/en-us/articles/360040328553-What-can-I-do-offline-in-Figma
- https://www.waveguide.io/examples/entry/unsaved-file-affordance/ (VS Code dirty dot + aggregate badge)
- https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
- https://developer.chrome.com/docs/web-platform/page-lifecycle-api
- https://developer.chrome.com/docs/web-platform/deprecating-unload
- https://web.dev/articles/bfcache
- https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/manage-version-history/
- https://www.home-assistant.io/blog/2025/01/03/3-2-1-backup/ and https://www.home-assistant.io/integrations/backup/
- https://joplinapp.org/help/apps/note_history/
- https://docs.syncthing.net/users/versioning.html
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- https://github.com/w3c/web-locks/blob/main/EXPLAINER.md
- https://greenvitriol.com/posts/browser-leader
- https://gist.github.com/pesterhazy/a840a21000b67cc5b7e601fdc91b9e18
- https://rxdb.info/leader-election.html
- https://github.com/dabblewriter/tab-election
- https://discuss.yjs.dev/t/best-practice-to-sync-across-tabs-windows/903
- https://developers.redhat.com/blog/making-environment-variables-accessible-in-front-end-containers
- https://dmetzler.github.io/configure-spa-at-runtime/
- https://blog.jonrshar.pe/2020/Sep/19/spa-config.html
- https://dev.to/imzihad21/runtime-environment-variables-for-react-apps-with-nginx-and-docker-3p62
- https://docs.unraid.net/unraid-os/using-unraid-to/run-docker-containers/managing-and-customizing-containers/
- https://selfhosters.net/docker/templating/templating/
