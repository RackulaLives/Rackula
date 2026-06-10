# Spike #1025 - Synthesis: Frontend on Cloudflare, VPS Retirement

Synthesis of the codebase inventory (`1025-codebase.md`) and the Cloudflare platform
research (`1025-external.md`) into actionable recommendations for epic #1983 / child
#1984: host the Rackula **frontend** on Cloudflare Workers Static Assets and retire the
prod Linode VPS tenant. Effort estimates assume heavy Claude-assisted codegen (human
effort is below what raw LOC implies).

Scope guardrails carried from the spike re-scope:

- Goal is the **prod frontend** move. `rackula-api` (backend) hosting is OUT of scope; it
  stays where it is and is the designated "self-host equivalent" backend for storage
  features.
- The three CF features (R2 images, KV share links, CF Web Analytics) are **optional,
  separable follow-ups**, low/no cost.
- Self-host rule: every CF-storage feature must have a self-hostable equivalent routed
  through `rackula-api`, so self-hosters get parity, not degradation. The baseline static
  frontend must stay trivially self-hostable via the existing Docker/LXC "serve `dist/`"
  path.

---

## Bottom Line

**Host the prod frontend (`count.racku.la`) on Cloudflare Workers Static Assets,
assets-only (no Worker script).** The frontend is a pure Vite + Svelte 5 SPA whose
`vite build` emits a self-contained static `dist/`; prod already runs as a no-API static
bundle today (`AUTH_MODE=none`, no persistence backend). Moving it to Cloudflare is a
**lift-and-shift of a static bundle**, not a rewrite. The single correctness question -
two HTML entries (`index.html` + `login.html`) under SPA fallback - is fully resolved by
config: `not_found_handling: "single-page-application"` plus the default
`html_handling: "auto-trailing-slash"` serves real files first (so `login.html` is never
clobbered), maps `/login` to `login.html`, and falls back to `index.html` for unknown
routes. No Worker code is needed for the baseline.

The CI change is a clean swap inside the existing gated `stage -> gate -> promote`
release pipeline (`release.yml`): the `promote-prod` job currently calls the reusable
`deploy-prod.yml` (self-hosted `vps-rackula` runner, `docker compose pull`/`up`). Replace
that with a `wrangler deploy` job on `ubuntu-latest` (or fold the deploy into the existing
reusable workflow, swapping its body). The existing post-deploy smoke test - curl
`https://count.racku.la/version.json` and assert it equals the released version - carries
over verbatim, because `version.json` is emitted into `dist/` and served as a static
asset on CF exactly as it is on nginx.

**Baseline effort: Small** (Claude-assisted). It is a `wrangler.jsonc` file plus one CI
job swap plus two CI secrets. The fiddly parts are CI-secret provisioning and wiring the
promote step into the gated pipeline, not the CF config. Call it an afternoon.

