# Design: Cloudflare Frontend Hosting (VPS Retirement)

Date: 2026-06-10
Status: Approved design, pending spec review then implementation planning
Origin: Spike #1025 (see `docs/research/spike-1025-cf-frontend-hosting.md` and the four
`docs/research/1025-*.md` files, including the codebase, external, patterns, and two
devil's-advocate passes).

Promotes issue #1984 into this epic. Sibling of epic #1983 (eliminate the VPS). Milestone:
new `M00 -- VPS Retirement & Cloudflare Hosting`.

---

## 1. Goal

Host the Rackula production frontend on Cloudflare Workers Static Assets, retiring the
production Linode VPS tenant at near-zero cost and lower maintenance, without losing the
security response-header posture nginx provides today, and without breaking the Docker/LXC
self-host story.

Prod (`count.racku.la`) already serves a no-API static bundle (`AUTH_MODE=none`, no
persistence backend), so the move is a static-origin cutover, not a rewrite. The hard parts
are the release-pipeline cutover, re-homing the security headers, and preserving self-host
parity, not the asset serving itself.

## 2. Scope decisions (settled)

- Platform: Cloudflare Workers Static Assets, assets-only for the baseline (no Worker script
  on the prod hot path). Committed per #1983/#1984.
- Environments: prod frontend to Cloudflare is the deliverable; a Cloudflare dev/preview
  frontend env accompanies it (C3). The dev API stays on the homelab (#1985, separate).
- Backend: `rackula-api` hosting is out of scope and unchanged.
- Storage features (R2 images, KV share links) and the `rackula-api`-as-a-true-API rework
  are a separate FUTURE epic, explicitly excluded here. See Section 11.
- Self-host: the existing Docker/LXC path stays the self-host story, unchanged. Cloudflare is
  purely how WE host prod/dev.
- Effort lens: Claude-assisted (human effort below raw LOC), but codegen does not lower the
  cost of token scoping, security verification, or self-host parity, so estimates reflect
  that.

Milestone ordering decision: a bare `M00` milestone sorts LAST, not first (all milestones
have no due date, so GitHub sorts by number and a new milestone gets the newest number).
Top-of-roadmap placement is achieved with a Projects v2 "Priority" single-select field
pinned to the top and a roadmap/board view sorted by that field, NOT by milestone date or
title prefix. This keeps milestones free of artificial due dates (consistent with the CalVer
"decoupled from dates" convention). The `M00` title prefix is cosmetic.

Re-prioritization decision: VPS retirement outranks the in-progress LXC release (M02).
#1983, #1984, #1985, #1986 all move into `M00`. The M02/M03 burndown dip from moving
in-progress #1985 is accepted and deliberate.

Prod artifact decision: the wrangler job runs its own `npm ci && npm run build` (a separate
build from the gated Docker image). To compensate for losing the "promote exactly what was
gated" invariant, the post-deploy assertion verifies `count.racku.la/version.json` matches
the released version AND commit, not just version.

## 3. Epic structure

```
M00 -- VPS Retirement & Cloudflare Hosting (milestone)  [top via Projects Priority field]
|
+- #1984  EPIC: Cloudflare frontend hosting (prod -> Workers Static Assets)   [promoted in place]
|    +- C1  Atomic prod cutover to Workers Static Assets            (Medium)
|    +- C2  Cloudflare Web Analytics                                (Trivial-Small)
|    +- C3  Cloudflare dev/preview frontend environment            (Small)
|    +- C4  Self-host header/parity guard                          (Small)
|
+- #1983  EPIC: Eliminate the production VPS   [keeps the decommission arc]
     +- #1985  dev rackula-api -> homelab
     +- #1986  decommission the (Linode) VPS + vps-rackula runner   [blocked by #1984 + #1985]
```

#1984 is promoted in place (retitle + rewrite body as an epic) so its number, links, and
history survive. It is a sibling of #1983 that feeds it: #1983's decommission (#1986) is
blocked by #1984 plus #1985.

Epic #1984 done-when (self-contained, does NOT include VPS power-off):

- `count.racku.la` served from Workers Static Assets.
- Release pipeline promotes prod via `wrangler versions` (not the VPS runner).
- Prod is no longer in the `vps-rackula` serving path.
- Security headers verified live on prod by value, on multiple paths.
- Self-host builds unchanged (login.html present, beacon-free, the three CSPs aligned).
- Analytics live on prod; Cloudflare dev/preview env exists.

VPS power-off remains #1983/#1986's done-when.

## 4. Child C1: Atomic prod cutover to Workers Static Assets (Medium)

C1 and the originally-separate "security headers" issue are merged: a public prod origin
cannot exist for even one response without its headers, and deleting the GitHub-Pages shim
is the same edit as re-deriving the CSP hash. This is one atomic cutover PR.

Acceptance criteria:

- `wrangler.jsonc` at repo root (deploy-target config, not imported by the app, ignored by
  nginx): assets directory `./dist/`, `not_found_handling: "single-page-application"`,
  `routes: [{ pattern: "count.racku.la", custom_domain: true }]`, pinned `compatibility_date`
  (bump deliberately).
- Security headers via a Cloudflare `_headers` file covering CSP, HSTS, X-Frame-Options,
  X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy. Match nginx's `always`
  coverage with a `/*` rule (one policy for all paths). Verify on `/`, a real hashed asset
  under `/assets/`, and a known-absent path.
- HSTS: prefer the Cloudflare zone-level HSTS setting over emitting `Strict-Transport-Security`
  from `_headers` (avoid a duplicate header). Do NOT enable preload yet. Decide
  `includeSubDomains` carefully: `racku.la` siblings (`d.racku.la`, any future homelab host)
  share the apex, so an over-broad HSTS has cross-subdomain blast radius. Coordinate with C3.
- CSP change-set (treat the three CSPs as one): delete the `index.html` GitHub-Pages
  `sessionStorage` redirect shim and `static/404.html`; re-derive the remaining inline-script
  hashes; mirror the change into `deploy/security-headers.conf` (Docker) and
  `deploy/lxc/security-headers.conf` (LXC), which both pin the same shim hash; reconcile the
  pre-existing `form-action` drift (Docker is missing it).
- Unknown-hash investigation (blocking, before tightening `script-src`): the second pinned
  hash `sha256-yei5Fza...` is annotated "Dynamic inline script in bundled JS (exact origin
  unknown)". Build `dist/`, grep the output HTML for inline `<script>` with no `src`, and
  identify the source. Only tighten `script-src` toward `'self'` once no build-emitted inline
  script remains, or pin an auto-derived hash (compute from `dist/` at build time, not
  hand-maintained). Do not drop a hash whose script you cannot prove is gone.
