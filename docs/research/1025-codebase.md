# Spike #1025 - Frontend Cloudflare Hosting: Codebase Inventory

Scope: inventory the Rackula FRONTEND for hosting on Cloudflare Workers Static Assets
(prod `count.racku.la`), plus a CF dev/preview environment, and the three optional CF
features (R2 images, KV share-shortening, CF Web Analytics). Backend `rackula-api` is out
of scope except where the frontend talks to it. Effort estimates factor heavy
Claude-assisted codegen (human effort is lower than raw LOC implies).

All paths relative to the worktree:
`/Users/gvns/code/projects/Rackula/Rackula/.worktree/Rackula-issue-1025`.

---

## Build & Output

Pure static Vite build. No SvelteKit, no adapter, no server runtime required to serve it.

- `package.json:16` - `"build": "vite build"`. Plain Vite. Dependencies list has no
  `@sveltejs/kit` and no adapter (`package.json:76-96`). `svelte.config.js` is just the
  vite-plugin-svelte preprocessor.
- `vite.config.ts:138` - `base: process.env.VITE_BASE_PATH || "/"`. Base path is an
  env var, set per deployment. Docker/local default `/`. The comment at `vite.config.ts:135-137`
  still references "GitHub Pages: /Rackula/" - a stale artifact, see Doc Discrepancies.
- `vite.config.ts:181-184` - TWO HTML entry points via rollup `input`:
  `main: index.html` and `login: login.html`. Build emits hashed JS/CSS into
  `dist/assets/` plus both `index.html` and `login.html` at the dist root.
- `vite.config.ts:116-132, 142-146` - `emitVersionJson` plugin writes
  `dist/version.json` = `{ version, commit, buildTime }`. Served at `/version.json`,
  readable over HTTP without executing JS. Prod release verification curls this
  (`.github/workflows/deploy-prod.yml:84`).
- `vite.config.ts:139` - `publicDir: "static"`. Everything in `static/` is copied
  verbatim into `dist/` (favicons, `og-image.png`, `robots.txt`, `404.html`, fonts,
  badges, brand). `static/404.html` is a GitHub-Pages SPA-redirect shim (legacy).
- `vite.config.ts:179` - `assetsInlineLimit: 0`. Nothing inlined as base64; device
  images stay as separate fingerprinted files (relevant to caching + R2).
- `vite.config.ts:186-224` - manual chunks: `vendor-svelte`, `vendor-zod`,
  `vendor-archive` (jszip/js-yaml), `vendor-icons`, `data-brandpacks`, and
  `data-images` (the bundled device-image manifest, see Image/Asset Serving).
- `vite.config.ts:155-169` - build-time `define`s: `__APP_VERSION__`, `__BUILD_TIME__`,
  `__COMMIT_HASH__`, `__BRANCH_NAME__`, `__GIT_DIRTY__`, `__BUILD_ENV__` (from
  `VITE_ENV`). Note `__PERSIST_ENABLED__` was removed in favour of runtime API detection.

Conclusion: `vite build` -> `dist/` is a self-contained static bundle. Any static host
(CF Workers Static Assets, CF Pages, nginx, `vite preview`) can serve it with no server
logic. Effort to host the baseline static bundle on CF: Trivial.

---

## Routing & Entry Points

No client-side router library. No SvelteKit, no svelte-spa-router/tinro/svelte-routing
(grep confirms only device-category "router" string matches, not a routing dep). The app
is a single mounted Svelte component.

- `src/main.ts` - mounts `App.svelte` into `#app` (the `index.html` entry).
- `src/login.ts` - mounts `LoginForm.svelte` into `#login-app` (the `login.html` entry).
- "Routing" inside the app is purely query-param driven, no path routes and no History
  pushState navigation:
  - Share param: `?l=<blob>` read by `getShareParam()` (`src/lib/utils/share.ts:395-399`)
    via `URLSearchParams(window.location.search)`, consumed in `App.svelte:188`. After
    load it is stripped with `history.replaceState` in `clearShareParam()`
    (`share.ts:405-410`). This is replaceState only - not navigation.
  - Login next-path: `?next=<path>` read in `LoginForm.svelte:11-22`.
- index.html vs login.html - they are two separate static documents. login.html is NOT
  reached by client routing; it is reached by the server (nginx) deciding to serve it:
  - `deploy/nginx.conf.template:115-128` - `GET /auth/login` in local-auth mode
    `rewrite ^ /login.html last`. In OIDC mode it proxies to the API instead.
  - `deploy/nginx.conf.template:266-271` - `/login.html` is only servable when
    `auth_mode=local`, else returns 404.
  - On successful login, `LoginForm.svelte:42` does `window.location.href = next` - a full
    document navigation back to `/` (index.html).
