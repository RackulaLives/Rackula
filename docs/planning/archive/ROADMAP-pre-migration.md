---
created: 2025-11-27
updated: 2025-12-02
status: active
---

# Rackula — Product Roadmap

Single source of truth for version planning.

---

## Version Philosophy

- **Incremental releases** — Each version is usable and complete
- **Scope discipline** — Features stay in their designated version
- **Spec-driven** — No implementation without spec
- **User value** — Each release solves real problems
- **Single rack focus** — One rack per project, no multi-rack complexity
- **Minimalism** — Keep it simple and focused
- **Consistency** — Design and behaviour should be consistent across the app
- **Accessibility** — Ensure usability for all users, including those with disabilities

---

# Roadmap Considerations

---

## High-Priority: Brand-Specific Device Libraries

**Demand signal**: 6+ upvotes, multiple mentions, competitor promised "next release"

**Requested brands**:

- **Ubiquiti** — Homelab darling, UniFi ecosystem
- **Mikrotik** — Power user favourite, RouterOS

### Priority: Option B — Curated Starter Packs

Based on existing starter library research (2025-12-11), we already have an approved 27-item generic library. The next step is brand-specific packs.

**Ubiquiti Starter Pack** (target: 15-20 devices):

- USW-Pro-24, USW-Pro-48 (switches)
- USW-Pro-24-PoE, USW-Pro-48-PoE (PoE switches)
- USW-Aggregation (10GbE)
- UDM-Pro, UDM-SE (gateway/controller)
- UNVR, UNVR-Pro (NVR)
- USP-PDU-Pro (power)
- Cloud Key Gen2+

**Mikrotik Starter Pack** (target: 15-20 devices):

- CRS326-24G-2S+ (most popular switch)
- CRS328-24P-4S+ (PoE switch)
- CRS309-1G-8S+ (10GbE switch)
- CCR2004-1G-12S+2XS (router)
- RB5009UG+S+IN (router)
- netPower series

**Effort**: Low-Medium — manual curation, leverage existing research
**Source images**: NetBox device-type library has many of these

### Future: Option A — NetBox Device-Type Library Integration

