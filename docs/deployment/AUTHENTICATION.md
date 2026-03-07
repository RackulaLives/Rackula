# Rackula Authentication Setup and Hardening Guide

## Overview

Rackula uses **Better Auth** with stateless cookie-based sessions to provide persistent authentication without requiring database configuration. The authentication system supports:

- **Generic OIDC support** - Works with any OIDC-compliant identity provider
- **Stateless sessions** - Cookie-only sessions that survive container restarts without server-side storage
- **Optional auth mode** - `RACKULA_AUTH_MODE=none` allows anonymous access; non-`none` modes block anonymous access on protected routes
- **Security hardening** - Production-ready defaults with HttpOnly cookies, SameSite protection, and HTTPS enforcement

### Architecture

```
┌─────────────────────────────────────────────────┐
│                    Browser                      │
│  ┌─────────────────────────────────────────┐   │
│  │  Session Cookie (signed, encrypted)     │   │
│  │  - 12-hour TTL                           │   │
│  │  - Auto-refresh when 6 hours remain      │   │
│  │  - HttpOnly, Secure, SameSite=Lax        │   │
│  └─────────────────────────────────────────┘   │
└────────────┬────────────────────────────────────┘
             │
             │ HTTPS
             │
┌────────────▼────────────────────────────────────┐
│              Rackula API (Hono + Bun)           │
│  ┌─────────────────────────────────────────┐   │
│  │    Better Auth (OIDC mode only)          │   │
│  │  - /auth/login → redirects to IdP        │   │
│  │  - /auth/callback → handles OIDC return  │   │
│  │  - /auth/logout → clears session         │   │
│  │  - /api/auth/* compatibility routes      │   │
│  │  - Session validation middleware         │   │
│  │  (local mode bypasses Better Auth —      │   │
│  │   direct credential validation instead)  │   │
│  └─────────────────────────────────────────┘   │
└────────────┬────────────────────────────────────┘
             │
             │ OIDC Protocol
             │
┌────────────▼────────────────────────────────────┐
│         Identity Provider (IdP)                 │
│  - Authentik, Authelia, Keycloak, etc.         │
│  - Handles user authentication                  │
│  - Returns tokens to Rackula callback           │
└─────────────────────────────────────────────────┘
```

**Session Management:**

- Cookie-based sessions with 12-hour maximum lifetime
- Automatic refresh when 6 hours remain until expiration
- Sessions survive container restarts (stored in browser, not server memory)
- No database required for session storage

**Access Control:**

- `RACKULA_AUTH_MODE=none`: all routes follow existing unauthenticated behaviour
- `RACKULA_AUTH_MODE=oidc|local`: anonymous access to protected routes is denied — auth is all-or-nothing with no per-route exceptions

When auth is enabled (`oidc` or `local`), the following routes remain publicly accessible:

| Route | Purpose |
|-------|---------|
| `/auth/login`, `/auth/callback`, `/auth/check`, `/auth/logout` | Browser-facing auth flow |
| `/api/auth/login`, `/api/auth/callback`, `/api/auth/check`, `/api/auth/logout` | API compatibility auth routes |
| `/health`, `/api/health` | Container and API health checks |

All other routes require a valid session. Unauthenticated requests are handled differently depending on the route type:

- **API routes** (`/api/*`): return `401 Unauthorized` with a JSON error body
- **SPA routes** (`/` and all other paths): redirect to `/auth/login?next=<path>` so the user returns to their original page after login

**CORS requirement:** When auth is enabled, `CORS_ORIGIN` must be set to your Rackula domain (e.g., `https://your-rackula.example.com`) for CSRF protection to function correctly.

### Reverse Proxy Auth Contract (Nginx)

If you deploy Rackula behind Nginx auth_request, keep this contract consistent:

- Browser-facing auth routes:
  - `GET /auth/login`
  - `GET /auth/callback`
  - `GET /auth/check`
  - `POST /auth/logout`
- API compatibility routes (also available, same methods):
  - `GET /api/auth/login`
  - `GET /api/auth/callback`
  - `GET /api/auth/check`
  - `POST /api/auth/logout`
