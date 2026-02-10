# Spike #1100: Authentication v1 Architecture and Effort Matrix

**Date:** 2026-02-10  
**Parent Epic:** #1095 (Authentication and Access Control for Persistent Deployments)

---

## Executive Summary

This spike evaluates Rackula Authentication v1 options for persistent self-hosted deployments where multiple people may access the same instance (org teams, mixed-user environments, homelab groups).

**Recommendation:** Ship **optional auth** with **MVP mode set to `none + oidc`**, enforce **no anonymous access when auth is enabled**, use a **single-admin authorization model**, and require **basic auth event logging** in v1.  
Keep `local` mode as a follow-up track (issue #1117), and defer fully flexible hybrid execution to later phases.

This recommendation balances:
- Stronger default security posture for shared deployments.
- Lower operational burden than maintaining a local credential system in v1.
- A clear upgrade path to local and hybrid modes without breaking config model (`none | oidc | local`).

---

## Scope and Requirements

This spike evaluates three auth mode paths:
- Local password/user mode.
- Generic OIDC mode.
- Hybrid mode.

Decision constraints from #1095 and #1100:
- Auth remains optional by deployment choice.
- When auth is enabled, anonymous access is not allowed.
- MVP authorization is single-admin.
- MVP includes basic auth event logging.

---

## Threat Model (Persistent Deployments)

### Deployment Context

- Persistence-enabled Rackula has shared API state on disk.
- Real-world usage includes teams and mixed-user environments.
- Risk is primarily integrity and availability, with moderate confidentiality concerns.

### Key Assets

| Asset | Why it matters |
| --- | --- |
| Layout data and metadata | Unauthorized edits/deletes directly impact operational planning accuracy. |
| Uploaded assets | Tampering can mislead users; large uploads can exhaust storage. |
| Auth/session state | Session compromise bypasses intended access controls. |
| Audit logs | Needed to investigate misuse and failures. |

### Primary Abuse Cases

| Abuse case | Likely impact | Controls required in v1 |
| --- | --- | --- |
| Anonymous or weakly controlled access to persistent API | Unauthorized mutation/deletion | Auth gate, no-anonymous when enabled |
| Credential/session theft or replay | Account/session takeover | Secure cookie/session settings, rotation, expiry |
| Misconfiguration (partial protection) | False sense of security, exposed API | App-level auth enforcement across UI and API |
| Brute force / credential stuffing (local mode) | Unauthorized access | Password policy + lockout/rate limiting (if local mode enabled) |
| Missing observability | Inability to detect/respond | Auth event logging with success/failure outcomes |

### Threat-to-Mode Summary

| Threat area | Local mode | OIDC mode | Hybrid mode |
| --- | --- | --- | --- |
| Credential lifecycle risk | High (stored/managed by app) | Lower (delegated to IdP) | Medium-high (both stacks) |
| Misconfiguration surface | Medium | Medium | High |
| Operational complexity | Medium | Medium | High |
| Incident forensics dependency | App logs | App + IdP logs | App + IdP + local logs |

---

## Auth Mode Comparison Matrix

| Mode | Implementation Effort | Security Posture | Operational Fit (Self-Hosted) | Pros | Cons |
| --- | --- | --- | --- | --- | --- |
| Local password/user mode | **M** | Medium (good with careful hardening) | Good for offline/simple setups; weaker enterprise fit | No external IdP dependency; self-contained | Password handling, reset flow, brute-force controls, secret management all owned by app |
| Generic OIDC SSO mode | **L** | High (if IdP configured correctly) | Strong for org/multi-user; moderate for homelab teams with Authentik/Authelia | Delegates credential security and MFA to IdP; cleaner compliance posture | Protocol/session integration complexity; dependency on IdP availability/config |
| Hybrid mode (OIDC + local concurrently) | **L** | Medium-high (depends on hardening) | Flexible for broad deployment mix | Maximum deployment flexibility | Largest attack surface and testing matrix; policy ambiguity and operational drift risk |

### Effort Detail (S/M/L)

| Workstream | Local | OIDC | Hybrid |
| --- | --- | --- | --- |
| Auth flow implementation | M | L | L |
| Session/cookie hardening | M | M | L |
| Admin UX and bootstrap | M | M | L |
| Testing burden | M | L | L |
| Documentation burden | M | M | L |
| Total | **M** | **L** | **L** |

---

## MVP Recommendation

### Selected MVP Mode(s)

- `none` (auth disabled, explicit operator choice)
- `oidc` (auth enabled path for v1)

### Deferred from MVP

- `local` auth mode (tracked as #1117)
- Full hybrid runtime behavior where local and OIDC are active simultaneously

### Rationale

1. OIDC gives the best security-to-effort ratio for shared deployments where persistence introduces meaningful risk.
2. It avoids introducing password storage/reset liabilities in v1.
3. It aligns with current self-hosting reality (reverse proxies and IdP components already common in this audience).
4. It preserves a clear extension path to local mode without changing the top-level mode model.

---

## MVP Security and Logging Requirements

When auth is enabled in v1:
- No anonymous reads or writes across app/API surfaces.
- Single-admin authorization policy only.
- Session hardening baseline (secure cookie attributes, rotation on auth transitions, bounded lifetime).
- Basic auth event logging for at least:
  - Login success/failure.
  - Logout.
  - Session rejection/expiration.
  - Authorization-denied events.
- Log fields baseline:
  - Timestamp, event type, outcome, subject identifier, mode (`oidc`), and request correlation hints.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| IdP misconfiguration leads to lockout or bypass assumptions | Availability/security | Provide explicit startup validation and a deterministic auth-disabled fallback only when mode=`none` |
| Partial route gating leaves API exposed | Integrity | Enforce auth in app layer on all protected endpoints, not just proxy docs |
| Insufficient auth telemetry | Detection gap | Minimum structured auth event logs in v1 |
| Local mode pressure before hardening is ready | Security debt | Keep local mode as post-v1 milestone (#1117) |
| Hybrid complexity drags v1 timeline | Delivery risk | Defer hybrid execution semantics to later phase |

---

## Proposed Phased Roadmap

### v1 (MVP)

- Deliver `none + oidc` mode behavior.
- Enforce no anonymous access when auth enabled.
- Implement single-admin authorization.
- Implement basic auth event logging.
- Publish deployment/setup docs for OIDC path.

### v1.1

- Add local auth mode (`local`) with safe bootstrap/admin setup.
- Add local-mode-specific controls (rate limiting guidance, password policy baseline, reset/rotation guidance).

### Later

- Add explicit hybrid execution semantics and policy precedence.
- Expand authorization model beyond single-admin (roles/scopes).
- Add richer security telemetry and policy controls.

---

## Deliverables

- Threat model focused on persistent shared deployments (included above).
- Auth mode comparison matrix with effort/security/operational fit (included above).
- MVP recommendation with rationale (included above).
- Phased roadmap (v1, v1.1, later) (included above).
- Architecture Decision Record:
  - `docs/reference/ADR-0001-auth-v1-mode-selection.md`

---

## Related

- #1095 (parent epic)
- #1101, #1102, #1104, #1105, #1106, #1107
- #1117 (local mode follow-up)
