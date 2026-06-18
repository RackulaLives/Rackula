# Spike #1994: Self-Hosted E2E Test Runner Architecture

**Date:** 2026-06-08 **Status:** Complete **Related:** #567, #1394, #1977, #1983, #1985

---

## Executive Summary

**Decision: E2E tests run on the ci-runner with a two-tier trust model. Your PRs auto-run; external PRs require your approval.**

The spike's original question -- "How should Rackula migrate E2E testing from GitHub-hosted to self-hosted?" -- is answered with a **two-tier model** using GitHub Environments:

1. Trusted tier (auto-run): PRs from `ggfevans` and RackulaLives org members use the `e2e-trusted` environment, which has no required reviewers. The full E2E suite (chromium + webkit + mobile) runs on `ci-runner` automatically.

2. Approval tier (manual gate): PRs from external contributors use the `e2e-approval` environment, which requires `ggfevans` as a required reviewer. The job pauses until you review the PR diff and click approve. This prevents untrusted code from executing on the homelab VM without your explicit consent.

3. Fallback (always): All PRs also run the chromium smoke test on `ubuntu-latest` as a baseline. The self-hosted job is additive -- it provides broader browser coverage on top of the GH-hosted smoke.

Implementation uses GitHub's built-in Environment protection rules -- no custom code, full audit trail. The workflow selects the environment dynamically based on the PR source:

```yaml
e2e-self-hosted:
  runs-on: [self-hosted, ci-runner]
  environment: ${{ github.event.pull_request.head.repo.full_name == 'RackulaLives/Rackula' && 'e2e-trusted' || 'e2e-approval' }}
```

This means the ci-runner is only used for PRs you've implicitly trusted (your own) or explicitly approved. No unattended self-hosted CI for untrusted code.