- Internal auth probe contract:
  - `204` = authenticated
  - `401` = unauthenticated

When protecting app routes with `auth_request`, redirect unauthorized requests to:

- `/auth/login?next=<path>` (path and query string are preserved; caveat: if the original URL contains multiple `&`-delimited query params, only the first segment stays in `next=` because standard nginx cannot URI-encode the value)

## Prerequisites

Before configuring authentication, ensure you have:

1. **OIDC-compliant identity provider** - Authentik, Authelia, Keycloak, or any OIDC-compliant IdP
2. **HTTPS-enabled Rackula deployment** - Required for secure cookies (SameSite and Secure flags)
3. **Access to IdP admin console** - To create OAuth/OIDC application
4. **Session secret** - Generate a secure random string (minimum 32 characters)

## OIDC Configuration

### Step 1: Configure Your Identity Provider

Choose your identity provider and follow the corresponding setup instructions:

#### Authentik

1. **Create OAuth2/OIDC Provider:**
   - Navigate to **Applications** → **Providers** → **Create**
   - Select **OAuth2/OpenID Connect Provider**
   - Set **Name**: `Rackula`
   - Set **Authorization flow**: `default-authentication-flow` (or your custom flow)
   - Set **Client type**: `Confidential`
   - Set **Client ID**: Generate or use a readable identifier like `rackula-web`
   - Set **Client Secret**: Auto-generated (copy this value)

2. **Configure Redirect URIs:**
   - Add redirect URI: `https://your-rackula-domain.com/auth/callback`
   - **Important:** No trailing slash, must use HTTPS

3. **Configure Scopes:**
   - Default scopes: `openid`, `profile`, `email`
   - These are typically enabled by default in Authentik

4. **Create Application:**
   - Navigate to **Applications** → **Create**
   - Set **Name**: `Rackula`
   - Set **Slug**: `rackula`
   - Set **Provider**: Select the provider created above

5. **Copy Configuration Values:**
   - **Issuer URL**: `https://your-authentik-domain.com/application/o/rackula/`
   - **Client ID**: From provider settings
   - **Client Secret**: From provider settings (copy now, cannot retrieve later)

#### Authelia

1. **Edit Authelia Configuration:**
   - Open `configuration.yml` on your Authelia server
   - Navigate to `identity_providers.oidc.clients` section

2. **Add Rackula Client:**

   ```yaml
   identity_providers:
     oidc:
       clients:
         - id: rackula-web
           description: Rackula Rack Layout Designer
           secret: "$argon2id$v=19$m=65536,t=3,p=4$..." # Generate with: authelia crypto hash generate argon2
           public: false
           authorization_policy: two_factor # Or one_factor, based on your security requirements
           redirect_uris:
             - https://your-rackula-domain.com/auth/callback
           scopes:
             - openid
             - profile
             - email
           grant_types:
             - authorization_code
           response_types:
             - code
   ```

3. **Generate Client Secret:**

   ```bash
   # On Authelia server
   authelia crypto hash generate argon2 --password 'your-client-secret-here'
   ```

   - Use the hashed value in `configuration.yml`
   - Keep the plaintext secret for Rackula configuration

4. **Restart Authelia:**

   ```bash
   docker restart authelia
   # or
   systemctl restart authelia
   ```

5. **Copy Configuration Values:**
   - **Issuer URL**: `https://your-authelia-domain.com`
   - **Client ID**: `rackula-web` (from configuration)
   - **Client Secret**: Plaintext value used before hashing

#### Keycloak

1. **Create Realm (Optional):**
   - Navigate to **Master** dropdown → **Create Realm**
   - Set **Realm name**: `homelab` (or use existing realm)

2. **Create Client:**
   - Navigate to **Clients** → **Create client**
   - Set **Client type**: `OpenID Connect`
   - Set **Client ID**: `rackula-web`
   - Click **Next**

3. **Configure Client Authentication:**
   - Enable **Client authentication**
   - Select **Standard flow** (authorization code flow)
   - Click **Next**

4. **Configure Valid Redirect URIs:**
   - Add **Valid redirect URIs**: `https://your-rackula-domain.com/auth/callback`
   - Add **Valid post logout redirect URIs**: `https://your-rackula-domain.com/`
   - Set **Web origins**: `https://your-rackula-domain.com`
   - Click **Save**

