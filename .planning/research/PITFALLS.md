# Pitfalls Research: Auth/Security Implementation

**Research Date:** 2026-02-19
**Context:** Common mistakes when adding auth, OIDC, session management, and CI hardening

## Critical Pitfalls

### 1. Timing Attacks on Password/Token Comparison

**Severity:** Critical
**Warning signs:** Using `===` or `==` for password hash or token comparison
**Prevention:** Use constant-time comparison (`crypto.timingSafeEqual` or Bun equivalent). Better Auth handles this internally, but any custom token validation must use constant-time comparison.
**Phase:** Local auth implementation
**Reference:** Trilium GHSA-hxf6-58cx-qq3x (Feb 2026) — full auth bypass via timing attack on sync endpoint

### 2. Hono CSRF Middleware Bypass

**Severity:** Critical
**Warning signs:** Relying solely on Hono's built-in `csrf()` middleware
**Prevention:** Update Hono to latest (fixes GHSA-rpfr-3m35-5vx5, GHSA-2234-fmw7-43wr). Add Content-Type validation. Consider double-submit cookie pattern as defence-in-depth.
**Phase:** API hardening

### 3. Password Reset Token Reuse/Non-Expiry

**Severity:** High
**Warning signs:** Tokens that don't expire, tokens usable more than once
**Prevention:** CSPRNG tokens, 15-60 min expiry, single-use (invalidate after use), don't reveal account existence in error messages (prevent enumeration).
**Phase:** Local auth implementation

### 4. In-Memory Session State Loss on Restart

**Severity:** High
**Warning signs:** All users logged out when API container restarts
**Prevention:** Migrate to persistent session store (Redis or SQLite with TTL). Current in-memory Map loses all sessions on restart.
**Phase:** Session store migration (must be first)

## Important Pitfalls

### 5. Account Enumeration via Login/Reset Responses

**Severity:** Medium
**Warning signs:** Different error messages for "user not found" vs "wrong password"
**Prevention:** Return identical error messages regardless of whether account exists. Same response time (constant-time even for non-existent users).
**Phase:** Local auth implementation

### 6. E2E Test Selector Rot After UI Changes

**Severity:** Medium (reliability)
**Warning signs:** Tests failing after UI changes, `waitForTimeout` calls, fragile CSS selectors
**Prevention:** Use `data-testid` attributes, role-based selectors (`getByRole`), page object pattern. Remove all `waitForTimeout` calls in favour of `waitForSelector`/`waitForLoadState`.
**Phase:** E2E test stabilisation

### 7. Test Account Credentials in Production

**Severity:** High (security)
**Warning signs:** Hardcoded test users in production database, test credentials in source code
**Prevention:** Separate test fixtures from production data. Use dedicated test databases. Never commit real credentials. Design test accounts with minimal privilege.
**Phase:** E2E test stabilisation

### 8. Docker Environment Variable Secret Leakage

**Severity:** High
**Warning signs:** Secrets in `docker-compose.yml`, env vars visible in `docker inspect`
**Prevention:** Use Docker secrets (`/run/secrets/`), never pass secrets via environment variables in production. Read secrets from files at runtime.
**Phase:** API hardening / documentation

### 9. OIDC Discovery Endpoint Trust

**Severity:** Medium
**Warning signs:** Trusting OIDC discovery without TLS verification, accepting any issuer
**Prevention:** Validate issuer matches configured provider, require HTTPS for discovery, verify token signatures against JWKS endpoint.
**Phase:** OIDC integration

### 10. Rate Limiting Per-IP in Shared Networks

**Severity:** Medium
**Warning signs:** Legitimate users blocked because they share IP (corporate NAT, VPN)
**Prevention:** Rate limit per user (after auth) for authenticated endpoints, per IP only for login. Start with generous limits (5x normal peak), monitor false positives.
**Phase:** API hardening

## Operational Pitfalls

### 11. No Auth Event Logging = Blind to Attacks

**Severity:** Medium
**Warning signs:** No logs for failed logins, no way to detect brute force
**Prevention:** Log all auth events (success, failure, lockout, password change, OIDC callback). Include timestamp, user ID, IP, user agent. Never log passwords or tokens.
**Phase:** Auth event logging

### 12. CI Secret Sprawl

**Severity:** Medium
**Warning signs:** Secrets duplicated across workflows, no rotation policy
**Prevention:** Use environment-based secrets with approval rules. Descriptive naming (SERVICE_ENV_PURPOSE). Rotate every 30-90 days. Prefer OIDC tokens over long-lived secrets.
**Phase:** CI hardening
