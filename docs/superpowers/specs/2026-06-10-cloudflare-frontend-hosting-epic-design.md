# Design: Cloudflare Frontend Hosting (VPS Retirement)

Date: 2026-06-10 Status: Approved design, three adversarial passes folded, pending implementation planning Origin: Spike #1025 (see `docs/research/spike-1025-cf-frontend-hosting.md` and the `docs/research/1025-*.md` files: codebase, external, patterns, and devil's-advocate). Three adversarial passes are folded into this spec. Passes 1-2: cutover/rollback, shared CSP, hollow smoke test, milestone ordering, Cloudflare account/DNS reality, CI/git-context coupling. Pass 3 (2026-06-10, grounded against the repo and Cloudflare docs): account-wide token scope, custom-domain attach mechanics, preview-URL smoke before promote, C1 split into C1a/C1b, build-env parity, HSTS scoping, transitive promote-DAG coupling.

Promotes issue #1984 into this epic. Sibling of epic #1983 (eliminate the VPS). Milestone: `M02 -- LXC Release & Stability` (execution-time decision; the designed `M00` was dropped, see the Section 2 execution note).

---

## 1. Goal

Host the Rackula production frontend on Cloudflare Workers Static Assets, retiring the production Linode VPS tenant at near-zero cost and lower maintenance, without losing the security response-header posture nginx provides today, and without breaking the Docker/LXC self-host story.

Prod (`count.racku.la`) already serves a no-API static bundle (`AUTH_MODE=none`, no persistence backend), so the move is a static-origin cutover, not a rewrite. The hard parts are the release-pipeline cutover, re-homing the security headers, and preserving self-host parity, not the asset serving itself.

## 2. Scope decisions (settled)

