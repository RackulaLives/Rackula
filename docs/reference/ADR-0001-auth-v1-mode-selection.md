# ADR-0001: Authentication v1 Mode Selection

- **Status:** Accepted
- **Date:** 2026-02-10
- **Decision Owner:** Rackula maintainers
- **Related:** #1095, #1100

## Context

Rackula now supports persistent deployments and is increasingly used in shared environments (teams, mixed-user contexts, organizations).  
With persistence enabled, unauthorized access can mutate or delete shared layouts and assets.

Auth must remain optional by deployment choice, but when enabled it must enforce no-anonymous access across app/API surfaces.

The candidate auth mode paths were:
- Local password/user mode.
- Generic OIDC mode.
- Hybrid mode.

## Decision

For Authentication v1:

1. Keep the mode model as `none | oidc | local`.
2. Ship MVP behavior for `none + oidc`.
3. Defer `local` mode to follow-up implementation (#1117).
4. Defer full hybrid execution semantics to later phases.
5. When auth is enabled:
   - anonymous access is not allowed,
   - authorization model is single-admin,
   - basic auth event logging is required.

## Rationale

- OIDC has the strongest security posture for shared deployments because credential lifecycle and MFA are delegated to an IdP.
- It avoids introducing v1 password storage and reset liabilities.
- It matches common self-hosting operator stacks (reverse proxy + IdP).
- It preserves compatibility with future local and hybrid additions without redesigning mode configuration.

## Consequences

### Positive

- Faster path to secure shared deployment posture.
- Reduced credential-handling risk in v1.
- Clear phased roadmap for local and hybrid expansion.

### Negative

- OIDC integration complexity is higher than a minimal local-only implementation.
- Operators without an IdP must wait for local mode follow-up or remain in `none` mode.

### Follow-Up Work

- #1101: Auth gate and no-anonymous mode behavior.
- #1102: Generic OIDC integration.
- #1104: Basic auth event logging.
- #1105: Single-admin authorization.
- #1106: Session and cookie hardening.
- #1107: Auth setup and hardening docs.
- #1117: Local auth mode.
