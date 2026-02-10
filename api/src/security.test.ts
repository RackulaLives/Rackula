import { describe, it, expect } from "bun:test";
import { createApp } from "./app";
import { resolveApiSecurityConfig, type EnvMap } from "./security";

const TEST_TOKEN = "test-write-token";

function buildEnv(overrides: EnvMap = {}): EnvMap {
  return {
    NODE_ENV: "test",
    ...overrides,
  };
}

describe("resolveApiSecurityConfig", () => {
  it("uses wildcard CORS in non-production by default", () => {
    const config = resolveApiSecurityConfig(buildEnv());
    expect(config.corsOrigin).toBe("*");
    expect(config.isProduction).toBe(false);
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
      message: "Malformed Authorization header. Expected format: Bearer <token>.",
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