- Thousands of pre-defined devices at [netbox-community/devicetype-library](https://github.com/netbox-community/devicetype-library)
- Already using NetBox-compatible schemas
- Could import/convert on demand
- **Defer until after brand starter packs prove the model**

### Performance Consideration: On-Demand Loading

If bundled brand packs cause performance issues (app size, load time), consider:

- **On-demand download** — User clicks "Download Ubiquiti Pack" → fetches from CDN
- **Data bundled, images lazy-loaded** — Device definitions included, images fetched on first view
- **Trigger:** Revisit if total bundle exceeds ~2MB or load time exceeds 3s on slow connections

---

## Current Library Status (Reference)

**Approved Final Library (27 items)** from starter library rationalization:

| Category        | Items                                                             |
| --------------- | ----------------------------------------------------------------- |
| **Server**      | 1U Server, 2U Server, 4U Server                                   |
| **Network**     | 8-Port Switch, 24-Port Switch, 48-Port Switch, 1U Router/Firewall |
| **Patch Panel** | 24-Port Patch Panel, 48-Port Patch Panel                          |
| **Storage**     | 1U Storage, 2U Storage, 4U Storage                                |
| **Power**       | 1U PDU, 2U UPS, 4U UPS                                            |
| **KVM**         | 1U KVM, 1U Console Drawer                                         |
| **AV/Media**    | 1U Receiver, 2U Amplifier                                         |
| **Cooling**     | 1U Fan Panel                                                      |
| **Blank**       | 0.5U Blank, 1U Blank, 2U Blank                                    |
| **Shelf**       | 1U Shelf, 2U Shelf                                                |
| **Cable Mgmt**  | 1U Brush Panel, 1U Cable Management                               |

**Note**: Patch panels (24-port, 48-port) and cable management (brush panel, cable management) already in approved library.

---

### Export UX Overhaul

**Current state**: PNG and SVG export exist but output quality is rough

**Issues to address**:

- Visual polish of exported images
- Layout/composition improvements
- Filename conventions
- Preview before export

**Additional formats to consider**:

- CSV (for inventory/spreadsheet users)
- NetBox import format (ecosystem integration)

**Effort**: Medium — UX design review + implementation refinement

---

## Research / Considerations (Future)

### UPS/PDU Enhancements

**Current state**: Basic 1U PDU, 2U UPS, 4U UPS in library

**Initial scope (v0.7)**:

- `outlet_count` — Number of outlets (e.g., 8, 12, 16)
- `va_rating` — VA capacity (e.g., 1500, 3000)

**Future considerations**:

- `watt_rating` — Often derived from VA, could auto-calculate
- `outlet_type` — NEMA 5-15, C13, C19 (enum or string)
- `runtime_minutes` — Runtime at load (requires load calculation system)
- Brand-specific models: APC Smart-UPS, CyberPower, Tripp Lite, Eaton

**Representative models from research**:

- APC SMT1500RM2U, SMT2200RM2U (most common)
- CyberPower PR series (budget alternative)

**Effort**: Low-Medium
**Priority**: Medium — enhances existing functionality

---

### NAS/Storage Visual Fidelity

**Current state**: Generic 1U/2U/4U Storage in library

**Potential enhancements**:

- Drive bay visualisation (3.5" vs 2.5")
- Bay count property (4-bay, 8-bay, 12-bay, etc.)
- Drive status indicators (future)

**Popular models from research**:

- Synology RS819 (1U, 4-bay)
- Synology RS1221+ (2U, 8-bay)
- QNAP TS-832PXU (2U)

**Effort**: Medium (visual rendering work)
**Priority**: Medium — improves visual accuracy

---

### Specific Chassis/Enclosure Support

**Demand signal**: "Rosewill rack chassis" mentioned in thread

**Approach**:

- Don't model every chassis brand
- Support generic chassis types with common form factors
- Allow custom naming ("My Rosewill RSV-L4500U")
- Consider case/chassis as a device category

**Common homelab cases**:

- Rosewill RSV-L4500 series
- iStarUSA cases
- Silverstone RM series

**Effort**: Low — mostly labelling and category
**Priority**: Low-Medium

---

### Multiple Racks

**Status**: On existing roadmap, deferred from earlier scope reduction
**Competitor**: Also on their roadmap, not shipped

**Considerations**:

- Data model already supports rack arrays
- UI complexity is the challenge
- Most homelabbers have 0-1 racks (validated in scope reduction)

**Effort**: High (coordinate transforms, multi-canvas, or different approach)
**Priority**: Low — address after core single-rack experience is polished

---

### Wishlist / Shopping List Feature

**Competitor roadmap item**: "wishlist"

**Concept**:

- Mark devices as "planned" vs "installed"
- Visual differentiation (opacity, border style, badge)
- Generate shopping list export
- Budget tracking (if prices added)

**Effort**: Medium (new state per device, UI for toggle, export logic)
**Priority**: Low — nice-to-have, not core functionality

---

## Messaging/Positioning Notes

When launching publicly, emphasise:

1. **"Engineered with 1400+ tests"** — Directly addresses "will this die in a year" skepticism from thread

2. **"NetBox-compatible"** — Appeals to "NetBox is too heavy but I want the data model" crowd

3. **"Self-hostable today"** — Ahead of competitor's roadmap

4. **"Open source"** — Transparency they don't offer

5. **"Same AI tools, different discipline"** — Honest about vibe coding, but the TDD difference matters

---

## Suggested Prioritisation

### Next Release (v0.6?)

- [ ] **[R-01]** Curated Ubiquiti starter pack (15-20 devices)
- [ ] **[R-02]** Curated Mikrotik starter pack (15-20 devices)

### Following Release (v0.7?)

- [ ] **[R-03]** Export UX overhaul (PNG/SVG quality + design review)
- [ ] **[R-04]** CSV export format
- [ ] **[R-05]** UPS/PDU property enhancements

### Backlog / Research

- [ ] **[R-06]** NetBox device-type library browser/import
- [ ] **[R-07]** NAS/Storage visual fidelity (drive bays)
- [ ] **[R-08]** Chassis/enclosure category
- [ ] **[R-09]** Multiple racks
- [ ] **[R-10]** Wishlist/planned state
- [ ] **[R-11]** Community device contribution workflow
- [ ] **[R-12]** NetBox export format
- [ ] **[R-13]** Runtime/power calculations

---

#### Phase 3: Placement Image Overrides (Planned) **[R-15]**

Per-placement image overrides with stable IDs:

- [ ] Add `id: string` (UUID) field to PlacedDevice type
- [ ] Generate UUID on device placement
- [ ] Refactor ImageStore for two-level storage
- [ ] Update archive format for device-types/ + placements/
- [ ] Add image override UI to EditPanel
- [ ] Auto-process user uploads (400px + WebP)

---

## Outstanding Issues

> **Process:** For each issue, create a branch, write a spec with test cases, implement using TDD.
> Mark with `[x]` only when complete.

// add issues here

---

## Research

### [RES-01] Device Palette DnD Menu Patterns

**Status:** Open
**Priority:** High
**Created:** 2025-12-13

**Problem:** DevicePalette sidebar with CollapsibleSection accordion causes scroll/visibility issues. When multiple sections are expanded, bottommost items in sections become inaccessible. Removing sticky positioning did not resolve the issue.

**Research Questions:**

1. How do other Svelte 5 apps implement sidebar menus with drag-and-drop sources?
2. What patterns exist for collapsible sections in scrollable containers?
3. Would a tab-based approach (one section visible at a time) work better than accordion?
4. How do design systems (Radix, shadcn-svelte, Melt UI) handle this?

**Reference Examples to Investigate:**

- [ ] shadcn-svelte Accordion component
- [ ] Melt UI Collapsible/Accordion
- [ ] Bits UI (Svelte 5 headless components)
- [ ] Svelte DnD Action library patterns
- [ ] Figma plugin panel patterns (similar use case)
- [ ] VS Code sidebar/explorer patterns

**Potential Solutions:**

1. **Tab-based sections** — Only one brand visible at a time (Generic | Ubiquiti | Mikrotik tabs)
2. **Virtual scrolling** — Only render visible items in long lists
3. **Fixed-height sections** — Each section has max-height with internal scroll
4. **Drawer per section** — Click section header to open full-screen drawer
5. **Search-first UX** — Collapse all by default, rely on search to find devices

**Acceptance Criteria:**

- [ ] Document 3+ reference implementations
- [ ] Prototype preferred approach
- [ ] Verify drag-and-drop works correctly with chosen pattern
- [ ] All devices in all sections accessible via scroll or navigation

## Released

### v0.4.9 — Airflow Visualization

**Status:** Complete
**Released:** 2025-12-09

Visual overlay for device airflow direction with conflict detection:

| Feature            | Description                                                  |
| ------------------ | ------------------------------------------------------------ |
| Simplified types   | 4 types: passive, front-to-rear, rear-to-front, side-to-rear |
| Toggle             | Toolbar button + `A` keyboard shortcut                       |
| Edge stripe design | 4px colored stripe on device edge (blue=intake, red=exhaust) |
| Animated arrows    | Small chevron with marching animation                        |
| Conflict detection | Orange border on devices with airflow conflicts              |
| Export support     | Airflow indicators included in image/PDF exports             |
| Selection bug fix  | Fixed multi-device selection highlighting issue              |

---

### v0.4.0 — Code Audit & Legacy Cleanup

**Status:** Complete
**Breaking Change:** Dropped v0.1/v0.2 format support

| Area               | Status   |
| ------------------ | -------- |
| Legacy Removal     | Complete |
| Dead Code (Source) | Complete |
| Dead Code (Tests)  | Complete |
| CSS Cleanup        | Complete |
| Dependencies       | Complete |
| Config             | Clean    |
| Documentation      | Complete |

**Spec:** `docs/planning/v0.4.0-code-audit-spec.md`

---

## Medium-Term Responsive (before v1.0)

The following responsive improvements are planned for implementation before v1.0:

### Tab-Based Mobile Layout (<768px) **[R-16]**

For phone screens, switch to a tab-based interface:

- Bottom tab bar: `Library | Canvas | Edit`
- Only one view visible at a time
- Device library becomes full-screen overlay
- Edit panel becomes full-screen overlay
- Canvas takes full width when active

### Bottom Sheet Patterns **[R-17]**

Mobile-friendly UI patterns:

- Bottom sheet for device library (swipe up to reveal)
- Bottom sheet for edit panel
- Two-tap device placement: tap device → tap rack slot
- Gesture-based interactions

### Min-Width Warning **[R-18]**

For unsupported narrow viewports:

- Display warning banner at <500px viewport
- Suggest rotating to landscape or using larger device
- Graceful degradation rather than broken layout

---

## Future Roadmap

Priority order for future development:

### 1. Mobile & PWA **[R-19]**

- Full mobile phone support (create/edit layouts)
- Two-tap device placement (tap library → tap rack)
- Bottom sheet UI for device library and edit panel
- Pinch-to-zoom with native touch events
- Progressive Web App (installable, offline)
- Service worker for offline capability
- Touch-friendly targets (48px minimum)

**Primary Targets:** iPhone SE, iPhone 14, Pixel 7

---

### ~~2. Undo/Redo~~ ✅ Complete (v0.3.1)

- ~~Undo/redo system (command pattern)~~
- ~~History stack with configurable depth~~
- ~~Keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z)~~

