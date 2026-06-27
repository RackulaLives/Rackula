# Spike #2620 — Codebase context: what the CF Static Assets config must reproduce

**Date:** 2026-06-26. Migrate-from contract for the `count.racku.la` prod cutover (#2029).

This documents the exact behaviour the current VPS/nginx prod deploy provides, so the Cloudflare Workers Static Assets config reproduces it byte-for-byte. Source of truth files cited inline.

## Files examined

- `deploy/security-headers.conf` — Docker/prod security headers + CSP (single source of truth).
- `deploy/lxc/security-headers.conf` — LXC variant (same CSP, no HSTS since LXC serves HTTP).
- `deploy/nginx.conf.template` — prod nginx routing, caching, SPA fallback, API proxy (API proxy is **not** used by public prod).
- `e2e/playwright.smoke.config.ts` — post-deploy smoke harness (`SMOKE_TEST_URL`, optional CF Access service-token headers).
- `vite.config.ts` — static SPA build to `dist/`, emits `version.json` and `config.js`; inputs `index.html` + `login.html`.

## The header contract (must be reproduced on CF)

Current prod CSP (no script hashes — #2028 removed the only inline script, so `script-src 'self'` suffices; **there are no pinned hashes to carry across**, contrary to the spike issue's assumption):

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';
```

Plus, on every response (`deploy/security-headers.conf:11-22`):

```text
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000; includeSubDomains   # prod only (TLS terminated)
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

The CF config must emit all of these by value. The C4 parity guard (#2032) asserts CSP/X-Frame-Options by value across prod CF headers, dev CF headers, and the two `security-headers.conf` files — so whatever mechanism CF uses (`_headers` file or a headers Worker, TBD by the external research) must produce an identical CSP string.

## The cache contract (critical for deploy verification)

From `deploy/nginx.conf.template`:

- `/assets/*` (Vite-fingerprinted): `Cache-Control: public, immutable`, `expires 1y` (lines 85-92).
- `index.html` / SPA shell (`location /`): `Cache-Control: no-cache` (lines 313-327). The shell must revalidate every load because it references the fingerprinted bundles by name; a cached shell pins the browser to the previous deploy's JS.

This shell-no-cache / assets-immutable split is the single most important behaviour to preserve on CF, otherwise `wrangler versions deploy` would not be picked up by returning clients. The external research must confirm CF can express it.

## SPA fallback

nginx: `try_files $uri $uri/ /index.html` (line 316). CF equivalent: `assets.not_found_handling: "single-page-application"` (to be confirmed by external research). `/login.html` is a second build input but is **not** served on public prod (it is gated to local-auth mode only, `nginx.conf.template:305-310`); the robots.txt decision (#2029) is to `Disallow: /login` on prod only.

## Prod is frontend-only (the #2029 "phantom AC" check)

`deploy/nginx.conf.template` contains extensive `/api/` proxy + `auth_request` logic, but the **public prod** deploy runs with no API sidecar and `RACKULA_AUTH_MODE=none` — count.racku.la serves the static SPA only and has no server persistence. This confirms #2029's "user-data disposition at cutover" AC is trivially satisfied for prod: there is no server-saved data on count.racku.la. The only server data in the system is dev's `/opt/rackula/rackula-dev/data` (archived by #2134/#1986).

Cross-ref to confirm at cutover: whether count.racku.la currently sits behind Cloudflare Access (Phase-1a scaffolding per `docs/superpowers/specs/2026-06-17-hosted-cloud-sync-auth-design.md`). If so, the prod smoke also needs CF Access service-token headers (the smoke config already supports them).

## Smoke harness (reuse, do not rebuild)

`e2e/playwright.smoke.config.ts`: when `SMOKE_TEST_URL` is set it runs the read-only `deploy-smoke.spec.ts` set (boot, render, `version.json` shape) against the live URL, and applies `CF-Access-Client-Id`/`CF-Access-Client-Secret` headers when present. This is the harness to point at the `wrangler versions` preview URL during the cutover smoke, and to schedule on a cron against count.racku.la during the #1986 soak window.

## Implication for the deploy job

The prod CF deploy replaces `.github/workflows/deploy-prod.yml` (currently: tag `v*` -> sync `docker-compose.yml` to VPS -> `docker compose up`). The new job: build the SPA (`npm ci && npm run build` -> `dist/`), then `wrangler versions upload` -> smoke the version preview URL -> `wrangler versions deploy`. `version.json` (emitted by `vite.config.ts`) is the smoke's deploy-identity check.
