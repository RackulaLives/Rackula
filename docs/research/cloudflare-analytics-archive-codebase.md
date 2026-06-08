# Spike: Cloudflare Analytics Archival - Codebase Exploration

**Date:** 2026-02-22
**Scope:** What Rackula already has (and does not have) that affects a Cloudflare analytics archival pipeline.

---

## Files Examined

- `docs/deployment/SELF-HOSTING.md`
- `deploy/security-headers.conf`
- `deploy/lxc/security-headers.conf`
- `docs/reference/SPEC.md` (deployment sections)
- `deploy/docker-compose.persist.yml`

---

## Current State in Rackula

### 1. No existing analytics data pipeline

Rackula has no existing data pipeline in-repo for pulling analytics from third-party APIs.

Implication:

- Cloudflare analytics archival should be treated as adjacent infrastructure, not as a feature extension of current app functionality.

### 2. Self-hosting is container-first and already homelab-oriented

`docs/deployment/SELF-HOSTING.md` provides Docker and LXC-oriented operational guidance with persistence and hardening.

Implication:

- Running a collector + database + visualization stack outside the app is consistent with existing deployment philosophy.
- The project already expects operators to run sidecar/adjacent services for infra concerns.

### 3. Security posture already distinguishes hosted vs LXC variants

- `deploy/security-headers.conf` defines CSP headers for the hosted deployment.
- `deploy/lxc/security-headers.conf` adjusts headers for self-hosted installs.

Implication:

- A Cloudflare archival system should not require broad CSP relaxations in the Rackula frontend.
- Keep ingestion/warehouse access off the app origin where possible (separate infra plane).

---

## Integration Opportunities

### Natural integration points (low coupling)

1. Operational docs under `docs/guides/`:
   - Add a guide for Cloudflare analytics archival as optional homelab infrastructure.
2. Deployment assets under `deploy/`:
   - Optional compose manifests for collector/ClickHouse/Grafana, separate from core app compose.
3. Observability metadata:
   - Use environment docs conventions already present in `SELF-HOSTING.md`.

### What not to couple into Rackula app runtime

- Do not inject Cloudflare API calls directly into the browser app.
- Do not make app startup depend on archival pipeline availability.

---

## Gaps Identified

1. No existing collector framework or job runner in repository.
2. No warehouse schema conventions for time-series/aggregate analytics.
3. No dashboard artifacts for external operational metrics.
4. No documented token lifecycle practice for Cloudflare API credentials.

---

## Codebase-Grounded Constraints

1. Maintain Rackula's lightweight/static app architecture.
2. Keep self-hosting defaults simple; archival stack should be optional.
3. Preserve strict separation:
   - App functionality vs
   - CDN/edge analytics archival (Cloudflare GraphQL extracts).
4. Favor infrastructure composition over app-level complexity.

---

## Conclusion

Rackula's codebase is compatible with a Cloudflare analytics archival initiative, but it should be implemented as a separate ops/data system. The repository is a good place for documentation and optional deployment templates, not for embedding the collector into the application runtime.
