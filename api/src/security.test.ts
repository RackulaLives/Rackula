import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createHmac } from "node:crypto";
import { createApp } from "./app";
import {
  clearInvalidatedAuthSessions,
  createSignedAuthSessionToken,
  createWriteAuthMiddleware,
  invalidateAuthSession,
  resolveApiSecurityConfig,
  verifySignedAuthSessionToken,
  type AuthSessionClaimsInput,
  type EnvMap,
} from "./security";

const TEST_TOKEN = "test-write-token";
const TEST_AUTH_SECRET = "rackula-auth-session-secret-for-tests-0123456789";

function buildEnv(overrides: EnvMap = {}): EnvMap {
  return {
    NODE_ENV: "test",
    ...overrides,
  };
}

function buildAuthEnabledEnv(overrides: EnvMap = {}): EnvMap {
  return buildEnv({
    RACKULA_AUTH_MODE: "oidc",
    RACKULA_AUTH_SESSION_SECRET: TEST_AUTH_SECRET,
    CORS_ORIGIN: "https://rack.example.com",
    RACKULA_AUTH_SESSION_MAX_AGE_SECONDS: "3600",
    RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS: "300",
    ...overrides,
  });
}

// Default cookie carries role: "admin" so existing integration tests covering
// the auth gate and CSRF layer also pass the admin authorization check on write
// routes. Override role explicitly when testing non-admin behaviour.
function buildAuthCookie(
  overrides: Partial<AuthSessionClaimsInput> = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const token = createSignedAuthSessionToken(
    {
      sub: "admin@example.com",
      sid: "session-default",
      role: "admin",
      iat: now - 30,
      exp: now + 600,
      idleExp: now + 120,
      generation: 0,
      ...overrides,
    },
    TEST_AUTH_SECRET,
    {
      sessionMaxAgeSeconds: 3600,
      sessionIdleTimeoutSeconds: 300,
      sessionGeneration: 0,
    },
  );

  return `rackula_auth_session=${token}`;
}

beforeEach(() => {
  clearInvalidatedAuthSessions();
});

