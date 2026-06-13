---
created: 2025-11-27
updated: 2026-06-12
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
Execution order: **M02 -> M04 -> M03 -> M14 -> M13 -> M07 -> M05 -> M06 -> M08 -> M09 -> M10 -> M11 -> M12**.
M15 (Storage Model & Data Safety) is in progress now, in parallel with M02/M04; its
internal order is #2091 -> #2059 -> #2037 -> #2035 -> #2041 -> #2042 -> #2038 -> #2044 -> #2063,
with #617 (images in YAML) landing before the chip/nudge reach users. The milestone
numbers are IDs, not strict order.

M03 precedes M14 because the carrier-first epic (#2158) rewrites the slot/containment
model that M14's verb bars and placement work build on; sequencing them apart reworks
the canvas twice. M14 precedes M13 because the rechartered M13 is a keyboard/help pass
on the new shell. M14 precedes M07/M06 because #765/#1948/#1939 design against the
#2076 side-panel contract. Per-milestone staged execution plans live in docs/plans/
(2026-06-12-*-plan.md).

M4 precedes M3 because type-safety cleanup must happen before data format changes.
Changing data formats with `@ts-nocheck` on 20 files and 84 suppressed errors risks
silent type mismatches in the data layer. M09-M12 follow M06 because they extend
connectivity and depend on enriched device models and stable data formats. M13 is
the post-shell pass and follows M14 instead.

### M01 -- LXC Build & Hardening (complete)

Build the Proxmox LXC distribution and the self-host API hardening, so the eventual
public release ships secure. No public submission in this milestone -- we build and harden
first, submit in M2.

- LXC packaging: #1211 (epic), #1212 (tarball pipeline), #1213 (install files),
  plus install-pipeline polish #1233, #1234, #1238, #1239, #1240
- Self-host hardening (bundled): #1235 (systemd), #1237 (CORS HTTPS), #1269 (session
  invalidation), #1778 (write-route rate limiting), #1779 (mutating-origin policy)

### M02 -- LXC Release & Stability (in progress)

Ship LXC publicly, stabilise the release pipeline, eliminate the VPS, distribute.

- Cloudflare cutover: #1983/#1984 (epics), #2133 (Workers storage driver),
  #2134 (dev cutover; after #2037), #2029 (prod cutover, static-only),
  #2031 (per-PR previews), #2030/#2032, #1986 (VPS decommission gate)
- Distribution: #2008 (Unraid epic) -> #1317/#2009-#2013; LXC follow-ups #2060/#2065
  (batched upstream push), #2159 (MikroTik widths)
- Brand: #2054 (epic), #2053
- Closure = in-repo deliverables + #1986. Externally gated issues (#2142, #2053,
  #2013) carry the `waiting-external` label and do not gate closure.

### M04 -- Type Safety, Decomposition & Stability (next, 22 issues)

Technical debt paydown that must complete before data format changes (M03) or new
features (M07, M05) can land safely. Every issue measurably improves type safety,
maintainability, or reliability.

- TypeScript strict burndown: #1707 (components, reclaimed; Toolbar descoped),
  #2180 (manager.svelte.ts suppression, lands before #2037)
- Component decomposition: #1388 (epic, counts refreshed), #1396 (export.ts),
  #1398 (EditPanel composable sections; last pre-M14 slice). #910/#1397/#1610 shipped.
- Residual: #2025 (App.svelte dialog wrappers; persistence half deferred to #2037)
- Bugs/fixes: #2146 (contained-device nudge, Option A interim), #2156, #2103
- E2E quality: #1419 (data-testid; gate open), #1420, #1423, #1264, #1227, #1231
- Moved out: #1581 -> M07, #1222 -> Backlog (cross-milestone tracker)

### M03 -- Data Format & Interop (planned)

Data format foundation and interoperability. Must follow M04 for type safety and
precede M14 (carrier-first rewrites the slot model M14 builds on).

