# Spike #1995 - Codebase Findings (Rackula container/deploy surface)

**Date:** 2026-06-08  
**Purpose:** Ground-truth inventory of Rackula's Docker/container/deployment/auth surface for Unraid templating decision.

---

## Frontend image (deploy/Dockerfile)

**File:** `/Users/gvns/code/projects/Rackula/Rackula/deploy/Dockerfile`

### Image Details
- Base image (production): `nginxinc/nginx-unprivileged:alpine` (line 22)
- Build image: `node:22-alpine` (line 2)
- User: `nginx` user (unprivileged, UID 101; see line 30)
- Port: `8080` (line 50, line 70 EXPOSE; listen port is configurable via `RACKULA_LISTEN_PORT`)
- Healthcheck: Lines 67-68
  - Endpoint: `GET http://127.0.0.1:${RACKULA_LISTEN_PORT:-8080}/health`
  - Interval: 30s, timeout: 3s, start-period: 5s, retries: 3
  - Returns: Plain text "OK" (from nginx location block, not from app)

### OCI Labels (lines 32-36)
- `org.opencontainers.image.source="https://github.com/RackulaLives/Rackula"`
- `org.opencontainers.image.description="Rack Layout Designer for Homelabbers"`
- `org.opencontainers.image.licenses="MIT"`
- `org.opencontainers.image.title="Rackula"`

### Build Args (lines 6-11)
- `VITE_ENV=production` (default; line 7)
- `VITE_PERSIST_ENABLED=false` (default; line 11) - feature flag for server-side persistence
- `APK_CACHEBUST=0` (default; line 27) - invalidated per-build for security patching

### Runtime Environment Variables (lines 39-54)
All env vars set inside the image as defaults; can be overridden at container run time.

