# M02 -- LXC Release & Stability Execution Plan

> For agentic workers: execute one task per session via /dev-issue <number>. The GitHub issue body is the source of truth (each carries an Alignment audit 2026-06-12 section with binding ACs). Do not start a task whose listed blockers are open. Follow repo TDD policy (CLAUDE.md): tests only where behaviour warrants them.

## Goal

Ship Rackula's distribution channels (Unraid CA, ProxmoxVE community-scripts follow-ups, release-attached LXC artifacts), complete the Cloudflare cutover for dev and prod, and decommission the Linode VPS. Milestone closure = all in-repo deliverables done plus #1986 (VPS decommission). Issues labelled waiting-external (#2142, #2053, #2013) form a background track and do not gate closure.

## Position in sequence

M02 is the active milestone and runs first in the sequence M02 -> M04 -> M03 -> M14 -> M16. M15 (Storage Model & Data Safety) runs in parallel with M02 right now; its issues gate parts of Stage 2 and the contract-test work in Stage 1. Note: #728 (hero video) has moved out of M02 to M16.

## Cross-milestone gates in

- M15 #2037 (explicit storage mode, remove probe-and-guess) gates #2134: the { storage: "server" } config injection the dev cutover deploys is inert until #2037 lands.
- M15 #2041 (frontend echo-based conflict handling and snapshot upload) ideally precedes #2134 so d.racku.la can exercise the conflict path end to end during soak; it also carries the client-side load-response hardening that matters for #2133's separately writable backing store.
- M15 #2091 (TOCTOU race in pre-overwrite snapshot) is a prerequisite for the shared storage-contract test spec in #2133; do not write the contract spec around the filesystem driver's racy pre-fix behaviour.
- #2028 (C1a shared-source cleanup) is CLOSED and released (tags v26.6.x shipped after merge), satisfying #2029's C1a-released precondition.

## Cross-milestone gates out