The real performance optimizations are **Playwright browser caching** (done, saves ~55s per PR run) and **CI pipeline tuning** (sharding, retry reduction, parallel jobs), which together can cut PR gate time by ~40% and weekly full-suite time by ~60%. See the [CI Performance Analysis](#ci-performance-analysis) section for details.

---

## Security Analysis

### Self-Hosted Runners on Public Repos: Risks and Mitigations

GitHub's own documentation warns: **"We recommend that you do not use self-hosted runners for public repositories."** The attack model is straightforward:

| Vector | Description | Severity | Mitigated By |
| --- | --- | --- | --- |
| Arbitrary code execution | `npm ci` + `npx playwright install` runs any postinstall script | Critical | Environment approval gate |
| PR author trust | Direct repo collaborators bypass fork-PR approval | High | Trusted-actor bypass only for ggfevans |
| Lateral movement | ci-runner on pve-rusty, same host as production | High | Approval gate limits exposure window |
| Secret exfiltration | Environment variables, runner tokens accessible | High | Approval gate + ephemeral runner pattern |
| Supply chain | Compromised npm package executes in runner context | Medium | Approval gate + dependency review before approving |

**The two-tier model addresses these risks:**

| Risk Tier | Environment | Who Can Trigger | Approval Required | Runner |
| --- | --- | --- | --- | --- |
| Trusted | `e2e-trusted` | ggfevans, org members | No (auto-runs) | ci-runner |
| Approval | `e2e-approval` | Any external contributor | Yes (ggfevans reviews) | ci-runner |
| Baseline | none | Everyone | No | ubuntu-latest (ephemeral) |

**Key property:** No code runs on ci-runner without either (a) coming from a trusted author, or (b) being explicitly reviewed and approved by a trusted author. This is the same trust model as clicking "Merge" on a PR.

### Why the Two-Tier Model Works

The original #1977 mitigations were designed for **trusted-actor** jobs (tag push by maintainer). The two-tier E2E model extends this:

| Mitigation | LXC Gate (tag push) | Trusted E2E (ggfevans PR) | Approval E2E (external PR) |
| --- | --- | --- | --- |
| Trigger | Tag push only | PR from org member | PR from external contributor |
| Approval | N/A (trusted actor) | N/A (trusted actor) | ggfevans must review and approve |
| Label confinement | `pve-rusty` on gate job only | `ci-runner` on E2E job only | `ci-runner` on E2E job only |
| Non-root `ci` user | Yes | Yes | Yes |
| Audit trail | GitHub Actions log | GitHub Actions log | GitHub Actions log + approval record |

The approval gate means you review the PR diff before code executes on your homelab VM. This is equivalent to code review before merge -- you wouldn't merge untrusted code without reviewing it either.

### Trust Boundary Model

```
              APPROVAL GATE
              ══════════════
     External PRs require ggfevans approval
     before any code runs on ci-runner

  ┌──────────────────────────────────────────────────────┐
  │                  ALL PRs (baseline)                   │
  │                                                      │
  │  ┌─────────────────┐                                 │
  │  │  ubuntu-latest   │  Chromium smoke test            │
  │  │  (ephemeral)     │  (always runs, no approval)    │
  │  └─────────────────┘                                 │
  │                                                      │
  │  ┌─────────────────────────────────────────────┐     │
  │  │  ci-runner (pve-rusty)                      │     │
  │  │                                              │     │
  │  │  ┌──────────────────┐  ┌──────────────────┐  │     │
  │  │  │  e2e-trusted     │  │  e2e-approval     │  │     │
  │  │  │  (ggfevans PRs) │  │  (external PRs)  │  │     │
  │  │  │  AUTO-RUNS      │  │  REQUIRES APPROVAL│  │     │
  │  │  │                  │  │                   │  │     │
  │  │  │  Full E2E:       │  │  Full E2E:        │  │     │
  │  │  │  chromium+webkit │  │  chromium+webkit   │  │     │
  │  │  │  + mobile        │  │  + mobile          │  │     │
  │  └──────────────────┘  └──────────────────┘  │     │
  │  └─────────────────────────────────────────────┘     │
  │                                                      │
  │  ┌─────────────────┐                                 │
  │  │  release.yml     │  LXC gate (tag push only)      │
  │  │  (ci-runner)     │  trusted-actor, no approval    │
  │  └─────────────────┘                                 │
  └──────────────────────────────────────────────────────┘

  ┌─────────────────┐
  │  vps-rackula     │  Deploy + smoke (to be eliminated per #1983)
  └─────────────────┘
```

**Rule: Self-hosted runners are only used for (a) trusted-actor jobs or (b) jobs with explicit human approval.**

---

## Cost/Benefit Analysis

### Current State

| Metric | Value |
| --- | --- |
| GitHub Actions cost | $0 (public repo, unlimited minutes) |
| E2E smoke per PR | ~3m20s (validate job) |
| E2E full per week | ~13m22s (chromium + webkit) |
| Playwright install overhead | ~24s per PR (chromium), ~51s per week (chromium+webkit) |
| Unit test time | ~1m42s per PR (8GB heap) |
| Total CI time per week | ~20 min (5 PRs + 1 weekly) |

### Self-Hosted E2E with Approval Gate

| Factor | Value |
| --- | --- |
| Hardware cost | $0 (ci-runner already provisioned) |
| Maintenance burden | OS patches, Playwright updates, disk cleanup (moderate, infrequent) |
| Security risk | **Low** (approval gate + trusted-actor bypass; no untrusted code without review) |
| Reliability | Single point of failure (1 runner, 1 host) -- mitigated by fallback to GH-hosted baseline |
| Scalability | 1 job at a time (queues, but self-hosted E2E is additive to GH-hosted baseline) |
| E2E coverage gain | +4 browser projects (webkit, ios-safari, ipad, android) vs chromium-only baseline |
| Dollar cost | $0 (public repos are free; self-hosted adds no GH Actions minutes) |
| Approval friction | ~2 min delay for external PRs; zero delay for ggfevans/org PRs |

### Playwright Caching (Recommended)

| Factor | Value |
| --- | --- |
| Implementation cost | 8 lines of YAML per workflow |
| Time saved | ~55s per PR run, ~80s per weekly run |
| Risk | None (standard GitHub Actions pattern) |
| Maintenance | Cache key tied to lockfile, auto-invalidates on dependency change |
| Security | No change (stays on ephemeral GH-hosted runner) |

**Net assessment:** Self-hosted E2E migration has **negative net value** (adds security risk and maintenance for zero cost savings). Playwright caching has **positive net value** (saves ~1 min per PR with zero risk).

---

## Runner Isolation Model

### Current Runner Allocation

| Runner | Host | OS | Labels | Trust | Jobs |
| --- | --- | --- | --- | --- | --- |
| `ubuntu-latest` | GitHub | Ubuntu (ephemeral) | `ubuntu-latest` | Ephemeral/untrusted | test, build, scan, lint |
| `vps-rackula` | Vultr VPS | Debian 12 | `[self-hosted, vps-rackula]` | Semi-trusted | deploy-dev smoke, deploy-prod smoke |
| `ci-runner` | pve-rusty VM | **Debian 13** (trixie) | `[self-hosted, Linux, X64, pve-rusty, ci-runner]` | Trusted (maintainer) | LXC gate, E2E (approval-gated) |

**Note on OS choice:** The ci-runner runs Debian 13 (trixie), which is lighter than Ubuntu for a CI runner role (no snap, no cloud-init bloat, minimal install). The GH-hosted `ubuntu-latest` runner stays as-is -- it's ephemeral, has excellent Playwright dependency support, and there's no security concern since it's destroyed after each job. The self-hosted runner deliberately avoids Ubuntu to reduce attack surface and disk usage.

### Recommended Runner Allocation

| Job | Runner | OS | Environment | Trust Level |
| --- | --- | --- | --- | --- |
| PR validate (lint + unit + smoke) | `ubuntu-latest` | Ubuntu (ephemeral) | none | Untrusted (all PRs) |
| PR full E2E (ggfevans/org) | `[self-hosted, ci-runner]` | Debian 13 | `e2e-trusted` | Trusted (auto-run) |
| PR full E2E (external) | `[self-hosted, ci-runner]` | Debian 13 | `e2e-approval` | Approved (manual gate) |
| Full E2E (weekly, tag push) | `ubuntu-latest` | Ubuntu (ephemeral) | none | Trusted (workflow_call from release) |
| CodeQL + Trivy | `ubuntu-latest` | Ubuntu (ephemeral) | none | Untrusted (PR-triggered) |
| Docker build (multi-arch) | `ubuntu-latest` | Ubuntu (ephemeral) | none | Needs QEMU |
| LXC tarball build | `ubuntu-latest` | Ubuntu (ephemeral) | none | Standard build |
| LXC smoke-test gate | `[self-hosted, ci-runner]` | Debian 13 | none | Trusted (tag push only) |
| Deploy dev | `[self-hosted, vps-rackula]` | Debian 12 | none | Trusted (main push) |
| Deploy prod | `[self-hosted, vps-rackula]` | Debian 12 | `prod` | Trusted (tag push + reviewer) |
| Post-deploy smoke | `[self-hosted, vps-rackula]` | Debian 12 | none | Trusted (after deploy) |

### VPS Elimination (#1983) Impact

When the VPS is decommissioned (#1985, #1986):

- Dev deployment moves to homelab (Cloudflare Tunnel or Tailscale Funnel)
- Prod deployment moves to Cloudflare Worker (static site, #1984)
- Deploy smoke tests move to `ci-runner` or become health checks
- The `vps-rackula` runner label is retired

---

## Recommendations

### 1. Two-Tier E2E Model with Environment Approval Gate

Create two GitHub Environments in the RackulaLives org:

| Environment | Required Reviewers | Deployment Branch Policy | Purpose |
| --- | --- | --- | --- |
| `e2e-trusted` | None | `main` only | Auto-runs for ggfevans/org PRs |
| `e2e-approval` | `ggfevans` | Any branch | Pauses for approval on external PRs |

The `test.yml` workflow gains a second E2E job:

```yaml
jobs:
  validate:           # Existing: lint + unit + chromium smoke on ubuntu-latest
    runs-on: ubuntu-latest
    ...

  e2e-self-hosted:    # New: full E2E on ci-runner with approval gate
    runs-on: [self-hosted, ci-runner]
    environment: ${{ github.event.pull_request.head.repo.full_name == 'RackulaLives/Rackula' && 'e2e-trusted' || 'e2e-approval' }}
    needs: validate   # Only runs after baseline smoke passes
    steps:
      - uses: actions/checkout@...
      - name: Install dependencies
        run: npm ci
      - name: Cache Playwright browsers
        uses: actions/cache@...
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      - name: Run full E2E tests
        run: npm run test:e2e
```

**Properties:**

- Your PRs auto-run the full E2E suite on ci-runner (trusted, no approval delay)
- External PRs pause until you review and approve (approval gate)
- All PRs always get the baseline chromium smoke on `ubuntu-latest` (untrusted, no approval)
- The `needs: validate` ensures self-hosted E2E only runs after baseline passes
- Full audit trail in GitHub Actions logs and Environment approval history

### 2. Add Playwright Browser Caching (Done)

Already implemented in this PR for `test.yml` and `test-full.yml`. Reduces browser install from ~60s to ~5s on cache hits.

### 3. Reserve ci-runner for Approval-Gated Jobs

The `ci-runner` should only run jobs with explicit trust guarantees:

- `e2e-trusted` environment (ggfevans/org PRs, auto-approved)
- `e2e-approval` environment (external PRs, manually approved)
- LXC smoke-test gate (#1977, tag push by maintainer)
- Post-deploy smoke tests (#567, after deploy completes)

### 4. Scope Post-Deploy Smoke Enrichment (#567)

The current deploy smoke test is a thin curl health check. Enriching it with Playwright would provide real browser verification. This is a **trusted-actor job** (runs after deploy, triggered by maintainer push), making it suitable for self-hosted runners. Scope:

- Browser: chromium only (keep it fast)
- Tests: load the app, verify canvas renders, check version endpoint
- Environment: VPS (current) or ci-runner (after VPS elimination)
- Separate from PR E2E: this tests deployment, not code changes

### 5. CI Performance Tuning (Separate Issues)

See the [CI Performance Analysis](#ci-performance-analysis) section. Key issues:

- #1999: Shard full E2E suite across parallel runners
- #2000: Reduce Playwright retries from 2 to 1/0
- #2001: Add github/list reporters for CI visibility
- #2002: Replace waitForTimeout with assertion-based waits

---

## CI Performance Analysis

Beyond the "should we migrate" question, the spike also needs to address **CI and E2E performance**. This section covers measured bottlenecks and actionable improvements.

### Current CI Timing

**PR gate (`test.yml`): ~3m20s wall clock**

| Step                            | Time         | % of total |
| ------------------------------- | ------------ | ---------- |
| Install dependencies            | 9s           | 5%         |
| Run linter                      | 37s          | 19%        |
| Run unit tests                  | 102s (1m42s) | **51%**    |
| Install Playwright browsers     | 24s          | 12%        |
| Run smoke E2E tests             | 16s          | 8%         |
| Other (checkout, setup, upload) | ~52s         | 26%        |

**Weekly full suite (`test-full.yml`): ~13m22s wall clock**

| Step | Time | % of total |
| --- | --- | --- |
| Install dependencies | 12s | 2% |
| Run linter | 38s | 5% |
| Run unit tests | 106s (1m46s) | 13% |
| Install Playwright browsers (chromium+webkit) | 51s | 6% |
| **Run full E2E tests** | **576s (9m36s)** | **72%** |
| Other | ~35s | 4% |

### Bottleneck Ranking (by impact)

| # | Bottleneck | Impact | Effort | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | Full E2E suite 9m36s (6 projects, no sharding) | 72% of weekly time | Medium | Add sharding to `test-full.yml` |
| 2 | Unit tests 1m42s (8GB heap, memory pressure) | 51% of PR time | Medium | Investigate memory usage, split test files |
| 3 | `retries: 2` on all configs | Up to 2 extra runs per failure | Low | Reduce to `1` for CI, `0` for dev |
| 4 | Sequential validate job (lint then test then E2E) | No parallelism within job | Medium | Split into parallel jobs |
| 5 | Playwright install 24-51s | 12% of PR, 6% of weekly | Low (done) | Already addressed with caching |
| 6 | Silent CI reporter (HTML only) | No visibility during runs | Low | Add `"list"` or `"github"` reporter |
| 7 | Hard sleeps in tests (`waitForTimeout`) | Fixed delays, not condition-based | Low | Replace with assertion-based waits |
| 8 | Dev config has `retries: 2` | Slows local feedback | Low | Set to `0` |

### Recommendations by Priority

#### Priority 1: E2E Sharding (saves ~5 min/week)

Split the full E2E suite across 2-4 parallel GitHub Actions runners using `--shard`:

```yaml
# test-full.yml: matrix strategy for sharding
strategy:
  matrix:
    shard: [1/2, 2/2] # or [1/4, 2/4, 3/4, 4/4] for more parallelism
steps:
  - name: Run full E2E tests
    run: npx playwright test --config e2e/playwright.config.ts --shard ${{ matrix.shard }}
```

This cuts the 9m36s E2E wall clock to ~5m with 2 shards or ~3m with 4 shards. Trade-off: uses 2-4x more GitHub Actions minutes (free for public repos).

#### Priority 2: Reduce Retries (saves ~16s per failed smoke, ~5m per failed full)

```diff
# playwright.smoke.config.ts (CI smoke)
- retries: 2,
+ retries: 1,

# playwright.config.ts (CI full)
- retries: 2,
+ retries: 1,

# playwright.dev.config.ts (local dev)
- retries: 2,
+ retries: 0,
```

Industry standard: `1` retry for CI (accounts for flakiness), `0` for dev (fast feedback). The current `2` means a failing test runs 3 times before reporting failure, adding unnecessary time.

#### Priority 3: Parallel CI Jobs in test.yml

Split the `validate` job into parallel sub-jobs:

```
api (existing) ─────────────────┐
lint ────────────────────────────┤
unit-tests ──────────────────────├──> smoke-e2e (depends on unit-tests passing)
smoke-e2e ──────────────────────┘
```

This requires restructuring `test.yml` from a single sequential job to a job dependency graph. The lint and unit-test steps can run in parallel with the API job, and the E2E smoke only runs after unit tests pass (gate).

#### Priority 4: CI Reporter (visibility, not speed)

```diff
# playwright.config.ts
- reporter: [["html", { open: "never" }]],
+ reporter: process.env.CI
+   ? [["github"], ["html", { open: "never" }]]
+   : [["html", { open: "never" }]],
```

The `github` reporter annotates PR diffs with test failures. Combined with `"list"` for console visibility, this doesn't speed up tests but makes failures immediately visible without downloading the report artifact.

#### Priority 5: Remove Hard Sleeps

Replace `waitForTimeout` calls with assertion-based waits:

```diff
- await page.waitForTimeout(1500);
+ await expect(page.getByTestId('save-indicator')).toBeVisible();
```

This eliminates fixed delays and makes tests more reliable. Affected files: `e2e/android-chrome.spec.ts`, `e2e/persistence.spec.ts`.

---

## Out of Scope

- VPS elimination (#1983, #1985, #1986) - separate epic
- Gated release pipeline implementation (#1977) - already in progress
- E2E selector migration (spike #1393) - separate concern
- Moving any PR-triggered job to self-hosted runners without an approval gate - explicitly rejected
- The `e2e-approval` environment must require `ggfevans` as a reviewer; no bypassing this for external PRs
