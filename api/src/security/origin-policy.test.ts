import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createOriginPolicyMiddleware } from "./origin-policy";
import type { ApiSecurityConfig } from "./types";

function makeConfig(
  overrides: Partial<Pick<ApiSecurityConfig, "originPolicyEnabled" | "csrfTrustedOrigins">> = {},
): Pick<ApiSecurityConfig, "originPolicyEnabled" | "csrfTrustedOrigins"> {
  return {
    originPolicyEnabled: true,
    csrfTrustedOrigins: ["https://racku.la", "https://count.racku.la"],
    ...overrides,
  };
}

function createTestApp(config: ReturnType<typeof makeConfig>) {
  const app = new Hono();
  app.use("*", createOriginPolicyMiddleware(config));
  app.put("/layouts/:id", (c) => c.json({ ok: true }));
  app.delete("/layouts/:id", (c) => c.json({ ok: true }));
  app.post("/layouts", (c) => c.json({ ok: true }));
  app.patch("/layouts/:id", (c) => c.json({ ok: true }));
  app.get("/layouts", (c) => c.json({ ok: true }));
  return app;
}

describe("createOriginPolicyMiddleware", () => {
  // --- Skip behaviour ---

  it("skips origin checks when origin policy is disabled", async () => {
    const app = createTestApp(makeConfig({ originPolicyEnabled: false }));
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: { Origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(200);
  });

  it("skips non-mutating methods (GET)", async () => {
    const app = createTestApp(makeConfig());

    const getRes = await app.request("/layouts");
    expect(getRes.status).toBe(200);
  });

  it("allows PUT/DELETE with no Origin when Bearer token is present", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: { Authorization: "Bearer test-token" },
    });
    // No Origin header but valid auth -> allowed
    expect(res.status).toBe(200);
  });

  it("allows POST with no Origin when Bearer token is present", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    });
    expect(res.status).toBe(200);
  });

  // --- Origin validation on mutating routes ---

  it("blocks PUT with untrusted Origin", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: { Origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("blocks DELETE with untrusted Origin", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "DELETE",
      headers: { Origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(403);
  });

  it("blocks POST with untrusted Origin", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts", {
      method: "POST",
      headers: { Origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(403);
  });

  it("allows PUT with trusted Origin", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: { Origin: "https://racku.la" },
    });
    expect(res.status).toBe(200);
  });

  it("allows DELETE with trusted Origin", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "DELETE",
      headers: { Origin: "https://count.racku.la" },
    });
    expect(res.status).toBe(200);
  });

  it("allows POST with trusted Origin", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts", {
      method: "POST",
      headers: { Origin: "https://racku.la" },
    });
    expect(res.status).toBe(200);
  });

  // --- Referer fallback ---

  it("uses Referer header as fallback when Origin is absent", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: { Referer: "https://racku.la/layouts" },
    });
    expect(res.status).toBe(200);
  });

  it("blocks when Referer origin is untrusted", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: { Referer: "https://evil.example.com/page" },
    });
    expect(res.status).toBe(403);
  });

  // --- Edge cases ---

  it("treats literal 'null' Origin header as absent", async () => {
    const app = createTestApp(makeConfig());
    // "null" Origin is a known attack vector — should fall through to Referer or reject
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: { Origin: "null" },
    });
    // No Referer either, no Bearer token -> block
    expect(res.status).toBe(403);
  });

  it("blocks mutating request with no Origin, no Referer, and no Bearer token", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PUT",
    });
    expect(res.status).toBe(403);
  });

  it("allows mutating request with untrusted Origin but valid Bearer token", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: {
        Origin: "https://evil.example.com",
        Authorization: "Bearer test-token",
      },
    });
    // Bearer token overrides origin check — non-browser clients may not send Origin
    expect(res.status).toBe(200);
  });

  it("blocks PATCH requests with untrusted origin (PATCH is a state-changing method)", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PATCH",
      headers: { Origin: "https://evil.example.com" },
    });
    // PATCH is in STATE_CHANGING_METHODS, so origin policy applies
    expect(res.status).toBe(403);
  });

  it("allows PATCH requests with trusted origin", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PATCH",
      headers: { Origin: "https://racku.la" },
    });
    expect(res.status).toBe(200);
  });
});