describe("resolveApiSecurityConfig", () => {
  it("uses wildcard CORS in non-production by default", () => {
    const config = resolveApiSecurityConfig(buildEnv());
    expect(config.corsOrigin).toBe("*");
    expect(config.isProduction).toBe(false);
    expect(config.authMode).toBe("none");
    expect(config.authEnabled).toBe(false);
  });

  it("treats blank auth mode as none", () => {
    const config = resolveApiSecurityConfig(
      buildEnv({
        RACKULA_AUTH_MODE: "   ",
      }),
    );

    expect(config.authMode).toBe("none");
    expect(config.authEnabled).toBe(false);
  });

  it("rejects invalid auth mode", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildEnv({
          RACKULA_AUTH_MODE: "jwt",
        }),
      ),
    ).toThrow("Invalid auth mode");
  });

  it("requires auth session secret and references RACKULA_AUTH_MODE when auth is enabled", () => {
    const run = () =>
      resolveApiSecurityConfig(
        buildEnv({
          RACKULA_AUTH_MODE: "oidc",
          CORS_ORIGIN: "https://rack.example.com",
        }),
      );

    expect(run).toThrow(
      /(?=.*RACKULA_AUTH_SESSION_SECRET)(?=.*RACKULA_AUTH_MODE is enabled)/,
    );
  });

  it("rejects short auth session secret when auth mode is enabled", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildEnv({
          RACKULA_AUTH_MODE: "oidc",
          CORS_ORIGIN: "https://rack.example.com",
          RACKULA_AUTH_SESSION_SECRET: "too-short",
        }),
      ),
    ).toThrow("at least 32 characters");
  });

  it("rejects auth-enabled CSRF enforcement with wildcard CORS", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildEnv({
          RACKULA_AUTH_MODE: "oidc",
          RACKULA_AUTH_SESSION_SECRET: TEST_AUTH_SECRET,
          CORS_ORIGIN: "*",
        }),
      ),
    ).toThrow("requires explicit CORS_ORIGIN");
  });

  it("rejects idle timeout values above max session age", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildAuthEnabledEnv({
          RACKULA_AUTH_SESSION_MAX_AGE_SECONDS: "300",
          RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS: "301",
        }),
      ),
    ).toThrow("RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS must be <= 300");
  });

  it("rejects malformed session timeout values with trailing characters", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildAuthEnabledEnv({
          RACKULA_AUTH_SESSION_MAX_AGE_SECONDS: "300s",
        }),
      ),
    ).toThrow("RACKULA_AUTH_SESSION_MAX_AGE_SECONDS must be an integer >= 60");
  });

  it("rejects malformed session generation values with trailing characters", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildAuthEnabledEnv({
          RACKULA_AUTH_SESSION_GENERATION: "0abc",
        }),
      ),
    ).toThrow("RACKULA_AUTH_SESSION_GENERATION must be an integer >= 0");
  });

  it("rejects auth login paths that begin with double slash", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildAuthEnabledEnv({
          RACKULA_AUTH_LOGIN_PATH: "//evil.example.com/login",
        }),
      ),
    ).toThrow("External URLs are not allowed");
  });

  it("rejects SameSite=None without Secure cookie flag", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildAuthEnabledEnv({
          RACKULA_AUTH_SESSION_COOKIE_SAMESITE: "None",
          RACKULA_AUTH_SESSION_COOKIE_SECURE: "false",
        }),
      ),
    ).toThrow("SAMESITE=None requires");
  });

  it("defaults auth cookies to secure in production", () => {
    const config = resolveApiSecurityConfig(
      buildAuthEnabledEnv({
        NODE_ENV: "production",
      }),
    );

    expect(config.authSessionCookieSecure).toBe(true);
    expect(config.authSessionCookieSameSite).toBe("Lax");
    expect(config.csrfTrustedOrigins).toEqual(["https://rack.example.com"]);
  });

  it("derives auth log hash key from auth session secret by default", () => {
    const first = resolveApiSecurityConfig(buildAuthEnabledEnv());
    const second = resolveApiSecurityConfig(buildAuthEnabledEnv());
    expect(first.authLogHashKey).toBe(second.authLogHashKey);
    expect(first.authLogHashKey).toMatch(/^[a-f0-9]{64}$/);
    expect(first.authLogHashKey).not.toBe(TEST_AUTH_SECRET);
  });

  it("accepts explicit auth log hash key override", () => {
    const config = resolveApiSecurityConfig(
      buildAuthEnabledEnv({
        RACKULA_AUTH_LOG_HASH_KEY: "rackula-auth-log-key-override",
      }),
    );

    expect(config.authLogHashKey).toBe("rackula-auth-log-key-override");
  });

  it("rejects short auth log hash key overrides", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildAuthEnabledEnv({
          RACKULA_AUTH_LOG_HASH_KEY: "too-short",
        }),
      ),
    ).toThrow("RACKULA_AUTH_LOG_HASH_KEY must be at least 16 characters.");
  });

  it("generates ephemeral auth log hash keys without configured secrets", () => {
    const first = resolveApiSecurityConfig(buildEnv());
    const second = resolveApiSecurityConfig(buildEnv());

    expect(first.authLogHashKey).toMatch(/^[a-f0-9]{64}$/);
    expect(second.authLogHashKey).toMatch(/^[a-f0-9]{64}$/);
    expect(first.authLogHashKey).not.toBe(second.authLogHashKey);
  });

  it("rejects production startup when CORS_ORIGIN is missing", () => {
    expect(() =>
      resolveApiSecurityConfig(buildEnv({ NODE_ENV: "production" })),
    ).toThrow("CORS_ORIGIN");
  });

  it("rejects wildcard CORS in production unless insecure mode is explicit", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildEnv({
          NODE_ENV: "production",
          CORS_ORIGIN: "*",
        }),
      ),
    ).toThrow("ALLOW_INSECURE_CORS=true");
  });

  it("allows wildcard CORS in production only with explicit insecure opt-in", () => {
    const config = resolveApiSecurityConfig(
      buildEnv({
        NODE_ENV: "production",
        ALLOW_INSECURE_CORS: "true",
      }),
    );
    expect(config.corsOrigin).toBe("*");
  });

  it("accepts explicit production origins", () => {
    const config = resolveApiSecurityConfig(
      buildEnv({
        NODE_ENV: "production",
        CORS_ORIGIN: "https://rack.example.com",
      }),
    );
    expect(config.corsOrigin).toBe("https://rack.example.com");
  });
});

