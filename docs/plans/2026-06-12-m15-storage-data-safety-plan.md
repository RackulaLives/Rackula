# M15 -- Storage Model & Data Safety Execution Plan

> For agentic workers: execute one task per session via /dev-issue <number>. The GitHub issue body is the source of truth (each carries an Alignment audit 2026-06-12 section with binding ACs). Do not start a task whose listed blockers are open. Follow repo TDD policy (CLAUDE.md): tests only where behaviour warrants them.

**Goal**

Make storage explicit and data loss hard. The app runs in one of two explicit modes (storage: browser or storage: server), surfaced by a single honest workspace-wide chip whose dot answers "is my work in its durable home". Server conflicts resolve last-write-wins with an automatic pre-overwrite snapshot; browser-mode backup is manual export plus change-based nudges; custom images get a durable home in the YAML format. Epic #2071 carries the pinned execution order and the cross-cutting signal-coherence ACs: read it before any task. Source research: docs/research/spike-2019-storage-model-data-safety.md.

**Position in sequence**

The milestone sequence is M02 -> M04 -> M03 -> M14 -> M16. M15 runs now, in parallel with M02 and M04 (the milestone number is an ID, not an order). M15's #2037 is on the critical path for both M14 (entry chain) and the M02 dev cutover (#2134), so Stage 2 should not lag.

**Cross-milestone gates in**

- M04 #2180 (remove @ts-nocheck from src/lib/storage/manager.svelte.ts) must land before #2037, or be folded in as the first commit of #2037's rewrite.
- Already satisfied: #2036 (runtime storage mode config injection, closed), #2034 (change counter, closed), #2040 (API pre-overwrite snapshots, closed), #2019 (spike, closed).

**Cross-milestone gates out**

- #2037 gates M14's #2187 (mode-aware menu items, split from #2073); the rest of the entry chain (#2073 shell -> #2081 -> #2080/#2095) depends only on the #2073 shell slice (recorded on epic #2017) and produces the mode mechanics the M02 dev cutover (#2134) deploys config for; land #2037 first or #2134 carries a forward-compat note.
- #2091's cross-driver storage-contract test is the spec the R2 driver (#2133, M02) must pass.
- #2035's derived-over-collection durability API is the single source M14 tab dots (#2079) and sidebar dots (#2082) read.
- #617 must land before #2035/#2038 reach users in a tagged release, so the chip and nudge never certify an image-dropping export as safe.
- #2042's restore-through-adapter AC protects pre-bump snapshots once M03 #2158 bumps the layout schema.
- #2045 (export-all with per-mode framing) moved to M14; it is not part of this milestone's close conditions.

