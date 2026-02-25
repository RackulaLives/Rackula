# Phase 1: Session Store Migration - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace in-memory session storage with persistent storage that survives container restarts. Single-instance only — multi-instance deployment is not a realistic use case for Rackula. The scope may merge into Phase 2 (Authentication) if Better Auth handles session persistence natively.

</domain>

<decisions>
## Implementation Decisions

### Storage backend

- Redis is eliminated — overkill for single-instance homelab app
- Framework-first approach: let Better Auth's built-in session handling drive the storage decision
- If Better Auth has a SQLite adapter or cookie-only sessions, use that with zero custom code
- Fallback order: cookie-only (simplest) > Better Auth adapter (SQLite) > custom SQLite store (last resort)
- Server-side session invalidation (force-logout) is not important for 1-5 homelab users

### Configuration model

- Deferred to research — if Better Auth handles sessions natively, no custom configuration may be needed
- If configuration is needed, follow existing Rackula patterns (environment variables via .env)

### Fallback behaviour

- Deferred to research — depends on which store is chosen
- No specific principle locked in; let the implementation determine sensible defaults

### Session continuity

- Clean slate is acceptable — all existing sessions invalidated on upgrade, users re-login once
- No migration of existing in-memory sessions needed

### Phase scope

- If Better Auth handles session persistence with zero custom code, this phase may merge into Phase 2 (Authentication)
- Research should determine whether Phase 1 stays separate or folds into Phase 2

### Claude's Discretion

- Exact storage adapter choice (based on Better Auth research)
- TTL duration for sessions
- Fallback behaviour if chosen store is unavailable
- Whether to keep Phase 1 separate or merge into Phase 2

</decisions>

<specifics>
## Specific Ideas

- Devil's advocate analysis concluded: the simplest approach wins. Cookie-only (no server state) solves the restart problem entirely if it works with OIDC flow.
- "I can't imagine multi-instance Rackula deployments" — this eliminates Redis and any shared-state complexity.
- Bun has native SQLite support if a file-based store is needed.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 01-session-store-migration_
_Context gathered: 2026-02-21_
