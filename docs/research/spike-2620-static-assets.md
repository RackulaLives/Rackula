# Spike #2620: Workers Static Assets for prod SPA cutover

**Date:** 2026-06-26 **Parent epic:** #1984 (Cloudflare frontend hosting). **Prep for:** #2029 (C1b prod cutover). **Milestone:** M018. **Component research:** [`2620-external.md`](2620-external.md) (Cloudflare docs, cited) · [`2620-codebase.md`](2620-codebase.md) (migrate-from contract).

---

## Executive summary

Green light. Hosting `count.racku.la` on Cloudflare Workers Static Assets is a clean fit for our static Vite SPA, and every #2029 acceptance criterion is answerable from official docs:

- **No Worker script needed.** Assets-only deploy is first-class (`main` is optional). Security headers come from a native `_headers` file in `dist/`; SPA routing comes from `assets.not_found_handling`.
- **The header + cache contract is reproducible** exactly (CSP, X-Frame-Options, etc., plus the `/assets/*` immutable + shell no-cache split that makes new deploys land for returning clients).
- **Versioned deploy + instant rollback** (`wrangler versions upload` -> smoke the per-version preview URL -> `wrangler versions deploy` -> `wrangler rollback`) covers the release runbook in #2029's AC.
- **Free tier fits** with large headroom (static-asset requests are unmetered).
- **One unavoidable security fact** confirmed: the CF API token's Workers Scripts permission is account-wide and cannot be scoped to a single Worker. This is exactly why we chose **one account + hardened gate** (GitHub Environment protection + minimal-perm token) rather than per-Worker isolation.

Three things to verify hands-on during #2029 (none are blockers; all are quick): the preview-URL smoke for an assets-only project, custom-domain propagation/orange-cloud behaviour, and `_headers` duplicate-`Cache-Control` precedence between `/*` and `/assets/*`.

---

## Recommended deploy configuration

### `wrangler.jsonc` (assets-only, prod)

```jsonc
{
  "name": "rackula-prod",
  "compatibility_date": "2026-06-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application", // unknown paths -> index.html (200) for client routing
  },
  "routes": [
    { "pattern": "count.racku.la", "custom_domain": true }, // auto-creates the proxied DNS record + cert on the racku.la account
  ],
  "workers_dev": false,
  "preview_urls": true, // required so `wrangler versions upload` yields a smoke-able per-version preview URL
}
```

No `main` / Worker entry. (`preview_urls: true` is needed for the versioned-deploy smoke; confirm it does not expose a publicly-guessable prod-data URL — moot here since assets-only prod has no data.)

### `public/_headers` (shipped into `dist/` by Vite)

