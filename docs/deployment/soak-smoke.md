# Soak Smoke

The soak-smoke workflow (`.github/workflows/soak-smoke.yml`) runs the deployed-environment smoke suite (`e2e/deploy-smoke.spec.ts`, via `e2e/playwright.smoke.config.ts`) against both live Rackula deployments on a schedule, independent of any deploy trigger. It is the standing health signal used to prove a multi-day green streak.

## What it checks

- prod: `https://count.racku.la`, public today, no Cloudflare Access token needed.
- dev: `https://d.racku.la`, the `rackula-dev` Worker behind Cloudflare Access. Authenticates with the same service-token secrets `deploy-dev.yml` uses: `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` (added by #2346), passed as env vars that `playwright.smoke.config.ts` applies as request headers. Only this leg receives them, and only this leg checks `/api/layouts` through Access (`EXPECT_SERVER_API`).

Each target runs as its own matrix leg with `fail-fast: false`, so both always run, but either leg failing marks the whole workflow run failed. That keeps the run's `conclusion` a single, unambiguous pass/fail per scheduled tick.

## Schedule

Every 6 hours at `:43` (`43 */6 * * *`), an off-peak minute chosen to avoid the `:00`/`:30` marks where most scheduled workflows across GitHub cluster.

`workflow_dispatch` is also enabled for on-demand runs (for example, to re-check immediately after a deploy).

Scheduled workflows only fire from the default branch, so the cron becomes active once this workflow merges to `main`; it does not run on pull requests.

## Reading the streak

Query recent runs directly:

```bash
gh run list --workflow=soak-smoke.yml --limit 50
```

A 7-day green streak is 7 days of consecutive runs (4 per day at the 6-hour cadence) with no `failure` conclusion in between. This was the decommission gate for #1986 (destroy the Vultr VPS). The VPS was destroyed in September 2026, so the workflow now serves as the standing health signal for both Workers; steady-state alerting on top of it is #3095.

## On failure

A failing leg uploads its Playwright HTML report as an artifact (`soak-smoke-report-prod` or `soak-smoke-report-dev`) for 7 days, the same pattern `deploy-dev.yml`'s browser smoke uses.