- Nothing in M04 or M03 hard-gates on M02; they proceed in parallel or after.
- #2029's new user-data disposition AC protects M15's storage chip and nudge UX from misleading prod users during the static-only transition; M15 messaging assumes that plan exists.
- #2159 hands the durable slot_width data to M03 #2158 (carrier-first epic); the placement outcome is model-agnostic so #2158 is not blocked.
- External listings (#2142 ProxmoxVE catalogue, #2013 Unraid CA) complete on third-party timelines after M02 closes.

## Stage 1: Distribution and parity groundwork (parallel, start now)

### Task: #2133 feat: Workers entry + CF storage driver for rackula-api

Blockers: none for the driver extraction and Workers entry (former blocker #2132 is closed); M15 #2091 gates only the shared contract-test spec, which must encode the post-fix atomic snapshot-on-mismatch behaviour.

Why this position: the storage-driver seam and CF driver are the implementation prerequisite for the Stage 2 dev cutover (#2134) and are startable immediately.

Scope: extract a storage-driver interface from api/src/storage/ (filesystem.ts, quota.ts; assets.ts stays filesystem-only) and inject per-request so routes stop importing filesystem free functions directly. Restructure auth imports so the Workers entry never statically reaches api/src/local-auth.ts or api/src/auth/config.ts (argon2 is build-time fatal in a Workers bundle). Implement the CF driver (layouts CRUD, snapshots, quota) with the audit-promoted ACs: R2 conditional PUT (onlyIf: { etagMatches }) with re-read + snapshot + retry on mismatch, snapshot prune to 5 per layout via prefix + uploaded sort, quota via prefix count. Both drivers pass the shared contract suite (runStorageContract, created by M15 #2091; extend it with CF-driver cases) including the atomic snapshot-on-mismatch test; self-host Bun path stays untouched.

Key files: api/src/storage/filesystem.ts, api/src/storage/quota.ts, api/src/storage/assets.ts, api/src/storage/filesystem.test.ts, api/src/local-auth.ts, api/src/auth/config.ts, api/src/app.ts, api/src/index.ts

Verify: cd api && bun test; cd api && bun run typecheck; npm run lint; Workers entry build emits no argon2 in the bundle (assert with a grep on the build output); CI green on the PR.

- [ ] Done when: Workers entry builds without argon2 in the bundle; storage-driver interface extracted; filesystem behaviour unchanged; CI green.
- [ ] After M15 #2091 lands: CF driver and filesystem driver both pass the shared contract suite (runStorageContract), including atomic snapshot-on-mismatch.

### Task: #2159 fix: audit MikroTik brand pack widths and set slot_width on half-width models

Blockers: none.

Why this position: standalone data correction, independent of all infrastructure work; restores the side-by-side placement broken alongside #2152.

Scope: audit every entry in src/lib/data/brandPacks/mikrotik.ts against official MikroTik dimensions and set slot_width: 1 on models at or under half-rack width (241 mm). Update both duplicate slug sections consistently (61 slugs: 28 unprefixed + 33 prefixed, 21 models duplicated). The placement AC is model-agnostic: two RB5009 occupy the same U side by side via current slot mechanics or, post-#2158, a carrier. No test changes per the zero-change rule; the schema validates the data.

Key files: src/lib/data/brandPacks/mikrotik.ts

Verify: npm run test:run; npm run lint; npm run build; manual check in npm run dev that two RB5009 share a U side by side.

- [ ] Done when: every MikroTik entry is checked against official dimensions, slot_width: 1 is set on all sub-241 mm models in both slug sections, and two RB5009 can share a U.

### Task: #2060 chore: propagate config.js storage-mode injection to the ProxmoxVED synced copy

Blockers: none (upstream PR #1897 merged 2026-06-12). Coordinate with #2065: push both upstream ProxmoxVED changes as one follow-up PR, not two.

Why this position: the in-repo change (PR #2051) already shipped; the upstream copy drifts until mirrored, and LXC installs from upstream would flip to browser mode once M15 #2037 lands.

Scope: mirror the server-mode config.js writing in deploy/lxc/community-scripts/install/rackula-install.sh and the rewrite step in deploy/lxc/community-scripts/ct/rackula.sh to the fork ggfevans/ProxmoxVED, then open or update one upstream follow-up PR batched with #2065's install-script change.

Key files: deploy/lxc/community-scripts/install/rackula-install.sh, deploy/lxc/community-scripts/ct/rackula.sh, mirrored copies in a local checkout of the ProxmoxVED fork (ggfevans/ProxmoxVED; clone path is workstation-specific)

Verify: diff the in-repo and fork copies byte for byte; gh pr view the upstream follow-up PR to confirm both files are included.

- [ ] Done when: rackula-install.sh and ct/rackula.sh changes are mirrored to the fork and the batched upstream PR is opened or updated.

### Task: #2065 feat: attach LXC tarball and SHA256 to release assets

Blockers: none. Coordinate with #2060: the rackula-install.sh fetch-path change rides the same single upstream ProxmoxVED PR.

Why this position: small CI change with no dependencies; gives LXC consumers a stable per-release artifact URL with integrity checking before the distribution pushes go out.

Scope: wire tarball + .sha256 upload into the existing release flow (release.yml, environment: prod) or extend the build-lxc workflow_run chain to upload on tag events. The .sha256 file is generated from the exact uploaded tarball in sha256sum -c format (hash, two spaces, filename), and CI verifies the checksum after upload by downloading the asset. Document or update the rackula-install.sh fetch path to prefer the release asset URL.

Key files: .github/workflows/release.yml, .github/workflows/build-lxc.yml, deploy/lxc/community-scripts/install/rackula-install.sh

Verify: npm run lint; on the next tagged release (or a workflow_dispatch dry run) confirm assets via gh release view <tag> --json assets and run sha256sum -c against the downloaded pair.

- [ ] Done when: tagged release assets include the LXC tarball and matching .sha256, CI verifies the checksum post-upload, and the install-script fetch path is documented or updated.

### Task: #2032 chore: self-host header and build-env parity guard

Blockers: none to start (the shared generator path); the CF _headers and wrangler-job assertions only become fully checkable once #2029 and #2134 introduce those deploy surfaces, so final AC sign-off trails Stage 2/3.

Why this position: the epic adds a deliberate prod/self-host divergence and the only parity guard today covers compose env vars; building the generator and CI checks now lets #2029/#2134 consume them instead of hand-rolling headers.

Scope: CI check (or a single generator emitting all three) that the prod CF _headers, dev CF _headers, deploy/security-headers.conf, and deploy/lxc/security-headers.conf agree on the script-src hash list (dev deltas: X-Robots-Tag, per-host HSTS; compare the hash list, not whole files). CI grep that self-host header files contain no analytics origins (cloudflareinsights). CI check that VITE_* build-args in deploy/Dockerfile and the env pinned in both wrangler deploy jobs agree, with an explicit allowlist of deliberate deltas. Extend scripts/lxc-smoke-test.sh: curl -I asserts CSP and X-Frame-Options on the LXC frontend; /version.json asserts version and non-empty commit. Keep the Docker/LXC form-action drift locked.

Key files: deploy/security-headers.conf, deploy/lxc/security-headers.conf, scripts/check-compose-persist-parity.sh, scripts/lxc-smoke-test.sh, deploy/Dockerfile, .github/workflows/deploy-dev.yml, .github/workflows/deploy-prod.yml

Verify: npm run lint; run the new parity script locally against the two committed .conf files; run scripts/lxc-smoke-test.sh against a local LXC or document the CI path; confirm the CI job fails on a deliberately divergent hash.

- [ ] Done when: CI fails on CSP hash-list divergence across the header sources, on analytics origins in self-host headers, and on undeclared build-env deltas; the LXC smoke test asserts headers and version/commit.

### Task: #2030 feat: Cloudflare Web Analytics (build-flag-gated beacon)

Blockers: none for the gating, build-output assertion, and backstop checks; the token-injection AC completes only when #2029's prod wrangler-deploy job exists, and the real-page-load CSP check runs against the live proxied domain post-cutover.

Why this position: the build-flag plumbing and self-host guarantees are in-repo work that can land now, so the prod cutover only has to add the token to its wrangler job.

Scope: gate the beacon on the presence of VITE_CF_ANALYTICS_TOKEN (empty/unset emits no beacon and no script tag); never gate on PROD/VITE_ENV. Token is injected only in the prod wrangler-deploy job; deploy/Dockerfile and build-lxc.yml never set it. Add a build-output assertion that self-host dist contains no cloudflareinsights/beacon string. Verify the real beacon endpoint on the proxied custom domain (likely same-origin /cdn-cgi/rum already covered by connect-src 'self') before adding any cloudflareinsights origin to the CF _headers CSP; keep those origins out of self-host CSP files (enforced by #2032's grep). Real-page-load check via the existing Playwright smoke harness. Backstop check that no VITE_UMAMI_* references remain in .github/workflows/. Privacy: cookieless, no persistent identifier; consult counsel on consent rather than asserting no banner is required.

Key files: deploy/Dockerfile, .github/workflows/build-lxc.yml, .github/workflows/deploy-prod.yml, e2e/playwright.smoke.config.ts, index.html (the Vite SPA entry at repo root, where the conditional script tag lands), deploy/security-headers.conf, deploy/lxc/security-headers.conf

Verify: npm run build with the token unset and grep dist/ for cloudflareinsights (must be absent); npm run build with a dummy token and confirm the tag appears; grep -r VITE_UMAMI .github/workflows/ returns nothing; npm run test:run; npm run lint; post-cutover, SMOKE_TEST_URL=https://count.racku.la npx playwright test -c e2e/playwright.smoke.config.ts confirms the beacon is not CSP-blocked.

- [ ] Done when: the beacon is presence-gated on VITE_CF_ANALYTICS_TOKEN, self-host builds are provably beacon-free, the token lives only in the prod wrangler job, and the live beacon loads without CSP errors.

### Task: #1011 test: Verify query string preservation through nginx API proxy

Blockers: none.

Why this position: small, self-contained verification task; closing it removes a stale doubt about the nginx proxy before the LXC and Unraid pushes lean on that config.

Scope: verify that the rewrite + proxy_pass path in deploy/nginx.conf.template preserves query strings for generic /api/ requests (the named auth locations already pass $is_args$args explicitly). Add test cases for GET /api/layouts?filter=foo and PUT /api/layouts/uuid?option=bar, document the expected behaviour in config comments, and make the handling explicit in proxy_pass only if testing shows loss or duplication.

Key files: deploy/nginx.conf.template, deploy/docker-compose.persist.yml, scripts/lxc-smoke-test.sh

Verify: docker compose --profile persist up -d; curl -v "http://localhost:8080/api/layouts?test=value" and confirm in API logs the query string arrived; repeat for a PUT; npm run lint.

- [ ] Done when: query-string preservation is tested for GET and PUT through the proxy, the expected behaviour is documented in the nginx config, and any needed explicit handling is applied.

## Stage 2: Dev cutover and previews (gated on M15 #2037, ideally #2041)

### Task: #2134 feat: dev cutover: d.racku.la re-point + deploy-dev rewrite

Blockers: #2133 (implementation), M15 #2037 (config injection is inert until it lands; per the audit, land after #2037 and ideally after #2041 so the soak observes deterministic server mode and the conflict path).

Why this position: this is the dev half of the VPS exit and the proving ground for the one-contract-two-runtimes API; it cannot meaningfully soak until the frontend reads explicit storage mode.

Scope: wrangler dev config (assets + run_worker_first ["/api/*"], workers_dev=false, preview_urls=false); overwrite dist/config.js with { storage: "server" } in the deploy step; dev _headers from the same generator/hash set as prod plus X-Robots-Tag and per-host HSTS. Required Cf-Access-Jwt-Assertion validation on /api/* in the Worker (jose createRemoteJWKSet, issuer + AUD) with host allowlist as secondary; rate limiting accepted-degraded per-isolate; quota via the driver. Rewrite deploy-dev.yml onto ubuntu-latest (npm ci + build with VITE_ENV=development and .git present, plain wrangler deploy, post-deploy smoke through Access with the service token, rollback via wrangler versions deploy, concurrency group, environment dev); drop the ghcr :main image jobs; rebuild the paths filter and drop deploy-dev.yml from compose-parity.yml's filter. Access service token + Service Auth policy on the existing d.racku.la app; DNS runbook (export the saved record before delete-then-attach; the saved record is the only rollback). Fresh dev data on CF storage; VPS dev data archived per #1986. Cleanup owned here: dev-hosting rows in CLAUDE.md, docs/reference/SPEC.md dev row, remove the dev .env CORS block. Cross-link #1997: its dev-side premises are superseded; Playwright against dev needs Access service-token headers.

Key files: .github/workflows/deploy-dev.yml, .github/workflows/compose-parity.yml, static/config.js, src/lib/utils/dev-build-toast.ts, CLAUDE.md, docs/reference/SPEC.md, api/src/index.ts, api/src/security/config.ts

Verify: cd api && bun test; npm run test:run; npm run lint; post-deploy: smoke green via service token (version.json version+commit, /api/layouts, asset content-type, headers by value); unauthenticated curl -I https://d.racku.la returns the Access 302; grep -r vps-rackula .github/workflows/ returns nothing in deploy-dev.yml.

- [ ] Done when: d.racku.la serves frontend+API from Workers, deploy-dev.yml has no vps-rackula reference, Access is verified on UI and /api, smoke including /api/layouts is green via service token, and the VPS is out of the dev serving path.

### Task: #2031 feat: per-PR preview deploys (frontend-only)

Blockers: none hard (independent of #2029 per epic #1984); needs the CF account/token bootstrap shared with the cutover work, so it slots naturally beside #2134.

Why this position: previews deploy to a separate assets-only preview Worker with no storage bindings, isolating the authless dev API from public preview URLs; the security ACs are already settled in the body.

Scope: per-PR preview URLs via wrangler versions upload (workers.dev only, not custom-domain; --preview-alias on newer wrangler for stable per-branch URLs). Trigger security: same-repo pull_request only (skip forks) or a privileged workflow_run job that never executes PR-authored code; never pull_request_target with the CF token in scope. Token reality: CF tokens cannot be scoped to a single Worker, so the dev/preview token can write rackula-prod; treat it as a prod-grade secret with the trigger model as the security boundary. Switch the dev indicator from the hostname allowlist in LogoLockup.svelte to the build-time flag (__BUILD_ENV__ / VITE_ENV) so it survives workers.dev hosts. The shipped browser-mode config.js default is correct for previews as-is. Acknowledge that public workers.dev preview URLs publish pre-merge builds; previews stay public-by-obscurity on an assets-only Worker rather than a second Access integration.

Key files: src/lib/components/LogoLockup.svelte, static/config.js, .github/workflows/ (new preview workflow), vite.config.ts

Verify: npm run test:run; npm run lint; npm run build; open a test PR and confirm a workers.dev preview URL is minted, shows the dev indicator, and serves browser-mode config.js; confirm the workflow does not trigger for fork PRs.

- [ ] Done when: same-repo PRs get a frontend-only workers.dev preview URL from an assets-only Worker, the trigger model excludes fork-authored code from token scope, and the dev indicator is build-flag driven.

## Stage 3: Prod cutover, soak, decommission (release-gated)

### Task: #2029 feat: prod cutover to Cloudflare Workers Static Assets

Blockers: #2028 (C1a) released: satisfied (closed, shipped in v26.6.x). Out-of-band one-time account actions before starting: register the *.workers.dev subdomain, create the rackula-prod Worker and CI account/token under the racku.la zone account, provision tokens knowing they are account-wide and prod-grade.

Why this position: second half of the cutover split, pure Cloudflare work; it rides a tagged release through the gated pipeline and starts the 7-day rollback soak that #1986 waits on.

Scope: wrangler.jsonc at repo root (assets ./dist/, single-page-application not_found_handling, pinned compatibility_date, no routes at bootstrap; the count.racku.la custom_domain route is added only at the attach step). _headers generated or copied into dist/ inside the wrangler step only, with .assetsignore; full security-header set under /* (CSP hash set from C1a, HSTS replicating the nginx value, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, cache rules). robots decision made; rm dist/login.html in the wrangler step and assert self-host dist still contains it. Prod build from the released tag with .git present so version.json.commit populates; VITE_ENV=production pinned; the analytics token is the only deliberate delta. deploy-prod.yml fully rewritten onto ubuntu-latest with no vps-rackula label. Deploy order: wrangler versions upload, full fail-closed smoke against the version preview URL, wrangler versions deploy, light re-check of count.racku.la; no percentage rollouts. Smoke asserts content types, version+commit, SPA fallback, and headers by value on three path classes. promote-prod needs [validate, promote-gate, promote-github]; no environment: prod on the wrangler job. Assert dist/config.js carries the browser-mode default before deploy. Bootstrap runbook executed out-of-band (zone snapshot, workers.dev validation, delete-record-then-attach touching only count.racku.la). Rollback runbook documented; VPS DNS fallback held until one green steady-state CF release and a 7-day no-regression soak. Cleanup: stale dev=GitHub-Pages claims fixed (CLAUDE.md Deployment section, docs/ARCHITECTURE.md, docs/reference/ARCHITECTURE.md, docs/guides/TESTING.md, docs/reference/SPEC.md, vite.config.ts comment, plus the extra files #2134 assigns here); compose-parity.yml and stale comments in trivy.yml, build-images.yml, rebuild-images.yml updated. Audit-added AC: define export/migration/sunset for existing server-saved layouts and snapshots on count.racku.la (notice window, export path, final backup artifact) before the flip, since prod goes static-only and #1986 later destroys the volumes.

Key files: .github/workflows/deploy-prod.yml, .github/workflows/release.yml, .github/workflows/compose-parity.yml, .github/workflows/trivy.yml, .github/workflows/build-images.yml, .github/workflows/rebuild-images.yml, vite.config.ts, static/config.js, CLAUDE.md, docs/ARCHITECTURE.md, docs/reference/ARCHITECTURE.md, docs/guides/TESTING.md, docs/reference/SPEC.md, e2e/playwright.smoke.config.ts

Verify: npm run build && npm run test:run && npm run lint; release dry run: smoke suite green against the version preview URL before promote; post-cutover curl -I https://count.racku.la asserts CSP/XFO/nosniff by value on /, a hashed asset, and an absent path; curl https://count.racku.la/version.json matches tag version and short commit; grep -r vps-rackula .github/workflows/deploy-prod.yml returns nothing.

- [ ] Done when: count.racku.la is served from Workers Static Assets via the gated release pipeline with fail-closed preview smoke, headers verified live by value, self-host builds unchanged, the user-data disposition plan is published, and the rollback runbook is documented.

### Task: #1986 chore: decommission the Linode VPS

Blockers: #2029 (prod cutover, plus one green steady-state CF release AND 7 days post-cutover with no user-visible regression), #2134 (no workflow references the vps-rackula runner label), epics #1984 and #1985 effectively complete.

Why this position: terminal task of the VPS-elimination arc; both gate conditions are explicit in the body and nothing here is reversible once the instance is destroyed.

Scope: confirm prod, dev, and analytics no longer touch the VPS. Final DNS cleanup (remove remaining VPS A/AAAA records). Archive /opt/rackula/rackula-dev/data and migrate or archive remaining volumes. Audit-added AC: verified disposition of the data volumes first; existing server-saved layouts and snapshots are exported/archived per #2029's transition plan (notice window elapsed, final backup taken and checked) before anything is destroyed. Remove the vps-rackula runner registration, power off and destroy the Linode instance, cancel billing, and update docs (CLAUDE.md deployment table, docs/deployment/SELF-HOSTING.md) to the new topology.

Key files: CLAUDE.md, docs/deployment/SELF-HOSTING.md, .github/workflows/ (verification only)

Verify: grep -r vps-rackula .github/workflows/ returns nothing; dig count.racku.la and dig d.racku.la resolve to Cloudflare only; final backup artifact exists and restores; Linode dashboard shows the instance destroyed and billing cancelled.

- [ ] Done when: the VPS is destroyed, billing stopped, no workflow or DNS record references it, and the data disposition is verified archived.

After #1986: close epic #1984 (its done-when is satisfied by #2029 + #2030 + #2031 + #2032), close #1985 (satisfied by #2134), then close epic #1983.

## Stage 4: Unraid distribution chain (epic #2008)

Ordering note: the brief's strict chain (#2010 -> #1317 -> #2009 -> #2011 -> #2012 -> #2013) conflicts with the issue bodies. #1317 consumes #2009's permissions decision and #2011's forum thread URL, and #2010's hosting AC needs #1317's files. Per the epic, run #2009, #2011, and #2010's repo creation in parallel first; #1317 follows; #2012 then #2013 close the chain.

### Task: #2009 feat: resolve /data volume permissions on Unraid (UID 1001 vs 99:100)

Blockers: none.

Why this position: the permissions decision is an input to the rackula-api template in #1317, so it must land before template authoring.

Scope: decide between option A (document a one-time chown -R 1001:1001 /mnt/user/appdata/rackula) and option B (LinuxServer-style PUID/PGID support in the API image entrypoint), documenting the rationale. If A: the template description and support thread state the UID and chown step. If B: the entrypoint honours PUID/PGID, templates expose them, defaults documented. Verify the API can create and write layouts under the mapped /data on a stock Unraid appdata share.

Key files: api/Dockerfile, docs/research/spike-1995-unraid-distribution.md, docs/research/1995-patterns.md

Verify: if B, docker run with PUID=99 PGID=100 and confirm file ownership under /data; either way, on Unraid (or a bind mount simulating 99:100 ownership) confirm layout create/write succeeds; cd api && bun test if entrypoint code changes.

- [ ] Done when: the A/B decision is documented with rationale, implemented or documented accordingly, and a write to mapped /data is verified on a stock-style appdata share.

### Task: #2011 chore: create Unraid forum support thread

Blockers: none (forum account in good standing already exists).

Why this position: the thread URL feeds the templates' Support field in #1317 and is a hard CA submission prerequisite.

Scope: create the Unraid forum support thread covering both containers (frontend + API), record the thread URL for the templates' Support field, and confirm the account owner will answer support requests (CA can delist unmaintained apps).

Key files: none in-repo (external forum); record the URL in epic #2008 and pass it to #1317.

Verify: thread URL resolves publicly; URL recorded on issue #2011 and epic #2008 before closing.

- [ ] Done when: the support thread is live, its URL is recorded for #1317, and ongoing ownership is confirmed.

### Task: #2010 chore: create RackulaLives/unraid-templates repo

Blockers: none for repo creation and README; the hosting AC (rackula.xml, rackula-api.xml with TemplateURL) completes after #1317 delivers the files.

Why this position: the repo shell and release wiring can stand up in parallel with the decision tasks so #1317 has a publish target ready.

Scope: create RackulaLives/unraid-templates; host rackula.xml and rackula-api.xml (authored in #1317), each with a TemplateURL pointing at its own raw GitHub URL; README documenting the templates and install order (frontend, then optional API); wire template image-tag bumps into the Rackula release process so the Apps-tab update prompt stays meaningful.

Key files: new repo RackulaLives/unraid-templates (external to this repo); .github/workflows/release.yml or the /release skill docs for the tag-bump wiring

Verify: gh repo view RackulaLives/unraid-templates; after #1317, curl the raw TemplateURL for both XML files; confirm the release process documents or automates the tag bump.

- [ ] Done when: the repo exists with README and release wiring, and (post-#1317) hosts both template XMLs with self-referencing TemplateURLs.

### Task: #1317 feat: author Unraid CA templates (rackula + rackula-api)

Blockers: #2009 (permissions decision consumed by the API template), #2011 (Support field references the thread URL). Publishes into #2010's repo.

Why this position: template authoring is the central artifact of the epic and needs both decision inputs; everything downstream (#2012, #2013) consumes it.

Scope: author rackula.xml (frontend) and rackula-api.xml (optional persistence/auth) following the annotated skeletons in docs/research/1995-patterns.md. Frontend template exposes WebUI port 8080, RACKULA_AUTH_MODE dropdown (default none), API_HOST/API_PORT, RACKULA_TRUST_PROXY (default false), API_WRITE_TOKEN (masked). API template exposes /data (default /mnt/user/appdata/rackula), masked secrets with no baked defaults (RACKULA_AUTH_SESSION_SECRET, passwords, write token), auth-mode dropdown. Both set Privileged false and pin a concrete image tag bumped by the release process. Guardrail text: auth=none is trusted-LAN only; trust-proxy behind reverse proxies; the API writes as UID 1001. Square HTTPS PNG icon at a stable raw-GitHub path (static/brand/logo-mark-512.png exists; host or reference a stable copy). OIDC-on-Unraid documentation is out of scope for the first listing.

Key files: docs/research/1995-patterns.md, docs/research/spike-1995-unraid-distribution.md, deploy/Dockerfile, api/Dockerfile, deploy/docker-compose.persist.yml, static/brand/logo-mark-512.png; output XML lives in RackulaLives/unraid-templates

Verify: XML validates against the CA template schema (load in a template editor or xmllint); secrets all carry Mask="true" with no defaults; image tags are concrete; Support URL matches #2011; icon URL returns a square PNG over HTTPS.

- [ ] Done when: both templates are authored per the skeletons with the security ACs satisfied, published to RackulaLives/unraid-templates, and referencing the #2011 thread and a hosted icon.

### Task: #2012 test: verify Rackula on stock Unraid (install + bridge DNS)

Blockers: #1317 (templates), #2009 (permissions decision).

Why this position: the spike flagged container-name DNS on stock bridge as an assumption that must be tested, not assumed; submission cannot proceed on an unverified happy path.

Scope: install the rackula frontend template on a stock Unraid system (WebUI reachable, app loads); install rackula-api (/data persists across container restart); confirm the frontend resolves the API by container name on the default bridge network, and if not, document a user-defined Docker network step in the templates README and support thread; verify auth=local login end to end (cookie/secure behaviour) on direct-LAN http.

Key files: templates in RackulaLives/unraid-templates; docs/research/spike-1995-unraid-distribution.md (assumption list)

Verify: manual checklist on real Unraid hardware or VM: WebUI loads, layout persists across API container restart, bridge DNS result recorded, auth=local login succeeds over http on the LAN.

- [ ] Done when: all five acceptance checks pass on stock Unraid (or the bridge-DNS workaround is documented), with results recorded on the issue.

### Task: #2013 feat: submit Rackula to Unraid Community Applications

Blockers: #1317, #2010, #2011, #2012. Labelled waiting-external: the moderation tail does not gate milestone closure.

Why this position: final, human-gated step of the epic; volunteer moderation takes days to weeks, so it runs as background once submitted.

Scope: confirm prerequisites (templates published, forum thread live, icon hosted); submit via the CA submission form (Apps tab moderation flow); track moderation to completion and address feedback; confirm Rackula appears in the Apps tab and installs one-click. Epic #2008 closes on acceptance.

Key files: none in-repo; submission references RackulaLives/unraid-templates and the #2011 thread.

Verify: submission confirmation recorded on the issue; once accepted, Rackula visible in the Apps tab and a one-click install succeeds.

- [ ] Done when: the submission is accepted, Rackula installs one-click from the Apps tab, and epic #2008 is closed.

## Background track (external, non-gating)

### Task: #2142 chore: track official inclusion in community-scripts/ProxmoxVE (upstream review)

Blockers: none in-repo; upstream PR #1897 merged into ProxmoxVED 2026-06-12. Remaining steps are upstream-paced. Labelled waiting-external.

Why this position: pure tracking; the only local actions are verification and recording links, plus shepherding the batched #2060/#2065 follow-up PR.

Scope: verify the script works from the merged VED entry (install + update paths, amd64 + arm64); watch promotion from ProxmoxVED to community-scripts/ProxmoxVE; when live, add the catalogue link to the Rackula README/docs and record the final merged PRs on the issue.

Key files: README.md, docs/deployment/SELF-HOSTING.md, deploy/lxc/community-scripts/ (parity reference)

Verify: run the VED install script in a test Proxmox VE environment (both arches if possible); gh pr view on the upstream PRs; catalogue listing URL resolves.

- [ ] Done when: Rackula appears in the official community-scripts/ProxmoxVE catalogue and the issue records the merged PRs and live link.

### Task: #2053 chore: update selfh.st icons to coffin mark

Blockers: none (#2048 closed; canonical geometry stable in static/brand/logo-mark.svg). Labelled waiting-external; epic #2054 closes with it.

Why this position: independent design chore against an upstream repo; merge timing is theirs.

Scope: regenerate the three SVG variants (rackula.svg, rackula-light.svg, rackula-dark.svg) from the canonical coffin geometry on the 512x512 canvas selfh.st expects; follow the selfhst/icons contribution process for updated icons (raster regeneration may be CI-side); open the upstream PR.

Key files: static/brand/logo-mark.svg, static/brand/logo-mark-mono-black.svg, static/brand/logo-mark-mono-white.svg; upstream clone /Users/gvns/code/3rd-party/icons/svg/rackula.svg, rackula-light.svg, rackula-dark.svg

Verify: SVGs render correctly at 512x512 in light and dark contexts; upstream PR opened and passing their checks; once merged, icons resolve on the selfh.st CDN.

- [ ] Done when: the upstream PR is merged and the coffin-mark icons are live on the selfh.st CDN, closing epic #2054.

## Verification

Milestone close-out checklist:

- [ ] All M02 issues closed except the waiting-external items (#2142, #2053, #2013) and their parent epics (#2008, #2054), which close when their externals land (check: gh issue list --milestone "M02 -- LXC Release & Stability" --state open returns only those five)
- [ ] Epic #1984 closed: count.racku.la on Workers Static Assets, headers verified by value, self-host builds unchanged (login.html present, beacon-free, three CSPs CI-guarded), analytics live, previews exist
- [ ] Epic #1985 closed: d.racku.la full stack on Workers, Access verified, smoke green via service token
- [ ] Epic #1983 closed: VPS destroyed, billing cancelled, no workflow or DNS reference remains
- [ ] 7-day post-cutover soak completed with no user-visible regression before #1986 executed; final data backup verified restorable
- [ ] Smoke checks: curl -I https://count.racku.la and https://d.racku.la assert CSP/XFO/nosniff by value; version.json on both matches the released tag and a non-empty commit; scripts/lxc-smoke-test.sh green
- [ ] Parity guards live in CI: header hash-list check, analytics-origin grep, build-env delta allowlist all fail on deliberate divergence
- [ ] Release assets: latest tag carries the LXC tarball + .sha256 and sha256sum -c passes
- [ ] Unraid: templates live in RackulaLives/unraid-templates, verified on stock Unraid, CA submission filed (#2013 tail tracked as waiting-external)
- [ ] Background track recorded: #2142 and #2053 carry current upstream status; they do not gate closure
