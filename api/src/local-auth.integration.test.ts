import { afterEach, describe, expect, it } from "bun:test";
import { createApp } from "./app";
import { clearInvalidatedAuthSessions, type EnvMap } from "./security";

const TEST_AUTH_SECRET = "rackula-auth-session-secret-for-tests-0123456789";
const TEST_LOCAL_PASSWORD = "secure-password-12chars-min";

function buildLocalEnv(overrides: EnvMap = {}): EnvMap {
  return {
    NODE_ENV: "test",
    RACKULA_AUTH_MODE: "local",
    RACKULA_AUTH_SESSION_SECRET: TEST_AUTH_SECRET,
    CORS_ORIGIN: "https://rack.example.com",
    RACKULA_LOCAL_USERNAME: "admin",
    RACKULA_LOCAL_PASSWORD: TEST_LOCAL_PASSWORD,
    RACKULA_AUTH_SESSION_MAX_AGE_SECONDS: "3600",
    RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS: "300",
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

afterEach(() => {
  clearInvalidatedAuthSessions();
});

describe("POST /api/auth/login", () => {
  it("returns 200 and sets session cookie for valid credentials", async () => {
    const app = await createApp(buildLocalEnv());
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "10.0.0.1",
      },
      body: JSON.stringify({
        username: "admin",
        password: TEST_LOCAL_PASSWORD,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const cookies = readSetCookies(res.headers);
    const sessionCookie = cookies.find((c) =>
      c.startsWith("rackula_auth_session="),
    );
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=");
  });

  it("returns 401 for invalid password", async () => {
    const app = await createApp(buildLocalEnv());
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "10.0.0.2",
      },
      body: JSON.stringify({
        username: "admin",
        password: "wrong-password-1234",
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toBe("Invalid username or password.");
  });

  it("returns 401 for invalid username", async () => {
    const app = await createApp(buildLocalEnv());
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "10.0.0.3",
      },
      body: JSON.stringify({
        username: "notadmin",
        password: TEST_LOCAL_PASSWORD,
      }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 400 for missing fields", async () => {
    const app = await createApp(buildLocalEnv());
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "10.0.0.4",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("required");
  });

  it("returns 400 for non-JSON content-type", async () => {
    const app = await createApp(buildLocalEnv());
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "x-real-ip": "10.0.0.5",
      },
      body: "username=admin&password=test",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("application/json");
  });

  it("returns 400 for invalid JSON body", async () => {
    const app = await createApp(buildLocalEnv());
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "10.0.0.6",
      },
      body: "{not valid json",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("Invalid JSON");
  });

  it("returns 400 for username exceeding 255 chars", async () => {
    const app = await createApp(buildLocalEnv());
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "10.0.0.7",
      },
      body: JSON.stringify({
        username: "a".repeat(256),
        password: TEST_LOCAL_PASSWORD,
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for password exceeding 1024 chars", async () => {
    const app = await createApp(buildLocalEnv());
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "10.0.0.8",
      },
      body: JSON.stringify({
        username: "admin",
        password: "a".repeat(1025),
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe("rate limiting", () => {
  it("returns 429 with Retry-After after 5 failed attempts", async () => {
    const app = await createApp(buildLocalEnv());
    const ip = "10.99.0.1";

    // Exhaust rate limit with 5 failures
    for (let i = 0; i < 5; i++) {
      await app.request("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-real-ip": ip,
        },
        body: JSON.stringify({
          username: "admin",
          password: "wrong-password-1234",
        }),
      });
    }

    // 6th attempt should be rate limited
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": ip,
      },
      body: JSON.stringify({
        username: "admin",
        password: TEST_LOCAL_PASSWORD,
      }),
    });

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeDefined();
    const body = await res.json();
    expect(body.message).toContain("Too many");
  });
});

describe("session validation", () => {
  it("auth check returns 204 with valid session cookie from login", async () => {
    const app = await createApp(buildLocalEnv());

    // Login to get session cookie
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "10.0.1.1",
      },
      body: JSON.stringify({
        username: "admin",
        password: TEST_LOCAL_PASSWORD,
      }),
    });
    expect(loginRes.status).toBe(200);

    const setCookies = readSetCookies(loginRes.headers);
    const cookieHeader = cookieHeaderFromSetCookies(setCookies);

    // Use session cookie to check auth
    const checkRes = await app.request("/auth/check", {
      method: "GET",
      headers: { Cookie: cookieHeader },
    });
    expect(checkRes.status).toBe(204);
  });

  it("auth check returns 401 without session cookie", async () => {
    const app = await createApp(buildLocalEnv());
    const checkRes = await app.request("/auth/check", {
      method: "GET",
    });
    expect(checkRes.status).toBe(401);
  });
});

describe("logout", () => {
  it("returns 204 and expires session cookie", async () => {
    const app = await createApp(buildLocalEnv());

    // Login first
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "10.0.2.1",
      },
      body: JSON.stringify({
        username: "admin",
        password: TEST_LOCAL_PASSWORD,
      }),
    });
    const setCookies = readSetCookies(loginRes.headers);
    const cookieHeader = cookieHeaderFromSetCookies(setCookies);

    // Logout (Origin header required to pass CSRF check)
    const logoutRes = await app.request("/auth/logout", {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
        Origin: "https://rack.example.com",
      },
    });
    expect(logoutRes.status).toBe(204);

    // Verify expired cookie is set
    const logoutCookies = readSetCookies(logoutRes.headers);
    const expiredCookie = logoutCookies.find((c) =>
      c.includes("rackula_auth_session="),
    );
    expect(expiredCookie).toBeDefined();
    expect(expiredCookie).toContain("Max-Age=0");
  });

  it("session is invalid after logout", async () => {
    const app = await createApp(buildLocalEnv());

    // Login
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "10.0.2.2",
      },
      body: JSON.stringify({
        username: "admin",
        password: TEST_LOCAL_PASSWORD,
      }),
    });
    const setCookies = readSetCookies(loginRes.headers);
    const cookieHeader = cookieHeaderFromSetCookies(setCookies);

    // Logout (Origin header required to pass CSRF check)
    await app.request("/auth/logout", {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
        Origin: "https://rack.example.com",
      },
    });

    // Auth check with old cookie should fail
    const checkRes = await app.request("/auth/check", {
      method: "GET",
      headers: { Cookie: cookieHeader },
    });
    expect(checkRes.status).toBe(401);
  });
});

describe("GET /auth/login in local mode", () => {
  it("returns 501 fallback", async () => {
    const app = await createApp(buildLocalEnv());
    const res = await app.request("/auth/login", { method: "GET" });
    expect(res.status).toBe(501);
  });
});

describe("GET /auth/callback in local mode", () => {
  it("returns 404", async () => {
    const app = await createApp(buildLocalEnv());
    const res = await app.request("/auth/callback", { method: "GET" });
    expect(res.status).toBe(404);
  });
});
