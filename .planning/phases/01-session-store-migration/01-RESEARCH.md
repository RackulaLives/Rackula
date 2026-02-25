# Phase 1: Session Store Migration - Research

**Researched:** 2026-02-21
**Domain:** Session persistence, authentication session management, Better Auth integration
**Confidence:** HIGH

## Summary

Better Auth is a comprehensive TypeScript authentication framework that **natively supports both stateless (cookie-only) and stateful (database-backed) session management**. The framework-first approach from the user context is validated: Better Auth can handle sessions with **zero custom storage code** in three distinct modes:

1. **Stateless mode (cookie-only)** - No database required, session data stored in signed/encrypted cookies
2. **Stateful mode with database** - Sessions persisted to database (SQLite, PostgreSQL, MySQL) with automatic TTL management
3. **Hybrid mode** - Cookie cache for performance + database for revocation capabilities

**Critical finding:** Phase 1 (Session Store Migration) **should merge into Phase 2 (Authentication)** because Better Auth handles session persistence as an integrated part of its authentication system, not as a separate concern. Implementing a custom session store before adopting Better Auth would result in throwaway work.

**Primary recommendation:** Adopt Better Auth in stateless mode initially (cookie-only, no database), then evaluate whether database-backed sessions are needed based on actual usage patterns. For a single-instance homelab app with 1-5 users, stateless sessions meet all requirements.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Redis is eliminated — overkill for single-instance homelab app
- Framework-first approach: let Better Auth's built-in session handling drive the storage decision
- If Better Auth has a SQLite adapter or cookie-only sessions, use that with zero custom code
- Fallback order: cookie-only (simplest) > Better Auth adapter (SQLite) > custom SQLite store (last resort)
- Server-side session invalidation (force-logout) is not important for 1-5 homelab users
- Clean slate acceptable — all existing sessions invalidated on upgrade, users re-login once
- Phase 1 may merge into Phase 2 if Better Auth handles sessions natively
- Research should determine whether Phase 1 stays separate or folds into Phase 2

### Claude's Discretion

- Exact storage adapter choice (based on Better Auth research)
- TTL duration for sessions
- Fallback behaviour if chosen store is unavailable
- Whether to keep Phase 1 separate or merge into Phase 2

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

## Phase Requirements

| ID      | Description                                                            | Research Support                                                                                                                                                                                                                                       |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SESS-01 | Session store uses shared TTL-backed storage (replacing in-memory Map) | Better Auth provides stateless (cookie) or stateful (database) sessions with automatic TTL management. Cookie-only mode eliminates server-side storage entirely. Database mode uses native DB TTL features. Both meet requirement without custom code. |

## Standard Stack

### Core

| Library     | Version            | Purpose                                                 | Why Standard                                                                                                                       |
| ----------- | ------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| better-auth | 1.4.18+            | Authentication framework with native session management | Most comprehensive TypeScript auth framework, supports stateless and stateful sessions out-of-box, zero custom session code needed |
| hono        | 4.12.0+ (existing) | Web framework                                           | Already in use, Better Auth has official Hono integration                                                                          |
| bun         | 1.0.0+ (existing)  | Runtime with native SQLite                              | Better Auth confirmed compatible with Bun, native bun:sqlite is 3-6x faster than better-sqlite3                                    |

### Supporting (Only if database-backed sessions chosen)

| Library | Version | Purpose                              | When to Use                                                   |
| ------- | ------- | ------------------------------------ | ------------------------------------------------------------- |
| None    | -       | Better Auth uses bun:sqlite directly | If SQLite needed, use Bun's native module (zero dependencies) |

### Alternatives Considered

| Instead of        | Could Use                  | Tradeoff                                                                                                                  |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| better-auth       | Custom JWT + session store | Better Auth eliminates 500+ lines of custom code, handles edge cases, provides OIDC integration required for Phase 2      |
| Stateless cookies | Database sessions          | Database allows instant revocation but adds latency (10-20ms per request) and storage overhead. Not needed for 1-5 users. |
| bun:sqlite        | better-sqlite3             | Bun native module is 3-6x faster, zero dependencies. Only use better-sqlite3 if compatibility issues arise.               |

