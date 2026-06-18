import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createOriginPolicyMiddleware } from "./origin-policy";
import type { ApiSecurityConfig } from "./types";

const TEST_WRITE_TOKEN = "test-secret-token-32chars-long!!";

function makeConfig(
  overrides: Partial<
    Pick<
      ApiSecurityConfig,
      "originPolicyEnabled" | "csrfTrustedOrigins" | "writeAuthToken"
    >
  > = {},
): Pick<
  ApiSecurityConfig,
  "originPolicyEnabled" | "csrfTrustedOrigins" | "writeAuthToken"
> {
  return {
    originPolicyEnabled: true,
    csrfTrustedOrigins: ["https://racku.la", "https://count.racku.la"],
    writeAuthToken: TEST_WRITE_TOKEN,
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

  it("allows PUT/DELETE with no Origin when valid Bearer token is present", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: { Authorization: `Bearer ${TEST_WRITE_TOKEN}` },
    });
    // No Origin header but valid auth -> allowed
    expect(res.status).toBe(200);
  });

  it("allows POST with no Origin when valid Bearer token is present", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts", {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_WRITE_TOKEN}` },
    });
    expect(res.status).toBe(200);
  });

  it("blocks PUT with invalid Bearer token", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: { Authorization: "Bearer wrong-token" },
    });
    // Invalid token does not bypass origin check
    expect(res.status).toBe(403);
  });

  it("blocks PUT with no write auth token configured and no Origin", async () => {
    const app = createTestApp(makeConfig({ writeAuthToken: undefined }));
    const res = await app.request("/layouts/1", {
      method: "PUT",
    });
    // No writeAuthToken -> no Bearer bypass -> no Origin -> block
    expect(res.status).toBe(403);
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

  it("treats literal 'null' Origin header as absent, falls through to Referer", async () => {
    const app = createTestApp(makeConfig());
    // "null" Origin is a known attack vector — should fall through to Referer
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: {
        Origin: "null",
        Referer: "https://racku.la/layouts",
      },
    });
    // Falls through to Referer, which is trusted -> allowed
    expect(res.status).toBe(200);
  });

  it("blocks when 'null' Origin and no Referer", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: { Origin: "null" },
    });
    // No Referer either, no valid Bearer token -> block
    expect(res.status).toBe(403);
  });

  it("blocks mutating request with no Origin, no Referer, and no valid Bearer token", async () => {
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
        Authorization: `Bearer ${TEST_WRITE_TOKEN}`,
      },
    });
    // Valid Bearer token overrides origin check
    expect(res.status).toBe(200);
  });

  it("blocks mutating request with untrusted Origin and invalid Bearer token", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: {
        Origin: "https://evil.example.com",
        Authorization: "Bearer wrong-token",
      },
    });
    // Invalid Bearer token does not override origin check
    expect(res.status).toBe(403);
  });

  it("blocks PATCH requests with untrusted origin (PATCH is a state-changing method)", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PATCH",
      headers: { Origin: "https://evil.example.com" },
    });
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

  it("blocks mutating request with malformed Origin header", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: { Origin: "not a url" },
    });
    // Malformed Origin fails parsing, falls through to Referer (absent) -> block
    expect(res.status).toBe(403);
  });

  it("falls through to Referer when Origin is malformed", async () => {
    const app = createTestApp(makeConfig());
    const res = await app.request("/layouts/1", {
      method: "PUT",
      headers: {
        Origin: "not a url",
        Referer: "https://racku.la/layouts",
      },
    });
    // Malformed Origin is ignored, Referer origin is trusted -> allowed
    expect(res.status).toBe(200);
  });
});
