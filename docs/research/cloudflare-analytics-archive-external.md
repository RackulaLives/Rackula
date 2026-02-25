# Spike: Cloudflare Analytics Archival - External Research

**Date:** 2026-02-22
**Scope:** Cloudflare Free-plan data extraction options, storage/tooling choices, and practical ecosystem references.

> Unless noted otherwise, limits and product behavior are captured from vendor docs reviewed around 2026-02-20 to 2026-02-22.

---

## Executive Findings

1. For Cloudflare Free plan, long-term analytics archival is realistically a GraphQL-driven aggregate pipeline.
2. Full-fidelity raw request-log workflows (Logpush-first) are tied to enterprise log products and are not the baseline for Free plan.
3. R2 is a better cloud-side staging buffer than D1 for this workload shape.
4. Grafana is a strong default visualization layer but not the only viable option.

---

## Cloudflare Data Access Landscape

### GraphQL Analytics API (primary Free-plan path)

- Rich aggregated datasets for traffic/security/performance dimensions.
- Dataset capabilities are introspectable (`enabled`, `maxDuration`, `notOlderThan`, `maxPageSize`).
- Querying must respect GraphQL and API rate limits.
- Adaptive/sampled behavior exists for some datasets and affects exact reproducibility across repeated pulls.

### Cloudflare Logs products (not baseline on Free)

- Logpush/Logpull are the route for raw request-level logs.
- Availability is plan/product dependent and generally enterprise-oriented for full zone log exports.

Inference:

- On Free plan, design for durable aggregated analytics, not raw event fidelity.

---

## Relevant Limits and Quotas (Planning Inputs)

### Cloudflare API / GraphQL

- Global API rate limit: documented at `1200 requests / 5 minutes` per user/token scope.
- GraphQL has additional per-window constraints and query shape limits.
- Practical design requirement: batched windows, retry/backoff, and query budgeting.

### D1 (why it is weak as analytics staging)

Free-tier values commonly cited in current docs:

- 500 MB per database
- 5 GB per account
- 100,000 rows written/day
- 5,000,000 rows read/day
- Time Travel: short horizon on Free

Operationally, D1 is a poor fit for bursty/high-volume append staging.

### R2 (why it is stronger as staging/archive buffer)

Free-tier values commonly cited in current docs:

- 10 GB-month standard storage
- 1,000,000 Class A operations/month
- 10,000,000 Class B operations/month
- Free egress

R2 also provides:

- S3-compatible API
- Strong consistency semantics for object operations
- Lifecycle policies for staged data expiration

---

## Existing OSS Projects with Similar Intent

### Closest references

1. `lablabs/cloudflare-exporter`
   - Prometheus exporter for Cloudflare analytics APIs
   - Includes Free-tier handling mode
   - Strong candidate for "minimal custom code" bootstrap
2. `transferwise/cloudflare-prometheus-exporter`
   - Similar exporter approach with practical GraphQL mapping references

### Additional references

- `rare-magma/cloudflare-exporter` (cron/script + TSDB pattern)
- `jorgedlcruz/cloudflare-grafana` and forks (legacy dashboard/bootstrap patterns)
- `dashflare` (related spirit, different data model path)

Key conclusion:

- No single mature OSS project was identified as turnkey for:
  - Cloudflare Free GraphQL archive
  - optional R2 staging
  - ClickHouse warehouse
  - Grafana operations dashboards

---

## Middleware and Pipeline Components

### Strong candidates

- Exporter middleware for rapid baseline metrics
- Thin custom collector for datasets/dimensions exporters do not expose
- R2 staging for replay/fault isolation

### Optional components

- Queueing between extraction and ingest (if fault domains or burst handling are needed)
- Stream processors/buffers only if throughput complexity justifies them

### Avoid as primary staging

- D1 as payload staging/backup for analytics snapshots

---

## Visualization Choices Beyond Grafana

### Grafana (default recommendation)

- Best fit for operational dashboards, alerts, and time-series workflows
- Strong integration with ClickHouse/Prometheus/Loki ecosystems

### Alternatives

- Superset: stronger BI/ad-hoc analytics exploration
- Metabase: simpler self-serve reporting UX
- Redash: SQL dashboarding option, less commonly selected for new operational stacks

Recommendation:

- Start with Grafana and add BI tooling only if users need deep ad-hoc slice/dice workflows.

---

## Cloudflare D1 vs R2 for Transitional Storage

### D1

- Better for relational control-plane metadata
- Not ideal for high-frequency, append-heavy analytics staging

### R2

- Better for immutable object snapshots and replay workflows
- Easier integration with S3-compatible ingestion tooling

Recommendation:

- Use R2 for staging/archive payloads.
- Use D1 only if you need lightweight metadata state near Workers.

---

## Source List

- Cloudflare GraphQL API: https://developers.cloudflare.com/analytics/graphql-api/
- GraphQL limits: https://developers.cloudflare.com/analytics/graphql-api/limits/
- GraphQL settings discovery: https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/
- GraphQL pagination: https://developers.cloudflare.com/analytics/graphql-api/features/pagination/
- GraphQL sampling: https://developers.cloudflare.com/analytics/graphql-api/sampling/
- Cloudflare API limits: https://developers.cloudflare.com/fundamentals/api/reference/limits/
- Cloudflare Logpush: https://developers.cloudflare.com/logs/logpush/
- Cloudflare Logpull: https://developers.cloudflare.com/logs/logpull/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- D1 time travel: https://developers.cloudflare.com/d1/reference/time-travel/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- R2 limits: https://developers.cloudflare.com/r2/platform/limits/
- R2 consistency: https://developers.cloudflare.com/r2/reference/consistency/
- R2 durability: https://developers.cloudflare.com/r2/reference/durability/
- R2 lifecycles: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/
- ClickHouse TTL: https://clickhouse.com/docs/guides/developer/ttl
- ClickHouse + Grafana: https://clickhouse.com/docs/en/integrations/grafana
- Grafana ClickHouse datasource: https://grafana.com/grafana/plugins/grafana-clickhouse-datasource/
- Superset ClickHouse support: https://superset.apache.org/docs/databases/supported/clickhouse/
- Metabase ClickHouse support: https://www.metabase.com/docs/latest/databases/connections/clickhouse
- Redash data sources: https://redash.io/help/data-sources/querying/supported-data-sources/
- lablabs exporter: https://github.com/lablabs/cloudflare-exporter
- transferwise exporter: https://github.com/transferwise/cloudflare-prometheus-exporter
- rare-magma exporter: https://github.com/rare-magma/cloudflare-exporter