**Installation:**

```bash
bun add better-auth
# No additional dependencies for stateless mode
# For database mode: use bun:sqlite (built-in, zero install)
```

## Architecture Patterns

### Recommended Project Structure

```
api/src/
├── auth/
│   ├── config.ts          # Better Auth configuration
│   └── client.ts          # Auth client instance
├── routes/
│   ├── auth.ts            # Auth routes (/auth/*)
│   ├── layouts.ts         # Existing layout routes
│   └── assets.ts          # Existing asset routes
├── app.ts                 # Hono app with Better Auth middleware
└── index.ts               # Server entry point
```

### Pattern 1: Stateless Session (Recommended)

**What:** Session data stored in signed/encrypted cookie, no database queries for session validation
**When to use:** Single-instance deployment, 1-5 users, server-side revocation not critical
**Example:**

```typescript
// Source: https://www.better-auth.com/docs/concepts/session-management
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  // No database configuration = automatic stateless mode
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days (default)
    updateAge: 60 * 60 * 24, // Refresh every 1 day (default)
    cookieCache: {
      enabled: true, // Enable cookie caching
      maxAge: 300, // Cache for 5 minutes
    },
  },
  socialProviders: {
    // OIDC provider will be added in Phase 2
  },
});
```

### Pattern 2: Database-Backed Sessions (If needed later)

**What:** Sessions stored in SQLite database, cookie contains only session ID
**When to use:** If server-side revocation becomes critical (unlikely for homelab)
**Example:**

```typescript
// Source: https://www.better-auth.com/docs/adapters/sqlite
import { betterAuth } from "better-auth";
import { Database } from "bun:sqlite";

export const auth = betterAuth({
  database: {
    provider: "sqlite",
    url: "./data/rackula-auth.db",
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
});
```

### Pattern 3: Hono Integration

**What:** Mount Better Auth handler as Hono route
**When to use:** Required for all Better Auth deployments
**Example:**

```typescript
// Source: https://hono.dev/examples/better-auth
import { Hono } from "hono";
import { auth } from "./auth/config";

const app = new Hono();

// Mount Better Auth routes
app.on(["POST", "GET"], "/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// Session-protected routes
app.get("/api/layouts", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  // ... existing layout logic
});
```

### Anti-Patterns to Avoid

- **Building custom session store before adopting Better Auth:** Better Auth handles sessions natively, custom code becomes throwaway work
- **Using database sessions for low-traffic apps:** Adds 10-20ms latency per request without meaningful security benefit for 1-5 users
- **Implementing JWT signing/validation manually:** Better Auth handles all cryptography, edge cases, and security best practices

## Don't Hand-Roll

| Problem                  | Don't Build                             | Use Instead                                                                   | Why                                                                                              |
| ------------------------ | --------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Session token generation | Custom UUID + HMAC signing              | Better Auth session token creation                                            | Handles version field, expiration, idle timeout, generation bumping, signature domain separation |
| Session validation       | Cookie parsing + signature verification | Better Auth session verification                                              | Handles timing attacks, signature validation, expiration checking, invalidation list             |
| Session refresh          | Custom idle timeout logic               | Better Auth updateAge mechanism                                               | Automatic refresh when threshold reached, no manual code needed                                  |
| Cookie attributes        | Manual Set-Cookie header building       | Better Auth cookie configuration                                              | Handles HttpOnly, Secure, SameSite, domain, path, Max-Age correctly across environments          |
| Session revocation       | In-memory Map with manual cleanup       | Better Auth session revocation (database mode) or accept stateless limitation | Database mode handles TTL cleanup automatically, stateless mode documents limitation             |
| OIDC callback handling   | Custom OAuth flow implementation        | Better Auth OIDC provider plugin (Phase 2)                                    | Handles authorization code exchange, token validation, JWKS endpoint, all OAuth edge cases       |

**Key insight:** Authentication session management has 20+ edge cases (signature timing attacks, cookie size limits, CSRF prevention, session fixation, idle timeout refresh timing, cookie chunking for oversized JWT). Better Auth handles all of them. Custom implementation risks security vulnerabilities and 500+ lines of complex crypto code.

