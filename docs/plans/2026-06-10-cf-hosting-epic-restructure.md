# Cloudflare Hosting Epic Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the GitHub epic restructure from the design spec Section 10: create milestone M00, close spike #1025, promote #1984 in place to the epic, create children C1a/C1b/C2/C3/C4, rewrite #1983, move issues, fix #1986.

**Architecture:** Pure GitHub-state mutations via the `gh` CLI; no repository file changes. Tasks follow the spec's no-dangling-artifact ordering with one deliberate deviation: child issues are created BEFORE #1984's body rewrite so the epic body can reference real issue numbers in one pass (a two-pass body edit is more error-prone than a minutes-long window where children reference a not-yet-promoted #1984). Child issue numbers are captured to `/tmp/cf-epic-children.env` because each Bash invocation is a fresh shell; the file persists across steps.

**Tech Stack:** `gh` CLI (issue/api subcommands), GitHub REST (milestones, sub-issues).

**Source spec:** `docs/superpowers/specs/2026-06-10-cloudflare-frontend-hosting-epic-design.md` (branch `spike/1025-research`), Section 10. Scope is ONLY the restructure mechanics; C1a implementation is a separate plan.

**Grounded state (verified 2026-06-10):**

| Artifact | Current state |
|----------|---------------|
| #1025 | OPEN, no milestone, labels chore/size:small/priority:low/spike, title "Spike: Evaluate rackula-api portability to Cloudflare Workers" |
| #1984 | OPEN, M03, labels area:container, title "feat: migrate prod (count.racku.la) to a Cloudflare Worker", body says "Part of epic #1983" and cites "#1025 (closed)" (stale: it is open) |
| #1983 | OPEN, M03, labels epic/area:container, body's Workstream 1 is the prod move |
| #1985 | OPEN, M02, labels devex/area:container |
| #1986 | OPEN, M03, labels area:container, title says "Vultr VPS" (wrong: Linode) |
| Milestones | M02=21, M03=22, Backlog=23; no M00. Pre-restructure burndown: M02 open:18 closed:45, M03 open:21 closed:0 |

---

### Task 1: Burndown snapshot comment on #1983

The spec (Section 10 item 7) wants the M02/M03 dip explainable. Post the pre-move snapshot where future readers will look.

**Files:** none (GitHub state only)

- [ ] **Step 1: Capture current burndown and post as a comment**

```bash
SNAP=$(gh api repos/RackulaLives/Rackula/milestones --paginate \
  --jq '.[] | select(.title | test("^M0[23]")) | "\(.title): open \(.open_issues), closed \(.closed_issues)"')
gh issue comment 1983 --repo RackulaLives/Rackula --body "$(cat <<EOF
Pre-M00 restructure burndown snapshot (issues about to move to the new M00 milestone, so M02/M03 counts will dip):

${SNAP}

Restructure: spec docs/superpowers/specs/2026-06-10-cloudflare-frontend-hosting-epic-design.md, Section 10.
EOF
)"
```

Expected: comment URL printed.

- [ ] **Step 2: Verify the comment exists**

Run: `gh issue view 1983 --repo RackulaLives/Rackula --comments | tail -20`
Expected: the snapshot comment is the latest.

---

### Task 2: Close #1025 as superseded

Spec Section 10 items 1-2. Retitle to record the rescope, post the conclusion, close.

**Files:** none

- [ ] **Step 1: Retitle #1025**

```bash
gh issue edit 1025 --repo RackulaLives/Rackula \
  --title "Spike: Evaluate rackula-api portability to Cloudflare Workers (rescoped: prod frontend hosting)"
```

Expected: issue URL printed.

- [ ] **Step 2: Post the spike conclusion comment**

```bash
gh issue comment 1025 --repo RackulaLives/Rackula --body "$(cat <<'EOF'
Spike conclusion. The question was rescoped mid-spike from "port rackula-api to Workers" to "host the prod FRONTEND on Cloudflare Workers Static Assets and retire the prod VPS tenant". The API stays out of scope: the solo-maintainer one-backend constraint defers R2/KV storage features to a future "rackula-api as a true single-contract API" epic. Runtime nuance: rackula-api cannot move to Workers as-is (native @node-rs/argon2, filesystem storage, Bun runtime).

Artifacts (branch spike/1025-research):

- Research synthesis: docs/research/spike-1025-cf-frontend-hosting.md
- Raw research: docs/research/1025-codebase.md, 1025-external.md, 1025-patterns.md, 1025-devils-advocate.md
- Epic design spec, three adversarial passes folded: docs/superpowers/specs/2026-06-10-cloudflare-frontend-hosting-epic-design.md
- Review handoff: docs/research/spike-1025-review-handoff.md

Key design outcomes: cutover split C1a (shared-source CSP/shim cleanup, ships via the VPS pipeline) then C1b (pure CF cutover); security headers re-homed to a deploy-time _headers file; preview-URL smoke before wrangler versions deploy; CF tokens are account-wide so workflow triggers are the security boundary; custom-domain attach is delete-record-then-attach with a negative-caching window.

Superseded by epic #1984 (Cloudflare frontend hosting), sibling of epic #1983 (VPS elimination).
EOF
)"
```

Expected: comment URL printed.

- [ ] **Step 3: Close #1025**

```bash
gh issue close 1025 --repo RackulaLives/Rackula --reason completed
```

Expected: "Closed issue #1025".

Note: GitHub has no "superseded" close reason. `completed` is the deliberate mapping (the spike's research did complete); the conclusion comment carries the superseded-by pointer.

---

### Task 3: Gate: verify #1025 is CLOSED

Spec Section 10 item 2: do not touch #1983's body while #1025 is open.

- [ ] **Step 1: Verify state**

Run: `gh issue view 1025 --repo RackulaLives/Rackula --json state --jq .state`
Expected output: `CLOSED`. If not CLOSED, STOP and fix Task 2 before continuing.

---

### Task 4: Create milestone M00

Spec Section 10 item 5. Sorts first by title per the 2026-06-08 milestone-sort-order spec; no Priority field, no board configuration.

- [ ] **Step 1: Create the milestone**

```bash
gh api -X POST repos/RackulaLives/Rackula/milestones \
  -f title="M00 -- VPS Retirement & Cloudflare Hosting" \
  -f description="Retire the production Linode VPS: prod frontend to Cloudflare Workers Static Assets (epic #1984), dev to the homelab (#1985), then decommission (#1986). Sorts first by title per the milestone sort-order spec." \
  --jq '"created milestone number \(.number): \(.title)"'
```

Expected: `created milestone number <N>: M00 -- VPS Retirement & Cloudflare Hosting`.

- [ ] **Step 2: Verify it sorts first by title**

Run: `gh api repos/RackulaLives/Rackula/milestones --paginate --jq '.[].title' | grep '^M' | sort | head -1`
Expected output: `M00 -- VPS Retirement & Cloudflare Hosting`. (The open "Backlog" milestone sorts before "M00" in a plain sort, hence the `grep '^M'`; title-sort placement only matters among the M-prefixed milestones.)

---

### Task 5: Create the five child issues

Spec Section 10 item 6 (content from spec Sections 4-7). One step creates all five and records their numbers in `/tmp/cf-epic-children.env` for later tasks. All go straight into M00.

- [ ] **Step 1: Create C1a**

```bash
C1A=$(gh issue create --repo RackulaLives/Rackula \
  --title "chore: shared-source cleanup for the CF cutover (CSP hashes, GH-Pages shim, APP_COMMIT)" \
  --label "chore,area:container,size:medium" \
  --milestone "M00 -- VPS Retirement & Cloudflare Hosting" \
  --body "$(cat <<'EOF'
Part of epic #1984. First half of the prod cutover split (DA pass 3): shared-source edits ship through the existing VPS release pipeline and are verified live on nginx before the Cloudflare cutover (C1b) depends on them. No Cloudflare changes in this issue.

Spec: docs/superpowers/specs/2026-06-10-cloudflare-frontend-hosting-epic-design.md (Section 4, C1a), branch spike/1025-research.

## Acceptance criteria

- [ ] index.html GitHub-Pages sessionStorage redirect shim deleted; static/404.html deleted (both nginx configs serve SPA deep links via try_files; the shim is dead code on the VPS path)
- [ ] Remaining inline-script CSP hashes re-derived and mirrored into BOTH deploy/security-headers.conf and deploy/lxc/security-headers.conf
- [ ] form-action drift reconciled (Docker conf is missing it; LXC has it)
- [ ] Unknown-hash investigation: identify the origin of the second pinned hash sha256-yei5Fza... ("Dynamic inline script in bundled JS"). Build dist/, grep output HTML for inline scripts with no src. Only tighten script-src toward 'self' once no build-emitted inline script remains, or pin an auto-derived hash computed from dist/ at build time. Do not drop a hash whose script is not proven gone.
- [ ] APP_COMMIT build-arg added to deploy/Dockerfile (mirroring api/Dockerfile), wired through build-images.yml and build-lxc.yml, so self-host version.json.commit is populated in vite's short-hash format
- [ ] Dead VITE_PERSIST_ENABLED build-arg removed from deploy/Dockerfile, and dead VITE_PERSIST_ENABLED and VITE_UMAMI_* assignments removed from build-images.yml, rebuild-images.yml, build-lxc.yml, build-lxc-dev.yml, deploy-dev.yml (persist flag: app uses runtime detection, src/lib/stores/persistence.svelte.ts; Umami was removed in #1970)
- [ ] Shipped in a normal release and verified live: CSP on count.racku.la matches the new hash set; LXC gate passes

Blocks C1b: the cutover assumes these shared-source changes are already released.
EOF
)" | awk -F/ '{print $NF}')
[ -n "$C1A" ] || { echo "C1A create failed; STOP"; exit 1; }

C1B=$(gh issue create --repo RackulaLives/Rackula \
  --title "feat: prod cutover to Cloudflare Workers Static Assets" \
  --label "feature,area:container,size:large" \
  --milestone "M00 -- VPS Retirement & Cloudflare Hosting" \
  --body "$(cat <<EOF
Part of epic #1984. Second half of the cutover split: pure Cloudflare work. Depends on C1a (#${C1A}) being RELEASED first.

Spec: docs/superpowers/specs/2026-06-10-cloudflare-frontend-hosting-epic-design.md (Section 4, C1b), branch spike/1025-research.

## Out-of-band prerequisites (one-time account actions, before starting)

- [ ] Register the account *.workers.dev subdomain (dashboard, permanent); rollback runbook, per-release preview-URL smoke, and workers.dev validation all depend on it
- [ ] Create the rackula-prod Worker and CI CLOUDFLARE_ACCOUNT_ID/token under the SAME account as the racku.la zone
- [ ] Provision tokens knowing CF tokens cannot be scoped per-Worker (Workers Scripts permission is account-wide); both prod and dev tokens are prod-grade secrets; prod token sits behind the promote-gate approval

## Acceptance criteria

- [ ] wrangler.jsonc at repo root: assets ./dist/, not_found_handling single-page-application, pinned compatibility_date; NO routes at bootstrap (a committed custom_domain route would attach the domain on the first deploy, before validation); the routes entry ({ pattern: count.racku.la, custom_domain: true }) is added only at the attach step and the domain is config-managed thereafter (no mixed dashboard/config management)
- [ ] _headers generated or copied into dist/ inside the wrangler step only (never committed to static/); .assetsignore so Workers parses _headers without serving it
- [ ] Security headers in _headers under /*: CSP (hash set from C1a), HSTS from _headers replicating the nginx value (max-age=31536000; includeSubDomains), no preload, NOT the zone-level setting (which hits every proxied hostname in the zone), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy; Cache-Control immutable for /assets/*, no-cache for index.html and version.json
- [ ] robots decision made: prod-only Disallow: /login injected in the wrangler step (same mechanism as _headers, since robots.txt is publicDir-shared), or the shared allow-all robots.txt kept consciously and documented
- [ ] rm dist/login.html in the wrangler step (not by branching vite rollupOptions.input, which would fork the gated artifact and risk stripping login.html from Docker/LXC); assert the self-host dist still contains login.html; document that /login on prod resolves to the SPA shell
- [ ] Prod build: wrangler job runs npm ci && npm run build after checking out the released tag with .git present (so vite getGitInfo() populates version.json.commit; the Docker build ships commit="" because .dockerignore strips .git); expected commit derived with git rev-parse --short HEAD to match vite's short format; VITE_ENV=production pinned explicitly (the C2 analytics token is the only deliberate delta vs the gated Docker build)
- [ ] deploy-prod.yml fully rewritten onto ubuntu-latest; no vps-rackula label anywhere in it
- [ ] Deploy order each release: wrangler versions upload, FULL fail-closed smoke against the version preview URL, then wrangler versions deploy, then a light re-check of count.racku.la. No percentage gradual rollouts (documented mixed-version asset 404 hazard)
- [ ] Smoke asserts: hashed entry-point JS returns 200 with application/javascript (reject text/html fallback); version.json matches version AND commit (cache-buster); absent path returns the SPA shell; CSP, X-Frame-Options, nosniff asserted by VALUE on /, on a real hashed asset under /assets/*, and on a known-absent path; the existing Playwright smoke harness (e2e/playwright.smoke.config.ts, SMOKE_TEST_URL) used where a real page load beats curl
- [ ] promote-prod needs [validate, promote-gate, promote-github]; the transitive promote-docker coupling via promote-github is documented as accepted; no environment: prod on the wrangler job (double-approval papercut)
- [ ] Bootstrap runbook executed out-of-band: full racku.la zone snapshot; workers.dev validation; delete-record-then-attach back-to-back (no API override exists; check the SOA negative TTL first; quiet window); cutover touches ONLY the count.racku.la record (apex A/AAAA, MX, SPF/DKIM/DMARC untouched; d.racku.la belongs to C3/#1985); saved record kept for rollback; optional dry-run on cf.racku.la; the bootstrap itself needs no changelog, but the first tagged release after cutover needs a normal CHANGELOG entry and version bump like any release
- [ ] Rollback runbook documented: wrangler versions deploy <last-good-id> (dispatch workflow with own concurrency group); VPS DNS fallback held until one green steady-state CF release AND a 7-day no-regression soak
- [ ] Cleanup: stale dev=GitHub-Pages claims fixed (CLAUDE.md, docs/ARCHITECTURE.md, vite.config.ts VITE_BASE_PATH comment); CLAUDE.md Deployment prod row and current-milestones list updated; compose-parity.yml paths filter drops deploy-prod.yml; stale deploy-prod comments updated in trivy.yml, build-images.yml, rebuild-images.yml
EOF
)" | awk -F/ '{print $NF}')
[ -n "$C1B" ] || { echo "C1B create failed; STOP"; exit 1; }

C2N=$(gh issue create --repo RackulaLives/Rackula \
  --title "feat: Cloudflare Web Analytics (build-flag-gated beacon)" \
  --label "feature,size:small" \
  --milestone "M00 -- VPS Retirement & Cloudflare Hosting" \
  --body "$(cat <<'EOF'
Part of epic #1984. Free cookieless analytics on prod. Build-flag-gated so self-host builds never carry the beacon.

Spec: docs/superpowers/specs/2026-06-10-cloudflare-frontend-hosting-epic-design.md (Section 5), branch spike/1025-research.

## Acceptance criteria

- [ ] Beacon gated on the PRESENCE of VITE_CF_ANALYTICS_TOKEN (empty/unset emits no beacon and no script tag); never gated on PROD/VITE_ENV (both are true for self-host production builds)
- [ ] Token injected only in the wrangler-deploy job; deploy/Dockerfile and build-lxc.yml never set it
- [ ] Build-output assertion: self-host dist contains no cloudflareinsights/beacon string
- [ ] CSP: verify the real beacon endpoint on the proxied custom domain (likely same-origin /cdn-cgi/rum, already covered by connect-src 'self'); only add cloudflareinsights origins to the CF _headers CSP if the beacon truly loads or posts cross-origin; keep those origins out of the self-host CSP files (enforced by C4's grep)
- [ ] Real-page-load check that the beacon fetch is not CSP-blocked, via the existing Playwright smoke harness (e2e/playwright.smoke.config.ts with SMOKE_TEST_URL)
- [ ] Verify no VITE_UMAMI_* references remain in .github/workflows/ (removal across the five build workflows is owned by C1a's dead-build-arg cleanup; this AC is the backstop check)
- [ ] Privacy: cookieless, no persistent identifier; consult counsel on consent rather than asserting no banner is required
EOF
)" | awk -F/ '{print $NF}')
[ -n "$C2N" ] || { echo "C2N create failed; STOP"; exit 1; }

C3N=$(gh issue create --repo RackulaLives/Rackula \
  --title "feat: Cloudflare dev/preview frontend environment" \
  --label "devex,area:container,size:small" \
  --milestone "M00 -- VPS Retirement & Cloudflare Hosting" \
  --body "$(cat <<'EOF'
Part of epic #1984. A rackula-dev Worker hosts the dev frontend, replacing the VPS-hosted dev frontend. Interlocks with #1985 (dev API to the homelab).

Spec: docs/superpowers/specs/2026-06-10-cloudflare-frontend-hosting-epic-design.md (Section 6), branch spike/1025-research.

## Acceptance criteria

- [ ] rackula-dev Worker (its own wrangler env/config) serves the dev frontend
- [ ] Per-PR preview URLs via wrangler versions upload (version preview URLs; --preview-alias on newer wrangler for stable per-branch URLs); workers.dev only, not custom-domain. Managed branch aliases are a Workers Builds feature, not available from GitHub Actions
- [ ] Preview workflow security: pull_request from same-repo branches only (skip forks), or a privileged workflow_run job that never executes PR-authored code; never pull_request_target with the CF token in scope
- [ ] Token reality acknowledged: CF tokens cannot be scoped to a single Worker (account-wide Workers Scripts permission), so the dev/preview token can also write rackula-prod; treat it as a prod-grade secret; the trigger model is the security boundary
- [ ] Dev indicator switched from the hostname allowlist (LogoLockup.svelte: hostname === 'd.racku.la') to the build-time flag (__BUILD_ENV__ / VITE_ENV, already set to development in deploy-dev.yml; EnvironmentBadge.svelte shows the existing pattern), so the indicator survives the host change
- [ ] ONE documented cross-origin model to the homelab dev API: (a) workers.dev dev frontend plus a CORS-opened homelab API, or (b) a Cloudflare Worker reverse-proxying /api to the homelab; the new cross-origin/tunnel surface acknowledged
- [ ] HSTS includeSubDomains coordination with C1b for whatever d.racku.la exposure this chooses
- [ ] Acknowledged: minting public workers.dev preview URLs publishes pre-merge, unreviewed builds
EOF
)" | awk -F/ '{print $NF}')
[ -n "$C3N" ] || { echo "C3N create failed; STOP"; exit 1; }

C4N=$(gh issue create --repo RackulaLives/Rackula \
  --title "chore: self-host header and build-env parity guard" \
  --label "ci,area:container,size:small" \
  --milestone "M00 -- VPS Retirement & Cloudflare Hosting" \
  --body "$(cat <<'EOF'
Part of epic #1984. The epic adds a fourth deploy surface (the CF _headers) and a deliberate prod/self-host divergence; the only parity guard today (scripts/check-compose-persist-parity.sh) covers compose env vars only. This closes the gap.

Spec: docs/superpowers/specs/2026-06-10-cloudflare-frontend-hosting-epic-design.md (Section 7), branch spike/1025-research.

## Acceptance criteria

- [ ] CI check that the three CSPs agree on the script-src hash list: the CF _headers generated at deploy, deploy/security-headers.conf, deploy/lxc/security-headers.conf; fail on divergence. A single generator that emits all three is acceptable in lieu of a checker. Grep the exact source paths
- [ ] CI grep: the self-host header files contain no analytics origins (cloudflareinsights)
- [ ] CI check that the VITE_* build-args declared in deploy/Dockerfile and the env pinned in the wrangler deploy job agree (the version+commit assertion cannot detect build-env drift)
- [ ] scripts/lxc-smoke-test.sh extended: curl -I asserts Content-Security-Policy and X-Frame-Options present on the LXC frontend; curl /version.json asserts the version (reusing C1b's assertion) and a non-empty commit (APP_COMMIT parity from C1a)
- [ ] Docker/LXC form-action drift locked (reconciled in C1a; the checker keeps it locked)
EOF
)" | awk -F/ '{print $NF}')
[ -n "$C4N" ] || { echo "C4N create failed; STOP"; exit 1; }

cat > /tmp/cf-epic-children.env <<EOF
C1A=${C1A}
C1B=${C1B}
C2N=${C2N}
C3N=${C3N}
C4N=${C4N}
EOF
cat /tmp/cf-epic-children.env
```

Expected: five issue numbers printed as `C1A=<n>` .. `C4N=<n>`, all non-empty.

- [ ] **Step 2: Verify all five exist in M00**

```bash
gh issue list --repo RackulaLives/Rackula --milestone "M00 -- VPS Retirement & Cloudflare Hosting" --state open
```

Expected: the five new issues listed (and nothing else yet).

---

### Task 6: Promote #1984 in place to the epic

Spec Section 10 item 3. Retitle, rewrite the body with the real child numbers, add the epic label, move to M00. Number, links, and history survive because the issue is edited, not recreated.

- [ ] **Step 1: Rewrite #1984**

```bash
source /tmp/cf-epic-children.env
[ -n "$C1A" ] && [ -n "$C1B" ] && [ -n "$C2N" ] && [ -n "$C3N" ] && [ -n "$C4N" ] || { echo "missing child numbers; STOP"; exit 1; }
gh issue edit 1984 --repo RackulaLives/Rackula \
  --title "Epic: Cloudflare frontend hosting (prod -> Workers Static Assets)" \
  --add-label "epic" \
  --milestone "M00 -- VPS Retirement & Cloudflare Hosting" \
  --body "$(cat <<EOF
Host the Rackula production frontend (count.racku.la) on Cloudflare Workers Static Assets, retiring the production Linode VPS tenant at near-zero cost, without losing the security response-header posture nginx provides today, and without breaking the Docker/LXC self-host story.

Sibling of epic #1983 (eliminate the VPS) and feeds it: #1986 (decommission) is blocked by this epic plus #1985 (dev to homelab).

Prod already serves a no-API static bundle, so this is a static-origin cutover, not a rewrite. The hard parts are the release-pipeline cutover, re-homing the security headers, and preserving self-host parity.

Spike: #1025 (closed, superseded by this epic).
Design spec (three adversarial passes folded): docs/superpowers/specs/2026-06-10-cloudflare-frontend-hosting-epic-design.md (branch spike/1025-research).
Research: docs/research/spike-1025-cf-frontend-hosting.md.

## Children

- [ ] #${C1A} C1a: shared-source cleanup (CSP hashes, GH-Pages shim, APP_COMMIT); ships via the VPS pipeline first
- [ ] #${C1B} C1b: prod cutover to Workers Static Assets
- [ ] #${C2N} C2: Cloudflare Web Analytics
- [ ] #${C3N} C3: Cloudflare dev/preview frontend environment
- [ ] #${C4N} C4: self-host header and build-env parity guard

Sequencing: C1a strictly before C1b. C2 and C4 follow C1b (C4 lands close to C1b, which introduces the third CSP it guards). C3 is independent of C1b but coordinates HSTS scope and interlocks with #1985.

## Done when (self-contained; VPS power-off stays with #1983/#1986)

- count.racku.la served from Workers Static Assets
- Release pipeline promotes prod via wrangler versions, with the full smoke run against the version preview URL before traffic shifts; the VPS runner is out of the prod path
- Security headers verified live on prod by value, on multiple paths
- Self-host builds unchanged: login.html present, beacon-free, the three CSPs aligned and CI-guarded
- Analytics live on prod; the Cloudflare dev/preview env exists

## Out of scope

- rackula-api hosting (unchanged; dev API to homelab is #1985)
- R2 image hosting and KV share links: deferred to a future "rackula-api as a true single-contract API" epic (solo-maintainer one-backend constraint)
- VPS decommission (#1986, owned by #1983)
EOF
)"
```

Expected: issue URL printed.

- [ ] **Step 2: Verify the promotion**

```bash
gh issue view 1984 --repo RackulaLives/Rackula --json title,milestone,labels --jq '{title,milestone:.milestone.title,labels:[.labels[].name]}'
```

Expected: title starts with "Epic:", milestone is M00, labels include `epic` and `area:container`.

---

### Task 7: Link children as native sub-issues of #1984

Best-effort: gives board/issue-page progress rollup. The REST sub-issues endpoint needs numeric issue ids, not issue numbers. If the API returns an error (feature gating), the task-list in #1984's body already tracks the children; note the failure and continue.

- [ ] **Step 1: Add the five sub-issue links**

```bash
source /tmp/cf-epic-children.env
[ -n "$C1A" ] && [ -n "$C1B" ] && [ -n "$C2N" ] && [ -n "$C3N" ] && [ -n "$C4N" ] || { echo "missing child numbers; STOP"; exit 1; }
for N in $C1A $C1B $C2N $C3N $C4N; do
  ID=$(gh api repos/RackulaLives/Rackula/issues/$N --jq .id)
  gh api -X POST repos/RackulaLives/Rackula/issues/1984/sub_issues -F sub_issue_id=$ID \
    --jq '"linked #'"$N"' as sub-issue"' || echo "sub-issue link failed for #$N (non-fatal)"
done
```

Expected: five `linked #<n> as sub-issue` lines (or non-fatal failure notes).

---

### Task 8: Rewrite #1983 as the decommission-arc epic

Spec Section 10 item 4: remove Workstream 1 (now owned by #1984), delegate the prod outcome, reconcile the runner-teardown split.

- [ ] **Step 1: Rewrite the body**

```bash
gh issue edit 1983 --repo RackulaLives/Rackula --body "$(cat <<'EOF'
## Goal

Eliminate the Linode VPS (~5 USD/mo) by moving its two remaining Rackula tenants off it, then decommissioning it. The prod move is owned by sibling epic #1984 (Cloudflare frontend hosting); this epic keeps the dev move and the decommission arc.

## Current VPS tenants

| Component | Today | Destination | Owner |
|-----------|-------|-------------|-------|
| prod (count.racku.la) | Linode VPS, Docker + nginx, static frontend only | Cloudflare Workers Static Assets | epic #1984 |
| dev (d.racku.la) | Linode VPS, Docker, frontend + rackula-api (persist) | Homelab self-hosted | #1985 |
| Analytics (Umami) | removed (#1970, done) | n/a | done |
| Reverse proxy (Caddy) | Linode VPS | removed with the VPS | #1986 |

## Workstreams

1. Prod to Cloudflare: delegated to epic #1984 (children C1a/C1b/C2/C3/C4).
2. #1985: move dev (d.racku.la) to the homelab, including a replacement dev runner/deploy path.
3. #1986: decommission the Linode VPS once 1 and 2 are done.

## Runner teardown split

- Epic #1984 (C1b) swaps PROD off the vps-rackula runner.
- deploy-dev.yml still uses vps-rackula until #1985 provisions the replacement.
- #1986 removes the runner, gated on: no workflow references the vps-rackula runner label.

## Prior art

- #1022 Epic: Infrastructure Migration (closed; evaluation, superseded by this execution epic)
- #1025 Spike (closed): rescoped to frontend hosting; produced the #1984 epic design
  (docs/superpowers/specs/2026-06-10-cloudflare-frontend-hosting-epic-design.md)
- #1023 Spike: Cloudflare Pages deployment research (closed)
- #820 (open) Cloudflare Workers URL shortener: related feature, deferred to the future true-API epic per the design spec

## Done when

- count.racku.la served from Cloudflare (epic #1984 done-when)
- d.racku.la served from the homelab (#1985)
- The Linode VPS is powered off and destroyed; no workflow or DNS record references it (#1986)
EOF
)"
```

Expected: issue URL printed.

- [ ] **Step 2: Verify Workstream 1 is delegated**

Run: `gh issue view 1983 --repo RackulaLives/Rackula --json body --jq .body | grep -n "delegated to epic #1984"`
Expected: one matching line.

---

### Task 9: Move #1983 and #1985 to M00

Spec Section 10 item 7 (#1984 moved in Task 6; #1986 moves in Task 10; children were created in M00).

- [ ] **Step 1: Move both issues**

```bash
gh issue edit 1983 --repo RackulaLives/Rackula --milestone "M00 -- VPS Retirement & Cloudflare Hosting"
gh issue edit 1985 --repo RackulaLives/Rackula --milestone "M00 -- VPS Retirement & Cloudflare Hosting"
```

Expected: two issue URLs printed.

---

### Task 10: Fix #1986 (title, blocked-by mechanism, milestone)

Spec Section 10 item 8: the title says "Vultr" but the VPS is Linode; add the explicit gate condition and the rollback-window condition from the spec.

- [ ] **Step 1: Retitle, rewrite body, move to M00**

```bash
gh issue edit 1986 --repo RackulaLives/Rackula \
  --title "chore: decommission the Linode VPS" \
  --milestone "M00 -- VPS Retirement & Cloudflare Hosting" \
  --body "$(cat <<'EOF'
Part of epic #1983. Blocked by epic #1984 (prod to Cloudflare) AND #1985 (dev to homelab).

Concrete gate conditions, both required before starting:

- No workflow references the vps-rackula runner label (deploy-dev.yml uses it until #1985 provisions a replacement dev runner/deploy path).
- The C1b rollback window has elapsed: at least one green steady-state CF release has shipped AND 7 days have passed since cutover with no user-visible regression. Until then the VPS prod container is the DNS-fallback rollback and must stay running and untouched.

## Scope

- Confirm prod (count.racku.la), dev (d.racku.la), and analytics no longer touch the VPS.
- Final DNS cleanup (remove VPS A/AAAA records; confirm Cloudflare/homelab targets).
- Migrate or archive any remaining data/volumes from the VPS.
- Remove the vps-rackula self-hosted GitHub Actions runner registration.
- Power off and destroy the Linode instance. Cancel billing.
- Update docs (deployment table in CLAUDE.md, SELF-HOSTING) to reflect the new topology.

## Done when

- The VPS is destroyed, billing stopped, and no workflow or DNS record references it.
EOF
)"
```

Expected: issue URL printed.

- [ ] **Step 2: Verify**

Run: `gh issue view 1986 --repo RackulaLives/Rackula --json title,milestone --jq '{title,milestone:.milestone.title}'`
Expected: title `chore: decommission the Linode VPS`, milestone M00.

---

### Task 11: Final verification sweep

Every spec Section 10 item, checked end-to-end.

- [ ] **Step 1: Run the sweep**

```bash
echo "--- #1025 state (want CLOSED) ---"
gh issue view 1025 --repo RackulaLives/Rackula --json state --jq .state
echo "--- M00 contents (want #1983 #1984 #1985 #1986 + 5 children = 9 open) ---"
gh issue list --repo RackulaLives/Rackula --milestone "M00 -- VPS Retirement & Cloudflare Hosting" --state open
echo "--- #1984 (want Epic title, epic label, M00) ---"
gh issue view 1984 --repo RackulaLives/Rackula --json title,milestone,labels --jq '{title,milestone:.milestone.title,labels:[.labels[].name]}'
echo "--- #1986 title (want Linode) ---"
gh issue view 1986 --repo RackulaLives/Rackula --json title --jq .title
echo "--- #1983 body delegates prod (want a match) ---"
gh issue view 1983 --repo RackulaLives/Rackula --json body --jq .body | grep -c "delegated to epic #1984"
```

Expected: CLOSED; nine open issues in M00; Epic title with epic label in M00; Linode title; grep count 1.

- [ ] **Step 2: Clean up the temp file**

Run: `rm -f /tmp/cf-epic-children.env`

---

## Not in this plan (deliberate)

- C1a implementation: next plan, after this restructure lands.
- Project-board Status placement (Backlog/Next Up) for the new issues: normal triage flow, not Section 10.
- The out-of-band Cloudflare account actions (workers.dev registration, token provisioning): C1b prerequisites, executed when C1b starts.
- CLAUDE.md milestone-list/Deployment-table edits: owned by C1b's cleanup AC, not the restructure.
