# E2E Suite Recovery

**Date:** 2026-07-02 **Status:** Approved **Epic:** #2859 **Execution:** /orchestrate-issues, wave-sequenced **Supersedes:** epic #1222, issues #2754, #2755, #1230

## Goal

Return the full Playwright suite to green on main, make advisory red impossible to miss again, fix the two product bugs the failure analysis surfaced, clear disabled-test debt, and fill the genuine multi-rack coverage gaps. End state: 0 failed on the full suite, advisory job files an issue on failure, nightly main run guards against silent rot.

## Evidence base

Full advisory suite run on main-equivalent (sha 357e34b9, 2026-07-02, run 28580785783): 118 failed / 4 flaky / 340 passed / 20 skipped. The job only now completes because the pve-prod runner cutover (#2842) ended the 30-minute timeout kills (#2838), exposing pre-existing breakage.

Root-cause taxonomy (verified by log analysis plus a worktree experiment that repaired 18 of 22 sampled chromium failures with the helper fix):

| Cause | Failures | Mechanism |
| --- | --- | --- |
| Positional first-palette-item selection after #2745 alphabetization | ~116 of 118 | First palette item is now "Blade Server (Full-Height)": half-width, carrier-required, refused by placeDevice. Reached via 4 paths: dragDeviceToRack positional default (~94), dual-view.spec.ts local duplicate helper (10), keyboard-placement.spec.ts positional arming (8), mobile tap-to-place positional arming (4) |
| Command palette device bridge hidden | 2 | forceMount Command.Item inside the search Command.Group; bits-ui culls the group on no-match (regression of #2779, shipped in PR #2803) |
| Unreachable side-panel-edit-empty (unmasked once drags succeed) | 4 residual | Since #2739/#2757, activeRack falls back to racks[0] and the Edit tab renders rack mode whenever any rack exists; deselectDevice() and keyboard.spec Escape assertions expect the empty state |

Issue `#2754` re-diagnosis: the smoke "flake" was deterministic merge-ref drift. pull_request CI runs on refs/pull/N/merge, so PRs re-run after #2745 landed (2026-06-30 03:46 UTC) failed until #2751 named the device (09:52 UTC). All recorded flake events sit inside that window; none since. No flake-retry machinery is warranted.

## Issue hygiene (before Wave 0)

- Close epic #1222: every child except #1230 is closed; body facts are stale (claims 10 waitForTimeout, reality 1; claims no undo/redo or a11y coverage, both spec files exist). Comment with the audit summary and link the new epic.
- Close #1230: scope half-built (multi-rack.spec.ts, rack-controls.spec.ts bay coverage from #2823); remaining gaps rescoped into Wave 4.
- Comment on #2754 with the merge-ref-drift re-diagnosis; close as duplicate of #2755 when Wave 0 merges, unless a post-#2751 failure with the same signature is found.
- Open new epic "E2E suite recovery and guardrails" with the waves below as sub-issues. Done: epic #2859, sub-issues #2851-#2858.

## Wave 0: green the suite (2 PRs, sequential)

### Issue A (#2851): positional-selector sweep (closes #2755)

One PR. Pure test-side change plus one data attribute. All call sites share e2e/helpers/device-actions.ts, so this must be a single PR, not per-spec issues.

- dragDeviceToRack: when neither deviceName nor deviceIndex given, default deviceName to "Server" (generic 1U, slug 1u-server, full-width; restores the pre-#2745 de facto default). Keep explicit deviceIndex working.
- Add a precondition wait: when dragging by name, wait for the named palette item to be attached/visible before the one-shot evaluate (fixes the 150ms search-debounce race in shelf-category and virtualization unmount races).
- Delete dual-view.spec.ts local dragDeviceToRackView (lines 14-71); use the shared helper with rackView targeting.
- Convert positional paletteItem.first()/.nth() sites to paletteItemByName with a known-placeable device: keyboard-placement.spec.ts:34,75,96,130,157; ios-safari.spec.ts:232-234; mobile-placement-mouse.spec.ts:52-54; android-chrome.spec.ts equivalents.
- shelf-category.spec.ts:37,68: pass deviceName "Shelf" explicitly; strengthen the fill-colour test to assert the placed device is a shelf (accessible name or data attribute, not a colour literal).
- starter-library.spec.ts:291: pass deviceName "Switch (24-Port)" so the test matches its title.

Acceptance: full suite locally on chromium has zero device-actions.ts:128 count-check failures; the only remaining failures are the four side-panel-edit-empty residuals (Issue B) and command palette (Issue C).

### Issue B (#2852): retire the side-panel-edit-empty contract in e2e

One PR, test-side only.

- deselectDevice() (device-actions.ts:186-190): after Escape, assert the rack-mode fallback instead (editPanel visible, editEmpty not visible, or the rack heading), matching the deleteSelectedDevice() rework.
- keyboard.spec.ts:53-65 "Escape clears selection": assert a real deselection observable (rack SVG selected/highlight state or selection-dependent control), not editEmpty.
- Sweep the vacuous editEmpty not.toBeVisible guards so they assert a positive signal: device-name.spec.ts:26,54,157; keyboard.spec.ts:58; rack-select-editpanel.spec.ts:30,36,53,60; view-reset.spec.ts:66,105.
- Update the skipped device-name.spec.ts:100 test body (it contains the same stale assertion) so Wave 2 can re-enable it.

Acceptance: undo-redo.spec.ts move/edit-IP/rename-rack and keyboard.spec.ts Escape pass on chromium and webkit.

### Wave 0 verification

After both PRs merge, dispatch the full suite against main (workflow_dispatch on Test, or trigger e2e-self-hosted) and confirm the only failures remaining are command palette (Issue C) and any keyboard-placement/tap-to-place tests parked on Issue D behaviour. Close #2754 and #2755.

## Wave 1: product bugs (2 PRs, parallel)

### Issue C (#2853): command palette device bridge never visible (regression of #2779)

- CommandPalette.svelte:521-539: the forceMount bridge item must survive bits-ui filtering on a true no-match. Move it out of the culled Command.Group (own always-mounted group or sibling of the list) or drive visibility explicitly from the query-match state.
- Re-enable the failing assertion path: e2e command-palette.spec.ts:416 "a query that matches no command offers the device bridge, pre-filled" passes on chromium and webkit.
- Manual check: open palette, type a nonsense query, bridge row visible and Enter opens device search pre-filled.

### Issue D (#2854): half-width oversize devices have a dead placement flow with a green preview

Decision required in the issue before code: are chassis children (blade-server-half 2U, blade-server-full 4U) placeable only into existing chassis bays? Current code says yes de facto; the UI says no.

- synthesizeCarrierForDevice (collision.ts:449-462) maps every half-width integer-height device to carrier-1u-2col; canPlaceInSlot height check then always fails for u_height > 1.
- If bays-only is intended: make validity honest. resolveDropTarget (rack-drop-coordinator.ts:188-213) must not report valid, and keyboard placement validStartPositions (placement-keyboard.ts:25-49, via getDropFeedback in dragdrop.ts:89-125) must not announce slots as available, for devices placeDeviceSmart will refuse. Error toast should not say "No space" on an empty rack; say the device requires a chassis.
- If direct placement should work: synthesize a matching-height carrier instead.
- E2E: keyboard-placement and tap-to-place specs keep using placeable devices (Wave 0); add one regression test asserting the chosen behaviour for a chassis child.

## Wave 2: disabled-test debt (1 PR)

### Issue E (#2855): disabled test triage sweep

- Delete: basic-workflow.spec.ts:26,34,107 fixmes (replace-rack flow removed, #1438 closed not-planned; clear-rack superseded by keyboard.spec.ts and undo-redo.spec.ts coverage); custom-device.spec.ts:48 (assertion-free stub).
- Rewrite: custom-device.spec.ts:20 into a real 4U custom device placement test (create device, drag by name, assert placed height). Verify the old bind:value/fill() blocker first; use pressSequentially if it persists.
- Re-enable: device-name.spec.ts:100 undo/redo display name (skip cites closed #1405; this hides an untracked regression). Fix the drag call (deviceName) plus the Issue B assertion, run repeatedly; if rename-undo still misbehaves, file a product issue and re-point the skip at it.
- android-chrome.spec.ts:171 swipe-to-dismiss: rewrite using CDP Input.dispatchTouchEvent (mouse synthesis is rejected by Dialog.svelte by design), or delete and record swipe-to-dismiss as untested. Decide in PR.
- Optional: collectStorageEvents (multi-context.ts:96) gains an expectedKey early-exit poll; keep the bounded wait as fallback. Only if already editing the file.

Acceptance: zero unconditionally disabled tests without a live tracking issue.

## Wave 3: CI guardrails (2 PRs, parallel)

### Issue F (#2856): advisory red must page a human (implements the "advisory + main guard" decision)

- e2e-self-hosted keeps continue-on-error (single-runner SPOF stays non-blocking) but on failure creates/comments a single labelled issue (port the notify-on-failure pattern from test-full.yml), so red is pushed, not pulled.
- Nightly full-suite run on main: schedule e2e-self-hosted on main or promote test-full.yml weekly to nightly, with the same failure notification.
- Housekeeping in the same PR: exclude deploy-smoke.spec.ts from the full config desktop projects (it is a live-URL boot check, redundant against local preview); add webServer timeout 120_000 to e2e/playwright.config.ts for parity with the smoke config.

### Issue G (#2857): widen the merge gate

- Promote 2-4 high-value specs into the validate smoke set (candidates: keyboard-placement pick/place, undo-redo core, persistence round-trip) keeping the job under ~5 minutes.
- Add npm run check (svelte-check) to validate: closes the #2794 typecheck blindspot where a TS error merges green.

## Wave 4: multi-rack coverage gaps (1 PR, replaces #1230)

### Issue H (#2858): multi-rack gap-fill

Existing coverage already handles: create/coexist/limit (multi-rack.spec.ts), bay verbs, bay-group formation and extension (rack-controls.spec.ts). Genuine gaps:

- Duplicate rack: devices copied, copies independent.
- Delete rack: confirmation flow, canvas updates, remaining rack intact.
- Device placement across bays in a bay group.
- Export with multiple racks (SVG contains all racks).
- Fixtures MULTI_RACK_SHARE and BAYED_RACK_SHARE in e2e/helpers/test-layouts.ts if share-link setup is faster than UI-driven setup.

No waitForTimeout, shared helpers only, named devices only.

## Sequencing for /orchestrate-issues

| Wave | Issues | Parallelism | Depends on |
| --- | --- | --- | --- |
| 0 | #2851, #2852 | Sequential (A then B; both touch device-actions.ts) | Issue hygiene done |
| 1 | #2853, #2854 | Parallel with each other and with Wave 2 | Wave 0 merged (for e2e verification) |
| 2 | #2855 | Parallel with Wave 1 | Wave 0 merged (A fixes the drag call E re-enables) |
| 3 | #2856, #2857 | Parallel | Wave 0 verification green |
| 4 | #2858 | Any time after Wave 0 | Wave 0 merged |

Single-file discipline: Waves 0A and 0B both edit e2e/helpers/device-actions.ts and must not run concurrently. Everything else is file-disjoint.

## Success criteria

- Full suite on main: 0 failed, 0 unexplained flaky (post Wave 0+1, allowing Issue D's decision to gate its 2 keyboard-placement tests).
- Advisory failure files an issue automatically; nightly main run exists.
- Zero unconditionally disabled tests without a live tracking issue.
- validate gate includes svelte-check and the widened smoke set.
- #1222, #1230, #2754, #2755 closed with accurate closing comments.