- Cache-Control in `_headers`: `/assets/*` immutable (`max-age=31536000, immutable`);
  `index.html`, `login.html` if present, and `version.json` set to `no-cache`/`no-store` so a
  stale shell never points at deleted hashed assets and the smoke test reads origin-fresh.
- login.html: drop from the prod deploy with `rm dist/login.html` in the wrangler step, NOT by
  branching vite `rollupOptions.input` (that would fork the gated artifact from the shipped one
  and risk stripping login.html from Docker/LXC, where it is needed). Assert the self-host
  (Docker/LXC) `dist` still contains `login.html`. Document that `/login` on prod resolves to
  the SPA shell.
- Prod artifact: the wrangler job runs `npm ci && npm run build`; post-deploy assertion that
  `count.racku.la/version.json` reports the released version AND commit.
- CI rewrite: rewrite the entire reusable `deploy-prod.yml` (deploy AND smoke jobs) onto
  `ubuntu-latest`; remove the `[self-hosted, vps-rackula]` label from it (the live smoke job
  currently runs on that runner). Use `wrangler versions upload` + `wrangler versions deploy`
  (not bare `wrangler deploy`) so CF-native instant rollback exists. Add least-privilege CI
  secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit + the zone) and `CLOUDFLARE_ACCOUNT_ID`.
- Promote DAG: change `promote-prod` `needs` to `[validate, promote-gate]` only (drop
  `promote-docker`); keep `promote-docker` for the self-host `:latest` retag. Add
  `environment: prod` to the wrangler deploy job so the deploy-time required-reviewer approval
  fires (verify it works on `ubuntu-latest`). Decide consciously whether a failed `gate-lxc`
  should block the public frontend deploy (likely yes for release integrity, but make it a
  choice, not an inherited accident).
- Real smoke test (fail-closed): extract the hashed entry-point script URL from the deployed
  `index.html` and assert it returns 200 with `Content-Type: application/javascript` (reject a
  `text/html` SPA-fallback body); assert `version.json` is `application/json` and matches
  version+commit; assert a known-absent path returns the SPA shell; `curl -I` and assert the
  CSP contains `script-src 'self'` and NOT `unsafe-inline` in `script-src`, `X-Frame-Options`
  is SAMEORIGIN/DENY, and `nosniff` is present (assert VALUES, not mere presence). Add a
  cache-buster to the `version.json` probe to dodge edge-cache races.