Reproduces `deploy/security-headers.conf` by value (asserted by the #2032 parity guard) and the cache split from `deploy/nginx.conf.template`:

```text
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

Notes:

- Default `/*` is `no-cache` so every SPA route (all served as the shell) revalidates; `/assets/*` (Vite-fingerprinted) overrides to immutable. **Verify** during #2029 that the more-specific `/assets/*` rule overrides rather than appends the `Cache-Control` from `/*`; if CF combines duplicate headers, drop `Cache-Control` from `/*` and instead set it only on the shell entry. CF's default is already `public, max-age=0, must-revalidate` + ETag (smoke-safe), so even an imperfect split fails safe.
- `Strict-Transport-Security` can alternatively be enabled at the CF edge (SSL/TLS -> Edge Certificates -> HSTS). Keeping it in `_headers` keeps the parity guard's by-value comparison simple. There is no script hash to carry: #2028 left `script-src 'self'` hash-free.
- **#2030 (analytics) will need a CSP edit** here: the CF Web Analytics beacon loads from `static.cloudflareinsights.com` and posts to `cloudflareinsights.com`, both blocked by the current `script-src 'self'`/`connect-src 'self'`. That CSP relaxation is owned by #2030, not the cutover.

### `public/robots.txt` (prod-only `Disallow: /login`)

Per the #2029 robots decision. Inject/select the prod variant at the wrangler build step (self-host keeps allow-all):

```text
User-agent: *
Disallow: /login
```

### Deploy-job shape (replaces `deploy-prod.yml`)

`ubuntu-latest`, no self-hosted runner: `npm ci && npm run build` (-> `dist/` with `_headers`, `robots.txt`, `version.json`) then:

1. `wrangler versions upload` -> capture the version preview URL.
2. `SMOKE_TEST_URL=<preview-url> npm run test:e2e:smoke` (full fail-closed `deploy-smoke.spec.ts`).
3. On green: `wrangler versions deploy` (promote behind the GitHub Environment protection rule).
4. Light re-check of `https://count.racku.la` (`version.json` matches the built commit).
5. Rollback path: `wrangler rollback` or `wrangler versions deploy <previous-id>` (instant; up to 100 prior versions retained).

---

## Verdict on each #2029-prep acceptance criterion

| # | Question | Verdict |
| --- | --- | --- |
| 1 | Assets-only `wrangler.jsonc` | Confirmed. `main` optional; minimal config above. |
| 2 | SPA fallback | `assets.not_found_handling: "single-page-application"` returns `index.html` with 200 for unknown paths. |
| 3 | `_headers` for CSP/security | Natively supported on Static Assets; applies to served HTML. 100 rules / 2000 chars per line (our CSP fits). No Worker needed. |
| 4 | Custom-domain attach | `routes` + `custom_domain: true`; CF auto-creates proxied DNS + Advanced Cert on the same account as the `racku.la` zone. Remove any stale `count.racku.la` record first. |
| 5 | Versions + rollback | `wrangler versions upload` -> stable per-version preview URL -> `wrangler versions deploy`; `wrangler rollback` is instant. Versions track static assets. Verify the preview-URL smoke hands-on (no official assets-only worked example). |
| 6 | Minimal token perms | "Edit Cloudflare Workers" template scoped to the one account + `racku.la` zone. Workers Scripts is account-wide (cannot narrow). Add Zone:Read / DNS:Edit if custom-domain creation errors in CI. |
| 7 | Free-tier headroom | Static-asset requests are free/unmetered (do not count against 100k/day Workers limit). 20,000 files/version, 25 MiB/file. A low-traffic SPA fits comfortably. |
| 8 | Caching / smoke-safety | Default `public, max-age=0, must-revalidate` + ETag. Split via `_headers` for `/assets/*` immutable + shell revalidate so new shells are picked up immediately. |

---

## Items to verify hands-on during #2029 (quick, not blockers)

1. **Preview-URL smoke for assets-only.** Run `wrangler versions upload` once and confirm the preview URL serves the SPA and is reachable by Playwright (needs `preview_urls: true`). This is the only versions-model uncertainty.
2. **Custom-domain propagation + orange-cloud.** Not documented precisely; observe activation time and proxied state when binding `count.racku.la`.
3. **`_headers` duplicate `Cache-Control` precedence** between `/*` and `/assets/*` (see note above).
4. **Aggregate deployment-size cap / max file-path length** were not found in official docs; our `dist/` is small, so this is informational only.
5. **CF Access on prod?** Confirm whether `count.racku.la` sits behind Cloudflare Access at cutover (Phase-1a scaffolding). If so, the prod smoke also needs the CF Access service-token headers the smoke config already supports.

---

## Decisions reinforced by this research

- **One account + hardened gate** (vs separate accounts): the account-wide Workers Scripts permission is now confirmed from the token docs, so per-Worker token isolation was never available; the GitHub Environment protection rule on the deploy step is the real control.
- **No Worker for prod:** keeps the cutover to static assets + `_headers` + `wrangler`, with no `nodejs_compat`/argon2/pino concerns (those belong to the dev Worker, #2133).

## Decomposition

No new implementation issues. This spike feeds the existing #2029 (cutover), #2032 (parity guard reads the same `_headers` CSP), and #2030 (owns the analytics CSP relaxation). #2029 is now research-ready; remaining unknowns are hands-on verifications listed above, not open design questions.
