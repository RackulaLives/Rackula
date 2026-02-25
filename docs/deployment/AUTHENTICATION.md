# Rackula Authentication Setup and Hardening Guide

## Overview

Rackula uses **Better Auth** with stateless cookie-based sessions to provide persistent authentication without requiring database configuration. The authentication system supports:

- **Generic OIDC support** - Works with any OIDC-compliant identity provider
- **Stateless sessions** - Cookie-only sessions that survive container restarts without server-side storage
- **Read-only unauthenticated access** - Users can design rack layouts without authentication; authentication required only for saving/managing layouts
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
│  │         Better Auth                      │   │
│  │  - /auth/login → redirects to IdP        │   │
│  │  - /auth/callback → handles OIDC return  │   │
│  │  - /auth/logout → clears session         │   │
│  │  - Session validation middleware         │   │
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

**Read-Only Access:**

- Unauthenticated users can access the full design interface
- Authentication required only when saving layouts or managing saved layouts
- Core design principle: "zero friction for rack design"

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
# Session expires after this many seconds of inactivity
RACKULA_AUTH_SESSION_MAX_AGE_SECONDS=43200  # 12 hours
# Session refreshes if this many seconds remain until expiry
RACKULA_AUTH_SESSION_UPDATE_AGE_SECONDS=21600  # 6 hours

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
   - Expected: App loads, read-only mode (can design layouts but not save)

2. **Access login endpoint:**
   - URL: `https://your-rackula-domain.com/auth/login`
   - Expected: Redirect to your IdP's login page

3. **Complete IdP login:**
   - Enter credentials on IdP login page
   - Expected: Redirect back to `https://your-rackula-domain.com/auth/callback`

4. **Verify session cookie:**
   - Open browser DevTools → Application → Cookies
   - Look for cookie with `better-auth` prefix
   - Verify flags: `HttpOnly`, `Secure`, `SameSite=Lax`

5. **Access protected routes:**
   - Try saving a layout (requires authentication)
   - Expected: Success (no "unauthorized" error)

6. **Test session persistence:**
   - Restart API container: `docker compose restart api`
   - Refresh browser (do not clear cookies)
   - Expected: Still authenticated (no re-login required)

**Troubleshooting failed verification:** See the Troubleshooting section below.

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

**2. Update auth/config.ts to read secrets from files:**

```typescript
// Read secret from file if _FILE env var is provided
const sessionSecret = (() => {
  const secretFile = process.env.RACKULA_AUTH_SESSION_SECRET_FILE;
  if (secretFile) {
    try {
      return require("fs").readFileSync(secretFile, "utf8").trim();
    } catch (error) {
      console.error("Failed to read session secret from file:", error);
      throw new Error("Session secret file not found or unreadable");
    }
  }
  return process.env.RACKULA_AUTH_SESSION_SECRET || "";
})();

const oidcClientSecret = (() => {
  const secretFile = process.env.RACKULA_OIDC_CLIENT_SECRET_FILE;
  if (secretFile) {
    try {
      return require("fs").readFileSync(secretFile, "utf8").trim();
    } catch (error) {
      console.error("Failed to read OIDC client secret from file:", error);
      throw new Error("OIDC client secret file not found or unreadable");
    }
  }
  return process.env.RACKULA_OIDC_CLIENT_SECRET || "";
})();
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

**5. Monitor authentication logs (future enhancement):**

- Current limitation: No built-in auth event logging in v0.9.0
- Planned for v2: Structured logging of login attempts, session creation, failures
- Workaround: Monitor IdP logs for authentication events

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
   - Look for cookie with `better-auth` prefix
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
2. Check IdP application exists and is enabled
3. Verify client ID matches: `RACKULA_OIDC_CLIENT_ID` = IdP client ID
4. Check IdP logs for more specific error details

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

### 1. No Server-Side Session Revocation

**Limitation:**
Stateless sessions stored in signed cookies cannot be revoked server-side until they expire naturally.

**Impact:**

- If a user's session is compromised, it remains valid until expiration (12 hours by default)
- No "force logout" capability for administrators
- Cannot immediately revoke access when user permissions change

**Workarounds:**

- Keep session TTL short (default 12 hours, reduce if needed)
- Change `RACKULA_AUTH_SESSION_SECRET` to invalidate all sessions (forces all users to re-login)
- Revoke access at IdP level (user cannot create new sessions)

**When to address:**
Upgrade to database-backed sessions if instant revocation is required. See Phase 2 planning for migration path.

### 2. No Authentication Event Logging

**Limitation:**
No built-in logging of authentication events (login attempts, session creation, failures).

**Impact:**

- Cannot track failed login attempts
- No audit trail for compliance requirements
- Difficult to debug authentication issues without IdP logs

**Workarounds:**

- Monitor IdP logs for authentication events
- Use IdP's built-in audit logging features
- Implement reverse proxy logging (e.g., Traefik access logs)

**When to address:**
Planned for v2.0 (structured logging of auth events).

### 3. No Local Username/Password Authentication

**Limitation:**
Authentication requires external OIDC identity provider. No built-in local user database.

**Impact:**

- Cannot use Rackula without deploying separate IdP
- Not suitable for users wanting standalone authentication

**Workarounds:**

- Deploy lightweight IdP like Authelia or Authentik
- Use hosted OIDC provider (Auth0, Okta, etc.)

**When to address:**
Planned for v2.0 (optional local authentication mode).

### 4. No Multi-Factor Authentication (MFA) in Rackula

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

### 5. No User Management UI in Rackula

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
- **Structured authentication logging** - Audit trail for login attempts, session creation, failures
- **Local username/password authentication** - Optional standalone auth without external IdP
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