- SPA fallback today: `deploy/nginx.conf.template:274-278` - `location / { try_files
  $uri $uri/ /index.html; }`. Unknown paths fall back to index.html. There are also
  GitHub-Pages-era fallback shims that are inert on a real SPA-fallback host:
  `index.html:33-42` (sessionStorage redirect replay) and `static/404.html` (path-stripping
  redirect). These are harmless leftovers.

What a static host needs to serve both entries correctly:

- A catch-all/SPA fallback that serves `index.html` for unmatched routes (CF Workers
  Static Assets: `not_found_handling = "single-page-application"` or a Worker fetch
  handler; CF Pages: a `_redirects` `/* /index.html 200`).
- A decision on `login.html`. On static prod with NO API, login.html is non-functional
  (its only action POSTs to `/api/auth/login`, which does not exist). Prod is currently
  shipped with `RACKULA_AUTH_MODE=none`, so the login page is never served anyway. For
  CF static prod, the cleanest path is to NOT route to login.html at all (omit it, or let
  it 404). For a CF dev/preview that wants to exercise auth, login.html only works if it
  can reach a real `/api/auth/login` (the homelab rackula-api), which means a reverse
  proxy/route, not pure-static. Effort to wire SPA fallback on CF: Trivial.

---

## API Coupling & Static-Prod Mode

The frontend is API-optional by design. It detects the API at runtime and degrades to a
local-only (localStorage + file import/export) app when no API is present.

- Base URL: `src/lib/utils/persistence-config.ts:10` -
  `API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api"`. Default is the SAME-ORIGIN
  relative path `/api`. In Docker/LXC, nginx proxies `/api/*` to the rackula-api sidecar
  (`deploy/nginx.conf.template:178-202`, strips the `/api` prefix). Because it is
  same-origin, the browser never does cross-origin CORS in the default deployment.
  `VITE_API_URL` (build-time) can point it at an absolute cross-origin URL, in which case
  the API's Hono CORS applies (`api/src/app.ts:321-322`, `CORS_ORIGIN`).
- Runtime detection: `src/lib/stores/persistence.svelte.ts` holds reactive
  `apiAvailable` (null until checked). `initializePersistence()` calls
  `checkApiHealth()` once at startup (`persistence-api.ts:117-169`), which GETs
  `${API_BASE_URL}/health`, requires `content-type: application/json` AND a strict
  payload shape (`{ ok:true, status:"ok", service:"rackula-persistence-api", version:<num> }`).
  The strict check exists specifically so an SPA-fallback HTML response to `/api/health`
  is NOT mistaken for a live API (`persistence-api.ts:139-149`). All CRUD calls
  (`listSavedLayouts`, `loadSavedLayout`, `saveLayoutToServer`, `deleteSavedLayout`,
  `uploadAsset`) short-circuit with `isApiAvailable()` guards.
- "prod static, no API" mode: this is exactly how prod runs today. `count.racku.la`
  serves the static frontend with NO API behind it. Confirmed in
  `deploy-prod.yml:70-72`: "Public prod (count.racku.la) serves the static frontend
  only - it has no API/persistence backend by design (no user-data storage), so
  /api/version intentionally returns 503." In compose, the API is gated behind a
  `profiles: [persist]` (`docker-compose.yml:86-87`); prod does not enable that profile.
  In this mode `checkApiHealth()` fails -> the app shows the Start Screen and works as a
  pure client-side designer: localStorage autosave, file save/load (jszip/yaml),
  share-by-URL, export (PDF/PNG/SVG/CSV). No server is needed.
- login.html with no API: NOT functional and NOT needed. `LoginForm.svelte:32` POSTs to
  `/api/auth/login`; with no API that fails with the "Unable to reach the server" catch
  (`LoginForm.svelte:53-54`). Prod runs `RACKULA_AUTH_MODE=none`
  (`docker-compose.yml:50`, `deploy/Dockerfile:49`), so login is bypassed entirely.
  => For CF static prod, login.html can be dropped.

Implication for CF: the static frontend on CF, with no `/api`, is the already-supported
"static-prod" mode. The CF dev/preview that wants persistence/auth must reach the homelab
rackula-api via an absolute `VITE_API_URL` (cross-origin -> API CORS must allow the CF
dev origin) or via a CF route/Worker proxying `/api` to the homelab. Effort to make the
CF static prod work: Trivial (it is the existing no-API mode). Effort to wire a CF dev to
the homelab API (CORS + routing): Small.

