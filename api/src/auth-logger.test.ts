import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  emitAuthEvent,
  extractRequestContext,
  logAuthEvent,
  redactHeaders,
  type AuthEvent,
} from "./auth-logger";
import { createApp } from "./app";
import {
  clearInvalidatedAuthSessions,
  createSignedAuthSessionToken,
  type AuthSessionClaimsInput,
  type EnvMap,
} from "./security";

const TEST_AUTH_SECRET = "rackula-auth-session-secret-for-tests-0123456789";

function buildEnv(overrides: EnvMap = {}): EnvMap {
  return { NODE_ENV: "test", ...overrides };
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

// Default cookie carries role: "admin" for passing authorization checks.
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

describe("redactHeaders", () => {
  it("redacts sensitive headers", () => {
    const result = redactHeaders({
      "Content-Type": "application/json",
      Authorization: "Bearer secret-token",
      Cookie: "session=abc123",
      "Set-Cookie": "session=xyz",
      "X-Forwarded-For": "192.168.1.1",
      "X-Request-Id": "req-123",
    });

    expect(result["Content-Type"]).toBe("application/json");
    expect(result["Authorization"]).toBe("[REDACTED]");
    expect(result["Cookie"]).toBe("[REDACTED]");
    expect(result["Set-Cookie"]).toBe("[REDACTED]");
    expect(result["X-Forwarded-For"]).toBe("[REDACTED]");
    expect(result["X-Request-Id"]).toBe("req-123");
  });
});

describe("extractRequestContext", () => {
  it("extracts method, path, and IP from request", () => {
    const request = new Request("https://example.com/api/layouts/abc", {
      method: "PUT",
      headers: { "X-Real-IP": "10.0.0.1" },
    });

    const ctx = extractRequestContext(request);
    expect(ctx.method).toBe("PUT");
    expect(ctx.path).toBe("/api/layouts/abc");
    expect(ctx.ip).toBe("10.0.0.1");
  });

  it("returns undefined IP when header is missing", () => {
    const request = new Request("https://example.com/health");
    const ctx = extractRequestContext(request);
    expect(ctx.ip).toBeUndefined();
  });
});

describe("emitAuthEvent", () => {
  it("writes JSON line to stdout", () => {
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);

    const event: AuthEvent = {
      timestamp: "2026-02-19T10:00:00.000Z",
      event: "auth.logout",
      subject: "user@example.com",
      method: "POST",
      path: "/auth/logout",
    };

    emitAuthEvent(event);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const output = writeSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed.event).toBe("auth.logout");
    expect(parsed.subject).toBe("user@example.com");
    expect(parsed.timestamp).toBe("2026-02-19T10:00:00.000Z");

    writeSpy.mockRestore();
  });

  it("never includes raw tokens or session IDs in output", () => {
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);

    emitAuthEvent({
      timestamp: new Date().toISOString(),
      event: "auth.session.invalid",
      reason: "expired session",
      method: "GET",
      path: "/api/layouts",
    });

    const output = writeSpy.mock.calls[0][0] as string;
    // Verify no common secret patterns leak
    expect(output).not.toContain("Bearer");
    expect(output).not.toContain("rackula_auth_session=");

    writeSpy.mockRestore();
  });
});

describe("auth event integration", () => {
  it("logs auth.session.invalid when anonymous request hits auth gate", async () => {
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const app = createApp(buildAuthEnabledEnv());

    await app.request("/api/layouts");

    const authEvents = writeSpy.mock.calls
      .map((call) => {
        try {
          return JSON.parse((call[0] as string).trim());
        } catch {
          return null;
        }
      })
      .filter((e) => e?.event?.startsWith("auth."));

    expect(authEvents.some((e) => e.event === "auth.session.invalid")).toBe(true);
    const event = authEvents.find((e) => e.event === "auth.session.invalid");
    expect(event.reason).toBe("missing or invalid session cookie");
    expect(event.path).toBe("/api/layouts");

    writeSpy.mockRestore();
  });

  it("logs auth.logout on successful logout", async () => {
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const app = createApp(buildAuthEnabledEnv());

    await app.request("/auth/logout", {
      method: "POST",
      headers: {
        Cookie: buildAuthCookie({ sid: "logout-log-session" }),
        Origin: "https://rack.example.com",
      },
    });

    const authEvents = writeSpy.mock.calls
      .map((call) => {
        try {
          return JSON.parse((call[0] as string).trim());
        } catch {
          return null;
        }
      })
      .filter((e) => e?.event?.startsWith("auth."));

    expect(authEvents.some((e) => e.event === "auth.logout")).toBe(true);
    const event = authEvents.find((e) => e.event === "auth.logout");
    expect(event.subject).toBe("admin@example.com");

    writeSpy.mockRestore();
  });

  it("logs auth.denied when non-admin attempts write", async () => {
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const app = createApp(buildAuthEnabledEnv());

    await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie({ role: "viewer", sid: "viewer-denied" }),
        Origin: "https://rack.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    const authEvents = writeSpy.mock.calls
      .map((call) => {
        try {
          return JSON.parse((call[0] as string).trim());
        } catch {
          return null;
        }
      })
      .filter((e) => e?.event?.startsWith("auth."));

    expect(authEvents.some((e) => e.event === "auth.denied")).toBe(true);
    const event = authEvents.find((e) => e.event === "auth.denied");
    expect(event.subject).toBe("admin@example.com");
    expect(event.reason).toContain("viewer");

    writeSpy.mockRestore();
  });

  it("logs auth.login.success on valid auth check", async () => {
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const app = createApp(buildAuthEnabledEnv());

    await app.request("/auth/check", {
      headers: {
        Cookie: buildAuthCookie({ sid: "check-success" }),
        Origin: "https://rack.example.com",
      },
    });

    const authEvents = writeSpy.mock.calls
      .map((call) => {
        try {
          return JSON.parse((call[0] as string).trim());
        } catch {
          return null;
        }
      })
      .filter((e) => e?.event?.startsWith("auth."));

    expect(authEvents.some((e) => e.event === "auth.login.success")).toBe(true);

    writeSpy.mockRestore();
  });

  it("logs auth.login.failure on invalid auth check", async () => {
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const app = createApp(buildAuthEnabledEnv());

    await app.request("/auth/check");

    const authEvents = writeSpy.mock.calls
      .map((call) => {
        try {
          return JSON.parse((call[0] as string).trim());
        } catch {
          return null;
        }
      })
      .filter((e) => e?.event?.startsWith("auth."));

    expect(authEvents.some((e) => e.event === "auth.login.failure")).toBe(true);

    writeSpy.mockRestore();
  });

  it("never logs raw session tokens or cookies", async () => {
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const app = createApp(buildAuthEnabledEnv());

    const cookie = buildAuthCookie({ sid: "redaction-test" });
    const tokenValue = cookie.split("=")[1];

    await app.request("/auth/logout", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "https://rack.example.com",
      },
    });

    const allOutput = writeSpy.mock.calls.map((c) => c[0] as string).join("");
    const authLines = allOutput
      .split("\n")
      .filter((line) => {
        try {
          const parsed = JSON.parse(line);
          return parsed.event?.startsWith("auth.");
        } catch {
          return false;
        }
      });

    for (const line of authLines) {
      expect(line).not.toContain(tokenValue);
      expect(line).not.toContain("rackula_auth_session=");
    }

    writeSpy.mockRestore();
  });
});
