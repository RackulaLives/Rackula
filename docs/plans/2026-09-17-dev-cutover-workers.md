# Dev Cutover to Cloudflare Workers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve d.racku.la from the `rackula-dev` Cloudflare Worker (SPA + API + R2, behind Access), deployed by a wrangler-based `deploy-dev.yml`, with the soak dev leg restored.

**Architecture:** `api/wrangler.jsonc` becomes the real dev Worker config (assets from `../dist`, `/api/*` to `src/worker.ts`, route `d.racku.la/*`). `deploy-dev.yml` mirrors `deploy-prod.yml`: upload a version, curl-smoke its workers.dev preview URL, promote, apply triggers, browser-smoke the live host through Access.

**Tech Stack:** Cloudflare Workers (wrangler 4, from `api/bun.lock`), GitHub Actions, Bash, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-17-dev-cutover-workers-design.md` (requirements: #2134 issue body).

## Global Constraints

- Worker name `rackula-dev`; R2 bucket `rackula-layouts-dev`; route `d.racku.la/*` on zone `racku.la`.
- Access vars: `CF_ACCESS_JWKS_URL=https://gwilym.cloudflareaccess.com/cdn-cgi/access/certs`, `CF_ACCESS_ISSUER=https://gwilym.cloudflareaccess.com`, `CF_ACCESS_AUD=1ea609e49a2f7105b29c169d259406673aaf0c1f51ab5870f16a9c1dc6e87a38`.
- API vars: `NODE_ENV=production`, `CORS_ORIGIN=https://d.racku.la`.
- `dist/config.js` for dev: `window.__RACKULA_CONFIG__ = { storage: "server", env: "dev" };`
- Deploy token: existing `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets.
- Never add `main` to the root `wrangler.jsonc` (`rackula-prod`).
- Writing style in all text: no em or en dashes, no smart quotes, no emoji, no bold in list items. Never hard-wrap markdown.
- Commits: `git commit -s`, conventional type, `Co-Authored-By` trailer. Run prettier from the main checkout on touched files before committing.

---

### Task 1: Dev Worker config

**Files:**

- Modify: `api/wrangler.jsonc` (whole file)
- Modify: `api/.dev.vars`
- Delete: `api/public-placeholder/index.html`

**Interfaces:**

- Produces: Worker `rackula-dev` reading assets from `../dist`; vars consumed by `api/src/worker.ts` (`CF_ACCESS_*`) and `api/src/security/config.ts` (`NODE_ENV`, `CORS_ORIGIN`).

- [ ] **Step 1: Replace `api/wrangler.jsonc`**

```jsonc
{
  // Cloudflare Workers config for the dev surface, d.racku.la (#2134).
  //
  // One Worker serves the built SPA and the persistence API: run_worker_first
  // sends `/api/*` to src/worker.ts and everything else is served from ../dist.
  // It sits behind the existing Cloudflare Access app for d.racku.la and runs
  // AUTH_MODE=none, so Access is the only gate. Prod (count.racku.la) is a
  // separate, assets-only Worker configured in the root wrangler.jsonc. Do not
  // merge the two.
  //
  // Deployed by .github/workflows/deploy-dev.yml. `wrangler dev` and
  // `npm run build:worker` need the SPA built first (`npm run build` at the
  // repo root), because the assets directory is ../dist.
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "rackula-dev",
  "main": "src/worker.ts",
  // Pinned workerd compatibility baseline. nodejs_compat gives node:crypto etc.
  // on workerd (its v2 module resolution is active for dates >= 2024-09-23).
  // Bump this deliberately when adopting newer workerd semantics.
  "compatibility_date": "2025-09-23",
  "compatibility_flags": ["nodejs_compat"],

  // deploy-dev.yml generates dist/_headers, dist/.assetsignore and a
  // server-mode dist/config.js before upload. They are never committed to
  // static/, because publicDir copies static/ into every self-host image too.
  // run_worker_first requires wrangler >= 4.20.
  "assets": {
    "directory": "../dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"],
  },

  // A route, not a custom_domain, as for prod (#3216): d.racku.la already has
  // a proxied record and edge certificate, so the route intercepts ahead of the
  // VPS origin with no DNS change. Undoing the cutover is removing this entry
  // and running `wrangler triggers deploy`.
  "routes": [{ "pattern": "d.racku.la/*", "zone_name": "racku.la" }],

  // preview_urls stays on so `wrangler versions upload` yields a workers.dev
  // URL for the pre-promotion curl smoke: Bot Fight Mode challenges CI on every
  // racku.la host. The preview URL is outside Access. The SPA there is the same
  // open-source bundle, and /api/* fails closed (401) without an Access JWT,
  // which deploy-dev.yml asserts on every deploy.
  "workers_dev": false,
  "preview_urls": true,

  "r2_buckets": [
    {
      "binding": "LAYOUTS",
      "bucket_name": "rackula-layouts-dev",
    },
  ],

  // Bundle exclusions (#2626): keep the native argon2 addon and pino (which
  // pulls node:fs) out of the workerd graph. Local auth is never reached on the
  // Worker (AUTH_MODE=none), and the Workers logger path uses a console-JSON
  // seam, so these aliases are inert at runtime but required so the bundle is
  // free of @node-rs/argon2 and node:fs.
  "alias": {
    "@node-rs/argon2": "./src/worker/argon2-stub.ts",
    "pino": "./src/worker/pino-stub.ts",
    "hono/bun": "./src/worker/hono-bun-stub.ts",
    "./storage/filesystem-driver": "./src/worker/filesystem-driver-stub.ts",
  },

  // Plain vars, not secrets: none of these is sensitive. The Access team
  // domain and application AUD tag both appear in the public Access login
  // redirect for d.racku.la. The Worker fails closed if any CF_ACCESS_* value
  // is missing (#2913). api/.dev.vars blanks them for local `wrangler dev`.
  // deploy-dev.yml adds APP_VERSION and APP_COMMIT per upload for /api/version.
  "vars": {
    "NODE_ENV": "production",
    "CORS_ORIGIN": "https://d.racku.la",
    "CF_ACCESS_JWKS_URL": "https://gwilym.cloudflareaccess.com/cdn-cgi/access/certs",
    "CF_ACCESS_ISSUER": "https://gwilym.cloudflareaccess.com",
    "CF_ACCESS_AUD": "1ea609e49a2f7105b29c169d259406673aaf0c1f51ab5870f16a9c1dc6e87a38",
  },

  "observability": {
    "enabled": true,
  },
}
```

- [ ] **Step 2: Update `api/.dev.vars`** so local `wrangler dev` keeps skipping Access and runs non-production. Replace the header comment's last sentence ("Do not add real secrets here; CF_ACCESS_* production values are set by the dev cutover (#2675 / #2134) via `wrangler secret` / CI, not this file.") with "Do not add real secrets here." and append:

```
# wrangler.jsonc commits the real CF_ACCESS_* values and NODE_ENV=production as
# vars, and this file merges over them. Blank the Access values so the opt-out
# above applies, and run non-production as local dev always has.
CF_ACCESS_JWKS_URL=
CF_ACCESS_ISSUER=
CF_ACCESS_AUD=
NODE_ENV=development
```

- [ ] **Step 3: Delete the placeholder assets directory**

Run: `/usr/bin/git rm -q api/public-placeholder/index.html`

- [ ] **Step 4: Verify the bundle builds against the real config**

Run: `npm run build` (repo root), then `cd api && ./node_modules/.bin/wrangler deploy --dry-run --outdir dist-worker` Expected: exit 0; output lists bindings `LAYOUTS (rackula-layouts-dev)`, the five vars, and `ASSETS`. No `@node-rs/argon2` in `dist-worker/`.

Run: `cd api && bun test && npx vitest run --config vitest.workers.config.ts` Expected: PASS (the Workers pool uses inline Miniflare config, not wrangler.jsonc).

- [ ] **Step 5: Commit** `feat: configure the rackula-dev Worker for d.racku.la (#2134)`

### Task 2: Dev surface in the smoke tooling

**Files:**

- Modify: `scripts/smoke-headers.sh`
- Modify: `e2e/deploy-smoke.spec.ts`

**Interfaces:**

- Produces: `scripts/smoke-headers.sh <base-url> [--surface prod|dev] [--live] [--expect-version X] [--expect-commit Y]` (default surface `prod`). Env `EXPECT_SERVER_API=1` enables the Access-gated API test in `deploy-smoke.spec.ts`.

- [ ] **Step 1: `smoke-headers.sh` argument parsing.** Header: "fail-closed post-deploy smoke for the Cloudflare prod and dev surfaces." and "Part of issue #2029; the dev surface was added by #2134." Usage line gains `[--surface prod|dev]` with this help text:

```
#   --surface  which scripts/gen-headers.mjs surface to expect (default prod).
#              dev also expects server-mode config.js and asserts that
#              /api/layouts fails closed (401) without Cloudflare Access, so
#              run it against the workers.dev preview URL, never d.racku.la.
```

Parsing, next to `--expect-*`:

```bash
SURFACE="prod"
...
    --surface)
      [ $# -ge 2 ] || { echo "error: $1 requires a value" >&2; exit 2; }
      case "$2" in
        prod|dev) SURFACE="$2" ;;
        *) echo "error: --surface must be prod or dev" >&2; exit 2 ;;
      esac
      shift 2 ;;
```

- [ ] **Step 2: Surface-aware checks.** Check 3 storage mode:

```bash
EXPECT_STORAGE="browser"
[ "$SURFACE" = "dev" ] && EXPECT_STORAGE="server"
if fetch "$BASE_URL/config.js" | grep -q "storage: *\"$EXPECT_STORAGE\""; then
  pass "config.js declares $EXPECT_STORAGE storage"
else
  fail "config.js does not declare $EXPECT_STORAGE storage"
fi
```

Check 5: `node "$SCRIPT_DIR/gen-headers.mjs" "$SURFACE"` and add `x-robots-tag` to `SECURITY_HEADERS`, so prod can never emit `noindex` and dev always does. Check 8: message becomes "neither Cloudflare surface has a login backend". New check 10, before the summary:

```bash
# --- 10. dev API fails closed without Cloudflare Access ------------------
# The preview URL is outside Access, so no Cf-Access-Jwt-Assertion reaches the
# Worker and the API must refuse. On d.racku.la itself Access answers first
# (302), which is why the dev surface runs against the preview URL.
if [ "$SURFACE" = "dev" ]; then
  code="$(fetch -o /dev/null -w '%{http_code}' "$BASE_URL/api/layouts")"
  if [ "$code" = "401" ]; then
    pass "/api/layouts -> 401 without an Access JWT"
  else
    fail "/api/layouts -> $code without an Access JWT (expected 401: the API must fail closed)"
  fi
fi
```

- [ ] **Step 3: Regression check on prod.** Run: `bash -n scripts/smoke-headers.sh && scripts/smoke-headers.sh https://count.racku.la` Expected: `Smoke passed` (or the challenge-guard message if this client is challenged; then run against a prod preview URL instead).

- [ ] **Step 4: `deploy-smoke.spec.ts` API test**, appended inside the describe block:

```ts
test("server API answers through Cloudflare Access", async ({ page }) => {
  // Only the Access-gated dev surface has an API; prod is assets-only. The
  // deploy-dev workflow and the soak dev leg opt in with EXPECT_SERVER_API.
  test.skip(!process.env.EXPECT_SERVER_API, "no server API on this surface");

  // Fetched from inside the page for the same reason as version.json above:
  // only the browser's own network stack carries the challenge clearance.
  // The Access service-token headers apply to this fetch as well.
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const r = await fetch("/api/layouts", { cache: "no-store" });
    return { status: r.status, type: r.headers.get("content-type") ?? "" };
  });
  expect(result.status, `GET /api/layouts returned ${result.status}`).toBe(200);
  expect(result.type).toContain("application/json");
});
```

Run: `npx eslint e2e/deploy-smoke.spec.ts` then `npx playwright test --config e2e/playwright.smoke.config.ts --list` with `SMOKE_TEST_URL=https://count.racku.la` Expected: lint clean; five tests listed.

- [ ] **Step 5: Commit** `feat: add the dev surface to the deploy smoke checks (#2134)`

### Task 3: Rewrite deploy-dev.yml onto wrangler

**Files:**

- Modify: `.github/workflows/deploy-dev.yml` (whole file)
- Modify: `.github/workflows/compose-parity.yml:9` (delete the `deploy-dev.yml` path)

**Interfaces:**

- Consumes: Task 1 config, Task 2 `--surface dev` and `EXPECT_SERVER_API`.

- [ ] **Step 1: Replace `deploy-dev.yml`** with a single `deploy` job on `ubuntu-latest` (environment `dev`, url `https://d.racku.la`, concurrency group `dev-deploy`, no cancel). Steps in order: checkout (`fetch-depth: 0`, `persist-credentials: false`); setup-node 22 with npm cache; setup-bun (`oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2`, `bun-version: "1"`); `npm ci`; `bun install --frozen-lockfile` in `api`; resolve `version` (root package.json) and short `commit`; `npm run build` with `VITE_ENV: development`; generate `dist/_headers` (`gen-headers.mjs dev`), `dist/.assetsignore`, and the dev `dist/config.js`; strip `dist/login.html` (fail if absent); assert config.js server mode and version.json version and commit; `./node_modules/.bin/wrangler versions upload --var APP_VERSION:<v> --var APP_COMMIT:<c>` in `api`, parsing `Worker Version ID` and `Version Preview URL`; `scripts/smoke-headers.sh <preview> --surface dev --expect-version --expect-commit`; `wrangler versions deploy <id>@100% --yes`; `wrangler triggers deploy`; Playwright cache and chromium install; `npm run test:e2e:smoke` with `SMOKE_TEST_URL=https://d.racku.la`, `EXPECT_VERSION`, `EXPECT_COMMIT`, `EXPECT_SERVER_API=1` and the two `CF_ACCESS_*` secrets; upload the report on failure; write the version id, preview URL and rollback command to the step summary. Pass every step output into `run:` through `env:`, never by `${{ }}` interpolation inside the script. Paths filter: `api/**`, `src/**`, `assets/**`, `static/**`, `login.html`, `index.html`, `package.json`, `package-lock.json`, `vite.config.*`, `svelte.config.*`, `tsconfig*.json`, `scripts/gen-headers.mjs`, `scripts/smoke-headers.sh`, `e2e/deploy-smoke.spec.ts`, `e2e/playwright.smoke.config.ts`, `.github/workflows/deploy-dev.yml`, then `"!**/*.md"`. The full file is in the PR diff.

