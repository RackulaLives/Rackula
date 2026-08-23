# Cloudflare prod runbook (count.racku.la)

Production is an **assets-only** Cloudflare Worker: `wrangler.jsonc` at the repo root, no `main`, no bindings, no API. The frontend runs in browser-storage mode and stores nothing server-side, so there is no prod database, no volume, and nothing to back up.

Related: [`cloudflare-token-rotation.md`](cloudflare-token-rotation.md), [`RELEASE-PIPELINE.md`](RELEASE-PIPELINE.md), [`soak-smoke.md`](soak-smoke.md).

## Standing invariants

- **Never add a `main` to `rackula-prod`.** Static-asset requests are unmetered only while no Worker script sits on the hot path. Adding one meters every request against the Workers free-tier limit. This constrains the analytics beacon (#2030) and preview deploys (#2031); both must stay assets-only.
- **Never commit `_headers` or `.assetsignore` to `static/`.** Vite's `publicDir` copies `static/` verbatim into every `dist/`, including the Docker and LXC self-host images. Both files are generated into `dist/` in the deploy step instead.
- **Never hand-edit header values.** `deploy/security-headers.conf` is the source of truth; `scripts/gen-headers.mjs` transcribes it and CI runs `--check` in both directions.
- **`login.html` is stripped from the prod artifact only**, in the deploy step, never by branching `vite.config.ts`. The self-host builds need it.

## Steady state: a normal release

Nothing manual. `/release` tags, `release.yml` gates, a maintainer approves the `prod` environment once at `promote-gate`, and `deploy-prod.yml` does:

1. Build the tag with `.git` present, so `version.json.commit` is populated.
2. Generate `_headers` and `.assetsignore`; strip `login.html`; assert `config.js`, version and commit.
3. `wrangler versions upload` -> a per-version preview URL. **No traffic yet.**
4. Fail-closed smoke against that preview URL: `scripts/smoke-headers.sh` plus the Playwright deploy smoke.
5. `wrangler versions deploy <id>@100%`, then `wrangler triggers deploy`.
6. Re-run both smokes against `https://count.racku.la`.

No percentage rollouts. Cloudflare documents a mixed-version hazard where HTML served by one version references hashed assets that exist only in another, and version affinity needs a request header browsers do not send.

`wrangler versions deploy` does **not** apply trigger changes. If `wrangler.jsonc`'s `routes` change, `wrangler triggers deploy` is what lands them (the workflow runs it every time).

## Rollback

Run the **Rollback Prod** workflow with a Worker version id. It has its own concurrency group and does not traverse `release.yml`'s approval gate, so it does not queue behind the deploy it is undoing.

```bash
npx wrangler@4.124.0 versions list --name rackula-prod   # find the id
gh workflow run rollback-prod.yml -f version_id=<uuid> -f reason="..."
```

Cloudflare retains the last 100 versions. The previous version id is also in every Deploy Prod run summary.

There is **no VPS fallback.** The epic design spec assumed the old prod container would stay running as a DNS-level rollback; that origin stopped answering in August 2026 (#3167), which is what forced this cutover. Rolling back means deploying an earlier Worker version.

## How the hostname is attached

`count.racku.la` is bound with a **Workers route**, not a Custom Domain:

```jsonc
"routes": [{ "pattern": "count.racku.la/*", "zone_name": "racku.la" }]
```

At cutover the hostname already had a healthy proxied DNS record and edge certificate, and the origin was returning 522. A route intercepts ahead of the origin, so the cutover needed no DNS change, no certificate wait, and no delete-then-attach window (a Custom Domain cannot be created over an existing record, and the zone's SOA minimum is 1800s, so that path risked up to 30 minutes of NXDOMAIN). Rollback is removing the route entry and redeploying.

The original Custom Domain approach remains valid and is documented in the epic design spec if the route ever needs replacing.

## Bootstrap, as executed (2026-08-22)

One-time, out-of-band, not through `release.yml`. Recorded because the next surface (#2134, dev) will repeat it.

1. Built **v26.7.0**, the release that was live before the outage, from a clean `git worktree` of the tag. Not `main`, which was 91 commits ahead.
2. `wrangler versions upload` **fails on a Worker that does not exist yet** ("You cannot upload a new version of a Worker that does not yet exist"). Bootstrap with a plain `wrangler deploy`. This is safe precisely because no hostname is attached: a deployed-but-unrouted Worker takes zero traffic. The upload-then-promote ordering only matters once a hostname is bound.
3. Smoked the workers.dev URL, then added the route and redeployed.
4. Turned `workers_dev` back off, leaving one public surface.

### Build from a clean checkout, always

`publicDir` copies `static/` verbatim, and gitignored files are still copied. At the time of the cutover the working tree's `dist/` contained `.claude/settings.local.json` (ignored via the _user-global_ ignore file, so invisible to `git status`) and two `.DS_Store` files. Deploying from that tree would have published a local editor config to a public origin.

CI is unaffected, because a fresh checkout has neither. Hand-run deploys are the exposure. Two defences, both in place: build from a clean worktree, and `.assetsignore` lists `.DS_Store` and `.claude/**`. `scripts/smoke-headers.sh` asserts all four paths are unreachable.

## Zone-level HSTS (resolved, #3214)

`scripts/gen-headers.mjs` emits `Strict-Transport-Security: max-age=31536000; includeSubDomains`, matching nginx.

At cutover the live host returned `max-age=0` instead. The cause was zone-scoped, not this Worker: every `racku.la` hostname returned `max-age=0` while the same Worker on `*.workers.dev` returned the correct value, which isolated it to a zone-level control. Disabling zone HSTS in the Cloudflare dashboard let each Worker's own `_headers` value through, and `count.racku.la` now serves the expected value.

`smoke-headers.sh` asserts the value strictly as part of the by-value header diff, and separately asserts there is exactly **one** `Strict-Transport-Security` header. That second check is deliberate: re-enabling zone HSTS would either replace the Worker's value again or emit a duplicate, and both should fail the next deploy loudly rather than drift.

Do not enable zone HSTS with `includeSubDomains`: it applies to every proxied hostname in the zone, including `d.racku.la` and any future host, which is the cross-subdomain blast radius the epic design spec warns against. Per-host HSTS via `_headers` is the mechanism this repo uses.

## Verifying prod by hand

```bash
scripts/smoke-headers.sh https://count.racku.la --live \
  --expect-version 26.7.0 --expect-commit 792a7d17

SMOKE_TEST_URL=https://count.racku.la npm run test:e2e:smoke
```

`scripts/smoke-headers.sh` exists because `e2e/deploy-smoke.spec.ts` does not cover this ground: it proves the bundle boots in a real browser, but asserts nothing about headers, content types, SPA-fallback behaviour, or version/commit matching, and it tolerates an empty commit. Both are needed.

The content-type assertions matter more here than on nginx. `not_found_handling: "single-page-application"` turns every unmatched path into `200` + `index.html`, so a missing asset returns a cheerful HTML page rather than a 404, and `nosniff` then stops the browser executing it. A smoke test that only checks for `200` cannot see that failure.
