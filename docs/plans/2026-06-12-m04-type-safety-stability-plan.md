# M04 -- Type Safety, Decomposition & Stability Execution Plan

> For agentic workers: execute one task per session via /dev-issue <number>. The GitHub issue body is the source of truth (each carries an Alignment audit 2026-06-12 section with binding ACs). Do not start a task whose listed blockers are open. Follow repo TDD policy (CLAUDE.md): tests only where behaviour warrants them.

**Goal**

Finish the TypeScript suppression burndown, the remaining large-file decomposition, and the E2E hardening so M03 and M14 build on typed, tested code. Zero feature work.

**Position in sequence**

M04 runs now, in parallel with M02 and M15, within the M02 -> M04 -> M03 -> M14 -> M16 sequence. M04 must finish before M03 (Data Format & Interop) and M14 (Canvas UX Overhaul) start building on the decomposed, type-checked code.

**Cross-milestone gates in**

- The persistence-wiring half of #2025 waits on M15 #2037/#2041 (storage manager rewrite). It is deferred out of this plan; only the dialog-wrapper half executes here.
- #1231 takes strategy input from M14 #2183 (E2E strategy for the shell reframe). Not a hard gate, but check #2183 before writing shell-dependent assertions.

**Gates out**

- #2180 must merge before M15 #2037 rewrites src/lib/storage/manager.svelte.ts, so storage work happens on type-checked code.
- #1398 must land before M14 #2076 cuts the side-panel contract; its sections compose into the future Edit tab.
- #1419/#1420 selector conventions feed M14 #2183 (selector carry-over across the shell reframe).
- Closing epic #1388 clears the decomposition debt that M03 and M14 build on.

## Stage 1: Housekeeping

All tasks in this stage are parallel-safe.

### Task: #2180 chore(ts): remove @ts-nocheck from src/lib/storage/manager.svelte.ts

- Blockers: none
- Why this position: must land before M15 #2037 rewrites this exact file (handleLoad, clearSession call sites, probe removal). Independent of every other M04 task.
- Scope: remove the line-1 // @ts-nocheck from src/lib/storage/manager.svelte.ts and fix the suppressed strict-mode errors. The suppression was in scope of #1705 (12 errors under the old persistence-manager path) but survived the #2027 file move; the batch PR #2114 missed it. Without this, the milestone goal of eliminating all suppressed errors cannot close.
- Key files: src/lib/storage/manager.svelte.ts
- Verify: npm run check, npm run lint, npm run test:run, npm run build
- [ ] Done when: @ts-nocheck is gone from src/lib/storage/manager.svelte.ts, the file type-checks under strict mode, and the change merges before #2037 starts (or rides the #2037 PR as its first commit).

### Task: #1707 chore(ts): Remove @ts-nocheck from components — 9 files, 23 errors

- Blockers: none
- Why this position: pure type housekeeping with no dependency on other M04 work. Landing it first avoids conflicts with #2025, which touches App.svelte in Stage 2.
- Scope: reclaimed from an external assignee on 2026-06-12 (audit corrections live in maintainer comments, not a body section). Toolbar.svelte (3 errors) is descoped: M14 #2072/#2074 remove that surface. 8 files remain: App.svelte, DevicePalette.svelte, DevicePaletteItem.svelte, DialogOrchestrator.svelte, ExportDialog.svelte, ImportFromNetBoxDialog.svelte, Rack.svelte, RackList.svelte. Remove each @ts-nocheck and fix errors using the per-file strategies in the issue body. #1398 is not sequenced behind this issue (no EditPanel overlap).
- Key files: src/App.svelte, src/lib/components/DevicePalette.svelte, src/lib/components/DevicePaletteItem.svelte, src/lib/components/DialogOrchestrator.svelte, src/lib/components/ExportDialog.svelte, src/lib/components/ImportFromNetBoxDialog.svelte, src/lib/components/Rack.svelte, src/lib/components/RackList.svelte
- Verify: npm run check (svelte-check reports 0 errors), npm run lint, npm run build, npm run test:run
- [ ] Done when: @ts-nocheck removed from the 8 in-scope files with 0 svelte-check errors and a green suite; the Toolbar.svelte descoping is recorded in the PR description.

