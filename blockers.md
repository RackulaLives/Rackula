# Blockers

## Risks / watch items (not hard blockers yet)
- CodeRabbit org credit + per-developer hourly rate limit hit on PR #2305
  (2026-06-15 02:52 UTC). Resets over time, but the merge gate requires a clean
  CodeRabbit pass on every feature PR. Pace waves and space commits to avoid
  starving reviews. If it hard-blocks merges, escalate to maintainer (billing /
  review add-on decision).
- CodeAnt IS active on this repo (commented on #2305), contradicting the
  orchestration prompt's "CodeAnt is not active" assumption. Treat as an extra
  advisory reviewer; merge gate stays green CI + clean CodeRabbit.

## Needs maintainer ratification (genuine ambiguity - HELD, not dispatched)
- schema_version 1.0 -> 2.0 bump. Carrier-first removed PlacedDevice.slot_position
  (a field removal = MAJOR per #1113). Classification recorded on epic #2158
  (comment 4704905413). The emit-bump AND the app's supported-major must move together
  with the reject-newer-major gate #2205, coordinated with the #571 publish chain.
  #2205 is HELD: its reject gate cannot be cleanly built until the 2.0 target is
  ratified, otherwise carrier-era 2.0 files get rejected by an app still pinned to
  major 1. ACTION: maintainer go-ahead to emit "2.0" and set supported-major to 2.

## Environment constraints (this container, post-resume)
- Container was reclaimed/re-cloned fresh: no node_modules present. Every dev-issue
  subagent must run npm install first (network-dependent, slow).
- Subagents share the SAME working dir (/home/user/Rackula); a plain `git checkout -b`
  in cwd makes concurrent agents race. Dispatch dev agents with `git worktree add`
  isolation, or run them serially. Do not run >1 dev agent in the bare cwd.

## Maintainer-gated (do NOT auto-execute; surface as ready and stop)
- #2029 (M02 prod cutover)
- #2134 (M02 dev cutover re-point)
- #1986 (M02 VPS decommission, 7-day soak)
