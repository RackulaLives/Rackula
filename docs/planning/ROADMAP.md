---
created: 2025-11-27
updated: 2026-06-01
status: active
---

# Rackula -- Product Roadmap

Strategic vision and the active plan. For live work items, see
[GitHub Milestones](https://github.com/RackulaLives/Rackula/milestones).
For the kanban board tracking issue flow, see the
[project board](https://github.com/orgs/RackulaLives/projects/2).

---

## Vision

Rackula is a lightweight, FOSS, web-based rack layout designer for homelabbers. It prioritises:

- Simplicity -- Do one thing well: visual rack planning
- Offline-first -- Works without accounts or cloud services
- Self-hostable -- Deployable on your own infrastructure
- Community-driven -- Built by homelabbers, for homelabbers

---

## Version Philosophy

The app uses CalVer; published packages use SemVer -- versioned independently because
they address different audiences. See the decision record:
[`docs/superpowers/specs/2026-05-29-versioning-policy-calver-design.md`](../superpowers/specs/2026-05-29-versioning-policy-calver-design.md)
(resolves [#1315](https://github.com/RackulaLives/Rackula/issues/1315)).

| Artifact | Audience | Scheme | Example |
| --- | --- | --- | --- |
| **Rackula app** (web / Docker / LXC) | end users → recency | **CalVer `YY.M.MICRO`** | `v26.6.0` |
| **`@rackula/core`** (if/when published) | developers → compatibility | **SemVer** | `core/v0.4.0` |

- MICRO is a mechanical per-month counter (same month → `MICRO++`; new month → `0`),
  so there is no minor-vs-patch decision per release.
- Month is unpadded (`26.6.0`, not `26.06.0`) to stay valid-semver-shaped.
- Milestones are theme-led and sequentially ordered, not time-boxed. CalVer reflects
  the ship date, not the plan date. Multiple milestones may ship in one month.

---

## Active Plan

Milestones are thematic groups with sequential ordering. Each maps to a GitHub milestone.
Status labels show current state: complete, in progress, next, planned.

### M1 -- LXC Build & Hardening (complete)

Build the Proxmox LXC distribution and the self-host API hardening, so the eventual
public release ships secure. No public submission in this milestone -- we build and harden
first, submit in M2.

- LXC packaging: #1211 (epic), #1212 (tarball pipeline), #1213 (install files),
  plus install-pipeline polish #1233, #1234, #1238, #1239, #1240
- Self-host hardening (bundled): #1235 (systemd), #1237 (CORS HTTPS), #1269 (session
  invalidation), #1778 (write-route rate limiting), #1779 (mutating-origin policy)

### M2 -- LXC Release & Stability (in progress)

Ship LXC publicly, finish in-flight work, and close remaining hardening.

- Public release: #1214 (test on Proxmox), #1215 (submit to community-scripts),
  #1216 (icon)
- Hardening tail: #1274 (epic), #1780 (storage guardrails)
- In-flight + stability: #1390 (persistence-error UX), #1387 (error-handling epic),
  #910 (layout-store split), #756 (height slider), #571 (JSON Schema)

### M3 -- Data Format & Interop (next)

Highest-priority strategic work; also the groundwork that feeds the (still-exploratory)
`@rackula/core` library direction ([#1758](https://github.com/RackulaLives/Rackula/issues/1758)).

- Epics/initiative: #1208 (Ecosystem Interop), #1209 (Format Adapters), #570 (Dev-friendly Data Format)
- Format/interop work: #617, #618 (YAML save/load), #620 (JSZip), #627/#628/#629 (git sync),
  #746, #1113 (schema-versioning spike), #1114 (regression coverage)

### M4 -- Type Safety, Decomposition & Stability (planned)

Technical debt paydown milestone. Zero feature work. Every issue measurably improves type
safety, maintainability, or reliability.

- TypeScript strict burndown: #1705 (utils, 49 errors), #1706 (stores, 8 errors),
  #1707 (components, 23 errors), #1708 (test helpers, 4 errors) -- eliminates all 84
  suppressed `@ts-nocheck` errors across 25 files
- Component decomposition: #1396 (export.ts), #1610 (Canvas.svelte), #1398
  (EditPanel.svelte) -- splits 3 large files into focused modules
- Data-integrity bugs: #1479 (auto-import undo), #1478 (image re-keying) -- silent
  corruption bugs that threaten user layouts
- E2E infrastructure: #1423 (ESLint rule for CSS selectors), #1419 (data-testid)
- CI reliability: #1394 (lockfile sync root cause)

---

## Backlog

Everything not in the active plan lives in the Backlog milestone. Notable clusters:

- Connection / cabling -- epics #71 and #362 and their children. Note: these two epics
  overlap and spawned near-duplicate issues; reconcile them before scheduling a milestone.
- In-app YAML editor -- epic #1174 (#1175/#1176/#1178) + #1119 (ZIP de-emphasis).
- Embeddable / GIS -- epic #1210.
- Internationalisation -- epic #181.
- Taxonomy debt -- ~16 issues carry the legacy `enhancement` label without `feature`;
  worth a one-time reconciliation.

---

## Out of Scope

Features that will not be implemented:

- Backend/database requirements (beyond the optional self-host persistence API)
- User accounts (without a dedicated cloud-sync feature)
- Internet Explorer support
- Native mobile apps

---

## Contributing

See [GitHub Issues](https://github.com/RackulaLives/Rackula/issues) for ways to contribute:

- Issues labelled `ready` are available for implementation
- Issues labelled `triage` need maintainer review first
- Feature requests welcome via the issue template

---

_This document defines product vision and the active plan. For live work items, see
[GitHub Milestones](https://github.com/RackulaLives/Rackula/milestones)._