5. **Copy Client Secret:**
   - Navigate to **Credentials** tab
   - Copy **Client secret** value

6. **Copy Configuration Values:**
   - **Issuer URL**: `https://your-keycloak-domain.com/realms/{realm-name}`
   - **Client ID**: `rackula-web`
   - **Client Secret**: From Credentials tab

### Step 2: Generate Session Secret

Generate a secure random session secret (minimum 32 characters):

```bash
# Using openssl
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Using Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Important:** Store this secret securely. Never commit it to version control.

### Step 3: Configure Rackula Environment Variables

Create or edit `api/.env` file with the following configuration:

```bash
# ========================================
# Authentication (Better Auth + OIDC)
# ========================================

# Auth Mode (REQUIRED — set to 'oidc' for OIDC authentication)
RACKULA_AUTH_MODE=oidc

# Session Secret (REQUIRED)
# Generate with: openssl rand -base64 32
RACKULA_AUTH_SESSION_SECRET=your-generated-secret-here-minimum-32-chars

# OIDC Provider Configuration
# See docs/deployment/AUTHENTICATION.md for IdP-specific setup
RACKULA_OIDC_ISSUER=https://your-idp.example.com/application/o/rackula/
RACKULA_OIDC_CLIENT_ID=rackula-web
RACKULA_OIDC_CLIENT_SECRET=your-oidc-client-secret
RACKULA_OIDC_REDIRECT_URI=https://your-rackula.example.com/auth/callback

# Session Configuration (optional, defaults shown)
# Absolute maximum session lifetime (seconds) — session expires regardless of activity
RACKULA_AUTH_SESSION_MAX_AGE_SECONDS=43200
# Inactivity timeout (seconds) — session expires after this many idle seconds
RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS=1800

# Cookie Security Settings (production defaults)
# Set to false only for local development over HTTP
RACKULA_AUTH_SESSION_COOKIE_SECURE=true
# CSRF protection: lax (recommended), strict, or none
RACKULA_AUTH_SESSION_COOKIE_SAMESITE=lax
```

**Example configurations for common IdPs:**

```bash
# Authentik
RACKULA_OIDC_ISSUER=https://authentik.example.com/application/o/rackula/

# Authelia
RACKULA_OIDC_ISSUER=https://authelia.example.com

# Keycloak
RACKULA_OIDC_ISSUER=https://keycloak.example.com/realms/homelab

# Microsoft Entra ID (single tenant)
RACKULA_OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0

# Microsoft Entra ID (multi-tenant)
RACKULA_OIDC_ISSUER=https://login.microsoftonline.com/common/v2.0
```

### Step 4: Restart Rackula API

After configuring environment variables, restart the API container:

```bash
# Docker Compose
docker compose restart api

# Docker
docker restart rackula-api

# Systemd
systemctl restart rackula-api
```

### Step 5: Verify Configuration

Follow this testing checklist to verify authentication is working correctly:

1. **Visit Rackula homepage (unauthenticated):**
   - URL: `https://your-rackula-domain.com/`
   - Expected: Redirect to `/auth/login` (when `RACKULA_AUTH_MODE` is `oidc` or `local`, unauthenticated requests are redirected to the login page)

2. **Access login endpoint:**
   - URL: `https://your-rackula-domain.com/auth/login`
   - Expected: Redirect to your IdP's login page

3. **Complete IdP login:**
   - Enter credentials on IdP login page
   - Expected: Redirect back to `https://your-rackula-domain.com/auth/callback`

4. **Verify session cookie:**
   - Open browser DevTools → Application → Cookies
   - Look for cookie named `rackula_auth_session`
   - Verify flags: `HttpOnly`, `Secure`, `SameSite=Lax`

5. **Access protected routes:**
   - Try saving a layout (requires authentication)
   - Expected: Success (no "unauthorized" error)

6. **Test session persistence:**
   - Restart API container: `docker compose restart api`
   - Refresh browser (do not clear cookies)
   - Expected: Still authenticated (no re-login required)

