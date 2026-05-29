# Design Spec — Rackula as ArcGIS-compatible Web Components

**Date:** 2026-05-28
**Issue:** [#1758](https://github.com/RackulaLives/Rackula/issues/1758)
**Status:** Approved design (brainstorming output) — precedes implementation plan
**Related:** `docs/research/1758-npm-library-feasibility.md` (feasibility spike)

---

## 1. Problem & goal

External projects — specifically apps built on the **ArcGIS Maps SDK for JavaScript web-components
pattern** — want to embed Rackula's rack-layout capability rather than rebuild it. The goal is to
distribute Rackula as **standards-based custom element(s)** that drop cleanly into the ArcGIS/Calcite
component ecosystem (and, for free, into any web-component-capable app).

### Why web components are viable here (reversing report #1's caution)

Report #1 steered away from web components because of Svelte 5 custom-element limits: context can't
cross element boundaries, slotted content renders eagerly, shadow-DOM style isolation. Those
objections **dissolve for the ArcGIS pattern** because of the integration grain:

- The entire ArcGIS/Calcite stack is **standards-based autonomous custom elements**. Esri already
  ships two compilers on one page (Calcite = Stencil, map components = Lit/"Lumina"). A Svelte-compiled
  element is a third compiler producing the same primitives — platform-compatible by default.
- Integration is **coarse**: you drop a self-contained element into a Calcite shell panel, a map slot,
  or a popup, and it communicates via **properties-in / `CustomEvent`s-out**. Components are *not*
  expected to share context across boundaries.
- Therefore, shipping Rackula as **one coarse-grained element** means the Svelte CE limits don't bite:
  internally it's a normal Svelte component tree (context, slots, reactivity all work); only the outer
  shell is a custom element. Shadow-DOM isolation becomes a **feature** (Rackula's CSS can't leak into
  the host GIS app).
- "Feeling native" is **convention-matching, not a rewrite**: namespaced+guarded tag, `arcgis`/
  `calcite`-style event names with `detail` payloads, a `componentOnReady()` promise, and theming via
  Calcite design tokens — all opt-in and in our control.

External constraint to accept: **React 18** consumers have custom-element friction (the same issue
that produced Calcite's now-deprecated React wrapper). React 19+/Vue/Angular/vanilla consume directly.

---

## 2. Scope

**In scope**
- A headless `@rackula/core` (per report #1) as the foundation.
- A web-component package `@rackula/wc` exposing `<rackula-viewer>` then `<rackula-designer>`.
- A bridge API (properties/events/methods) supporting progressive map coupling.
- ArcGIS/Calcite "feels native" conventions and a worked integration example.
- Secure-coding / supply-chain posture carried from report #1.

**Out of scope (for now)**
- A separate Svelte-native `@rackula/ui` package (deferred unless Svelte consumers ask).
- Fine-grained per-feature custom elements (explicitly rejected — see §4).
- React 18 wrappers (optional Phase 3).
- Server-side rendering of the element (custom elements are not SSR-friendly).

**Decisions resolved in this spec** (user delegated all three to the report):
- **Exposed surface:** read-only **viewer first**, full **designer** as a later phase.
- **Distribution end-state:** the **web component is the UI**; no separate Svelte-native package now.
- **Map coupling:** element stays **map-agnostic**; API supports co-located, map→Rackula, and two-way,
  with the host app orchestrating.

---

## 3. Architecture

### 3.1 Packages

| Package | Role | Registry | Notes |
| --- | --- | --- | --- |
| `@rackula/core` | Headless TS: types, Zod schemas, collision/position math, serialization, NetBox import, device/brand data | npm + JSR | Foundational; rendered by the WC and exchanged over the bridge |
| `@rackula/wc` | Svelte components compiled to custom elements (`<rackula-viewer>`, `<rackula-designer>`) | npm + CDN (jsDelivr/esm.sh) | ESM; `import` or `<script type="module">` usage |

`@rackula/wc` depends on `@rackula/core` (`workspace:*` in the monorepo). The main Rackula app
continues to consume both locally, unchanged in behavior.

### 3.2 Build

- Compile with Svelte `compilerOptions.customElement` via **Vite library mode** (`build.lib`),
  emitting an ESM bundle that self-registers the elements on import.
- Distribute on **npm** (primary) and let **jsDelivr/esm.sh** mirror it for `<script>`-tag usage,
  matching ArcGIS's CDN ergonomics.
- **Do not bundle** `@esri/calcite-components`, `lit`, or `@arcgis/core` — they are the host's; consume
  Calcite *tokens* via CSS only.

### 3.3 Internal structure (coarse-grained)

One custom element wraps a normal Svelte tree:

```
<rackula-viewer>            ← custom element shell (Shadow DOM)
  └─ <RackulaViewerRoot>    ← ordinary Svelte component
       ├─ context: createStores({ scope })   ← instance-scoped, NOT module-global
       └─ Canvas / Rack / device rendering (existing components, store-decoupled as needed)
```

- **Stores become instance-scoped.** Today's stores are module-global singletons (factory functions
  closing over module `$state`). We introduce `createStores(config)` returning a fresh store set, and a
  Svelte **context provider** so descendant components read their instance's stores via `getContext()`
  instead of importing a module singleton. For the **viewer**, scope only the render/canvas subset; the
  full set is scoped when the **designer** lands (Phase 2).
- **Shadow DOM on.** Styles are encapsulated; Rackula CSS cannot leak into the GIS app and vice-versa.

---

## 4. Component granularity — one element, not many

**Decision: coarse-grained.** Rackula ships as a single element per surface (`<rackula-viewer>`,
`<rackula-designer>`), never as a family of fine-grained elements (rack, palette, etc. each a CE).

Rationale: fine-grained CEs would hit the Svelte 5 custom-element limits head-on — `setContext`/
`getContext` cannot cross custom-element boundaries, and slotted content renders eagerly. A coarse
element keeps all of that *internal* to a normal Svelte tree where it works. It also matches how ArcGIS
expects third-party elements to participate (self-contained units composed by the host), and keeps the
public API small and stable.

---

## 5. The element contract (bridge API)

Conventions mirror ArcGIS: **attributes for primitives, JS properties for complex objects, `CustomEvent`s
with `detail` payloads, and a `componentOnReady()` promise.**

### 5.1 Properties / attributes (inbound)

| Name | Kind | Type | Applies to | Notes |
| --- | --- | --- | --- | --- |
| `layout` | JS property only | `Layout` (`@rackula/core`) | both | Complex object; never an attribute. Validated with Zod on set. |
| `mode` / `theme` | attribute | `"light" \| "dark" \| "auto"` | both | Defaults to honoring `.calcite-mode-*` ancestor. |
| `selected-device-id` | attribute | string | both | Reflects/controls current selection. |
| `readonly` | attribute (boolean) | presence | designer | Forces designer into view-only behavior. |

### 5.2 Events (outbound)

| Event | `detail` | Applies to | Purpose |
| --- | --- | --- | --- |
| `rackula-ready` | `{}` | both | First render complete (pairs with `componentOnReady()`). |
| `rackula-selection-change` | `{ rackId, deviceId }` | both | User selected a rack/device. |
| `rackula-layout-change` | `{ layout }` | designer | Layout edited; host can persist. |

All events are `rackula-`prefixed `CustomEvent`s with the payload in `event.detail`.

### 5.3 Methods / lifecycle

- `componentOnReady(): Promise<void>` — resolves after first render (ArcGIS handshake convention).
- `getLayout(): Layout` — current layout snapshot.
- `fitView(): void` — fit/zoom-to-extent of the rendered layout.

### 5.4 Registration

- Namespaced tags `rackula-viewer` / `rackula-designer` — never reuse `arcgis-*` / `calcite-*`.
- **Guarded define:** `if (!customElements.get('rackula-viewer')) customElements.define(...)` so loading
  the bundle twice does not throw.

---

## 6. Data flow & map coupling

The element is **map-agnostic**; the host app orchestrates (matching Esri's "components talk to the map
API, the app mediates"). All three coupling levels are reachable with the same API:

- **Co-located (no data link):** place `<rackula-viewer>` in a `<calcite-shell-panel>` or map slot. No
  wiring.
- **Map → Rackula:** host listens `arcgisViewClick` / `arcgisViewChange`, then sets `el.layout` and/or
  `el.selectedDeviceId` from the picked feature.
- **Two-way:** host additionally listens `rackula-selection-change` and calls `view.goTo(...)` /
  highlights the corresponding map feature.

No global event bus; coordination is the host's job by design.

---

## 7. Theming ("feels native")

- Shadow styles are built on `var(--calcite-*)` design tokens with Rackula fallbacks, so the element
  adopts the host's Calcite theme automatically.
- Honor the `.calcite-mode-dark` / `.calcite-mode-light` ancestor class; inherited CSS custom properties
  cross the shadow boundary, so token-based colors react to host mode switches.
- Ship Rackula's own tokens as the fallback layer so the element looks correct outside a Calcite app too.

---

## 8. Security (carried from report #1, tightened for embedding)

- **`@rackula/core`** treats all input as untrusted: validate `layout` with Zod on every set; never
  `eval`/execute embedded content.
- **`@rackula/wc`** is **safe-by-default**: sanitize rendered SVG/markdown with **DOMPurify** before DOM
  insertion; prefer `<img>` for untrusted raster; enable Trusted Types where supported. Document the
  guarantee; expose a hook to tighten, default closed.
- **Containment:** Shadow DOM limits style/DOM bleed in both directions.
- **Supply chain:** OIDC trusted publishing + automatic provenance (SLSA L2), FIDO 2FA, minimal deps,
  `ignore-scripts`, committed lockfiles + `npm ci`. Do not re-bundle Calcite/Lit/`@arcgis/core`.

---

## 9. Phasing & level of effort (Claude-assisted)

| Phase | Deliverable | LOE | Risk |
| --- | --- | --- | --- |
| **0** | `@rackula/core` extraction (monorepo, npm + JSR, provenance) | ~1.5–3 wk | Low |
| **1** | `<rackula-viewer>` CE: scoped render/canvas stores, bridge API, theming, npm+CDN publish, **ArcGIS example app** (Calcite shell panel + map popup) | ~2–4 wk | Medium |
| **2** | Full store DI refactor (internal, landed in app first) → `<rackula-designer>` CE | ~5–9 wk | Medium–High |
| **3** | *Optional:* React 18 wrappers; Svelte-native `@rackula/ui` if demanded | as needed | Low–Med |

The viewer (Phase 1) is multi-instance-safe and covers the common "show this site's rack" GIS use case.
The designer's single-instance-per-page limitation is **temporary**, removed by the Phase 2 refactor.

---

## 10. Testing strategy

Per repo policy, test behavior, not structure:

- **Viewer render correctness** — given a `layout`, the expected racks/devices render.
- **Multi-instance isolation** — two `<rackula-viewer>` elements on one page have independent pan/zoom
  and selection (guards against the module-singleton regression).
- **Bridge contract** — `rackula-selection-change` / `rackula-layout-change` fire with correct `detail`;
  setting `layout` updates the render; `componentOnReady()` resolves after first render.
- **Theming** — element colors react to the `.calcite-mode-dark` ancestor.
- **Security** — a malicious `layout` (SVG `onload`, `javascript:` URLs, raw HTML in notes) is sanitized
  and does not execute.
- **E2E** — example app embedding the element in a mock ArcGIS/Calcite shell (Playwright).

---

## 11. Risks & constraints accepted

| Risk / constraint | Disposition |
| --- | --- |
| Designer single-instance-per-page until Phase 2 | Accepted; documented; removed by full store refactor |
| React 18 custom-element friction | Accepted; optional wrappers in Phase 3; React 19+/Vue/Angular/vanilla direct |
| Each element bundles its own Svelte runtime | Accepted (small); don't bundle Calcite/Lit/core |
| Store DI refactor touches ~27 components | Land in main app first, behind tests, before the designer CE |
| Custom elements not SSR-friendly | Out of scope; document client-only |
| Slotted-content eager rendering / no cross-boundary context | Avoided by coarse-grained design (internal Svelte tree) |

---

## 12. Open questions for implementation planning

- Exact subset of stores the **viewer** needs scoped vs. can ignore (render/canvas vs. editing/persistence).
- Whether `<rackula-designer>` is a separate tag or `<rackula-viewer readonly>` toggled — leaning
  separate tags for a clearer API surface.
- Minimum `layout` schema version the bridge accepts and how version skew is surfaced to the host.
