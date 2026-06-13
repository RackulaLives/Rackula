# Roadmap Execution Master Plan

> For agentic workers: this file is the entry point. Pick the active milestone, open its
> plan file (table below), and execute one task per session via /dev-issue. The GitHub
> issue body is always the source of truth: every issue touched by the 2026-06-12
> alignment audit carries an "Alignment audit (2026-06-12)" section with binding
> acceptance criteria. If a plan file and an issue disagree, the issue wins; fix the plan
> in a docs PR.

Goal: take Rackula from the current state (M02/M15 in progress) to the post-overhaul
shell (M14) with no rework, in the order that respects every cross-milestone dependency
found by the 2026-06-12 alignment audit (29 verified findings).

Status date: 2026-06-12. Sequencing authority: docs/planning/ROADMAP.md.

## Execution order

M15 runs now, in parallel with M02 and M04. Then strictly: M03, M14, M13. M07 and later
follow per ROADMAP.

| Order | Milestone | Plan file | State |
| --- | --- | --- | --- |
| now | M15 Storage Model & Data Safety | 2026-06-12-m15-storage-data-safety-plan.md | in progress |
| now | M02 LXC Release & Stability | 2026-06-12-m02-release-stability-plan.md | in progress |
| now | M04 Type Safety, Decomposition & Stability | 2026-06-12-m04-type-safety-stability-plan.md | in progress |
| next | M03 Data Format & Interop | 2026-06-12-m03-data-format-interop-plan.md | planned |
| then | M14 Canvas UX Overhaul | 2026-06-12-m14-canvas-ux-overhaul-plan.md | planned |
| then | M13 Post-Shell Keyboard, Help & Content | 2026-06-12-m13-post-shell-pass-plan.md | planned |

## Cross-milestone gates

These are the dependencies that cross plan files. A task whose gate is open must not
start. Each gate is also recorded on the issues themselves.

1. #2180 (M04) lands before #2037 (M15) rewrites src/lib/storage/manager.svelte.ts,
   or rides the #2037 PR as its first commit.
2. #2091 (M15) blocks #2041 and #2042 (M15) and defines the storage-contract test that
   #2133 (M02) must pass.
3. #2037 (M15), ideally with #2041, lands before the dev cutover #2134 (M02);
   otherwise #2134 carries its forward-compat AC.
4. #2037 (M15) gates #2187 (M14 mode-aware menu items). The rest of the M14 entry
   chain (#2073 shell, #2081, #2080, #2095) depends only on #2073's shell slice.
5. #617 (M15) lands before a tagged release ships the chip (#2035) and nudge (#2038)
   to users; until then both carry the custom-image guard AC.
6. #2158 (M03) lands before M14 placement, drag, or verb-bar work (#2075) and before
   #571 publishes the JSON Schema; #2095 templates are authored after the bump.
7. Guard rails #2098/#2099/#2100 plus wave-0 designs (#2179, #2182, #2183, #2184,
   #2185) are green before any M14 shell slice merges.
8. #2029 (M02 prod cutover) plus the 7-day soak gate #1986 (VPS decommission), which
   closes M02. The user-data disposition AC on #2029 runs before the flip.
9. Waiting-external issues (#2142, #2053, #2013) never gate anything; they form a
   background track.

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
amendments, 9 new issues (#2179-#2187), M13 recharter, M02 closure definition,
ROADMAP and canvas-UX spec updates.
