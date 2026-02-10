---
area: planning
created: 2026-02-09
---

# Spike 1096: NetBox Homelab Curation with Startup Guardrails

**Date:** 2026-02-09  
**Issue:** #1096  
**Related:** #795

## Recommendation

Adopt a three-tranche import strategy that increases homelab coverage while keeping startup impact bounded:

1. **Phase 1 (40 devices):** high-value, mostly image-backed devices from core homelab vendors.
2. **Phase 2 (45 devices):** additional image-backed expansion across network/power/server lines.
3. **Phase 3 (55 devices):** mostly no-image backlog, shipped only if startup guardrails hold or with deferred/lazy loading.

**Keep starter library unchanged** for this spike. Expand via brand packs, not starter defaults, to avoid increasing initial interaction complexity.

## Data Sources and Reproducibility

NetBox snapshot used for this analysis:

- Repo: `git@github.com:netbox-community/devicetype-library.git`
- Branch: `master`
- Commit: `494336dd`
- Local path input: `$NETBOX_ROOT` (set this per environment, or pass `--netbox-root`)

Generation and measurement scripts added:

- Candidate generator: `scripts/generate-netbox-homelab-candidates.ts`
- Startup payload measurement: `scripts/measure-startup-payload.ts`

Artifacts generated:

- Ranked list (140 net-new): `docs/research/data/netbox-homelab-candidates-1096.csv`
- Phase 1 shortlist (40): `docs/research/data/netbox-homelab-phase1-1096.csv`
- Phase 2 shortlist (45): `docs/research/data/netbox-homelab-phase2-1096.csv`
- Phase 3 shortlist (55): `docs/research/data/netbox-homelab-phase3-1096.csv`
- Summary metrics: `docs/research/data/netbox-homelab-summary-1096.json`

## Deliverable Status

- [x] Ranked net-new candidate list with at least 100 devices (`140` generated)
- [x] Phase 1 shortlist in 30-50 range (`40` generated)
- [x] Staged import plan (phase-based + guardrails)
- [x] Baseline and projected startup/payload impact
- [x] Repeatable measurement workflow for future updates

## Candidate Summary

- Existing Rackula slugs: `646` (`66` starter + `580` brand pack)
- Net-new homelab candidates after filtering: `1324`
- Ranked list exported: `140`

Ranked list vendor distribution:

- Ubiquiti: 8
- MikroTik: 10
- APC: 10
- Eaton: 10
- Vertiv: 8
- Dell: 10
- Supermicro: 10
- HPE: 10
- Lenovo: 1
- Netgear: 9
- TP-Link: 1
- Fortinet: 9
- Palo Alto: 9
- Juniper: 9
- Cisco: 9
- Arista: 9
- SonicWall: 8

Phase quality by image availability:

- Phase 1: 33 both-side, 4 single-side, 3 no-image
- Phase 2: 43 both-side, 2 single-side, 0 no-image
- Phase 3: 5 both-side, 0 single-side, 50 no-image

## Startup Performance Baseline

Measured on current `main`-based worktree build using `scripts/measure-startup-payload.ts`:

- `TOTAL_STARTUP_JS`: `1041.63 KB raw`, `297.71 KB gzip`
- `DATA_BRANDPACKS`: `94.05 KB raw`, `11.58 KB gzip`
- `DATA_IMAGES`: `73.71 KB raw`, `16.00 KB gzip`

Per-item density model (derived from current bundle):

- Brand pack entry cost: `~0.16 KB raw`, `~0.020 KB gzip` per device (`94.05/580`, `11.58/580`)
- Image manifest entry cost: `~0.13 KB raw`, `~0.029 KB gzip` per mapped slug (`73.71/559`, `16.00/559`)

## Projected Impact by Tranche

| Tranche   | Devices | Image-mapped slugs | Projected raw delta | Projected gzip delta | Est. startup delta\* |
| --------- | ------: | -----------------: | ------------------: | -------------------: | -------------------: |
| Phase 1   |      40 |                 37 |            ~11.2 KB |              ~1.9 KB |              ~+10 ms |
| Phase 2   |      45 |                 45 |            ~13.1 KB |              ~2.2 KB |              ~+11 ms |
| Phase 3   |      55 |                  5 |             ~9.5 KB |              ~1.2 KB |               ~+7 ms |
| **Total** | **140** |             **87** |        **~33.8 KB** |          **~5.3 KB** |          **~+28 ms** |

\* Estimated transfer on slow mobile (~200 KB/s effective gzip throughput) plus minimal parse overhead.

## Guardrails and Rollout Rules

1. **Payload guardrails**

- `TOTAL_STARTUP_JS gzip` must stay `<= 304 KB` through Phase 2.
- `DATA_BRANDPACKS gzip` must stay `<= 14 KB` through Phase 2.
- Any Phase 3 import that raises `TOTAL_STARTUP_JS gzip` above `306 KB` requires lazy-loading changes before merge.

2. **Image strategy guardrails**

- Phase 1/2 prioritize image-backed devices.
- Phase 3 no-image entries should default to category-colored rendering and avoid large image-bundle growth.

3. **Mitigation trigger**

- If any tranche breaches guardrails, split brand packs into deferred vendor chunks before continuing imports.

## Repeatable Perf-Check Workflow

```bash
# 1) Generate/review candidate sets from local NetBox clone
export NETBOX_ROOT=/path/to/devicetype-library
npx tsx scripts/generate-netbox-homelab-candidates.ts --netbox-root "$NETBOX_ROOT"

# 2) Build app
npm run build

# 3) Measure startup payload
npx tsx scripts/measure-startup-payload.ts
```

Compare script output against the guardrails in this document before approving each tranche.

## NetBox Source References

Each candidate row in the CSV files includes exact source paths under the analyzed NetBox commit, e.g.:

- `device-types/Ubiquiti/USW-WAN-RJ45.yaml`
- `device-types/APC/AP4424A.yaml`
- `device-types/Fortinet/FS-3032G.yaml`

This satisfies commit+path traceability for import decisions.

## Follow-up Issues

- #1109 - Phase 1 NetBox homelab import (40 image-priority devices)
- #1111 - Phase 2 NetBox homelab expansion (45 image-backed devices)
- #1108 - Phase 3 deferred NetBox homelab backlog (55 devices)