Keystone order: #1113 (versioning policy, includes all read surfaces) -> #2158
(carrier-first sub-U epic, schema bump + share-link revision; spec PR first) ->
#571 (publish JSON Schema) -> #1209 (format adapters, trimmed to NetBox).

- Epics: #570 (Dev-friendly Data Format, git-sync MVP descoped), #2158 (+#2165 docs,
  #2131 containment collision)
- Format work: #620 (single-layout ZIP save removal only; absorbed #1119),
  #1114 (YAML/legacy-ZIP regression half; git-sync half -> #2181 in M08)
- Spikes: #2186 (share-link versioning)
- Moved out: #617 -> M15 (images-in-YAML is a data-safety fix), #618 closed into it,
  #1208 -> Backlog (standing initiative)

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
- Bugs: #1581 (import missing devices, from M04). #788 closed into the M14 side-panel design; #765/#1402 design against the #2076 panel contract.

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

- #1091 (touch listener hardening), #190 (long-press zoom),
  #359 (touch-accessible port overlays). #1052 closed as input to #2094.
  Mobile design decisions for the shell arrive earlier via #2097 (M14 wave 0).

### M13 -- Post-Shell Keyboard, Help & Content Pass (rechartered 2026-06-12)

Runs after M14, against the new shell.

- a11y: #106 (keyboard device placement, rewritten against the new palette)
- Help: #117 (registry-driven tooltips, after #2096)
- Content: #728 (hero video; recorded on the new shell)
- Former contents superseded: #114 -> #2094, #115 -> #2095, #951 -> #2082/#2073,
  #767 -> #2158, #946 closed stale.

### M14 -- Canvas UX Overhaul (planned)

Reframes the canvas shell around "place each control where its scope lives": workspace
frame top bar, app menu, tabs over a Layouts sidebar, side panel, canvas controls,
floating object verbs, opening straight to canvas. Epic #2017. Runs after M03
(carrier-first #2158 lands first). Storage was split out to M15.

- Wave 0 (before any shell slice): guard rails #2098/#2099/#2100, spikes #2018/#2097,
  registry #2096, designs #2179 (browser multi-layout storage), #2182 (undo/redo),
  #2183 (E2E strategy), #2184 (i18n decision), #2185 (perf budget)
- Entry chain gates on M15 #2037 via #2187 (mode-aware menu items, split from #2073)
- Gained #2045 (export-all rides tabs)

### M15 -- Storage Model & Data Safety (in progress)

Explicit storage mode (browser/server), one honest storage chip, pre-overwrite snapshots
with echo-based conflict handling, change-based backup nudges, twin-tab safety. Epic
#2071, spike #2019. Split out of the UX overhaul; built now, in parallel with M02/M04.

Order: #2091 (TOCTOU fix, blocks snapshot trust) -> #2059 -> #2037 (explicit mode;
gates M14 entry chain and M02 #2134) -> #2035 (chip, absorbed #2064) -> #2041
(conflict flow, absorbed #2062) -> #2042 -> #2038 -> #2044 -> #2063. Gained #617
(images in YAML: browser-mode custom images currently have no durable save path, and
the chip must not certify image-dropping exports). #2045 moved to M14.

---

## Triage History

### June 2026 (alignment audit)

Cross-milestone audit of M02/M03/M04/M13/M14/M15: 29 verified findings. Closed 16
issues (shipped, superseded, or folded); moved #1581/#1222/#1208/#2045/#617/#728 and
the guard rails #2098-#2100 (into M14); rechartered M13 as the post-shell pass; pinned
the order M03 -> M14 -> M13; defined M02 closure (waiting-external label for upstream
gates); filed #2179-#2187 (storage schema design, manager.svelte.ts types, git-sync
coverage split, undo/redo semantics, E2E shell strategy, i18n decision, perf budget,
share-link versioning, mode-aware menu items).

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