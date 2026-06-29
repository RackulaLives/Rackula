# M018 Cloudflare Migration: Sequenced Plan (dev-first)

- Date: 2026-06-29
- Status: Planning review (no issues or code changed by this pass)
- Milestone: M018 - cloudflare migration (GitHub milestone #40)
- Verification basis: branch `claude/cloudflare-m018-plan-review-b3cg8k` at `c3ee259` (main)

## Strategy

Stand up a Cloudflare dev testing environment first (d.racku.la on a Worker behind Cloudflare Access), smoketest every vertical slice against it as it is built, then cut over prod, then decommission the Linode VPS. The dev Worker is the proving ground for the two genuinely novel pieces of this migration: the R2 storage driver and the argon2-free Workers bundle. Nothing customer-facing flips until those mechanics are proven on dev.

## The one hard gate

`@node-rs/argon2` is a native (Rust/NAPI) module. It does not run on Cloudflare Workers. It is imported in exactly one file, `api/src/local-auth.ts:1`, reached statically from `api/src/app.ts:38`. Until that static import chain is broken (dynamic import gated on `AUTH_MODE`, with dev running `AUTH_MODE=none` behind Access), no Worker bundle compiles at all. That work is issue #2626, and it sits behind the storage spine (#2624 -> #2625). Everything deployable in the milestone is downstream of it.

## Current state of the milestone

Thirteen open issues, confirmed as the full open M018 set. One slice is in flight:

- PR #2636 implements #2624 (storage driver interface + per-request DI seam, slice 1 of #2133). It is a behaviour-preserving refactor (+256/-35, 8 files), CodeRabbit approved, red only on an unrelated/flaky frontend e2e suite (responsive layout, brand logo, device library FAB; none touch the API or storage). It is not yet merged to main.

Nothing else has started. There is no `wrangler.*`, no `worker.ts`, no `_headers`, no R2 binding, no `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` in any workflow, and no scheduled cron targeting count.racku.la or d.racku.la. Both `deploy-dev.yml` and `deploy-prod.yml` still pin the `[self-hosted, vps-rackula]` runner.

Related but out of scope: #2028 (C1a, CSP hash removal) and #2132 (portability spike) are closed. #2031 (per-PR preview deploys) is referenced by epic #1984 but currently has no milestone (hygiene gap, set it to M018). Epic #2365 (Hosted Cloud Sync and Auth) builds the multi-tenant layer on top of this migration and stays separate.

---

## 1. Epic reconciliation: single source of truth

The three epics are not redundant peers. They are a correctly wired three-node containment tree: #2382 contains {#1983, #1984}, and #1983 contains {#1985, #1986}. The "overlap" smell comes entirely from #1983's body restating #1984's prod cutover instead of pointing at it. Keep all three. Do not close, merge, or duplicate any epic.

| Epic | Role | Owns exclusively |
| --- | --- | --- |
| #2382 | Umbrella / milestone tracker | Migration thesis, dev-Worker-first sequencing, the boundary versus auth/sync epic #2365, top-level done-when. No leaf work. |
| #1983 | Dev-move plus decommission execution | The dev tenant move (#1985 arc) and VPS teardown (#1986). Prod is a one-line pointer to #1984. |
| #1984 | Prod frontend execution | Prod frontend cutover to Workers Static Assets and its satellites (#2028 done, #2029, #2030, #2031, #2032). Nothing dev, nothing API/R2, nothing teardown. |

The one structural overlap to remove: #1983 carries a "Current VPS tenants" table and a prod row that restates #1984 wholesale. Trim that row to a pointer ("Prod frontend to Workers Static Assets: epic #1984"). No content moves between epics; #1983 just stops paraphrasing #1984.

Epic hygiene to fix (recommendations only):

- #2382 carries no labels. Add `epic` (and `area:container` to match siblings).
- #2133 is typed Feature but functions as an epic. Convert to Epic and attach #2624/#2625/#2626 as formal GitHub sub-issues (today they are prose-linked "Part of #2133" only, so the board rollup is dead). This is the one place the sub-issue link is genuinely missing; the #2382/#1983 spine is already wired in GitHub.
- #1983's pinned comment (id 4646062453) describes #1985 as "dev to local self-hosted (homelab)". That contradicts the body and #1985 (dev to Cloudflare Workers). Correct or delete it; it would actively mislead a picker-upper.

Per-issue verdict against the epics: every other open issue is keep (no duplicates to merge). Issue #2365 stays a separate milestone.

---

## 2. Issues at a glance

Blockers below list open dependencies only (closed prerequisites such as #2028 are already satisfied). Smoketest column is the headline check; full commands are in the appendix.

| # | Title | Type | Ready? | Open blockers | Smoketest (headline) |
| --- | --- | --- | --- | --- | --- |
| #2624 | Storage driver interface + per-request DI seam (slice 1) | Feature | Needs-work (AC trim) | none (PR #2636 in review) | `cd api && bun test` green incl. injection test through stub `StorageDriver` |
| #2625 | R2 storage driver + runner-agnostic contract harness (slice 2) | Feature | Blocked | #2624 | `runStorageContract` green under miniflare R2 and under bun (FS) |
| #2626 | Workers entry + argon2-free bundle (slice 3) | Feature | Blocked | #2625 | Bundle grep finds zero `@node-rs/argon2` and zero `node:fs`; `wrangler dev` serves `/api/version` 200 |
| #2133 | Workers entry + CF storage driver for rackula-api | Epic (typed Feature) | Tracker | #2624, #2625, #2626 | Conjunction of the three slices |
| #2134 | Dev cutover: d.racku.la re-point + deploy-dev rewrite | Feature | Blocked (over-scoped) | #2626, headers generator, CF provisioning | Unauth `d.racku.la/api/layouts` returns Access 302; authed returns 200 JSON from the Worker |
| #1985 | Move dev (d.racku.la) full stack to Workers | Feature | Tracker | #2133, #2134 | Whole dev-arc gate (see #2134 smoketest) |
| #2029 | Prod cutover to Workers Static Assets | Feature | Needs-work | CF provisioning; DNS flip gated on dev proven | `wrangler versions upload` preview URL passes smoke; headers by value; then `versions deploy` |
| #2030 | Cloudflare Web Analytics (build-flag-gated beacon) | Feature | Blocked | #2029 | Build without token: no `cloudflareinsights` in dist; with token: beacon present, CSP does not block it |
| #2032 | Self-host header and build-env parity guard | Task | Blocked (AC stale) | #2029, #2134 | CI diffs the three CSP sources; self-host half (grep `script-src 'self'`, no beacon) runs today |
| #1984 | Cloudflare frontend hosting (prod) | Epic | Tracker | #2029, #2030, #2031, #2032 | count.racku.la 200 from Workers, full header set by value |
| #1986 | Decommission the Linode VPS | Task | Blocked (terminal) | #1984, #1985, 7-day soak | `rg vps-rackula .github/workflows` returns nothing; DNS off the Linode IP; instance destroyed |
| #1983 | Eliminate the production VPS (dev + decommission) | Epic | Tracker | #1985, #1986, #1984 | Aggregate of children |
| #2382 | Cloudflare hosting migration (umbrella) | Epic | Tracker | #1983, #1984 | count and d served from Cloudflare; VPS destroyed |

Readiness summary:

- Genuinely pickup-ready now: #2624 (land PR #2636 after trimming AC bullet 3 to as-built).
- Ready once their blocker merges, scope is clear: #2625, #2626.
- Needs scope work before pickup: #2029 (carve out CF provisioning; fix stale spec and line numbers), #2134 (split three ways; relocate the orphaned Access-JWT requirement), #2032 (reconcile the stale "script-src hash list" AC; #2028 already removed all hashes), #2030 (pick one beacon injection mechanism).
- Trackers (never picked up as dev tasks, close automatically): #2133, #1985, #1984, #1983, #2382.

---

## 3. Dependency graph and build order

### Edge list (corrected)

"#A blocks #B" means A must land before B. Rollup edges gate epic closure, not executable work. This list folds in the four corrections from the adversarial review (see section 7).

Storage and API spine (critical path):

- #2624 blocks #2625
- #2625 blocks #2626
- #2626 blocks #2134
- #2624, #2625, #2626 block #2133 (rollup)

Shared artifacts and provisioning (carved out so dev is not gated on all of prod):

- G1 (CF account/R2/secrets provisioning) blocks #2625, #2626, #2134, #2029
- HG (shared `_headers`/CSP generator) blocks #2134, #2029
- G3 (Worker Cf-Access-Jwt-Assertion validation) folds into #2626; blocks #2134's auth smoketest

Dev arc:

- #2626 blocks #2134
- #2133, #2134 block #1985 (rollup)

Prod arc:

- #2029 blocks #2030 (beacon needs the prod `_headers` and prod wrangler job)
- #2029 and #2134 block #2032 (the guard diffs both the prod and dev CF header surfaces)
- #2031 needs the first wrangler job (#2626 or #2029); otherwise independent
- #2029, #2030, #2031, #2032 block #1984 (rollup)

Decommission (terminal):

- G2 (scheduled soak-smoke cron) plus a 7-day green streak blocks #1986
- #1984, #1985 block #1986
- #1986, #1985, #1984 block #1983 (rollup)
- #1983, #1984 block #2382 (rollup)

Note the edge correction: #2032 is blocked by #2134 (the concrete producer of the dev `_headers` surface), not by the #1985 tracker.

### Topological build order

Executable work in dependency order (trackers close as their children land):

1. G1 CF account/R2/secrets provisioning (out-of-band, blocks the whole spine)
2. HG shared `_headers`/CSP generator (small shared artifact carved from #2029)
3. #2624 storage DI seam (land PR #2636)
4. #2625 R2 driver + runner-agnostic contract harness
5. #2626 Workers entry + argon2-free bundle + first `wrangler.jsonc` + Access-JWT validation (G3)
6. #2134 dev cutover (first deployed CF dev URL)
7. G2 scheduled soak-smoke cron (author once live; can start its streak against the current VPS prod)
8. #2029 prod cutover (code can develop in parallel from step 2; prod DNS flip waits for dev to bake)
9. #2030 analytics, #2031 previews, #2032 parity guard
10. Trackers close: #2133, then #1985, then #1984
11. #1986 decommission (after the 7-day soak)
12. #1983, then #2382 close

---

## 4. Walking skeleton

The smallest set that yields a deployed, smoketestable Cloudflare dev environment (d.racku.la on a Worker behind Access) is:

G1 provisioning, then #2624 -> #2625 -> #2626 -> #2134, with HG (the `_headers` generator) landing before #2134's headers step.

- #2624 extracts the `StorageDriver` seam so a non-FS driver can be injected per request (already built in PR #2636; land it).
- #2625 adds the R2 driver behind that seam and makes `runStorageContract` runner-agnostic so it runs under miniflare. This is what makes dev persistence correct.
- #2626 produces the first runnable Worker: `worker.ts` exporting `{ fetch }`, the first `wrangler.jsonc` (R2 binding, `nodejs_compat`, `run_worker_first` for `/api/*`), and the argon2-free bundle. Smoketestable locally with `wrangler dev`.
- #2134 deploys that Worker, re-points d.racku.la, and rewrites `deploy-dev.yml` off the `vps-rackula` runner. This is the first slice that produces a live CF dev URL.

Minimality note: a strictly minimal "env that stands up" could deploy #2626 + #2134 with a stubbed or in-memory driver to prove the argon2-free bundle, the Access JWT gate, DNS re-point, and the deploy rewrite before R2 persistence is fully correct. #2625 is required for a correct dev env, not for a standing one. Keep the #2624 -> #2625 -> #2626 chain (the Worker wires R2 from env), but do not treat #2625 as the same criticality tier as the argon2 gate #2626.

---

## 5. Phased plan (centered on the dev testing environment)

Phases are dev-first execution waves. Each slice lands behind a smoketest. The first three phases produce the dev proving ground; prod does not flip until dev is proven.

### Phase 0: Foundations (no behaviour change; local correctness only)

- G1 CF account/R2/secrets provisioning (new issue, see section 6).
- HG shared `_headers`/CSP generator (carve from #2029, new tiny shared artifact).
- #2624 storage DI seam: land PR #2636 (trim AC bullet 3 to as-built; re-run or override the unrelated red e2e suite).
- #2625 R2 driver + runner-agnostic `runStorageContract`.

Gate: `cd api && bun test` (FS contract) plus the workers project under miniflare R2. No deployed CF URL exists yet; this phase proves correctness against the storage contract, not a URL. This phase does not exercise the deployed Playwright smoke harness (that needs a live origin and first becomes runnable in Phase 1 against `wrangler dev`).

### Phase 1: First runnable Worker (the argon2 gate)

- #2626 Workers entry, first `wrangler.jsonc`, argon2-free bundle, plus the absorbed Cf-Access-Jwt-Assertion validation (G3: jose `createRemoteJWKSet`, pinned JWKS URL, issuer, AUD).

Gate: `wrangler dev` against a local miniflare R2 binding with `AUTH_MODE=none`: `curl /api/version` returns 200 JSON, `/api/layouts` round-trips through R2. The bundle grep asserts zero `@node-rs/argon2` and zero `node:fs`.

### Phase 2: Dev cutover (the first deployed CF dev URL, the proving ground)

- #2134 (split into 2134a code, 2134b DNS/Access runbook, 2134c docs): re-point d.racku.la, rewrite `deploy-dev.yml` onto wrangler/ubuntu-latest, deploy the #2626 Worker, inject `config.js {storage:"server"}`, generate dev `_headers` (reusing HG) plus `X-Robots-Tag: noindex` and per-host HSTS.
- G2 scheduled soak-smoke cron (new issue): author it now and start its green streak against the current VPS prod so the 7-day window is already running before decommission.
- G4 consolidated dev-env smoketest checklist (new issue): the single executable acceptance artifact that #2134's done-when references. This is the gate that declares "dev is proven, prod cutover may proceed."

Gate: the dev-env smoketest checklist passes against the live d.racku.la Worker (Access 302 unauth; 200 authed via service token; R2 PUT/GET round-trip with `X-Rackula-Updated-At` echo; asset content-type; headers by value; `config.js storage:"server"`; `version.json` match; `vps-rackula` absent from `deploy-dev.yml`).

### Phase 3: Prod cutover

- #2029 prod cutover to Workers Static Assets. Its code can be developed in parallel from Phase 0 (it only depends on closed #2028 plus G1 and HG), but the live `wrangler versions deploy` to count.racku.la waits until the mechanics are proven on the dev Worker in Phase 2.

Gate: `wrangler versions upload`, smoke the version preview URL with the existing `e2e/playwright.smoke.config.ts` (it already threads CF Access service-token headers), assert headers by value and content-types, then `versions deploy` and re-verify against count.racku.la.

### Phase 4: Prod follow-ons (analytics, previews, parity guard)

- #2030 Cloudflare Web Analytics (prod-only beacon gated on `VITE_CF_ANALYTICS_TOKEN`).
- #2031 per-PR preview deploys (set its milestone to M018; needs only a wrangler job pattern to clone, first available at #2626 or #2029).
- #2032 header/env parity guard (needs both the prod #2029 and dev #2134 CF surfaces to diff; the self-host half is implementable today and could ship as an unblocked sub-slice).

Gate: per-issue (beacon present/absent by build flag and not CSP-blocked; preview URL per PR; parity CI green across the three CSP sources).

### Phase 5: Decommission

- #1986 decommission the Linode VPS: archive data, capture and verify a restorable Linode image (~30-day retention), deregister the `vps-rackula` runner, destroy the instance, cancel billing, final DNS cleanup, docs update.

Gate: `rg vps-rackula .github/workflows` returns nothing; the G2 soak-smoke cron has been green for at least 7 days with at least one CF release; `dig` shows count and d resolving to Cloudflare, not the Linode IP; a fresh `deploy-dev` run on ubuntu-latest is green with the VPS powered off. #1986 must not edit the runner label itself; #2134 removes it from `deploy-dev.yml`, #2029 from `deploy-prod.yml`, and #1986 only deregisters after both.

### Tracker closure (no independent work)

Tracker #2133 closes when #2624/#2625/#2626 merge. #1985 closes when #2133 and #2134 merge. #1984 closes when #2029/#2030/#2031/#2032 merge. #1983 closes when #1985/#1986/#1984 are done. #2382 closes when #1983 and #1984 are done.

---

## 6. Risk register (Workers-specific)

Severity reflects the migration as scoped (dev runs `AUTH_MODE=none` behind Cloudflare Access). Several stateful risks are tolerated only because of that posture and become High the moment app-level auth lands on a Worker (epic #2365, out of M018 scope).

Each Risk cell states the risk and what it threatens; the remaining columns are severity and coverage.

| Risk (and what it threatens) | Severity | Covered by |
| --- | --- | --- |
| R2 storage parity vs the FS driver. R2 cannot replicate the per-layout in-process write lock (`filesystem.ts:52`) that serializes the snapshot-check-through-write critical section. On stateless multi-isolate Workers this reopens the TOCTOU data loss the storage contract exists to prevent. Mitigation: R2 conditional PUT (`onlyIf` etag) then snapshot then retry, plus a runner-agnostic `runStorageContract`. | High | #2133, #2624 (seam), #2625 (R2 driver + harness). Residual: #2624 AC over-claims (quota and assets deferred to #2625); the `saveLayout` arg-order mismatch is papered with an adapter and must be aligned in #2625 but is not in its AC. |
| `updatedAt` token parity. FS uses file mtime with `utimes()` forcing strict monotonicity (`filesystem.ts:932-947`). R2 has no client-settable mtime; the driver must mint a monotonic token from customMetadata + ETag, or the `X-Rackula-Updated-At` echo model breaks. | High | #2625 (validated by the contract's monotonicity cases). |
| Native dep `@node-rs/argon2` will not run on Workers. `app.ts:38` statically imports `./local-auth`, the only importer (`local-auth.ts:1`). Until broken, no Worker bundle compiles. Dev sidesteps it via `AUTH_MODE=none` behind Access plus a dynamic import. | Critical | #2626 (dynamic-import seam, bundle grep asserting argon2 absent). |
| Bundle could still drag in `node:fs` via the FS driver. The argon2 grep alone is insufficient; the Worker must wire R2 and never reach the FS driver. | Med | #2626, but its bundle check is scoped to argon2 only. Extend the grep to assert `node:fs` and the FS driver are absent. Partial gap in #2626's AC. |
| HTTP security-header parity vs nginx. The Worker must reproduce `deploy/security-headers.conf` by value (CSP, HSTS, X-Frame-Options SAMEORIGIN, nosniff, Referrer-Policy, Permissions-Policy) plus the cache-control split (immutable `/assets/*` vs no-cache `index.html`/`config.js`/`version.json`). Three surfaces (CF `_headers`, Docker conf, LXC conf) must stay aligned. | Med | Prod `_headers` in #2029, dev in #2134, CI guard in #2032. The shared generator (HG) does not exist yet. #2032's AC is stale (chases a script-src hash list #2028 already removed). |
| Runtime `config.js` injection (`storage: server`/`browser`). Done today by `docker-entrypoint-wrapper.sh`; no entrypoint shell on Workers. The Worker must serve/generate `config.js` per environment. | Med | Prod default in #2029, dev server-mode in #2134, served by the #2626 Worker (boundary cross-referenced, not formally owned). |
| Client IP source. `rate-limit-middleware.ts` reads `X-Real-IP`/`X-Forwarded-For`; on Workers these are spoofable/absent and must become `CF-Connecting-IP`. | Low | Gap. No issue's AC changes the IP source. Tolerated because dev rate-limiting is accepted-degraded behind Access. |
| Cloudflare Access fronts dev; smoketests must auth through it. Every dev smoketest must send `CF-Access-Client-Id`/`CF-Access-Client-Secret`; unauthenticated requests get a 302. #2134 also requires net-new `Cf-Access-Jwt-Assertion` validation in the Worker. | Med | Smoke-through-Access in #2134 (harness exists). The JWT validation is orphaned (required by #2134, implemented nowhere, no JWKS/issuer/AUD specified). Recommend folding into #2626 as G3. |
| Workers limits: bundle size, CPU time, subrequest count. Bundle must fit the script-size limit (argon2/pino removal helps). R2 list-based quota counting, snapshot prune, and conditional-PUT-then-snapshot-retry each fan out into multiple R2 ops against the subrequest ceiling. | Med | Gap. No AC states a bundle-size budget, CPU check, or subrequest count. Recommend a size assertion in #2626 and a subrequest bound in #2625. |
| Session durability. `sessions.ts:8` `invalidatedAuthSessionIds` is a process-local Map (issue #1269). On multi-isolate Workers, logout fails to revoke across isolates; needs KV or a Durable Object. | High (general) / Low (dev) | Gap for the general case. Mitigated only because dev runs `AUTH_MODE=none` (no app sessions). High and unowned once app auth lands on Workers (#2365). |
| In-memory rate limiters + `setInterval` cleanup (`rate-limit.ts:67,72`, plus the login limiter). Per-isolate Maps and long-lived timers do not exist on Workers; needs Durable Objects or the native CF rate-limiting binding. | High (general) / Low (dev) | Gap. Accepted-degraded for dev (Access is the abuse boundary). Unowned for any future non-Access Worker. |
| Secrets and Wrangler config. Zero wrangler config today. `process.env` reads become the Workers `env` binding (eased: `createApp(env)` already takes an injectable EnvMap). Secrets move from the VPS `.env` to `wrangler secret`/account tokens. Heavy reliance on one-time out-of-band account actions. | Med | First `wrangler.jsonc` in #2626 (pin wrangler floor >=4.20 for `run_worker_first`), prod in #2029, secrets in #2134. The out-of-band provisioning is unowned: see gap G1. |
| Rollback path from Workers back to the VPS. Both deploy workflows still pin `vps-rackula`; the VPS stays up as fallback until decommission. Prod rollback = `wrangler versions deploy <previous>` plus a DNS export/delete/attach runbook (the saved record is the only apex rollback). | High | Prod runbook in #2029, dev DNS runbook in #2134, soak gate + image insurance in #1986. The DNS runbooks are credentialed maintenance-window actions with no named owner. The soak-smoke cron does not exist: see gap G2. |
| Boot-time `ensureDataDir()` mkdir (`index.ts:17`) and the Bun `{port, fetch}` export shape. The filesystem mkdir must be dropped; `export default { port, fetch }` (Bun) becomes `export default { fetch }` (Workers). | Low | #2626 (`worker.ts` exports `{ fetch }`; Bun `index.ts` left unchanged for self-host). |
| Asset storage on R2 (magic-byte sniffing, 5 MB limit, atomic temp-rename) and exclusive-create semantics (`flag:"wx"`) for snapshot collisions and the one-time pre-carrier backup (`filesystem.ts:877`). | Low/Med | Implied under the #2625 R2 driver, but assets and the pre-carrier `wx` backup are not enumerated in #2624/#2625 ACs (PR #2636 left assets FS-only). Partial gap; have #2625 own them explicitly. |

---

## 7. Corrections folded in from the adversarial review

The proposed build order was adversarially critiqued. The graph, topo order, and tracker handling were sound (no cycles, no issue before a hard blocker). Four real defects were corrected in this plan:

1. Prod-before-dev inversion. The first draft placed all of #2029 (prod, large, ~20 ACs) before #2134 (dev) because #2134 reuses #2029's `_headers` generator. That gates the dev-first critical path on the entire prod cutover. Fix: carve the generator out as the shared artifact HG in Phase 0, so #2134 depends on the artifact, not on #2029's DNS flip.
2. Smoke-harness claim. Phase 0 cannot exercise the deployed Playwright smoke harness; that needs a live origin. Phase 0 is relabeled local-correctness-only; the deploy-smoke harness first runs in Phase 1 against `wrangler dev` and against a real CF URL in Phase 2.
3. Long-pole non-code dependencies were invisible in the topo order. The CF account provisioning (G1) blocks both #2029 and #2134, and the scheduled soak-smoke cron (G2) must run green for 7 days before #1986 can start. Both are now explicit slices with edges.
4. Tracker edge. #2032 was blocked by the #1985 tracker; it actually needs the dev `_headers` surface produced by #2134. Edge re-pointed to #2134.

---

## 8. Gaps: recommended new and changed issues

Recommendations only. Nothing is filed by this pass.

### New issues (4)

| Ref | Proposed title | Type | Size | Area/labels | Phase | Rationale |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | Provision Cloudflare account resources for M018 (workers.dev subdomain, dev/prod Workers, R2 buckets, deploy secrets) | Task | M | area:container, ci | 0 | Every executable slice hard-depends on out-of-band credentialed account actions no issue owns. Distinct from M017 #2368 (multi-tenant `users/{user_id}` buckets). |
| G2 | Scheduled soak-smoke cron against count and d.racku.la (gates VPS decommission) | Feature | S | area:container, ci | 2 | #1986 requires a 7-day green soak; no `schedule:` workflow exists. The harness is ready; only the cron wrapper plus green-streak gate are missing. Shared with #2029's rollback soak window. |
| G3 | Validate Cf-Access-Jwt-Assertion on `/api/*` in the dev Worker (jose JWKS, issuer + AUD) | Feature | S | devex, area:container | 1 | #2134 marks this required but it has no AC home and no JWKS/issuer/AUD values. Cleanest home is folding into #2626; file standalone only if #2626 is not rescoped. Distinct from M017 #2369 (multi-tenant identity). |
| G4 | End-to-end dev-env acceptance smoketest checklist for d.racku.la on Workers | Task | S | devex, area:container | 1 to 2 boundary | The dev-first gate. Verification steps are scattered across #1985/#2134/#2626 with no single executable artifact. Consolidating makes "proven on dev before prod" real, not implicit. |

Plus one carved artifact, HG: extract the shared `_headers`/CSP generator (a small `scripts/gen-headers.*` that both #2029 and #2134 call) out of #2029 so the dev cutover is not gated on the prod cutover. Can be a sub-task of #1984 or a checklist item; it is the fix for defect 1 above.

Candidates evaluated and not recommended (already covered): a throwaway CF preview env (the dev Worker is that, plus #2031 covers per-PR previews); Workers observability (#2626 owns the console.log JSON seam, `wrangler tail` needs no code, Analytics Engine overlaps #2030); a standalone rollback runbook (#2029 and #2134 already own the prod and dev runbooks; the only missing piece is G2, the scheduled soak).

### Changed issues

- #2624: trim AC bullet 3 (quota middleware and `routes/assets.ts` behind the driver) to as-built; PR #2636 deliberately deferred both to #2625 and CodeRabbit flagged the mismatch.
- #2625: add a readiness/blocked label. Expand scope to explicitly own (a) removing the `bun:test` import at `storage-contract.ts:14` for the runner-agnostic harness, (b) the `saveLayout(yaml,id)` vs contract `(id,yaml)` arg-order alignment, (c) the quota-middleware and asset-on-R2 abstractions deferred from #2624. Pin concrete Vitest/pool-workers versions.
- #2626: extend the bundle-check AC to also assert `node:fs`/the FS driver are absent. Pin the wrangler floor (>=4.20 for `run_worker_first`). Add a local `wrangler dev` smoke step. Best home for G3.
- #2134: add `size:large`. Split three ways (2134a CI/wrangler/headers/config.js code; 2134b DNS delete-then-attach plus Access service-token runbook; 2134c doc cleanup). Relocate the Cf-Access-Jwt requirement into #2626 (G3). Remove the stale pre-#2037 forward-compat carve-out (#2037 and #2041 are closed).
- #2029: keep `size:large` but carve out CF provisioning (G1) so the implementation slice is self-contained. Fix the dead spec reference (`docs/superpowers/specs/2026-06-10-cloudflare-frontend-hosting-epic-design.md` is absent from the tree) and the stale cleanup line numbers (live GH-Pages targets are `docs/reference/ARCHITECTURE.md:158`, `docs/guides/TESTING.md:96`, `docs/reference/SPEC.md:46`, `vite.config.ts:142`).
- #2030: decide the beacon injection mechanism (CF zone-managed `/cdn-cgi` vs manual `static.cloudflareinsights.com` script tag); the AC and its comment assume different answers. Add `area:container`/`ci` (it is build/deploy/CSP, not app behaviour).
- #2032: reconcile stale AC bullet 1; #2028 removed all CSP script-src hashes, so "agree on the hash list" becomes "script-src is `'self'`, no inline-script hashes". Consider splitting the today-implementable self-host half into an unblocked sub-slice. Bump toward `size:medium`.
- #2031: set milestone to M018 (currently none).
- #1986: add `size:medium`. Add a checklist mapping the two added ACs (restorable image; scheduled soak). Update the body to link the concrete dev-DNS child #2134, not #1985 directly.
- #2133: convert type Feature to Epic and wire #2624/#2625/#2626 as formal sub-issues.
- #2382: add `epic` (and `area:container`) labels.
- #1983: trim the prod restatement to a pointer; delete/correct the stale pinned comment.
- #1984: soften the #2031 clause in "Done when" so a nice-to-have does not block epic closure; add a one-line dev-first note.

---

## Appendix: per-issue smoketests (exact checks)

These are the concrete checks that prove each slice in the dev env. Phase 0 and 1 slices have no deployed URL yet, so their checks are local (bun/miniflare/`wrangler dev`).

### #2624 (local only)

`cd api && bun run typecheck` clean. `cd api && bun test` green, including `filesystem-contract.test.ts` running `runStorageContract` through `createFilesystemDriver` and the injection test that passes a stub `StorageDriver` via `deps.storage` and asserts a sentinel `updatedAt` surfaces through `PUT /layouts/:uuid`. The self-host Bun path stays behaviour-identical.

### #2625 (local only, miniflare)

Make `runStorageContract` runner-agnostic, then run both ways: `cd api && bun test` (FS) and the workers project (`npx vitest run --project workers`) binding the R2 driver to a miniflare R2 bucket. All cases green including snapshot-on-mismatch, strictly-newer `updatedAt`, and the concurrent stale-echo race. Targeted: seed a layout, save with a stale `echoedUpdatedAt`, list R2 objects under `layouts/{uuid}/snapshots/` and assert the diverged copy is present. Prune: write 7 snapshots, assert exactly 5 newest remain.

### #2626 (local build plus `wrangler dev`)

Build the worker and grep the emitted bundle for `@node-rs/argon2`, `node:fs`, and static `local-auth` refs: expect zero of each. Confirm `app.ts` has no top-level `from './local-auth'` and that it loads via `if (authMode==='local') await import(...)`. `wrangler dev` with `AUTH_MODE=none` and a local R2 binding: `curl 127.0.0.1:8787/api/version` returns 200 JSON, `/api/health` 200, `/api/layouts` 200 empty array, and a `PUT /api/layouts/{uuid}` round-trips through R2. Self-host: `bun run typecheck && bun test` green; `bun src/index.ts` still boots.

### #2134 (live dev Worker, the canonical dev-env check)

1. Unauth: `curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://d.racku.la/api/layouts` returns 302 to the Access login.
2. Authed API: `curl -sS -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" https://d.racku.la/api/layouts` returns 200 plus a JSON array.
3. Round-trip: PUT a small YAML to `/api/layouts/<uuid>` with the same headers, expect 200 and an `X-Rackula-Updated-At` echo; GET it back, expect the same body and a newer-or-equal `updatedAt`.
4. Asset content-type: `curl -sI .../assets/<hashed>.js` returns `application/javascript` and `Cache-Control: public, immutable`.
5. Headers by value on `/`: assert CSP, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, HSTS, and dev-only `X-Robots-Tag: noindex`.
6. `curl .../config.js` contains `storage: "server"`.
7. `curl .../version.json` matches the deployed version and commit.
8. `grep -c vps-rackula .github/workflows/deploy-dev.yml` returns 0.

### #2029 (wrangler version preview URL, then count.racku.la)

After `wrangler versions upload`, capture the preview URL, then `SMOKE_TEST_URL=<preview-url> CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... npm run test:e2e:smoke`. Header-by-value via `curl -sI <preview-url>/` (full CSP, X-Frame-Options, nosniff, HSTS, `Cache-Control: no-cache`). Content-type: `curl -sI <preview-url>/assets/<hashed>.js` returns 200 + `application/javascript` + `Cache-Control: public, max-age=31536000, immutable`. SPA fallback: an unknown route returns `200 text/html`. `config.js` contains `storage: "browser"`. `version.json` version equals the released tag and commit equals `git rev-parse --short HEAD`. Only then `wrangler versions deploy`, then re-verify against <https://count.racku.la>.

### #2030 (build flag, then live CSP)

Build with `VITE_CF_ANALYTICS_TOKEN` unset: `grep -ri cloudflareinsights dist/` finds nothing. Build with the token set: the beacon script tag is present in `dist/index.html`. Once #2029 is live, a smoke assertion confirms the beacon request returns 2xx and is not CSP-blocked.

### #2032 (self-host half runs today; CF half after #2029/#2134)

`grep -iE 'cloudflareinsights|/cdn-cgi/' deploy/security-headers.conf deploy/lxc/security-headers.conf` returns nothing. `grep -oE "script-src [^;]*"` on both prints exactly `script-src 'self'`. Each CSP contains `form-action 'self'`. `npm run build && grep -ioE '<script(?![^>]*src=)[^>]*>' dist/index.html dist/login.html` returns nothing. `scripts/lxc-smoke-test.sh` asserts CSP and X-Frame-Options present and `version.json` well-formed. CF half: the generated dev `_headers` differs from prod only by `X-Robots-Tag` and per-host HSTS, and its CSP `script-src` matches the self-host files.

### #1986 (teardown verifications, after soak)

Pre-gate: `rg -n 'vps-rackula' .github/workflows` returns zero hits (today it returns 4). Soak: `SMOKE_TEST_URL=https://count.racku.la npx playwright test -c e2e/playwright.smoke.config.ts` passes and the cron shows an unbroken green streak across 7 days. Image insurance: a restorable Linode image boots and serves. Post-destroy: `dig +short A count.racku.la` and `dig +short AAAA d.racku.la` resolve to Cloudflare, not the Linode IP; `curl -sI` returns 200 (or Access 302 for dev) from Workers; the `vps-rackula` runner is removed; a fresh `deploy-dev` run on ubuntu-latest is green with the VPS powered off.