- Custom-domain cutover ordering (the single irreversible step): (1) deploy the Worker with
  real assets to a `workers.dev` URL and validate first; (2) only then attach the
  `count.racku.la` custom domain, accepting it overrides the existing proxied VPS DNS record;
  (3) save the prior VPS DNS record so it can be re-pointed for rollback. Optionally dry-run on
  a temp hostname (`cf.racku.la`) first.
- Cleanup: remove the dead `VITE_PERSIST_ENABLED` build arg from `deploy/Dockerfile`; fix the
  stale "dev = GitHub Pages" claims in `CLAUDE.md`, `docs/ARCHITECTURE.md`, and the
  `VITE_BASE_PATH` comment in `vite.config.ts`.
- Rollback runbook (out-of-band, does NOT traverse `release.yml` and its indefinite approval
  gate): `wrangler versions deploy <last-good-id>` from a maintainer machine or a tiny separate
  dispatch workflow with its own concurrency group, plus DNS re-point to the saved VPS record
  as the cross-origin fallback for one release cycle.
- Do NOT decommission the VPS or remove the `vps-rackula` runner here: `deploy-dev.yml` still
  uses it until #1985.

## 5. Child C2: Cloudflare Web Analytics (Trivial-Small)

Acceptance criteria:

- Build-flag-gated beacon, gated on the PRESENCE of `VITE_CF_ANALYTICS_TOKEN` (empty/unset
  emits no beacon and no script tag). Gate on token presence, NOT on `PROD`/`VITE_ENV` (both
  are true for self-host production builds). The token is injected only in the wrangler-deploy
  job.
- Self-host `Dockerfile` and `build-lxc.yml` never set the token. Add a build-output assertion
  that the self-host `dist` contains no `cloudflareinsights`/beacon string.
