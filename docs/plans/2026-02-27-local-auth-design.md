# Design Spec: Local Authentication Mode (#1117)

**Status:** Draft
**Date:** 2026-02-27
**Issue:** [#1117](https://github.com/RackulaLives/Rackula/issues/1117)
**Author:** Claude Code (design assist)

---

## Context

Rackula's auth system currently supports `none` (anonymous) and `oidc` (delegated to identity provider). Issue #1117 adds `AUTH_MODE=local` — username/password authentication for homelabbers who can't or don't want to run an IdP.

All dependencies are complete: auth gate (#1101), session hardening (#1106), admin role (#1105), architecture spike (#1100). The session infrastructure is auth-mode-agnostic — once a signed cookie exists, validation is identical regardless of how the user authenticated.

**Scope:** Single admin account. Design spec only (no implementation code).

---

## 1. Credential Bootstrap

Admin credentials configured via environment variables at container startup.

```bash
RACKULA_AUTH_MODE=local
RACKULA_AUTH_SESSION_SECRET=<32+ char secret>
RACKULA_LOCAL_USERNAME=admin              # required when AUTH_MODE=local
RACKULA_LOCAL_PASSWORD=<plaintext>        # required, min 12 chars
```

**Startup behaviour:**

1. Parse `RACKULA_LOCAL_USERNAME` and `RACKULA_LOCAL_PASSWORD` from env
2. Validate: username non-empty, password >= 12 characters
3. Hash password with Argon2id -> store hash in memory
4. Discard plaintext password from process memory
5. If either missing or invalid -> **fail startup** with clear error

**Docker secrets support** (stretch goal): `RACKULA_LOCAL_PASSWORD_FILE=/run/secrets/local_password` reads from file instead of env. Same pattern documented (but not yet implemented) for session secret.

**Password change:** Container restart with updated env var. No UI-based change in MVP — see rationale in "Devil's Advocate" section below.

---

## 2. Credential Storage: Tradeoff Analysis

### Approach A: Environment-Only (Recommended for MVP)

| Aspect          | Detail                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| How it works    | Credentials from env -> hashed once at startup -> stored in memory      |
| Persistence     | Env vars persist in Docker/compose config; hash lives in process memory |
| Password change | Requires container restart                                              |
| Security        | Plaintext in env only; visible in `docker inspect` unless using secrets |
| Complexity      | Zero — no files, no permissions, no volumes                             |

**Fits the homelab model:** Homelabbers manage config through `.env` files and compose. This is their existing workflow for `RACKULA_AUTH_SESSION_SECRET`.

### Approach B: File-Based Storage (Deferred)

| Aspect          | Detail                                                                   |
| --------------- | ------------------------------------------------------------------------ |
| How it works    | Hash written to `/app/data/local-auth.json` on persistent volume         |
| Persistence     | Survives container replacement, not just restart                         |
| Password change | Via API endpoint — no restart needed                                     |
| Security        | File permissions must be locked down (600, root-only)                    |
| Complexity      | Volume mount, bootstrap priority (env vs file conflict), backup concerns |

**Why defer:** Adds operational complexity (volume mount, file permissions, env-vs-file priority resolution) for marginal benefit in single-admin context. Password changes are rare events; restart is acceptable.

---

## 3. Password Hashing

**Algorithm:** Argon2id via `argon2` npm package (native C bindings).

**Parameters (OWASP 2023):**

```text
type: argon2id
memoryCost: 65536    (64 MiB)
timeCost: 3          (iterations)
parallelism: 4       (threads)
hashLength: 32       (bytes)
saltLength: 16       (bytes, auto-generated)
```

**Output:** PHC string format: `$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>`

**Verification:** `argon2.verify(hash, password)` — timing-safe by design.

**Bun compatibility note:** The `argon2` package uses native bindings. If Bun's FFI causes issues, fallback options: `@node-rs/argon2` (Rust-based, NAPI) or `hash-wasm` (pure WASM, slower). Verify during implementation.

---

## 4. Login API

### Route Change: `/auth/login`

**Current (OIDC):** `GET /auth/login` -> API returns 302 redirect to IdP
**Local:** `GET /auth/login` -> serve login HTML page; `POST /api/auth/login` -> validate credentials

This is the key architectural difference. For local auth:

- `GET /auth/login` must serve the login form (not proxy to API)
- `POST /api/auth/login` handles credential validation (new endpoint)

### `POST /api/auth/login`

**Request:**

```json
{ "username": "admin", "password": "user-password" }
```

**Validation:** Both required, non-empty strings. Username max 255 chars, password max 1024 chars (DoS prevention).

**Success (200):**

```json
{ "ok": true }
```

Plus `Set-Cookie: rackula_auth_session=<signed-token>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`

**Failure (401):**

```json
{ "error": "Unauthorized", "message": "Invalid username or password." }
```

**Rate limited (429):**

```json
{
  "error": "Too Many Requests",
  "message": "Too many login attempts. Try again later."
}
```

### Credential Verification Flow

```text
1. Rate limit check (per-IP sliding window)
2. Timing-safe username comparison (padded buffers + timingSafeEqual)
3. Argon2id password verification
4. Both must pass -> create session
5. Either fails -> 401 (generic message, no leak of which failed)
6. On failure -> increment rate limit counter
7. On success -> reset rate limit counter, create signed session token
```

### Session Creation

Reuses existing `createSignedAuthSessionToken()` from `security.ts`:

```typescript
claims = { sub: username, role: "admin" };
// sid, iat, exp, idleExp, generation all populated by existing infrastructure
```

Same cookie format, same validation path. Auth gate sees no difference between local and OIDC sessions.

---

## 5. Rate Limiting

**Strategy:** In-memory sliding window per IP address.

| Parameter    | Value                                      | Rationale                                    |
| ------------ | ------------------------------------------ | -------------------------------------------- |
| Window       | 60 seconds                                 | Short enough to not punish legitimate typos  |
| Max attempts | 5 per window                               | Prevents brute force while allowing mistakes |
| Lockout      | 60 seconds                                 | Auto-recovery, no admin intervention         |
| Storage      | In-memory Map                              | Resets on restart (acceptable for homelab)   |
| Cleanup      | Every 5 minutes, prune entries > 2 min old | Prevent memory bloat                         |

**IP extraction:** `x-real-ip` header (set by nginx) — same source as auth logger.

**Why not account lockout:** Single admin + rate limiting is sufficient. Account lockout creates denial-of-service risk (attacker locks out the only admin). Rate limiting bounds the attack surface without blocking legitimate access.

---

## 6. Login Form

### Architecture Decision: Separate HTML Page vs SPA Component

Rackula is a **plain Svelte 5 SPA** (not SvelteKit) — `src/main.ts` mounts `App.svelte` to `#app`. There's no file-based routing.

**Problem:** When nginx redirects to `/auth/login`, it currently proxies to the API (which returns a 302 for OIDC). For local auth, we need to serve an actual HTML page with a login form.

**Recommended approach:** Build the login form as a **separate Vite entry point** (`src/login.ts` + `login.html`) that produces a standalone page. Nginx serves this page for `GET /auth/login` when `AUTH_MODE=local`.

| Option                  | Approach                                                | Verdict                                                      |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| A. Separate entry point | `login.html` + `src/login.ts` -> standalone Svelte page | **Recommended** — clean separation, nginx serves static file |
| B. SPA route            | Conditional rendering in App.svelte based on URL        | Overcomplicated — requires SPA to load before showing login  |
| C. Server-rendered      | API returns HTML from `GET /auth/login`                 | Mixes concerns — API shouldn't serve HTML                    |

### Nginx Changes

```nginx
# When AUTH_MODE=local, serve login page directly instead of proxying to API
location = /auth/login {
    # For OIDC: proxy to API (existing behaviour)
    # For local: try_files to serve static login.html
    # Implementation: conditional on $rackula_auth_mode_local map variable
    try_files /login.html =404;  # when local
    # OR proxy_pass to API       # when oidc
}
```

The exact nginx conditional needs implementation-time design (likely a new `map` variable for `$rackula_auth_mode_local`).

### Login Component

Svelte 5 component with:

- Username + password fields with `autocomplete` attributes (password manager support)
- Error message display (`role="alert"` for accessibility)
- Loading state during submission
- `next` query param handling (redirect after login)
- POST to `/api/auth/login` -> on success, `window.location.href = next || '/'`
- Rackula branding (logo, design tokens from `tokens.css`)

### Accessibility

- Semantic HTML (`<form>`, `<label>`, `<button>`)
- `autocomplete="username"` and `autocomplete="current-password"`
- Focus management on error
- Keyboard navigation (Tab, Enter)

---

## 7. Logout

**No changes needed.** Existing `POST /auth/logout` works identically for local sessions:

1. Invalidate session ID (in-memory map)
2. Return expired cookie
3. Log `auth.logout` event

The logout handler in `app.ts` validates the session cookie, invalidates the SID, and clears the cookie — all auth-mode-agnostic.

---

## 8. Nginx Integration

### What Changes

| Concern                | OIDC (current)                   | Local (new)                       |
| ---------------------- | -------------------------------- | --------------------------------- |
| `GET /auth/login`      | Proxied to API -> 302 to IdP     | Serve static `login.html`         |
| `GET /auth/callback`   | Proxied to API (OIDC callback)   | Not used (return 404 or 501)      |
| `POST /api/auth/login` | Not used                         | Proxied to API (credential check) |
| Auth check probe       | Proxied to API `/api/auth/check` | **Same**                          |
| Login redirect         | `302 /auth/login?next=...`       | **Same**                          |

### What Stays the Same

- `/_rackula_auth_check` internal probe -> API `/api/auth/check` -> 204/401
- `@auth_login_redirect` -> `302 /auth/login?next=$uri$is_args$args`
- `location /` with `auth_request` directive
- Fail-closed when API unavailable
- All static asset serving

---

## 9. Migration Path

### Local -> OIDC

1. Configure OIDC env vars
2. Change `RACKULA_AUTH_MODE=local` -> `oidc`
3. Remove `RACKULA_LOCAL_USERNAME` / `RACKULA_LOCAL_PASSWORD` (optional cleanup)
4. Restart container
5. Active local sessions remain valid until natural expiry (same cookie format)
6. New logins use OIDC flow

### OIDC -> Local

1. Set `RACKULA_LOCAL_USERNAME` and `RACKULA_LOCAL_PASSWORD`
2. Change `RACKULA_AUTH_MODE=oidc` -> `local`
3. **Recommended:** Rotate `RACKULA_AUTH_SESSION_SECRET` to invalidate all existing OIDC sessions — prevents subject mismatches (`user@example.com` vs `admin`) that could break authorisation checks and audit trails
4. Restart container
5. If session secret was not rotated, existing OIDC sessions may continue working (same signature key) but with a mismatched subject claim

### Documentation

Migration steps documented in `docs/deployment/AUTHENTICATION.md` with example env transitions.

---

## 10. Security Considerations

### Credential Logging Prevention

The auth logger (`auth-logger.ts`) already redacts `authorization`, `cookie`, `set-cookie`, `x-forwarded-for`. For local auth, ensure:

- Password field is **never** passed to any logging function
- Request body is not logged (Hono logger middleware logs method/path/status, not body — safe)
- Argon2 hash is not logged at any verbosity level

### Timing Attack Prevention

- **Username:** Compare via `timingSafeEqual` on padded equal-length buffers (constant-time regardless of input length)
- **Password:** Argon2 verification is timing-safe by design
- **Combined response:** Generic "Invalid username or password" regardless of which failed

### CSRF Protection

Login endpoint (`POST /api/auth/login`) must be **exempt from CSRF middleware** — the user doesn't have a session cookie yet (chicken-and-egg). The existing CSRF middleware in `security.ts` already exempts `/auth/login` from CSRF checks.

### HTTPS Enforcement

Existing: `RACKULA_AUTH_SESSION_COOKIE_SECURE=true` enforces HTTPS in production. Add startup warning if `AUTH_MODE=local` + `COOKIE_SECURE=false` + `NODE_ENV=production`.

---

## 11. Devil's Advocate Review

| Challenge                                                        | Assessment                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Argon2id is overkill for one account"                           | No. If the container env leaks (misconfigured volume mount, backup exposure), Argon2id makes offline cracking infeasible. The cost is ~200ms on startup — invisible.                                                                       |
| "12-char minimum is annoying"                                    | Valid friction, but this is the only defence for a single-account system. Lower minimum = brute-forceable even with rate limiting. Document clearly.                                                                                       |
| "Password in env = visible in docker inspect"                    | Real risk. Docker secrets (`_FILE` suffix) mitigate this. Document as recommended practice. MVP: env vars work; secrets are stretch goal.                                                                                                  |
| "No password change UI?"                                         | Correct for MVP. Single admin changes password by updating env and restarting. Frequency: rarely. Adding password change requires file-based storage (deferred complexity).                                                                |
| "What if they forget the password?"                              | Restart container with new `RACKULA_LOCAL_PASSWORD`. Same recovery path as forgetting `RACKULA_AUTH_SESSION_SECRET`. Document in troubleshooting.                                                                                          |
| "Rate limiting resets on restart"                                | Acceptable. Attacker who can restart containers already has host access. The 5-per-60s window stops remote brute force during normal operation.                                                                                            |
| "In-memory rate limit doesn't work for HA"                       | Correct, but Rackula single-instance is the target for local auth. HA deployments should use OIDC (external IdP handles brute force protection).                                                                                           |
| "Separate Vite entry point for login page adds build complexity" | True, but cleaner than alternatives. SPA conditional rendering means loading the entire app before showing login (wasteful, flash of content). Server-rendered HTML from API mixes concerns. A separate entry point is ~50 lines of setup. |
| "What about session fixation?"                                   | Non-issue. Session is created fresh after successful login. No pre-authentication session exists to fixate.                                                                                                                                |
| "What about credential stuffing?"                                | Rate limiting + single known username = limited attack surface. Attacker must know the username AND brute force the password within rate limits.                                                                                           |

---

## 12. Environment Variable Summary

### New Variables

| Variable                      | When Required     | Default | Validation         |
| ----------------------------- | ----------------- | ------- | ------------------ |
| `RACKULA_LOCAL_USERNAME`      | `AUTH_MODE=local` | —       | Non-empty string   |
| `RACKULA_LOCAL_PASSWORD`      | `AUTH_MODE=local` | —       | Min 12 characters  |
| `RACKULA_LOCAL_PASSWORD_FILE` | Never (stretch)   | —       | Readable file path |

### Existing Variables (No Changes)

- `RACKULA_AUTH_MODE` — Already supports `local` in type definition (`security.ts:11`)
- `RACKULA_AUTH_SESSION_SECRET` — Required for all auth modes
- All session config vars — Reused as-is

---

## 13. Files to Modify

| File                                  | Change                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `api/src/app.ts`                      | Add local auth login handler, conditional route registration                   |
| `api/src/security.ts`                 | Add local credential config parsing/validation to `resolveApiSecurityConfig()` |
| `api/src/auth-logger.ts`              | Verify body fields aren't logged (likely no change needed)                     |
| `api/package.json`                    | Add `argon2` dependency                                                        |
| `deploy/nginx.conf.template`          | Conditional `/auth/login` serving (static page vs API proxy)                   |
| `src/login.ts`                        | **New** — Login page entry point                                               |
| `login.html`                          | **New** — Login page HTML shell                                                |
| `src/lib/components/LoginForm.svelte` | **New** — Login form component                                                 |
| `vite.config.ts`                      | Add `login.html` as additional entry point                                     |
| `.env.example`                        | Add `RACKULA_LOCAL_*` variables                                                |
| `deploy/docker-compose.persist.yml`   | Add local auth env vars                                                        |
| `docs/deployment/AUTHENTICATION.md`   | Add local auth setup guide, migration steps between modes                      |

---

## 14. Testing Strategy

### Unit Tests

- Credential bootstrap fail-fast: missing `RACKULA_LOCAL_USERNAME` throws, missing `RACKULA_LOCAL_PASSWORD` throws, password < 12 chars throws, valid credentials succeed
- Argon2id hash/verify round-trip
- Rate limiter: 5 failures trigger lockout, lockout expires, success resets counter, separate IPs tracked independently
- Login endpoint: valid creds -> 200 + cookie, invalid -> 401, missing fields -> 400, rate limited -> 429
- Timing-safe username comparison

### Integration Tests

- Local session cookie passes auth gate
- Logout invalidates local session
- Auth gate blocks anonymous access when `AUTH_MODE=local`
- Credential secrets never appear in logs (grep test output)

### E2E Tests (Playwright)

- Visit `/` without session -> redirected to `/auth/login`
- Submit valid creds -> redirected to `/`
- Submit invalid creds -> error message shown
- Logout -> redirected to login
- `next` param preserved through login flow

---

## 15. Verification

After implementation:

1. `npm run lint` — passes
2. `npm run test:run` — all unit/integration tests pass
3. `npm run build` — production build succeeds (including login entry point)
4. Docker compose with `AUTH_MODE=local` — login form serves, credentials validate
5. Session cookie works identically to OIDC mode
6. Rate limiting triggers after 5 failed attempts
7. `docker inspect` + grep confirms password hash not in container metadata
