# Spike #1025: Host the Rackula Frontend on Cloudflare (VPS Retirement)

Date: 2026-06-09
Parent epic: #1983 (eliminate the VPS). Implementation issue: #1984.
Supersedes the original framing of #1025 ("port rackula-api to Workers").

Detailed research:

- `1025-codebase.md` (frontend inventory)
- `1025-external.md` (Cloudflare platform research)
- `1025-patterns.md` (approaches, effort, designs)
- `1025-devils-advocate.md` (adversarial + secure-coding review)

---

## Reframe

The issue as filed asked whether to port `rackula-api` to Cloudflare Workers. Two things changed
that question:

1. Strategic: epic #1022 (the original parent) is closed, superseded by #1983. Prod
   (`count.racku.la`) already serves a static frontend with no API by design. The real goal is
   retiring the VPS, cheaply, while preserving the Docker/LXC self-host story.
2. Direction (user, this spike): the evaluation is scoped to the frontend. `rackula-api` hosting is
   out of scope and stays as-is. Server-side persistence remains a committed feature.

Restated question: what is the lowest-cost, lowest-maintenance way to host the Rackula frontend on
Cloudflare (Workers Static Assets, per #1984), retiring the prod VPS tenant, without breaking
self-host, and which low-cost Cloudflare primitives (R2, KV, Web Analytics) are worth it later?

---

## The Governing Constraint: One Backend, Not Many

The user is a solo maintainer and cannot sustain many parallel implementations. This is the lens
that decides the storage question. The naive plan (build bespoke Cloudflare KV/R2 Workers AND keep
`rackula-api`) is two backends doing the same job: exactly the distribution sprawl to avoid.

The adversarial review independently reinforces this: the KV share feature is not a thin Worker. To
satisfy the self-host-equivalent rule it needs a NEW `rackula-api` route, it is not honestly $0
(unauthenticated write-flood cliff), and it carries a real stored-XSS surface. Building it as a
standalone Cloudflare Worker now buys a second backend and a security liability for a feature that
should live behind one API contract.

Conclusion: do not build bespoke Cloudflare storage Workers in this work. Route storage through the
single API contract, later. See "Future Direction" below.

---

## Recommendation

Split the work the original plan fused together.

Do now (this spike's actionable output, all API-independent):

1. Host the prod frontend on Cloudflare Workers Static Assets (assets-only, no Worker script). The
   frontend is a pure Vite + Svelte 5 SPA; `vite build` emits a self-contained static `dist/`. Prod
   already runs as a no-API static bundle, so this is a lift-and-shift, not a rewrite. Two-entry SPA
   routing (`index.html` + `login.html`) is resolved by config alone
   (`not_found_handling: "single-page-application"`). This retires the prod VPS tenant.
2. Re-home the security response headers (mandatory, see Critical Findings). This is the real work,
   not the asset move.
3. Cloudflare Web Analytics, build-flag-gated so self-host stays beacon-free. Zero backend, separable.

Defer to a future API epic (do NOT build as standalone CF Workers now):

- R2 image/asset hosting.
- KV share-link shortening.

Both belong behind the single API contract, not bespoke per-feature Workers.

Effort (Claude-assisted): baseline hosting is Small (an afternoon for the asset move and CI swap),
plus the security-header port which must not be hand-waved. Web Analytics is Trivial.

---

## Critical Findings (from the adversarial review, all elevated to must-fix)

These three were missing or soft-pedalled in the first-pass synthesis. They are now hard
requirements on #1984, not follow-ups.

1. Security-header / CSP regression (HIGH). Today nginx emits the entire security-header set (CSP,
   HSTS, X-Frame-Options, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy) via
   `deploy/security-headers.conf`. Workers Static Assets has no nginx. If not re-homed to a
   Cloudflare `_headers` file, prod silently loses its CSP and clickjacking/MIME/HSTS protections.
   The CSP also carries an inline-script SHA-256 hash for the legacy GitHub-Pages redirect shim that
   the cleanup deletes: delete-without-CSP-update breaks script execution or weakens the policy.
   Action: port `security-headers.conf` to a `_headers` file as an acceptance criterion of #1984;
   after deleting the shim, tighten `script-src` toward `'self'` (a security win the migration
   enables); add a post-deploy assertion that CSP and X-Frame-Options are present on
   `count.racku.la`. `_headers` is nginx-ignored, so self-host portability is preserved.

2. KV share links are not a $0 feature (HIGH). The free KV cap is 1,000 writes/day, sitting on an
   unauthenticated public write endpoint. A script posting 1,001 distinct valid payloads exhausts
   the day's budget and takes share-creation offline for everyone; content-hash dedupe does not stop
   distinct payloads, and random-key reads burn the 100k/day read budget too. This is a reason to
   defer KV behind the API (one place to harden), not to ship a bespoke public Worker. If ever
   built: Turnstile from day one, body-size cap, GET-side rate limit, documented availability
   ceiling, and treat Workers Paid ($5/mo) as the real cost.

3. Stored XSS via the markdown notes sink (HIGH). There are two share wire formats: the MINIMAL
   share format (no notes) and the FULL save/API format, which carries `notes` markdown that renders
   through a `{@html}` sink (`MarkdownPreview` -> marked -> DOMPurify). Zod
   (`z.string().max(1000)`) is shape-validation, not sanitisation, and accepts
   `<img src=x onerror=...>`. A short `count.racku.la/s/<id>` link backed by the full format could
   deliver stored XSS, especially if the CSP is dropped in the same migration. When share storage is
   built (behind the API), pin it to the MINIMAL format so the HTML sink is unreachable via shares;
   if notes must be shareable, mandate DOMPurify on render plus a live CSP, and apply identical rules
   to the API route. This is a design constraint to carry into the future API epic.

Also required on the baseline:

- Drop `login.html` from the prod build. On static prod (`AUTH_MODE=none`) it POSTs to a
  non-existent `/api/auth/login`. Under SPA fallback, `/login` returns 200 and renders a
  functional-looking, non-functional, unauthenticated login form on a public domain: a phishing
  template and trust ding, not "harmless." Do not ship it.
- Strengthen the deploy smoke test. `not_found_handling: single-page-application` turns every
  unmatched path into `200 index.html`, which can mask a broken deploy. Keep the `version.json`
  check and add: a known-absent path returns the SPA shell, and at least one real hashed asset
  resolves.

---

## VPS Retirement: Honest Accounting

The frontend move retires only the prod tenant. `count.racku.la` already runs no API, so the prod
move is backend-free. Full VPS retirement still requires:

- #1985: move the dev `rackula-api` (and dev `/data` persistence) to the homelab. The dev FRONTEND
  can get a Cloudflare preview presence, but the dev API lands on the homelab. Note the cross-origin
  dev topology this creates (CF-hosted dev frontend calling a homelab API needs CORS or a
  Worker reverse-proxy: pick and cost one explicitly; it is not free).
- #1986: decommission the box and tear down the `vps-rackula` self-hosted runner (still used by
  `deploy-dev.yml` until #1985 lands). Do NOT delete the Docker/LXC staging lanes: self-hosters
  consume those images/tarballs.

Prerequisite already done: Umami removal (#1970), so Web Analytics is a clean greenfield choice.

So the frontend move is necessary but not sufficient. It is the right first step.

---

## Self-Host Preservation

The baseline move preserves self-host trivially: `vite build -> dist/` stays nginx-servable, and the
Cloudflare-specific config (`wrangler.jsonc`, `_headers`) is deploy-target config that nginx ignores,
not app coupling. No Cloudflare URL is hard-coded in app code. Web Analytics is gated behind a
build flag (`VITE_CF_ANALYTICS_TOKEN`) so self-host builds make zero third-party calls.

The deferred storage features keep self-host parity by design once they live behind the API contract:
self-hosters run the API; our Cloudflare deploy runs an implementation of the same contract. This is
the self-host-equivalent rule satisfied by one contract instead of two backends.

---

## Future Direction: rackula-api as a true single-contract API

The cleanest resolution of the storage question is to make `rackula-api` a true, contract-defined
API and deploy that one thing wherever it must run, rather than maintaining bespoke per-target
backends. The dual-backend storage abstraction the first-pass synthesis sketched (a Cloudflare impl
plus an API impl per feature) collapses into "one contract, two deployments."

Runtime caveat: "one contract everywhere" does not automatically mean serverless Workers.
`rackula-api` has hard Workers blockers today (native `@node-rs/argon2`, filesystem storage, Bun
runtime). The realistic shape is one container (Bun/Docker) on the homelab and a cheap host, with the
frontend static on Cloudflare. A Workers-native API rewrite is an alternative but risks re-forking
the self-host build, which is the sprawl to avoid. That fork is the future API epic's decision.

Recommendation: land the frontend hosting first (one thing at a time), then raise the true-API epic.
R2 (images) and KV (share links) become storage choices inside that epic, carrying the security
constraints above.

---

## Issue Decomposition

This spike enriches existing issues rather than creating a pile of new ones (the one-backend steer
collapsed the follow-up sprawl).

- #1984 (prod -> Cloudflare Worker): the baseline implementation issue. Enrich with hardened
  acceptance criteria: Workers Static Assets config (`wrangler.jsonc`, SPA two-entry routing),
  CI promote-step swap (`deploy-prod.yml` body -> `wrangler deploy`, keep the `prod` environment
  approval + smoke test), mandatory security-header port + post-deploy CSP assertion, drop
  `login.html` from prod, smoke-test hardening, and the coupled cleanup (delete the GitHub-Pages
  `sessionStorage` shim + `static/404.html`, re-derive CSP hashes, remove the dead
  `VITE_PERSIST_ENABLED` build arg). De-scope all storage features.
- Cloudflare Web Analytics: build-flag-gated beacon. #1984 already names analytics; fold the beacon
  acceptance criterion there, or track as one small separate issue.
- #1985 (dev -> homelab): note the cross-origin dev-frontend-on-CF topology choice.
- R2 images / KV share links: do NOT create issues now. Carried as future work in the API epic.
- Future epic: "rackula-api as a true single-contract API." Raise after frontend hosting lands.

Stale-doc fixes (dev is not on GitHub Pages: it is self-hosted Docker, moving to the homelab):
`CLAUDE.md` deployment table + dev-deploy snippet, `docs/ARCHITECTURE.md` hosting box,
`vite.config.ts` `VITE_BASE_PATH` comment. The decommission issue #1986 already owns the final
deployment-table rewrite.

---

## Effort Summary

| Workstream | Effort (Claude-assisted) | API coupling | Status |
| --- | --- | --- | --- |
| Baseline: prod frontend -> Workers Static Assets | Small | None | Do now (#1984) |
| Security-header port + CSP re-derivation + assertion | Small, mandatory | None | Do now (#1984) |
| Drop login.html + smoke-test hardening | Trivial | None | Do now (#1984) |
| CI promote-step swap (VPS Docker -> wrangler deploy) | Small | None | Do now (#1984) |
| Codebase/doc cleanup (GH-Pages shims, stale docs) | Trivial | None | Do now (#1984) |
| Cloudflare Web Analytics (build-flagged beacon) | Trivial | None | Do now / next |
| CF dev/preview frontend + cross-origin topology | Small | None (frontend) | With #1985 |
| R2 images | Small | Via API | Defer to API epic |
| KV share links (+ security hardening) | Medium | New API route | Defer to API epic |
| Full VPS retirement (#1985 + #1986) | n/a | Backend hosting | Sequenced after |

---

## Decision

Approved direction: Workers Static Assets for the prod frontend (#1984), with the security-header
port as a hard acceptance criterion, login.html dropped, smoke test hardened, and storage features
deferred behind a future single-contract API. This retires the prod VPS tenant; #1985 and #1986
finish the job.