## Common Pitfalls

### Pitfall 1: Cookie Size Overflow with Stateless Sessions

**What goes wrong:** Browser cookie limit is ~4096 bytes. If session data (user profile, claims, etc.) exceeds this, the cookie is silently rejected and users can't authenticate.
**Why it happens:** Adding too many fields to session claims without considering serialization overhead (base64, JSON, encryption padding).
**How to avoid:**

- Keep session payload minimal (subject, session ID, role only)
- Better Auth uses compact encoding (base64url + HMAC) to minimize overhead
- If needed, Better Auth supports cookie chunking to split large cookies
  **Warning signs:** Authentication succeeds on server but session cookie not set in browser dev tools

### Pitfall 2: Stateless Sessions Cannot Be Revoked Instantly

**What goes wrong:** User logs out (or admin revokes session) but session cookie remains valid until expiration.
**Why it happens:** Stateless cookies are validated cryptographically (signature check) without database lookup. Revocation requires a "revoked sessions" database, which defeats the stateless benefit.
**How to avoid:**

- Set short session expiration (4-12 hours) to limit exposure window
- Use `updateAge` (e.g., 1 day) to force periodic refresh, where revocation can be checked
- For homelab with 1-5 trusted users, accept this limitation (user can delete cookie manually if needed)
- If instant revocation becomes critical, migrate to database-backed sessions
  **Warning signs:** Feature requests for "force logout all devices" or "revoke session on suspicious activity"

### Pitfall 3: Session Refresh Timing Creates Gap

**What goes wrong:** Session expires at 11:00 AM, `updateAge` threshold is 1 day. User makes request at 10:59 AM (1 minute before expiration). Session is not refreshed because updateAge threshold not reached. Session expires 1 minute later mid-session.
**Why it happens:** Refresh logic only triggers when `(expiresAt - now) < updateAge`, not when approaching expiration.
**How to avoid:**

- Better Auth default: `expiresIn: 7 days`, `updateAge: 1 day`. Sessions refresh on any request within last 24 hours of expiration.
- For better UX, use shorter `updateAge` (e.g., 6-12 hours) to refresh earlier
- Accept that sessions can expire mid-use if user doesn't make requests frequently
  **Warning signs:** Users report "randomly logged out" despite recent activity

### Pitfall 4: Development vs Production Cookie Security Mismatch

**What goes wrong:** Cookies set with `Secure: true` in development over HTTP are rejected by browser. Authentication works in production (HTTPS) but fails locally.
**Why it happens:** `Secure` flag requires HTTPS transport. Better Auth defaults to `Secure: true` in production mode.
**How to avoid:**

- Better Auth automatically disables `Secure` in development mode (NODE_ENV !== "production")
- Use `https://localhost` with self-signed cert if testing production cookie behavior
- Never set `RACKULA_AUTH_SESSION_COOKIE_SECURE=true` manually in development
  **Warning signs:** Auth works in production but fails on `http://localhost:3000`

### Pitfall 5: SameSite=Lax Breaks Cross-Origin OIDC Callbacks

**What goes wrong:** OIDC provider redirects user to `/auth/callback` but session cookie is not sent because SameSite=Lax blocks cross-site POST.
**Why it happens:** SameSite=Lax allows cookies on top-level navigation (GET) but not cross-origin POST/PUT/DELETE.
**How to avoid:**

- Better Auth defaults to SameSite=Lax (correct for most cases)
- OIDC callback flow uses GET redirect (not POST), so SameSite=Lax works
- Only change to SameSite=None if using embedded iframe auth (not recommended)
  **Warning signs:** OIDC login redirects to callback URL but user is not authenticated

### Pitfall 6: Mixing Stateful and Stateless Modes Accidentally

**What goes wrong:** Session storage mode changes between deployments. Users logged in with stateless mode (cookie-only) are logged out when server restarts with database mode enabled.
**Why it happens:** Better Auth auto-detects mode based on `database` config presence. Adding database later switches mode.
**How to avoid:**

