import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

/**
 * Better Auth configuration with stateless (cookie-only) sessions and optional OIDC.
 *
 * Session data is stored in signed/encrypted cookies with no database backend.
 * This eliminates server-side session storage while providing sessions that survive
 * container restarts (stored in browser cookies, not server memory).
 *
 * OIDC authentication uses the genericOAuth plugin with auto-discovery via
 * the provider's .well-known/openid-configuration endpoint. Works with any
 * OIDC-compliant provider (Authentik, Authelia, Keycloak, etc.).
 *
 * Environment variables:
 * - RACKULA_AUTH_SESSION_SECRET: HMAC secret for signing session cookies (required, min 32 chars)
 * - RACKULA_OIDC_ISSUER: OIDC provider base URL (e.g. https://auth.example.com/application/o/rackula/)
 * - RACKULA_OIDC_CLIENT_ID: OAuth client ID
 * - RACKULA_OIDC_CLIENT_SECRET: OAuth client secret
 * - RACKULA_OIDC_REDIRECT_URI: OAuth callback URL (optional, defaults to {baseURL}/api/auth/oauth2/callback/oidc)
 * - RACKULA_BASE_URL: Base URL for callback construction (defaults to http://localhost:3000)
 */
export function createAuth(secret: string) {
  if (!secret) {
    throw new Error(
      "Auth session secret is required. Set RACKULA_AUTH_SESSION_SECRET.",
    );
  }

  const oidcClientId = process.env.RACKULA_OIDC_CLIENT_ID?.trim();
  const oidcClientSecret = process.env.RACKULA_OIDC_CLIENT_SECRET?.trim();
  const oidcConfigured = Boolean(oidcClientId && oidcClientSecret);

  const plugins = oidcConfigured
    ? [
        genericOAuth({
          config: [
            {
              providerId: "oidc",
              clientId: oidcClientId!,
              clientSecret: oidcClientSecret!,
              discoveryUrl: process.env.RACKULA_OIDC_ISSUER
                ? `${process.env.RACKULA_OIDC_ISSUER.replace(/\/$/, "")}/.well-known/openid-configuration`
                : undefined,
              scopes: ["openid", "profile", "email"],
              pkce: true,
              redirectURI: process.env.RACKULA_OIDC_REDIRECT_URI || undefined,
            },
          ],
        }),
      ]
    : [];

  return betterAuth({
    // Omitting database config enables stateless mode (cookie-only sessions)
    // Session data stored in signed cookies, no database queries for validation
    secret,
    baseURL: process.env.RACKULA_BASE_URL || "http://localhost:3000",

    session: {
      // 12 hours session lifetime (shorter than Better Auth default of 7 days)
      expiresIn: 60 * 60 * 12,

      // Refresh session when 6 hours remain
      updateAge: 60 * 60 * 6,

      // Cookie cache for performance optimization
      cookieCache: {
        enabled: true,
        maxAge: 300, // 5-minute cache
      },
    },

    advanced: {
      defaultCookieAttributes: {
        httpOnly: true, // Prevent XSS access to cookie
        sameSite: "lax", // CSRF protection
        secure: process.env.NODE_ENV === "production", // HTTPS only in production
        // domain: '.racku.la' // Uncomment if using subdomains
      },
    },

    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;