---

### ~~3. Airflow Visualization~~ ✅ Complete (v0.4.9)

- ~~Visual indicators for device airflow direction~~
- ~~Hot/cold aisle awareness~~
- ~~Conflict detection (opposing airflow)~~

---

### 4. Cable Routing **[R-20]**

- Visual cable path representation
- Port/connection definitions on devices
- Cable type metadata

---

### 5. Weight/Load Calculations **[R-21]**

- Device weight metadata
- Per-U load calculations
- Rack weight capacity warnings

---

### 6. Basic Power Consumption **[R-22]**

- Basic device power requirements (# of plugs on PDU, device powered y/n)

### 7. Basic Network connectivity requirements **[R-23]**

- Basic device network requirements (# of ports on patch panel, device networked y/n)

---

## Backlog (Unscheduled)

Features explicitly deferred with no priority assigned:

| ID       | Feature                     | Notes                                                       |
| -------- | --------------------------- | ----------------------------------------------------------- |
| **R-24** | Custom device categories    | Allow user-defined categories                               |
| **R-25** | 3D visualization            | Three.js rack view                                          |
| **R-26** | Cloud sync / accounts       | User accounts, cloud storage                                |
| **R-27** | Collaborative editing       | Real-time multi-user                                        |
| **R-28** | Tablet-optimised layout     | Enhanced tablet experience                                  |
| **R-29** | Device templates/presets    | Common device configurations                                |
| **R-30** | Import from CSV/spreadsheet | Bulk device import                                          |
| **R-31** | NetBox device type import   | Import from community library                               |
| **R-32** | Export both rack views      | Front + rear in single export                               |
| **R-33** | Device library export       | Save library to file                                        |
| **R-34** | 0U vertical PDU support     | Rail-mounted PDUs (left/right rails)                        |
| **R-35** | Screen reader improvements  | Live region announcements for state changes                 |
| **R-36** | Rack Power management       | Device power draw, total calculation, PDU capacity planning |

---

## Out of Scope

Features that will **not** be implemented:

- Multiple racks per project
- Backend/database
- User accounts (without cloud sync feature)
- Internet Explorer support
- Native mobile apps

---

## Considerations but Not Doing

Features that were considered but explicitly deferred or rejected.

### NetBox On-Demand Fetch (Deferred)

Fetch device images on-demand from the NetBox Device Type Library:

- Search/browse UI for NetBox library
- Fetch from `raw.githubusercontent.com` (CORS-friendly)
- Cache fetched images locally
- Assign fetched images to device types or placements

**Reason for deferral:** The bundled images + user upload approach covers immediate user needs without network dependency. On-demand fetch adds complexity (UI for search/browse, network error handling, caching) that can be evaluated later based on user feedback. May revisit if users frequently request specific device images not in the starter library.

---

## Process

### Adding Features to Roadmap

1. Add to **Backlog** with brief description
2. When prioritizing, assign a priority number in Future Roadmap
3. Before implementation, update spec-combined.md
4. Implement following TDD methodology

### Version Graduation

```
Backlog → Future Roadmap → Planned (current) → Released
```

---

## Changelog

| Date       | Change                                                             |
| ---------- | ------------------------------------------------------------------ |
| 2025-11-27 | Initial roadmap created                                            |
| 2025-11-27 | v0.1 development started                                           |
| 2025-11-28 | v0.1 released                                                      |
| 2025-11-28 | v0.2 spec created                                                  |
| 2025-11-29 | Added panzoom library to v0.2 scope                                |
| 2025-11-30 | v0.2.0 released                                                    |
| 2025-12-01 | v0.2.1 released (accessibility & design polish)                    |
| 2025-12-02 | Consolidated spec; single-rack permanent scope                     |
| 2025-12-03 | v0.3.0 released (YAML archive format)                              |
| 2025-12-05 | Responsive quick-wins implemented                                  |
| 2025-12-06 | v0.3.4 released (responsive quick-wins)                            |
| 2025-12-07 | v0.4.0 released (breaking: removed legacy format support)          |
| 2025-12-07 | v0.4.2 released (toolbar responsiveness, hamburger menu)           |
| 2025-12-08 | v0.4.3 released (PDF export)                                       |
| 2025-12-08 | v0.4.4 released (Docker build fix)                                 |
| 2025-12-08 | v0.4.5 released (toolbar polish, file picker fix)                  |
| 2025-12-08 | v0.4.6 released (fix 0.5U device schema validation)                |
| 2025-12-08 | v0.4.7 released (reset view after layout load)                     |
| 2025-12-08 | v0.4.8 released (toolbar drawer fix, z-index tokens)               |
| 2025-12-08 | v0.4.9 spec ready (airflow visualization)                          |
| 2025-12-09 | v0.4.9 released (airflow visualization, selection bug fix)         |
| 2025-12-10 | Type system consolidation: unified on DeviceType/PlacedDevice      |
| 2025-12-11 | Added Research section: Starter Library & Device Image System      |
| 2025-12-11 | Device category icons: selected Lucide icons for all 12 categories |
| 2025-12-11 | Device Image System: spec complete, Phase 4 deferred               |
| 2025-12-12 | Issue 2 (Front/Rear Mounting Logic) fixed: depth-aware collision   |
| 2025-12-12 | Issue 3.1 (KVM capitalization) fixed: getCategoryDisplayName()     |
| 2025-12-12 | Added [R-##] identifiers to all incomplete roadmap items           |

---

_This file is the source of truth for Rackula versioning._