**Troubleshooting failed verification:** See the Troubleshooting section below.

## Local Authentication

Local authentication provides a simple username/password login for single-admin homelab deployments that don't require an external identity provider.

### When to Use

- Single-user or single-admin homelabs
- Deployments without an OIDC-compatible identity provider (Authentik, Authelia, Keycloak, etc.)
- Quick setup where external IdP infrastructure is not justified

For multi-user deployments or environments where centralized identity management is preferred, use OIDC mode instead.

### Configuration

Set the following environment variables:

```bash
# Required
RACKULA_AUTH_MODE=local
RACKULA_LOCAL_USERNAME=admin
RACKULA_LOCAL_PASSWORD=your-secure-password-here   # minimum 12 characters
RACKULA_AUTH_SESSION_SECRET=your-random-secret-here # minimum 32 characters
CORS_ORIGIN=https://your-rackula-domain.com        # CSRF protection requires this
```

> **Password quoting:** If your password contains shell metacharacters (`$`, `!`, `\`, etc.), use single quotes when setting via shell export: `export RACKULA_LOCAL_PASSWORD='my$ecure!pass'`. In Docker `.env` files and `docker-compose.yml`, quoting is generally not needed unless the value contains `#` (comment character).

> **HTTP deployments:** If accessing Rackula over plain HTTP (no TLS), you must set `RACKULA_AUTH_SESSION_COOKIE_SECURE=false`. Without this, login will appear to succeed but the browser silently rejects the `Secure`-flagged session cookie, and every subsequent request fails authentication. This is the most common deployment pitfall for homelab setups without a reverse proxy terminating TLS.

All session-related variables from the OIDC section also apply:

- `RACKULA_AUTH_SESSION_MAX_AGE_SECONDS` — absolute session lifetime (default: 43200 / 12 hours)
- `RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS` — inactivity timeout (default: 1800 / 30 minutes)
- `RACKULA_AUTH_SESSION_COOKIE_SECURE` — require HTTPS for cookies (default: true)
- `RACKULA_AUTH_SESSION_COOKIE_SAMESITE` — SameSite cookie policy (default: Lax)

### How It Works

1. **Startup:** The API hashes the configured password with Argon2id (OWASP-recommended parameters) and holds the hash in memory. The plaintext password is never stored.
2. **Login:** Users POST credentials to `/auth/login` (or `/api/auth/login`). The API performs timing-safe username comparison and Argon2id password verification.
3. **Session:** On successful login, the API issues the same HMAC-signed session cookie used by OIDC mode. Sessions are stateless and survive container restarts.
4. **Rate limiting:** A sliding-window rate limiter (5 attempts per 60 seconds per IP) protects against brute-force attacks.
5. **Logout:** POST to `/auth/logout` invalidates the session and expires the cookie.

### Login Page

When `RACKULA_AUTH_MODE=local`, nginx serves a static login page at `/auth/login`. The login form submits credentials to the API endpoint, which validates them and sets the session cookie.

### Password Reset

To change the password:

1. Update `RACKULA_LOCAL_PASSWORD` in your environment configuration
2. Restart the API service (`docker compose restart api`)
3. The new password hash is computed at startup

> **Important:** Changing the password does **not** invalidate existing sessions. Anyone with a valid session cookie can continue accessing Rackula until the session expires naturally. To force all sessions to expire immediately, rotate `RACKULA_AUTH_SESSION_SECRET` at the same time as the password change.

### Migrating Between Auth Modes

Changing `RACKULA_AUTH_MODE` between `local`, `oidc`, and `none` does not require data migration. However:

- Existing sessions from the previous mode remain valid until they expire
- To immediately invalidate all sessions, rotate `RACKULA_AUTH_SESSION_SECRET`
- OIDC-specific variables (`RACKULA_OIDC_*`) are ignored in local mode and vice versa

## Security Hardening

### Session Security Best Practices

**1. Keep session TTL short:**

- Default: 12 hours (`RACKULA_AUTH_SESSION_MAX_AGE_SECONDS=43200`)
- Recommended for high-security environments: 1-4 hours
- Trade-off: Shorter TTL = more frequent re-authentication

**2. Always use HTTPS in production:**

- Enforces `Secure` cookie flag (cookies sent only over HTTPS)
- Required for SameSite=Lax protection to work correctly
- Self-signed certificates acceptable for homelab (trust in browser)

**3. SameSite cookie protection:**

- Default: `SameSite=Lax` (prevents CSRF attacks)
- Alternative: `SameSite=Strict` (more secure, may break legitimate redirects)
- Never use: `SameSite=None` (disables CSRF protection)

**4. Session secret rotation (future enhancement):**

- Current limitation: No built-in secret rotation in Better Auth stateless mode
- Workaround: Change `RACKULA_AUTH_SESSION_SECRET` and accept that all users are logged out
- Recommended frequency: Every 90 days or after suspected compromise

### OIDC Security Best Practices

**1. Always use HTTPS for OIDC issuer:**

- Better Auth validates TLS certificates
- Self-signed certificates will cause connection failures
- Use valid certificates (Let's Encrypt for homelab)

**2. Store client secret securely:**

- Never commit `.env` files with real credentials to version control
- Use Docker secrets for production deployments (see below)
- Rotate client secret if compromised

**3. Validate redirect URI:**

- Better Auth validates redirect URI against configured value
- Ensure `RACKULA_OIDC_REDIRECT_URI` matches IdP configuration exactly
- No trailing slashes, protocol must match (https vs http)

**4. Use minimal scopes:**

- Required: `openid`, `profile`, `email`
- Avoid requesting unnecessary scopes (reduces attack surface)

**5. Limit IdP application access:**

- Configure IdP to restrict which users can access Rackula application
- Use groups, policies, or authorization flows in your IdP
- Example (Authelia): Set `authorization_policy: two_factor` to require 2FA

### Production Deployment Hardening

**1. Use Docker secrets instead of environment variables:**

Example `docker-compose.yml`:

```yaml
services:
  api:
    image: ghcr.io/rackulalives/rackula-api:latest
    secrets:
      - auth_session_secret
      - oidc_client_secret
    environment:
      RACKULA_AUTH_SESSION_SECRET_FILE: /run/secrets/auth_session_secret
      RACKULA_OIDC_CLIENT_SECRET_FILE: /run/secrets/oidc_client_secret
      # Non-secret values can remain in environment
      RACKULA_OIDC_ISSUER: https://authentik.example.com/application/o/rackula/
      RACKULA_OIDC_CLIENT_ID: rackula-web
      RACKULA_OIDC_REDIRECT_URI: https://rackula.example.com/auth/callback

secrets:
  auth_session_secret:
    file: ./secrets/auth_session_secret.txt
  oidc_client_secret:
    file: ./secrets/oidc_client_secret.txt
```

Create secret files:

```bash
mkdir -p secrets
chmod 700 secrets

# Generate session secret
openssl rand -base64 32 > secrets/auth_session_secret.txt

# Store OIDC client secret (from IdP)
echo "your-oidc-client-secret" > secrets/oidc_client_secret.txt

# Restrict permissions
chmod 400 secrets/*.txt
```

**2. `_FILE` suffixed env vars (future enhancement):**

The `_FILE` env var pattern (e.g., `RACKULA_AUTH_SESSION_SECRET_FILE`) shown in the Docker Compose snippet above is a planned feature. Docker Compose secrets are mounted as files under `/run/secrets/<secret_name>` — they are **not** automatically exported as environment variables. Until `_FILE` support is implemented, you can use an entrypoint script to read secret files into env vars:

```bash
# Example entrypoint wrapper
export RACKULA_AUTH_SESSION_SECRET=$(cat /run/secrets/auth_session_secret)
export RACKULA_OIDC_CLIENT_SECRET=$(cat /run/secrets/oidc_client_secret)
exec "$@"
```

**3. Never commit secrets to version control:**

Add to `.gitignore`:

```
# Secrets
.env
.env.local
secrets/
*.secret
```

**4. Use environment-specific configuration:**

Maintain separate configurations for development and production:

```
.env.development     # Local development (HTTP allowed)
.env.production      # Production (HTTPS required, shorter TTL)
```

**5. Monitor authentication logs:**

Rackula includes structured authentication event logging via `auth-logger.ts`:

- **Events logged:** `auth.login.success`, `auth.login.failure`, `auth.logout`, `auth.session.invalid`, `auth.denied`
- **Format:** Structured JSON events to stdout (compatible with log aggregators)
- **Privacy:** User identifiers are pseudonymized via HMAC (configurable with `RACKULA_AUTH_LOG_HASH_KEY`)
- **Security:** Sensitive headers (e.g., `Authorization`, `Cookie`) are automatically redacted

## Reverse Proxy Defense-in-Depth

Rackula's production deployment uses nginx as a reverse proxy with `auth_request` to enforce authentication at the edge — before requests reach the API. This section documents the architecture for operators who need to understand or customise the proxy layer.

### Auth Request Contract

Nginx uses an internal subrequest to validate sessions:

1. For every protected route, nginx sends an internal request to `/_rackula_auth_check`
2. The API validates the session cookie and responds:
   - `204` — session valid, request proceeds
   - `401` — session invalid or missing, nginx redirects to login
3. When `RACKULA_AUTH_MODE=none`, the auth check short-circuits to `204` without contacting the API

The `/_rackula_auth_check` location is marked `internal` — it cannot be accessed directly by clients.

### Fail-Closed Behaviour

When the API is unavailable and auth is enabled (`oidc` or `local`), nginx returns `401` rather than `502`. This is a deliberate fail-closed design: if the auth service cannot verify a session, access is denied.

When `RACKULA_AUTH_MODE=none`, the proxy fails open (returns `204`) since there is nothing to verify.

Upstream auth failures are logged with the `rackula_auth_upstream_failure` log format for monitoring.

### Write-Token Separation

Nginx conditionally injects an `Authorization: Bearer` header for write operations (PUT/DELETE) when `API_WRITE_TOKEN` is configured. Read-only requests (GET, POST) pass through the original `Authorization` header unchanged. This separates read and write access at the proxy layer, providing an additional authorization boundary beyond session cookies.

### Security Headers

All responses include security headers from a single shared configuration (`deploy/security-headers.conf`):

- **HSTS** — `Strict-Transport-Security` with 1-year max-age (requires TLS termination upstream)
- **CSP** — Content Security Policy restricting script/style/image sources
- **X-Frame-Options** — `SAMEORIGIN` to prevent clickjacking
- **X-Content-Type-Options** — `nosniff` to prevent MIME-type sniffing
- **Referrer-Policy** — `strict-origin-when-cross-origin`
- **Permissions-Policy** — disables geolocation, microphone, and camera APIs

These headers are included at the server level and re-included in any location block that defines its own `add_header` (nginx drops inherited headers in that case).

## Deployment Scenarios

Different deployment contexts call for different auth configurations. Use this table to choose the right mode:

| Scenario | Recommended Mode | Notes |
|----------|-----------------|-------|
| Solo homelab | `local` or `none` | Simplest setup; `none` if behind VPN/firewall already |
| Homelab team (2–5 users) | `oidc` with Authentik or Authelia | Individual accounts, shared access, audit trail |
| School lab / classroom | `oidc` with school IdP | AD/LDAP-backed OIDC for per-student access |
| Enterprise / multi-team | `oidc` with organisation IdP | Enforce MFA via IdP policies, centralised user management |

### When Local Mode Is Insufficient

Local auth provides a single shared credential. Consider switching to OIDC when:

- **Multiple users** need individual accounts (local mode has one username/password)
- **Audit requirements** demand per-user attribution (auth logs show the same pseudonymised ID for all local users)
- **MFA is required** (local mode has no MFA support; OIDC delegates MFA to the IdP)

### Active Directory Integration

Organisations using Active Directory can integrate via OIDC without exposing LDAP directly:

- **Keycloak**: Configure an LDAP User Federation provider pointing at your AD domain controller, then create an OIDC client for Rackula
- **Microsoft Entra ID**: Use `RACKULA_OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0` — Entra natively federates with on-premises AD via Entra Connect
- **Authentik**: Add an LDAP Source under Directory → Federation to sync AD users, then configure the OIDC provider as described in the setup guide above

### Audit Logging

All auth modes emit structured log events via `auth-logger.ts`:

- `auth.login.success` / `auth.login.failure` — login attempts with pseudonymised user IDs
- `auth.logout` — explicit session termination
- `auth.session.invalid` — expired or tampered session detected
- `auth.denied` — access denied to protected route

Events are written to stdout as structured JSON, compatible with log aggregators (Loki, ELK, Datadog). User identifiers are HMAC-pseudonymised by default; configure `RACKULA_AUTH_LOG_HASH_KEY` to control the hash key.

## Troubleshooting

### "Session secret is required" error on API startup

**Symptoms:**

- API fails to start
- Error message: "Session secret is required for stateless mode"

**Cause:**

- `RACKULA_AUTH_SESSION_SECRET` environment variable not set or empty

**Resolution:**

1. Generate session secret: `openssl rand -base64 32`
2. Add to `api/.env`: `RACKULA_AUTH_SESSION_SECRET=your-generated-secret`
3. Restart API

### OIDC callback fails with "Invalid redirect URI"

**Symptoms:**

- After IdP login, redirect fails with error
- Error message in IdP logs: "Redirect URI mismatch"

**Cause:**

- Mismatch between `RACKULA_OIDC_REDIRECT_URI` and IdP configuration

**Resolution:**

1. Verify `RACKULA_OIDC_REDIRECT_URI` matches IdP redirect URI exactly
2. Check for trailing slashes (should NOT be present): ❌ `/auth/callback/` ✅ `/auth/callback`
3. Verify protocol matches (both HTTPS or both HTTP)
4. Update IdP configuration if needed
5. Restart API after changes

### Sessions expire immediately after login

**Symptoms:**

- User logged in successfully
- Immediately logged out on next page load
- Session cookie missing or expires instantly

**Cause:**

- Incorrect cookie configuration for environment
- HTTPS mismatch (Secure flag set but site accessed over HTTP)

**Resolution:**

1. Check browser DevTools → Application → Cookies
2. Verify cookie flags match deployment:
   - **Development (HTTP):** `RACKULA_AUTH_SESSION_COOKIE_SECURE=false`
   - **Production (HTTPS):** `RACKULA_AUTH_SESSION_COOKIE_SECURE=true`
3. Verify session TTL: `RACKULA_AUTH_SESSION_MAX_AGE_SECONDS=43200` (12 hours)
4. Check browser accepts cookies (not in private/incognito mode)
5. Restart API after configuration changes

### "Unauthorized" when accessing protected routes after login

**Symptoms:**

- Login succeeds, session cookie present
- API returns 401 Unauthorized on protected routes (e.g., saving layouts)

**Cause:**

- Session cookie exists but is invalid or expired
- Auth middleware not recognizing session

**Resolution:**

1. Verify session cookie is present:
   - Open DevTools → Application → Cookies
   - Look for cookie named `rackula_auth_session`
2. Check session has not expired:
   - Cookie should have Max-Age or Expires in future
   - Default TTL: 12 hours from login
3. Clear browser cookies and re-login:
   - DevTools → Application → Cookies → Delete all
   - Navigate to `/auth/login` to re-authenticate
4. Check API logs for session validation errors

### OIDC login redirects to IdP but shows "Application not found"

**Symptoms:**

- `/auth/login` redirects to IdP
- IdP shows "Application not found" or similar error

**Cause:**

- OIDC issuer URL incorrect or IdP application not configured

**Resolution:**

1. Verify `RACKULA_OIDC_ISSUER` is correct:
   - Authentik: `https://authentik.example.com/application/o/rackula/`
   - Authelia: `https://authelia.example.com`
   - Keycloak: `https://keycloak.example.com/realms/{realm-name}`
   - Entra (single tenant): `https://login.microsoftonline.com/<tenant-id>/v2.0`
   - Entra (multi-tenant): `https://login.microsoftonline.com/common/v2.0`
2. For Entra `common`, ensure discovery issuer and token issuer use the tenant-specific `.../<tenant-id>/v2.0` value after login (Rackula accepts this when `RACKULA_OIDC_ISSUER` is `common`).
3. Check IdP application exists and is enabled
4. Verify client ID matches: `RACKULA_OIDC_CLIENT_ID` = IdP client ID
5. Check IdP logs for more specific error details

### Session cookie not set in browser

**Symptoms:**

- Login appears to succeed
- No session cookie visible in DevTools → Cookies
- Subsequent requests fail authorization

**Cause:**

- Cookie domain mismatch
- Browser blocking third-party cookies
- Incorrect SameSite setting

**Resolution:**

1. Check cookie domain in DevTools:
   - Should match Rackula domain exactly
   - If using subdomains, uncomment `domain` in `api/src/auth/config.ts`
2. Verify SameSite setting:
   - Default: `SameSite=Lax` (recommended)
   - If using iframe embedding, may need `SameSite=None` + `Secure=true`
3. Check browser cookie settings:
   - Ensure third-party cookies not blocked globally
   - Disable browser extensions that block cookies (Privacy Badger, etc.)
4. Test in different browser to isolate browser-specific issues

## Limitations (v0.9.0)

The current authentication implementation has the following known limitations:

### 1. Single-Process Session Revocation Only

**Current state:**
In-memory session ID invalidation exists via `invalidateAuthSession()` in `security.ts`. Individual sessions can be revoked within a single API process.

**Limitation:**
Session revocation state is held in-process memory and is not shared across replicas. In a multi-replica deployment, a session revoked on one replica remains valid on others until it expires naturally.

**Impact:**

- Single-replica deployments (typical homelab): session revocation works as expected
- Multi-replica deployments: revoked sessions may still be accepted by other replicas
- Tracked in [#1269](https://github.com/RackulaLives/Rackula/issues/1269)

**Workarounds:**

- Keep session TTL short (default 12 hours, reduce if needed)
- Rotate `RACKULA_AUTH_SESSION_SECRET` to invalidate all sessions across all replicas
- Revoke access at IdP level (user cannot create new sessions)

### 2. No Multi-Factor Authentication (MFA) in Rackula

**Limitation:**
MFA is delegated entirely to the identity provider. Rackula does not enforce or verify MFA.

**Impact:**

- MFA depends on IdP configuration
- Rackula cannot require MFA for specific actions
- Cannot prompt for step-up authentication

**Workarounds:**

- Configure MFA enforcement in IdP (Authentik flows, Authelia policies, Keycloak authentication flows)
- Use IdP's conditional access policies to require MFA

**When to address:**
No plans to implement in Rackula; IdP-based MFA is sufficient for target use case.

### 3. No User Management UI in Rackula

**Limitation:**
All user management (create users, reset passwords, manage permissions) must be done in IdP admin console.

**Impact:**

- Cannot manage users from within Rackula
- Administrators must access separate IdP interface

**Workarounds:**

- Use IdP's admin console or API for user management
- Document IdP access for administrators

**When to address:**
No plans to implement; IdP-based user management is appropriate for homelab deployments.

## Future Enhancements

These features are not implemented in v0.9.0 but may be added in future versions:

- **Database-backed sessions** - Enable instant server-side session revocation
- **Session secret rotation** - Automated rotation without invalidating all sessions
- **Session management UI** - View active sessions, revoke specific sessions

For instant session revocation requirements, consider upgrading to database-backed sessions. Migration documentation will be provided in a future release.

## References

- **Better Auth Documentation:** <https://www.better-auth.com/>
- **OIDC Specification:** <https://openid.net/connect/>
- **Docker Secrets:** <https://docs.docker.com/compose/use-secrets/>
- **Authentik Documentation:** <https://docs.goauthentik.io/>
- **Authelia Documentation:** <https://www.authelia.com/docs/>
- **Keycloak Documentation:** <https://www.keycloak.org/documentation>

## Support

For issues or questions:

1. Check this troubleshooting guide first
2. Review IdP logs for authentication errors
3. Check Rackula GitHub issues: <https://github.com/RackulaLives/Rackula/issues>
4. Create new issue with:
   - IdP type and version
   - Sanitized configuration (remove secrets)
   - Error messages from both Rackula and IdP logs
   - Steps to reproduce
