# External Integrations

**Analysis Date:** 2026-02-19

## APIs & External Services

**Persistence API (Internal Sidecar):**

- Service: Rackula Persistence API (`rackula-persistence-api`)
- What it's used for: Layout CRUD operations, asset management, server-side persistence
  - SDK/Client: Fetch API (no external SDK)
  - Base URL: Configurable via `VITE_API_URL` env var, defaults to `/api` (proxied by nginx)
  - Auth: Optional bearer token via `RACKULA_API_WRITE_TOKEN` env var (forwarded for PUT/DELETE)
  - Health check: `GET /health` returns JSON with service name and version
  - Implementation: `src/lib/utils/persistence-api.ts`
  - Timeout: 10 seconds for all requests

**NetBox Integration (Planned):**

- Status: Documented but not yet implemented (referenced in analytics as import option)
- Scanner: Device import from NetBox will be future feature

## Data Storage

**Databases:**

- Not used — stateless frontend, persistence via API sidecar

**File Storage:**

- **Server-side (when API enabled):**
  - Layouts stored as YAML files on API container volume (`/data`)
  - Custom device images stored in folder structure: `/data/assets/{layoutUuid}/{deviceSlug}/{front|rear}.png`
  - ZIP archives created on client, optionally sent to server

- **Local/Browser-only (default):**
  - IndexedDB-backed persistence via Svelte store (no IndexedDB library; browser native)
  - No external storage required when API unavailable

**Caching:**

- Browser-native: None external, uses in-memory Svelte stores (`$state`, `$derived`)
- Device library cached in stores, revalidated on import

## Authentication & Identity

**Auth Provider:**

- Custom (planned, not yet implemented)
- Modes configured via `RACKULA_AUTH_MODE` env var:
  - `none` (default) - No auth gate
  - `oidc` (planned) - OIDC provider integration
  - `local` (planned) - Username/password auth

**Session Management (when auth enabled):**

- Cookie-based sessions via nginx/API routing
- Session env vars (all unused in v0.8.1, prepared for future auth):
  - `RACKULA_AUTH_SESSION_SECRET` - HMAC secret for session signing
  - `RACKULA_AUTH_SESSION_MAX_AGE_SECONDS` - Absolute timeout (default 12 hours)
  - `RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS` - Idle timeout (default 30 minutes)
  - `RACKULA_AUTH_SESSION_GENERATION` - Counter for global session invalidation
  - `RACKULA_AUTH_SESSION_COOKIE_SAMESITE` - SameSite policy (default Lax)
  - `RACKULA_AUTH_SESSION_COOKIE_SECURE` - Secure flag (auto-true in production)
  - `RACKULA_AUTH_CSRF_PROTECTION` - CSRF token validation toggle

## Monitoring & Observability

**Error Tracking:**

- None external — errors logged to browser console

**Analytics:**

- **Umami** (optional, privacy-focused)
  - Type: Privacy-focused event tracking, no cookies
  - Configuration: Build-time feature flags + runtime env vars
  - Build flags:
    - `VITE_UMAMI_ENABLED` - Boolean enable/disable
    - `VITE_UMAMI_SCRIPT_URL` - Script URL from Umami instance
    - `VITE_UMAMI_WEBSITE_ID` - Website ID in Umami dashboard
  - Tracking: Dynamic script load in `src/lib/utils/analytics.ts` via `initAnalytics()`
  - Events: Typed event schema with device count, export formats, keyboard shortcuts, session heartbeats
  - Session tracking: 5-minute heartbeat interval when user active (2-minute idle threshold)
  - Hostname check: Disabled on localhost/127.0.0.1
  - Reference: Separate website IDs for dev (d.racku.la) and prod (count.racku.la) environments
  - Server: Self-hosted at `t.racku.la` (read-only in CLAUDE.md)

**Logs:**

- Docker JSON file driver: max 10MB per file, 3 files rotation
- No external log aggregation

## CI/CD & Deployment

**Hosting:**

- **Dev environment:** GitHub Pages (automatic on `main` branch push)
- **Production environment:** Docker VPS deployment (automatic on git tag `v*`)
- Container registries: ghcr.io/rackulalives/rackula (frontend) and ghcr.io/rackulalives/rackula-api (API)

**CI Pipeline:**

- GitHub Actions (via `.github/workflows/`)
- Stages: Lint → Unit tests → E2E tests → Build → Deploy
- Code review: CodeRabbit AI review integration on PRs (waits for approval before merge)
- Mutation testing: Stryker mutator runner (optional)

**Build Artifacts:**

- Frontend: Static SPA in `/dist` (distributed to nginx)
- API: Bun-compiled binary from Dockerfile

## Environment Configuration

**Required env vars (Frontend - Docker build time):**

- `VITE_ENV` - Build environment (production recommended)
- `VITE_UMAMI_ENABLED` - Enable analytics (false by default)
- `VITE_UMAMI_WEBSITE_ID` - Umami website ID (if enabled)
- `VITE_UMAMI_SCRIPT_URL` - Umami script URL (if enabled)
- `VITE_PERSIST_ENABLED` - Enable persistence API integration (prepared, not used in v0.8.1)

**Required env vars (Runtime - Docker container):**

- `API_HOST` - API sidecar hostname (default: rackula-api for docker-compose)
- `API_PORT` - API sidecar port (default: 3001)
- `RACKULA_LISTEN_PORT` - nginx listen port inside container (default: 8080)
- `RACKULA_AUTH_MODE` - Auth mode (default: none)
- `CORS_ORIGIN` - API CORS policy origin (default: http://localhost:8080)
- `ALLOW_INSECURE_CORS` - Wildcard CORS toggle (default: false)

**Optional env vars (Runtime - API only):**

- `RACKULA_API_WRITE_TOKEN` - Bearer token for API write operations
- `RACKULA_AUTH_SESSION_SECRET` - Session HMAC secret (required if auth enabled)
- `RACKULA_AUTH_SESSION_MAX_AGE_SECONDS` - Absolute timeout
- `RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS` - Idle timeout
- `RACKULA_AUTH_SESSION_GENERATION` - Session invalidation counter
- `RACKULA_AUTH_SESSION_COOKIE_SAMESITE` - Cookie SameSite policy
- `RACKULA_AUTH_SESSION_COOKIE_SECURE` - Cookie Secure flag override

**Secrets location:**

- `.env` file (copy from `.env.example`) for local development
- Docker compose environment variables for containerized deployments
- GitHub Secrets for CI/CD pipeline (CodeRabbit token, container registry credentials)

## Webhooks & Callbacks

**Incoming:**

- None — stateless frontend, no webhook consumers

**Outgoing:**

- None — no external webhook calls (Umami receives tracking data via script loader, not webhooks)

---

_Integration audit: 2026-02-19_