### Task: #2103 chore(ci): deduplicate CodeQL analysis runs on pull requests

- Blockers: none
- Why this position: CI hygiene, fully independent; halves CodeQL minutes for every later PR in this plan.
- Scope: each PR commit triggers two CodeQL analysis runs; gh reports two workflow registrations (codeql.yml and a stale "codeql"). The code-scanning default-setup API reports not-configured, so the duplicate is likely a stale renamed workflow registration. Identify the source, remove it, and keep the CodeQL status gate functional.
- Key files: .github/workflows/codeql.yml
- Verify: gh run list --workflow codeql.yml succeeds without the "could not resolve to a unique workflow" error; gh pr checks on the fix PR shows exactly one Analyze run per language per commit
- [ ] Done when: exactly one Analyze run per language per PR commit and the CodeQL status gate still reports.

### Task: #2156 test: tighten unit-aware position assertions in layout-device-actions suite

- Blockers: none
- Why this position: small, isolated test fix; restores the value of the non-collision assertion before later work relies on this suite.
- Scope: in src/tests/layout-device-actions.test.ts (around the duplicate-device placement test, ~line 907) an assertion compares a stored internal-unit position against a human-unit literal, so it can pass even on a same-slot duplicate placement. Audit position assertions in the suite and compare like-for-like (assert against toInternalUnits(10) or convert back to human units). If tightening reveals a real collision gap, file the underlying bug as a separate issue.
- Key files: src/tests/layout-device-actions.test.ts
- Verify: npm run test:run, npm run lint
- [ ] Done when: position assertions compare consistent units and no assertion silently passes on a same-slot placement.

### Task: #2146 Keyboard arrow-nudge of a contained device ejects it from its container

