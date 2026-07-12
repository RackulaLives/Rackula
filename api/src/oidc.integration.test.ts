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
const ENTRA_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const ENTRA_JWKS_URL =
  "https://login.microsoftonline.com/common/discovery/v2.0/keys";

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
  const withGetSetCookie = headers as Headers & {
    getSetCookie: () => string[];
  };
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

function mergeCookieHeaders(
  ...cookieHeaders: Array<string | null | undefined>
): string {
  return cookieHeaders
    .filter((value): value is string => Boolean(value))
    .join("; ");
}

async function createSignedIdToken(
  overrides: {
    audience?: string | string[];
    issuer?: string;
    /**
     * JWS algorithm used to sign the token (default "RS256"). Used by the
     * algorithm-pinning test (#2942) to sign with a different-but-still-RSA
     * algorithm (e.g. "RS384") that the same key material can verify.
     */
    algorithm?: "RS256" | "RS384";
    /**
     * Whether the exported JWKS entry declares its own `alg`. jose's
     * RemoteJWKSet key-selection already filters candidates by a declared JWK
     * `alg` when present, which would mask a missing `algorithms` pin in
     * `jwtVerify`. Set to false to simulate a provider whose JWKS entries
     * don't declare `alg` (common in the wild), which is the scenario where
     * pinning actually matters.
     */
    includeJwkAlg?: boolean;
  } = {},
): Promise<{ token: string; publicJwk: JsonWebKey }> {
  const algorithm = overrides.algorithm ?? "RS256";
  const { publicKey, privateKey } = await generateKeyPair(algorithm);
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "rackula-test-kid";
  if (overrides.includeJwkAlg ?? true) {
    publicJwk.alg = algorithm;
  }
  publicJwk.use = "sig";

  const nowSeconds = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    email: "admin@example.com",
    name: "Rackula Admin",
    email_verified: true,
  })
    .setProtectedHeader({
      alg: algorithm,
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

async function installMockOidcFetch(
  options: {
    idTokenAudience?: string | string[];
    idTokenIssuer?: string;
    idTokenAlgorithm?: "RS256" | "RS384";
    idTokenIncludeJwkAlg?: boolean;
    /**
     * When set, adds `id_token_signing_alg_values_supported` to the mock
     * discovery document so a test can exercise the discovery-driven algorithm
     * pin (#2942). Omit to simulate a provider that does not advertise the
     * field (which pins to the RS256 fallback).
     */
    discoverySigningAlgs?: string[];
    failTokenExchange?: boolean;
  } = {},
): Promise<{ restore: () => void }> {
  const originalFetch = globalThis.fetch;
  const signedIdToken = await createSignedIdToken({
    audience: options.idTokenAudience,
    issuer: options.idTokenIssuer,
    algorithm: options.idTokenAlgorithm,
    includeJwkAlg: options.idTokenIncludeJwkAlg,
  });

  const mockFetch = async (
    ...args: Parameters<typeof fetch>
  ): Promise<Response> => {
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
          ...(options.discoverySigningAlgs
            ? {
                id_token_signing_alg_values_supported:
                  options.discoverySigningAlgs,
              }
            : {}),
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
    preconnect: (originalFetch as typeof fetch & { preconnect?: typeof fetch })
      .preconnect,
  }) as typeof fetch;
  globalThis.fetch = patchedFetch;

  return {
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

describe("OIDC integration", () => {
  async function completeOidcLogin(
    app: Awaited<ReturnType<typeof createApp>>,
  ): Promise<string> {
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
    expect(
      callbackCookies.some((cookie) =>
        cookie.includes("rackula_auth_session="),
      ),
    ).toBe(true);

    return mergeCookieHeaders(
      loginCookieHeader,
      cookieHeaderFromSetCookies(callbackCookies),
    );
  }

  it("accepts Entra common issuer config when discovery returns tenant issuer", async () => {
    const mock = await installMockOidcFetch();
    try {
      const app = await createApp(buildOidcEnv());
      const authedCookieHeader = await completeOidcLogin(app);

      const checkResponse = await app.request("/auth/check", {
        headers: {
          Cookie: authedCookieHeader,
          Origin: "https://rack.example.com",
        },
      });
      expect(checkResponse.status).toBe(204);
    } finally {
      mock.restore();
    }
  });

  it("rejects callback when token audience does not match client id", async () => {
    const mock = await installMockOidcFetch({
      idTokenAudience: "wrong-client-id",
    });
    try {
      const app = await createApp(buildOidcEnv());

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
      expect(callbackResponse.headers.get("location")).toContain(
        "user_info_is_missing",
      );

      const callbackCookies = readSetCookies(callbackResponse.headers);
      expect(
        callbackCookies.some((cookie) =>
          cookie.includes("rackula_auth_session="),
        ),
      ).toBe(false);
    } finally {
      mock.restore();
    }
  });

  // #2942: the OIDC id-token verification previously set no `algorithms`
  // restriction on `jwtVerify`. An RSA key can validly sign RS256, RS384, or
  // RS512, so an attacker able to influence the token's declared algorithm
  // (or a compromised/misconfigured provider) could get a token accepted
  // under an algorithm the operator never intended to trust. Here discovery
  // omits id_token_signing_alg_values_supported, so the pin falls back to
  // RS256; the mock JWKS entry omits its own `alg` field (as real-world JWKS
  // often do) so the only thing that can reject the RS384-signed token is the
  // pin, not jose's incidental JWK/header alg match.
  it("rejects an ID token signed with an algorithm outside the pinned set", async () => {
    const mock = await installMockOidcFetch({
      idTokenAlgorithm: "RS384",
      idTokenIncludeJwkAlg: false,
    });
    try {
      const app = await createApp(buildOidcEnv());

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
      expect(callbackResponse.headers.get("location")).toContain(
        "user_info_is_missing",
      );

      const callbackCookies = readSetCookies(callbackResponse.headers);
      expect(
        callbackCookies.some((cookie) =>
          cookie.includes("rackula_auth_session="),
        ),
      ).toBe(false);
    } finally {
      mock.restore();
    }
  });

  // #2942: pinning must not break a provider that signs with a non-RS256
  // asymmetric algorithm (e.g. a Keycloak client configured for RS384). When
  // discovery advertises the algorithm, the token verifies and login succeeds.
  it("accepts an ID token whose non-RS256 algorithm the provider advertises", async () => {
    const mock = await installMockOidcFetch({
      idTokenAlgorithm: "RS384",
      idTokenIncludeJwkAlg: false,
      discoverySigningAlgs: ["RS384"],
    });
    try {
      const app = await createApp(buildOidcEnv());
      const authedCookieHeader = await completeOidcLogin(app);

      const checkResponse = await app.request("/auth/check", {
        headers: {
          Cookie: authedCookieHeader,
          Origin: "https://rack.example.com",
        },
      });
      expect(checkResponse.status).toBe(204);
    } finally {
      mock.restore();
    }
  });

  // #2942: a discovery document advertising only unknown / non-JWS algorithm
  // names must not suppress the RS256 fallback. Only known asymmetric JWS
  // algorithms are honoured; an unrecognised value is ignored, leaving the
  // RS256 fallback so a valid RS256 token still verifies and login succeeds.
  it("falls back to RS256 when discovery advertises only an unknown algorithm", async () => {
    const mock = await installMockOidcFetch({
      idTokenAlgorithm: "RS256",
      idTokenIncludeJwkAlg: false,
      discoverySigningAlgs: ["FOO256"],
    });
    try {
      const app = await createApp(buildOidcEnv());
      const authedCookieHeader = await completeOidcLogin(app);

      const checkResponse = await app.request("/auth/check", {
        headers: {
          Cookie: authedCookieHeader,
          Origin: "https://rack.example.com",
        },
      });
      expect(checkResponse.status).toBe(204);
    } finally {
      mock.restore();
    }
  });

  // #2942: a discovery document advertising `none` (or an HS* symmetric alg)
  // must not weaken the pin. Those are stripped, leaving the RS256 fallback, so
  // an RS384 token is still rejected.
  it("ignores a discovery-advertised insecure algorithm and keeps the RS256 fallback", async () => {
    const mock = await installMockOidcFetch({
      idTokenAlgorithm: "RS384",
      idTokenIncludeJwkAlg: false,
      discoverySigningAlgs: ["none", "HS256"],
    });
    try {
      const app = await createApp(buildOidcEnv());

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
      expect(callbackResponse.headers.get("location")).toContain(
        "user_info_is_missing",
      );

      const callbackCookies = readSetCookies(callbackResponse.headers);
      expect(
        callbackCookies.some((cookie) =>
          cookie.includes("rackula_auth_session="),
        ),
      ).toBe(false);
    } finally {
      mock.restore();
    }
  });

  it("enforces fallback idle timeout based on persisted session metadata", async () => {
    const mock = await installMockOidcFetch();
    const originalNow = Date.now;
    try {
      const app = await createApp(
        buildOidcEnv({
          RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS: "60",
        }),
      );

      const authedCookieHeader = await completeOidcLogin(app);
      const baselineNow = originalNow();

      Date.now = () => baselineNow + 1_000;
      const firstCheck = await app.request("/auth/check", {
        headers: {
          Cookie: authedCookieHeader,
          Origin: "https://rack.example.com",
        },
      });
      expect(firstCheck.status).toBe(204);

      Date.now = () => baselineNow + 65_000;
      const expiredCheck = await app.request("/auth/check", {
        headers: {
          Cookie: authedCookieHeader,
          Origin: "https://rack.example.com",
        },
      });
      expect(expiredCheck.status).toBe(401);
      expect(await expiredCheck.json()).toEqual({
        error: "Unauthorized",
        message: "Authentication required.",
      });
    } finally {
      Date.now = originalNow;
      mock.restore();
    }
  });

  it("does not extend fallback idle expiry just by repeated auth checks", async () => {
    const mock = await installMockOidcFetch();
    const originalNow = Date.now;
    try {
      const app = await createApp(
        buildOidcEnv({
          RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS: "60",
        }),
      );

      const authedCookieHeader = await completeOidcLogin(app);
      const baselineNow = originalNow();

      Date.now = () => baselineNow + 1_000;
      const firstCheck = await app.request("/auth/check", {
        headers: {
          Cookie: authedCookieHeader,
          Origin: "https://rack.example.com",
        },
      });
      expect(firstCheck.status).toBe(204);

      Date.now = () => baselineNow + 20_000;
      const secondCheck = await app.request("/auth/check", {
        headers: {
          Cookie: authedCookieHeader,
          Origin: "https://rack.example.com",
        },
      });
      expect(secondCheck.status).toBe(204);

      Date.now = () => baselineNow + 65_000;
      const thirdCheck = await app.request("/auth/check", {
        headers: {
          Cookie: authedCookieHeader,
          Origin: "https://rack.example.com",
        },
      });
      expect(thirdCheck.status).toBe(401);
    } finally {
      Date.now = originalNow;
      mock.restore();
    }
  });

  it("invalidates fallback OIDC sessions on logout and blocks replay", async () => {
    const mock = await installMockOidcFetch();
    try {
      const app = await createApp(buildOidcEnv());
      const authedCookieHeader = await completeOidcLogin(app);

      const beforeLogout = await app.request("/auth/check", {
        headers: {
          Cookie: authedCookieHeader,
          Origin: "https://rack.example.com",
        },
      });
      expect(beforeLogout.status).toBe(204);

      const logoutResponse = await app.request("/auth/logout", {
        method: "POST",
        headers: {
          Cookie: authedCookieHeader,
          Origin: "https://rack.example.com",
        },
      });
      expect(logoutResponse.status).toBe(204);

      const replayResponse = await app.request("/auth/check", {
        headers: {
          Cookie: authedCookieHeader,
          Origin: "https://rack.example.com",
        },
      });
      expect(replayResponse.status).toBe(401);
    } finally {
      mock.restore();
    }
  });
});
