# Rackula API

Minimal Hono-based API for Rackula layout persistence and authentication, running on Bun runtime.

## Overview

This API provides:

- **Layout persistence** - Save and load rack layouts
- **OIDC authentication** - Generic OIDC provider support via Better Auth
- **Session management** - Stateless cookie-based sessions (no database required)
- **Read-only unauthenticated access** - Users can design without authentication

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.0 or later
- OIDC-compliant identity provider (optional, for authentication)

### Installation

```bash
# Install dependencies
bun install

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration
# At minimum, set RACKULA_AUTH_SESSION_SECRET
```

### Development

```bash
# Start development server with hot reload
bun run dev

# API will be available at http://localhost:3000
```

### Production

```bash
# Build for production
bun run build

# Start production server
bun run start
```

### Docker

```bash
# Build Docker image
docker build -t rackula-api .

# Run container
docker run -p 3000:3000 \
  -e RACKULA_AUTH_SESSION_SECRET=your-secret \
  rackula-api
```

## Authentication

Rackula supports OIDC authentication for self-hosted deployments. Unauthenticated users can use the app in read-only mode (full design interface, but cannot save layouts).

### Quick Start

1. **Configure your OIDC provider** (Authentik, Authelia, Keycloak, or any OIDC-compliant IdP)
2. **Set environment variables** in `.env` (see `.env.example` for all options)
3. **Restart the API** to apply changes

### Full Setup Guide

See [`docs/deployment/AUTHENTICATION.md`](../docs/deployment/AUTHENTICATION.md) for comprehensive setup instructions including:

- Step-by-step OIDC configuration for Authentik, Authelia, and Keycloak
- Environment variable reference with examples
- Security hardening best practices
- Docker secrets integration
- Troubleshooting common issues

### Supported Identity Providers

- **Generic OIDC** - Any OIDC-compliant provider
- **Authentik** - Recommended for self-hosters
- **Authelia** - Lightweight authentication server
- **Keycloak** - Enterprise-grade identity management
- **Auth0, Okta, etc.** - Cloud-hosted OIDC providers

### Session Management

- **Cookie-based sessions** - No database required for session storage
- **12-hour session TTL** - Configurable via `RACKULA_AUTH_SESSION_MAX_AGE_SECONDS`
- **Automatic refresh** - Sessions refresh when 6 hours remain until expiration
- **Survives restarts** - Sessions stored in signed browser cookies, not server memory

### Environment Variables

Required for authentication:

```bash
# Session secret (required, minimum 32 characters)
RACKULA_AUTH_SESSION_SECRET=your-generated-secret

# OIDC provider configuration
RACKULA_OIDC_ISSUER=https://your-idp.example.com/
RACKULA_OIDC_CLIENT_ID=rackula-web
RACKULA_OIDC_CLIENT_SECRET=your-client-secret
RACKULA_OIDC_REDIRECT_URI=https://your-rackula.example.com/auth/callback
```

See `.env.example` for all available configuration options.

## API Endpoints

### Authentication Routes (Better Auth)

Mounted at `/auth/*` and `/api/auth/*`:

- `GET /auth/login` - Initiate OIDC login flow (redirects to IdP)
- `GET /auth/callback` - OIDC callback handler (redirects back from IdP)
- `GET /auth/logout` - Clear session and logout
- `GET /auth/session` - Get current session information

### Layout Routes (Future)

- `GET /api/layouts` - List saved layouts (authenticated)
- `POST /api/layouts` - Save new layout (authenticated)
- `GET /api/layouts/:id` - Get specific layout (public or authenticated)
- `PUT /api/layouts/:id` - Update layout (authenticated, owner only)
- `DELETE /api/layouts/:id` - Delete layout (authenticated, owner only)

## Development

### Project Structure

```
api/
├── src/
│   ├── app.ts              # Hono application setup
│   ├── auth/
│   │   ├── config.ts       # Better Auth configuration
│   │   └── client.ts       # Better Auth client export
│   └── middleware/
│       └── auth.ts         # Authentication middleware
├── .env.example            # Environment configuration template
├── Dockerfile              # Production container image
├── package.json            # Dependencies and scripts
└── tsconfig.json           # TypeScript configuration
```

### Scripts

```bash
bun run dev        # Start development server with hot reload
bun run start      # Start production server
bun run build      # Build for production (if needed)
bun run typecheck  # Run TypeScript type checking
```

### Adding Routes

```typescript
// src/app.ts
import { Hono } from "hono";

const app = new Hono();

app.get("/api/example", async (c) => {
  return c.json({ message: "Hello from Rackula API" });
});

export default app;
```

### Accessing Session Data

```typescript
// In a protected route
app.get("/api/protected", async (c) => {
  const session = c.get("session"); // Set by auth middleware
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return c.json({ user: session.user });
});
```

## Security

### Production Deployment

**Important security considerations:**

1. **Always use HTTPS** - Required for secure session cookies
2. **Generate strong session secret** - Minimum 32 characters, use `openssl rand -base64 32`
3. **Use Docker secrets** - Never commit `.env` files with real credentials
4. **Keep session TTL short** - Default 12 hours, reduce if higher security needed
5. **Validate redirect URIs** - Ensure IdP redirect URI matches exactly

See [`docs/deployment/AUTHENTICATION.md`](../docs/deployment/AUTHENTICATION.md) for comprehensive security hardening guide.

### Docker Secrets

For production, use Docker secrets instead of environment variables:

```yaml
# docker-compose.yml
services:
  api:
    image: rackula-api
    secrets:
      - auth_session_secret
      - oidc_client_secret
    environment:
      RACKULA_AUTH_SESSION_SECRET_FILE: /run/secrets/auth_session_secret
      RACKULA_OIDC_CLIENT_SECRET_FILE: /run/secrets/oidc_client_secret
      RACKULA_OIDC_ISSUER: https://authentik.example.com/application/o/rackula/
      RACKULA_OIDC_CLIENT_ID: rackula-web

secrets:
  auth_session_secret:
    file: ./secrets/auth_session_secret.txt
  oidc_client_secret:
    file: ./secrets/oidc_client_secret.txt
```

## Troubleshooting

### API fails to start with "Session secret is required"

Generate and set session secret:

```bash
# Generate secret
openssl rand -base64 32

# Add to .env
echo "RACKULA_AUTH_SESSION_SECRET=your-generated-secret" >> .env

# Restart API
bun run dev
```

### OIDC authentication not working

1. Verify environment variables are set correctly in `.env`
2. Check OIDC issuer URL is accessible and correct
3. Verify redirect URI matches IdP configuration exactly
4. Check IdP logs for authentication errors

See [`docs/deployment/AUTHENTICATION.md`](../docs/deployment/AUTHENTICATION.md) troubleshooting section for detailed guidance.

### Sessions expire immediately

1. Check cookie security settings match deployment environment:
   - Development (HTTP): `RACKULA_AUTH_SESSION_COOKIE_SECURE=false`
   - Production (HTTPS): `RACKULA_AUTH_SESSION_COOKIE_SECURE=true`
2. Verify browser accepts cookies (not in private/incognito mode)
3. Check session TTL is configured correctly

## Contributing

This API is part of the Rackula project. See the main repository README for contribution guidelines.

## License

See main Rackula repository for license information.

## Support

- **Documentation:** [`docs/deployment/AUTHENTICATION.md`](../docs/deployment/AUTHENTICATION.md)
- **Issues:** [GitHub Issues](https://github.com/RackulaLives/Rackula/issues)
- **Discussions:** [GitHub Discussions](https://github.com/RackulaLives/Rackula/discussions)
