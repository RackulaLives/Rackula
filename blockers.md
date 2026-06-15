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

## Maintainer-gated (do NOT auto-execute; surface as ready and stop)
- #2029 (M02 prod cutover)
- #2134 (M02 dev cutover re-point)
- #1986 (M02 VPS decommission, 7-day soak)