- Platform: Cloudflare Workers Static Assets, assets-only for the baseline (no Worker script on the prod hot path). Committed per #1983/#1984.
- Environments: prod frontend to Cloudflare is the deliverable; a Cloudflare dev/preview frontend env accompanies it (C3). The dev API stays on the homelab (#1985, separate).
- Backend: `rackula-api` hosting is out of scope and unchanged.
- Storage features (R2 images, KV share links) and the `rackula-api`-as-a-true-API rework are a separate FUTURE epic, explicitly excluded here. See Section 11.
- Self-host: the existing Docker/LXC path stays the self-host story, unchanged. Cloudflare is purely how WE host prod/dev.
- Effort lens: Claude-assisted (human effort below raw LOC), but codegen does not lower the cost of token scoping, security verification, or self-host parity, so estimates reflect that.

Milestone ordering decision: milestones sort by title lexicographically on this board, per the approved `docs/superpowers/specs/2026-06-08-milestone-sort-order-design.md` (titles are zero-padded `M01..M99`; that spec explicitly rejects "custom GitHub Project fields as workaround"). Therefore `M00 -- VPS Retirement & Cloudflare Hosting` sorts FIRST by title, with no Priority field and no board configuration. Caveat: the project's current "Roadmap" view is a Status-grouped board, where neither title nor a field floats a single global top; milestone title-sort is the canonical mechanism wherever milestones are grouped, and that is what this relies on. Do not introduce a Projects v2 Priority-field workaround (it would contradict the 06-08 spec).

Re-prioritization decision: VPS retirement outranks the in-progress LXC release (M02). #1983, #1984, #1985, #1986 all move into `M00`. The M02/M03 burndown dip from moving in-progress #1985 is accepted and deliberate.

Execution note (2026-06-10): the M00 decision was REVERSED at execution time by the maintainer. The whole arc rides the active `M02 -- LXC Release & Stability` milestone instead; M00 was created and then deleted. The title-sort mechanism above remains valid for any future top-priority milestone; nothing currently uses it. The two paragraphs above are retained as the design-time record.

Prod artifact decision: the wrangler job runs its own `npm ci && npm run build` (a separate build from the gated Docker image). To compensate for losing the "promote exactly what was gated" invariant, the post-deploy assertion verifies `count.racku.la/version.json` matches the released version AND commit. The CF build must check out the released tag with `.git` present so `vite.config.ts` `getGitInfo()` populates `commit` (today the Docker build ships `commit=""` because `.dockerignore` strips `.git`). For self-host parity, add an `APP_COMMIT` build-arg to `deploy/Dockerfile` (mirroring `api/Dockerfile`) wired through `build-images.yml` and `build-lxc.yml`, so self-host `version.json.commit` is populated in the same short-hash format rather than left blank.

The version+commit assertion does not detect build-env drift: version.json encodes version/commit/time, not VITE\_\* flags. The wrangler job must pin the same env as the gated Docker build explicitly (`VITE_ENV=production`; the C2 analytics token is the only deliberate delta), and C4 adds an env-parity check between `deploy/Dockerfile` build-args and the wrangler job. Design interaction, recorded consciously: C2's build-time beacon token is what forces the separate build. If C2 ever moves to deploy-time beacon injection (same pattern as `_headers`), promoting the gated Docker image's `dist/` (docker create + cp) becomes possible and restores "promote exactly what was gated" wholesale.

## 3. Epic structure

```
M02 -- LXC Release & Stability (milestone)  [execution-time decision; M00 dropped]
|
+- #1984  EPIC: Cloudflare frontend hosting (prod -> Workers Static Assets)   [promoted in place]
|    +- #2028  C1a Shared-source cleanup: CSP, shim, APP_COMMIT      (Small-Medium)
|    +- #2029  C1b Prod cutover to Workers Static Assets             (Medium-Large)
|    +- #2030  C2  Cloudflare Web Analytics                         (Trivial-Small)
|    +- #2031  C3  Cloudflare dev/preview frontend environment     (Small)
|    +- #2032  C4  Self-host header/parity guard                   (Small)
|
+- #1983  EPIC: Eliminate the production VPS   [keeps the decommission arc]
     +- #1985  dev rackula-api -> homelab
     +- #1986  decommission the Linode VPS + vps-rackula runner   [blocked by #1984 + #1985]
```

#1984 is promoted in place (retitle + rewrite body as an epic) so its number, links, and history survive. It is a sibling of #1983 that feeds it: #1983's decommission (#1986) is blocked by #1984 plus #1985.

Epic #1984 done-when (self-contained, does NOT include VPS power-off):

- `count.racku.la` served from Workers Static Assets.
- Release pipeline promotes prod via `wrangler versions` (not the VPS runner).
- Prod is no longer in the `vps-rackula` serving path.
- Security headers verified live on prod by value, on multiple paths.
- Self-host builds unchanged (login.html present, beacon-free, the three CSPs aligned).
- Analytics live on prod; Cloudflare dev/preview env exists.

VPS power-off remains #1983/#1986's done-when.

## 4. Children C1a and C1b: prod cutover, split

The cutover was one atomic Large child until DA pass 3. The "no headerless prod window" argument binds the headers to the cutover step, not every repo edit to one PR, so the shared-source edits split out cleanly: they ship and are verified live on the existing VPS/nginx path before any Cloudflare work, and the blocking CSP investigation moves out of the cutover PR. Headers live in nginx until cutover; the CF `_headers` exists from the first Worker deploy. No headerless window exists in either child. C1a strictly before C1b.

### C1a: Shared-source cleanup: CSP, shim, APP_COMMIT (Small-Medium)

Ships through the normal release pipeline to the VPS like any release, so every shared-source change is proven on live nginx (Docker) and the LXC gate before the cutover depends on it.

- Delete the `index.html` GitHub-Pages `sessionStorage` redirect shim and `static/404.html`. Safe for self-host: both nginx configs serve SPA deep links via `try_files $uri $uri/ /index.html` (`deploy/nginx.conf.template` and `deploy/lxc/nginx.conf`), not via the GH-Pages 404 shim. Shared-source cleanup, not prod-only.
- Re-derive the remaining inline-script hashes and mirror the change into `deploy/security-headers.conf` (Docker) and `deploy/lxc/security-headers.conf` (LXC), which both pin the same shim hash. Reconcile the pre-existing `form-action` drift (Docker is missing it).
- Unknown-hash investigation (blocking, inside C1a): the second pinned hash `sha256-yei5Fza...` is annotated "Dynamic inline script in bundled JS (exact origin unknown)". Build `dist/`, grep the output HTML for inline `<script>` with no `src`, and identify the source. Only tighten `script-src` toward `'self'` once no build-emitted inline script remains, or pin an auto-derived hash (computed from `dist/` at build time, not hand-maintained). Do not drop a hash whose script you cannot prove is gone.
- Add the `APP_COMMIT` build-arg to `deploy/Dockerfile` (mirroring `api/Dockerfile`) wired through `build-images.yml` and `build-lxc.yml`, per the prod-artifact decision in Section 2.
- Remove the dead `VITE_PERSIST_ENABLED` build arg from `deploy/Dockerfile`, and the dead `VITE_PERSIST_ENABLED` and `VITE_UMAMI_*` assignments from `build-images.yml`, `rebuild-images.yml`, `build-lxc.yml`, `build-lxc-dev.yml`, and `deploy-dev.yml` (the app uses runtime persistence detection, `src/lib/stores/persistence.svelte.ts`; Umami was removed in #1970 but its build-args linger in all five workflows).

### C1b: Prod cutover to Workers Static Assets (Medium-Large)

Depends on C1a being released. Spans hosting config, the security-header re-home, the `deploy-prod.yml` rewrite, the custom-domain attach, and the rollback runbook. The custom-domain attach is the final, most disruptive step, gated on the workers.dev validation passing.

Out-of-band prerequisites (one-time account actions, name them before starting):

- Register the account `*.workers.dev` subdomain (one-time, permanent, dashboard). The rollback runbook (`wrangler versions`), the per-release preview-URL smoke, and the workers.dev validation step all depend on it.
- Confirmed (2026-06-10): the `racku.la` zone and the `rackula-prod` Worker will live in the SAME Cloudflare account, so the custom-domain attach is account-valid. Still create the Worker and the CI `CLOUDFLARE_ACCOUNT_ID`/token under that same account.
- Provision CI tokens (see "CI and pipeline" below for what token scoping can and cannot do).

Hosting config:

- `wrangler.jsonc` at repo root (deploy-target config, not imported by the app, ignored by nginx): assets directory `./dist/`, `not_found_handling: "single-page-application"`, pinned `compatibility_date` (bump deliberately). Do NOT include `routes` at bootstrap: a committed `routes: [{ pattern: "count.racku.la", custom_domain: true }]` would attempt the domain attach on the FIRST deploy, before the workers.dev validation. Add the route entry only at the attach step, and from then on manage the domain in config only (mixed dashboard/config management of routes is a footgun).
- `_headers` source: do NOT commit it to `static/` (publicDir copies `static/` verbatim into every `dist/`, which would leak `_headers` into the self-host nginx build). Instead generate or copy `_headers` into `dist/` inside the wrangler deploy step, parallel to the `rm dist/login.html` step, so it is CF-only and never ships in self-host artifacts. Add an `.assetsignore` (or equivalent) so Workers parses `_headers` and does not also serve it as a fetchable asset. No `_redirects` file is needed: `not_found_handling: single-page-application` owns SPA fallback.

Security headers (in the CF `_headers`):

- CSP, HSTS, X-Frame-Options, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy. Use a `/*` rule (one policy for all paths) to match nginx's `always` coverage. Verify on `/`, a real hashed asset under `/assets/`, and a known-absent path.
- HSTS: emit `Strict-Transport-Security` from `_headers`, scoped to this Worker only. Do NOT use the Cloudflare zone-level HSTS setting: it applies to every proxied hostname in the zone (apex, `d.racku.la`, future hosts), which is exactly the cross-subdomain blast radius to avoid. `_headers` HSTS replicates today's nginx scope (`deploy/security-headers.conf` already sends `max-age=31536000; includeSubDomains`; harmless, `count.racku.la` has no subdomains). The duplicate-header concern only arises if both mechanisms are enabled; use one. Do NOT enable preload yet. Coordinate with C3 on any future `d.racku.la` exposure.
- Cache-Control: `/assets/*` immutable (`max-age=31536000, immutable`); `index.html` and `version.json` set to `no-cache`/`no-store` so a stale shell never points at deleted hashed assets and the smoke test reads origin-fresh.
- robots: add `Disallow: /login` (and any other SPA-fallback route you do not want indexed) to the prod robots policy. `robots.txt` is a publicDir-shared file, so a prod-only `Disallow` uses the same deploy-step injection as `_headers`, or keep the shared `robots.txt` allow-all consciously and document why.

login.html and the prod artifact:

- Drop login.html from the prod deploy with `rm dist/login.html` in the wrangler step, NOT by branching vite `rollupOptions.input` (that would fork the gated artifact from the shipped one and risk stripping login.html from Docker/LXC, where it is needed). Assert the self-host (Docker/LXC) `dist` still contains `login.html`. Document that `/login` on prod resolves to the SPA shell.
- Prod artifact: the wrangler job runs `npm ci && npm run build` after checking out the released tag with `.git` present, so `version.json.commit` is populated. Pin the build env explicitly to match the gated Docker build (`VITE_ENV=production`; the C2 analytics token is the only deliberate delta); C4 guards this with an env-parity check. Derive the expected commit with `git rev-parse --short HEAD` (matching vite's short format) and assert the deployed `version.json` reports the released version AND that commit.

CI and pipeline:

- Rewrite the entire reusable `deploy-prod.yml` (deploy AND smoke jobs) onto `ubuntu-latest`; remove the `[self-hosted, vps-rackula]` label from it (the live smoke job currently runs on that runner).
- Deploy order, every steady-state release: `wrangler versions upload` first, run the FULL fail-closed smoke against that version's preview URL (workers.dev), and only on a green smoke run `wrangler versions deploy` to 100%, then a light re-check of `count.racku.la` (version and one header value). A bad build never takes traffic, and every release gets the same pre-promotion validation the bootstrap got. Do NOT use percentage-based gradual rollouts for this SPA: Cloudflare documents the mixed-version hazard (HTML from one version referencing hashed assets only present in another, yielding 404s), and version affinity requires a request header browsers do not send.
- Tokens: Cloudflare API tokens cannot be scoped to a single Worker; the Workers Scripts edit permission is account-wide. Split prod and dev/preview tokens anyway (separate secrets, separate rotation, zone permissions only on the prod token), but treat BOTH as prod-grade: either token can overwrite any Worker in the account, including `rackula-prod`. The prod token sits behind the existing prod approval gate; the dev/preview token is never exposed to fork PRs and only ever runs in privileged jobs that execute no PR-authored code (see C3). Add `CLOUDFLARE_ACCOUNT_ID`.
- Promote DAG: change `promote-prod` `needs` to `[validate, promote-gate, promote-github]` (keep `promote-github` so prod only goes live AFTER the GitHub release is marked latest, avoiding a prod-live-but-release-prerelease split-brain). Note the transitive coupling this keeps: `promote-github` itself needs `promote-docker` (release.yml), so prod still waits on the Docker `:latest` retag and, via `promote-gate`, on `gate-lxc`. Accepted consciously: the retag is fast, and a release whose images failed to promote should not be marked latest or go live. Keep `promote-docker` for the self-host `:latest` retag.
- Approval: keep the single prod approval on `promote-gate` (which already binds the `prod` GitHub Environment). Do NOT add `environment: prod` to the wrangler deploy job: it would re-prompt the same protected environment a second time in the same run (double-approval papercut). If a deployment record/URL is wanted on the wrangler job, use a non-protected environment.
- Bootstrap vs steady-state: the FIRST cutover (deploy to workers.dev, validate, attach the custom domain) is a one-time out-of-band runbook that does not ride `release.yml`. Steady-state prod deploys then flow through the rewritten `promote-prod`. The first TAGGED release after cutover needs a normal CHANGELOG entry and version bump like any release (the deploy rides the tag through the changelog-gated pipeline); the bootstrap itself does not.

Real smoke test (fail-closed), run against the version preview URL before every promote and against `count.racku.la` after:

- Extract the hashed entry-point script URL from the deployed `index.html` and assert it returns 200 with `Content-Type: application/javascript` (reject a `text/html` SPA-fallback body).
- Assert `version.json` is `application/json` and matches version+commit (with a cache-buster to dodge edge-cache races).
- Assert a known-absent path returns the SPA shell.
- `curl -I` and assert the CSP contains `script-src 'self'` and NOT `unsafe-inline` in `script-src`, `X-Frame-Options` is SAMEORIGIN/DENY, and `nosniff` is present (assert VALUES, not mere presence).
- The repo already has a URL-targetable Playwright smoke harness (`e2e/playwright.smoke.config.ts`, `SMOKE_TEST_URL`, `npm run test:e2e:smoke`); use it where a real page load beats curl (it is also the vehicle for C2's beacon-not-CSP-blocked check).

Custom-domain cutover ordering (the single most disruptive step):

- Reality check (Cloudflare docs): a Custom Domain CANNOT be created over an existing DNS record, and the API has no override parameter. The attach is delete-record-then-attach, which opens a short window where `count.racku.la` has no record; DNS negative caching can stretch that window up to the `racku.la` SOA minimum TTL. Check that SOA value first, script the delete and attach back-to-back via API (and verify whether the dashboard flow offers an atomic replace), and run the cutover in a quiet window.
- Disruptive, not irreversible: rollback is detach the custom domain and recreate the saved DNS record. The same negative-caching window applies in reverse.
- Snapshot the full `racku.la` zone (export all records) before touching anything. The cutover alters ONLY the `count.racku.la` record; do not change apex `racku.la` A/AAAA, MX, or SPF/DKIM/DMARC TXT records. `d.racku.la` is owned by C3/#1985, not C1b.
- (1) Deploy the Worker with real assets to the `workers.dev` URL and run the full fail-closed smoke against it. (2) Only then delete the existing `count.racku.la` record and attach the custom domain, back-to-back. (3) Keep the saved record content for rollback. Optionally dry-run the attach mechanics on a temp hostname (`cf.racku.la`) first.

Cleanup:

- Fix the stale "dev = GitHub Pages" claims in `CLAUDE.md`, `docs/ARCHITECTURE.md`, and the `VITE_BASE_PATH` comment in `vite.config.ts`. Update the CLAUDE.md Deployment table's prod row (VPS/Docker becomes Workers Static Assets) and add `M00` to its current-milestones list.
- Remove `.github/workflows/deploy-prod.yml` from `compose-parity.yml`'s `paths` filter (prod no longer pulls compose), and update any stale comments anchored to `deploy-prod` in `trivy.yml`, `build-images.yml`, `rebuild-images.yml` that go stale when prod leaves the VPS.

Rollback:

- CF-native: `wrangler versions deploy <last-good-id>` from a maintainer machine or a tiny separate dispatch workflow with its own concurrency group (does NOT traverse `release.yml` and its indefinite approval gate). Cloudflare retains the last 100 versions.
- VPS fallback: detach the custom domain and re-create the saved `count.racku.la` DNS record pointing at the VPS origin. This only works while the VPS prod container is still running its last-good build, so: leave the VPS prod container RUNNING and untouched (do not `docker compose down`, do not power off, do not let #1986 proceed) until BOTH hold: at least ONE successful steady-state CF release has shipped through the rewritten pipeline, AND 7 days have passed since cutover with no user-visible regression. "Green" means the preview smoke and post-promote checks passed and nothing regressed during the soak. Then the fallback may be retired and #1986 unblocked.
- Do NOT decommission the VPS or remove the `vps-rackula` runner here: `deploy-dev.yml` still uses it until #1985.

## 5. Child C2: Cloudflare Web Analytics (Trivial-Small)

Acceptance criteria:

- Build-flag-gated beacon, gated on the PRESENCE of `VITE_CF_ANALYTICS_TOKEN` (empty/unset emits no beacon and no script tag). Gate on token presence, NOT on `PROD`/`VITE_ENV` (both are true for self-host production builds). The token is injected only in the wrangler-deploy job.
- Self-host `Dockerfile` and `build-lxc.yml` never set the token. Add a build-output assertion that the self-host `dist` contains no `cloudflareinsights`/beacon string.
- CSP origins: verify the actual beacon endpoint on the proxied custom domain. When a zone is proxied (count.racku.la will be), Cloudflare RUM typically POSTs to the same-origin `/cdn-cgi/rum` path, which `connect-src 'self'` already covers. Only add `script-src https://static.cloudflareinsights.com` / `connect-src https://cloudflareinsights.com` to the CF `_headers` CSP if the beacon truly loads/posts cross-origin. Keep these origins out of the self-host CSP files (enforced by C4's CI grep). Add a real-page-load check (not just a header-value assert) that the beacon fetch is not CSP-blocked; the existing Playwright smoke harness (`e2e/playwright.smoke.config.ts` with `SMOKE_TEST_URL`) is the vehicle.
- Verify no `VITE_UMAMI_*` references remain in `.github/workflows/` (the dead assignments exist in all five build workflows, not just `deploy-dev.yml`; removal rides C1a's dead-build-arg cleanup, which edits the same files. This AC is the backstop check).
- Privacy: cookieless, no persistent identifier. State "consult counsel on consent" rather than asserting "no banner required" as settled.

## 6. Child C3: Cloudflare dev/preview frontend environment (Small)

Acceptance criteria:

- A `rackula-dev` Worker (its own wrangler env/config) hosts the dev FRONTEND, replacing the VPS-hosted dev frontend. Per-PR preview URLs via `wrangler versions upload` (version preview URLs; `--preview-alias` on newer wrangler for stable per-branch URLs). Managed "branch aliases" are a Workers Builds feature, not available from GitHub Actions. Preview URLs are `workers.dev`-subdomain only, not custom-domain.
- Preview workflow security: specify the trigger and token model. Prefer `pull_request` from same-repo branches only (skip forks), or run the deploy in a privileged `workflow_run` job that never exposes the token to PR code. Do NOT use `pull_request_target` with the CF token in scope. Token reality (DA pass 3): Cloudflare tokens cannot be scoped to a single Worker (the Workers Scripts permission is account-wide), so the dev/preview token can also write `rackula-prod`; treat it as a prod-grade secret. The workflow trigger model above is the real security boundary, not token scope. Acknowledge that minting public `workers.dev` preview URLs publishes pre-merge, unreviewed builds.
- Dev indicator: the DRackula dev cue is currently driven by a hostname allowlist (`LogoLockup.svelte`: `hostname === 'd.racku.la'`), which fails on `*.workers.dev` and on the future homelab host, silently dropping the dev/prod visual distinction. Switch it to the build-time flag (`__BUILD_ENV__` / `VITE_ENV`, already set to `development` in `deploy-dev.yml`) so the indicator survives the host change.
- Pick and document ONE cross-origin model to the homelab dev API (the dev API moves to the homelab in #1985): either (a) a `workers.dev` dev frontend plus a CORS-opened homelab API, or (b) a Cloudflare Worker reverse-proxying `/api` to the homelab. Acknowledge the new cross-origin / tunnel surface; this is not "just a separate Worker."
- Coordinate HSTS `includeSubDomains` (C1b) with whatever `d.racku.la` exposure this chooses.

## 7. Child C4: Self-host header/parity guard (Small)

The epic adds a fourth deploy surface (Cloudflare `_headers`) and a deliberate prod/self-host divergence. The only parity guard today (`check-compose-persist-parity.sh`) covers compose env vars, not headers or HTML entries. This child closes that gap.

Acceptance criteria:

- CI check that the three CSPs (the CF `_headers` generated at deploy, `deploy/security-headers.conf`, `deploy/lxc/security-headers.conf`) agree on the `script-src` hash list; fail on divergence. A single generator that emits all three is acceptable in lieu of a checker. Grep the exact source paths.
- CI grep: the self-host header files must NOT contain analytics origins (`cloudflareinsights`).
- CI check that the VITE\_\* build-args declared in `deploy/Dockerfile` and the env pinned in the wrangler deploy job agree (the version+commit assertion cannot detect build-env drift; see Section 2).
- Extend `scripts/lxc-smoke-test.sh` to `curl -I` and assert `Content-Security-Policy` and `X-Frame-Options` are present on the LXC frontend, and to `curl /version.json` and assert the version (reusing C1b's assertion) so SPA-fallback masking is closed on the self-host gate too. With the `APP_COMMIT` parity from Section 2, also assert `version.json.commit` is non-empty on self-host.
- Reconcile and lock the Docker/LXC `form-action` drift.

## 8. Cross-cutting gates

- Security: headers verified live by value on `/`, `/assets/*`, and an absent path; no functional login form on prod; no CSP regression (the app's own inline scripts are covered by the policy, verified by a real page load, not just header presence); analytics origins are Cloudflare-only.
- Self-host preserved: `dist/` stays nginx-servable; `wrangler.jsonc` and the CF `_headers` are deploy-only (`_headers` injected in the wrangler step, never committed to `static/`); no Cloudflare URL is hard-coded in app code; `login.html` remains in the self-host build; the beacon is absent from self-host builds; the three CSPs are aligned and CI-guarded.
- Cost: $0 on the Free plan for static serving; assets-only baseline (no Worker on the prod hot path). The `workers.dev` subdomain registration and per-PR preview Workers stay within Free limits (verify).
- Release integrity: full fail-closed smoke on the version preview URL BEFORE traffic shifts, post-promote version+commit re-check; real asset-resolution smoke; CF rollback via `wrangler versions` plus the VPS DNS fallback held until one green steady-state release AND a 7-day no-regression soak.

## 9. Sequencing and dependencies

1. C1a first: shared-source cleanup ships through the existing VPS pipeline and is verified live on nginx before anything depends on it.
2. C1b second: the cutover spine that retires the prod VPS tenant. C1b internally orders the workers.dev validation before the custom-domain attach.
3. C2 (analytics) and C4 (parity guard) can follow C1b independently. C4 should land close to C1b since C1b introduces the third CSP it guards.
4. C3 (dev/preview) is independent of C1b but coordinates HSTS scope; it interlocks with #1985 (dev API to homelab).
5. #1986 (decommission) is blocked by #1984 (epic) AND #1985, and specifically by the condition "no workflow references the `vps-rackula` runner label" (`deploy-dev.yml` uses it until #1985 provisions a replacement dev runner/path). Sequence: prod to CF (C1b) and dev to homelab incl. a new dev runner (#1985), THEN decommission (#1986). Never the reverse.
6. Keep the VPS prod container running and DNS-switchable as the real rollback until one green steady-state CF release has shipped AND 7 days have passed since cutover with no regression; then #1986 is unblocked.

## 10. Epic-restructure checklist (mechanics)

EXECUTED 2026-06-10 via docs/plans/2026-06-10-cf-hosting-epic-restructure.md. Deviation: the milestone target changed from a new M00 to the existing M02 at execution time (maintainer decision mid-run); M00 was created, emptied, and deleted. Children: C1a=#2028, C1b=#2029, C2=#2030, C3=#2031, C4=#2032, all native sub-issues of #1984. The checklist below is the design-time record.

Execute in this order so no artifact dangles:

1. Post the spike conclusion as a comment on #1025; close #1025 as superseded (point to the #1984 epic and `docs/research/spike-1025-cf-frontend-hosting.md`). Optionally correct its stale title. (#1025 is currently OPEN but referenced as "closed" in #1983/#1984.)
2. Verify `gh issue view 1025 --json state` returns CLOSED before the next step (do not rewrite #1983's body while #1025 is still open).
3. Retitle/promote #1984 to "Epic: Cloudflare frontend hosting (prod -> Workers Static Assets)"; rewrite its body as an epic with the C1-C4 task-list and the self-contained done-when from Section 3.
4. Rewrite #1983's body: remove "Workstream 1: migrate prod" from its task-list (now owned by #1984), delegate the prod outcome to #1984, and reconcile the runner-teardown split (C1b swaps prod off `vps-rackula`; `deploy-dev.yml` still uses it until #1985; #1986 removes it).
5. Create milestone `M00 -- VPS Retirement & Cloudflare Hosting`. It sorts first by title; no Priority field or board configuration is required (per the 06-08 milestone-sort-order spec).
6. Create child issues C1a, C1b, C2, C3, C4 under #1984, in `M00`.
7. Move #1983, #1984, #1985, #1986 into `M00` (per the re-prioritization decision). Optionally snapshot M02/M03 burndown first so the dip is explainable.
8. Fix #1986: change the title from "Vultr VPS" to "Linode VPS" (every other artifact says Linode); add the explicit blocked-by mechanism ("no workflow references the `vps-rackula` runner label") and note the dev-runner replacement prerequisite from #1985.

## 11. Out of scope and future direction

Out of scope here, deferred to a future epic "rackula-api as a true single-contract API":

- R2 image/asset hosting and KV share-link shortening. Building these as bespoke Cloudflare Workers now would create a second backend to maintain, which the solo-maintainer constraint rejects. They belong behind one API contract (one contract, two deployments: `rackula-api` for self-host, a Worker implementing the same contract for our Cloudflare deploy).
- Carry these security constraints into that epic: pin shares to the MINIMAL share format (no `notes`) so the markdown `{@html}` sink is unreachable via shares; if notes must be shared, mandate DOMPurify on render plus a live CSP and never treat Zod shape-validation as sanitisation; for KV, Turnstile + body-size cap + GET-side rate limit, and treat the free write cap as an attacker-triggerable availability ceiling (Workers Paid is the real cost).

Also out of scope: `rackula-api` hosting (stays as-is; dev API to homelab is #1985) and the VPS decommission (#1986).

## 12. Open risks

- Cloudflare account/zone co-ownership: confirmed same account (2026-06-10), so the custom-domain attach is account-valid. Ensure the Worker and CI token are created under that account.
- `*.workers.dev` subdomain must be registered (one-time) before the rollback runbook, the per-release preview-URL smoke, and the workers.dev validation step work.
- Cloudflare API tokens cannot be scoped per-Worker (the Workers Scripts permission is account-wide), so both tokens are prod-grade and the workflow trigger model is the real security boundary. Token provisioning and rotation discipline is the most likely deploy snag.
- The custom-domain attach is delete-record-then-attach (no API override exists), opening a short no-record window stretched by DNS negative caching up to the SOA minimum TTL; script the two calls back-to-back and run in a quiet window.
- The unknown-CSP-hash investigation may reveal that `script-src` cannot be fully tightened to `'self'` (a build-emitted inline script remains); the plan must handle either outcome.
- HSTS `includeSubDomains`/preload has cross-subdomain blast radius on `racku.la`; defer preload and coordinate with C3.
- (Resolved 2026-06-10: moot. The M00 milestone was dropped at execution time; the arc rides M02. Title-sort remains available for future top-priority milestones.)
- Preview URLs are `workers.dev`-subdomain only in beta; dev review UX cannot yet be on a `racku.la` subdomain.
- `version.json.commit` short-hash format must match between the CF build and the `APP_COMMIT` build-arg path, or the parity assertion will report a spurious mismatch.
