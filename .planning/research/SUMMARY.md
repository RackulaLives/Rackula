# Research Summary: Rackula v0.9.0 Auth/Security

**Research Date:** 2026-02-19

## Key Findings

### Stack

- **Better Auth** is the recommended auth framework — native Hono integration, local auth + OIDC via plugins, TypeScript-first
- **Argon2id** for password hashing (OWASP recommended, Bun has native support)
- **Redis** (or SQLite for single-instance) for shared session store with TTL
- Hono's built-in CSRF has known bypasses — needs hardening

### Table Stakes

- Local username/password authentication
- Session management with persistent store
- Password reset with time-limited tokens
- Rate limiting on auth endpoints
- Secure cookie handling (already exists)

### Differentiators

- Generic OIDC integration (any IdP — Authentik, Authelia, Keycloak)
- Auth event logging/audit trail
- Multi-instance session store (Redis)
- Docker secrets integration
- Self-hosted deployment documentation

### Watch Out For

1. **Timing attacks** on password/token comparison — use constant-time functions
2. **Hono CSRF bypass** — update Hono, add defence-in-depth
3. **Session state loss** on container restart — migrate from in-memory ASAP
4. **Account enumeration** — identical error messages for all login failures
5. **E2E selector rot** — use data-testid, not CSS selectors

## Build Order (from architecture research)

1. Session store migration (foundation)
2. Local auth (depends on session store)
3. Auth event logging (integrates with auth)
4. OIDC integration (depends on session store + auth patterns)
5. API hardening (independent)
6. CI/CD hardening (independent)
7. E2E test stabilisation (independent)
8. Bug fixes (interleave)
9. Documentation (after auth implemented)

## Files

| File            | Contents                                            |
| --------------- | --------------------------------------------------- |
| STACK.md        | Library recommendations with versions and rationale |
| FEATURES.md     | Table stakes / differentiators / anti-features      |
| ARCHITECTURE.md | Component boundaries, data flow, build order        |
| PITFALLS.md     | 12 specific pitfalls with prevention strategies     |