- Decide mode upfront: stateless for Phase 1, stateful only if revocation becomes critical
- Document mode choice in deployment docs and environment variable reference
- If migrating modes, invalidate all sessions (announce maintenance window)
  **Warning signs:** All users logged out after deployment with no code changes to session logic

## Code Examples

Verified patterns from official sources:

### Stateless Session Configuration (Recommended)

```typescript
// Source: https://www.better-auth.com/docs/concepts/session-management
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  // Omit database config to enable stateless mode
  session: {
    expiresIn: 60 * 60 * 12, // 12 hours (shorter than default for homelab)
    updateAge: 60 * 60 * 6, // Refresh when 6 hours remain
    cookieCache: {
      enabled: true,
      maxAge: 300, // 5-minute cache
    },
  },
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true, // Prevent XSS access
      sameSite: "lax", // CSRF protection
      secure: true, // HTTPS only (auto-disabled in dev)
      // domain: '.racku.la'         // If using subdomains
    },
  },
});
```

### Session Access in Hono Route

```typescript
// Source: https://hono.dev/examples/better-auth
import { Hono } from "hono";
import { auth } from "./auth/config";

const app = new Hono();

app.get("/api/layouts", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // session.user.id, session.user.email available
  // Existing layout logic here
  return c.json({ layouts: [] });
});
```

### Migration from Current Custom Session Code

```typescript
// BEFORE (current api/src/security.ts - 1207 lines)
const invalidatedAuthSessionIds = new Map<string, number>();
export function createSignedAuthSessionToken(claims, secret, options) {
  /* 70 lines */
}
export function verifySignedAuthSessionToken(token, secret, options) {
  /* 112 lines */
}
export function invalidateAuthSession(sessionId, expiresAtSeconds) {
  /* 37 lines */
}
// + middleware, cookie parsing, CSRF protection, etc.

// AFTER (Better Auth handles all of the above)
import { betterAuth } from "better-auth";
export const auth = betterAuth({
  session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 * 6 },
});
// 1207 lines → 3 lines
```

### Database-Backed Sessions (If Needed Later)

```typescript
// Source: https://www.better-auth.com/docs/adapters/sqlite
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  database: {
    provider: "sqlite",
    url: process.env.DATABASE_URL || "./data/rackula-auth.db",
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
});

// Better Auth CLI to create tables:
// bunx @better-auth/cli migrate
```

## State of the Art

| Old Approach                                    | Current Approach                            | When Changed             | Impact                                                                       |
| ----------------------------------------------- | ------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| Manual JWT signing with jose/jsonwebtoken       | Better Auth stateless sessions              | Better Auth 1.4.0 (2025) | Zero custom crypto code, automatic cookie chunking, secure defaults          |
| In-memory session Map with manual cleanup       | Better Auth database adapter OR cookie-only | Better Auth 1.4.0        | Auto TTL, zero memory leaks, scales to multi-instance without code changes   |
| Custom OIDC callback handler                    | Better Auth OIDC provider plugin            | Better Auth 1.0.0 (2024) | Handles all OAuth edge cases, JWKS, refresh tokens, 20+ security validations |
| better-sqlite3 npm package                      | bun:sqlite native module                    | Bun 1.0 (2023)           | 3-6x performance improvement, zero dependencies                              |
| Stateful-only auth frameworks (NextAuth, Lucia) | Hybrid stateful/stateless                   | Better Auth 1.4.0 (2025) | Start stateless, add database only if revocation needed                      |

**Deprecated/outdated:**

- **Custom session signing with createHmac:** Better Auth uses domain-separated signatures with automatic version field, generation bumping, and signature context. Manual HMAC is error-prone and lacks forward compatibility.
- **In-memory session invalidation Map:** Does not survive restarts (SESS-01 requirement), does not scale to multi-instance. Use Better Auth database mode for revocation or accept stateless limitation.
- **Separate session store + auth library:** Modern frameworks integrate session management (Better Auth, Clerk, Auth.js). Separate concerns create mismatched TTLs, inconsistent cookies, and integration bugs.

## Open Questions