describe("signed session tokens", () => {
  it("rejects oversized token payloads before parsing", () => {
    const oversized = "a".repeat(8193);
    const claims = verifySignedAuthSessionToken(oversized, TEST_AUTH_SECRET);
    expect(claims).toBeNull();
  });

  it("rejects expired signed auth session tokens", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedAuthSessionToken(
      {
        sub: "admin@example.com",
        sid: "expired-session",
        iat: now - 120,
        exp: now - 30,
        idleExp: now - 30,
      },
      TEST_AUTH_SECRET,
    );

    const claims = verifySignedAuthSessionToken(token, TEST_AUTH_SECRET);
    expect(claims).toBeNull();
  });

  it("rejects tokens when idle timeout has elapsed", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedAuthSessionToken(
      {
        sub: "admin@example.com",
        sid: "idle-expired-session",
        iat: now - 120,
        exp: now + 120,
        idleExp: now - 1,
      },
      TEST_AUTH_SECRET,
    );

    const claims = verifySignedAuthSessionToken(token, TEST_AUTH_SECRET);
    expect(claims).toBeNull();
  });

  it("rejects tokens from older session generation", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedAuthSessionToken(
      {
        sub: "admin@example.com",
        sid: "generation-session",
        iat: now,
        exp: now + 300,
        idleExp: now + 120,
        generation: 0,
      },
      TEST_AUTH_SECRET,
    );

    const claims = verifySignedAuthSessionToken(token, TEST_AUTH_SECRET, {
      expectedGeneration: 1,
    });
    expect(claims).toBeNull();
  });

  it("rejects tokens invalidated by logout/session revocation", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedAuthSessionToken(
      {
        sub: "admin@example.com",
        sid: "revoked-session",
        iat: now,
        exp: now + 300,
        idleExp: now + 120,
      },
      TEST_AUTH_SECRET,
    );

    const beforeRevocation = verifySignedAuthSessionToken(
      token,
      TEST_AUTH_SECRET,
    );
    expect(beforeRevocation).not.toBeNull();

    invalidateAuthSession("revoked-session", now + 300);

    const afterRevocation = verifySignedAuthSessionToken(
      token,
      TEST_AUTH_SECRET,
    );
    expect(afterRevocation).toBeNull();
  });

  it("rejects tokens signed without the session signature context prefix", () => {
    const now = Math.floor(Date.now() / 1000);
    const payloadPart = Buffer.from(
      JSON.stringify({
        v: 2,
        sub: "admin@example.com",
        sid: "legacy-signature-session",
        iat: now - 30,
        exp: now + 300,
        idleExp: now + 120,
        generation: 0,
      }),
      "utf-8",
    ).toString("base64url");
    const legacySignature = createHmac("sha256", TEST_AUTH_SECRET)
      .update(payloadPart)
      .digest("base64url");
    const token = `${payloadPart}.${legacySignature}`;

    const claims = verifySignedAuthSessionToken(token, TEST_AUTH_SECRET, {
      expectedGeneration: 0,
      maxSessionMaxAgeSeconds: 3600,
      nowSeconds: now,
    });

    expect(claims).toBeNull();
  });

  it("accepts non-expired signed auth session tokens", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedAuthSessionToken(
      {
        sub: "admin@example.com",
        sid: "valid-session",
        iat: now,
        exp: now + 300,
        idleExp: now + 120,
        generation: 2,
      },
      TEST_AUTH_SECRET,
    );

    const claims = verifySignedAuthSessionToken(token, TEST_AUTH_SECRET, {
      expectedGeneration: 2,
      maxSessionMaxAgeSeconds: 3600,
    });

    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe("admin@example.com");
    expect(claims?.sid).toBe("valid-session");
    expect(claims?.generation).toBe(2);
  });
});