- [ ] **Step 2: Drop `.github/workflows/deploy-dev.yml` from `compose-parity.yml`'s paths**; the parity script never read it.

- [ ] **Step 3: Verify.** Run: `grep -c vps-rackula .github/workflows/deploy-dev.yml` (expected `0`) and `actionlint .github/workflows/deploy-dev.yml .github/workflows/compose-parity.yml` if available, else `python3 -c 'import yaml,sys; yaml.safe_load(open(sys.argv[1]))' .github/workflows/deploy-dev.yml`.

- [ ] **Step 4: Commit** `feat: deploy d.racku.la to Cloudflare Workers with wrangler (#2134)`

### Task 4: Restore the soak dev leg

**Files:**

- Modify: `.github/workflows/soak-smoke.yml`

- [ ] **Step 1:** Restore the `dev` matrix entry with an `access: true` flag (prod gets `access: false`) and scope credentials to it at job level:

```yaml
env:
  SMOKE_TEST_URL: ${{ matrix.target.url }}
  CF_ACCESS_CLIENT_ID: ${{ matrix.target.access && secrets.CF_ACCESS_CLIENT_ID || '' }}
  CF_ACCESS_CLIENT_SECRET: ${{ matrix.target.access && secrets.CF_ACCESS_CLIENT_SECRET || '' }}
  EXPECT_SERVER_API: ${{ matrix.target.access && '1' || '' }}
```