**Cross-cutting signal-coherence ACs (epic #2071, binding on every UI task)**

- At most one storage toast at startup; nudges (#2038) suppressed while any conflict or drop toast is live; passive states absorbed by the chip, not toasts.
- Priority order: data-loss/conflict > twin-tab > drop/recovery > nudge > passive.
- Per-layout durability state has one source (#2035's derived API); consumers read it, never duplicate it.

## Stage 1: Trust foundation

### Task: #2091 TOCTOU race in pre-overwrite snapshot: stat and write use separate file handles

- Blockers: none.
- Why this position: first in the pinned order; #2041 and #2042 build snapshot-trust features on the assumption this race is closed, and the twin-tab backstop in the spike relies on it.
- Scope: the mismatch decision reads stat(existingYamlPath) (api/src/storage/filesystem.ts, check around lines 697-705) while the overwrite happens later through a separate open/write path (around lines 745-749); a write landing between them overwrites newer content without snapshotting it. Fix via a single-handle stat/read/write sequence or a per-layout write lock. Audit AC: encode atomic snapshot-on-mismatch as a storage-contract test (runStorageContract) that both drivers must pass, the filesystem driver now and the R2 driver (#2133) later; do not write the contract spec around the racy pre-fix behaviour. No such shared contract test exists yet; create it under api/src/storage/.
- Key files: api/src/storage/filesystem.ts, api/src/storage/filesystem.test.ts, api/src/snapshots.test.ts, api/src/routes/layouts.ts, new contract test under api/src/storage/.
- Verify: cd api && bun test; cd api && bun run typecheck; confirm the new contract test exercises snapshot-on-mismatch atomically (concurrent-write case) and passes against the filesystem driver.
- [ ] Done when: the stat/snapshot/write path is atomic (single handle or per-layout lock), the cross-driver contract test encodes it and passes, and the issue is closed.

### Task: #2059 chore: delete deprecated loadSession() and migrate its tests

- Blockers: none.
- Why this position: zero-risk cleanup, parallel-safe with #2091 (API-side); clears deprecated surface from working-copy.ts before #2037 and #2041 rework the same module's callers.
- Scope: src/lib/storage/working-copy.ts keeps a deprecated loadSession() wrapper around loadSessionWithTimestamp() solely for about 14 assertions in src/tests/session-storage.test.ts; no app code uses it. Delete the wrapper, migrate the tests to assert via loadSessionWithTimestamp().result, and confirm no other references remain.
- Key files: src/lib/storage/working-copy.ts, src/tests/session-storage.test.ts.
- Verify: npm run test:run; npm run lint; grep -rn "loadSession(" src returns only loadSessionWithTimestamp call sites.
- [ ] Done when: loadSession() is removed, tests assert through loadSessionWithTimestamp().result, no references remain, and the issue is closed.

## Stage 2: Mode and chip

### Task: #2037 feat: explicit storage mode in frontend, remove probe-and-guess

- Blockers: #2091, #2059 (stage order); M04 #2180 lands first or is folded in as this task's first commit.
- Why this position: the mode mechanics everything downstream branches on; gates the M14 entry chain and the M02 dev cutover (#2134), so it leads this stage.
- Scope: read mode from window.**RACKULA_CONFIG**?.storage with browser default; remove hasEverConnectedToApi and probe-and-guess; mode-driven branching in maybeSave and handleLoad; browser-mode startup gets a one-time first-run notice and no offline toasts; server-mode startup gets a health check, empty-list first run, and server-down continuity from the working copy; both "working offline" toasts replaced by instance-named server-drop and recovery toasts. Audit corrections: the ACs' persistence.svelte.ts is now src/lib/storage/manager.svelte.ts; the probe lives in src/lib/storage/availability.svelte.ts. Audit additions: persist the storage mode the session state was written under and detect a flip at startup; on server -> browser flip surface a notice, never silently degrade; on browser -> server flip the working copy's UUID is unknown to the server (no echo baseline, snapshot POST 404s), so offer to upload it as a new server layout via PUT and never silently shadow it with the server list; distinguish auth failure (401/Access-expired needs a re-authenticate affordance) from server-down (retry/backup), which matters once dev fronts the API with Cloudflare Access (#2134).
- Key files: src/lib/storage/manager.svelte.ts, src/lib/storage/availability.svelte.ts, src/lib/storage/working-copy.ts, src/lib/storage/api.ts, src/lib/components/PersistenceEffects.svelte, src/lib/stores/toast.svelte.ts.
- Verify: npm run test:run; npm run lint; npm run build; grep -rn hasEverConnectedToApi src returns nothing; manual: npm run dev with no injected config defaults to browser mode with the first-run notice and no offline toast.
- [ ] Done when: all body ACs plus the audit's mode-flip and auth-vs-down ACs pass, probe-and-guess is gone, and the issue is closed.

### Task: #2035 feat: storage status chip in workspace toolbar

- Blockers: #2037 (chip server-mode states consume its mode mechanics; #2034 change counter already closed).
- Why this position: the chip is the honest-state surface every later task (nudge, misconfiguration, conflict messaging) hangs off; it follows the mode mechanics it renders.
- Scope: build the workspace-wide chip with states, labels, and a popover shell (facts and action slots) in the reserved toolbar slot. Browser mode: green at changesSinceExport === 0, amber otherwise; server mode reflects save status and reachability; popover shows factual state, last export/save info, and action slots (Export now, Restore from file). Absorbed #2064 a11y ACs: never colour-only (WCAG 1.4.1, each state pairs colour with text or icon change); the chip is a button whose accessible name includes the current state, with state changes announced via live region per the #1901 decisions. Audit additions: interim guard until #617 lands, a layout containing custom images must not reach green via plain-YAML export (route the chip-resetting export through an asset-including path or show an explicit warning state); expose chip state as a derived-over-collection API (per-layout durability rolled up) so M14 #2079/#2082 read the same source.
- Key files: src/lib/components/Toolbar.svelte, src/lib/stores/layout/persistence.ts, src/lib/storage/manager.svelte.ts, new chip component under src/lib/components/, spike sections "Recent backup chip definition" and "Spec Reconciliation" in docs/research/spike-2019-storage-model-data-safety.md.
- Verify: npm run test:run; npm run lint; manual: npm run dev, confirm green at zero changes, amber after an edit, popover facts and action slots render, and screen-reader name announces the state.
- [ ] Done when: chip states, popover, a11y ACs, the interim image guard, and the derived durability API all pass review and the issue is closed.

### Task: #617 feat: Add YAML save format with embedded base64 images

- Blockers: none (parallel-safe with #2037/#2035; must merge before any tagged release that ships #2035 or #2038).
- Why this position: custom images currently have no durable home; every reachable save path drops them, and the chip/nudge would certify those exports as safe. It lands in this stage so Stage 4's user-facing guards can rely on it.
- Scope: both halves. Save: embed user-uploaded custom images as base64 data URLs in an images section at the end of the .rackula.yaml file (bundled device images excluded), preserving existing serialization in src/lib/utils/yaml.ts, with round-trip validation (save -> load -> equals original) and a warning above ~100KB per image. Load: parse YAML and extract base64 images (folded in from #618; picker, magic-byte detection, and ZIP compat already shipped in #1754). Audit ACs: re-validate each embedded image's MIME against SUPPORTED_IMAGE_FORMATS on load and reject or strip image/svg+xml and unknown types (the ZIP path's EXTENSION_TO_MIME maps .svg today; that must not carry over); enforce a hard per-image byte cap on load (reject, not warn); document the size divergence (server PUT caps layouts at 1MB while local YAML load allows 5MB; image-heavy YAML that loads locally fails server save loudly, intentionally, until quotas are designed).
- Key files: src/lib/utils/yaml.ts, src/lib/stores/images.svelte.ts, src/lib/utils/archive.ts (EXTENSION_TO_MIME, LIMITS.MAX_YAML_BYTES), src/lib/types/constants.ts (SUPPORTED_IMAGE_FORMATS), src/lib/utils/imageUpload.ts, src/lib/storage/load-pipeline.ts.
- Verify: npm run test:run (round-trip and MIME-rejection tests); npm run lint; npm run build; manual: upload a custom image, save as YAML, reload the file, image survives; a hand-edited YAML with an svg data URL is rejected or stripped.
- [ ] Done when: save and load halves round-trip custom images, MIME re-validation and byte caps are enforced on load, the size divergence is documented, and the issue is closed.

## Stage 3: Conflict and snapshots

### Task: #2041 feat: frontend echo-based conflict handling and snapshot upload

- Blockers: #2091 (snapshots become the safety net for discarded losing copies, which presumes the race is closed), #2037 (mode-driven save paths).
- Why this position: replaces the mtime-vs-browser-clock comparison with the echoed-updatedAt model; everything snapshot-facing in the UI (#2042) and the twin-tab guard (#2044) sequence after it.
- Scope: store the server-echoed updatedAt in the session blob and send it on PUT; stop calling clearSession() after server saves (working copy kept, a deliberate behaviour change); replace the isServerNewer() startup comparison with the echo model; POST the losing local copy to the snapshot endpoint before discarding it; update conflict toasts to name the snapshot path. Absorbed #2062: validate the save-layout response with Zod instead of the unchecked { id } cast (src/lib/storage/api.ts around line 339), including the X-Rackula-Updated-At echo shape. Audit ACs: snapshot POST failure must never discard the local copy (404 means the layout folder is gone or the UUID was never server-known; on 404 or any failure, keep the copy); for a working copy unknown to the server, re-establish it via PUT (create-or-update, no API change) rather than treating the server list as authoritative; cap the loadSavedLayout response size before parsing (reuse MAX_YAML_BYTES or align with the server's 1MB write cap) and align parseLayoutYaml on a restricted js-yaml schema matching the server's JSON_SCHEMA (client currently parses server YAML uncapped with DEFAULT_SCHEMA; matters once the backend is remote R2, #2133).
- Key files: src/lib/storage/api.ts, src/lib/storage/working-copy.ts, src/lib/storage/manager.svelte.ts, src/lib/storage/load-pipeline.ts, src/lib/utils/yaml.ts, src/lib/stores/toast.svelte.ts.
- Verify: npm run test:run; npm run lint; manual against a local API (npm run dev plus cd api && bun run dev): save, edit elsewhere, confirm the losing copy lands as a snapshot and the conflict toast names it; kill the layout folder server-side and confirm a snapshot 404 keeps the local copy.
- [ ] Done when: echo model replaces the clock comparison, no path discards a local copy on snapshot failure, the Zod-validated response and capped/restricted YAML parse are in, and the issue is closed.

### Task: #2042 feat: snapshot list and restore in LoadDialog

- Blockers: #2091 (pinned); #2040 already closed; run after #2041 within this stage (pinned epic order).
- Why this position: the user-facing recovery surface for the snapshots the rest of the stage produces; it consumes the echo/keep-working-copy semantics #2041 establishes.
- Scope: LoadDialog shows a snapshots expansion per layout in server mode; restore loads the snapshot as the working copy (restore-as-new-write, no in-place revert). Audit corrections and additions: snapshot entries render localized timestamps, not the raw UTC YYYYMMDD-HHMMSS filename suffix; snapshot restore routes through the same parse/validate/adapt pipeline as file load, so pre-schema-bump snapshots (which will exist once M03 #2158 bumps the schema) hit the import adapter rather than bypassing it.
- Key files: src/lib/components/LoadDialog.svelte, src/lib/storage/api.ts, src/lib/storage/load-pipeline.ts, api/src/routes/layouts.ts (existing list endpoint, reference only).
- Verify: npm run test:run; npm run lint; manual against a local API: overwrite a layout to create a snapshot, open LoadDialog, expand snapshots, confirm localized timestamp, restore, confirm it becomes the working copy without an in-place revert.
- [ ] Done when: snapshots are listable and restorable through the validated load pipeline with localized timestamps, and the issue is closed.

## Stage 4: Guards and tail

### Task: #2038 feat: backup nudge and restore-from-file flow

- Blockers: #2035 (chip popover hosts the restore action), #617 (the Export-first flow must not certify an image-dropping export; #2034 already closed).
- Why this position: the nudge sits on top of the chip and the change counter and must respect the conflict/drop toasts from Stage 3 under the epic's signal-budget ACs.
- Scope: non-modal nudge toast with an Export action at 30 changes since last export, re-firing only at multiples of 30; dismissal/snooze persisted; never-exported cold-start covered; factual tone, no nagging (Excalidraw honest-copy precedent); restore-from-file action in the chip popover reusing loadFromFile(); confirm dialog offers Export first / Replace / Cancel only when unbacked changes exist. Audit notes: until #617 lands the Export-first flow must not certify an image-dropping export for layouts containing custom images (#617 is sequenced before this task, so verify the asset-including export path is what the nudge triggers); the body leaves "do nudges fire in server mode?" open while the epic's signal-budget ACs assume browser-mode only, so implement browser-mode-only nudges and record the decision in the PR and back on the issue. Respect the epic's suppression rule: no nudge while any conflict or drop toast is live.
- Key files: src/lib/stores/toast.svelte.ts, src/lib/stores/layout/persistence.ts, src/lib/storage/manager.svelte.ts, src/lib/components/LoadDialog.svelte (loadFromFile reuse), the chip component from #2035, spike sections "Nudge cadence and tone" and "Restore-from-file flow".
- Verify: npm run test:run; npm run lint; manual: make 30 changes in browser mode, nudge fires once with Export; dismiss, confirm no re-fire until 60; restore-from-file with unbacked changes shows the three-option confirm.
- [ ] Done when: nudge cadence, persistence of dismissal, restore-from-file, the image guard, and the server-mode decision are all in place and the issue is closed.

### Task: #2044 feat: twin-tab guard for the shared working copy

- Blockers: #2041 (touches the same autosave effects; pinned order).
- Why this position: sequenced after the echo/snapshot work by the issue body itself, and its backstop argument depends on #2091 being fixed.
- Scope: stop two same-origin tabs silently clobbering one localStorage working copy. Per-tab id stamped into session writes; storage-event detection of foreign writes pauses this tab's autosave effects; "Open in another tab" toast with a Reload action; Web Locks wrap the session read-modify-write. Audit ACs: key the tab-id stamp and the Web Lock per layout, not per autosave slot (M14 tabs make the workspace multi-layout and a whole-workspace pause would be wrong; guard semantics under multi-layout are a spike #2018 question, so do not bake in single-slot granularity); Web Locks are used where available (without them the tab-id check alone still prevents silent ping-pong, backstopped by the server-side mismatch snapshot now that #2091 is fixed); a spurious foreign-write signal leaving the tab paused until manual Reload is the documented recovery, not an oversight.
- Key files: src/lib/storage/working-copy.ts, src/lib/components/PersistenceEffects.svelte, src/lib/stores/toast.svelte.ts, spike section "Twin-tab case".
- Verify: npm run test:run; npm run lint; manual: open two tabs on npm run dev, edit in one, confirm the other pauses autosave and shows the toast with Reload; confirm keys are per layout id.
- [ ] Done when: foreign writes are detected and pause autosave with the Reload toast, stamps and locks are keyed per layout, and the issue is closed.

### Task: #2063 feat: surface storage mode misconfiguration in the chip

- Blockers: #2035 (chip states), #2037 (mode mechanics); last in the pinned order.
- Why this position: a refinement of chip states that needs both the mode mechanics and the chip shipped; it also closes out the spec-amendment loose end.
- Scope: distinguish configured intent from observed reality. Server mode: chip distinguishes never-reached (distinct state and popover copy, "Server not found. Check that the API container is running and RACKULA_STORAGE_MODE matches the deployment.") from reached-then-lost (drop toast stays reserved for this). Browser mode with a healthy API: one passive popover line ("A Rackula server is reachable but this instance stores layouts in the browser. Set RACKULA_STORAGE_MODE=server to use it."), popover only, no toast, no nagging. No new toasts; factual tone per the spike's messaging decisions; record decisions back into docs/superpowers/specs/2026-06-09-canvas-ux-overhaul-design.md. Epic audit technical notes (binding): the passive browser-mode probe reuses the shape-validated checkApiHealth in src/lib/storage/api.ts, not a bare fetch; the spec-amendment AC also resolves the down-at-launch toast-vs-chip tension with the spike text.
- Key files: src/lib/storage/api.ts (checkApiHealth), src/lib/storage/availability.svelte.ts, the chip component from #2035, docs/superpowers/specs/2026-06-09-canvas-ux-overhaul-design.md.
- Verify: npm run test:run; npm run lint; manual: browser mode with a running API shows the passive popover line and no toast; server mode with no API ever reached shows the misconfiguration state, not the outage treatment.
- [ ] Done when: never-reached vs reached-then-lost is distinguished, the passive hint ships popover-only via checkApiHealth, the spec is amended, and the issue is closed.

## Verification

- [ ] All ten issues closed: #2091, #2059, #2037, #2035, #617, #2041, #2042, #2038, #2044, #2063.
- [ ] Epic #2071 close conditions: every unchecked implementation and follow-up item is closed or re-homed (#2045 lives in M14; confirm its checkbox on the epic is annotated accordingly) and the epic is closed.
- [ ] Signal-coherence smoke check: cold start in each mode produces at most one storage toast; with a conflict toast live, no nudge fires; passive states appear only in the chip.
- [ ] Durability single-source check: chip, and nothing else, computes per-layout durability (grep for duplicated changesSinceExport green-state logic outside the #2035 derived API).
- [ ] Image-safety smoke check: a layout with a custom image saved via the default YAML path round-trips the image; the chip never shows green off an image-dropping export.
- [ ] Snapshot trust smoke check: concurrent-write contract test passes (cd api && bun test); a forced conflict produces a snapshot that LoadDialog can restore through the validated pipeline.
- [ ] Full suite green at milestone close: npm run test:run, npm run lint, npm run build, npm run test:e2e, and cd api && bun test.
- [ ] Cross-milestone notes recorded: #2134 (M02) and the M14 entry chain unblocked by #2037; #2133 pointed at the storage-contract test from #2091.
