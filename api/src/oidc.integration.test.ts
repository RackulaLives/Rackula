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

// What the mock IdP remembers from the authorization request. A real IdP binds
// the nonce it received into the ID token it issues at the token endpoint.
const mockIdpSession: { nonce?: string } = {};

async function createIdTokenSigner(
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
): Promise<{
  sign: (nonce: string | undefined) => Promise<string>;
  publicJwk: JsonWebKey;
}> {
  const algorithm = overrides.algorithm ?? "RS256";
  const { publicKey, privateKey } = await generateKeyPair(algorithm);
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "rackula-test-kid";
  if (overrides.includeJwkAlg ?? true) {
    publicJwk.alg = algorithm;
  }
  publicJwk.use = "sig";

  const sign = (nonce: string | undefined) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return new SignJWT({
      email: "admin@example.com",
      name: "Rackula Admin",
      email_verified: true,
      ...(nonce === undefined ? {} : { nonce }),
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
  };

  return { sign, publicJwk };
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
    /**
     * Overrides the nonce the mock IdP puts in the ID token, to simulate a
     * replayed or nonce-less token. `null` omits the claim.
     */
    idTokenNonce?: string | null;
    /** While true, the discovery endpoint answers 503. */
    discoveryState?: { down: boolean };
    /** The issuer the discovery document advertises. */
    discoveryIssuer?: string;
  } = {},
): Promise<{ restore: () => void }> {
  const originalFetch = globalThis.fetch;
  mockIdpSession.nonce = undefined;
  const idTokenSigner = await createIdTokenSigner({
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
      if (options.discoveryState?.down) {
        return new Response("unavailable", { status: 503 });
      }

      return new Response(
        JSON.stringify({
          issuer: options.discoveryIssuer ?? ENTRA_TENANT_ISSUER,
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
          keys: [idTokenSigner.publicJwk],
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

      const idTokenNonce =
        options.idTokenNonce === null
          ? undefined
          : (options.idTokenNonce ?? mockIdpSession.nonce);

      return new Response(
        JSON.stringify({
          access_token: "entra-access-token",
          token_type: "Bearer",
          expires_in: 3600,
          id_token: await idTokenSigner.sign(idTokenNonce),
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
  // Starts a login and plays the IdP's part of the authorization request.
  async function beginOidcLogin(
    app: Awaited<ReturnType<typeof createApp>>,
  ): Promise<{
    authorizationUrl: URL;
    state: string;
    loginCookieHeader: string;
  }> {
    const loginResponse = await app.request("/auth/login?next=%2Fdashboard");
    expect(loginResponse.status).toBe(302);

    const authorizationUrl = new URL(loginResponse.headers.get("location")!);
    const state = authorizationUrl.searchParams.get("state");
    expect(state).not.toBeNull();
    mockIdpSession.nonce =
      authorizationUrl.searchParams.get("nonce") ?? undefined;

    return {
      authorizationUrl,
      state: state!,
      loginCookieHeader: cookieHeaderFromSetCookies(
        readSetCookies(loginResponse.headers),
      ),
    };
  }

  async function completeOidcLogin(
    app: Awaited<ReturnType<typeof createApp>>,
  ): Promise<string> {
    const { state, loginCookieHeader } = await beginOidcLogin(app);

    const callbackResponse = await app.request(
      `/auth/callback?code=entra-code&state=${encodeURIComponent(state)}`,
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

  async function readAdvertisedRedirectUri(
    app: Awaited<ReturnType<typeof createApp>>,
  ): Promise<string> {
    const loginResponse = await app.request("/auth/login?next=%2Fdashboard");
    expect(loginResponse.status).toBe(302);
    const redirectUri = new URL(
      loginResponse.headers.get("location")!,
    ).searchParams.get("redirect_uri");
    expect(redirectUri).not.toBeNull();
    return redirectUri!;
  }

  // Runs the login -> callback flow and asserts the callback rejected the ID
  // token: it redirects with unable_to_get_user_info and sets no session cookie.
  // Shared by the algorithm-pinning regression tests.
  async function expectOidcLoginRejected(
    app: Awaited<ReturnType<typeof createApp>>,
  ): Promise<void> {
    const { state, loginCookieHeader } = await beginOidcLogin(app);

    const callbackResponse = await app.request(
      `/auth/callback?code=entra-code&state=${encodeURIComponent(state)}`,
      {
        headers: {
          Cookie: loginCookieHeader,
        },
      },
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toContain(
      "unable_to_get_user_info",
    );

    const callbackCookies = readSetCookies(callbackResponse.headers);
    expect(
      callbackCookies.some((cookie) =>
        cookie.includes("rackula_auth_session="),
      ),
    ).toBe(false);
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

  // #3596: the token must be verified against the issuer exactly as discovery
  // returns it. Normalising it first broke the trailing-slash and bare-host
  // shapes, including the Authentik form the deployment docs show.
  it.each([
    ["a path with no trailing slash", "https://idp.example.com/realms/rackula"],
    [
      "a path with a trailing slash",
      "https://idp.example.com/application/o/rackula/",
    ],
    ["a bare host", "https://idp.example.com"],
    ["a bare host with a trailing slash", "https://idp.example.com/"],
  ])("completes login for an issuer with %s", async (_shape, issuer) => {
    const mock = await installMockOidcFetch({
      discoveryIssuer: issuer,
      idTokenIssuer: issuer,
    });
    try {
      const app = await createApp(
        buildOidcEnv({
          RACKULA_OIDC_ISSUER: issuer,
          RACKULA_OIDC_DISCOVERY_URL: ENTRA_DISCOVERY_URL,
        }),
      );
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

  // OIDC Core 3.1.3.7: the iss claim must exactly match the discovered issuer,
  // so a token that differs only by a trailing slash is still rejected.
  it("rejects an ID token whose iss differs from discovery by a trailing slash", async () => {
    const issuer = "https://idp.example.com/application/o/rackula/";
    const mock = await installMockOidcFetch({
      discoveryIssuer: issuer,
      idTokenIssuer: "https://idp.example.com/application/o/rackula",
    });
    try {
      const app = await createApp(
        buildOidcEnv({
          RACKULA_OIDC_ISSUER: issuer,
          RACKULA_OIDC_DISCOVERY_URL: ENTRA_DISCOVERY_URL,
        }),
      );
      await expectOidcLoginRejected(app);
    } finally {
      mock.restore();
    }
  });

  it("recovers login once an IdP that was down at startup comes back", async () => {
    const discoveryState = { down: true };
    const mock = await installMockOidcFetch({ discoveryState });
    try {
      const app = await createApp(buildOidcEnv());

      const whileDown = await app.request("/auth/login?next=%2Fdashboard");
      expect(whileDown.status).toBe(502);

      discoveryState.down = false;
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

  // A rejected login lands here. If the auth gate bounced it to /auth/login, the
  // IdP would silently re-approve the user and the error would never show. The
  // bare path is what the API sees after nginx strips the /api prefix.
  it.each(["/auth/error", "/api/auth/error"])(
    "shows the rejected-login error page at %s without a session",
    async (errorPath) => {
      const mock = await installMockOidcFetch();
      try {
        const app = await createApp(buildOidcEnv());

        const response = await app.request(
          `${errorPath}?error=unable_to_get_user_info`,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("location")).toBeNull();
      } finally {
        mock.restore();
      }
    },
  );

  it("rejects callback when token audience does not match client id", async () => {
    const mock = await installMockOidcFetch({
      idTokenAudience: "wrong-client-id",
    });
    try {
      const app = await createApp(buildOidcEnv());

      await expectOidcLoginRejected(app);
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
      await expectOidcLoginRejected(app);
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

  // #2942: unknown names are ignored as long as discovery also advertises a
  // usable algorithm, so a valid RS256 token still verifies and login succeeds.
  it("accepts a token signed with an advertised algorithm listed beside an unknown one", async () => {
    const mock = await installMockOidcFetch({
      idTokenAlgorithm: "RS256",
      idTokenIncludeJwkAlg: false,
      discoverySigningAlgs: ["FOO256", "RS256"],
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

  // Better Auth verifies the token against the advertised list before Rackula's
  // resolver runs, so a provider advertising nothing usable fails closed.
  it("rejects login when discovery advertises only an unknown algorithm", async () => {
    const mock = await installMockOidcFetch({
      idTokenAlgorithm: "RS256",
      idTokenIncludeJwkAlg: false,
      discoverySigningAlgs: ["FOO256"],
    });
    try {
      const app = await createApp(buildOidcEnv());
      await expectOidcLoginRejected(app);
    } finally {
      mock.restore();
    }
  });

  it("rejects an ID token carrying a nonce from another login", async () => {
    const mock = await installMockOidcFetch({
      idTokenNonce: "nonce-from-another-login",
    });
    try {
      const app = await createApp(buildOidcEnv());
      await expectOidcLoginRejected(app);
    } finally {
      mock.restore();
    }
  });

  it("rejects an ID token with no nonce", async () => {
    const mock = await installMockOidcFetch({ idTokenNonce: null });
    try {
      const app = await createApp(buildOidcEnv());
      await expectOidcLoginRejected(app);
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
      await expectOidcLoginRejected(app);
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
  it("advertises the documented default callback URI when RACKULA_OIDC_REDIRECT_URI is unset", async () => {
    const mock = await installMockOidcFetch();
    try {
      const app = await createApp(
        buildOidcEnv({ RACKULA_OIDC_REDIRECT_URI: undefined }),
      );
      const redirectUri = await readAdvertisedRedirectUri(app);

      expect(redirectUri).toBe("https://rack.example.com/auth/callback");
      // Better Auth's own default is ${baseURL}/api/auth/callback/oidc, a path
      // the auth gate blocks (#3140).
      expect(redirectUri).not.toContain("/callback/");
    } finally {
      mock.restore();
    }
  });

  it("completes the OIDC flow at the callback URI it advertised when RACKULA_OIDC_REDIRECT_URI is unset", async () => {
    const mock = await installMockOidcFetch();
    try {
      const app = await createApp(
        buildOidcEnv({ RACKULA_OIDC_REDIRECT_URI: undefined }),
      );

      const { authorizationUrl, state, loginCookieHeader } =
        await beginOidcLogin(app);

      // Follow the redirect URI Rackula actually handed the IdP, the way a
      // browser would, instead of assuming a callback path. Hardcoding
      // "/auth/callback" here is what hid #3140 from this suite.
      const advertisedPath = new URL(
        authorizationUrl.searchParams.get("redirect_uri")!,
      ).pathname;
      const callbackResponse = await app.request(
        `${advertisedPath}?code=entra-code&state=${encodeURIComponent(state)}`,
        {
          headers: {
            Cookie: loginCookieHeader,
          },
        },
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).not.toContain(
        "/auth/login",
      );
      expect(
        readSetCookies(callbackResponse.headers).some((cookie) =>
          cookie.includes("rackula_auth_session="),
        ),
      ).toBe(true);
    } finally {
      mock.restore();
    }
  });

  it("strips a trailing slash from RACKULA_BASE_URL when deriving the callback URI", async () => {
    const mock = await installMockOidcFetch();
    try {
      const app = await createApp(
        buildOidcEnv({
          RACKULA_BASE_URL: "https://rack.example.com/",
          RACKULA_OIDC_REDIRECT_URI: undefined,
        }),
      );

      expect(await readAdvertisedRedirectUri(app)).toBe(
        "https://rack.example.com/auth/callback",
      );
    } finally {
      mock.restore();
    }
  });

  it("keeps an explicit RACKULA_OIDC_REDIRECT_URI authoritative", async () => {
    const mock = await installMockOidcFetch();
    try {
      const app = await createApp(
        buildOidcEnv({
          // A served path that differs from the derived default, so this asserts
          // precedence without implying arbitrary paths are routable.
          RACKULA_OIDC_REDIRECT_URI:
            "https://rack.example.com/api/auth/callback",
        }),
      );

      expect(await readAdvertisedRedirectUri(app)).toBe(
        "https://rack.example.com/api/auth/callback",
      );
    } finally {
      mock.restore();
    }
  });

  // The bare path is what the API sees after nginx strips the /api prefix
  // (deploy/nginx.conf.template:216).
  it.each(["/auth/oauth2/callback/oidc", "/api/auth/oauth2/callback/oidc"])(
    "completes login on the pre-1.7 Better Auth callback path %s",
    async (callbackPath) => {
      const mock = await installMockOidcFetch();
      try {
        const app = await createApp(
          buildOidcEnv({
            RACKULA_OIDC_REDIRECT_URI:
              "https://rack.example.com/api/auth/oauth2/callback/oidc",
          }),
        );

        const { state, loginCookieHeader } = await beginOidcLogin(app);

        const callbackResponse = await app.request(
          `${callbackPath}?code=entra-code&state=${encodeURIComponent(state)}`,
          {
            headers: {
              Cookie: loginCookieHeader,
            },
          },
        );

        expect(callbackResponse.status).toBe(302);
        expect(callbackResponse.headers.get("location")).not.toContain(
          "/auth/login",
        );
        expect(
          readSetCookies(callbackResponse.headers).some((cookie) =>
            cookie.includes("rackula_auth_session="),
          ),
        ).toBe(true);
      } finally {
        mock.restore();
      }
    },
  );
});