Delete both `TODO(#2134)` comment blocks and the "No CF_ACCESS_* here" block; update the header comment (Vultr, not Linode; the dev leg is live and is what starts #1986's soak window).

- [ ] **Step 2: Verify** with the same YAML check as Task 3 Step 3.

- [ ] **Step 3: Commit** `feat: restore the soak-smoke dev leg (#2134)`

### Task 5: Provision, bootstrap and verify live

- [ ] **Step 1:** Create R2 bucket `rackula-layouts-dev` (Cloudflare API).
- [ ] **Step 2:** From the worktree (clean checkout, so no gitignored files reach `dist/`): `npm run build`, generate `_headers`, `.assetsignore` and the dev `config.js` exactly as the workflow does, strip `login.html`, then `cd api && ./node_modules/.bin/wrangler deploy`. Expected: Worker `rackula-dev` created, route `d.racku.la/*` attached.
- [ ] **Step 3:** `curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://d.racku.la/api/layouts`. Expected: 302 to the Access login (Access fronts the Worker).
- [ ] **Step 4:** Push the branch and dispatch the rewritten workflow on it: `gh workflow run deploy-dev.yml --ref feat/2134-dev-cutover`. Expected: green, including the preview smoke (`--surface dev`, API 401) and the live browser smoke through Access.

### Task 6: Docs

**Files:** `CLAUDE.md`, `docs/ARCHITECTURE.md` (Deployment Architecture section), `docs/deployment/RELEASE-PIPELINE.md:109`, `docs/deployment/cloudflare-token-rotation.md`, `docs/deployment/dev-acceptance-checklist.md`, `docs/deployment/soak-smoke.md`.

- [ ] **Step 1:** `CLAUDE.md`: dev row Infrastructure becomes "Cloudflare Worker `rackula-dev` (SPA + API, R2), behind Access"; rewrite the Dev Deployment paragraph and command comment for the wrangler flow; update the path-filter list; M018 line becomes "prod and dev are on Workers; VPS decommission remains".
- [ ] **Step 2:** `docs/ARCHITECTURE.md`: replace the migration banner, the VPS diagram and the table with a two-lane Workers diagram (dev: push to main, Deploy Dev, `rackula-dev`; prod: tag, release, `rackula-prod`) and a table naming each Worker's config file. Keep "Version Alignment".
- [ ] **Step 3:** `RELEASE-PIPELINE.md:109`: describe the browser smoke step and its Access service token; remove the `check-cf-access` job description.
- [ ] **Step 4:** Token doc: record the dev Worker and bucket, that dev shares the deploy token (same blast radius; mint a separate token only if dev needs a scope prod lacks), `deploy-dev.yml` as a token consumer, both routes under Workers Routes, and the new verification steps (no `check-cf-access`).
- [ ] **Step 5:** Dev checklist: status becomes live; note the Bot Fight Mode caveat for curl from datacenter IPs; it now gates #1986, not #2029; expected `config.js` includes `env: "dev"`; the `vps-rackula` item's explanation reflects the rewrite; Related points at #2382.
- [ ] **Step 6:** `soak-smoke.md`: Vultr, not Linode; only the dev leg receives Access credentials and checks `/api/layouts`; the #1986 streak counts from the first run with both legs.
- [ ] **Step 7:** Prettier check all touched markdown; commit `docs: document the Workers-hosted dev surface (#2134)`.

### Task 7: Verify and open the PR

- [ ] `npm run lint`, `npm run test:run`, `npm run build`, `node scripts/gen-headers.mjs --check`, `bash scripts/check-header-parity.sh`, API tests from Task 1.
- [ ] `/code-review` on the branch, address findings.
- [ ] Push, open PR (`Closes #2134`), wait for CodeRabbit and CodeAnt, release the `in-progress` label on merge.
