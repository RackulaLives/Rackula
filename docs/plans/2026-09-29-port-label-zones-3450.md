# Plan: implement #3450 via /orchestrate-issues

## Context

#3450 (M006) fixes the rack view where port markers draw over device labels (patch panels read as struck through, the "48" badge covers switch names) and the rear view marks half-depth front devices in error red. Mockup: https://claude.ai/artifact/9HoRCXH6qipv1heg6PbuZZ. The spec is one issue but spans four areas with different coupling, so we split it into sub-issues and run them with the phase-gate strategy from `/orchestrate-issues`.

Decisions already made: label wins on narrow racks (strip collapses to a count chip, all ports anchor to the chip centre); marker shape encodes medium, colour keeps encoding speed; >24 ports keep today's no-anchor behaviour (#356).

One refinement from exploration: `buildPortAnchorMap` (`src/lib/utils/connection-path.ts:496`) knows rack interior width but not the device name, so the collapse decision is width-only: collapse when `deviceWidth - iconZone - stripWidth - gaps < LABEL_MIN_WIDTH (48)`. This matches the spec wording ("label zone would drop below a minimum width") and keeps geometry and anchors in one pure function.

## Sub-issues (create as GitHub sub-issues of #3450, milestone M006)

### A. Port zone geometry (foundation) (#3451) - `src/lib/utils/port-geometry.ts`

- Add a pure `computeDeviceZones({ deviceWidth, deviceHeight, visiblePortCount })` returning `{ mode: "none" | "strip" | "chip", iconX, labelX, labelWidth, portZone: {x, y, w, h}, rows, cols }`. Constants: marker 5, pitch 6, rows 1/2/3 at <=8 / <=16 / <=24, chip box width fixed (fits "999"), `LABEL_MIN_WIDTH = 48`, icon zone reusing `DEVICE_LABEL_ICON_SPACE_LEFT` from `src/lib/utils/text-sizing.ts`.
- Rewrite `computeVisiblePortLayout` to place ports on the right-aligned grid inside `portZone` (keeps `visiblePorts()` filter and the `offset` param). In `chip` mode from collapse, return one entry per port at the chip centre so `getPortAnchors` anchors every port there. >24 still returns `[]`.
- Export a helper for the chip position so PortIndicators and anchors share it.
- Tests: update `src/tests/port-geometry.test.ts` (row rule at 8/9/16/17/24, right alignment, collapse threshold on a 10-inch `deviceWidth`, collapsed anchors all equal chip centre); update coordinates in `src/tests/connection-path.test.ts` `buildPortAnchorMap` block (:450-525) only where positions intentionally moved.
- Note: merging A alone moves rendered ports right (PortIndicators already reads this layout) while the label is still centred. Acceptable interim on dev; nothing ships until a tag.

### B. Zoned label and REAR tag (#3452) - `src/lib/components/RackDevice.svelte`, `src/lib/utils/text-sizing.ts`

- When the device has visible ports, use `computeDeviceZones`: icon at `iconX`, label `text-anchor="start"` at `labelX`, `fitTextToWidth` with `labelWidth` (replaces the `deviceWidth - 28 - 20` at :373-375 for this case). Devices without visible ports keep today's centred label exactly.
- Move the REAR tag (:984-994) into the right edge after the port zone, vertically centred, when ports are visible.
- Image and placeholder modes: unchanged in this issue (ports still overlay images, as today).
- Tests: extract the label-width decision as a pure function if it is not already one after A, test it (long name on a 24-port device truncates, no-port device unchanged). Update `src/tests/text-sizing.test.ts:194-204` only if constants move. Keep `src/tests/rear-treatment.test.ts` passing.
- Conflict risk: open PR #3429 edits RackDevice.svelte near :313-393. If #3429 merges first, rebase B on main; if B is ready first, merge it and leave #3429 to rebase. Check `gh pr view 3429` before starting B.

### C. Port markers: chip, shapes, SFP colour (#3453) - `src/lib/components/PortIndicators.svelte`, `src/lib/styles/tokens.css` (port section only)

- Replace `portGroups`/`badgePositions` (:161-196) with a single count chip drawn at A's chip position: a marker in the dominant type's shape and colour plus the count. Used for >24 ports and for collapsed mode.
- Marker shape by medium: `*-x-*` types (SFP/SFP+/SFP28/QSFP families) as rounded `rect`, copper and others as `circle`. Size from A's constants. Keep hit targets (`circle.port-hit-target`, :292-325), tooltips, connection-creation classes, PoE glyph and direction arrows positioned relative to the new marker size.
- Add `--colour-port-sfp` to `tokens.css` (:262-274) and a `1000base-x-sfp` entry in `INTERFACE_COLORS` (:90-97).
- Tests: update `src/tests/RackDevice.port-indicators.test.ts` (badge text assertion at :66 becomes the chip count; button names unchanged) and keep `RackDevice.port-key-collision.test.ts` passing. No colour or class assertions (ESLint blocks them).