describe("authentication gate", () => {
  it("rejects anonymous API request when auth is enabled", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "Authentication required.",
    });
  });

  it("redirects anonymous app routes to login when auth is enabled", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/dashboard");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/auth/login?next=%2Fdashboard",
    );
  });

  it("normalizes leading slashes in redirect next path", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request(
      "https://rack.example.com//dashboard?tab=1",
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/auth/login?next=%2Fdashboard%3Ftab%3D1",
    );
  });

  it("allows signed-session requests through the auth gate", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      headers: {
        Cookie: buildAuthCookie(),
      },
    });

    // Auth gate passed; route-level UUID validation should run.
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });

  it("accepts quoted auth session cookie values", async () => {
    const app = await createApp(buildAuthEnabledEnv());
    const cookie = buildAuthCookie({ sid: "quoted-cookie-session" });
    const separatorIndex = cookie.indexOf("=");
    const cookieName = cookie.slice(0, separatorIndex);
    const cookieValue = cookie.slice(separatorIndex + 1);

    const response = await app.request("/layouts/not-a-uuid", {
      headers: {
        Cookie: `${cookieName}="${cookieValue}"`,
      },
    });

    // Auth gate passed; route-level UUID validation should run.
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });

  it("keeps health/login/callback routes reachable when auth is enabled", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const health = await app.request("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, status: "ok" });

    const login = await app.request("/auth/login");
    expect(login.status).toBe(501);

    const callback = await app.request("/auth/callback");
    expect(callback.status).toBe(501);
  });

  it("refreshes auth cookies with secure defaults on auth check", async () => {
    const app = await createApp(
      buildAuthEnabledEnv({
        NODE_ENV: "production",
        RACKULA_AUTH_SESSION_MAX_AGE_SECONDS: "1800",
        RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS: "120",
      }),
    );

    const now = Math.floor(Date.now() / 1000);
    const cookie = buildAuthCookie({
      sid: "refresh-session",
      iat: now - 300,
      exp: now + 600,
      idleExp: now + 10,
    });

    const response = await app.request("/auth/check", {
      headers: {
        Cookie: cookie,
        Origin: "https://rack.example.com",
      },
    });

    expect(response.status).toBe(204);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("invalidates sessions on logout and rejects replayed cookies", async () => {
    const app = await createApp(buildAuthEnabledEnv());
    const cookie = buildAuthCookie({ sid: "logout-session" });

    const authorizedBeforeLogout = await app.request("/auth/check", {
      headers: {
        Cookie: cookie,
        Origin: "https://rack.example.com",
      },
    });
    expect(authorizedBeforeLogout.status).toBe(204);

    const logout = await app.request("/auth/logout", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "https://rack.example.com",
      },
    });

    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

    const replay = await app.request("/auth/check", {
      headers: {
        Cookie: cookie,
        Origin: "https://rack.example.com",
      },
    });

    expect(replay.status).toBe(401);
  });

  it("preserves existing behavior when auth mode is disabled", async () => {
    const app = await createApp(buildEnv());

    const response = await app.request("/layouts/not-a-uuid");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });
});

describe("csrf protection", () => {
  it("rejects state-changing session requests without origin headers", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie({ sid: "csrf-missing-origin" }),
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "CSRF validation failed: missing Origin or Referer header.",
    });
  });

  it("rejects state-changing session requests from untrusted origins", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie({ sid: "csrf-bad-origin" }),
        Origin: "https://evil.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "CSRF validation failed: request origin is not allowed.",
    });
  });

  it("rejects logout requests without origin headers", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/auth/logout", {
      method: "POST",
      headers: {
        Cookie: buildAuthCookie({ sid: "csrf-logout-missing-origin" }),
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "CSRF validation failed: missing Origin or Referer header.",
    });
  });

  it("allows trusted-origin authenticated writes to continue", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie({ sid: "csrf-good-origin" }),
        Origin: "https://rack.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    // CSRF + auth passed; route-level UUID validation should run.
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });
});