---

## Share Mechanism

Share (Ctrl+H) is 100% client-side. Layouts are encoded entirely in the URL query string.
No server involvement, no storage.

- `src/lib/utils/share.ts:315-324` `encodeLayout()`: Layout -> MinimalLayoutV2 (short
  field names, only used device types) -> JSON -> `LZString.compressToEncodedURIComponent`.
- `share.ts:380-389` `generateShareUrl()`:
  `${window.location.origin + pathname}?l=${encoded}`. The whole layout rides in `?l=`.
- `share.ts:337-370` `decodeLayout()`: lz-string first, with a pako-gzip+base64url
  fallback for legacy links; validates with `MinimalLayoutV2Schema`/`MinimalLayoutSchema`.
- `ShareDialog.svelte` renders a QR code and warns "Device images are not included"
  (`ShareDialog.svelte:192`) - confirming shares carry only layout structure, never images.

KV-shortening design consequence: today the entire payload is the URL, which grows with
layout size (the QR is cleared when too large, `ShareDialog.svelte:62`). A CF KV
short-link feature would store the encoded blob in KV under a short key and serve a short
URL (e.g. `count.racku.la/s/<key>` -> redirect/hydrate). This is purely additive: the
existing `?l=` path must remain (offline/self-host parity).

Self-host equivalent (must-preserve rule): the short-link store needs a rackula-api
endpoint (e.g. `POST /api/shares` -> id, `GET /api/shares/:id` -> blob) so self-hosters
get real short links, not just the long `?l=` fallback. The frontend would call the KV
Worker on CF and the same logical endpoint on rackula-api when an API is present, falling
back to inline `?l=` when neither exists. Effort: KV Worker side Small; rackula-api
parity endpoint Small-Medium (new route + storage, backend work, but out of THIS spike's
build scope - flag as a backend follow-up).

---

## Image/Asset Serving

Two distinct image paths exist; only the user-upload path touches the API.

1. Bundled (built-in) device images - compiled into the bundle, served as static files:
   - `src/lib/data/bundledImages.ts` (auto-generated, ~1700 lines) `import`s every
     device image from `$lib/assets/device-images/...webp`. Vite turns each into a
     fingerprinted file under `dist/assets/` (the `data-images` manual chunk maps the
     slug->URL table; `vite.config.ts:219-223`).
   - `getBundledImage(slug, face)` (`bundledImages.ts:1707`) returns the Vite-emitted URL.
   - `src/lib/stores/images.svelte.ts:108-131` `loadBundledImages()` loads them into the
     image store with `isBundled: true`.
   - Source images live in `assets-source/device-images/`; `scripts/process-images.ts`
     and `scripts/generate-bundled-images.ts` (npm `process-images`,
     `generate-bundled-images`) regenerate `bundledImages.ts`. These are BUILD-TIME tools,
     not a runtime service.
   => Bundled images need no API and no R2 today; they are just static files in `dist/`.
   On CF Workers Static Assets they ship and cache like any other asset.

2. User-uploaded images - go through the API when present, else stay client-side:
   - Upload: `persistence-api.ts:373-422` `uploadAsset()` -> `PUT
     /api/assets/:layoutUuid/:slug/:face`. Display URL:
     `persistence-api.ts:428-434` `getAssetUrl()`. Both guarded by `isApiAvailable()`.
   - Backend storage: `api/src/routes/assets.ts` + `api/src/storage/assets.ts`
     (filesystem-backed under `/data`, with `quota.ts`). This is the current
     "self-host equivalent" backend.
   - With NO API (static prod), uploads are held as data URLs in the image store
     (`images.svelte.ts:98-102` returns `url ?? dataUrl`; `ImageUpload.svelte` produces
     `ImageData.dataUrl`). They live only in the browser/export, never uploaded.

R2 design consequence: R2 is relevant to the USER-UPLOAD path (and optionally to offload
the bundled images off the Worker bundle). A CF R2 feature would let prod accept uploads
without the VPS API: Worker `PUT/GET /assets/...` backed by R2. Self-host parity already
exists via `api/src/storage/assets.ts` (filesystem). So R2 is the CF-side equivalent of
the existing filesystem asset store - the self-host rule is already satisfied for this
feature. Bundled images do NOT need R2 (they are fine as static assets), though serving
them from R2 could shrink the Worker asset count. Effort: Worker+R2 upload/serve Small;
keeping data-URL fallback Trivial (already exists).

