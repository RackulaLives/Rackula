# Spike: Cloudflare Analytics Archival Strategy (Free Plan)

**Date:** 2026-02-22
**Type:** Research spike summary

---

## Executive Summary

This spike evaluated how to retain Cloudflare analytics beyond the platform's short historical window for a homelab deployment.

### Key Findings

1. **Free-plan feasible path is GraphQL aggregation, not raw-log export.**
2. **Best primary architecture is:**
   - GraphQL collector
   - ClickHouse warehouse
   - Grafana dashboards
3. **R2 is worthwhile as optional staging/replay storage** when reliability requirements increase.
4. **D1 is not a strong staging/backup fit** for this analytics payload shape.
5. **Grafana is recommended but not exclusive**; Superset/Metabase are valid later additions for BI-style workflows.

---

## Recommended Direction

### Primary (now)

```text
Cloudflare GraphQL -> Collector -> ClickHouse -> Grafana
```

### Secondary (when needed)

```text
Cloudflare GraphQL -> Collector -> R2 staging -> ClickHouse -> Grafana
```

Add R2 when replay/fault isolation becomes operationally important.

---

## Similar Projects Reviewed

- `lablabs/cloudflare-exporter`
- `transferwise/cloudflare-prometheus-exporter`
- `rare-magma/cloudflare-exporter`
- `jorgedlcruz/cloudflare-grafana` (and forks)

Conclusion:

- Useful building blocks exist, but no single turnkey OSS stack was found for this exact end-to-end target on Free plan.

---

## Deliverables

- Codebase exploration: `docs/research/cloudflare-analytics-archive-codebase.md`
- External research: `docs/research/cloudflare-analytics-archive-external.md`
- Pattern recommendations: `docs/research/cloudflare-analytics-archive-patterns.md`

---

## Next Steps

1. Define the exact Cloudflare datasets and dimensions needed.
2. Build a minimal collector with idempotent window pulls.
3. Stand up ClickHouse + Grafana baseline dashboards.
4. Add R2 staging/lifecycle once baseline reliability is validated.