describe("write-route authentication", () => {
  it("returns 401 for write request without token when token auth is enabled", async () => {
    const app = await createApp(
      buildEnv({
        CORS_ORIGIN: "https://rack.example.com",
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: "version: 1.0.0",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message:
        "Missing write auth token. Provide Authorization: Bearer <token>.",
    });
  });

  it("returns 403 for write request with wrong token", async () => {
    const app = await createApp(
      buildEnv({
        CORS_ORIGIN: "https://rack.example.com",
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const response = await app.request("/assets/bad-layout/device/front", {
      method: "DELETE",
      headers: { Authorization: "Bearer wrong-token" },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "Invalid write auth token.",
    });
  });

  it("returns 401 for malformed Authorization header on write route", async () => {
    const app = await createApp(
      buildEnv({
        CORS_ORIGIN: "https://rack.example.com",
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain",
        Authorization: "Basic some-token",
      },
      body: "version: 1.0.0",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message:
        "Malformed Authorization header. Expected format: Bearer <token>.",
    });
  });

  it("returns 401 for asset PUT without token when token auth is enabled", async () => {
    const app = await createApp(
      buildEnv({
        CORS_ORIGIN: "https://rack.example.com",
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const response = await app.request("/assets/bad-layout/device/front", {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
      },
      body: new Uint8Array([1, 2, 3]),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message:
        "Missing write auth token. Provide Authorization: Bearer <token>.",
    });
  });

  it("allows authorized write request to reach route validation", async () => {
    const app = await createApp(
      buildEnv({
        CORS_ORIGIN: "https://rack.example.com",
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const response = await app.request("/layouts/not-a-uuid", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    // Auth passed; route-level UUID validation should run.
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });

  it("requires write token in auth-enabled mode when configured", async () => {
    const app = await createApp(
      buildAuthEnabledEnv({
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const withoutToken = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie({ sid: "write-auth-session" }),
        Origin: "https://rack.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    expect(withoutToken.status).toBe(401);

    const withToken = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie({ sid: "write-auth-session-2" }),
        Origin: "https://rack.example.com",
        Authorization: `Bearer ${TEST_TOKEN}`,
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    expect(withToken.status).toBe(400);
    expect(await withToken.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });

  it("keeps read routes public when write token is enabled", async () => {
    const app = await createApp(
      buildEnv({
        CORS_ORIGIN: "https://rack.example.com",
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const response = await app.request("/layouts/not-a-uuid");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });

  it("keeps local dev write workflow working without token", async () => {
    const app = await createApp(
      buildEnv({
        NODE_ENV: "development",
      }),
    );

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: "version: 1.0.0",
    });

    // No token configured in dev: request reaches route handler.
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });

  it("propagates async next() for authorized write requests", async () => {
    const app = new Hono();
    app.use("/protected/*", createWriteAuthMiddleware(TEST_TOKEN));
    app.put("/protected/check", async (c) => {
      await Promise.resolve();
      return c.json({ ok: true }, 200);
    });

    const response = await app.request("/protected/check", {
      method: "PUT",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("CORS behavior", () => {
  it("returns configured production origin in CORS header", async () => {
    const app = await createApp(
      buildEnv({
        NODE_ENV: "production",
        CORS_ORIGIN: "https://rack.example.com",
      }),
    );

    const response = await app.request("/health", {
      method: "GET",
      headers: {
        Origin: "https://rack.example.com",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://rack.example.com",
    );
  });
});

describe("health endpoints", () => {
  it("returns structured JSON payload for both health routes", async () => {
    const app = await createApp(buildEnv());
    const assertHealthPayload = (payload: unknown): void => {
      expect(payload).toMatchObject({ ok: true, status: "ok" });
      expect(payload).toEqual(
        expect.objectContaining({
          service: expect.any(String),
          version: expect.any(Number),
        }),
      );
      expect((payload as { service: string }).service.length).toBeGreaterThan(
        0,
      );
    };

    const rootHealth = await app.request("/health");
    expect(rootHealth.status).toBe(200);
    expect(rootHealth.headers.get("content-type")).toContain(
      "application/json",
    );
    assertHealthPayload(await rootHealth.json());

    const apiHealth = await app.request("/api/health");
    expect(apiHealth.status).toBe(200);
    expect(apiHealth.headers.get("content-type")).toContain("application/json");
    assertHealthPayload(await apiHealth.json());
  });
});

describe("authorization", () => {
  it("allows admin to write layouts", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie(),
        Origin: "https://rack.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    // Admin passes auth gate and authorization; hits route-level UUID validation
    expect(response.status).toBe(400);
  });

  it("returns 403 for authenticated non-admin on write", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie({ role: "viewer", sid: "viewer-session" }),
        Origin: "https://rack.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "Admin role required.",
    });
  });

  it("returns 403 for authenticated user with no role on write", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/assets/bad-layout/device/front", {
      method: "DELETE",
      headers: {
        Cookie: buildAuthCookie({ role: undefined, sid: "no-role-session" }),
        Origin: "https://rack.example.com",
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "Admin role required.",
    });
  });

  it("allows non-admin to read when auth is enabled", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      headers: {
        Cookie: buildAuthCookie({ role: "viewer", sid: "viewer-read" }),
      },
    });

    // Auth gate passes, authorization skips for GET, hits route validation
    expect(response.status).toBe(400);
  });

  it("returns 401 for unauthenticated write when auth is enabled", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Origin: "https://rack.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    // Auth gate blocks before authorization runs
    expect(response.status).toBe(401);
  });

  it("skips authorization when auth is disabled", async () => {
    const app = await createApp(
      buildEnv({ RACKULA_API_WRITE_TOKEN: TEST_TOKEN }),
    );

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    // No auth gate, no admin check, hits route validation
    expect(response.status).toBe(400);
  });

  it("writeAuth accepts token but requireAdmin blocks non-admin", async () => {
    const app = await createApp(
      buildAuthEnabledEnv({ RACKULA_API_WRITE_TOKEN: TEST_TOKEN }),
    );

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        Cookie: buildAuthCookie({
          role: "viewer",
          sid: "non-admin-token-session",
        }),
        Origin: "https://rack.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    // writeAuth passes (valid token), requireAdmin rejects (not admin)
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "Admin role required.",
    });
  });
});
