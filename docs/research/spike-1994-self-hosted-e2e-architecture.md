# Spike #1994: Self-Hosted E2E Test Runner Architecture

**Date:** 2026-06-08
**Status:** Complete
**Related:** #567, #1394, #1977, #1983, #1985

---

## Executive Summary

**Decision: PR-triggered E2E tests stay on GitHub-hosted runners. The ci-runner is reserved for trusted-actor jobs only.**

The spike's original question -- "How should Rackula migrate E2E testing from GitHub-hosted to self-hosted?" -- has a clear answer: **don't**. Public repositories get unlimited GitHub Actions minutes at zero cost. Moving PR-triggered E2E to a self-hosted runner would introduce an unacceptable attack surface for zero dollar savings.

Instead, the real optimization is **Playwright browser caching**, which reduces install overhead from ~60s to ~5s per run. This addresses the only legitimate performance concern without any security trade-off.

The ci-runner (VMID 300, pve-rusty) should remain exclusively for trusted-actor jobs: the LXC smoke-test gate (#1977) and potentially enriched post-deploy smoke tests (#567).

---

## Security Analysis

### Why Self-Hosted Runners on Public Repos Are Dangerous

GitHub's own documentation warns: **"We recommend that you do not use self-hosted runners for public repositories."** The attack model is straightforward:

| Vector | Description | Severity |
|--------|-------------|----------|
| Arbitrary code execution | `npm ci` + `npx playwright install` runs any postinstall script from any dependency | Critical |
| PR author trust | Direct repo collaborators bypass fork-PR approval entirely | High |
| Lateral movement | ci-runner is on pve-rusty, same host as production workloads | High |
| Secret exfiltration | Environment variables, runner tokens accessible to `ci` user | High |
| Supply chain | Compromised npm package executes in runner context | Medium |

### Why #1977 Mitigations Don't Apply Here

The gated release pipeline (#1977) has specific mitigations designed for **trusted-actor** jobs:

| Mitigation | LXC Gate (tag push) | PR E2E (any PR) |
|------------|---------------------|------------------|
| Fork-PR approval policy | Protects against unknown actors | Irrelevant for direct collaborators |
| Orchestrator-only triggers | Yes, tag push only | No, triggered by any PR |
| Label confinement (`pve-rusty`) | Single gate job | Any `runs-on: [self-hosted]` job matches |
| Non-root `ci` user | Reduces privilege escalation | Doesn't prevent data exfiltration |
| Disposable VM | VM can be recreated after compromise | Not disposable between PRs (state persists) |

The fundamental difference: the LXC gate runs only when a maintainer pushes a tag (trusted event). PR E2E runs for **every pull request** (untrusted event).

### Trust Boundary Model

```
                        TRUST BOUNDARY
                        ═══════════════
                              
  UNTRUSTED CODE                    TRUSTED ACTORS
  ─────────────                    ───────────────
  Any PR author                    Maintainer tag push
  Any fork PR                      Deploy pipeline
  Any npm dependency               LXC smoke test
                              
  ┌─────────────────┐              ┌─────────────────┐
  │  ubuntu-latest   │              │   ci-runner      │
  │  (ephemeral)     │              │   (pve-rusty)    │
  │                  │              │                  │
  │  test.yml        │              │  release.yml     │
  │  test-full.yml   │              │  (LXC gate)      │
  │  codeql.yml      │              │                  │
  │  trivy.yml       │              │  deploy-prod.yml │
  │  build-lxc.yml   │              │  (future: rich   │
  │  octocov.yml     │              │   smoke test)    │
  │  ...             │              │                  │
  └─────────────────┘              └─────────────────┘
                                         ▲
                                         │
  ┌─────────────────┐                    │ (VPS runner,
  │  vps-rackula     │────────────────────┘  to be eliminated
  │  (Vultr VPS)     │                       per #1983)
  │                  │
  │  deploy-dev.yml  │
  │  deploy-prod.yml │
  │  (smoke tests)   │
  └─────────────────┘
```

**Rule: Untrusted code never reaches self-hosted runners.**

---

## Cost/Benefit Analysis

### Current State

| Metric | Value |
|--------|-------|
| GitHub Actions cost | $0 (public repo, unlimited minutes) |
| E2E smoke per PR | ~3-5 min (chromium install + test) |
| E2E full per week | ~32 min (chromium + webkit) |
| Playwright install overhead | ~60s per run (cold), ~0s (cached) |
| Total CI time per week | ~1-2 hours |

### Self-Hosted Migration

| Factor | Value |
|--------|-------|
| Hardware cost | $0 (ci-runner already provisioned) |
| Maintenance burden | OS patches, Playwright updates, disk cleanup, monitoring |
| Security risk | Critical (untrusted code execution on homelab VM) |
| Reliability | Single point of failure (1 runner, 1 host) |
| Scalability | 1 job at a time (queues behind other jobs) |
| Dollar savings | $0 (public repos are free) |

### Playwright Caching (Recommended)

| Factor | Value |
|--------|-------|
| Implementation cost | 8 lines of YAML per workflow |
| Time saved | ~55s per PR run, ~80s per weekly run |
| Risk | None (standard GitHub Actions pattern) |
| Maintenance | Cache key tied to lockfile, auto-invalidates on dependency change |
| Security | No change (stays on ephemeral GH-hosted runner) |

**Net assessment:** Self-hosted E2E migration has **negative net value** (adds security risk and maintenance for zero cost savings). Playwright caching has **positive net value** (saves ~1 min per PR with zero risk).

---

## Runner Isolation Model

### Current Runner Allocation

| Runner | Host | Labels | Trust | Jobs |
|--------|------|--------|-------|------|
| `ubuntu-latest` | GitHub | `ubuntu-latest` | Ephemeral/untrusted | test, build, scan, lint |
| `vps-rackula` | Vultr VPS | `[self-hosted, vps-rackula]` | Semi-trusted | deploy-dev smoke, deploy-prod smoke |
| `ci-runner` | pve-rusty VM | `[self-hosted, Linux, X64, pve-rusty, ci-runner]` | Trusted (maintainer) | LXC gate (planned) |

### Recommended Runner Allocation

| Job | Runner | Rationale |
|-----|--------|-----------|
| PR test (api + validate) | `ubuntu-latest` | Untrusted code, must be ephemeral |
| Full E2E (weekly) | `ubuntu-latest` | Untrusted code (workflow_call from release) |
| CodeQL + Trivy | `ubuntu-latest` | Untrusted code (PR-triggered) |
| Docker build (multi-arch) | `ubuntu-latest` | Needs QEMU, not available on ARM-less self-hosted |
| LXC tarball build | `ubuntu-latest` | Standard build, no special hardware |
| LXC smoke-test gate | `ci-runner` | Trusted-actor (tag push only), needs Proxmox API |
| Deploy dev | `vps-rackula` (until #1983) | Trusted-actor (main push by maintainer) |
| Deploy prod | `vps-rackula` (until #1983) | Trusted-actor (tag push by maintainer) |
| Post-deploy smoke | `vps-rackula` or `ci-runner` | Trusted-actor, runs after deploy |

### VPS Elimination (#1983) Impact

When the VPS is decommissioned (#1985, #1986):
- Dev deployment moves to homelab (Cloudflare Tunnel or Tailscale Funnel)
- Prod deployment moves to Cloudflare Worker (static site, #1984)
- Deploy smoke tests move to `ci-runner` or become health checks
- The `vps-rackula` runner label is retired

---

## Recommendations

### 1. Do Not Migrate E2E to Self-Hosted

PR-triggered E2E tests must stay on `ubuntu-latest`. The security model is clear: untrusted code runs on ephemeral GitHub-hosted runners, trusted-actor jobs run on self-hosted runners with appropriate access.

### 2. Add Playwright Browser Caching (Immediate)

Add `actions/cache` to `test.yml` and `test-full.yml` to cache Playwright browser binaries. This reduces the ~60s install overhead to ~5s on cache hits, addressing the only performance concern without security trade-offs.

### 3. Reserve ci-runner for Trusted-Actor Jobs

The `ci-runner` on pve-rusty should only run jobs triggered by maintainers:
- LXC smoke-test gate (#1977, tag push)
- Post-deploy smoke tests (#567, after deploy completes)
- Any future jobs that need Proxmox API or homelab access

### 4. Scope Post-Deploy Smoke Enrichment (#567)

The current deploy smoke test is a thin curl health check. Enriching it with Playwright would provide real browser verification. This is a **trusted-actor job** (runs after deploy, triggered by maintainer push), making it suitable for self-hosted runners. Scope:
- Browser: chromium only (keep it fast)
- Tests: load the app, verify canvas renders, check version endpoint
- Environment: VPS (current) or ci-runner (after VPS elimination)
- Separate from PR E2E: this tests deployment, not code changes

### 5. Document the Trust Boundary

Add the runner isolation model to deployment documentation so future CI changes respect the security boundary. Any job that runs untrusted code (PR-triggered, workflow_call from test.yml) must use `ubuntu-latest`.

---

## Out of Scope

- VPS elimination (#1983, #1985, #1986) - separate epic
- Gated release pipeline implementation (#1977) - already in progress
- E2E selector migration (spike #1393) - separate concern
- Moving any PR-triggered job to self-hosted runners - explicitly rejected