- Add the analytics origins (`script-src https://static.cloudflareinsights.com`,
  `connect-src https://cloudflareinsights.com`) to the Cloudflare `_headers` CSP ONLY. The
  self-host CSP files stay at `'self'`. (Enforced by C4's CI grep.)
- Delete the dead `VITE_UMAMI_*` build-args still present in `deploy-dev.yml` so they do not
  become a template someone copies.
- Privacy: cookieless, no persistent identifier. State "consult counsel on consent" rather
  than asserting "no banner required" as settled.

## 6. Child C3: Cloudflare dev/preview frontend environment (Small)

Acceptance criteria:

- A `rackula-dev` Worker (its own wrangler env/config) hosts the dev FRONTEND, replacing the
  VPS-hosted dev frontend. Per-PR preview URLs via branch aliases (note: preview URLs are
  `workers.dev`-subdomain only in beta, not custom-domain).
- Pick and document ONE cross-origin model to the homelab dev API (the dev API moves to the
  homelab in #1985): either (a) a `workers.dev` dev frontend plus a CORS-opened homelab API,
  or (b) a Cloudflare Worker reverse-proxying `/api` to the homelab. Acknowledge the new
  cross-origin / tunnel surface; this is not "just a separate Worker."
- Coordinate HSTS `includeSubDomains` (C1) with whatever `d.racku.la` exposure this chooses.

## 7. Child C4: Self-host header/parity guard (Small)

The epic adds a fourth deploy surface (Cloudflare `_headers`) and a deliberate prod/self-host
divergence. The only parity guard today (`check-compose-persist-parity.sh`) covers compose env
vars, not headers or HTML entries. This child closes that gap.

Acceptance criteria:

- CI check that the three CSPs (CF `_headers`, `deploy/security-headers.conf`,
  `deploy/lxc/security-headers.conf`) agree on the `script-src` hash list; fail on divergence.
  A single generator that emits all three is acceptable in lieu of a checker.
- CI grep: the self-host header files must NOT contain analytics origins (`cloudflareinsights`).
- Extend `scripts/lxc-smoke-test.sh` to `curl -I` and assert `Content-Security-Policy` and
  `X-Frame-Options` are present on the LXC frontend, and to `curl /version.json` and assert the
  version (reusing C1's assertion) so SPA-fallback masking is closed on the self-host gate too.
- Reconcile and lock the Docker/LXC `form-action` drift.

## 8. Cross-cutting gates

- Security: headers verified live by value on `/`, `/assets/*`, and an absent path; no
  functional login form on prod; no CSP regression (the app's own inline scripts are covered by
  the policy, verified by a real page load, not just header presence); analytics origins are
  Cloudflare-only.
- Self-host preserved: `dist/` stays nginx-servable; `wrangler.jsonc`/`_headers` are
  deploy-only; no Cloudflare URL is hard-coded in app code; `login.html` remains in the
  self-host build; the beacon is absent from self-host builds; the three CSPs are aligned and
  CI-guarded.
- Cost: $0 on the Free plan for static serving; assets-only baseline (no Worker on the prod hot
  path).
- Release integrity: post-deploy version+commit assertion; real asset-resolution smoke; CF
  rollback via `wrangler versions` plus a one-cycle VPS DNS fallback.

## 9. Sequencing and dependencies

1. C1 first: it is the spine and retires the prod VPS tenant. C1 internally orders the
   workers.dev validation before the irreversible custom-domain attach.
2. C2 (analytics) and C4 (parity guard) can follow C1 independently. C4 should land close to
   C1 since C1 introduces the third CSP it guards.
3. C3 (dev/preview) is independent of C1 but coordinates HSTS scope; it interlocks with #1985
   (dev API to homelab).
4. #1986 (decommission) is blocked by #1984 (epic) AND #1985, and specifically by the condition
   "no workflow references the `vps-rackula` runner label" (`deploy-dev.yml` uses it until
   #1985 provisions a replacement dev runner/path). Sequence: prod to CF (C1) and dev to
   homelab incl. a new dev runner (#1985), THEN decommission (#1986). Never the reverse.
5. Keep the VPS DNS-switchable as the real rollback for at least one green CF release cycle
   before #1986.

## 10. Epic-restructure checklist (mechanics)

Execute in this order so no artifact dangles:

1. Post the spike conclusion as a comment on #1025; close #1025 as superseded (point to the
   #1984 epic and `docs/research/spike-1025-cf-frontend-hosting.md`). Optionally correct its
   stale title. (#1025 is currently OPEN but referenced as "closed" in #1983/#1984.)
2. Retitle/promote #1984 to "Epic: Cloudflare frontend hosting (prod -> Workers Static
   Assets)"; rewrite its body as an epic with the C1-C4 task-list and the self-contained
   done-when from Section 3.
3. Rewrite #1983's body: remove "Workstream 1: migrate prod" from its task-list (now owned by
   #1984), delegate the prod outcome to #1984, and reconcile the runner-teardown split (C1
   swaps prod off `vps-rackula`; `deploy-dev.yml` still uses it until #1985; #1986 removes it).
4. Create milestone `M00 -- VPS Retirement & Cloudflare Hosting`.
5. Create/reuse a Projects v2 "Priority" single-select field, set the epic and arc issues to
   the top priority, and configure the roadmap/board view to sort by Priority. Verify in the
   actual board that the arc shows at the top.
6. Create child issues C1-C4 under #1984, in `M00`, top priority.
7. Move #1983, #1984, #1985, #1986 into `M00` (per the re-prioritization decision). Optionally
   snapshot M02/M03 burndown first so the dip is explainable.
8. Fix #1986: change the title from "Vultr VPS" to "Linode VPS" (every other artifact says
   Linode); add the explicit blocked-by mechanism ("no workflow references the `vps-rackula`
   runner label") and note the dev-runner replacement prerequisite from #1985.

## 11. Out of scope and future direction

Out of scope here, deferred to a future epic "rackula-api as a true single-contract API":

- R2 image/asset hosting and KV share-link shortening. Building these as bespoke Cloudflare
  Workers now would create a second backend to maintain, which the solo-maintainer constraint
  rejects. They belong behind one API contract (one contract, two deployments: `rackula-api`
  for self-host, a Worker implementing the same contract for our Cloudflare deploy).
- Carry these security constraints into that epic: pin shares to the MINIMAL share format (no
  `notes`) so the markdown `{@html}` sink is unreachable via shares; if notes must be shared,
  mandate DOMPurify on render plus a live CSP and never treat Zod shape-validation as
  sanitisation; for KV, Turnstile + body-size cap + GET-side rate limit, and treat the free
  write cap as an attacker-triggerable availability ceiling (Workers Paid is the real cost).

Also out of scope: `rackula-api` hosting (stays as-is; dev API to homelab is #1985) and the
VPS decommission (#1986).

## 12. Open risks

- M00 top placement depends on a Projects v2 view configuration (manual). Verify it renders at
  the top before declaring it done.
- Cloudflare API token provisioning with least privilege is the most likely deploy snag.
- The unknown-CSP-hash investigation may reveal that `script-src` cannot be fully tightened to
  `'self'` (a build-emitted inline script remains); the plan must handle either outcome.
- HSTS `includeSubDomains`/preload has cross-subdomain blast radius on `racku.la`; defer preload
  and coordinate with C3.
- Preview URLs are `workers.dev`-subdomain only in beta; dev review UX cannot yet be on a
  `racku.la` subdomain.