- Blockers: none
- Why this position: listed as Stage 1 work, but the issue is already closed (completed 2026-06-12 via merged PR #2168). Only a reconciliation step remains.
- Scope: PR #2168 implemented Option A as guards on moveSelectedDevice and moveDeviceSlot in KeyboardHandler.svelte, with 4 tests. The issue's alignment audit AC mandates the guard live in the shared movement layer (src/lib/utils/device-movement.ts findNextValidPosition) so future entry points (#2075 verb bars, #2096 command registry) inherit it. Reconcile the deviation: record it on #2158 (the end-state owner for contained-device movement) or file a follow-up to relocate the guard. No code change in this milestone unless the maintainer opts to relocate now.
- Key files: src/lib/components/KeyboardHandler.svelte, src/lib/utils/device-movement.ts
- Verify: gh issue view 2146 -R RackulaLives/Rackula shows closed as completed; gh pr view 2168 -R RackulaLives/Rackula shows merged; after git pull, rg -n "container_id" src/lib/components/KeyboardHandler.svelte shows the guard
- [ ] Done when: closure confirmed and the guard-placement deviation is recorded on #2158 or in a follow-up issue.

## Stage 2: Decomposition

Tasks are parallel-safe (no file overlap between them).

### Task: #1396 refactor: Split export.ts into format-specific modules

- Blockers: none
- Why this position: M14-independent per the #1388 epic audit, so it can run anytime; sequenced here with the other decomposition slices after Stage 1 housekeeping.
- Scope: split the 1,975-line src/lib/utils/export.ts into export/svg.ts, export/pdf.ts, export/raster.ts, export/legend.ts, export/qr.ts, export/utils.ts, and export/index.ts (public API re-exports). Pure structural refactor, no behaviour changes. Preserve the dynamic imports for jsPDF and html2canvas.
- Key files: src/lib/utils/export.ts (new modules under src/lib/utils/export/)
- Verify: npm run test:run, npm run build, npm run lint; npx playwright test e2e/export.spec.ts --project chromium
- [ ] Done when: export.ts is replaced by the module set with an unchanged public API and a green suite.

### Task: #1398 refactor: Split EditPanel.svelte into composable sections

- Blockers: none (audit: not sequenced behind #1707, no file overlap)
- Why this position: the last pre-M14 decomposition slice, immediately before M14 #2076 which owns the panel contract. Also unblocks the one edit-panel testid in #1419.
- Scope: extract composable sections (metadata, image, position, actions) from the 1,753-line EditPanel.svelte. Panel state stays in the parent; sections get props and emit events. Do not build a tab container: that is owned by #2076. Confirm section boundaries against the #2076 contract before cutting; this issue's proposed split is the only documented breakdown.
- Key files: src/lib/components/EditPanel.svelte
- Verify: npm run test:run (existing tests pass without modification), npm run lint, npm run build
- [ ] Done when: sections are extracted with no behaviour change and existing tests pass unmodified.

### Task: #2025 refactor: extract App.svelte survivors (dialogs, keyboard, persistence wiring)

- Blockers: #1707 (lands the App.svelte type fixes first; same file). The persistence-wiring half is additionally gated on M15 #2037/#2041 and is deferred out of this plan.
- Why this position: the audit re-scoped this issue; the dialog-wrapper half can proceed anytime, so it runs with the other decomposition slices.
- Scope: stale premise corrected by the audit: App.svelte is 778 lines today, and DialogOrchestrator.svelte plus PersistenceEffects.svelte already exist (PR #1451). Residual scope for this session is the thin dialog-delegation wrappers remaining in App.svelte only. Do not touch the persistence startup/autosave-priority wiring: M15 #2037/#2041/#2044 rewrite those paths in src/lib/storage/manager.svelte.ts, and that half is deferred until they land or is folded into the #2037 PR.
- Key files: src/App.svelte, src/lib/components/DialogOrchestrator.svelte; reference: src/lib/components/PersistenceEffects.svelte, src/lib/components/KeyboardHandler.svelte
- Verify: npm run test:run (existing tests pass without modification), npm run lint, npm run build
- [ ] Done when: the dialog-wrapper extraction is merged with no behaviour change; the issue itself closes only after the persistence-wiring half lands with M15 #2037/#2041 (or inside the #2037 PR), so record the split status on the issue.

## Stage 3: E2E hardening

Ordering inside this stage is expressed by blockers: #1419 first, then #1420, then #1264 and the coverage specs, with #1423 last.

### Task: #1419 e2e: Add data-testid to structural components

- Blockers: #1398 (only for the edit-panel testid, roughly 1 of ~15; the audit confirms the rest is startable now since #1395/#1397 shipped)
- Why this position: head of the selector chain; #1420, #1423, and the coverage specs all build on these testids.
- Scope: add ~15 data-testid attributes ({scope}-{element}-{qualifier}, kebab-case) to structural and SVG elements, then point locators.ts at getByTestId and replace the document.querySelectorAll(".device-palette-item") and ".rack-front .rack-svg" queries inside page.evaluate() in device-actions.ts. Several component names in the issue table are stale; map them to current files (Canvas.svelte, RackDevice.svelte, RackDualView.svelte/BayedRackView.svelte, EditPanel.svelte, Sidebar.svelte, NewRackForm.svelte, DeviceContextMenu.svelte/RackContextMenu.svelte/CanvasContextMenu.svelte, Toast.svelte, mobile/MobileBottomNav.svelte). Skip Toolbar.svelte and StartScreen.svelte (M14 #2072/#2081 remove them) and prefer stable workspace-level anchors per the M14 #2183 coordination note.
- Key files: e2e/helpers/locators.ts, e2e/helpers/device-actions.ts, src/lib/components/Canvas.svelte, src/lib/components/RackDevice.svelte, src/lib/components/RackDualView.svelte, src/lib/components/EditPanel.svelte, src/lib/components/Sidebar.svelte, src/lib/components/DevicePaletteItem.svelte, src/lib/components/NewRackForm.svelte, src/lib/components/Toast.svelte, src/lib/components/mobile/MobileBottomNav.svelte
- Verify: npm run test:e2e; no CSS class selectors remain in e2e/helpers/locators.ts for structural elements
- [ ] Done when: the planned testids are present (mapped to current components), locators.ts and device-actions.ts use them, and the E2E suite passes.

### Task: #1420 e2e: Migrate helpers to getByRole/getByTestId

- Blockers: #1419
- Why this position: phase 3 of the spike #1393 migration; needs the testids from #1419 in place.
- Scope: replace ~40 :has-text() selectors, ~12 #id selectors, and inline class selectors in helpers and specs with getByRole()/getByLabel()/getByTestId(), prioritised by helper impact: device-actions, then rack-setup, then toolbar-actions. Add aria-label to components where getByRole() needs an accessible name.
- Key files: e2e/helpers/device-actions.ts, e2e/helpers/rack-setup.ts, e2e/helpers/toolbar-actions.ts, e2e/helpers/locators.ts
- Verify: npm run test:e2e; rg -n ":has-text" e2e/helpers/ returns nothing; rg -n "locator\(['\"]#" e2e/helpers/ returns nothing
- [ ] Done when: no :has-text() or #id selectors remain in helper modules and the full E2E suite passes.

### Task: #1264 E2E: Fix stale selectors in workflow/dialog specs

- Blockers: #1420 (fix specs using the migrated locator conventions rather than patching old patterns twice)
- Why this position: spec-level cleanup that lands naturally after the helper migration and before the ESLint rule must pass on all E2E files.
- Scope: audit and fix stale selectors in rack-configuration.spec.ts, export.spec.ts, keyboard.spec.ts, and view-reset.spec.ts against current component structure (NewRackForm, ExportDialog, EditPanel, HelpPanel, ConfirmDialog, RackDualView). e2e/single-rack.spec.ts named in the body no longer exists (removed during the #1508 suite recovery); skip it. Per the M14 scope note, fix new-rack and replace-dialog selectors minimally; do not harden flows #2017 redesigns. Dialog, export, keyboard, and edit-panel fixes are fully in scope.
- Key files: e2e/rack-configuration.spec.ts, e2e/export.spec.ts, e2e/keyboard.spec.ts, e2e/view-reset.spec.ts, src/lib/components/NewRackForm.svelte, src/lib/components/ExportDialog.svelte, src/lib/components/EditPanel.svelte, src/lib/components/HelpPanel.svelte, src/lib/components/ConfirmDialog.svelte, src/lib/components/RackDualView.svelte
- Verify: npx playwright test e2e/rack-configuration.spec.ts e2e/export.spec.ts e2e/keyboard.spec.ts e2e/view-reset.spec.ts --project chromium; then npm run test:e2e
- [ ] Done when: the listed specs pass against the current component structure.

### Task: #1423 e2e: Add ESLint rule to block CSS class selectors

- Blockers: #1420, #1264 (the rule must pass on all E2E files after the migration phases)
- Why this position: the lockdown step; prevents re-accumulation once the migration is complete.
- Scope: add a no-restricted-syntax rule scoped to e2e/\*_/_.ts that flags page.locator() calls with CSS class selectors (strings starting with "."); consider also flagging :has-text() and adopting eslint-plugin-playwright rules. Start as warn, upgrade to error once the migration phases are merged. Update docs/guides/TESTING.md with the selector convention and remove stale testid documentation (btn-save, btn-help).
- Key files: eslint.config.js, docs/guides/TESTING.md
- Verify: npm run lint passes on all E2E files; add a deliberate .locator(".foo") violation locally, confirm the rule fires, revert it
- [ ] Done when: the rule is active, TESTING.md documents the convention, and lint is green across e2e/.

### Task: #1227 Undo/Redo E2E Coverage

- Blockers: #1420 (writes against the migrated shared helpers)
- Why this position: new coverage built on the hardened selector foundation.
- Scope: new e2e/undo-redo.spec.ts covering 6 cases: place/undo/redo, arrow-key move, delete/restore, metadata edit revert, rack create/rename revert, and 3-step multi-undo. Use shared helpers (dragDeviceToRack, selectDevice, deleteSelectedDevice) and gotoWithRack for a deterministic start state. State-driven waits only; no waitForTimeout().
- Key files: e2e/undo-redo.spec.ts (new), e2e/helpers/
- Verify: npx playwright test e2e/undo-redo.spec.ts --project chromium; npm run test:e2e
- [ ] Done when: all 6 cases pass with no waitForTimeout() and the full suite stays green.

### Task: #1231 Accessibility E2E Coverage

- Blockers: #1420; coordinate with M14 #2183 before writing shell-dependent assertions
- Why this position: new coverage on the hardened foundation; must be written so the tests survive the M14 shell reframe.
- Scope: new e2e/accessibility.spec.ts covering 5 cases: keyboard-only navigation through major regions, dialog focus trapping, focus restoration on close, ARIA live region for placement toasts, and 44px touch targets on mobile. The body's tab order includes the toolbar, which M14 #2072 removes: anchor navigation assertions on surviving regions (sidebar, canvas, edit panel) and check #2183 for the agreed selector carry-over before adding toolbar-specific assertions.
- Key files: e2e/accessibility.spec.ts (new), e2e/helpers/
- Verify: npx playwright test e2e/accessibility.spec.ts --project chromium; npm run test:e2e
- [ ] Done when: all 5 cases pass with no waitForTimeout() and the full suite stays green.

## Stage 4: Close-out

### Task: #1388 Epic: Component Decomposition (large file splits)

- Blockers: #1396, #1398, #2025 (dialog-wrapper half, for an accurate checklist refresh)
- Why this position: epic bookkeeping after the last decomposition slices merge.
- Scope: refresh the epic checklist with audit-corrected facts (App.svelte 778 lines after PR #1451; Rack.svelte 660 after c5acdd1b, #1397 closed; #1610 Canvas closed; #1395 closed) and record the #2025 disposition: dialog half done in M04, persistence half deferred to M15 #2037/#2041. Then close the epic with a comment recording final line counts.
- Key files: none (GitHub-only task)
- Verify: gh issue view 1396 and gh issue view 1398 show closed; gh issue view 1388 checklist matches reality before closing
- [ ] Done when: #1396 and #1398 are closed, the checklist is accurate, and the epic is closed with a status comment.

### Task: #1387 Epic: User-Facing Error Handling Audit

- Blockers: none
- Why this position: verify-and-close per the audit; all four children already closed completed (confirmed via gh on 2026-06-12: #1389, #1390, #1391, #1392 all state CLOSED, stateReason COMPLETED).
- Scope: confirm each child closed as completed, spot-check the epic success criteria (export, persistence, import/load, and storage failures all surface user feedback; private browsing does not crash), then close the epic with a comment linking the four children.
- Key files: none (GitHub-only task; spot-check surfaces via npm run dev if needed)
- Verify: for n in 1389 1390 1391 1392; do gh issue view $n -R RackulaLives/Rackula --json state,stateReason; done
- [ ] Done when: the epic is closed with a comment confirming all four children landed.

## Verification

Milestone close-out checklist:

- [ ] gh issue list -R RackulaLives/Rackula --milestone "M04 -- Type Safety, Decomposition & Stability" --state open shows nothing unaccounted for. Known exceptions to resolve with the maintainer first: #2025 (persistence half gated on M15; split or re-milestone before close) and #2003/#1997 (CI/E2E infra issues sitting in M04 but outside this plan; execute separately or re-milestone).
- [ ] Suppression burndown done: rg -l "@ts-nocheck" src returns only src/lib/components/Toolbar.svelte (descoped to the M14 shell rewrite) and nothing else.
- [ ] Decomposition done: src/lib/utils/export/ module set exists with export.ts retired; EditPanel.svelte materially smaller (wc -l); epic #1388 closed.
- [ ] Error-handling epic #1387 closed with children confirmed.
- [ ] E2E hardening done: npm run test:e2e green; rg ":has-text" e2e/helpers/ empty; ESLint selector rule active; e2e/undo-redo.spec.ts and e2e/accessibility.spec.ts in the suite.
- [ ] Full local gate green on main: npm run check, npm run lint, npm run test:run, npm run build.
- [ ] Placement confirmations hold: #1222 sits in Backlog and #1581 in M07 (both confirmed 2026-06-12; re-check with gh issue view 1222 / gh issue view 1581 before closing the milestone).
- [ ] #2146 guard-placement deviation recorded on #2158 or in a follow-up issue.