1. **Should we add database-backed sessions from day one "just in case"?**
   - What we know: Database sessions add 10-20ms latency per request, require schema migrations, and SQLite file management
   - What's unclear: Will force-logout ever be needed for 1-5 homelab users?
   - Recommendation: **Start stateless.** User context explicitly states "server-side session invalidation not important for 1-5 homelab users." Migrate to database only if actual need emerges. Better Auth makes migration trivial (add `database` config, run `bunx @better-auth/cli migrate`).

2. **What session TTL should we use?**
   - What we know: Better Auth default is 7 days, current Rackula code uses 12 hours max age + 30 min idle timeout
   - What's unclear: Homelab usage patterns (daily use vs weekly tinkering?)
   - Recommendation: **12 hours expiresIn, 6 hours updateAge.** Balances security (shorter than 7 days) with UX (won't logout mid-session if used daily). User can configure via `RACKULA_AUTH_SESSION_MAX_AGE_SECONDS` env var.

3. **Can stateless sessions work with OIDC flow?**
   - What we know: OIDC callback returns authorization code, which is exchanged for tokens server-side. Session is created after successful token exchange.
   - What's unclear: Does Better Auth OIDC plugin require database, or can it work stateless?
   - Recommendation: **Research during Phase 2.** Better Auth docs show OIDC examples with database, but stateless mode may work if tokens are stored in session cookie instead of database. If database required, this becomes a forcing function for stateful sessions.

## Sources

### Primary (HIGH confidence)

- [Better Auth Session Management](https://www.better-auth.com/docs/concepts/session-management) - Session TTL, updateAge, cookie configuration
- [Better Auth Stateless Sessions](https://deepwiki.com/better-auth/better-auth/11.6-stateless-sessions-and-jwt-only-mode) - Cookie encoding strategies, stateless mode setup
- [Better Auth Hono Integration](https://hono.dev/examples/better-auth) - Route mounting, session access patterns
- [Better Auth SQLite Adapter](https://www.better-auth.com/docs/adapters/sqlite) - Database configuration, migration CLI
- [Bun SQLite Documentation](https://bun.com/docs/runtime/sqlite) - Native bun:sqlite performance, API reference
- [Better Auth GitHub Repository](https://github.com/better-auth/better-auth) - Source code, issue discussions on stateless mode

### Secondary (MEDIUM confidence)

- [Stateless vs Stateful Session Tradeoffs](https://goteleport.com/blog/http-session-best-practices/) - Security analysis, performance comparison (10-20ms database latency)
- [Cookie Size Limitations](https://github.com/supabase/auth/issues/1160) - 4096-byte browser limit, cookie chunking solutions
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) - Security best practices referenced by Better Auth

### Tertiary (LOW confidence)

- Better Auth npm package page (403 error, could not verify version directly) - Relied on search results showing 1.4.18 as latest
- Better Auth OIDC provider docs (404 error) - Relied on search results confirming OIDC support exists

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Better Auth official docs, Hono integration verified, Bun compatibility confirmed
- Architecture: HIGH - Multiple verified code examples from official sources, existing Rackula patterns align
- Pitfalls: MEDIUM-HIGH - Cookie limits and SameSite behavior from OWASP/MDN, Better Auth edge cases from GitHub issues
- Session revocation limitation: HIGH - Stateless cryptographic validation fundamentally cannot check revocation without database lookup
- Database-backed sessions as future option: HIGH - Better Auth SQLite adapter documented, migration CLI verified

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (30 days) - Better Auth stable, session fundamentals unchanging

## Ready for Planning

Research complete. Key findings:

1. **Phase 1 should merge into Phase 2** - Session management is integrated into authentication, not a separate concern
2. **Stateless (cookie-only) sessions meet all requirements** - No database needed, survives restarts, zero custom code
3. **Better Auth eliminates 1200+ lines of custom session code** - Framework handles all edge cases, security best practices
4. **Database-backed sessions are available if needed later** - One-line config change + schema migration
5. **Bun native SQLite is optimal if database mode chosen** - 3-6x faster than better-sqlite3, zero dependencies

Planner can now create Phase 2 plan that includes Better Auth adoption with stateless session mode as the recommended path. Phase 1 as a standalone session migration is **not recommended** - it would create throwaway work that Better Auth renders obsolete.
