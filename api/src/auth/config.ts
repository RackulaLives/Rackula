import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

type EnvMap = Record<string, string | undefined>;

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_AUTH_SESSION_COOKIE_NAME = "rackula_auth_session";
const DEFAULT_OIDC_SCOPES = ["openid", "profile", "email"];
const OIDC_DISCOVERY_PATH = "/.well-known/openid-configuration";

interface OidcDiscoveryDocument {
  issuer: string;
  jwksUri: string;
}

interface VerifiedOidcUserInfo {
  id: string;
  name?: string;
  email: string;
  image?: string;
  emailVerified: boolean;
}

function readEnv(env: EnvMap, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function parseOidcScopes(raw: string | undefined): string[] {
  if (!raw) {
    return [...DEFAULT_OIDC_SCOPES];
  }

  const scopes = [...new Set(raw.split(/[,\s]+/).map((scope) => scope.trim()))]
    .filter((scope) => scope.length > 0);

  if (scopes.length === 0) {
    return [...DEFAULT_OIDC_SCOPES];
  }

  if (!scopes.includes("openid")) {
    scopes.unshift("openid");
  }

  return scopes;
}

function parseAbsoluteUrl(
  value: string,
  envName: string,
): URL {
  try {
    return new URL(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${envName} must be a valid absolute URL. ${reason}`, {
      cause: error,
    });
  }
}

function resolveOidcDiscoveryUrl(env: EnvMap): string | undefined {
  const discovery = readEnv(env, "RACKULA_OIDC_DISCOVERY_URL");
  if (discovery) {
    return parseAbsoluteUrl(discovery, "RACKULA_OIDC_DISCOVERY_URL").toString();
  }

  const issuer = readEnv(env, "RACKULA_OIDC_ISSUER");
  if (!issuer) {
    return undefined;
  }

  const issuerUrl = parseAbsoluteUrl(issuer, "RACKULA_OIDC_ISSUER");
  const normalizedPath = issuerUrl.pathname.replace(/\/+$/, "");
  if (normalizedPath.endsWith(OIDC_DISCOVERY_PATH)) {
    issuerUrl.pathname = normalizedPath;
    issuerUrl.search = "";
    issuerUrl.hash = "";
    return issuerUrl.toString();
  }

  issuerUrl.pathname = `${normalizedPath}${OIDC_DISCOVERY_PATH}`;
  issuerUrl.search = "";
  issuerUrl.hash = "";
  return issuerUrl.toString();
}

function normalizeIssuerUrl(value: string): string {
  const issuerUrl = new URL(value);
  issuerUrl.search = "";
  issuerUrl.hash = "";
  const normalizedPath = issuerUrl.pathname.replace(/\/+$/, "");
  issuerUrl.pathname = normalizedPath.length > 0 ? normalizedPath : "/";
  return issuerUrl.toString();
}

function isMicrosoftEntraCommonIssuerMatch(
  expectedIssuer: string,
  discoveryIssuer: string,
): boolean {
  try {
    const expected = new URL(expectedIssuer);
    const discovery = new URL(discoveryIssuer);
    const expectedPath = expected.pathname.replace(/\/+$/, "");
    const discoveryPath = discovery.pathname.replace(/\/+$/, "");

    if (
      expected.protocol !== discovery.protocol ||
      expected.hostname !== discovery.hostname ||
      expected.port !== discovery.port
    ) {
      return false;
    }

    if (expected.hostname !== "login.microsoftonline.com") {
      return false;
    }

    if (!/^\/common\/v2\.0$/i.test(expectedPath)) {
      return false;
    }

    return /^\/[^/]+\/v2\.0$/i.test(discoveryPath);
  } catch {
    return false;
  }
}

function issuerMatchesExpected(
  expectedIssuer: string | undefined,
  discoveryIssuer: string,
): boolean {
  if (!expectedIssuer) {
    return true;
  }

  if (expectedIssuer === discoveryIssuer) {
    return true;
  }

  return isMicrosoftEntraCommonIssuerMatch(expectedIssuer, discoveryIssuer);
}

async function fetchOidcDiscoveryDocument(
  discoveryUrl: string,
  expectedIssuer: string | undefined,
): Promise<OidcDiscoveryDocument> {
  const response = await fetch(discoveryUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `OIDC discovery request failed (${response.status} ${response.statusText}).`,
    );
  }

  const parsed = (await response.json()) as Record<string, unknown>;
  const issuerValue = parsed.issuer;
  const jwksUriValue = parsed.jwks_uri;
  if (typeof issuerValue !== "string" || issuerValue.trim().length === 0) {
    throw new Error("OIDC discovery response missing issuer.");
  }

  if (typeof jwksUriValue !== "string" || jwksUriValue.trim().length === 0) {
    throw new Error("OIDC discovery response missing jwks_uri.");
  }

  const issuer = normalizeIssuerUrl(issuerValue);
  if (!issuerMatchesExpected(expectedIssuer, issuer)) {
    throw new Error(
      "OIDC discovery issuer does not match RACKULA_OIDC_ISSUER.",
    );
  }

  return {
    issuer,
    jwksUri: parseAbsoluteUrl(jwksUriValue, "OIDC discovery jwks_uri").toString(),
  };
}

function mapVerifiedOidcPayload(
  payload: JWTPayload,
): VerifiedOidcUserInfo | null {
  const subjectValue = payload.sub;
  const emailValue = payload.email;
  const nameClaim = payload["name"];
  const preferredUsernameClaim = payload["preferred_username"];
  const pictureClaim = payload["picture"];
  const emailVerifiedClaim = payload["email_verified"];
  if (typeof subjectValue !== "string" || subjectValue.trim().length === 0) {
    return null;
  }

  if (typeof emailValue !== "string" || emailValue.trim().length === 0) {
    return null;
  }

  const nameValue =
    typeof nameClaim === "string" && nameClaim.trim().length > 0
      ? nameClaim.trim()
      : typeof preferredUsernameClaim === "string" &&
          preferredUsernameClaim.trim().length > 0
        ? preferredUsernameClaim.trim()
        : emailValue.trim();

  const imageValue =
    typeof pictureClaim === "string" && pictureClaim.trim().length > 0
      ? pictureClaim.trim()
      : undefined;

  return {
    id: subjectValue.trim(),
    name: nameValue,
    email: emailValue.trim().toLowerCase(),
    image: imageValue,
    emailVerified: emailVerifiedClaim === true,
  };
}

function createOidcUserInfoResolver(options: {
  discoveryUrl: string;
  clientId: string;
  expectedIssuer?: string;
}) {
  let discoveryPromise: Promise<OidcDiscoveryDocument> | undefined;
  let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

  async function resolveDiscovery(): Promise<OidcDiscoveryDocument> {
    if (!discoveryPromise) {
      discoveryPromise = fetchOidcDiscoveryDocument(
        options.discoveryUrl,
        options.expectedIssuer,
      ).catch((error: unknown) => {
        discoveryPromise = undefined;
        jwks = undefined;
        throw error;
      });
    }

    return discoveryPromise;
  }

  return async (tokens: { idToken?: string | undefined }) => {
    const idToken = tokens.idToken?.trim();
    if (!idToken) {
      return null;
    }

    try {
      const discovery = await resolveDiscovery();
      if (!jwks) {
        jwks = createRemoteJWKSet(new URL(discovery.jwksUri));
      }

      const { payload } = await jwtVerify(idToken, jwks, {
        issuer: discovery.issuer,
        audience: options.clientId,
      });

      return mapVerifiedOidcPayload(payload);
    } catch (error) {
      console.warn("OIDC ID token validation failed:", error);
      return null;
    }
  };
}

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
 * - RACKULA_OIDC_DISCOVERY_URL: Explicit OIDC discovery document URL (optional override)
 * - RACKULA_OIDC_CLIENT_ID: OAuth client ID
 * - RACKULA_OIDC_CLIENT_SECRET: OAuth client secret
 * - RACKULA_OIDC_REDIRECT_URI: OAuth callback URL (optional)
 * - RACKULA_OIDC_SCOPES: Optional scopes (comma or space-separated), defaults to openid profile email
 * - RACKULA_BASE_URL: Base URL for callback construction (defaults to http://localhost:3000)
 */
export function createAuth(secret: string, env: EnvMap = process.env) {
  if (!secret) {
    throw new Error(
      "Auth session secret is required. Set RACKULA_AUTH_SESSION_SECRET.",
    );
  }

  const oidcClientId = readEnv(env, "RACKULA_OIDC_CLIENT_ID");
  const oidcClientSecret = readEnv(env, "RACKULA_OIDC_CLIENT_SECRET");
  const oidcDiscoveryUrl = resolveOidcDiscoveryUrl(env);
  const oidcIssuer = readEnv(env, "RACKULA_OIDC_ISSUER");
  const oidcScopes = parseOidcScopes(readEnv(env, "RACKULA_OIDC_SCOPES"));
  const authSessionCookieName =
    readEnv(env, "RACKULA_AUTH_SESSION_COOKIE_NAME") ||
    DEFAULT_AUTH_SESSION_COOKIE_NAME;
  const baseURL = readEnv(env, "RACKULA_BASE_URL") || DEFAULT_BASE_URL;

  const plugins = [];
  if (oidcClientId && oidcClientSecret) {
    if (!oidcDiscoveryUrl) {
      throw new Error(
        "OIDC is enabled but no discovery URL is configured. Set RACKULA_OIDC_DISCOVERY_URL or RACKULA_OIDC_ISSUER.",
      );
    }

    plugins.push(
      genericOAuth({
        config: [
          {
            providerId: "oidc",
            clientId: oidcClientId,
            clientSecret: oidcClientSecret,
            discoveryUrl: oidcDiscoveryUrl,
            scopes: oidcScopes,
            pkce: true,
            redirectURI: readEnv(env, "RACKULA_OIDC_REDIRECT_URI"),
            getUserInfo: createOidcUserInfoResolver({
              discoveryUrl: oidcDiscoveryUrl,
              clientId: oidcClientId,
              expectedIssuer: oidcIssuer
                ? normalizeIssuerUrl(oidcIssuer)
                : undefined,
            }),
          },
        ],
      }),
    );
  }

  return betterAuth({
    // Omitting database config enables stateless mode (cookie-only sessions)
    // Session data stored in signed cookies, no database queries for validation
    secret,
    baseURL,

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
      // Keep custom cookie names exact (without auto __Secure- prefixing) so
      // Rackula's CSRF/auth middleware can reliably read the configured cookie name.
      useSecureCookies: false,
      cookies: {
        session_token: {
          name: authSessionCookieName,
        },
      },
      defaultCookieAttributes: {
        httpOnly: true, // Prevent XSS access to cookie
        sameSite: "lax", // CSRF protection
        secure: env.NODE_ENV === "production", // HTTPS only in production
        // domain: '.racku.la' // Uncomment if using subdomains
      },
    },

    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;
