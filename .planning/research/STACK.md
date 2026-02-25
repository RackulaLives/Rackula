# Stack Research: Auth/Security for Bun/Hono API

**Research Date:** 2026-02-19
**Context:** Adding local auth + OIDC + session management + CI hardening to existing Bun/Hono API

## Authentication Framework

| Option            | Recommendation            | Confidence | Rationale                                                                                                                                                                                                                                     |
| ----------------- | ------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Better Auth**   | Recommended               | High       | Framework-agnostic TypeScript auth library with native Hono integration, built-in OIDC provider/consumer via plugins (SSO, Generic OAuth), email/password, 2FA, session management. No adapter needed for Hono — passes Web Request directly. |
| `@hono/oidc-auth` | Alternative for OIDC-only | Medium     | Lightweight storage-less OIDC sessions. Good if only external IdP needed, but doesn't handle local auth.                                                                                                                                      |
| Arctic            | Not recommended           | Low        | OAuth 2.0 client for 70+ specific providers, but no generic OIDC provider support. Provider-specific, not what we need.                                                                                                                       |
| Lucia Auth        | Not recommended           | —          | Deprecated in favour of rolling your own with Arctic. Not maintained.                                                                                                                                                                         |

**Decision:** Better Auth covers both local auth AND generic OIDC via its plugin system. Single library for both requirements.

## Password Hashing

| Option                                        | Recommendation      | Rationale                                                                                               |
| --------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| **Argon2id** (via `bun:password` or `argon2`) | Recommended         | OWASP-recommended, memory-hard, resistant to GPU/ASIC attacks. Bun has native password hashing support. |
| bcrypt                                        | Acceptable fallback | Well-tested, widely supported, but not memory-hard.                                                     |

## Session Store

| Option                                        | Recommendation                  | Rationale                                                                                                          |
| --------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Redis** (via `ioredis` or Bun native Redis) | Recommended                     | TTL-backed, shared across instances, well-supported. Bun has native Redis bindings with Promise-based API and TLS. |
| SQLite                                        | Alternative for single-instance | Simpler deployment, no extra service, but doesn't scale to multi-instance.                                         |
| `connect-redis-hono`                          | Integration layer               | Redis session store connector for hono-sessions.                                                                   |

**Note:** Bun provides native Redis bindings — no need for `node-redis` adapter.

## CSRF Protection

- Hono built-in `csrf()` middleware — checks Origin + Sec-Fetch-Site headers
- **Known vulnerability:** Case-insensitive MIME type bypass (GHSA-rpfr-3m35-5vx5, GHSA-2234-fmw7-43wr)
- **Mitigation:** Ensure Hono is updated, add Content-Type validation, use double-submit cookie pattern as defence-in-depth

## Rate Limiting

- `hono-rate-limiter` v0.5.3 — supports external data stores for multi-instance sync
- Already have custom rate limiting in security.ts — evaluate whether to migrate to library or keep custom

## CI/CD Security

- GitHub Actions environment-based secrets (org → repo → environment tiers)
- Docker secrets via `/run/secrets/` mount (never environment variables)
- OIDC for GitHub Actions → cloud services (over long-lived tokens)
- Secret rotation every 30-90 days

## Audit Logging

- Append-only event log pattern (not full event sourcing)
- Required events: login success/failure, password changes, session creation/invalidation, OIDC callbacks
- Log: timestamp, userId, event type, IP, user agent
- Don't log: passwords, tokens, session secrets

## What NOT to Use

| Library          | Why Not                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| Passport.js      | Node.js-specific, doesn't work well with Bun/Hono                           |
| NextAuth/Auth.js | Next.js-centric, heavy framework coupling                                   |
| Lucia Auth       | Deprecated, community migrating away                                        |
| Arctic alone     | No generic OIDC, only specific providers                                    |
| JWT for sessions | Cookie-based sessions are simpler and more secure for SPA + API same-origin |
