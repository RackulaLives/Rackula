# Features Research: Self-Hosted Auth/Security

**Research Date:** 2026-02-19
**Context:** What auth/security features do self-hosted web apps need?

## Table Stakes (must have)

| Feature                                             | Complexity | Dependencies                    | Notes                                                  |
| --------------------------------------------------- | ---------- | ------------------------------- | ------------------------------------------------------ |
| Local username/password auth                        | Medium     | Password hashing, session store | Core requirement for self-hosters without external IdP |
| Session management (login/logout)                   | Low        | Session store                   | Already partially implemented                          |
| Password reset via email                            | Medium     | Email sending, token generation | CSPRNG tokens, 15-60 min expiry, single-use            |
| CSRF protection                                     | Low        | —                               | Already implemented, needs hardening                   |
| Rate limiting on auth endpoints                     | Low        | —                               | Already implemented, needs shared store                |
| Secure cookie handling (HttpOnly, Secure, SameSite) | Low        | —                               | Already implemented                                    |
| Account lockout after failed attempts               | Low        | Session/rate limit store        | Prevent brute force                                    |

## Differentiators (competitive advantage for self-hosted)

| Feature                                 | Complexity | Dependencies                     | Notes                                                               |
| --------------------------------------- | ---------- | -------------------------------- | ------------------------------------------------------------------- |
| Generic OIDC integration                | High       | OIDC library, discovery protocol | Lets self-hosters use any IdP (Authentik, Authelia, Keycloak, etc.) |
| Auth event logging/audit trail          | Medium     | Log storage                      | Append-only log of auth events for security monitoring              |
| Shared session store (Redis/TTL-backed) | Medium     | Redis or equivalent              | Multi-instance deployment support                                   |
| Docker secrets integration              | Low        | Docker runtime                   | Read secrets from `/run/secrets/` instead of env vars               |
| Auth setup documentation                | Low        | —                                | Critical for self-hosters to configure correctly                    |
| CI pipeline hardening                   | Medium     | GitHub Actions                   | PR validation, deploy guards, secret management                     |

## Anti-Features (deliberately NOT building)

| Feature                             | Reason                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Built-in user management UI         | Over-scope — admin can manage via API/database directly                        |
| Email service/SMTP server           | Self-hosters provide their own SMTP; we just send via configured transport     |
| Multi-tenancy/organisations         | Single-user or small-team tool, not enterprise SaaS                            |
| OAuth provider (acting as IdP)      | Rackula consumes auth, doesn't provide it                                      |
| Social login (Google, GitHub, etc.) | Generic OIDC covers this; no provider-specific code                            |
| Role-based access control (RBAC)    | All authenticated users have equal access; no role hierarchy needed for v0.9.0 |
| MFA/2FA                             | Defer to v1.0 — OIDC providers handle this upstream                            |

## Feature Dependencies

```
Local Auth ──► Session Store ──► Rate Limiting
                    │
OIDC Integration ───┘
                    │
Auth Event Logging ─┘

CI Hardening (independent)
E2E Stabilisation (independent)
```
