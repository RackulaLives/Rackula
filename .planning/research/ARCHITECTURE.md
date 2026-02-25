# Architecture Research: Auth Integration in Bun/Hono

**Research Date:** 2026-02-19
**Context:** How auth/security integrates with existing Bun/Hono API middleware stack

## Current Architecture

```
SPA (Svelte 5)  ──HTTP──►  Bun/Hono API
                            ├── CORS middleware
                            ├── CSRF middleware (security.ts)
                            ├── Rate limiting (security.ts)
                            ├── Cookie session middleware
                            └── Route handlers (layouts, assets)
```

## Target Architecture

```
SPA (Svelte 5)  ──HTTP──►  Bun/Hono API
                            ├── CORS middleware
                            ├── CSRF middleware (hardened)
                            ├── Rate limiting (shared store)
                            ├── Auth middleware (Better Auth)
                            │   ├── Local auth (email/password)
                            │   ├── OIDC consumer (generic provider)
                            │   └── Session management (Redis/TTL)
                            ├── Auth event logger
                            └── Route handlers
                                ├── /api/auth/* (auth endpoints)
                                ├── /api/layouts/* (protected)
                                └── /api/assets/* (protected)
```

## Component Boundaries

### Auth Provider Layer (Better Auth)

- **Owns:** User credentials, session tokens, OIDC flows
- **Talks to:** Session store (Redis), user database (SQLite)
- **Exposes:** Hono middleware, auth endpoints

### Session Store (Redis or SQLite with TTL)

- **Owns:** Active sessions, TTL expiry
- **Talks to:** Auth provider, rate limiter
- **Constraint:** Must work in single-instance (SQLite) AND multi-instance (Redis) modes

### Auth Event Logger

- **Owns:** Append-only auth event log
- **Talks to:** Auth middleware (receives events), log storage
- **Events:** login, logout, failed_login, password_change, oidc_callback, session_invalidation

### CI/CD Hardening (GitHub Actions)

- **Independent** from API auth — parallel workstream
- **Owns:** Workflow definitions, secret management, PR validation gates

### E2E Test Stabilisation (Playwright)

- **Independent** from API auth — parallel workstream
- **Owns:** Selector updates, test reliability, disabled test triage

## Data Flow

### Local Auth Flow

```
1. User submits credentials → POST /api/auth/login
2. Auth middleware validates password (Argon2id)
3. Session created in store with TTL
4. Set-Cookie response with session ID
5. Auth event logged (login_success or login_failure)
```

### OIDC Flow

```
1. User clicks "Login with [Provider]" → GET /api/auth/oidc/authorize
2. Redirect to IdP authorization endpoint
3. IdP redirects back → GET /api/auth/oidc/callback
4. Auth middleware validates tokens, creates/links user
5. Session created, cookie set
6. Auth event logged (oidc_callback)
```

## Suggested Build Order

1. **Session store migration** (in-memory → shared TTL-backed) — foundation for everything
2. **Local auth** (username/password) — depends on session store
3. **Auth event logging** — integrates with auth middleware
4. **OIDC integration** — depends on session store + local auth patterns
5. **API hardening** (security headers, CSRF hardening) — independent of auth flow
6. **CI/CD hardening** — independent workstream
7. **E2E test stabilisation** — independent workstream
8. **Bug fixes** — can interleave
9. **Documentation** — after auth is implemented

## Key Integration Points

- Better Auth provides a Hono middleware that mounts at `/api/auth/*`
- Existing CSRF middleware in security.ts needs to allow auth endpoints
- Rate limiting needs per-route configuration (stricter on login endpoints)
- Session store backs both auth sessions and rate limit counters