---

## Analytics Today

There is NO analytics code in the shipping app. Umami was fully removed.

- Full-repo grep for `umami|cloudflareinsights|plausible|posthog|gtag|google-analytics|
  matomo|web-analytics|beacon` finds matches ONLY in `CHANGELOG.md` (the removal note,
  v26.6.x: "Umami analytics removed entirely from source code, deployment config, and
  documentation"). No matches in `src/`, `index.html`, `login.html`, `static/`, or any
  workflow.
- No analytics `<script>` in either HTML entry. `index.html` has only the
  SPA-redirect shim; `login.html` is bare.

Where a CF Web Analytics beacon would slot in: Cloudflare Web Analytics is a single
`<script defer src="https://static.cloudflareinsights.com/beacon.min.js"
data-cf-beacon='{"token":"..."}'></script>`. It would go in `index.html` `<head>`
(and `login.html` if that entry is kept). It is cookieless and free. On CF Workers Static
Assets / Pages, CF can also auto-inject Web Analytics at the zone level (no code change at
all). Effort: Trivial.

---

## Self-Host Artifacts

The frontend self-host story is "build dist/, serve it with nginx, optionally proxy /api
to rackula-api". Two parallel deployment families: Docker and LXC.

Docker:
- `deploy/Dockerfile` - multi-stage: `node:22-alpine` builds (`npm ci` + `npm run
  build`), then `nginxinc/nginx-unprivileged:alpine` serves `dist/` at
  `/usr/share/nginx/html` (`deploy/Dockerfile:63`). Bakes in nginx config + entrypoint.
- `deploy/nginx.conf.template` - envsubst template (Docker). SPA fallback
  (`try_files ... /index.html`, line 277), `/assets/` immutable 1y caching (line 85-92),
  `/api/*` proxy to the API sidecar (line 178-202), auth_request gating + local/OIDC
  login routing (lines 113-278), `/api/health` passthrough for runtime detection
  (line 103-111). Note: still carries `ARG VITE_PERSIST_ENABLED` in the Dockerfile
  (lines 9-11) even though that flag was removed from the app - dead build arg.
- `deploy/docker-entrypoint-wrapper.sh`, `deploy/security-headers.conf`,
  `deploy/nginx-auth-proxy.conf` - supporting config snippets.
- `docker-compose.yml` (root) - `rackula-app` always on; `rackula-api` behind
  `profiles: [persist]` (lines 86-87). Static-only = run without the profile (prod);
  with-storage = `--profile persist` (dev). `deploy/docker-compose.persist.yml` is the
  persist variant; `scripts/check-compose-persist-parity.sh` enforces that both compose
  files keep the same persistence env lines (CORS_ORIGIN, write token, etc.), wired into
  CI `.github/workflows/compose-parity.yml`.

LXC:
- `deploy/lxc/nginx.conf` - static (no envsubst) nginx variant; token injection via a
  generated snippet `rackula-api-token.conf`; no auth_request. Cross-references the Docker
  template and warns to keep both in sync.
- `deploy/lxc/rackula-api.service`, `nginx.service.d-override.conf`,
  `security-headers.conf` - systemd + hardening.
- `deploy/lxc/community-scripts/{ct/rackula.sh, install/rackula-install.sh, json,
  README.md}` - Proxmox community-scripts install path.

How the frontend is served when self-hosted: nginx serves the static `dist/`; the same
image works with or without the API because API presence is detected at runtime
(`/api/health`). The baseline "serve dist/" self-host path is therefore trivially
preserved no matter what CF features are added - CF features must remain additive and
have an API-backed self-host equivalent (share KV -> api/src share endpoint TBD; image
R2 -> existing api/src/storage/assets.ts).

CI/deploy workflows:
- `.github/workflows/deploy-prod.yml` - on release, deploys the Docker app to the prod
  host (the Linode VPS) via a self-hosted runner; verifies `count.racku.la/version.json`.
  Static-frontend-only (no API) per its own comments.
- `.github/workflows/deploy-dev.yml` - on push to main, builds images and deploys via
  `runs-on: [self-hosted, vps-rackula]` with `docker compose --profile persist up`
  (frontend + API) and verifies `d.racku.la` + `d.racku.la/api/layouts`. This is a
  self-hosted-runner Docker deploy, NOT GitHub Pages. There is NO GitHub Pages workflow
  in the repo (no `actions/deploy-pages`, `configure-pages`, `gh-pages`, or `peaceiris`).

---

## Doc Discrepancies

Do NOT edit (per spike). Listed for the eventual implementation/doc PR.

- `CLAUDE.md:546` (Deployment table) claims `Dev | d.racku.la | Push to main | GitHub
  Pages`. Stale. Dev actually deploys Docker via the self-hosted `vps-rackula` runner
  (`deploy-dev.yml:107`), and the user states dev is now on the homelab. No GitHub Pages
  workflow exists.
- `CLAUDE.md:554` - "deploy to GitHub Pages" in the Dev Deployment snippet. Same stale
  claim.
- `CLAUDE.md` Deployment section also lists Prod infra as "VPS (Docker)" - accurate
  today, but the whole point of epic #1983 / #1984 is to retire that VPS; doc will need
  updating when prod moves to CF.
- `docs/ARCHITECTURE.md:148` - architecture diagram still shows "GitHub Pages" as the
  hosting box. Stale.
- `vite.config.ts:135-137` (code comment, not docs) - "GitHub Pages: /Rackula/" example
  for `VITE_BASE_PATH`. Stale reference; no current workflow sets `/Rackula/` (grep finds
  no `VITE_BASE_PATH` usage in workflows/compose).
- GitHub-Pages legacy SPA shims remain inert in the bundle: `index.html:33-42`
  (sessionStorage redirect) and `static/404.html`. Not docs, but leftover artifacts from
  the GitHub-Pages era worth cleaning up when moving to CF SPA fallback.
- `deploy/Dockerfile:9-11` - `ARG/ENV VITE_PERSIST_ENABLED` still present though the flag
  was removed from the app in favour of runtime detection. Dead build arg.

---

## Key Findings

1. The frontend is a pure static Vite + Svelte 5 SPA. `vite build` -> `dist/` with two
   HTML entries (index.html + login.html), `version.json`, env-driven `VITE_BASE_PATH`,
   no server runtime. Hosting the baseline on CF Workers Static Assets is Trivial; the
   only host-config need is an SPA catch-all fallback to index.html.
2. No client router. login.html is a separate document selected by the server (nginx),
   not by client routing. On static prod (no API) login.html is non-functional and
   unneeded; prod already runs `AUTH_MODE=none`. For CF static prod, drop login.html.
3. The app is already API-optional. `persistence.svelte.ts` runtime-detects the API at
   `/api/health` with a strict JSON-shape check (explicitly hardened against SPA-fallback
   false positives). "Static prod, no API" is the EXISTING prod mode at count.racku.la -
   CF static prod is just that mode on a new host.
4. Share (Ctrl+H) is entirely client-side: layout lz-string-compressed into `?l=`. KV
   shortening is purely additive; its self-host equivalent needs a NEW rackula-api share
   endpoint (backend follow-up) so the long-URL fallback stays for parity.
5. Two image paths: bundled device images are static files in dist/ (no API, no R2
   needed); user uploads go through `PUT/GET /api/assets/...` (api/src/storage/assets.ts,
   filesystem) or stay as in-browser data URLs when no API. R2 is the CF equivalent of
   the existing filesystem asset store; self-host parity already exists.
6. No analytics ships today (Umami fully removed; only CHANGELOG mentions it). A CF Web
   Analytics beacon drops into index.html `<head>` or is zone-injected by CF. Trivial.
7. Self-host = nginx serving dist/ (Docker `deploy/Dockerfile` + `nginx.conf.template`,
   or LXC `deploy/lxc/`), with `/api` proxied to an optional rackula-api sidecar gated by
   a compose `persist` profile. Parity enforced by
   `scripts/check-compose-persist-parity.sh`. The "serve dist/" baseline is preserved
   regardless of CF features.
8. Honest caveat (per spike): moving the FRONTEND to CF retires only the PROD VPS tenant.
   `count.racku.la` already runs no API, so the prod move is essentially lift-and-shift of
   a static bundle. Full VPS retirement also requires moving the DEV rackula-api off the
   VPS/onto the homelab (#1985) - currently `deploy-dev.yml` runs on the
   `vps-rackula` self-hosted runner with the API sidecar. The frontend move alone does NOT
   kill the VPS.
9. Doc drift: CLAUDE.md and docs/ARCHITECTURE.md still claim dev = GitHub Pages; no GH
   Pages workflow exists. Dev is a self-hosted Docker deploy (moving to homelab).