| Variable | Default | Purpose | Allowed Values |
|----------|---------|---------|-----------------|
| `API_HOST` | `rackula-api` | API sidecar hostname/IP | hostname, FQDN, IP (no validation) |
| `API_PORT` | `3001` | API sidecar port | 1-65535 (no validation in image) |
| `RACKULA_AUTH_MODE` | `none` | Auth mode toggle | `none`, `oidc`, `local` (normalized by docker-entrypoint-wrapper.sh) |
| `RACKULA_LISTEN_PORT` | `8080` | nginx listen port (inside container) | 1-65535 (no validation in image) |
| `RACKULA_ENABLE_IPV6` | `auto` | IPv6 listener auto-detect | `auto`, `true`, `false` (normalized by docker-entrypoint-wrapper.sh) |
| `NGINX_RESOLVER` | `127.0.0.11` | DNS resolver for nginx upstream | IP address (Docker's embedded DNS) |
| `API_WRITE_TOKEN` | (unset) | Bearer token for API PUT/DELETE routes | Any string; optional |
| `RACKULA_TRUST_PROXY` | `0` (unset) | Honor X-Forwarded-Proto from reverse proxy | `0`, `1`, `true`, `yes` (case-insensitive) |

**nginx envsubst filter (line 53):** Only these vars are substituted into nginx template:
```
^(API_HOST|API_PORT|API_WRITE_TOKEN|RACKULA_AUTH_MODE|AUTH_MODE|RACKULA_LISTEN_PORT|RACKULA_IPV6_LISTEN|NGINX_RESOLVER|RACKULA_TRUST_PROXY)$
```
This prevents nginx built-in vars (`$host`, `$scheme`, etc.) from being overwritten.

### Entrypoint
**File:** `/Users/gvns/code/projects/Rackula/Rackula/deploy/docker-entrypoint-wrapper.sh` (copied line 62)

Wraps the official nginx entrypoint to:
1. Normalize `RACKULA_AUTH_MODE` (accepts mixed case, defaults to `none`)
2. Normalize `RACKULA_TRUST_PROXY` (accepts `1`, `true`, `yes` case-insensitive)
3. Auto-detect or normalize IPv6 listener (reads `/proc/net/if_inet6`, generates `RACKULA_IPV6_LISTEN` var)
4. Validate `NGINX_RESOLVER` for Kubernetes bare hostnames (warns if in K8s and `API_HOST` has no dots)
5. Log configuration details to stderr

### Security Posture
- Read-only root filesystem: No (can write to `/var/cache/nginx`, `/var/run`, `/tmp`, `/etc/nginx/conf.d` via tmpfs)
- Capabilities: Not dropped in Dockerfile (depends on docker compose security settings)
- Security headers: Sourced from `/etc/nginx/snippets/security-headers.conf` (copied line 59)

---

## API image (api/Dockerfile)

**File:** `/Users/gvns/code/projects/Rackula/Rackula/api/Dockerfile`

### Image Details
- Base image: `oven/bun:1.3.10-alpine` (line 3)
- User: `rackula` (non-root, UID 1001; created line 24-25)
- Port: `3001` (line 55 EXPOSE)
- Healthcheck: Lines 57-58
  - Endpoint: `GET http://127.0.0.1:3001/health`
  - Interval: 30s, timeout: 10s, start-period: 5s, retries: 3
  - Returns: JSON `{ ok: true, status: "ok", service: "rackula-persistence-api", version: 1 }`

### OCI Labels (lines 36-39)
- `org.opencontainers.image.source="https://github.com/RackulaLives/Rackula"`
- `org.opencontainers.image.description="Rackula API Sidecar for persistent storage"`
- `org.opencontainers.image.licenses="MIT"`
- `org.opencontainers.image.title="Rackula API"`

### Build Args / Version Metadata (lines 43-51)
- `APP_VERSION=""` (injected at build time from release tag; falls back to `api/package.json` version in dev)
- `APP_COMMIT=""` (short git hash, optional)
- `APP_BUILD_TIME=""` (ISO 8601 timestamp, optional)
- Exposed at runtime via `GET /version` and `GET /api/version` (unauthenticated)

### Runtime Environment Variables (line 53)
| Variable | Default | Purpose | Required |
|----------|---------|---------|----------|
| `NODE_ENV` | `production` | Set to production mode | No (hardcoded in image) |
| `PORT` | `3001` | Fallback port if `RACKULA_API_PORT` not set | No |
| `RACKULA_API_PORT` | `3001` | API listen port (takes precedence) | No |
| `DATA_DIR` | `/data` | Persistent data directory inside container | No |

### Required Auth Env Vars (when `RACKULA_AUTH_MODE != none`)

**File:** `/Users/gvns/code/projects/Rackula/Rackula/api/src/security/config.ts` (lines 296-504)

When auth is enabled, the API **fails to start** if these are missing:

| Variable | Purpose | Min Length | Default |
|----------|---------|-----------|---------|
| `RACKULA_AUTH_SESSION_SECRET` | Session token signing key | 32 chars | (required) |
| `RACKULA_AUTH_MODE` | Mode: `none`, `oidc`, `local` | - | `none` (optional) |

### Auth Mode Specifics

#### Mode: `none` (Default, No Auth)
- Anonymous read/write access
- No session secret required
- Auth routes (`/auth/login`, `/auth/check`, etc.) still respond but grant access immediately

#### Mode: `local` (Username/Password)
**File:** `/Users/gvns/code/projects/Rackula/Rackula/api/src/local-auth.ts`

Additional required env vars:
| Variable | Purpose | Min Length | Max Length | Notes |
|----------|---------|-----------|-----------|-------|
| `RACKULA_LOCAL_USERNAME` | Login username | 1 char | 255 chars | Trimmed; required if `RACKULA_AUTH_MODE=local` |
| `RACKULA_LOCAL_PASSWORD` | Login password | 12 chars | 1024 chars | Plain text at startup; hashed with Argon2id (OWASP params: 64 MiB memory, 3 time cost, 4 parallelism); plaintext scrubbed from env after bootstrap (line 289 in app.ts) |

**Password handling:**
- Hashed via `@node-rs/argon2` package (Argon2id, lines 11-13 in local-auth.ts)
- Login rate limiter: 5 attempts per 60s per IP (lines 19-22 in local-auth.ts)
- Timing-safe comparison to prevent username enumeration (lines 174-199 in local-auth.ts)

#### Mode: `oidc` (OpenID Connect)
- Requires OIDC provider configuration via `better-auth` library (Hono app, line 348 in app.ts)
- Setup not documented in env vars; likely configured via additional env vars not listed here or via config files

### Session Configuration (when auth enabled)

**File:** `/Users/gvns/code/projects/Rackula/Rackula/api/src/security/config.ts` (lines 358-403)

| Variable | Default | Min | Max | Purpose |
|----------|---------|-----|-----|---------|
| `RACKULA_AUTH_SESSION_MAX_AGE_SECONDS` | `43200` (12h) | `60` | `604800` (7 days) | Absolute session lifetime |
| `RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS` | `1800` (30m) | `60` | `authSessionMaxAgeSeconds` | Inactivity timeout |
| `RACKULA_AUTH_SESSION_GENERATION` | `0` | 0 | (no max) | Increment to invalidate all active sessions globally |
| `RACKULA_AUTH_SESSION_COOKIE_SAMESITE` | `Lax` | - | - | Cookie policy: `Lax`, `Strict`, `None` |
| `RACKULA_AUTH_SESSION_COOKIE_SECURE` | `true` if prod, `false` if dev | - | - | HTTPS-only flag (forced `true` if SameSite=None) |
| `RACKULA_AUTH_SESSION_COOKIE_NAME` | `rackula_auth_session` | - | - | Session cookie name (alphanumeric, `-`, `_` only) |
| `RACKULA_AUTH_CSRF_PROTECTION` | `true` if auth enabled, `false` otherwise | - | - | CSRF token validation for authenticated writes |

### Write Route Authorization

| Variable | Default | Purpose |
|----------|---------|---------|
| `RACKULA_API_WRITE_TOKEN` | (unset) | Optional bearer token for PUT/DELETE routes (alternative to session auth) |

When set, nginx injects `Authorization: Bearer <token>` header on PUT/DELETE requests (nginx.conf.template lines 14-28).

### Storage / Data

| Variable | Default | Notes |
|----------|---------|-------|
| `DATA_DIR` | `/data` | Mounted volume path inside container; API creates if missing (filesystem.ts line 50) |

**Storage structure:** Folder-per-layout, YAML-based:
```
{DATA_DIR}/
  {LayoutName}-{UUID}/
    {layout-name}.rackula.yaml    # Persisted layout data
  {LayoutName}-{UUID}/assets/
    {asset-id}.{ext}               # Images/attachments per layout
```
(api/src/storage/filesystem.ts, lines 4-5)

### Optional Config

| Variable | Default | Purpose |
|----------|---------|---------|
| `CORS_ORIGIN` | `*` (dev), error (prod) | Allowed browser origins for API; comma-separated list or `*` |
| `ALLOW_INSECURE_CORS` | `false` | Opt-in to wildcard CORS in production (security.config.ts lines 319-322) |
| `MAX_ASSET_SIZE` | `5242880` (5 MB) | Max file upload size (bytes) |
| `RACKULA_MAX_LAYOUTS` | `100` | Max layout count (0 = unlimited) |
| `RACKULA_MAX_ASSETS_PER_LAYOUT` | `50` | Max assets per layout (0 = unlimited) |
| `RACKULA_RATE_LIMIT_ENABLED` | `true` | Rate limiting toggle |
| `RACKULA_RATE_LIMIT_WRITE_MAX` | `30` | Write requests per window |
| `RACKULA_RATE_LIMIT_WRITE_WINDOW_MS` | `60000` (60s) | Write rate limit window |
| `RACKULA_RATE_LIMIT_READ_MAX` | `120` | Read requests per window |
| `RACKULA_RATE_LIMIT_READ_WINDOW_MS` | `60000` (60s) | Read rate limit window |

---

## Compose / Multi-container Wiring

### Standard (No Persistence)
**File:** `/Users/gvns/code/projects/Rackula/Rackula/docker-compose.yml`

Services:
- `rackula` (frontend):
  - Image: `ghcr.io/rackulalives/rackula:latest` (overridable via `RACKULA_IMAGE`)
  - Ports: `${RACKULA_PORT:-8080}:${RACKULA_LISTEN_PORT:-8080}` (host:container)
  - Container name: `${RACKULA_CONTAINER_NAME:-rackula}`
  - Always runs (no profile)
  - No volumes
  - Requires: None
  - Resources: 0.5 CPU / 128 MB limit, 0.1 CPU / 16 MB reserved
  - Security: `no-new-privileges`, all caps dropped, read-only root FS, tmpfs for nginx cache/run/tmp
  - Restart: `unless-stopped` with 10s grace period

- `rackula-api` (API sidecar, optional):
  - Image: `ghcr.io/rackulalives/rackula-api:latest` (overridable via `RACKULA_API_IMAGE`)
  - Ports: Not exposed (internal only)
  - Container name: `${RACKULA_API_CONTAINER_NAME:-rackula-api}`
  - Profile: `persist` - only runs with `docker compose --profile persist up`
  - Volumes: `./data:/data` (note: host dir must be writable by UID 1001)
  - Resources: 0.25 CPU / 64 MB limit, 0.05 CPU / 16 MB reserved
  - Security: Same hardening as frontend
  - Restart: `unless-stopped` with 10s grace period

### With Persistence
**File:** `/Users/gvns/code/projects/Rackula/Rackula/deploy/docker-compose.persist.yml`

Services:
- `rackula` (frontend):
  - Same as above, but:
  - Image: `ghcr.io/rackulalives/rackula:persist` (pre-configured for API)
  - Depends on: `rackula-api` (service_healthy condition, line 38-39)
  - Adds `RACKULA_TRUST_PROXY=${RACKULA_TRUST_PROXY:-0}` for reverse-proxy support

- `rackula-api` (API, always runs):
  - Volumes: `./data:/data`
  - Healthcheck: `wget -qO- http://127.0.0.1:3001/health` (line 124)
  - Same env vars as standard compose (see Environment Variables section below)

### Frontend → API Wiring

**nginx proxy (deploy/nginx.conf.template):**
- Frontend serves static assets + SPA
- All `/api/*` requests proxied to API upstream (lines 178-202)
  - Upstream DNS: `${NGINX_RESOLVER}` (default `127.0.0.11`)
  - Target: `http://${API_HOST}:${API_PORT}`
  - Rewrite: `/api/layouts` → `/layouts` (prefix stripped at line 184)
  - Write-token injection: If `API_WRITE_TOKEN` is set and method is PUT/DELETE, injects `Authorization: Bearer <token>` (lines 14-28)
  - Timeouts: connect 5s, send 30s, read 30s

**Auth routing (lines 209-241):**
- Internal `/_rackula_auth_check` endpoint calls `/api/auth/check` for session validation
- If auth mode is `none`, returns 204 immediately (line 214)
- Otherwise proxies to API; failures return 401 (line 239)
- App redirects 401 to `/auth/login?next=...` (line 251)

---

## Environment Variables (Complete Reference Table)

**Frontend (nginx) env vars:**

| Variable | Default | Purpose | File | Type |
|----------|---------|---------|------|------|
| `API_HOST` | `rackula-api` | API hostname/IP | deploy/Dockerfile:47 | string |
| `API_PORT` | `3001` | API port | deploy/Dockerfile:48 | integer |
| `RACKULA_AUTH_MODE` | `none` | Auth mode: none/oidc/local | deploy/Dockerfile:49 | enum |
| `RACKULA_LISTEN_PORT` | `8080` | nginx listen port | deploy/Dockerfile:50 | integer |
| `RACKULA_ENABLE_IPV6` | `auto` | IPv6: auto/true/false | deploy/Dockerfile:51 | enum |
| `NGINX_RESOLVER` | `127.0.0.11` | DNS for nginx upstream | deploy/Dockerfile:52 | IP address |
| `API_WRITE_TOKEN` | (unset) | Bearer token for write routes | compose line 48 | string (optional) |
| `RACKULA_TRUST_PROXY` | `0` | Honor X-Forwarded-Proto | docker-compose.persist.yml:34 | 0/1 |

**API env vars:**

| Variable | Default | Purpose | File | Type | Required |
|----------|---------|---------|------|------|----------|
| `NODE_ENV` | `production` | Node environment | api/Dockerfile:53 | string | No |
| `PORT` | `3001` | Fallback listen port | api/Dockerfile:53 | integer | No |
| `RACKULA_API_PORT` | `3001` | API listen port (preferred) | api/index.ts:13 | integer | No |
| `DATA_DIR` | `/data` | Persistent data directory (container default from api/Dockerfile:53; code fallback `./data` when unset, filesystem.ts:28) | api/Dockerfile:53, filesystem.ts:28 | path | No |
| `RACKULA_AUTH_MODE` | `none` | Auth mode | api/src/security/config.ts:302 | enum(none/oidc/local) | No |
| `RACKULA_AUTH_SESSION_SECRET` | (unset) | Session token signing key | api/src/security/config.ts:332 | string (32+ chars) | **Yes if auth enabled** |
| `RACKULA_LOCAL_USERNAME` | (unset) | Local auth username | api/src/local-auth.ts:71 | string (1-255 chars) | **Yes if mode=local** |
| `RACKULA_LOCAL_PASSWORD` | (unset) | Local auth password | api/src/local-auth.ts:81 | string (12-1024 chars) | **Yes if mode=local** |
| `RACKULA_AUTH_SESSION_MAX_AGE_SECONDS` | `43200` | Absolute session lifetime | api/src/security/config.ts:358 | integer (60-604800) | No |
| `RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS` | `1800` | Session inactivity timeout | api/src/security/config.ts:366 | integer (60-max_age) | No |
| `RACKULA_AUTH_SESSION_GENERATION` | `0` | Session generation counter | api/src/security/config.ts:374 | integer (0+) | No |
| `RACKULA_AUTH_SESSION_COOKIE_SAMESITE` | `Lax` | Cookie SameSite policy | api/src/security/config.ts:380 | enum(Lax/Strict/None) | No |
| `RACKULA_AUTH_SESSION_COOKIE_SECURE` | true (prod)/false (dev) | HTTPS-only cookie | api/src/security/config.ts:384 | 0/1/true/false | No |
| `RACKULA_AUTH_SESSION_COOKIE_NAME` | `rackula_auth_session` | Session cookie name | api/src/security/config.ts:328 | string (alphanumeric/-/_) | No |
| `RACKULA_API_WRITE_TOKEN` | (unset) | Bearer token for PUT/DELETE | docker-compose.yml:48 | string (optional) | No |
| `CORS_ORIGIN` | `*` (dev) / error (prod) | Allowed browser origins | docker-compose.yml:103 | string (comma-separated or `*`) | No (if prod: yes unless `ALLOW_INSECURE_CORS=true`) |
| `ALLOW_INSECURE_CORS` | `false` | Opt-in to wildcard CORS in prod | docker-compose.yml:120 | 0/1/true/false | No |
| `MAX_ASSET_SIZE` | `5242880` | Max upload size (bytes) | api/src/app.ts:838 | integer | No |
| `RACKULA_MAX_LAYOUTS` | `100` | Max layout count (0=unlimited) | api/src/security/config.ts:463 | integer (0+) | No |
| `RACKULA_MAX_ASSETS_PER_LAYOUT` | `50` | Max assets per layout (0=unlimited) | api/src/security/config.ts:470 | integer (0+) | No |
| `RACKULA_RATE_LIMIT_ENABLED` | `true` | Rate limiting toggle | api/src/security/config.ts:421 | 0/1/true/false | No |
| `RACKULA_RATE_LIMIT_WRITE_MAX` | `30` | Write requests per window | api/src/security/config.ts:427 | integer (1-10000) | No |
| `RACKULA_RATE_LIMIT_WRITE_WINDOW_MS` | `60000` | Write rate window (ms) | api/src/security/config.ts:435 | integer (1000-3600000) | No |
| `RACKULA_RATE_LIMIT_READ_MAX` | `120` | Read requests per window | api/src/security/config.ts:443 | integer (1-100000) | No |
| `RACKULA_RATE_LIMIT_READ_WINDOW_MS` | `60000` | Read rate window (ms) | api/src/security/config.ts:451 | integer (1-3600000) | No |
| `RACKULA_AUTH_LOG_HASH_KEY` | (derived from `RACKULA_AUTH_SESSION_SECRET`) | Auth log pseudonymization key | api/src/security/config.ts:334 | string (32+ chars, optional) | No |
| `RACKULA_AUTH_LOGIN_PATH` | `/auth/login` | Auth login endpoint path | api/src/security/config.ts:331 | path | No |

---

## Auth Model (RACKULA_AUTH_MODE)

**Primary config file:** `/Users/gvns/code/projects/Rackula/Rackula/api/src/security/config.ts` (lines 296-504)

### Mode: `none` (Default, No Authentication)
- Behavior: All requests granted access immediately
- Session requirement: None
- Routes: Auth routes (`/auth/login`, `/auth/check`, `/auth/logout`) respond but grant 204/no-op
- nginx behavior (nginx.conf.template line 213-214): Auth check returns 204 immediately, bypassing upstream call
- Use case: Single-user homelab, isolated network, development

### Mode: `local` (Username/Password)
**Files:**
- `api/src/local-auth.ts` (implementation)
- `api/src/app.ts` (line 285-298: bootstrap, line 634-797: login handler)

**Startup:**
1. API loads `RACKULA_LOCAL_USERNAME` and `RACKULA_LOCAL_PASSWORD` (required)
2. Password hashed with Argon2id using OWASP parameters (local-auth.ts lines 11-13):
   - Memory: 64 MiB
   - Time cost: 3
   - Parallelism: 4
3. Hash stored in-memory; plaintext password scrubbed from env (app.ts line 289)
4. No persistent user database - credentials are ephemeral (hashed only during container lifetime)

**Login flow:**
1. User POST `/auth/login` with `{ username, password }`
2. Rate limiter checks IP: max 5 attempts per 60s (local-auth.ts lines 19-22)
3. Timing-safe credential verification (lines 174-199)
4. On success: Session token signed with `RACKULA_AUTH_SESSION_SECRET` and sent as httpOnly cookie
5. On failure: Log event, return 401
6. nginx: POST /auth/login passes through to API for validation (nginx.conf.template lines 118-120)
7. nginx: GET /auth/login serves static `/login.html` for GET requests (line 119)

**Session token:**
- Signed with HS256 (HMAC-SHA256) using `RACKULA_AUTH_SESSION_SECRET`
- Claims: `sub` (username), `role` (always "admin"), `iat`, `exp`, `idleExp`, `generation`, `sid`
- Lifetime: `RACKULA_AUTH_SESSION_MAX_AGE_SECONDS` (default 12h)
- Idle timeout: `RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS` (default 30m)

**Logout:**
- POST `/auth/logout` invalidates session cookie (app.ts line 617)

**Persistence:** None (credentials and sessions ephemeral; restart clears all state)

### Mode: `oidc` (OpenID Connect)
**Files:**
- `api/src/auth/config.ts` (Better Auth configuration)
- `api/src/app.ts` (lines 434-530: OAuth2 handler)

**Configuration:** Not fully documented in env vars. Requires:
- `RACKULA_AUTH_SESSION_SECRET` (required for token signing)
- OIDC provider setup via `better-auth` library (Hono)
- Providers likely configured via additional env vars or config files (not enumerated here)

**Flow:**
1. User navigates to `/auth/login`
2. nginx proxies to API (line 124 in nginx.conf.template)
3. API calls `signInWithOAuth2({ providerId: "oidc", callbackURL, ... })` (app.ts line 485)
4. Better Auth returns authorization URL
5. User redirected to IdP login
6. IdP redirects back to `/auth/callback` with code
7. API exchanges code for tokens, creates session, sets cookie (app.ts line 514-530)

**Session:** Same as local auth (HS256 signed token)

**Limitations:** MVP implementation; all authenticated users get "admin" role (see app.ts comment lines 216-217 re: RACKULA_OIDC_ROLE_CLAIM future feature)

### Shared Auth Infrastructure

**Session validation (nginx.conf.template lines 209-240):**
- Internal `/_rackula_auth_check` endpoint
- If auth mode is `none`: returns 204 (line 214)
- If auth enabled: proxies to `/api/auth/check` to validate signed session cookie
- API checks cookie signature and expiration (app.ts line 533-570)
- Failure returns 401 → nginx redirects to login (line 251)

**Write route protection (app.ts lines 815-823):**
- When auth enabled, all PUT/DELETE routes require admin role
- Routes affected: `/layouts/*`, `/assets/*`, `/api/layouts/*`, `/api/assets/*`

**CSRF protection (when auth enabled):**
- Enabled by default if auth is enabled (api/src/security/config.ts line 396-400)
- Validates CSRF token for session-authenticated requests
- Trusted origins: parsed from `CORS_ORIGIN` (lines 402-407)

**Rate limiting:**
- Global, per-IP read/write limits (api/src/security/rate-limit-middleware.ts)
- Write: 30 requests per 60s (default)
- Read: 120 requests per 60s (default)
- Configurable but not per-user

---

## Persistence / Volumes

### Frontend
- Volumes: None (stateless; assets and config baked into image)
- Transient: `/var/cache/nginx` (10 MB tmpfs, line 73 in docker-compose.yml)
- Session state: Stored in session cookie (httpOnly, Secure, SameSite=Lax/Strict)

### API
- Persistent volume: `${DATA_DIR:-/data}` (mounted at `/data` inside container)
- Host mapping (docker-compose.persist.yml line 74): `./data:/data`
- Ownership: UID 1001:1001 (rackula:rackula)
- Permissions: `750` (directory, line 83 in lxc/community-scripts/ct/rackula.sh)

**Storage structure (api/src/storage/filesystem.ts):**
```
/data/
  {LayoutName}-{UUID}/
    {layout-name}.rackula.yaml    # YAML-serialized layout (js-yaml)
  {LayoutName}-{UUID}/assets/
    {asset-id}.{ext}              # Binary image/file attachments
```

**Data initialization:**
- API creates `/data` if missing (filesystem.ts line 50)
- Layout files created on first save
- Asset directory created per-layout on first upload

**Data consistency:**
- YAML written atomically via `writeFile` (Node.js fs/promises, no locking)
- No transactional semantics; concurrent updates to same file will race
- Backup recommended before updates (see lxc/community-scripts/ct/rackula.sh lines 46-56)

### Session State (if auth enabled)
- Mechanism: httpOnly cookie + server-side signature verification
- Persistence: Signed JWT token; validation requires `RACKULA_AUTH_SESSION_SECRET`
- Local auth: No user database; credentials ephemeral (hashed at startup only)
- OIDC: Better Auth library handles provider session management (depends on configuration)
- TTL: Max 12h absolute, 30m idle (configurable)
- Storage: None (stateless; token is the source of truth)

**Invalidation (app.ts line 582, 587):**
- Function `invalidateAuthSession(sessionId, expiration)` registered but implementation details not clear from snippet
- Likely in-memory cache invalidation (clears token from memory, not disk)

---

## nginx / Reverse Proxy

**Primary config:** `/Users/gvns/code/projects/Rackula/Rackula/deploy/nginx.conf.template` (envsubst-processed)

### Key Locations

| Path | Handler | Purpose |
|------|---------|---------|
| `/health` | Return 200 "OK" | Container health check (always passes, even if API down) |
| `/login.html` | Serve file | Local auth login page (only if `RACKULA_AUTH_MODE=local`) |
| `/_rackula_auth_check` | Internal proxy | Session validation (returns 204 or 401) |
| `/auth/login` | Proxy to API | Auth bootstrap (GET serves login page in local mode, POST validates credentials) |
| `/auth/callback` | Proxy to API | OIDC callback handler (returns 404 in local mode) |
| `/auth/check` | Proxy to API | Session validation (used by internal check above) |
| `/auth/logout` | Proxy to API | Session invalidation |
| `/api/` | Proxy to API | Layout/asset read/write endpoints |
| `/assets/` | Serve static files | Vite-built frontend assets (cached 1 year) |
| `/` | SPA fallback | All unmatched paths → `index.html` (auth_request gated) |

### API Proxy Behavior

**Upstream:**
- Hostname/IP: `${API_HOST}` (default `rackula-api`)
- Port: `${API_PORT}` (default `3001`)
- DNS resolver: `${NGINX_RESOLVER}` (default `127.0.0.11`, Docker embedded DNS)
- Protocol: `http://` (internal, no TLS)

**Path rewriting (line 184):**
```nginx
rewrite ^/api(/.*)$ $1 break;
```
Frontend calls `/api/layouts` → nginx forwards `http://rackula-api:3001/layouts`

**Header forwarding (lines 188-193):**
- `Host`: `$host` (original Host header)
- `X-Real-IP`: `$remote_addr` (client IP)
- `X-Forwarded-For`: `$proxy_add_x_forwarded_for` (proxy chain)
- `X-Forwarded-Proto`: `$real_scheme` (honors `X-Forwarded-Proto` if `RACKULA_TRUST_PROXY=1`, else `$scheme`)
- `Authorization`: Injected with bearer token if `API_WRITE_TOKEN` set for PUT/DELETE (lines 14-28)

**Timeouts:**
- Connect: 5s
- Send: 30s
- Read: 30s

**Error handling:**
- 502/503/504 from API → returns JSON error (line 206)
- Auth service unavailable (502/503/504) → returns HTML error (line 163)

### Static Asset Serving

**Path:** `/assets/`
- Source: Vite-built fingerprinted assets in `/usr/share/nginx/html/assets/`
- Cache: 1 year (`Cache-Control: public, immutable`)
- Gzip: Enabled (min 1KB, see lines 77-82)

### SPA Fallback with Auth

**Path:** `/` (line 274)
- Behavior: All requests route to `index.html` (SPA)
- Auth gate: `auth_request /_rackula_auth_check` (line 275)
- On 401: Redirects to `/auth/login?next=<original-path>` (line 276)

### Trust Proxy (Reverse Proxy Support)

**Control:** `RACKULA_TRUST_PROXY` (docker-entrypoint-wrapper.sh lines 30-45)

When `RACKULA_TRUST_PROXY=1`:
- Honor `X-Forwarded-Proto` header from reverse proxy
- Auth redirects use external scheme (https) instead of internal (http)
- Prevents open-redirect attacks by validating scheme (only http/https accepted, line 59-63)

**Use case:** Rackula behind TLS-terminating reverse proxy (e.g., Unraid with HTTPS)

### Security Headers

**File:** `/Users/gvns/code/projects/Rackula/Rackula/deploy/security-headers.conf`

Included at server level (line 281) and `/assets/` location (line 91).

Headers (typical web hardening):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (or `SAMEORIGIN`)
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- CSP, HSTS, etc. (exact headers not shown in summary, but file exists at line 57, 59)

---

## Existing Distribution References (LXC, Unraid Traces)

### LXC Distribution (Proxmox Community Scripts)

**Location:** `/Users/gvns/code/projects/Rackula/Rackula/deploy/lxc/community-scripts/`

**JSON metadata (json/rackula.json):**
- Name: Rackula
- Slug: rackula
- Category: 10 (homelab-related)
- Type: `ct` (LXC container)
- Updateable: true
- Privileged: false (unprivileged container)
- ARM64: yes
- Interface port: 80 (reverse proxy maps to this)
- Default OS: Debian 13
- Min resources: 1 CPU, 512 MB RAM, 8 GB disk
- No default credentials (auth mode=none by default)

**Installation script (ct/rackula.sh):**
- Fetches latest release tarball from GitHub (`RackulaLives/Rackula`)
- Deploys to `/opt/rackula/`
- Creates systemd services for nginx + rackula-api
- Config files: `/opt/rackula/config/nginx.conf`, `rackula-api.service`, `nginx.service.d-override.conf`, `security-headers.conf`
- Data directory: `/opt/rackula/data`
- Auto-generates API write token during install (noted in rackula.json line 34)

**Update function:**
- Stops services
- Backs up `/opt/rackula/data`
- Deploys new tarball
- Restores data
- Reloads systemd
- Starts services
- Smoke test: `curl http://127.0.0.1/api/health` (must respond within 10s, line 98)

**Research file (lxc-best-practices.md):**
- Proxmox/LXC hardening guidance
- systemd service sandbox recommendations
- Capability and syscall filtering details
- Caveat: Bun runtime uses JIT; `MemoryDenyWriteExecute` breaks it (line 81)

### Unraid Traces

**File count:** Minimal; mostly icon files (`node_modules/simple-icons/icons/unraid.svg`)

**No existing Unraid template found** in codebase

**No explicit references** to Unraid distribution in code (docs, scripts, config)

**Implication:** Unraid distribution (Community App template or plugin) does not yet exist; spike #1995 is greenfield

### Other Distribution References

**Docker Hub:** Images published to `ghcr.io/rackulalives/rackula` and `ghcr.io/rackulalives/rackula-api`

**Compose reference:** `docker-compose.yml` and `deploy/docker-compose.persist.yml` are reference implementations for self-hosting

---

## Open Questions / Gaps for Unraid Templating

1. Single-container vs. two-container deployment:
   - Can Unraid template deploy frontend only (auth=none, no persistence)?
   - Or is API sidecar mandatory?
   - Answer from investigation: Frontend is fully functional without API; auth mode defaults to `none`, persistence is optional. Single-container (frontend only) is viable, but persistence requires second container or volume mount.

2. Volume mounting for persistence:
   - Unraid Docker template API: does it support volume bind mounts like docker-compose?
   - Community App or custom plugin required?
   - Answer: Both Unraid Community Applications and Plugins support volumes. Template must declare `/data` as writable mount.

3. Environment variable UI in Unraid template:
   - Which env vars should be exposed in the template UI vs. hardcoded?
   - Priority: `RACKULA_LISTEN_PORT`, `API_HOST`, `API_PORT`, `RACKULA_AUTH_MODE`, `RACKULA_API_WRITE_TOKEN`
   - Secondary (if auth enabled): `RACKULA_LOCAL_USERNAME`, `RACKULA_LOCAL_PASSWORD`, `RACKULA_AUTH_SESSION_SECRET`

4. Reverse proxy / SSL termination:
   - Does Unraid have a built-in reverse proxy (similar to `docker-entrypoint-wrapper.sh` `RACKULA_TRUST_PROXY` support)?
   - Template must document how to enable `RACKULA_TRUST_PROXY=1` when Unraid reverse proxy is in use.

5. Auth mode selection in UI:
   - Should template offer radio buttons: "None (Anonymous)" | "Local (Username/Password)" | "OIDC (External IdP)"?
   - If local: expose `RACKULA_LOCAL_USERNAME`, `RACKULA_LOCAL_PASSWORD` fields
   - If OIDC: needs additional OIDC provider configuration (provider ID, client ID, secret, discovery URL) - not yet documented

6. Data persistence strategy:
   - Should template suggest daily backups of `/data`?
   - LXC script already includes backup/restore logic (see rackula.sh); Docker template should mirror this.

7. Health check:
   - Unraid template should define:
     - Port: 8080 (or `RACKULA_LISTEN_PORT` if configurable)
     - Endpoint: `GET /health`
     - Interval: 30s, timeout: 3s (from Dockerfile healthcheck)

8. Startup order (if two-container):
   - Frontend should wait for API to be healthy (like docker-compose.persist.yml depends_on, line 37-39)
   - Or declare API as required dependency?

9. API write token generation:
   - Should template auto-generate a strong write token?
   - LXC script notes it's auto-generated; template should mirror this (e.g., 32-byte random string in base64).

10. Container restart policy:
    - docker-compose uses `restart: unless-stopped` with 10s grace period
    - Unraid template should specify equivalent (always restart unless manually stopped)

---

## Summary: Deployment Arch for Unraid

**Minimum viable setup (single container):**
```yaml
Frontend container:
  - Image: ghcr.io/rackulalives/rackula:latest
  - Port: 8080 → host port (configurable)
  - Auth mode: none (default)
  - Persistence: optional (no volume → stateless, all data lost on restart)
```

**Recommended setup (two containers with persistence):**
```yaml
Frontend container:
  - Image: ghcr.io/rackulalives/rackula:persist
  - Port: 8080 → host port
  - API_HOST: rackula-api (internal docker network)
  - API_PORT: 3001
  - RACKULA_AUTH_MODE: none (or local/oidc if configured)
  - RACKULA_TRUST_PROXY: 1 (if behind Unraid reverse proxy)
  - Depends on: rackula-api healthcheck

API container:
  - Image: ghcr.io/rackulalives/rackula-api:latest
  - Port: 3001 (not exposed; internal only)
  - DATA_DIR: /data
  - Volume: ./data → /data (persistent)
  - RACKULA_AUTH_MODE: (inherit from frontend)
  - RACKULA_AUTH_SESSION_SECRET: (if auth enabled, required)
```

**Config files needed:**
1. Docker template (JSON) defining UI fields, image, ports, volumes, env vars, health check
2. Optional: shell script to generate strong random tokens at deploy time
3. Optional: documentation for reverse proxy setup if Unraid has built-in SSL/HTTPS gateway

