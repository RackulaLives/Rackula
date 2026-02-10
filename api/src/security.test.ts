import { describe, it, expect } from "bun:test";
import { createApp } from "./app";
import {
  createSignedAuthSessionToken,
  resolveApiSecurityConfig,
  verifySignedAuthSessionToken,
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
    ...overrides,
  });
}

function buildAuthCookie(subject = "admin@example.com"): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = createSignedAuthSessionToken(
    {
      sub: subject,
      iat: issuedAt,
      exp: issuedAt + 300,
    },
    TEST_AUTH_SECRET,
  );
  return `rackula_auth_session=${token}`;
}

describe("resolveApiSecurityConfig", () => {
  it("uses wildcard CORS in non-production by default", () => {
    const config = resolveApiSecurityConfig(buildEnv());
    expect(config.corsOrigin).toBe("*");
    expect(config.isProduction).toBe(false);
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

  it("requires auth session secret when auth mode is enabled", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildEnv({
          RACKULA_AUTH_MODE: "oidc",
        }),
      ),
    ).toThrow("RACKULA_AUTH_SESSION_SECRET");
  });

  it("rejects short auth session secret when auth mode is enabled", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildEnv({
          RACKULA_AUTH_MODE: "oidc",
          RACKULA_AUTH_SESSION_SECRET: "too-short",
        }),
      ),
    ).toThrow("at least 32 characters");
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
        exp: now - 30,
      },
      TEST_AUTH_SECRET,
    );

    const claims = verifySignedAuthSessionToken(token, TEST_AUTH_SECRET);
    expect(claims).toBeNull();
  });

  it("rejects stale signed tokens without exp using max-age policy", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedAuthSessionToken(
      {
        sub: "admin@example.com",
        iat: now - 86_500,
      },
      TEST_AUTH_SECRET,
    );

    const claims = verifySignedAuthSessionToken(token, TEST_AUTH_SECRET);
    expect(claims).toBeNull();
  });

  it("accepts non-expired signed auth session tokens", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedAuthSessionToken(
      {
        sub: "admin@example.com",
        iat: now,
        exp: now + 300,
      },
      TEST_AUTH_SECRET,
    );

    const claims = verifySignedAuthSessionToken(token, TEST_AUTH_SECRET);
    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe("admin@example.com");
    expect(claims?.iat).toBe(now);
    expect(claims?.exp).toBe(now + 300);
  });
});

describe("authentication gate", () => {
  it("rejects anonymous API request when auth is enabled", async () => {
    const app = createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "Authentication required.",
    });
  });

  it("redirects anonymous app routes to login when auth is enabled", async () => {
    const app = createApp(buildAuthEnabledEnv());

    const response = await app.request("/dashboard");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/auth/login?next=%2Fdashboard");
  });

  it("allows signed-session requests through the auth gate", async () => {
    const app = createApp(buildAuthEnabledEnv());

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

  it("keeps health/login/callback routes reachable when auth is enabled", async () => {
    const app = createApp(buildAuthEnabledEnv());

    const health = await app.request("/health");
    expect(health.status).toBe(200);
    expect(await health.text()).toBe("OK");

    const login = await app.request("/auth/login");
    expect(login.status).toBe(501);

    const callback = await app.request("/auth/callback");
    expect(callback.status).toBe(501);
  });

  it("returns auth check endpoint status for nginx auth_request usage", async () => {
    const app = createApp(buildAuthEnabledEnv());

    const unauthorized = await app.request("/auth/check");
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({
      error: "Unauthorized",
      message: "Authentication required.",
    });

    const authorized = await app.request("/auth/check", {
      headers: {
        Cookie: buildAuthCookie(),
      },
    });
    expect(authorized.status).toBe(204);
  });

  it("preserves existing behavior when auth mode is disabled", async () => {
    const app = createApp(buildEnv());

    const response = await app.request("/layouts/not-a-uuid");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });
});

describe("write-route authentication", () => {
  it("returns 401 for write request without token when token auth is enabled", async () => {
    const app = createApp(
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
    const app = createApp(
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
    const app = createApp(
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
    const app = createApp(
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
    const app = createApp(
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

  it("keeps read routes public when write token is enabled", async () => {
    const app = createApp(
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
    const app = createApp(
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
});

describe("CORS behavior", () => {
  it("returns configured production origin in CORS header", async () => {
    const app = createApp(
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
