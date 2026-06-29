# Session Report - M018 Cloudflare Spine (autonomous, no-credentials slice)

Date: 2026-06-29 Scope: land the storage-to-Workers API spine for milestone M018, each issue as its own PR, merged only after both review bots (CodeRabbit + CodeAnt) cleared and required CI was green. No Cloudflare dashboard actions, no `wrangler deploy`, no secrets, no DNS, no GitHub-environment changes.

## Outcome: all four in-scope items landed on `main`

| Issue | What it delivered | PR | Merge commit |
| --- | --- | --- | --- |
| #2624 | Storage driver interface + per-request DI seam | #2636 | `6b8344f` |
| #2625 | R2 driver + runner-agnostic contract harness | #2689 | `db24f00` |
| #2032 (self-host half only) | Self-host header + build-env parity guard | #2683 | `9599aa5` |
| #2626 | Workers entry + argon2-free bundle | #2706 | `927589d` |

`main` is at `927589d`. #2624, #2625, #2626 are closed as completed. #2032 was reopened (see Deferred, below).

## #2626 detail (this session's main work)

Adds the Cloudflare Workers entry that runs the shared Hono app with R2 wired via the env binding and `AUTH_MODE=none`, producing a Worker bundle free of `@node-rs/argon2` and `node:fs`. The self-host Bun path stays behaviour-identical.

- `app.ts`: static `./local-auth` (argon2) import broken - now `await import()` only when `authMode === 'local'`; filesystem-driver default is also a dynamic import; `package.json` version read via a named import so esbuild does not inline the dependency list (which holds the literal `@node-rs/argon2`) into the bundle.
- `worker.ts`: CF entry - `createR2Driver(env.LAYOUTS)` + shared app, with Access JWT validation in front. App built behind a shared in-flight promise (no cold-start race).
- `security/access-jwt.ts` (+ test): `jose` `Cf-Access-Jwt-Assertion` validator. Reads `CF_ACCESS_JWKS_URL` / `CF_ACCESS_ISSUER` / `CF_ACCESS_AUD` from env; `jwtVerify` pinned to RS256 with issuer + audience checks. Fail-closed semantics: fully-unset config skips (local `wrangler dev` / `AUTH_MODE=none`, returns 200 for smoke); partial config throws -> worker returns a non-cached 503; malformed JWKS URL -> controlled 403; missing token 401, invalid token 403.
- `logger.ts` + `logger-console.ts`: runtime logger seam (console-JSON on workerd, pino on Bun).
- `wrangler.jsonc`: dev worker (R2 `LAYOUTS` binding, `nodejs_compat`, `run_worker_first` for `/api/*`, wrangler floor pinned via package.json). Alias stubs for `@node-rs/argon2`, `pino`, `hono/bun`, and the filesystem driver keep the native addon, `node:fs`, and the Bun adapter out of the worker graph. Placeholders only - no real account/secrets.

### Verification (local, no deploy)

- `bun run typecheck`: clean
- `bun test`: 364 pass / 0 fail (includes 10 access-jwt tests)
- `vitest run --config vitest.workers.config.ts`: 10 pass (R2 contract under Miniflare)
- `npm run lint` + `prettier --check`: clean
- Bundle grep on the built `dist-worker/worker.js` (via `wrangler deploy --dry-run`, no auth): zero `@node-rs/argon2`, zero `node:fs` (only the sourcemap carries the doc-comment text).
- `wrangler dev --local` smoke (Miniflare R2, CF*ACCESS*\* unset): `/api/version` 200, `/api/health` 200, `/api/layouts` 200, `PUT /api/layouts/{uuid}` round-trips.

### Review notes

Both bots cleared the final head `13c79a2`. CodeAnt's two findings (malformed-URL 500s; cold-start race) were fixed. CodeRabbit's three actionable findings: the fail-open-on-missing-config one was fixed (partial -> fail closed), the stale compat-date was bumped, and the named-JSON-import one was withdrawn by CodeRabbit after it confirmed the named import is required for the bundle gate.

During the rebase onto current `main` (which had advanced to v26.6.5), a pre-existing `main` breakage surfaced: the v26.6.5 release commit (`30c67e9`) left `ACKNOWLEDGEMENTS.md` prettier-unclean (missing blank line after the `### v26.6.5` heading), which was failing the `validate` gate on every PR that merged main. Fixed in this PR.

## Deferred / not done (by design)

- CF `_headers` half of #2032: reopened #2032. The self-host half shipped in #2683; the CF-surface CSP/VITE parity ACs are blocked on #2029 (prod `_headers`) and #2134 (dev `_headers`). #2032 had been auto-closed when the self-host slice landed; reopened so the deferred ACs are not lost.
- e2e (self-hosted full suite) CI check is advisory (`continue-on-error`); its debt is tracked in #2643 / #2680, handled in another session. It is not merge-blocking.
- CodeRabbit "docstring coverage 50% < 80%" is an advisory pre-merge warning, not a required check; left as-is.

## Out of scope this session (not started)

#2675, #2134, #2029, #2030, #2031, #2676, #1986, the CF half of #2032, and trackers #2133 / #1985 / #1984 / #1983 / #2382.

## Exact next human step

1. Provision Cloudflare per #2675: create the R2 bucket, the Worker, the Cloudflare Access application, and set the real values that `wrangler.jsonc` and the Access validator read - `account_id`, the R2 `bucket_name` (replace `rackula-layouts-dev-placeholder`), and the secrets `CF_ACCESS_JWKS_URL`, `CF_ACCESS_ISSUER`, `CF_ACCESS_AUD`. (Code-only here; nothing in this slice touched the dashboard, DNS, or secrets.)
2. Run the #2134 dev cutover: rewrite the deploy-dev workflow to `wrangler deploy` the API worker, re-point `d.racku.la`, and verify the Access-JWT validation via post-deploy smoke (service-token request carrying the assertion).

After #2675 + #2134, the dev arc of the storage-to-Workers migration is live; prod follows its own track.
