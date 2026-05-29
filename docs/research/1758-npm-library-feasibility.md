# Spike #1758 — Feasibility & LOE: Packaging Rackula as a Reusable Library

**Issue:** [#1758](https://github.com/RackulaLives/Rackula/issues/1758) ·
**Origin:** [Discussion #1606](https://github.com/RackulaLives/Rackula/discussions/1606) (silicoflare, Apr 2026)
**Type:** Research spike — feasibility & level-of-effort. No production code.
**Date:** 2026-05-28 · **Status:** Complete

---

## TL;DR

Yes, it's feasible — and the codebase is in better shape for it than most apps, because state
already lives in **factory-function stores** rather than hard module-singleton constants. But it
is **not a small job**, and the value depends heavily on *which layer* we ship.

**Recommendation: a tiered, two-package split, built incrementally.**

| Package | Contents | Registry | Effort | Risk |
| --- | --- | --- | --- | --- |
| **`@rackula/core`** | Types, Zod schemas, collision/position math, serialization, NetBox import, device/brand data — pure TS, no UI | **npm + JSR** | **Low–Medium** (~1.5–3 wk) | Low |
| **`@rackula/ui`** | Svelte 5 components (Rack, Canvas, DevicePalette, …) on top of core | **npm only** | **Medium–High** (~5–9 wk) | Medium–High |

**Headline guidance:**

1. **Ship `@rackula/core` first.** It's mostly already portable, gives external projects real value
   (NetBox-compatible model + validation + collision logic), and de-risks the harder UI work. This
   alone may satisfy a large share of the "integrate into our own site" request — consumers build
   their own rendering on a trustworthy model.
2. **`@rackula/ui` is the expensive part** because ~27 components reach into global runes stores by
   direct import. Decoupling to dependency-injected stores is the dominant cost and the main risk.
3. **npm is mandatory** for any Svelte component distribution — **JSR cannot host `.svelte` files
   today.** JSR is only an option for the pure-TS core.
4. **Bun and Deno are consumers, not destinations.** Publishing to npm (+ JSR for core) covers them
   for free, along with CDNs (esm.sh / jsDelivr / unpkg).
5. **Do not make web components the primary format.** Svelte 5 → custom-element has hard limits
   (context can't cross element boundaries, eager slots, shadow-DOM styling) that a multi-component
   library like Rackula's would fight constantly. Offer it as an *optional* secondary build target if
   cross-framework demand is real.

---

## 1. What was investigated

This spike combined a read-only audit of the Rackula codebase with current (2025–2026) web research
on Svelte-5 library tooling, package registries, and supply-chain security. Where the report quotes
LOC or coupling counts, they were measured directly against the repo at `main` (commit `c88ce48f`).

Verified codebase facts:

| Metric | Value | Note |
| --- | --- | --- |
| Total `.svelte` files | 133 | 80 top-level components + 53 in subdirs (icons, etc.) |
| Components importing stores directly | 27 | The decoupling surface for `@rackula/ui` |
| Store code | 8,710 LOC | `src/lib/stores/**` |
| Type definitions | 1,040 LOC | `src/lib/types/**` — pure TS |
| Zod schemas | 1,429 LOC | `src/lib/schemas/**` — depends only on zod |
| Pure logic utils (collision/position/serialization/coords/netbox) | ~1,241 LOC | No store/DOM deps |
| Device/brand data | ~10,019 LOC | `src/lib/data/**` — mostly static data, not logic |
| Total `src` | ~92,258 LOC | For scale |

> **Correction note:** an early automated pass over-counted the schema layer at ~40K LOC; the real
> figure is **1,429 LOC**. The headless core is therefore ~4K LOC of logic + ~10K of static data,
> *not* ~43K. This materially lowers the core-package effort estimate.

---

## 2. Current architecture & why it matters

Rackula is a **Svelte 5 + Vite SPA** (not SvelteKit), compiled with `compilerOptions.runes: true`.
`package.json` is `"private": true` with **no `exports`, no `files`, no library build** today.

**The good news — store shape:** every store is exposed via a **factory function**
(`getLayoutStore()`, `getSelectionStore()`, …) that closes over module-level `$state`, *not* via an
exported singleton constant. Reset helpers (`resetLayoutStore()`, …) already exist for tests. This is
a much friendlier starting point for dependency injection than the typical `export const store = …`
pattern — the call sites already go through a function we can repoint.

**The hard news — global singletons under the hood:** those factories still return *the same* module
closure on every call, so the state is process-global. Components consume it by **direct module
import**, e.g. `Canvas.svelte`:

```ts
import { getLayoutStore } from "$lib/stores/layout.svelte";
const layoutStore = getLayoutStore(); // same instance everywhere
```

Consequences for a library:

- **Multi-instance is unsafe.** Two `@rackula/ui` widgets on one page would share layout, selection,
  canvas pan/zoom, and dialog state. Pan one, you pan both.
- **`dialogs.svelte.ts` is a true singleton** (`export const dialogStore = …`) — the one place that
  breaks the otherwise-consistent factory pattern; it must be reworked.
- **Hardcoded `localStorage` keys** (`Rackula:viewport`, `Rackula_sidebar_tab`, `Rackula_has_started`)
  and `window.matchMedia` calls assume a single global app — they need namespacing/abstraction.

**The clean boundary already exists.** Collision detection, coordinate/position math, serialization,
NetBox import, the type system, and the Zod schemas have **no store, DOM, or Svelte dependency**. They
can be lifted into a core package essentially as-is.

### Dependency layering (measured by import)

| Layer | Dependencies |
| --- | --- |
| **Core-safe** | `zod`, `nanoid`, `js-yaml`, `lz-string`, `pako`, `fuse.js`, `marked`, `debug` |
| **UI-only** | `bits-ui`, `panzoom`, `paneforge`, `vaul-svelte`, `@lucide/svelte`, `simple-icons`, `browser-fs-access`, `dompurify`, `jspdf`, `jszip`, `qrcode`, `svg2pdf.js` |

---

## 3. Packaging-system breakdown

For each system: how it works, advantages, risks, and a Claude-assisted-dev LOE delta *relative to
publishing the same artifact on npm* (the baseline). The big effort numbers live in §5; these deltas
are just the incremental cost of supporting an extra channel.

### 3.1 npm registry — **the baseline, mandatory**

- **How:** `npm publish` a tarball; scoped (`@rackula/*`) public packages via `--access public`;
  entry points via the `exports` map with a `svelte` condition for Svelte-aware bundlers.
- **Svelte support:** First-class. `@sveltejs/package` emits preprocessed `.svelte` source +
  generated `.svelte.d.ts`. This is the *only* first-tier home for actual Svelte components.
- **Who consumes:** Everyone — npm/pnpm/yarn/Bun/Deno (`npm:` specifier) and all CDNs mirror it.
- **Advantages:** Universal reach; mature provenance/trusted-publishing; free CDN distribution.
- **Risks:** Largest supply-chain attack surface (§6); CJS/ESM dual-publish is fiddly — avoided by
  shipping **ESM-only**, which suits a modern Svelte/Vite consumer base.
- **LOE delta:** baseline (0).

### 3.2 JSR (jsr.io) — **core only**

- **How:** `jsr publish` / `deno publish`; you publish **TypeScript source directly**, JSR transpiles
  and generates `.d.ts` + docs server-side. ESM-only.
- **Critical limitation:** **JSR cannot host Svelte components** — it accepts only JS/TS modules and
  rejects `.svelte` files ([jsr-io/jsr#861](https://github.com/jsr-io/jsr/issues/861)). So JSR is
  viable for **`@rackula/core` only**, never `@rackula/ui`.
- **Consumption:** Native in pnpm 10.9+/Yarn 4.9+; elsewhere via `npx jsr add` or the
  `@jsr` npm-compat endpoint (`https://npm.jsr.io`). Consumers receive transpiled JS + `.d.ts`.
- **Advantages:** Cross-runtime by design; **automatic, zero-config provenance** when publishing from
  GitHub Actions via OIDC; auto-generated docs; pushes you toward explicitly-typed public APIs.
- **Risks:** No Svelte; ESM-only; "slow types" rule requires annotating the public API; smaller
  ecosystem; provenance only when publishing from GH Actions.
- **LOE delta:** **Low (~1–2 days)** — dual-publish `@rackula/core` to JSR alongside npm; main cost is
  adding explicit type annotations to the public surface to satisfy the slow-types check.

### 3.3 Deno — **consumer, not a destination**

- Deno consumes npm (`npm:`) and JSR (`jsr:`) directly; JSR is its native channel.
- Deno does **not** render `.svelte` itself — the Svelte compiler/Vite does, exactly as on Node. A
  Rackula Svelte lib on npm is already Deno-consumable inside a SvelteKit-on-Deno build; `@rackula/core`
  on JSR is the cleanest path for Deno users of the logic layer.
- **LOE delta:** **~0** — covered by publishing to npm + JSR. Optional: a Deno smoke test in CI.

### 3.4 Bun — **consumer, not a destination**

- Bun has **no registry of its own**. It's a fast npm client/runtime; `bun publish` packs and pushes
  to the *configured* (npm-compatible) registry. "Publish to Bun" is not a separate channel — it's
  "publish to npm, using Bun's CLI."
- **LOE delta:** **~0** — publishing to npm covers Bun consumers. Optional: a `bun install`/run smoke
  test, mindful of known Bun lockfile/`.npmrc` edge-case bugs.

### 3.5 Other channels

- **CDN / ESM (esm.sh, jsDelivr `esm.run`, unpkg):** free once on npm; enable a **buildless /
  import-map embed** story. esm.sh can even compile `.svelte` on the fly for browser demos (adds a
  third-party runtime trust dependency — fine for demos, not for production embeds).
- **GitHub Packages:** npm-compatible, org-scoped; consumers must authenticate **even for public
  packages**, which hurts OSS reach. Secondary/private mirror at best.
- **LOE delta:** **~0** for CDNs (automatic); GitHub Packages not recommended as a primary channel.

**Net:** publish `@rackula/core` to **npm + JSR**, `@rackula/ui` to **npm**, and every other runtime
(Deno/Bun) and CDN is covered for free.

---

## 4. Open decisions — analysis & recommendations

### 4.1 Consumer frameworks — **recommend: Svelte-5-native first; custom elements as optional later target**

| Option | DX | Effort | Verdict |
| --- | --- | --- | --- |
| **Svelte 5 native** (ship preprocessed `.svelte` source, `svelte` peerDep) | Excellent for Svelte consumers | Baseline | **Primary.** Matches the request's framing ("integrate into our websites") and the library's design. |
| **Web components / custom elements** (Vite lib mode, `<svelte:options customElement>`) | Good in Vue/vanilla, rough in React | High + ongoing | **Optional secondary target only.** See limits below. |
| **React/Vue wrappers** (community adapters or manual `mount()`) | Variable; no first-party wrapper exists | Medium–High | Only if a concrete consumer needs it. |

**Why not custom-elements-first.** Svelte 5 *can* compile to custom elements, but the documented
limits are fatal for a rich component family: **`setContext`/`getContext` cannot cross custom-element
boundaries**, slotted content renders **eagerly** (breaks `{#if}` patterns), styles are **shadow-DOM
encapsulated** (Rackula's global tokens/`:global()` wouldn't apply), props must be explicitly declared
and complex values JSON-stringified over attributes, and **React handles custom-element props/events
poorly** (improving in React 19, still the weak spot). Each element also bundles its own Svelte
runtime. This is the single biggest "looks easy, isn't" trap in the whole spike.

### 4.2 Styling/branding — **recommend: themeable-by-default via CSS custom properties; headless core**

- **`@rackula/core`** is headless by definition (no UI).
- **`@rackula/ui`** should ship Rackula's existing **CSS custom-property design tokens** so it looks
  right out of the box, but expose them as documented override points so consumers can re-theme. This
  is "styled with a clean escape hatch" rather than fully unstyled — Rackula's visuals *are* part of
  the value, and the token system already exists (`src/lib/styles/tokens.css`), so the marginal cost is
  low. Set `sideEffects: ["**/*.css"]` so CSS survives tree-shaking.

---

## 5. Level of effort (Claude-assisted development)

Estimates assume Claude-Code-driven implementation with human review, TDD per repo policy, and
CodeRabbit gating. Ranges reflect uncertainty in the store-decoupling refactor.

### 5.1 `@rackula/core` — **Low–Medium (~1.5–3 weeks)**

| Task | Effort |
| --- | --- |
| Stand up monorepo (pnpm workspaces + Changesets) | 1–2 days |
| Move types/schemas/pure-utils/data into `packages/core`; wire `exports`, ESM, `sideEffects:false` | 2–4 days |
| Decide zod handling (peerDep recommended) + annotate public API for JSR slow-types | 1–2 days |
| Build with tsup (or tsdown); validate with `publint` + `@arethetypeswrong/cli` | 1–2 days |
| Tests, README, examples, CI publish workflow (npm + JSR, OIDC) | 2–4 days |
| Keep the main app consuming the workspace package (no behavior change) | 1–2 days |

Low risk: the code is already store-free. The main app imports from `@rackula/core` via
`workspace:*`, so there's no duplication.

### 5.2 `@rackula/ui` — **Medium–High (~5–9 weeks)** — the dominant cost

| Task | Effort | Notes |
| --- | --- | --- |
| **Store dependency-injection refactor** | **2–4 wk** | Introduce `createStores(config)` + Svelte context provider; repoint the 27 store-importing components from `getXStore()` module import to `getContext()`. The factory pattern helps, but it's broad, cross-cutting, and reactivity-sensitive. |
| Fix the `dialogs` singleton + namespace `localStorage`/`window` access | 3–5 days | Required for multi-instance safety. |
| Decide the public component surface & props/events API (currently store-driven, few props) | 1–2 wk | Components today get everything from stores; a library needs explicit, documented props/callbacks. This is real API design, not mechanical. |
| `@sveltejs/package` build (accept `@sveltejs/kit` as a dev/build dep; no app needed), `exports` + `svelte` condition, ship tokens | 3–5 days | |
| DOMPurify-based safe-by-default sanitization boundary (§6) | 2–4 days | |
| Tests (multi-instance, mount/unmount lifecycle), docs, example consumer app | 1–2 wk | |
| *Optional:* custom-element secondary target | +1–2 wk | Only if cross-framework is required. |

**Risk drivers:** the runes-store DI refactor touching 27 components; defining a stable props/events
API where none exists today; multi-instance correctness; panzoom lifecycle/disposal. Svelte 5 runes
themselves are stable, but the *boundary* design is where surprises live.

### 5.3 Combined

- **Core only (Phase 1):** ~1.5–3 weeks — recommended first deliverable.
- **Core + UI:** ~7–12 weeks at 1 FTE; ~4–6 weeks calendar with two parallel workstreams (core/build
  vs. component DI refactor).

---

## 6. Secure-coding & supply-chain posture (cross-cutting)

### Publishing & provenance

- **Adopt npm Trusted Publishing (OIDC) — GA since 2025-07-31.** Publish from GitHub Actions with no
  long-lived token; npm exchanges a short-lived workflow-scoped token and **generates provenance
  automatically** (no `--provenance` flag). Requires npm CLI ≥ 11.5.1, Node ≥ 22.14.0. This maps to
  **SLSA Build Level 2** out of the box; `slsa-github-generator` can reach L3+.
- **JSR** gives automatic, zero-config provenance via OIDC from GitHub Actions for `@rackula/core`.
- **Classic npm tokens are deprecated (since 2025-12-09)** — use OIDC or 7-day-max granular tokens.

### Account/registry hardening

- **Phishing-resistant 2FA (FIDO/WebAuthn)** on GitHub and npm; never reset 2FA via an emailed link.
- Prefer OIDC over any token; after enabling it, **disable token-based publishing** in package
  settings. Keep no long-lived npm secret in CI. Least-privilege `GITHUB_TOKEN`; guard against
  `pull_request_target` "pwn requests."

### Dependency integrity

- Commit lockfiles; CI uses `npm ci` / `--frozen-lockfile`. Set `ignore-scripts=true` (postinstall
  scripts are a top malware vector). Run `npm audit` + layer **Socket.dev** and **OpenSSF Scorecard**.
- **Minimize dependency surface** — `@rackula/core` can get close to zero runtime deps (zod as peer);
  every transitive dep is attack surface.
- *Caveat:* Jan-2026 "PackageGate" disclosed zero-days that weaken lockfile/script-disabling
  assumptions across npm/pnpm/Bun — treat these as necessary-but-not-sufficient; defense in depth.

### Consumer-facing safety — **Rackula renders untrusted input**

This is Rackula-specific and important: the library parses **user-uploaded YAML/JSON layouts** and
renders **SVG** and **markdown notes** — a real XSS surface (SVG `onload`/`<script>`/`javascript:`,
markdown raw-HTML passthrough).

**Recommended trust boundary:**

- **`@rackula/core`** must treat all input as untrusted: validate with Zod, never `eval`/execute
  embedded content. It parses; it does not trust.
- **`@rackula/ui`** must be **safe-by-default**: sanitize SVG/markdown with **DOMPurify** before
  injecting into the DOM (Rackula already depends on DOMPurify), prefer `<img>` for untrusted raster
  where possible, and enable Trusted Types (`RETURN_TRUSTED_TYPE`) where supported. Document the
  guarantee and expose a config hook to tighten further — but **default to closed**. Consumers will
  assume "it's a rack renderer, it handles my file," so the library must own this boundary.

### Lessons from recent incidents

The 2025 **Qix phishing compromise** and **Shai-Hulud worm** (the latter enabled by un-rotated tokens)
both argue for the same baseline: **OIDC trusted publishing** (nothing to phish), **FIDO 2FA**,
**rotate/retire legacy tokens now**, **minimal deps + disabled install scripts**, and **provenance on
every release** so consumers can verify builds.

---

## 7. Recommended phased plan

1. **Phase 1 — `@rackula/core` (npm + JSR).** ~1.5–3 wk. Lowest risk, immediate external value,
   de-risks everything downstream. Main app consumes it via `workspace:*`. **Strong recommend regardless
   of whether Phase 2 proceeds.**
2. **Phase 2 — store DI refactor (internal, no new package).** ~3–5 wk. Introduce `createStores()` +
   context provider, fix the dialog singleton, namespace storage. Land it in the main app first so it's
   battle-tested before extraction. This is the gate for `@rackula/ui`.
3. **Phase 3 — `@rackula/ui` (npm).** ~2–4 wk on top of Phase 2. `@sveltejs/package` build, themeable
   tokens, sanitization boundary, multi-instance tests, example consumer.
4. **Phase 4 — optional.** Custom-element target / framework wrappers, *only if* a concrete
   cross-framework consumer materializes.

A reasonable stop point is after **Phase 1** — it directly addresses "build rack infrastructure from
scratch" by giving integrators a trustworthy, NetBox-compatible model + validation + collision engine,
at a fraction of the full cost.

---

## 8. Risks register

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Store DI refactor touches 27 components, reactivity-sensitive | High | Land in main app first (Phase 2); strong tests before extraction |
| No existing public props/events API for components | Medium–High | Treat as deliberate API design; keep surface small initially |
| Multi-instance state bleed (module singletons, dialog store, storage keys) | High | `createStores(config)` + namespacing; explicit multi-instance tests |
| Custom-element limits underestimated | Medium | Keep CE out of the critical path; native Svelte primary |
| Supply-chain compromise | Medium | OIDC provenance, FIDO 2FA, minimal deps, `ignore-scripts` |
| XSS via rendered untrusted SVG/markdown | Medium–High | DOMPurify safe-by-default in `@rackula/ui`; core never executes input |
| Maintenance cost of 2+ published packages | Medium | Changesets automation; start with core only |

---

## Appendix — Sources

**Svelte / packaging:** [SvelteKit Packaging](https://svelte.dev/docs/kit/packaging) ·
[SvelteKit FAQ (ship uncompiled .svelte)](https://svelte.dev/docs/kit/faq) ·
[Svelte Custom Elements](https://svelte.dev/docs/svelte/custom-elements) ·
[@sveltejs/package future (#8825)](https://github.com/sveltejs/kit/discussions/8825) ·
[Mainmatter: Web Components with Svelte (2025)](https://mainmatter.com/blog/2025/06/25/web-components-with-svelte/) ·
[Custom Elements Everywhere](https://custom-elements-everywhere.com/) ·
[svelte-adapter](https://github.com/pngwn/svelte-adapter)

**Tooling:** [tsup vs tsdown vs unbuild (2026)](https://www.pkgpulse.com/guides/tsup-vs-tsdown-vs-unbuild-typescript-library-bundling-2026) ·
[TS ESM/CJS publishing in 2025](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing) ·
[are-the-types-wrong + tsup](https://johnnyreilly.com/dual-publishing-esm-cjs-modules-with-tsup-and-are-the-types-wrong) ·
[pnpm workspaces](https://pnpm.io/workspaces) ·
[monorepo: pnpm + Turborepo + Changesets](https://dev.to/yasinatesim/monorepo-architecture-with-pnpm-workspace-turborepo-changesets-g0j)

**Registries:** [JSR Svelte limitation (#861)](https://github.com/jsr-io/jsr/issues/861) ·
[JSR publishing](https://github.com/jsr-io/jsr/blob/main/frontend/docs/publishing-packages.md) ·
[JSR npm-compatibility](https://jsr.io/docs/npm-compatibility) ·
[Deno Node/npm compat](https://docs.deno.com/runtime/fundamentals/node/) ·
[bun publish](https://bun.com/docs/pm/cli/publish) ·
[esm.sh](https://esm.sh/) · [jsDelivr esm](https://www.jsdelivr.com/esm)

**Security:** [npm Trusted Publishing GA](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/) ·
[npm provenance docs](https://docs.npmjs.com/generating-provenance-statements/) ·
[Introducing npm package provenance](https://github.blog/security/supply-chain-security/introducing-npm-package-provenance/) ·
[GitHub: more secure npm supply chain](https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/) ·
[DOMPurify](https://github.com/cure53/DOMPurify) ·
[Shai-Hulud / CISA alert](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem) ·
[Datadog: recent npm compromises](https://securitylabs.datadoghq.com/articles/learnings-from-recent-npm-compromises/)