### D. Neutral, named rear hatch (#3454) - `src/lib/utils/blocked-slots.ts`, `src/lib/components/RackFrame.svelte`, `src/lib/styles/tokens.css` (blocked section), `src/lib/utils/export/svg.ts`

- `getBlockedSlots` returns `BlockedSlot extends URange` with `deviceName` (placed name, else type model/slug; both are in scope at :36-56). `isPositionBlocked` / `wouldOverlapBlocked` keep taking `URange[]` (structural superset, no change).
- RackFrame (:288-318): add a centred caption `<name> (front, half depth)` when the range is >= 1U, truncated with the existing `fitTextToWidth`; `aria-hidden` consistent with the overlay. Add a `<title>` for hover.
- Tokens (:324-326): neutral grey stroke/bg; delete `--colour-blocked-icon` (no consumers). Update the RackFrame CSS fallbacks (:436-442) to match.
- Export parity: switch the hard-coded red in `svg.ts:767-830` to the same neutral values (no caption in export).
- Tests: `src/tests/blocked-slots.test.ts` switch exact `toEqual` on ranges to include `deviceName` (or `toMatchObject`), plus one test that the name is the placed device name with the type fallback. `e2e/dual-view.spec.ts:69` must still find the blocked visual.

## Orchestration

Strategy: phase gates (Strategy 3). File ownership is disjoint except `tokens.css`, where C owns the port block and D owns the blocked block (separate hunks, clean merge).

```
PHASE 1 (parallel)
  A  port-geometry.ts                      D  blocked-slots.ts, RackFrame.svelte, tokens.css(blocked), export/svg.ts
      | merge A, pull                          | merge any time
PHASE 2 (parallel, both need A on main)
  B  RackDevice.svelte, text-sizing.ts     C  PortIndicators.svelte, tokens.css(port)
      | merge any order, pull
PHASE 3 (orchestrator, no issue)
  Browser verification against #3450 acceptance criteria, visual baseline check, close #3450
```

Per sub-issue execution (subagents on opus or lower):

1. `git worktree add .worktree/Rackula-issue-<N> -b feat/<N>-<slug> main` (after `git pull` at each phase gate).
2. TDD where the spec lists tests (A, B helper, D); rendering-only parts (C shapes, D caption) skip unit tests per CLAUDE.md.
3. Local gate: `npm run test:run`, `npm run lint`, `npm run check` (validate has no svelte-check), prettier `--check` using the main checkout's prettier binary.
4. Commits with `git commit -s` (DCO) and `Co-Authored-By`.
5. PR with `Closes #<N>` and `Part of #3450`; wait for CodeRabbit AND CodeAnt; check `mergeStateStatus` is not DIRTY (conflicting PRs skip CI).
6. Merge, pull main, signal the next phase in the #3450 thread.

Rendering-only change, no schema or saved-data change: no upgrade-corpus fixture needed (confirm the corpus guard stays green in CI).

## Verification (Phase 3)

- Unit: `npm run test:run` green on main after all four merges.
- Browser (`/run` skill or `npm run dev` + Playwright): load a layout with Fiber Patch Panel (12 SFP), Patch Panel (24-Port), Switch (48-Port), Router on 10, 19 and 23-inch racks, front and rear. Check each #3450 acceptance criterion: no label/port overlap, 1-3 row strip, chip >24, collapse on 10-inch, a connection to a patch panel port still draws on 10-inch, shapes by medium, neutral captioned hatch, no-port devices unchanged, port click still works.
- E2E: `npm run test:e2e -- dual-view` and the visual-regression suite. Current baselines contain no port markers, so expect no diffs; if any, regenerate via the update-visual-snapshots workflow.
- Close #3450 once all sub-issues are closed and the checklist is ticked.

## First actions after approval

1. Create sub-issues A-D with `gh issue create` (bodies lifted from the sections above plus the matching #3450 acceptance criteria), link as sub-issues of #3450, milestone M006, labels `feature`/`ux`/`area:canvas` and size.
2. Save this plan to `docs/plans/2026-09-29-port-label-zones-3450.md` in a docs worktree.
3. Start Phase 1: A and D in parallel worktrees.
