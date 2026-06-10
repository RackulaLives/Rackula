---
created: 2025-11-27
updated: 2026-06-09
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
Execution order: **M02 -> M04 -> M03 -> M07 -> M05 -> M06 -> M08 -> M09 -> M10 -> M11 -> M12 -> M13**.
M15 (Storage Model & Data Safety) is in progress now, in parallel with M02/M04. M14
(Canvas UX Overhaul) slots after M04; the milestone numbers are IDs, not strict order.

M4 precedes M3 because type-safety cleanup must happen before data format changes.
Changing data formats with `@ts-nocheck` on 20 files and 84 suppressed errors risks
silent type mismatches in the data layer. M09-M13 follow M06 because they extend
connectivity and depend on enriched device models and stable data formats.

### M01 -- LXC Build & Hardening (complete)

Build the Proxmox LXC distribution and the self-host API hardening, so the eventual
public release ships secure. No public submission in this milestone -- we build and harden
first, submit in M2.

- LXC packaging: #1211 (epic), #1212 (tarball pipeline), #1213 (install files),
  plus install-pipeline polish #1233, #1234, #1238, #1239, #1240
- Self-host hardening (bundled): #1235 (systemd), #1237 (CORS HTTPS), #1269 (session
  invalidation), #1778 (write-route rate limiting), #1779 (mutating-origin policy)

### M02 -- LXC Release & Stability (in progress, 11 issues)

Ship LXC publicly and stabilise the release pipeline.

- Public release: #1211 (epic), #1214 (test on Proxmox), #1215 (submit to
  community-scripts), #1317 (submit as Unraid Community App)
- Release pipeline: #1977 (gated release pipeline), #1969 (v26.6.2 install bug)
- CI/infra: #1394 (CI/Build reliability), #567 (Playwright on self-hosted runner)
- Cleanup: #1970 (remove Umami analytics), #1011 (nginx proxy query string)

### M04 -- Type Safety, Decomposition & Stability (next, 22 issues)

Technical debt paydown that must complete before data format changes (M03) or new
features (M07, M05) can land safely. Every issue measurably improves type safety,
maintainability, or reliability.

- TypeScript strict burndown: #1705 (utils, 49 errors), #1707 (components, 23 errors)
  -- eliminates suppressed `@ts-nocheck` errors
- Component decomposition: #1388 (epic), #910 (layout.svelte.ts), #1396 (export.ts),
  #1398 (EditPanel.svelte), #1610 (Canvas.svelte), #1397 (Rack.svelte)
- Layout store decomposition: #1077 (phase 2), #1079 (phase 4), #1080 (phase 5)
- Architecture: #746 (svstate patterns spike), #1387 (error handling audit)
- Bugs: #1581 (import missing devices)
- E2E quality: #1423 (ESLint CSS rule), #1419 (data-testid), #1264 (stale selectors),
  #1420 (getByRole migration), #1227 (undo/redo E2E), #1231 (a11y E2E),
  #1222 (E2E testing epic)

### M03 -- Data Format & Interop (planned, 18 issues)

Data format foundation and interoperability. Enables later milestones (M07 device
enrichment, M08 share URLs). Must follow M04 for type safety.

- Epics/initiative: #1208 (Ecosystem Interop), #1209 (Format Adapters),
  #570 (Dev-friendly Data Format)
- Format work: #617, #618 (YAML save/load), #620 (JSZip), #627/#628/#629 (git sync),
  #1113 (schema versioning spike), #1114 (regression coverage)
- Schema: #571 (JSON Schema)
- In-app YAML editor: #1174 (epic), #1175 (viewer), #1176 (edit/apply flow),
  #1177 (lazy-load guardrails), #1178 (inline diagnostics)
- Deferred: #1119 (ZIP de-emphasis after YAML default, blocked on YAML stabilising)

### M07 -- Device Library & Image System (planned, 17 issues)

Device model enrichment, image system, and UX audit. Prerequisite for M05/M06
connectivity (ports need the enriched device model).

- Device model: #1834 (instance-level metadata), #159 (flexible device layouts epic),
  #765 (slot position control), #1402 (descending units/form factor), #843 (half-width docs)
- Image system: #1544 (discoverability & coverage epic), #1540 (UI discoverability),
  #1542 (upload UX), #1539 (docs expectations), #1541 (coverage expansion),
  #1543 (auto-generate coverage table), #1517 (pictures of assets bug),
  #1189 (manifest integrity checks)
- Import: #1283 (harden NetBox import), #1108 (Phase 3 NetBox devices),
  #1190 (vendor asset directory spike)
- UX: #788 (Edit Device Panel design audit)

### M05 -- Connectivity Core (planned, 13 issues)

The 80/20 slice: connection model, port rendering, and basic click-to-connect.
Data model fields (gender, signal_type) are in M05 because they are prerequisites
for M06's advanced features.

- Epic: #1928 (Connectivity & Pro Audio)
- Data model: #1929 (AV interface types), #1930 (PortDirection), #1944 (gender field),
  #1935 (signal_type field), #370 (port lookup indexes)
- Rendering: #1931 (ConnectionLayer/Path), #357 (port render modes),
  #358 (zoom-aware rendering)
