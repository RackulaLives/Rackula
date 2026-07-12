# UI friction remediation: orchestration goal

This is the execution goal for /orchestrate-issues. Source of truth for all findings: docs/research/ui-friction-review-2026-07-11.md (the report). This file tells the orchestrating session how to file and land every candidate issue in the report's breakdown. Do not re-review the app; the findings are verified.

## Skills and model policy

- Invoke superpowers:subagent-driven-development and follow it for every issue: fresh implementer subagent per task, task reviewer after each, fix loop until approved, final whole-branch review before the PR. Task briefs and diffs move as files, not pasted text.
- Invoke superpowers:receiving-code-review before responding to any CodeRabbit, CodeAnt, or human review comment. Verify against the codebase before implementing, push back with technical reasoning when a suggestion is wrong for this codebase, no performative agreement, reply to inline comments in their threads.
- Model policy: dispatch every subagent (implementer, task reviewer, fixer, final reviewer) with model sonnet, stated explicitly on each dispatch. If a subagent reports BLOCKED and the blocker is reasoning capability rather than missing context, re-dispatch that one task on opus. Never dispatch subagents on the session's own model.
- The using-superpowers rule applies throughout: if a skill plausibly applies, invoke it before acting (systematic-debugging on any unexpected test failure, writing-plans if an issue turns out larger than its brief).

## Phase 0: preconditions

1. Land PR #2985 (the report, branch docs/ui-friction-review) first: wait for CodeRabbit approval AND CodeAnt to finish (CodeAnt reviews as a PR comment, not a status check, and posts inline findings after its "finished reviewing" comment; read the inline comments). Docs-only, so no deploy will trigger. After merge, pull main and confirm the report exists at docs/research/ui-friction-review-2026-07-11.md.
2. Duplicate check before filing anything: search open issues for each finding topic (gh search issues) and grep recent git log. Any report item already fixed or already filed gets linked, not re-filed. Known adjacent work: #2961 (undo active rack), #2777 (palette browsing-mode Enter), #2608 (conflict prompt), epic #1928 (connectivity; explicitly out of scope here).
3. Create the campaign scaffolding: a milestone following the existing M-number convention (next free number, title like "M0XX -- UI Friction Remediation"), a label ui-friction-review, and an epic tracking issue that lists all filed issues as a checklist and links the report.

## Phase 0b: file the issues

File the 24 candidate issues exactly as broken down in the report's "Candidate issue breakdown" section, one issue per numbered item, into the new milestone with the campaign label. Each issue body is derived from the report's corresponding R sections and must contain: Summary (one paragraph, cite the R refs and the report path), Acceptance Criteria (behavioural, testable), Technical Notes (the file:line evidence from the report), and Test Requirements filtered by the project testing policy in CLAUDE.md (high-value behaviour tests only; many copy-only issues need none).

Completeness sweep: after filing, walk the report's R-items and confirm every one maps to a filed issue or a deliberate skip. Known gap to fix while filing: R5 (palette ".zip" label downloads .yaml, plus the save-verb naming) is in the quick-wins table but missing from the breakdown; fold it into the wave 6 registry issue (item 10). Reasonable deliberate skips: R20c and R20d (canvas overview and mobile fit, both medium-effort minors; file them but tag them nice-to-have so they can trail), R28g/R28h (defensible current behaviour; file as polish or skip with a note on the epic), R32/R32b (epic #1928 scope; do not file).

## Execution plan: phase gates (strategy 3)

The report's waves are internally conflict-free but not mutually independent. Re-derive the file-conflict graph from the actual issue bodies before fanning out; the known cross-wave conflicts and the resulting gate structure are:

- dispatch.ts is shared by wave 5 (removal policy) and wave 6 (palette registry): sequence 5 before 6, or vice versa; do not run concurrently.
- dialog-actions.ts is shared by wave 5 and wave 8 (rack naming): sequence.
- App.svelte and the toast/backup-nudge files are shared by wave 2 (replace-flow guards) and wave 9 (toast system): sequence 2 before 9.
- yaml.ts and load-pipeline.ts are shared by wave 2 and wave 3 (error copy): sequence 2 before 3.
- Wave 11 item 23 (shared button component) touches 13 dialog components: it runs LAST, after every other dialog-touching wave, or it will conflict with everything.

