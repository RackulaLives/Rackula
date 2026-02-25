# Spike: Cloudflare Analytics Archival - Pattern Analysis

**Date:** 2026-02-22
**Goal:** Turn research into practical architecture and operating patterns for a Free-plan Cloudflare + homelab stack.

---

## Recommended North Star

Primary architecture:

```text
Cloudflare GraphQL API
  -> collector (scheduled, idempotent)
  -> optional R2 staging (immutable snapshots)
  -> ClickHouse warehouse (raw + rollups + TTL)
  -> Grafana dashboards and alerts
```

Rationale:

- Works on Free plan constraints.
- Maintains long-term retention beyond Cloudflare default windows.
- Supports low-cost homelab operation with clear upgrade paths.

---

## Patterns That Matter

### Pattern 1: Pull in overlapping windows

- Poll every 5 minutes.
- Query a wider window (for example, last 10 minutes).
- Deduplicate/upsert by deterministic key.

Why:

- Handles late availability and transient failures without creating gaps.

### Pattern 2: Idempotent writes by natural key

Recommended key shape:

`zone_id + dataset + interval_start + dimensions_hash`

Why:

- Enables safe retries.
- Prevents double-counting during overlap pulls.

### Pattern 3: Two-tier retention

- Fine-grained raw interval data: short/medium retention.
- Hourly/daily rollups: long retention.

Why:

- Keeps storage/query cost predictable.
- Preserves trend visibility for long horizons.

### Pattern 4: Archive raw responses when possible

- Store source payload snapshots (R2 or local object store) before/alongside warehouse transforms.

Why:

- Allows replay after parser/schema updates.
- Provides evidence for data reconciliation.

### Pattern 5: Surface data quality explicitly

- Persist sampling/confidence metadata where provided.
- Build dashboard panels for ingestion lag and pull success rate.

Why:

- Prevents false confidence in sampled/partial windows.

---

## Architecture Options

### Option A: Exporter-first (fastest start)

```text
Cloudflare exporter -> Prometheus -> Grafana
```

Use when:

- Goal is quick operational visibility with minimal custom code.

Tradeoffs:

- Faster launch, less flexibility on dimensions/history model.

### Option B: Collector + ClickHouse (recommended baseline)

```text
GraphQL collector -> ClickHouse -> Grafana
```

Use when:

- You need deeper dimensional analysis and durable history.

Tradeoffs:

- More engineering than exporter-only, significantly better long-term analytics capability.

### Option C: Collector + R2 staging + ClickHouse (recommended if reliability matters)

```text
GraphQL collector -> R2 (staging/archive) -> ClickHouse -> Grafana
```

Use when:

- You need replay, decoupled failure domains, or offline ingest recovery.

Tradeoffs:

- Best operational resilience, slightly more moving parts.

---

## Decision Matrix

| Criterion                 | Option A Exporter | Option B Collector+CH | Option C Collector+R2+CH |
| ------------------------- | ----------------- | --------------------- | ------------------------ |
| Build speed               | High              | Medium                | Medium                   |
| Long-term flexibility     | Medium            | High                  | High                     |
| Replay after ingest error | Low               | Medium                | High                     |
| Operational complexity    | Low               | Medium                | Medium-High              |
| Free-plan compatibility   | High              | High                  | High                     |

Recommendation:

- Start with Option B.
- Add R2 (Option C) when recovery/replay needs become operationally important.

---

## Collector Design Pattern (Reference)

```text
for each dataset/window:
  discover dataset constraints (startup + periodic refresh)
  request data with deterministic order
  retry with exponential backoff on transient errors / 429
  write source snapshot (optional R2)
  upsert to warehouse using natural key
  emit run metrics (success/failure, rows, latency, watermark)
```

Minimal run metadata to persist:

- `run_id`
- `dataset`
- `window_start`, `window_end`
- `status`
- `rows_fetched`
- `rows_written`
- `duration_ms`
- `error_class` / `error_message`

---

## ClickHouse Modeling Pattern

### Table tiers

1. Raw interval table (append/upsert-friendly)
2. Latest deduplicated serving table/view
3. Hourly and daily rollup tables

### Retention policy pattern

- Raw interval table TTL: 90-180 days
- Hourly rollup TTL: 1-2 years
- Daily rollup TTL: multi-year

### Query-serving principle

- Dashboards should query rollups for long ranges and raw intervals for short-range detail.

---

## Operational Best Practices

1. Use least-privilege API tokens and rotate regularly.
2. Treat 429/5xx as first-class retry paths.
3. Alert on ingest freshness and sustained failure ratio.
4. Keep dead-letter window records for manual replay.
5. Reconcile daily totals with Cloudflare dashboard values.
6. Test restore paths for warehouse backups and staged objects.

---

## Phased Rollout

### Phase 1: Baseline archive

- Build collector for core datasets.
- Persist to ClickHouse with idempotent keys.
- Ship first Grafana dashboard pack.

### Phase 2: Hardening

- Add run observability, alerting, and replay controls.
- Implement reconcile jobs for recent windows.

### Phase 3: Durability upgrade

- Add R2 staging/archive with lifecycle policies.
- Add replay tooling from staged snapshots.

---

## Recommended Default for This Spike

For the stated requirements (Free plan, homelab, long retention):

1. Implement Option B now.
2. Plan for Option C once reliability/replay requirements are validated in production.