- Store/logic: #369 (connection store with validation), #639 (cascade delete),
  #1932 (connection creation workflow desktop)
- Data: #260 (populate starter library with interface data, blocker)

### M06 -- Connectivity Advanced (planned, 8 issues)

Advanced connectivity features that depend on M05's core model. Focused on AV/pro
audio signal chain management.

- Editing: #1948 (interface list editor), #1939 (port details panel)
- Domain rules: #1945 (PatchBayNormal), #1947 (RoutingConfig),
  #1946 (ExternalEndpoint), #1936 (signal type warnings)
- Export: #1940 (patch list CSV export)
- Rendering: #612 (cross-face connection visualization)

### M08 -- Export & Share Architecture (planned, 9 issues)

Export/share stabilisation and URL shortener infrastructure.

- Epic: #1094 (Export/Share Stabilization)
- Share infra: #820 (Cloudflare Workers URL shortener), #818 (multi-rack share schema),
  #821 (share URL architecture docs), #823 (self-hosted shortener guide)
- Share dialog fixes: #1130 (QR performance), #1131 (aspect-ratio fallback),
  #1132 (responsive preview), #1133 (keyboard/screen-reader close flow)

### M09 -- Connectivity & Power Extensions (planned, 18 issues)

Extensions of M05/M06 connectivity work that depend on the core model shipping first.
Includes power distribution and multi-rack E2E testing.

- Connection UX: #264 (mobile workflow), #265 (cable details), #266 (hover highlighting),
  #258 (interface config in Add Device), #275 (mobile UX for ports)
- Rendering: #252 (port display in image mode), #356 (multi-row port layout),
  #360 (10-inch rack optimisation), #271 (console port), #269 (patch panel pass-through),
  #272 (multi-rack cable), #253 (export port indicators)
- Data/store: #268 (undo/redo for cables), #267 (external connections),
  #367 (InternalConnection generalisation)
- Power: #368 (Power interface types and InterfaceRole), #270 (power port visualisation)
- E2E: #1230 (Multi-Rack & Bayed Rack E2E)

### M10 -- Isometric, Advanced Export & GIS (planned, 10 issues)

Advanced export capabilities. High effort; evaluate feasibility before committing to all items.

- Isometric service: #299 (isometric view), #322 (standalone package), #323 (HTTP wrapper),
  #324 (PNG export), #325 (API key auth), #326 (caching), #327 (Docker containerisation)
- CAD: #1732 (DXF export), #1733 (AutoCAD add-on spike)
- Embeddable: #1210 (Embeddable Rack Visualisations & GIS, XL/DEFER)

### M11 -- Internationalization (planned, 3 issues)

i18n support. Low priority until non-English users request it.

- #181 (Epic), #183 (language store), #184 (language selector)

### M12 -- Mobile & Touch UX (planned, 4 issues)

Mobile and touch-specific interactions.

- #1091 (touch listener hardening), #1052 (device library touch), #190 (long-press zoom),
  #359 (touch-accessible port overlays)

### M13 -- UX Polish & Accessibility (planned, 8 issues)

Low-priority polish, accessibility, and content items.

- a11y: #767 (keyboard slot navigation), #106 (keyboard device placement)
- UX: #117 (help tooltips), #951 (Open from Server), #946 (splash screen)
- Content: #115 (layout templates), #114 (library virtualisation), #728 (hero video)

### M14 -- Canvas UX Overhaul (planned)

Reframes the canvas shell around "place each control where its scope lives": workspace
frame top bar, app menu, tabs over a Layouts sidebar, side panel, canvas controls,
floating object verbs, opening straight to canvas. Epic #2017. Slots after M04 so the
overhaul builds on the decomposed codebase. Storage was split out to M15.

### M15 -- Storage Model & Data Safety (in progress)

Explicit storage mode (browser/server), one honest storage chip, pre-overwrite snapshots
with echo-based conflict handling, change-based backup nudges, twin-tab safety. Epic
#2071, spike #2019. Split out of the UX overhaul; built now, in parallel with M02/M04.

---

## Triage History

### June 2026 (storage split)

Split storage out of the canvas UX overhaul: created M15 (epic #2071) and moved the
spike #2019 outputs plus 19 implementation/follow-up issues (#2034-#2045, #2057-#2064)
from M14. Filed the 12 UX shell implementation issues (#2072-#2083) into M14.


### June 2026 Triage

Organised all 94 Backlog issues into numbered milestones. Backlog reduced from 94 to 0.

- Created M07 (Device Library & Image System) and M08 (Export & Share Architecture)
- Created M09-M13 (Connectivity Extensions, Isometric/GIS, i18n, Mobile, UX Polish)
- Closed 6 issues: 4 duplicates (#263, #257, #256, #273) + 2 stale spikes (#795, #794)
- Moved #1394 from M03 to M02 (CI/infra, not data format)
- Moved #746 from M03 to M04 (architecture spike, not data format)
- Moved #1944/#1935 from M06 to M05 (data model fields belong in Core)
- Moved #368/#270/#359 out of M06 (power/mobile are different domains)
- Absorbed #1119 into M03, #1108/#1190 into M07, #1222 into M04
- Deleted stale milestones "M05 - Make Mobile suck less" and "M06 - Network cabling visualization"

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
GitHub Milestones._