Suggested phases (re-derive if issue bodies say otherwise):

1. Phase A, solo: wave 1, the Chromium save hotfix (report R1). One issue, one PR. After it merges, comment on the epic asking gvns whether to cut a release for it; do not run /release yourself.
2. Phase B, parallel tracks (disjoint files): wave 2 then 3 (replace guards, then error copy) as one sequential track; wave 4 (placement interaction) as a parallel track; wave 7 (a11y pack) as a parallel track; wave 10 (edit-panel consistency) as a parallel track.
3. Phase C: wave 5 (removal policy), then wave 6 (palette registry) and wave 8 (rack lifecycle) in parallel once 5 is merged.
4. Phase D: wave 9 (toast system, after wave 2 is merged).
5. Phase E: wave 11 item 22 (copy sweep), then item 23 (shared button refactor) last. Item 24 (starter interfaces) is independent and can slot into any phase.

Within a wave, apply the execute-by-file rule: if two issues in the same wave turn out to share a file, combine them into one branch and one PR that closes both issues, rather than two conflicting PRs.

## Per-issue execution contract

For each issue:

1. Worktree, always: git worktree add .worktree/Rackula-issue-XXXX -b fix/XXXX-desc main (never edit the main checkout). Pull main first at every phase gate.
2. Execute via subagent-driven-development with sonnet subagents. TDD where the issue's Test Requirements call for tests; skip tests for copy-only changes per the testing policy, which overrides any AC that demands low-value tests.
3. Before push: run the main checkout's prettier binary on touched files (the worktree pre-commit hook cannot resolve prettier), run npm run lint and the relevant unit tests, and run npm run check whenever types were touched (the validate gate does not include svelte-check). Push with --no-verify only after those pass locally.
4. Every commit uses git commit -s (DCO) and ends with the Co-Authored-By line per repo convention.
5. PR per issue (or per combined-file group), linking "Closes #XXXX". No hard-wrapped markdown in PR bodies.
6. Bots: wait for CodeRabbit approval AND CodeAnt completion before merge. Read CodeAnt's inline comments, which arrive after its summary comment; a COMMENTED review can still carry a real finding. Handle all review feedback through receiving-code-review. If a PR shows mergeStateStatus DIRTY, merge main into the branch, because a conflicting PR silently skips CI.
7. Merge with gh pr merge (squash, matching repo history), return to main, pull, tick the epic checklist, and append one line to the orchestration work log.

## Work log and reporting

Keep ORCHESTRATION.md in the session workspace per the orchestrate-issues skill: strategy, phase checklists, merge order, one line per completed issue with PR number and commit. Post a progress comment on the epic at each phase gate ("Phase B complete: #A, #B, #C merged"). Final deliverable: all filed issues closed via merged PRs, the epic closed with a summary comment mapping issues to PRs, and a note listing anything deliberately deferred.

## Stopping conditions and escalation

Autonomous-mode rules from CLAUDE.md apply: do not pause between issues for confirmation. Stop only for: a test failure unresolved after 2 attempts on one issue (park that issue, comment findings on it, continue the wave), genuine ambiguity requiring a human decision (document on the issue, continue elsewhere), or all phases complete. Escalate to gvns on the epic for exactly two decisions: the release question after the wave 1 hotfix merges, and any finding-versus-plan contradiction where the report's suggestion conflicts with observed code reality (per receiving-code-review, verify first; if the report is wrong, say so on the issue and implement what is right).

## Sizing expectations

Quick wins (about 12 issues) should be one implementer dispatch each. The medium items (removal policy, keyboard placement path, replace-flow guards, toast system, a11y tab order) warrant a task brief with the report section attached and a real task-review loop. Item 23 (shared button) is the only refactor with wide blast radius: give it its own final whole-branch review on opus and run the visual smoke checks before merge.
