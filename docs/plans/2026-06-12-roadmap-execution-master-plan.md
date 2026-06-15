# Roadmap Execution Master Plan

> For agentic workers: this file is the entry point. Pick the active milestone, open its
> plan file (table below), and execute one task per session via /dev-issue. The GitHub
> issue body is always the source of truth: every issue touched by the 2026-06-12
> alignment audit carries an "Alignment audit (2026-06-12)" section with binding
> acceptance criteria. If a plan file and an issue disagree, the issue wins; fix the plan
> in a docs PR.

Goal: finish the post-burndown roadmap. The M14 canvas shell has shipped and M04 is
complete; M15 is trailing. The remaining work splits into three tracks that respect every
verified cross-milestone dependency: finish M15, close M02 (prod cutover, then a 7-day
soak, then VPS decommission), and drive M03 carrier-first (#2158), the one live gate still
blocking the M14 placement tail and the JSON Schema publish (#571).

Status date: 2026-06-14 (live-GitHub reconciliation applied; supersedes the 2026-06-12
snapshot). Sequencing authority: docs/planning/ROADMAP.md.

## Execution order

The post-burndown roadmap is three independent tracks, not a linear chain. M04 is complete
and the M14 shell has shipped, so the old "then strictly M03, M14" ordering no longer
applies. Run in parallel: Track A finishes M15 (all remaining issues are unblocked);
Track B closes M02 (#2029 prod cutover, 7-day soak, #1986 VPS decommission); Track C lands
M03 #2158 (carrier-first), the single live cross-track gate, which then unblocks the M14
placement tail (#2075, then palette #2212/#2213/#2214) and the JSON Schema publish (#571).
M16 (post-shell pass) and M07 and later follow per ROADMAP.

| Track | Milestone | Plan file | State |
| --- | --- | --- | --- |
| done | M04 Type Safety, Decomposition & Stability | 2026-06-12-m04-type-safety-stability-plan.md | complete (98% closed); last issue #2103 closing via PR #2301 |
| A (now) | M15 Storage Model & Data Safety | 2026-06-12-m15-storage-data-safety-plan.md | trailing; 4 features + 1 chore left, all unblocked (75% closed) |
| B (now) | M02 LXC Release & Stability | 2026-06-12-m02-release-stability-plan.md | closure path #2029 then soak then #1986 (69% closed) |
| C (now) | M03 Data Format & Interop | 2026-06-12-m03-data-format-interop-plan.md | active frontier; #2158 carrier-first in progress (12% closed) |
| tail | M14 Canvas UX Overhaul | 2026-06-12-m14-canvas-ux-overhaul-plan.md | shell complete (83%); placement tail #2075/#2212/#2213/#2214 parked behind M03 #2158 |
| after tail | M16 Post-Shell Keyboard, Help & Content | 2026-06-12-m16-post-shell-pass-plan.md | planned (3 issues) |

## Cross-milestone gates

These are the dependencies that cross plan files. A task whose gate is open must not
start. Each gate is also recorded on the issues themselves.

1. SATISFIED (2026-06-13): #2180 (M04) landed before #2037 (M15) rewrote
   src/lib/storage/manager.svelte.ts. The ride-along fallback was not needed.
2. SATISFIED for M15, ACTIVE for M02: #2091 (M15) is closed, so #2041 (closed) and #2042
   (M15, unblocked) can proceed. The storage-contract test it defines is still the bar
   that #2133 (M02) must pass.
3. SATISFIED: #2037 (M15) landed, so the dev cutover #2134 (M02) can proceed; the
   forward-compat fallback is no longer required.
4. SATISFIED: #2037 (M15) and #2187 (M14 mode-aware menu) are both closed. The rest of
   the M14 entry chain (#2073 shell, #2081, #2080, #2095) has shipped.
5. SATISFIED (2026-06-14): #617 (M15) landed, so the chip (#2035, closed) and nudge
   (#2038, ready) can ship without the custom-image guard.
6. ACTIVE (the live cross-track gate): #2158 (M03) lands before M14 placement, drag, or
   verb-bar work (#2075) and before #571 publishes the JSON Schema; #2095 templates are
   authored after the bump. #2158 is at design stage (PR #2297); the slot_position
   deletion is C5 (#2294), several blocked steps down the C1-C6 chain.
7. SATISFIED: guard rails #2098/#2099/#2100 and wave-0 designs (#2179, #2182, #2183,
   #2184, #2185) are all closed; the M14 shell slices shipped.
8. ACTIVE (M02 closure): #2029 (M02 prod cutover) plus the 7-day soak gate #1986 (VPS
   decommission) close M02. The user-data disposition AC on #2029 runs before the flip.
9. Background: waiting-external issues (#2142, #2053, #2013) never gate anything.

## Conventions for executing agents

- One issue per session: /dev-issue <number>. The skill handles worktree isolation,
  branch naming, TDD, /code-review, and the PR flow.
- Never edit the main working directory; the worktree rule applies to docs-only work
  too.
- Read the issue body fully before coding, including the audit section. Comments may
  contain link-backs to successor issues.
- Testing policy: CLAUDE.md TDD protocol decides whether tests are warranted; the
  audit ACs name the behaviours that need them (movement guards, parse pipelines,
  conflict flows).
- When a task closes an epic's last child, check the epic's close conditions in its
  body before closing it.
- If you discover scope that belongs to another milestone, file a new issue and link
  it; do not expand the current PR (split-unrelated-work rule).

## Provenance

Produced by the 2026-06-12 milestone alignment audit (multi-agent, 29 verified
findings). Restructuring applied the same day: 16 closures, 9 moves, 37 issue-body
amendments, 9 new issues (#2179-#2187), the M13 recharter (the milestone is now M16 on
GitHub), M02 closure definition, ROADMAP and canvas-UX spec updates.

Reconciled 2026-06-14 against live GitHub (multi-agent, per-milestone verification): M04
burned down to one closing straggler (#2103, PR #2301), M15 to four unblocked features,
the M14 shell shipped (placement tail parked behind M03 #2158), and M03 confirmed as just
starting rather than "burned down" (12% closed). Gates 1-5 and 7 are satisfied; gates 6
and 8 remain live. The execution order above was rewritten from a linear chain into three
parallel tracks.
