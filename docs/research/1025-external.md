# Spike #1025 — External Cloudflare Research

Authoritative Cloudflare platform research for hosting the Rackula **frontend** on
Cloudflare Workers Static Assets, retiring the prod Linode VPS tenant (epic #1983,
child #1984). Researched June 2026 against `developers.cloudflare.com` (current docs)
plus the Cloudflare docs MCP tool.

**Scope reminder:** porting/hosting `rackula-api` (backend) is OUT of scope. The API
stays where it is and is the designated "self-host equivalent" backend for any storage
feature. This report covers the frontend move plus three optional, low/no-cost CF
storage follow-ups (R2 images, KV share links, Web Analytics).

**Confirmed frontend facts (read from the repo, not assumed):**

- Plain Vite + Svelte 5 SPA, no SvelteKit / no adapter. `vite build` emits a static
  `dist/`.
- Two HTML entries wired in `vite.config.ts` `rollupOptions.input`:
  `main: index.html` and `login: login.html`. Both end up as real files in `dist/`.
- `base` is driven by `process.env.VITE_BASE_PATH || "/"`.
- A `version.json` (`{version, commit, buildTime}`) is emitted at build time and served
  at `/version.json` (powers the post-release version-alignment test).
- `index.html` already contains a GitHub-Pages SPA `sessionStorage.redirect` shim. That
  shim is GH-Pages-specific and becomes dead weight (harmless) once on Workers; it can
  be deleted as cleanup.
- Runtime API detection lives in `src/lib/stores/persistence.svelte.ts` +
  `src/lib/utils/persistence-api.ts` (probes `/health`). The app works WITH or WITHOUT
  an API. This is the seam every storage feature plugs into.

---

## 1. Workers Static Assets: deploying a Vite multi-entry static build

### The model

Workers Static Assets serves files uploaded with your Worker directly from Cloudflare's
edge. For a pure static site you can ship assets-only (no Worker script); for storage
features you add a `main` Worker script that runs alongside the assets. Workers Sites
(the old `[site]` / kv-asset-handler approach) is **deprecated in Wrangler v4 and must
not be used for new projects** — Static Assets is the replacement.
([wrangler/configuration](https://developers.cloudflare.com/workers/wrangler/configuration/))

### Minimal config (assets-only, static site)

`wrangler.jsonc` at repo root:

```jsonc
{
  "name": "rackula-prod",
  "compatibility_date": "2026-06-09",
  "assets": {
    "directory": "./dist/",
    "not_found_handling": "single-page-application"
    // html_handling defaults to "auto-trailing-slash" (see §2)
  }
}
```

The `assets` key options that matter to us
([wrangler/configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)):

- `directory` (string): folder of static assets. With the **Cloudflare Vite plugin**
  this is auto-detected from the client build output and the wrangler config is even
  optional for assets-only sites (Dec 2025 change), but we'll keep an explicit file for
  clarity and to set `not_found_handling`.
  ([changelog 2025-12-08](https://developers.cloudflare.com/changelog/post/2025-12-08-vite-optional-config/))
- `binding` (string): only needed when a Worker script (`main`) is present — exposes
  `env.ASSETS.fetch(request)` so the Worker can serve assets after handling API routes.
- `not_found_handling`: `"none" | "404-page" | "single-page-application"` (default
  `none`). For Rackula: `single-page-application`.
- `html_handling`: `"auto-trailing-slash" | "force-trailing-slash" | "drop-trailing-slash" | "none"`
  (default `auto-trailing-slash`). This is the key to clean two-entry routing — see §2.
- `run_worker_first`: `boolean | string[]`. When a storage Worker is added, set this to
  an array of route globs (e.g. `["/s/*", "/api/*"]`) so only those paths invoke the
  Worker and everything else is served as a static asset with zero Worker billing.
  Requires Wrangler v4.20.0+ and (if using the Vite plugin) plugin v1.7.0+.
  ([changelog 2025-06-17 advanced routing](https://developers.cloudflare.com/changelog/post/2025-06-17-advanced-routing/))

### Custom domain (count.racku.la)

Two ways to bind a hostname to a Worker
([custom-domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)):

- **Custom Domains** — recommended when the Worker is the origin (our case). Add
  `custom_domain = true` on the route pattern, or attach via dashboard / API. Cloudflare
  provisions the DNS record + edge cert automatically. Custom Domains do **not** support
  wildcards; the request must exactly match the registered (sub)domain.
- **Routes** — for when the origin is external to Cloudflare (not us).

`racku.la` already lives on Cloudflare (the project uses CF DNS today), so attaching
`count.racku.la` is a dashboard click or one route line — no nameserver migration.

```jsonc
{
  "name": "rackula-prod",
  "compatibility_date": "2026-06-09",
  "assets": { "directory": "./dist/", "not_found_handling": "single-page-application" },
  "routes": [{ "pattern": "count.racku.la", "custom_domain": true }]
}
```

### CI via `wrangler deploy`

Deploy is a single command that uploads both assets and (optional) Worker code:

```bash
npx wrangler deploy
```

This slots into the existing gated release pipeline as the **promote step** for prod
(replacing the VPS Docker pull). It needs a `CLOUDFLARE_API_TOKEN` (scoped to
Workers Scripts:Edit + the zone) and `CLOUDFLARE_ACCOUNT_ID` as CI secrets. The
`compatibility_date` should be pinned and bumped deliberately.

### Per-PR preview / `wrangler versions` preview URLs

Cloudflare added native preview URLs (July 2025) that behave like Pages preview deploys
([changelog 2025-07-23](https://developers.cloudflare.com/changelog/post/2025-07-23-workers-preview-urls/)):

- `wrangler versions upload` uploads a version WITHOUT promoting it to production and
  returns a **Commit Preview URL** (`<version-prefix>-<worker>.<subdomain>.workers.dev`).
- A **Branch Preview URL** alias (`<branch>-<worker>.<subdomain>.workers.dev`) is created
  automatically per PR branch and stays stable across commits; it's posted as a PR
  comment, like Pages.
- Custom alias: `wrangler versions upload --preview-alias staging`.
- `wrangler versions deploy` later promotes a chosen version to production (enables
  instant rollback by re-promoting an old version).

**Caveats (beta):** preview URLs are **workers.dev-subdomain only — custom domains are
not yet supported for previews**, require Wrangler v4.21.0+, and are not generated for
Workers using Durable Objects (we won't). Default enablement now follows your
workers.dev route setting in v4.44.0+.
([changelog: preview URL setting behavior](https://developers.cloudflare.com/changelog/product/workers/4/))

This gives us a "CF dev/preview environment" cleanly: a separate `rackula-dev` Worker
(its own wrangler config / env) for the homelab-replacement dev frontend, plus
ephemeral per-PR preview URLs for review.

**Effort: Small** for the baseline static deploy. It's a wrangler config file + one CI
job swap. Claude-assisted, this is an afternoon. The fiddly bits are CI secrets and the
promote-step wiring into the existing gated pipeline, not the CF config itself.

---

## 2. SPA routing with TWO entries (index.html + login.html)

This is the single most important correctness question, and the answer is clean.

**`not_found_handling: single-page-application` only affects requests that DON'T match a
real asset.** Quote: *"When an incoming request does not match a file in the
`assets.directory`, Workers will serve the contents of the `/index.html` file with a
`200 OK` status."*
([SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/))
Real files are always served first. So `login.html` (a real file in `dist/`) is served
by exact match and is **never** clobbered by the SPA fallback.

**The `/login` (no extension) mapping is handled by `html_handling`, default
`auto-trailing-slash`**
([html-handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)).
With the build containing `dist/login.html`:

| Request        | Response          | File served        |
| -------------- | ----------------- | ------------------ |
| `/`            | 200               | `/dist/index.html` |
| `/login`       | 200               | `/dist/login.html` |
| `/login.html`  | 307 → `/login`    | —                  |
| `/login/`      | 307 → `/login`    | —                  |
| `/anything-else` (no matching asset) | 200 | `/dist/index.html` (SPA fallback) |

So the **two-entry app just works** with `auto-trailing-slash` + `single-page-application`:
`/` and any unknown client route → `index.html`; `/login` → `login.html`. No Worker code
needed for routing.

**The one gotcha:** because the SPA fallback is *index.html* for unmatched paths, a typo'd
auth path like `/log-in` would silently serve the main app instead of 404ing. That's
intrinsic to SPA mode and is fine for us (the app's own router/login redirect handles it).
If you ever wanted hard isolation you'd add a Worker with `run_worker_first: ["/login*"]`,
but that's unnecessary here.

**Action item for the codebase:** the GitHub-Pages `sessionStorage.redirect` shim in
`index.html` (lines 34-42) exists because GH Pages 404s on deep links. Workers SPA mode
makes it redundant. Leave it or delete it — it's inert on Workers. Recommend deleting as
cleanup when the GH Pages target is retired.

---

## 3. Free-tier cost reality (honest $0 assessment)

**Baseline static frontend on the Free plan is genuinely $0**, and the reason is the
single most important pricing fact:

> **Requests to static assets are free and unlimited.** There are **no charges for data
> transfer (egress) or bandwidth.**
> ([workers/platform/pricing](https://developers.cloudflare.com/workers/platform/pricing/))

So serving Rackula's HTML/JS/CSS/images to any volume of users costs nothing and counts
against no quota. A pure static deploy has effectively no cost ceiling to worry about.

**Where Worker *invocations* are billed (only when a storage Worker runs):**

| Resource (Free plan) | Limit | Notes |
| --- | --- | --- |
| Worker requests | **100,000 / day** | Only requests that actually invoke Worker code (e.g. KV share-link reads/writes). Static-asset hits do NOT count. |
| CPU time | 10 ms / invocation | Trivial for a KV get/put. |
| Egress / bandwidth | none / $0 | No data-transfer charges anywhere on Workers. |

Paid (Standard, $5/mo) bumps requests to 10M/mo + CPU to 30M ms/mo, but we won't need it.
([pricing](https://developers.cloudflare.com/workers/platform/pricing/))

**Limits most at risk for the three optional features:**

- **KV — `writes` is the binding constraint.** Free plan = **1,000 writes/day, 1,000
  deletes/day, 1,000 list/day, 100,000 reads/day, 1 GB storage.** Reads are generous;
  writes are the cliff. Every share-link *creation* is one write. A spike of >1,000
  share creations in a day would start failing writes (reads keep working).
  ([kv/pricing](https://developers.cloudflare.com/kv/platform/pricing/))
  Mitigation: dedupe identical payloads (hash key → skip write if exists), cap creation
  rate (see §5). Also note: **all KV ops are billed/counted, including reads of
  non-existent keys** (404s count) — relevant to abuse.
- **R2 — storage + ops, ZERO egress.** Free tier = **10 GB-month storage, 1,000,000
  Class A ops/mo (writes/uploads), 10,000,000 Class B ops/mo (reads/GET), egress
  Free.** Device images/icons are tiny and read-mostly; 10 GB is enormous for icon-sized
  assets, and the Class B (read) allowance is 10M/mo. Realistically free forever for our
  scale.
  ([r2/pricing](https://developers.cloudflare.com/r2/pricing/))
  Also: front R2 with the CF cache (custom domain) so most reads are cache hits that
  never touch R2's Class B counter at all.
- **Workers requests/day (100k)** — only consumed by the KV/R2 *Worker* endpoints, not
  by image GETs from a public R2 bucket or static-asset hits. Hard to hit at homelab
  scale.

**Bottom line:** Free plan covers the static frontend forever and comfortably covers all
three optional features at Rackula's traffic. The only realistic $0-risk is a KV
write-flood from an unauthenticated share endpoint — addressed in §5.

---

## 4. R2 for image hosting (device images / icons)

### Public bucket vs Worker-fronted

Two access patterns
([r2/public-buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)):

1. **Public bucket + custom domain** (recommended for our read-only image CDN). Attach a
   custom domain (e.g. `img.racku.la` or a path on the zone). This routes through the
   Cloudflare cache, and unlocks WAF, cache rules, Access, and bot management. Image GETs
   are plain HTTP — **no Worker invocation, so they don't touch the 100k/day Worker
   limit.** Reads that hit cache don't even touch R2's Class B counter.
2. **`r2.dev` development subdomain** — rate-limited, "non-production only," and you can't
   layer cache/WAF on it. Do **not** use for prod; fine for a quick dev spike.
3. **Worker-fronted** — only needed if you want auth, signed URLs, on-the-fly transforms,
   or to keep the bucket private. Adds a Worker invocation per request. Not needed for
   public device icons.

> *"Egressing directly from R2, including via the Workers API, S3 API, and r2.dev
> domains does not incur data transfer (egress) charges and is free."*
> ([r2/pricing](https://developers.cloudflare.com/r2/pricing/))

### Caching / cache-control

Custom-domain access uses Cloudflare Cache. By default only certain file extensions are
cached; set a **Cache Everything** rule (or rely on default image extensions) and set
long `Cache-Control: public, max-age=31536000, immutable` on content-addressed image
keys. Use **Smart Tiered Cache** to keep a single upper-tier near the bucket. Cached
reads cost nothing and bypass R2 ops entirely.
([public-buckets caching](https://developers.cloudflare.com/r2/buckets/public-buckets/),
[cache default behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/))

### Signed vs public

Device icons are public reference data → **public bucket, no signing.** Class A
(`PutObject`) ops happen only at upload/build time (1M/mo free, trivially under). Class B
(`GetObject`) is read; cache absorbs the bulk. `DeleteObject` is a **free** operation.

### Self-host equivalent (must-preserve rule)

Behind a frontend `ImageSource` interface: the CF implementation resolves icon URLs to
the R2 custom domain; the self-host implementation serves the same images from the
existing static bundle / `rackula-api` static route (the bundled-images path the app
already ships — `src/lib/data/bundledImages`). Self-hosters get identical images from
their own origin, not a degraded experience.

**Effort: Small.** Bucket + custom domain + cache rule is dashboard work; the app change
is one URL-resolver behind an interface. Claude-assisted, the interface + both impls are
a short task. The real work is curating/uploading the image set, which is content, not code.

---

## 5. KV for share-link shortening

### Why

Today share state is a giant encoded blob in the URL (see `spike-781-share-url-strategy.md`).
KV lets us store the blob server-side under a short key and hand out `count.racku.la/s/AbC123`.

### Free limits (writes/day is the binding constraint)

| KV (Free) | Value |
| --- | --- |
| Reads | 100,000 / day |
| **Writes** | **1,000 / day** ← the constraint |
| Deletes | 1,000 / day |
| List | 1,000 / day |
| Storage | 1 GB |

([kv/pricing](https://developers.cloudflare.com/kv/platform/pricing/))

### Hard limits

- **Value size: 25 MiB** (per key). A typical Rackula layout serialized is kilobytes to
  low hundreds of KB — orders of magnitude under the cap. 1 GB storage / ~tens-of-KB
  values ≈ tens of thousands of share links before storage matters; writes/day bites
  first.
- Key size: 512 bytes. Metadata: 1024 bytes.
- **Min `expiration_ttl`: 60 seconds** (the 30s figure in recent changelogs is the read
  *cacheTtl*, a different parameter). Set generous expiry, e.g. share links live 90-365
  days, or no expiry for permanent links.
- Same-key write rate-limited to **1/second**; writes to *different* keys limited only by
  the daily 1,000.
- ([kv/limits](https://developers.cloudflare.com/kv/platform/limits/),
  [kv cacheTtl 30s changelog](https://developers.cloudflare.com/changelog/post/2026-01-30-kv-reduced-minimum-cachettl/))

### Consistency caveat

KV is **eventually consistent**, not read-your-writes-immediately globally. A
freshly-created share link may take up to ~60s to be readable from a *different* edge
location than where it was written (default cache TTL is 60s). For share links this is
fine — the creator gets the short URL back from the write response and typically shares it
seconds-to-minutes later. Worth noting in the UX so we don't promise instant
cross-region availability.

### Key design

- Key = short, URL-safe, collision-resistant slug. Generate from a CSPRNG (e.g. 8-10
  chars of base62 ≈ 48-60 bits) OR content-hash the payload (sha-256 → first N chars) so
  identical layouts dedupe to the same key and skip a write (saves against the 1k/day
  cap).
- Value = the serialized layout (YAML/JSON, same wire format the app already uses).
- Optional metadata = `{ createdAt, version }` for housekeeping.

### Minimal Worker API shape

```js
// run_worker_first: ["/s/*"]  — everything else stays a static asset
export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // POST /s  -> create
    if (req.method === "POST" && url.pathname === "/s") {
      const body = await req.text();
      if (body.length > 256 * 1024) return new Response("Too large", { status: 413 });
      if (!isValidLayout(body)) return new Response("Invalid", { status: 422 });
      const key = await contentHashKey(body);           // dedupe-friendly
      // skip write if it already exists (saves the daily write budget)
      if ((await env.SHARES.get(key)) === null) {
        await env.SHARES.put(key, body, {
          expirationTtl: 60 * 60 * 24 * 365,             // 1 year, min is 60s
          metadata: { createdAt: Date.now() },
        });
      }
      return Response.json({ id: key, url: `https://count.racku.la/s/${key}` });
    }

    // GET /s/:id -> resolve
    if (req.method === "GET" && url.pathname.startsWith("/s/")) {
      const id = url.pathname.slice(3);
      const val = await env.SHARES.get(id);
      return val
        ? new Response(val, { headers: { "content-type": "application/yaml" } })
        : new Response("Not found", { status: 404 });
    }

    return env.ASSETS.fetch(req); // fall through to static frontend
  },
};
```

### Security posture for an UNAUTHENTICATED write endpoint

This is the real risk surface. Treat it like a public paste service:

- **Size cap** on the request body BEFORE the KV put (e.g. reject >256 KB). The 25 MiB KV
  limit is far too permissive for our content; a small app-level cap prevents storage
  abuse and oversized writes.
- **Validation:** parse/validate the payload against the existing Zod layout schema; 422
  on anything that isn't a real layout. Never store arbitrary blobs.
- **Rate-limiting:** the 1,000 writes/day free cap is itself a (crude) global circuit
  breaker, but to avoid one actor burning it, add Cloudflare **WAF rate-limiting rules**
  on `POST /s` (per-IP, e.g. N/min) — free tier includes a basic rate-limiting rule. Also
  consider Cloudflare **Turnstile** (free, privacy-friendly CAPTCHA) on the create action
  if abuse appears.
- **No listing / no enumeration:** never expose a list endpoint; random/hashed keys are
  not guessable. Remember **reads of non-existent keys still count and are billed** — a
  scanner hitting `/s/<random>` burns your read budget; the per-IP rate limit covers this
  too.
- **Content-type discipline:** serve resolved values with a non-executable content type
  (`application/yaml` / `text/plain`), never `text/html`, so a malicious payload can't be
  rendered as a page from your domain (stored-XSS guard).
- **Privacy:** share blobs are layout data, not PII, but they're effectively public to
  anyone with the link — document that.

### Self-host equivalent (must-preserve rule)

Behind a frontend `ShareStore` interface:

- CF implementation → the Worker+KV endpoint above.
- Self-host implementation → a `rackula-api` route (`POST /share`, `GET /share/:id`)
  backed by the API's existing persistence layer (it already does UUID-keyed layout
  CRUD). Self-hosters get real short links from their own API, not a degraded
  copy-the-giant-URL fallback.
- If *no* API is present (pure static self-host), the feature degrades to the current
  encoded-URL behaviour — but that's the floor, not the target.

**Effort: Small-to-Medium.** The Worker + KV endpoint and the frontend interface are
straightforward Claude-assisted work. The Medium part is doing the security hardening
properly (size cap, schema validation, WAF rate-limit rule, content-type) and building
the parallel `rackula-api` implementation to honour the self-host rule. Budget extra for
the dual-implementation requirement, not the KV mechanics.

---

## 6. Cloudflare Web Analytics

### What it is

Free, privacy-first, **cookieless** RUM analytics. Available on all plans, including Free.
Reports unique visitors, page views, referrers, browser/OS, country, and Core Web Vitals.
([web-analytics](https://developers.cloudflare.com/web-analytics/))

### How it's added

Two modes
([web-analytics/get-started](https://developers.cloudflare.com/web-analytics/get-started/)):

- **Automatic (proxied zone):** if the hostname is proxied through Cloudflare (ours is),
  Cloudflare can inject the beacon for you — no code change. Convenient, but it injects
  into *every* response for that hostname, which we do NOT want for self-host parity (see
  below).
- **Manual JS snippet (recommended for us):** add the beacon to the HTML entries
  explicitly so it's part of *our* build and we control exactly where it loads.

The snippet (loads from `static.cloudflareinsights.com`):

```html
<script defer
  src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token": "YOUR_SITE_TOKEN"}'></script>
```

The `token` identifies your site to Cloudflare. Beacon data is sent to
`https://cloudflareinsights.com/cdn-cgi/rum` (or `https://<yourdomain>/cdn-cgi/rum` when
the zone is proxied).
([web-analytics FAQ / RUM beacon](https://developers.cloudflare.com/speed/observatory/rum-beacon/))

### Privacy / GDPR

No cookies, no `localStorage`, no client-side persistent identifier, no cross-site
fingerprinting. Because there's no cookie or persistent ID, it generally **does not
require a cookie-consent banner** under GDPR/ePrivacy. (Confirm with your own counsel,
but the privacy-by-design posture is the whole selling point and the reason it replaced
Umami here.)

### CSP impact

If/when Rackula ships a Content-Security-Policy, allow the beacon source:

```
script-src 'self' https://static.cloudflareinsights.com;
connect-src 'self' https://cloudflareinsights.com;
```

(Adjust `connect-src` to the proxied `/cdn-cgi/rum` path if using automatic injection.)
The current nginx `security-headers.conf` would need the same allowance only if it
defines a CSP that restricts scripts.

### Keeping it OUT of self-host builds (no coupling)

This is the important one for the self-host rule. Do **not** use automatic zone injection
(it would only affect *our* CF zone anyway, but to be safe and explicit). Instead, gate
the manual snippet behind a build-time flag so it's present only in the
Cloudflare-hosted bundle:

- Inject the beacon `<script>` only when an env var is set (e.g. `VITE_CF_ANALYTICS_TOKEN`),
  via a tiny Vite transform / conditional in `index.html` + `login.html`, mirroring the
  existing `VITE_BASE_PATH` / `__BUILD_ENV__` pattern.
- Self-host Docker/LXC builds simply don't set the token → no beacon, no `cloudflareinsights.com`
  reference, zero third-party calls. Clean separation, no coupling.

**Effort: Trivial.** A conditional script tag keyed off an env var. The only judgement
call is the build-flag plumbing so self-host stays beacon-free.

---

## 7. Pages vs Workers Static Assets (current best practice)

**Workers Static Assets is the current recommended path for new projects**, and the
committed choice here (#1984). Cloudflare is steering new static/full-stack sites to
Workers; Pages is in maintenance-mode positioning. Workers gives a "distinctly broader
set of features" (Durable Objects, Cron Triggers, KV/R2/D1 bindings in the same Worker,
the full observability stack) that Pages can't match — which matters precisely because
our optional features (KV share links, R2) want to live next to the static assets.
([migrate-from-pages](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/))

**What you historically "lose" by picking Workers over Pages — and the current reality:**

| Pages-only convenience | Status on Workers (2026) |
| --- | --- |
| Git-integration auto-builds (push → CF builds) | Not built-in; you run `wrangler deploy` from your own CI (we already have CI, so this is a non-loss). |
| Automatic per-PR preview deployments | **Now available on Workers** via preview URLs + branch aliases (§1), posted as PR comments like Pages — but **workers.dev subdomain only**, not on custom domains (beta limitation). |
| `_headers` / `_redirects` files | **Supported natively on Workers** (§8). |
| Early Hints for static assets | Pages-only edge. Minor; not needed for Rackula. |
| Rollbacks | Workers has versioned deploys (`wrangler versions deploy` to re-promote) — arguably better. |

Net: for a CI-driven project that wants storage bindings next to its assets, Workers is
strictly the better fit. The only genuine Pages-only items (Early Hints, custom-domain
PR previews) are not on our critical path.

---

## 8. Self-host portability

**The static bundle stays fully portable.** `vite build` still emits a plain `dist/`
that nginx (or any static server) serves unchanged. None of the CF deploy artifacts touch
application code:

- `wrangler.toml` / `wrangler.jsonc` — **deploy-target config only.** It points at
  `dist/` and sets routing/domain. nginx ignores it entirely. It is not imported by the
  app and not in the served bundle.
- `_headers` / `_redirects` — optional plain-text files placed *in the assets directory*.
  Workers parses them to apply response headers/redirects; **they are not themselves
  served as assets** and nginx ignores them (nginx headers/redirects come from
  `nginx.conf` / `security-headers.conf`, which already exist in `deploy/`). They're
  supported natively on Workers Static Assets (same syntax as Pages), so they're a
  convenience, not a coupling.
  ([static-assets headers](https://developers.cloudflare.com/workers/static-assets/headers/),
  [redirects](https://developers.cloudflare.com/workers/static-assets/redirects/))
  If you also use the Vite plugin and don't want them uploaded, an `.assetsignore` file
  excludes `_headers`/`_redirects`/`_worker.js`.
- `VITE_BASE_PATH` already abstracts the base path per target; nothing new needed.

**The storage-feature pattern (honours the self-host rule):** put each feature behind a
narrow frontend interface with two implementations selected at runtime/build:

```
ShareStore  ── CloudflareShareStore   (POST/GET /s/* Worker + KV)
            └─ ApiShareStore          (rackula-api /share/* — self-host equivalent)
            └─ (degrade) EncodedUrlShareStore  (no API present)

ImageSource ── R2ImageSource          (img.racku.la R2 custom domain)
            └─ BundledImageSource      (existing src/lib/data/bundledImages / API static)
```

Selection reuses the existing runtime API-detection seam
(`persistence.svelte.ts` / `persistence-api.ts`): if the app is talking to `rackula-api`
it uses the API implementation; on Cloudflare it uses the CF implementation; with no
backend it degrades. This keeps the frontend's storage logic backend-agnostic and means
self-hosters get **parity** (a real backend) rather than a degraded fallback — exactly
the spike's must-preserve rule.

**Effort: Small** to keep portability (it's already there — mostly a matter of NOT
hard-coding CF URLs and keeping the deploy config out of app code). The interface/dual-impl
pattern is the per-feature cost accounted for in §4/§5.

---

## 9. Observability: wrangler tail / Workers Logs vs docker logs

Replacing the VPS means replacing `docker logs` / journald with Cloudflare's stack.
Relevant only for the storage Worker — static-asset serving has nothing to log.

- **`wrangler tail`** — real-time, streamed-to-terminal logs of live requests, output as
  structured JSON (pipe to `jq`). Direct analogue of `docker logs -f`. Free.
  ([tail-workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/),
  [real-time-logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/))
- **Workers Logs** — persistent, queryable logs stored in your CF account, browsable per
  Worker in the dashboard. **Included on Free and Paid.** Free plan = **200,000 log
  events/day, 3-day retention**; Paid = 20M/mo, 7-day retention, $0.60/M extra. This is
  the `docker logs` + log-aggregation replacement.
  ([workers-logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/))
- **Tail Workers / Logpush** — advanced fan-out to third parties (Sentry, Grafana, etc.);
  Paid/Enterprise only. Not needed for us.

Comparison vs the VPS today: `docker logs` is host-local and disappears with the
container; Workers Logs is centralized, queryable, and survives deploys, with `wrangler
tail` covering the live-stream case. Net upgrade, at $0. **Effort: Trivial** (enable in
the Worker config / dashboard).

---

## Key Findings

1. **The two-entry SPA "just works" with zero Worker code.**
   `not_found_handling: single-page-application` + default `html_handling:
   auto-trailing-slash` serves `index.html` for unknown routes, serves `/login` → real
   `login.html` (200), and never lets the SPA fallback clobber `login.html`. This was the
   biggest correctness risk and it's resolved by config alone.

2. **The baseline static frontend is genuinely $0, forever.** Static-asset requests are
   *free and unlimited* with no egress/bandwidth charges. Worker request limits only apply
   when storage-feature Worker code runs.

3. **Honest caveat (must state):** moving the frontend to Cloudflare retires only the
   **prod** VPS tenant. Full VPS retirement still needs the **dev API moved to the homelab
   (#1985)**. The frontend move alone does NOT kill the VPS — `rackula-api` dev still has
   to land somewhere. Umami removal (done) was a separate prerequisite.

4. **Self-host portability is preserved by construction.** `dist/` stays nginx-servable;
   `wrangler.toml` / `_headers` / `_redirects` are deploy-target config, not app coupling.
   Each storage feature goes behind a frontend interface with a CF implementation AND a
   `rackula-api` implementation, so self-hosters get parity, not degradation — using the
   app's existing runtime API-detection seam.

5. **KV writes/day (1,000 free) is the only real free-tier cliff,** and it's on the
   unauthenticated share-create path. Mitigate with body-size caps, Zod schema validation,
   content-hash dedupe (skip redundant writes), WAF per-IP rate-limiting, non-HTML
   content-type on reads, and no enumeration. R2 (10 GB, zero egress, 10M reads/mo) and
   Worker requests (100k/day) are not at risk at Rackula's scale.

6. **Workers Static Assets is the right call over Pages.** Native preview URLs + branch
   aliases now match Pages' PR-preview DX (caveat: workers.dev only, not custom domains in
   beta); `_headers`/`_redirects` supported natively; and storage bindings (KV/R2) live
   next to the assets — which Pages can't do as cleanly. Only genuine Pages-only losses
   (Early Hints, custom-domain PR previews) are off our critical path.

7. **Effort summary (Claude-assisted):** baseline static deploy = **Small**; Web
   Analytics = **Trivial**; R2 images = **Small**; KV share links = **Small-to-Medium**
   (the Medium is security hardening + the parallel `rackula-api` implementation demanded
   by the self-host rule, not the KV mechanics); observability = **Trivial**. The
   self-host-equivalent requirement is the recurring cost multiplier on every storage
   feature — it re-couples feature work to the API even though API hosting is out of scope.

8. **Codebase cleanup unlocked:** the GitHub-Pages `sessionStorage.redirect` shim in
   `index.html` becomes redundant under Workers SPA routing and can be deleted when the GH
   Pages target is retired.

---

## Sources

- Workers Static Assets overview: <https://developers.cloudflare.com/workers/static-assets/>
- Static-assets routing index: <https://developers.cloudflare.com/workers/static-assets/routing/>
- SPA routing (`not_found_handling`): <https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/>
- HTML handling (trailing-slash modes / `/login` mapping): <https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/>
- `_headers` support: <https://developers.cloudflare.com/workers/static-assets/headers/>
- `_redirects` support: <https://developers.cloudflare.com/workers/static-assets/redirects/>
- Wrangler configuration (`assets`, `run_worker_first`, `html_handling`, Workers Sites deprecation): <https://developers.cloudflare.com/workers/wrangler/configuration/>
- Advanced routing / `run_worker_first` array (changelog): <https://developers.cloudflare.com/changelog/post/2025-06-17-advanced-routing/>
- Vite plugin config optional for assets-only (changelog): <https://developers.cloudflare.com/changelog/post/2025-12-08-vite-optional-config/>
- Workers preview URLs + branch aliases (changelog): <https://developers.cloudflare.com/changelog/post/2025-07-23-workers-preview-urls/>
- Increased static asset limits / 25 MiB file cap (changelog): <https://developers.cloudflare.com/changelog/post/2025-09-02-increased-static-asset-limits/>
- Workers pricing (static assets free/unlimited, 100k req/day, no egress): <https://developers.cloudflare.com/workers/platform/pricing/>
- Custom domains vs routes: <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>
- R2 public buckets + custom domain + caching: <https://developers.cloudflare.com/r2/buckets/public-buckets/>
- R2 pricing (10 GB, Class A/B, zero egress): <https://developers.cloudflare.com/r2/pricing/>
- R2 in-Worker API reference: <https://developers.cloudflare.com/r2/api/workers/workers-api-reference/>
- KV pricing (1,000 writes/day free, etc.): <https://developers.cloudflare.com/kv/platform/pricing/>
- KV limits (25 MiB value, 512 B key, 60 s min TTL): <https://developers.cloudflare.com/kv/platform/limits/>
- KV reduced cacheTtl to 30 s (changelog): <https://developers.cloudflare.com/changelog/post/2026-01-30-kv-reduced-minimum-cachettl/>
- Web Analytics overview: <https://developers.cloudflare.com/web-analytics/>
- Web Analytics get-started (beacon snippet / manual setup): <https://developers.cloudflare.com/web-analytics/get-started/>
- Web Analytics FAQ (cookieless / privacy): <https://developers.cloudflare.com/web-analytics/faq/>
- RUM beacon details: <https://developers.cloudflare.com/speed/observatory/rum-beacon/>
- Migrate from Pages to Workers: <https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/>
- Workers Logs: <https://developers.cloudflare.com/workers/observability/logs/workers-logs/>
- Tail Workers: <https://developers.cloudflare.com/workers/observability/logs/tail-workers/>
- Real-time logs (`wrangler tail`): <https://developers.cloudflare.com/workers/observability/logs/real-time-logs/>