**Honest caveat (state it plainly):** this retires only the **prod** VPS tenant.
`count.racku.la` already runs no API, so the prod move is essentially free of backend
concerns. Full VPS retirement also requires moving the **dev** `rackula-api` (currently
deployed by `deploy-dev.yml` onto the `vps-rackula` self-hosted runner) onto the homelab
(#1985), and decommissioning the box (#1986). The frontend move alone does NOT kill the
VPS.

**Recommendation:** Do the baseline prod move first as its own PR/issue (#1984). Treat
R2 / KV / Web Analytics as independent opt-in follow-ups, each gated behind the
self-host-equivalent rule. Do not bundle storage features into the hosting move - they
re-couple work to `rackula-api` and would stall a clean, low-risk lift-and-shift.

---

## Approaches & Tradeoffs

Three genuinely different hosting targets for the prod frontend. They differ on
DX, storage-feature fit, and how much of the existing CF investment (the zone is already
on Cloudflare) they reuse.

### Approach A - Workers Static Assets (committed, recommended)

Ship `dist/` as Workers Static Assets, assets-only for the baseline, with the option to
add a `main` Worker later for KV/R2 routes that live next to the assets.

- Pros: Static-asset requests are free and unlimited with no egress charge ($0 forever at
  any traffic). SPA + two-entry routing works by config alone. Storage bindings (KV, R2,
  D1) attach to the same Worker, so the three optional features have a natural home.
  Native preview URLs + per-branch aliases (July 2025) give Pages-like PR previews.
  `_headers` / `_redirects` supported natively. Versioned deploys give instant rollback
  (`wrangler versions deploy` re-promotes a prior version). This is Cloudflare's
  recommended path for new projects; Pages is in maintenance positioning.
- Cons: No built-in git auto-build (we deploy from our own CI - a non-loss, we already
  have CI). Preview URLs are `workers.dev`-subdomain only in beta (not on custom domains).
  Early Hints is Pages-only (not needed here).
- Fit: Best. The zone is already on Cloudflare, so binding `count.racku.la` is one route
  line or a dashboard click - no nameserver migration.

### Approach B - Cloudflare Pages

Same `dist/`, deployed to Pages with git integration and automatic PR previews.

- Pros: Push-to-build git integration and custom-domain PR previews out of the box.
  Mature static-hosting DX. Also $0 at our scale.
- Cons: Storage bindings (KV/R2) are clumsier next to a Pages site than on a Worker;
  Cloudflare is steering new full-stack/static work to Workers and positions Pages as
  maintenance-mode. Picking Pages now means a likely later migration to Workers precisely
  when we add the optional storage features (the features that motivate them wanting to
  live beside the assets). Diverges from the committed #1984 decision.
- Fit: Workable for a pure-static site, but it bets against the platform's direction and
  against our own storage-feature roadmap.

### Approach C - Keep GitHub Pages for prod (or stay on the VPS)

Do nothing on CF; serve prod from GitHub Pages or the current VPS Docker.

- Pros: Zero new platform. (GitHub Pages would also be $0.)
- Cons: GitHub Pages is a hard mismatch for this app: it 404s on deep links (the reason
  the legacy `sessionStorage.redirect` shim and `static/404.html` exist), needs a base
  path (`/Rackula/`), and cannot host the KV/R2 storage features at all. Note there is NO
  GitHub Pages workflow in the repo today - the `CLAUDE.md` / `ARCHITECTURE.md` claims that
  dev is "GitHub Pages" are stale; dev is a self-hosted Docker deploy. Staying on the VPS
  defeats the entire purpose of epic #1983 (cost + maintenance reduction).
- Fit: Rejected. Does not retire the VPS and cannot carry the optional features.

**Verdict:** Approach A (Workers Static Assets). It is the committed choice, it is $0
forever for static serving, the two-entry SPA correctness risk is fully resolved by
config, and it is the only target where the three optional storage features can live
beside the assets without a second migration.

---

## Baseline Hosting Plan (steps + CI)

### Steps

1. Add `wrangler.jsonc` at repo root (deploy-target config only; not imported by the app,
   not in the served bundle, ignored by nginx so self-host portability is untouched):

   ```jsonc
   {
     "name": "rackula-prod",
     "compatibility_date": "2026-06-09",
     "assets": {
       "directory": "./dist/",
       "not_found_handling": "single-page-application"
       // html_handling defaults to "auto-trailing-slash":
       //   /        -> 200 index.html
       //   /login   -> 200 login.html   (real file, never clobbered by SPA fallback)
       //   /<other> -> 200 index.html   (SPA fallback)
     },
     "routes": [{ "pattern": "count.racku.la", "custom_domain": true }]
   }
   ```

2. Decide `login.html`'s fate on static prod. Prod runs `AUTH_MODE=none`; `login.html`
   only POSTs to `/api/auth/login`, which does not exist on static prod, so it is
   non-functional. Cleanest path: leave it shipped (harmless - it is served only if
   explicitly requested) or drop it from the prod build. No routing change needed either
   way; SPA fallback never serves it implicitly.

3. Bind the custom domain `count.racku.la` to the Worker (Custom Domains, `custom_domain:
   true`). The zone is already on Cloudflare, so this is a route line / dashboard action,
   no nameserver work. Cloudflare auto-provisions the DNS record + edge cert.

4. Stand up a separate `rackula-dev` Worker (its own `wrangler` env/config) as the CF
   dev/preview environment to replace the homelab-hosted dev FRONTEND. Per-PR preview URLs
   (branch aliases) cover review. (Backend dev `rackula-api` stays on the homelab - out of
   scope.) Note the beta limitation: preview URLs are `workers.dev`-subdomain only.

5. Cleanup (do in the implementation PR, not the spike): delete the GitHub-Pages
   `sessionStorage.redirect` shim in `index.html` (lines ~34-42) and `static/404.html` -
   both are inert under Workers SPA routing. Fix the stale `VITE_BASE_PATH` "GitHub Pages:
   /Rackula/" comment in `vite.config.ts`, the dead `ARG/ENV VITE_PERSIST_ENABLED` in
   `deploy/Dockerfile`, and the stale "GitHub Pages" claims in `CLAUDE.md` /
   `docs/ARCHITECTURE.md`. Prod base path stays `/`.

### CI change (the gated pipeline swap)

The release pipeline is `validate -> stage-* -> gate-* -> promote-gate (prod environment
approval) -> promote-*`. Today `promote-prod` (release.yml ~line 414) calls the reusable
`deploy-prod.yml`, which runs on the self-hosted `vps-rackula` runner and does
`docker compose pull && docker compose up -d`, then smoke-tests `count.racku.la` and
`count.racku.la/version.json`.

Swap for CF:

- Replace the body of `deploy-prod.yml` (keeping it a `workflow_call` reusable so the
  orchestrator wiring is unchanged): change `runs-on: [self-hosted, vps-rackula]` to
  `runs-on: ubuntu-latest`; replace the compose/sync steps with `npx wrangler deploy`
  (against the `rackula-prod` config) run from a `dist/` built at the released tag. Keep
  the existing smoke test steps verbatim - `curl https://count.racku.la` and the
  `version.json` equality check both work unchanged on CF (version.json is a static asset).
- Add CI secrets: `CLOUDFLARE_API_TOKEN` (scoped to Workers Scripts:Edit + the zone) and
  `CLOUDFLARE_ACCOUNT_ID`.
- The prod frontend no longer depends on the docker `stage`/`gate` lanes for ITS deploy.
  Decide deliberately whether the prod static deploy should depend on `gate-docker` at all,
  or gate on a frontend build/`vite preview`-equivalent check instead. The self-host
  Docker image + LXC tarball staging/gating remain (self-hosters still consume them), so
  do NOT delete the docker/LXC lanes - just stop having PROD pull from them.
- `promote-gate` (the GitHub `prod` environment required-reviewer approval) stays exactly
  as-is; it is a manual approval gate independent of the deploy target.
- Pin and deliberately bump `compatibility_date`.

The self-hosted `vps-rackula` runner is still used by `deploy-dev.yml` until #1985 moves
dev off the box, so the runner cannot be retired by this change alone.

**Effort: Small** (Claude-assisted): `wrangler.jsonc`, the reusable-workflow body swap,
two secrets. Half a day including verifying the smoke test passes against the CF-served
`version.json`.

---

## CF Feature Designs

All three are **separable opt-in follow-ups**. R2 and KV re-couple work to `rackula-api`
because the self-host rule demands an API-backed equivalent - even though API *hosting* is
out of scope, the API *implementation* work lands on the backend. Web Analytics has no
such coupling.

### R2 Images

CF design: Public R2 bucket fronted by a custom domain (e.g. `img.racku.la`). Image GETs
are plain HTTP through the Cloudflare cache - **no Worker invocation** (does not touch the
100k/day Worker request limit) and cache hits do not even touch R2's Class B read counter.
Set `Cache-Control: public, max-age=31536000, immutable` on content-addressed image keys;
enable Smart Tiered Cache. Relevant only to the **user-upload** image path and (optionally)
to offloading bundled device images off the Worker asset set. Do NOT use the `r2.dev`
subdomain for prod (rate-limited, non-production). Bundled device images do not need R2 -
they are fine as static assets in `dist/`.

Self-host equivalent (parity): behind a frontend `ImageSource` interface. CF impl resolves
icon/asset URLs to the R2 custom domain. Self-host impl serves identical images from the
existing static bundle (`src/lib/data/bundledImages`) for built-ins, and from the existing
`rackula-api` asset store (`api/src/routes/assets.ts` + `api/src/storage/assets.ts`,
filesystem-backed under `/data` with `quota.ts`) for user uploads. For user uploads with
NO API, the current data-URL fallback (`images.svelte.ts`) is the floor. The self-host
parity backend already exists - R2 is the CF equivalent of the existing filesystem store,
so this feature satisfies the self-host rule with the least new backend work.

Security: public reference data, no signing needed for built-in icons. For user uploads,
validate content-type and size at the Worker/API boundary, content-address keys, serve
with a non-executable content-type, and rely on R2 Class A (PutObject) only at
upload/build time. Front with the CF cache so reads are mostly cache hits.

Effort: Small. Bucket + custom domain + cache rule is dashboard work; the app change is one
URL-resolver behind the `ImageSource` interface. The real cost is curating/uploading the
image set (content, not code). Self-host parity is largely pre-existing. Separable: yes.

### KV Share Links

CF design: Store the LZ-string-compressed layout blob in KV under a short key; hand out
`count.racku.la/s/<key>`. Add a `main` Worker with `run_worker_first: ["/s/*"]` so only
`/s/*` invokes the Worker and everything else stays a zero-billing static asset. `POST /s`
creates (content-hash the payload to dedupe and skip redundant writes), `GET /s/:id`
resolves. This is **purely additive**: the existing inline `?l=<blob>` share path
(`share.ts` `generateShareUrl`/`encodeLayout`) must remain for offline/self-host parity.

KV free-tier reality: writes/day (1,000) is the only real free-tier cliff and it sits on
the unauthenticated create path. Reads are 100k/day, storage 1 GB, value cap 25 MiB (our
layouts are KB to low-hundreds-KB - orders of magnitude under). KV is eventually
consistent (a new link may take up to ~60s to read from a different edge); fine for share
links since the creator gets the URL back from the write response.

Self-host equivalent (parity): behind a frontend `ShareStore` interface. CF impl = the
Worker+KV endpoint. Self-host impl = a NEW `rackula-api` route (`POST /share`,
`GET /share/:id`) backed by the API's existing persistence layer (it already does
UUID-keyed layout CRUD). With no API present at all, degrade to the current encoded-URL
behaviour - that is the floor, not the target. This is the feature with the most NEW
backend work: the parity route does not exist yet and is a backend follow-up.

Security (this is the real risk surface - treat it like a public paste service): app-level
body size cap (reject >256 KB) BEFORE the KV put; Zod-schema-validate the payload (422 on
non-layouts, never store arbitrary blobs); WAF per-IP rate-limit on `POST /s` (free tier
includes a basic rate-limit rule), optionally Turnstile if abuse appears; no list /
enumeration endpoint and random/hashed keys (note: reads of non-existent keys still count
and are billed, so a scanner burns read budget - the per-IP limit covers this); serve
resolved values with a non-executable content-type (`application/yaml` / `text/plain`,
never `text/html`) to prevent stored-XSS from your own domain. Content-hash dedupe also
protects the 1k/day write budget.

Effort: Small-to-Medium. The Worker + KV endpoint and the frontend interface are
straightforward; the Medium is doing the security hardening properly AND building the
parallel `rackula-api` route demanded by the self-host rule. Budget for the
dual-implementation, not the KV mechanics. Separable: yes.

### CF Web Analytics

CF design: Cloudflare Web Analytics - free, cookieless, privacy-first RUM (unique
visitors, page views, referrers, browser/OS, country, Core Web Vitals). Add the manual
beacon snippet (`<script defer src="https://static.cloudflareinsights.com/beacon.min.js"
data-cf-beacon='{"token":"..."}">`) to `index.html` `<head>` (and `login.html` if kept).
Prefer the manual snippet over automatic zone injection so the beacon is part of OUR build
and we control where it loads (and keep it out of self-host builds). No code in the app
ships today - Umami was fully removed; only `CHANGELOG.md` mentions it.

Self-host equivalent (parity): this feature is the exception - there is no storage backend
and therefore no `rackula-api` equivalent is required. The "parity" obligation is instead
**clean separation**: gate the beacon `<script>` behind a build-time flag (e.g.
`VITE_CF_ANALYTICS_TOKEN`, mirroring the existing `VITE_BASE_PATH` / `__BUILD_ENV__`
pattern) so it is present only in the Cloudflare-hosted bundle. Self-host Docker/LXC builds
do not set the token, emit no beacon, and make zero third-party calls. Self-hosters get a
clean, tracker-free build - which is parity for a privacy-first project.

Security / privacy: no cookies, no localStorage, no persistent identifier, no cross-site
fingerprinting; generally no consent banner required under GDPR/ePrivacy (confirm with
counsel). If/when a CSP ships, allow `script-src https://static.cloudflareinsights.com`
and `connect-src https://cloudflareinsights.com` (or the proxied `/cdn-cgi/rum` path).

Effort: Trivial. A conditional script tag keyed off an env var. The only judgement call is
the build-flag plumbing so self-host stays beacon-free. Separable: yes.

---

## Dual-Backend Storage Abstraction

One frontend storage interface per feature, two implementations (plus a degrade floor),
selected by runtime detection reusing the EXISTING seam in
`src/lib/stores/persistence.svelte.ts` + `src/lib/utils/persistence-api.ts`, which already
probes `/api/health` with a strict JSON-shape check (hardened against SPA-fallback false
positives). That seam already chooses "API present vs not"; the storage abstraction
extends it to "API present -> self-host impl; on Cloudflare -> CF impl; neither ->
degrade".

```
ShareStore  ── CloudflareShareStore   (POST/GET /s/* Worker + KV)
            ├─ ApiShareStore          (rackula-api POST/GET /share/* — self-host parity)
            └─ EncodedUrlShareStore   (degrade: inline ?l=<blob>, no backend)

ImageSource ── R2ImageSource          (img.racku.la R2 custom domain)
            ├─ ApiImageSource         (rackula-api /assets/* — existing filesystem store)
            └─ BundledImageSource     (built-ins from src/lib/data/bundledImages;
                                       user uploads degrade to in-browser data URLs)
```

Selection rules:

- If the app is talking to a live `rackula-api` (existing `apiAvailable` runtime
  detection) -> use the API implementation (self-host parity).
- Else if a build-time/runtime CF config flag is set (our Cloudflare deploy) -> use the CF
  implementation (Worker+KV / R2 custom domain).
- Else -> degrade floor (encoded-URL share / data-URL images).

Design properties:

- Frontend storage logic stays backend-agnostic. CF URLs are never hard-coded in app code
  (they sit behind the interface / config), preserving self-host portability.
- Self-hosters get a real backend (parity), not a degraded fallback - the spike's
  must-preserve rule.
- The deploy-target config (`wrangler.jsonc`, `_headers`/`_redirects`) stays out of app
  code, so `vite build -> dist/` remains nginx-servable unchanged.
- The interface is the per-feature cost multiplier: each storage feature requires a CF
  impl AND an API impl. This is the re-coupling to `rackula-api` to be explicit about.

Effort to establish the abstraction itself: Small (it leverages the existing detection
seam). The per-impl cost is accounted for in each feature above.

---

## VPS Retirement: Honest Accounting

Moving the frontend to Cloudflare retires **only the prod VPS tenant**. Be precise:

- What the frontend move retires: the prod hosting of `count.racku.la`. Prod already runs
  as a no-API static bundle (`AUTH_MODE=none`, persistence API gated behind a compose
  `persist` profile that prod does not enable), so the prod move is a lift-and-shift of a
  static `dist/` with no backend implications. `promote-prod` stops calling the
  `vps-rackula` runner.
- What still runs on the VPS after the frontend move: the **dev** environment.
  `deploy-dev.yml` deploys via `runs-on: [self-hosted, vps-rackula]` with
  `docker compose --profile persist up` (frontend + `rackula-api`) and verifies
  `d.racku.la` + `d.racku.la/api/layouts`. The dev `rackula-api` is a real backend with
  persistence - it cannot just be deleted.
- What full VPS retirement still requires:
  1. #1985 - move the dev `rackula-api` (and the dev frontend hosting) onto the homelab.
     The dev FRONTEND can also move to a `rackula-dev` Worker (this spike's step 4), but
     the dev API must land on the homelab (backend hosting is out of THIS spike's scope).
  2. #1986 - decommission the Linode box and tear down the `vps-rackula` self-hosted
     runner (still referenced by `deploy-dev.yml` until #1985 lands).
- Prerequisite already done: Umami removal (so the analytics decision is a clean
  greenfield CF Web Analytics choice, not a migration).

So: the frontend move is necessary but not sufficient. It cleanly kills the prod tenant
and is the right first step, but the VPS only goes away after #1985 (dev API -> homelab)
and #1986 (decommission).

---

## Phasing

Baseline hosting first; storage features as independent opt-in follow-ups.

1. Phase 0 (prereq, done): Umami removed. No analytics code ships.
2. Phase 1 - Baseline prod move (#1984, this spike's core): `wrangler.jsonc`, custom
   domain bind, CI promote-step swap (`deploy-prod.yml` body -> `wrangler deploy`), smoke
   test re-verified against CF-served `version.json`. Codebase cleanup (delete GH-Pages
   shims, fix stale docs/build args). Retires the prod VPS tenant. Effort: Small.
3. Phase 2 - CF dev/preview environment: separate `rackula-dev` Worker for the dev
   FRONTEND + per-PR preview URLs. (Dev API -> homelab is #1985, separate.) Effort: Small.
4. Phase 3 - Web Analytics (opt-in, no API coupling): build-flagged beacon. Can ship any
   time after Phase 1. Effort: Trivial.
5. Phase 4 - R2 images (opt-in): `ImageSource` interface + R2 custom-domain impl;
   self-host parity already exists via the API filesystem store. Effort: Small.
6. Phase 5 - KV share links (opt-in, most API coupling): `ShareStore` interface + Worker
   `/s/*` + KV, the full security hardening, AND the new `rackula-api /share/*` parity
   route (backend follow-up). Do last; it is the heaviest. Effort: Small-to-Medium.
7. Phase 6 - Full VPS retirement: #1985 (dev API -> homelab) + #1986 (decommission box +
   runner). Out of this spike's build scope; gated on dev API relocation.

Do NOT bundle Phases 3-5 into Phase 1. They re-couple to `rackula-api` and would stall a
clean, low-risk lift-and-shift.

---

## Effort Summary Table

| Workstream | Effort (Claude-assisted) | Separable | API re-coupling | Notes |
| --- | --- | --- | --- | --- |
| Baseline: prod frontend -> Workers Static Assets | Small | n/a (core) | None | `wrangler.jsonc` + CI promote-step swap + 2 secrets; SPA two-entry works by config |
| CI: gated promote-step (VPS Docker -> `wrangler deploy`) | Small | part of baseline | None | Swap `deploy-prod.yml` body; keep smoke test + `prod` env approval; keep docker/LXC staging for self-host |
| SPA two-entry routing | Trivial | part of baseline | None | `not_found_handling: single-page-application` + default `html_handling` |
| CF dev/preview environment | Small | yes | None (frontend only) | Separate `rackula-dev` Worker + preview URLs; dev API -> homelab is #1985 |
| Codebase cleanup (GH-Pages shims, stale docs/build args) | Trivial | yes | None | Delete `sessionStorage.redirect` shim + `static/404.html`; fix stale comments |
| Web Analytics | Trivial | yes | None | Build-flagged beacon; keep out of self-host builds |
| R2 images | Small | yes | Light (parity exists) | `ImageSource` interface; R2 custom domain; self-host parity via existing filesystem store |
| KV share links | Small-to-Medium | yes | Heavy (NEW api route) | Worker `/s/*` + KV + security hardening + new `rackula-api /share/*` parity route |
| Dual-backend storage abstraction | Small | enabler | structural | Reuses existing runtime API-detection seam; per-impl cost in each feature |
| Observability (`wrangler tail` / Workers Logs) | Trivial | yes | None | Replaces `docker logs` for any storage Worker; $0, net upgrade |
| Full VPS retirement (#1985 + #1986) | (out of scope) | yes | Backend hosting | Dev API -> homelab, then decommission box + `vps-rackula` runner |

---

## Open Risks

1. KV write-flood on the unauthenticated share-create path is the only real free-tier
   cliff (1,000 writes/day). Must land with size cap + Zod validation + content-hash dedupe
   + WAF per-IP rate-limit + non-HTML content-type BEFORE shipping KV share links. Reads of
   non-existent keys are billed, so enumeration scanners burn read budget too.
2. The self-host-equivalent rule is a recurring cost multiplier: every storage feature needs
   a CF impl AND a `rackula-api` impl. KV share links in particular need a NEW backend route
   that does not exist yet - real backend work even though API hosting is out of scope.
3. Preview URLs are `workers.dev`-subdomain only in beta (no custom-domain previews). If
   the dev/preview UX must be on a `racku.la` subdomain, that is not yet supported; plan dev
   review on the `workers.dev` alias.
4. CI-secret provisioning: `CLOUDFLARE_API_TOKEN` (least-privilege: Workers Scripts:Edit +
   zone) and `CLOUDFLARE_ACCOUNT_ID`. A mis-scoped token is the most likely deploy snag.
5. The `vps-rackula` self-hosted runner is still used by `deploy-dev.yml`; it cannot be torn
   down by the frontend move alone. Do not delete the docker/LXC staging lanes either -
   self-hosters consume those images/tarballs.
6. KV eventual consistency: a new share link may take up to ~60s to be readable from a
   different edge. Acceptable for share links; note in UX, do not promise instant
   cross-region availability.
7. Stale docs/build artifacts (`CLAUDE.md`/`ARCHITECTURE.md` "GitHub Pages" claims, the
   `VITE_BASE_PATH` "/Rackula/" comment, dead `VITE_PERSIST_ENABLED` build arg, legacy
   GH-Pages shims) will mislead if not cleaned up in the implementation PR.
8. `compatibility_date` drift: pin it and bump deliberately; an unpinned/over-eager bump can
   change Worker runtime behaviour.
9. `login.html` on static prod is non-functional (POSTs to a non-existent `/api/auth/login`)
   - confirm it is dropped or deliberately left inert; SPA fallback will not serve it
   implicitly, so the risk is only a user manually hitting `/login` and seeing a dead form.
