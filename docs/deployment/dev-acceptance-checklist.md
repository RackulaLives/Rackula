# Dev-Env Acceptance Checklist

This is the one executable acceptance checklist for d.racku.la once it is served by the Cloudflare Worker instead of the VPS. It consolidates verification steps that were previously scattered as prose across #1985 (dev-arc tracker), #2134 (dev cutover: d.racku.la re-point and deploy-dev rewrite), and #2626 (Workers entry and CF storage driver). See #2677 for the consolidation issue.

## Status

d.racku.la is served by the `rackula-dev` Worker as of #2134. Deploy Dev automates most of these items on every deploy (`scripts/smoke-headers.sh --surface dev` on the preview URL, then the browser smoke on the live host). Run the full list by hand after a change to the Worker config, the Access app, or the R2 bucket.

Run the curl commands from a residential connection. Cloudflare serves a Managed Challenge to datacenter IPs, GitHub runners included, on every racku.la host (Bot Fight Mode on the Free plan), so a response carrying `cf-mitigated: challenge` never reached Access or the Worker.

## What this gates

Passing this checklist is the acceptance gate for #2134's done-when. Prod cut over first (#2029, 2026-08-22), so this no longer gates prod. Together with the soak window it gates the VPS decommission (#1986).

## Relationship to soak-smoke

This checklist is a one-time (or per-deploy) manual acceptance gate. The scheduled soak-smoke workflow (`.github/workflows/soak-smoke.yml`, documented in `docs/deployment/soak-smoke.md`) is the automated ongoing complement: once dev is live on Workers, soak-smoke's dev leg runs the browser smoke suite against `https://d.racku.la` every 6 hours using the same Cloudflare Access service-token secrets referenced below, proving a standing green streak rather than a single pass.

## Authentication

Items that hit `/api/*` authenticate the same way `deploy-dev.yml` and `soak-smoke.yml` do: a Cloudflare Access service token sent as the `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers, sourced from the `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` secrets.

## Checklist

- [ ] Unauthenticated request to `/api/layouts` returns a Cloudflare Access 302.

  Command: `curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://d.racku.la/api/layouts`

  Expected: HTTP 302, with `redirect_url` pointing at the Cloudflare Access login page.

- [ ] Authenticated request (CF Access service token) to `/api/layouts` returns 200 JSON.

  Command: `curl -sS -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" https://d.racku.la/api/layouts`

  Expected: HTTP 200 with a JSON array body.

- [ ] Layout round-trip: PUT then GET returns the same body with an `X-Rackula-Updated-At` echo and a newer-or-equal `updatedAt` (R2 monotonic token).

  Command: PUT an initial YAML layout to `https://d.racku.la/api/layouts/<uuid>` with the CF Access headers and capture the `X-Rackula-Updated-At` value from the response; PUT a changed body to the same UUID with the same headers and capture the second `X-Rackula-Updated-At`; then GET the same URL.

  Expected: both PUTs return 200 with an `X-Rackula-Updated-At` header (the header name is `UPDATED_AT_HEADER` in `api/src/routes/layouts.ts`); the second token is strictly newer than the first, which is what actually proves the R2 driver's monotonic-overwrite contract (covered by the shared storage contract in `api/src/storage/storage-contract.ts`) rather than just a single create-then-read; the GET returns the body and `updatedAt` from the second write.

- [ ] Asset content-type: `/assets/<hashed>.js` returns `application/javascript` with an immutable cache-control.

  Command: `curl -sI https://d.racku.la/assets/<hashed>.js` (substitute a real hashed filename from the deployed bundle)

  Expected: `Content-Type: application/javascript` and a `Cache-Control` containing `immutable`. The self-host nginx config serves the same path as `public, immutable` (`deploy/nginx.conf.template`); the Worker's asset serving should match.

- [ ] Headers by value on `/`: CSP, X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, HSTS, and dev-only `X-Robots-Tag: noindex`.

  Command: `curl -sI https://d.racku.la/`

  Expected: a `Content-Security-Policy` matching the shared policy (source of truth: `deploy/security-headers.conf`, do not hand-duplicate the full string here), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, a `Strict-Transport-Security` header, and `X-Robots-Tag: noindex`. The `X-Robots-Tag` header is dev-only and must not appear on prod.

- [ ] `config.js` reports `storage: "server"`.

  Command: `curl -sS https://d.racku.la/config.js`

  Expected: the body contains `window.__RACKULA_CONFIG__ = { storage: "server", env: "dev" }`. The build-time default is `storage: "browser"` (`static/config.js`); `deploy-dev.yml` overwrites it.

- [ ] `version.json` matches the deployed version and commit.

  Command: `curl -sS https://d.racku.la/version.json`

  Expected: `.version` equals the version being verified and `.commit` equals the short commit hash of the deployed build, the same shape `scripts/verify-version-alignment.sh` checks for self-host images.

- [ ] `vps-rackula` is absent from `.github/workflows/deploy-dev.yml`.

  Command: `grep -c vps-rackula .github/workflows/deploy-dev.yml`

  Expected: `0`. #2134 rewrote the workflow onto `ubuntu-latest` and wrangler.

- [ ] This checklist is wired into #2134's done-when.

  This item is about the consolidation, not a runtime check against d.racku.la. It is satisfied once #2134's issue body references this document as its acceptance gate.

## Related

- #2677: the consolidation issue this checklist implements.
- #2134: dev cutover (d.racku.la re-point and deploy-dev rewrite); consumes this checklist as its acceptance gate.
- #2382: Cloudflare migration epic (the old dev-arc tracker, #1985, closed 2026-09-17).
- #2626: Workers entry and CF storage driver; the local `wrangler dev` precursor to these live checks.
- #2029: prod cutover (shipped 2026-08-22, before dev).
- `docs/deployment/soak-smoke.md`: the scheduled ongoing health signal that complements this one-time gate.
- `docs/plans/2026-06-29-cloudflare-migration-plan.md`: Appendix, per-issue smoketests, original source of the exact commands consolidated here.
