import { describe, expect, it } from "bun:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApp } from "./app";
import type { EnvMap } from "./security";

const TEST_AUTH_SECRET = "rackula-auth-session-secret-for-tests-0123456789";
const ENTRA_COMMON_ISSUER = "https://login.microsoftonline.com/common/v2.0";
const ENTRA_TENANT_ISSUER =
  "https://login.microsoftonline.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/v2.0";
const ENTRA_DISCOVERY_URL =
  "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration";
const ENTRA_AUTHORIZATION_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const ENTRA_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const ENTRA_JWKS_URL = "https://login.microsoftonline.com/common/discovery/v2.0/keys";

function buildOidcEnv(overrides: EnvMap = {}): EnvMap {
  return {
    NODE_ENV: "test",
    RACKULA_AUTH_MODE: "oidc",
    RACKULA_AUTH_SESSION_SECRET: TEST_AUTH_SECRET,
    CORS_ORIGIN: "https://rack.example.com",
    RACKULA_BASE_URL: "https://rack.example.com",
    RACKULA_OIDC_ISSUER: ENTRA_COMMON_ISSUER,
    RACKULA_OIDC_CLIENT_ID: "rackula-web",
    RACKULA_OIDC_CLIENT_SECRET: "oidc-client-secret",
    RACKULA_OIDC_REDIRECT_URI: "https://rack.example.com/auth/callback",
    ...overrides,
  };
}

function readSetCookies(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie: () => string[] };
  try {
    const setCookies = withGetSetCookie.getSetCookie();
    if (Array.isArray(setCookies)) {
      return setCookies;
    }
  } catch {
    // Fall through to standard header handling.
  }

  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

function cookieHeaderFromSetCookies(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.split(";", 1)[0] ?? "")
    .filter((cookie) => cookie.length > 0)
    .join("; ");
}

async function createSignedIdToken(overrides: {
  audience?: string | string[];
  issuer?: string;
} = {}): Promise<{ token: string; publicJwk: JsonWebKey }> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "rackula-test-kid";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  const nowSeconds = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    email: "admin@example.com",
    name: "Rackula Admin",
    email_verified: true,
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: "rackula-test-kid",
      typ: "JWT",
    })
    .setIssuer(overrides.issuer ?? ENTRA_TENANT_ISSUER)
    .setAudience(overrides.audience ?? "rackula-web")
    .setSubject("entra-user-123")
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 3600)
    .sign(privateKey);

  return { token, publicJwk };
}

async function installMockOidcFetch(options: {
  idTokenAudience?: string | string[];
  idTokenIssuer?: string;
  failTokenExchange?: boolean;
} = {}): Promise<{ restore: () => void }> {
  const originalFetch = globalThis.fetch;
  const signedIdToken = await createSignedIdToken({
    audience: options.idTokenAudience,
    issuer: options.idTokenIssuer,
  });

  const mockFetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = args;
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url === ENTRA_DISCOVERY_URL) {
      return new Response(
        JSON.stringify({
          issuer: ENTRA_TENANT_ISSUER,
          authorization_endpoint: ENTRA_AUTHORIZATION_URL,
          token_endpoint: ENTRA_TOKEN_URL,
          jwks_uri: ENTRA_JWKS_URL,
          userinfo_endpoint: "https://graph.microsoft.com/oidc/userinfo",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    if (url === ENTRA_JWKS_URL) {
      return new Response(
        JSON.stringify({
          keys: [signedIdToken.publicJwk],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    if (url === ENTRA_TOKEN_URL) {
      if (options.failTokenExchange) {
        return new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "authorization code is invalid",
          }),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          access_token: "entra-access-token",
          token_type: "Bearer",
          expires_in: 3600,
          id_token: signedIdToken.token,
          scope: "openid profile email",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    return originalFetch(input, init);
  };

  const patchedFetch = Object.assign(mockFetch, {
    preconnect: (originalFetch as typeof fetch & { preconnect?: typeof fetch }).preconnect,
  }) as typeof fetch;
  globalThis.fetch = patchedFetch;

  return {
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

describe("OIDC integration", () => {
  it("accepts Entra common issuer config when discovery returns tenant issuer", async () => {
    const mock = await installMockOidcFetch();
    try {
      const app = createApp(buildOidcEnv());

      const loginResponse = await app.request("/auth/login?next=%2Fdashboard");
      expect(loginResponse.status).toBe(302);

      const loginUrl = new URL(loginResponse.headers.get("location")!);
      const state = loginUrl.searchParams.get("state");
      expect(state).not.toBeNull();

      const loginCookieHeader = cookieHeaderFromSetCookies(
        readSetCookies(loginResponse.headers),
      );

      const callbackResponse = await app.request(
        `/auth/callback?code=entra-code&state=${encodeURIComponent(state!)}`,
        {
          headers: {
            Cookie: loginCookieHeader,
          },
        },
      );

      expect(callbackResponse.status).toBe(302);
      const callbackCookies = readSetCookies(callbackResponse.headers);
      expect(callbackCookies.some((cookie) => cookie.includes("rackula_auth_session="))).toBe(
        true,
      );
    } finally {
      mock.restore();
    }
  });

  it("rejects callback when token audience does not match client id", async () => {
    const mock = await installMockOidcFetch({
      idTokenAudience: "wrong-client-id",
    });
    try {
      const app = createApp(buildOidcEnv());

      const loginResponse = await app.request("/auth/login?next=%2Fdashboard");
      expect(loginResponse.status).toBe(302);
      const loginUrl = new URL(loginResponse.headers.get("location")!);
      const state = loginUrl.searchParams.get("state");
      expect(state).not.toBeNull();
      const loginCookieHeader = cookieHeaderFromSetCookies(
        readSetCookies(loginResponse.headers),
      );

      const callbackResponse = await app.request(
        `/auth/callback?code=entra-code&state=${encodeURIComponent(state!)}`,
        {
          headers: {
            Cookie: loginCookieHeader,
          },
        },
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toContain("user_info_is_missing");

      const callbackCookies = readSetCookies(callbackResponse.headers);
      expect(callbackCookies.some((cookie) => cookie.includes("rackula_auth_session="))).toBe(
        false,
      );
    } finally {
      mock.restore();
    }
  });
});
