# Cloudflare Workers Static Assets — External Research (Issue #2620)

Accessed 2026-06-26. All figures verified against official Cloudflare developer docs (`developers.cloudflare.com`). Every factual claim is inline-cited with the source URL. Where a fact could not be confirmed from official docs, it is flagged explicitly rather than guessed.

Goal: gather everything needed to author a production `wrangler` config and a GitHub Actions deploy job for hosting a pure static Vite SPA (`dist/`, no SSR, no prod Worker logic) at the custom domain `count.racku.la`, on the **Workers Static Assets** product (not Pages).

---

## 1. Assets-only Worker config (`wrangler.jsonc`)

**Worker script is optional for assets-only projects.** The `assets` configuration reference states plainly: "The `main` key is optional for assets-only Workers." (<https://developers.cloudflare.com/workers/wrangler/configuration/>). The Static Assets overview corroborates the runtime behaviour: if a request does not match an asset and no Worker script is present, a `404 Not Found` response is returned (<https://developers.cloudflare.com/workers/static-assets/>). So you can deploy with **no `main` entry at all** for a pure SPA.

`assets` block fields (from <https://developers.cloudflare.com/workers/wrangler/configuration/> and <https://developers.cloudflare.com/workers/static-assets/binding/>):

| Field | Required | Notes |
| --- | --- | --- |
| `directory` | yes (for non-Vite) | "The folder of static assets to be served. For many frameworks, this is the `./public/`, `./dist/`, or `./build/` folder." (<https://developers.cloudflare.com/workers/static-assets/binding/>) |
| `binding` | no | Programmatic access via `env.ASSETS.fetch()`. "Optional, and only useful when a Worker script is set with `main`." For assets-only you can omit it. (<https://developers.cloudflare.com/workers/wrangler/configuration/>) |
| `html_handling` | no | Default `"auto-trailing-slash"`. See item 2. |
| `not_found_handling` | no | Default `"none"`. See item 2. |
| `run_worker_first` | no | Default `false`. Not needed for assets-only. |

`compatibility_date` is a required top-level field; the docs advise setting it to today's date (<https://developers.cloudflare.com/workers/static-assets/>).

**Concrete minimal config for a Vite `dist/` SPA, assets-only (no `main`):**

```jsonc
{
  "name": "rackula",
  "compatibility_date": "2026-06-26",
  "assets": {
    "directory": "./dist",
  },
}
```

Deploy with `npx wrangler deploy` (single-step; see item 5 for the two-step versioned workflow). Note: `binding`/`ASSETS` is intentionally omitted because there is no Worker script to call `env.ASSETS.fetch()`.

---

## 2. SPA fallback routing (deep links)

To serve `index.html` for unknown paths (client-side routes / deep links), set `not_found_handling` to `"single-page-application"`. Documented behaviour: "When an incoming request does not match a file in the `assets.directory`, Workers will serve the contents of the `/index.html` file with a `200 OK` status." (<https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/>).

**`not_found_handling` values** (default `"none"`) (<https://developers.cloudflare.com/workers/wrangler/configuration/>):

- `"single-page-application"` — unmatched request returns `200 OK` with `/index.html`. Use this for the SPA.
- `"404-page"` — serves a custom `404.html` for unmatched requests (looks up the nearest `404.html` up the path tree). This is the option that wires up a custom 404 page; it is mutually exclusive with the SPA fallback.
- `"none"` (default) — returns a bare `404` with no body.

**`html_handling` values** (default `"auto-trailing-slash"`), which control redirects/rewrites of HTML requests (<https://developers.cloudflare.com/workers/wrangler/configuration/>):

- `"auto-trailing-slash"` (default)
- `"force-trailing-slash"`
- `"drop-trailing-slash"`
- `"none"`

For a typical SPA the default `html_handling` is fine; the SPA behaviour is driven entirely by `not_found_handling`.

**Exact SPA config:**

```jsonc
{
  "name": "rackula",
  "compatibility_date": "2026-06-26",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application",
  },
}
```

**Interaction with a custom `404.html`:** the SPA mode does not serve `404.html`; it always returns `index.html` with `200`. If you instead want a real 404 page, use `not_found_handling: "404-page"` (you cannot have both). For an SPA that owns its own routing/error UI, `"single-page-application"` is correct (<https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/>).

**Note on navigation requests (minor):** with compatibility date `2025-04-01`+ (or the `assets_navigation_prefers_asset_serving` flag), navigation requests bypass any Worker script and are served assets directly, which "reduces billable invocations of your Worker script" (<https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/>). For an assets-only deploy there is no Worker, so this is moot, but it is the current behaviour and worth knowing if a Worker is ever added.

---

## 3. Custom HTTP headers (`_headers` file)

**Yes — Workers Static Assets natively supports a Pages-style `_headers` file.** "`_headers` and `_redirects` files are supported natively in Workers with static assets." The file is "a plain text file called `_headers` without a file extension, in the static asset directory of your project" (i.e. inside `dist/`). "This file will not itself be served as a static asset, but will instead be parsed by Workers and its rules will be applied to static asset responses." (<https://developers.cloudflare.com/workers/static-assets/headers/>).

**Syntax** (<https://developers.cloudflare.com/workers/static-assets/headers/>): multi-line blocks; the first line is a URL or URL pattern, followed by indented `Name: Value` lines:

```text
/secure/page
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
/static/*
  Access-Control-Allow-Origin: *
```

**Path matching:** `*` (splat) greedily matches all characters; `:placeholder_name` matches all characters except the path delimiter; absolute URLs are supported (HTTPS only, no port) (<https://developers.cloudflare.com/workers/static-assets/headers/>).

**Precedence / combining:** "An incoming request which matches multiple rules' URL patterns will inherit all rules' headers." A header can be removed by prefixing its name with `!` (e.g. `! X-Frame-Options`). "If a header is applied twice in the `_headers` file, the values are joined with a comma separator." (<https://developers.cloudflare.com/workers/static-assets/headers/>).

**Limits** (<https://developers.cloudflare.com/workers/platform/limits/> and the headers page):

- Maximum **100** `_headers` rules (also listed as "`_headers` rules: 100" in Platform Limits).
- Each line in `_headers` has a **2,000-character** limit.
- (For reference, `_redirects` allows 2,000 static redirects, 100 dynamic redirects, 1,000 characters per rule.)

**Security headers — confirmed settable on served HTML:** Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy can all be set via `_headers` and are applied to static asset responses (including the HTML shell) (<https://developers.cloudflare.com/workers/static-assets/headers/>).

**Important limitation (does not affect this assets-only project):** "Custom headers defined in the `_headers` file are not applied to responses generated by your Worker code, even if the request URL matches a rule." If you use an SSR framework, `run_worker_first`, or any Worker script, you must set those headers in the Worker code instead (<https://developers.cloudflare.com/workers/static-assets/headers/>). Since `count.racku.la` is assets-only, the `_headers` file is sufficient — no Worker script is required to set CSP and friends.

So for Rackula: drop a `_headers` file into `dist/` (or have Vite emit it to the build output) and you get CSP/X-Frame-Options/etc. without writing any Worker. This is the recommended path; the Worker-script alternative (`run_worker_first` + a fetch handler) is unnecessary here.

---

## 4. Custom domain attach (`count.racku.la`)

Use a **Custom Domain** (not a Route). Custom Domains "point all paths of a domain or subdomain to your Worker," and are the recommended option when the Worker is the application's origin/server for the whole hostname (<https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>). Routes, by contrast, attach a Worker to specific path patterns (`example.com/*`) on an existing record and are for finer-grained control.

**Declared in `wrangler.jsonc`** with `custom_domain: true` (<https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>):

```jsonc
{
  "name": "rackula",
  "compatibility_date": "2026-06-26",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application",
  },
  "routes": [{ "pattern": "count.racku.la", "custom_domain": true }],
}
```

Running `npx wrangler deploy` creates the Custom Domain.

**DNS + TLS handled automatically:** "Cloudflare will create DNS records and issue necessary certificates on your behalf." Creating a Custom Domain "will also generate an Advanced Certificate on your target zone for your target hostname" with default settings. You do not edit DNS or manage certs manually (<https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>).

**Same-account requirement (satisfied — `racku.la` is on this account):** "You cannot create a Custom Domain on a hostname with an existing CNAME DNS record or on a zone you do not own." Practical implication: there must not be a pre-existing `count.racku.la` CNAME in the zone, or the create will fail (<https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>).

**Proxied / orange-cloud:** the docs state the auto-created record routes traffic to the Worker, but they do **not** explicitly use the "proxied / orange-cloud" label for the Custom Domain record. By design, Custom Domain traffic flows through Cloudflare's edge to the Worker (it is a Cloudflare-managed record, not a user-editable DNS-only entry), so it is effectively proxied. I could not find an official sentence that uses the orange-cloud terminology for Custom Domains — flagging this as not explicitly documented (<https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>).

**Propagation/activation:** the Custom Domains page does not state an activation time; it only notes certificate provisioning happens automatically. There is typically a short delay for cert issuance, but no official figure is documented — do not assume an SLA. Flagging as not documented (<https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>).

**Cleanup caveat:** deleting a Custom Domain does **not** auto-delete its Advanced Certificate; remove it manually from the dashboard (<https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>).

---

## 5. Versioned deploys + rollback model

**Two-step workflow** (<https://developers.cloudflare.com/workers/configuration/versions-and-deployments/>):

1. `wrangler versions upload` — "creates a version without immediate deployment." It "uploads a new version of your Worker and returns a preview URL for each version uploaded" (<https://developers.cloudflare.com/workers/configuration/previews/>).
2. `wrangler versions deploy` — deploys a previously-uploaded version, "all at once or gradually" (interactive prompt for split percentages) (<https://developers.cloudflare.com/workers/configuration/versions-and-deployments/>).

**`wrangler deploy` differs:** it is the single-step path — "a new version that is automatically deployed to 100% of traffic" in one operation (<https://developers.cloudflare.com/workers/configuration/versions-and-deployments/>).

**Preview URLs** (<https://developers.cloudflare.com/workers/configuration/previews/>):

- Format: `<VERSION_PREFIX>-<WORKER_NAME>.<SUBDOMAIN>.workers.dev`.
- "Every time you create a new version of your Worker, a unique static version preview URL is generated automatically" — so each version's preview URL is **stable and unique per version**, which makes it directly smoke-testable with Playwright before promoting.
- Enabled by default when `workers_dev` is enabled; controllable via `"preview_urls": true|false` in `wrangler.jsonc`.
- Optional **aliased preview URLs** (`--preview-alias`) give a persistent human-readable alias to a version.
- Caveat: preview URLs are only available for versions uploaded after 2024-09-25.

**Versions include static assets — confirmed.** A version "tracks historical changes to bundled code, static assets and changes to configuration like bindings and compatibility date and compatibility flags over time" (<https://developers.cloudflare.com/workers/configuration/versions-and-deployments/>). This is the key fact: an assets-only deploy still produces a normal Worker _version_, so the upload -> preview-URL -> deploy -> rollback machinery applies.

**Assets-only caveat — flagged.** The docs confirm static assets are part of a version, but they do **not** publish an explicit "assets-only project" example for `wrangler versions upload`/preview URLs. The only documented restriction on versioned uploads is "Service worker syntax is not supported for versions that are uploaded through `wrangler versions upload`" — that constraint is about Worker _code format_ and does not apply to an assets-only project that ships no code (<https://developers.cloudflare.com/workers/configuration/versions-and-deployments/>). Practical read: versioned uploads + preview URLs should work for assets-only, but because there is no official assets-only worked example, treat the preview-URL smoke test as something to verify hands-on during the spike rather than as a documented guarantee. (Also note item 7: preview URLs depend on `workers_dev`/`preview_urls` being enabled.)

**Rollback** (<https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/>):

- `wrangler rollback` (optionally with a version ID) — "Rolling back to a previous version of your Worker will immediately create a new deployment ... [and] become the active deployment across all your deployed routes and domains." Rollback is **instant** (all-at-once), not gradual.
- You can roll back to "the 100 most recently published versions." In interactive mode you pick from up to 100 recent versions; for older ones, "specify the version ID directly on the command line."
- You can equivalently re-deploy any prior version with `wrangler versions deploy <version-id>`.
- Caveat: rollback does **not** revert connected resources (KV/D1/R2 bindings, data structures). Not relevant for an assets-only SPA with no bindings.

For Rackula CI, the clean model is: `wrangler versions upload` -> Playwright smoke test against the version preview URL -> `wrangler versions deploy` (promote 100%) -> on failure, `wrangler rollback` to the prior version.

---

## 6. Minimal API token permissions

The official Cloudflare GitHub Actions guide directs you to the **"Edit Cloudflare Workers"** custom token template and to scope it to only the target account (and zone) (<https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/>).

**"Edit Cloudflare Workers" template contents** (<https://developers.cloudflare.com/fundamentals/api/reference/template/>):

- Account-level: **Workers Scripts Write**, **Workers KV Storage Write**, **Workers R2 Storage Write**, **Account Settings Read**, **User Details Read**, **User Memberships Read**.
- Zone-level: **Workers Routes Write**, **Workers Tail Read**.

This template is sufficient for `wrangler deploy`, `wrangler versions upload`, and `wrangler versions deploy`, and the zone-level **Workers Routes Write** covers attaching the Custom Domain (`routes` + `custom_domain: true`). For a truly minimal set you could prune to roughly: **Workers Scripts: Edit** (account) + **Account Settings: Read** (account) + **Workers Routes: Edit** (zone) + **Zone: Read** (zone, to resolve the zone for the custom domain). The docs do not publish a hand-tuned minimal list, so the safe, officially documented choice is the "Edit Cloudflare Workers" template scoped to the one account/zone (<https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/>).

**"Workers Scripts" is account-wide — confirmed.** The permissions reference categorizes "Workers Scripts Read" and "Workers Scripts Edit" under **Account permissions** (scope `com.cloudflare.api.account`); they grant access to Workers scripts at the account level and **cannot be restricted to individual zones or specific resources** (i.e. not to a single Worker) (<https://developers.cloudflare.com/fundamentals/api/reference/permissions/>). The practical consequence: the deploy token can edit _every_ Worker in the selected account; the tightest scoping available is account selection, not per-Worker.

**Custom-domain DNS/SSL token permissions — partially documented.** Cloudflare creates the DNS record and Advanced Certificate "on your behalf" when a Custom Domain is created (item 4), and the official GitHub Actions path uses only the "Edit Cloudflare Workers" template (whose zone permission is Workers Routes Write) to deploy Workers with custom domains. The docs do **not** explicitly state that a separate DNS:Edit or SSL/Certificates permission must be added to the token for custom-domain creation. Flagging as not definitively documented: if a custom-domain create fails with a permissions error in CI, add **Zone: Read** and, if needed, **DNS: Edit** / **SSL and Certificates: Edit** for the `racku.la` zone (<https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/>, <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>).

---

## 7. Free-tier limits / headroom

**Static asset requests are free and unmetered — they do NOT count against the 100,000 Workers requests/day free limit.** "Requests to static assets are free and unlimited. Requests to the Worker script (for example, in the case of SSR content) are billed according to Workers pricing." There is "no additional cost for storing Assets." (<https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>). The 100,000 requests/day Free-plan ceiling applies to Worker-script invocations (<https://developers.cloudflare.com/workers/platform/limits/>) — for an assets-only SPA there are none, so the daily limit is effectively not a concern. (The only way to hit it is to introduce `run_worker_first` patterns, which then count and can return `429` once exhausted (<https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>).)

**Asset count and size limits** (<https://developers.cloudflare.com/workers/platform/limits/>, increase announced <https://developers.cloudflare.com/changelog/2025-09-02-increased-static-asset-limits/>):

- Max assets per Worker version: **20,000 (Free plan)** / **100,000 (Paid plan)**.
- Max individual asset size: **25 MiB** (both plans).
- Total deployment / aggregate-size cap: **not documented** as a single number on the limits page (the governing limits are the per-version file count and the 25 MiB per-file size). Flagging as not stated.
- Max file path length: **not documented** in the consulted pages. Flagging as not stated.

**Headroom verdict:** a low-traffic public Vite SPA fits the Free tier comfortably. A typical Vite `dist/` is well under a few hundred files and far below 20,000; no individual bundle approaches 25 MiB; and static-asset request volume is free/unmetered regardless of traffic. The only Free-plan request ceiling (100k/day) does not apply because there is no Worker script (<https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>, <https://developers.cloudflare.com/workers/platform/limits/>).

---

## 8. Smoke-testability + caching

**Default headers Workers attaches to static assets** (<https://developers.cloudflare.com/workers/static-assets/headers/>):

- `Cache-Control: public, max-age=0, must-revalidate` (applied when the request has no `Authorization` or `Range` header). This tells the browser it may cache but must revalidate freshness every time before use.
- An `ETag` (a hash of the file), so revalidation uses `If-None-Match` / `304` without re-downloading unchanged assets.

By default both the HTML shell and hashed assets get the same conservative `max-age=0, must-revalidate`, so clients always revalidate. That default already makes deploy verification safe: a new shell is picked up on the next request because the browser revalidates.

**Yes — you can split caching (immutable `/assets/*` + revalidated `index.html`) via `_headers`** (<https://developers.cloudflare.com/workers/static-assets/headers/>). Vite emits content-hashed filenames under `assets/`, which are safe to cache immutably; the HTML shell should revalidate so a new deploy is seen immediately. The shell entries below use `Cache-Control: no-cache` to match the current nginx SPA-shell directive (`deploy/nginx.conf.template`, `location /`) exactly; CF's default `public, max-age=0, must-revalidate` is semantically equivalent (both force revalidation) but is not byte-identical:

```text
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/index.html
  Cache-Control: no-cache
/
  Cache-Control: no-cache
```

This gives long-lived caching for fingerprinted bundles while guaranteeing the SPA shell (and root path) is re-fetched/revalidated on every deploy, so Playwright smoke tests and real clients always pick up the new version. The default behaviour (everything `max-age=0, must-revalidate`) is already smoke-test-friendly; the `_headers` override above is the performance optimization for repeat visitors (<https://developers.cloudflare.com/workers/static-assets/headers/>).

---

## Appendix: production config skeleton (synthesis)

`wrangler.jsonc` for `count.racku.la` (assets-only SPA), combining items 1, 2, 4:

```jsonc
{
  "name": "rackula",
  "compatibility_date": "2026-06-26",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application",
  },
  "routes": [{ "pattern": "count.racku.la", "custom_domain": true }],
}
```

`dist/_headers` (Vite must emit this into the build output; items 3 + 8):

```text
/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: ...
  Content-Security-Policy: ...
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/index.html
  Cache-Control: no-cache
```

CI deploy (items 5 + 6): token = "Edit Cloudflare Workers" template scoped to the one account + `racku.la` zone; flow = `wrangler versions upload` -> Playwright against the version preview URL -> `wrangler versions deploy` -> `wrangler rollback` on failure.

### Sources

- <https://developers.cloudflare.com/workers/static-assets/>
- <https://developers.cloudflare.com/workers/static-assets/binding/>
- <https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/>
- <https://developers.cloudflare.com/workers/static-assets/headers/>
- <https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>
- <https://developers.cloudflare.com/workers/wrangler/configuration/>
- <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>
- <https://developers.cloudflare.com/workers/configuration/versions-and-deployments/>
- <https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/>
- <https://developers.cloudflare.com/workers/configuration/previews/>
- <https://developers.cloudflare.com/workers/platform/limits/>
- <https://developers.cloudflare.com/changelog/2025-09-02-increased-static-asset-limits/>
- <https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/>
- <https://developers.cloudflare.com/fundamentals/api/reference/template/>
- <https://developers.cloudflare.com/fundamentals/api/reference/permissions/>
