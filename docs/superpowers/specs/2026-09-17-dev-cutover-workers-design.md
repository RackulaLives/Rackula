# Dev cutover to Cloudflare Workers (#2134): design decisions

Status: approved 2026-09-17. Requirements live in the #2134 issue body (updated 2026-09-17); this file records only the decisions taken on top of it and the deploy sequence.

## Context

- count.racku.la has run on an assets-only Worker (`rackula-prod`) since 2026-08-22 (#2029).
- d.racku.la is still the Vultr VPS and is effectively down: the origin stopped answering in August, the last green Deploy Dev run was 2026-08-25, and the `vps-rackula` runner is no longer registered.
- The dev Worker code exists (`api/src/worker.ts`, R2 driver, Access JWT validation), with placeholder bindings in `api/wrangler.jsonc`.

## Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Deploy flow | Mirror `deploy-prod.yml`: `versions upload`, curl smoke on the preview URL, `versions deploy`, `triggers deploy`, browser smoke on the live host | A bad build never takes dev traffic; the pattern is proven |
| Worker name | `rackula-dev` | Mirrors `rackula-prod`; the Worker serves the whole dev surface, not only the API |
| Hostname binding | Workers route `d.racku.la/*` | Same method as prod: no DNS change, no cert wait, rollback is removing the route |
| Preview URLs | On (`preview_urls: true`, `workers_dev: false`) | Bot Fight Mode challenges CI on every racku.la host, so curl checks need the workers.dev preview URL. The Worker locks the API to d.racku.la, so a preview URL answers 404 on `/api/*` |
| Access JWT values | Plain `vars` in `api/wrangler.jsonc` | None are secret: the team domain and AUD tag appear in the public Access redirect. Reviewable in git, no out-of-band step |
| Local dev | `api/.dev.vars` blanks the three `CF_ACCESS_*` keys | `.dev.vars` merges over `vars`; blank values keep the explicit local opt-out working |
| API env | `NODE_ENV=production`, `CORS_ORIGIN=https://d.racku.la` | Same values the VPS dev stack ran with |
| Frontend config | `dist/config.js` written as `{ storage: "server", env: "dev" }` | Matches the Docker dev entrypoint |
| Deploy token | Reuse `CLOUDFLARE_API_TOKEN` | Workers Scripts:Edit is account-wide, so a separate dev token has the same blast radius. Mint one only if the first deploy proves R2 scope is required |
| R2 bucket | `rackula-layouts-dev`, fresh start | Dev data was archived from the VPS on 2026-08-23 (#1986) |
| Bootstrap | One plain `wrangler deploy` from a clean build of the branch, run by the maintainer's wrangler login | `versions upload` fails on a Worker that does not exist yet |

## Smoke coverage

- `scripts/smoke-headers.sh --surface dev` against the preview URL: headers by value from the dev generator surface (including `X-Robots-Tag: noindex`), content types, SPA fallback, `config.js` in server mode, `login.html` stripped, leak paths.
- `/api/layouts` on the preview URL returns 404: the Worker's host lock (`RACKULA_API_HOST=d.racku.la`) keeps preview URLs, which sit outside Access and outlive their version, away from the API and R2. Added after review; JWT verification itself stays covered by unit tests.
- `e2e/deploy-smoke.spec.ts` against d.racku.la with the Access service token, plus an opt-in check that `/api/layouts` answers 200 through Access.
- `soak-smoke.yml` regains its dev leg; `CF_ACCESS_*` reach that leg only. This starts #1986's 28-run soak window.

## Out of scope

- M017 multi-tenant auth (#2922, #2370): dev keeps `AUTH_MODE=none` behind Access.
- VPS teardown (#1986).
