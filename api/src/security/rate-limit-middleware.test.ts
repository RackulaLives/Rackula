import { describe, it, expect, afterEach } from "bun:test";
import { Hono } from "hono";
import {
  createRateLimitMiddleware,
  resolveClientIpFromHeaders,
} from "./rate-limit-middleware";

// Helper to create a test app with rate limiting
function createTestApp(config: {
  writeMaxRequests: number;
  readMaxRequests: number;
  windowMs?: number;
  trustProxy?: boolean;
}) {
  const middleware = createRateLimitMiddleware({
    writeMaxRequests: config.writeMaxRequests,
    writeWindowMs: config.windowMs ?? 60_000,
    readMaxRequests: config.readMaxRequests,
    readWindowMs: config.windowMs ?? 60_000,
    cleanupIntervalMs: 300_000,
    entryTtlMs: 120_000,
    trustProxy: config.trustProxy ?? true,
  });

  const app = new Hono();
  app.use("*", middleware);

  // Simulate real routes
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/version", (c) => c.json({ version: "1.0.0" }));
  app.get("/api/version", (c) => c.json({ version: "1.0.0" }));
  app.get("/auth/login", (c) => c.json({ login: true }));
  app.get("/api/auth/login", (c) => c.json({ login: true }));
  // Local-auth POST login handlers. These have their own dedicated login
  // limiter in the real app, so the global write limiter must not consume them.
  app.post("/auth/login", (c) => c.json({ login: true }));
  app.post("/api/auth/login", (c) => c.json({ login: true }));
  app.get("/auth/callback", (c) => c.json({ callback: true }));
  app.get("/api/auth/callback", (c) => c.json({ callback: true }));
  app.get("/layouts", (c) => c.json({ layouts: [] }));
  app.get("/layouts/:id", (c) => c.json({ id: c.req.param("id") }));
  app.put("/layouts/:id", (c) => c.json({ updated: c.req.param("id") }));
  app.delete("/layouts/:id", (c) => c.json({ deleted: c.req.param("id") }));
  app.get("/api/layouts", (c) => c.json({ layouts: [] }));
  app.put("/api/layouts/:id", (c) => c.json({ updated: c.req.param("id") }));

  return { app, stopCleanup: middleware.stopCleanup };
}

describe("createRateLimitMiddleware", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups) {
      cleanup();
    }
    cleanups.length = 0;
  });

  it("allows read requests within the read limit", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 30,
      readMaxRequests: 5,
    });
    cleanups.push(stopCleanup);

    const res = await app.request("/layouts", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(res.status).toBe(200);
  });

  it("returns 429 with Retry-After when read limit is exceeded", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 30,
      readMaxRequests: 2,
    });
    cleanups.push(stopCleanup);

    // Use up the read limit
    await app.request("/layouts", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    await app.request("/layouts", {
      headers: { "x-real-ip": "1.2.3.4" },
    });

    // Third request should be rate limited
    const res = await app.request("/layouts", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
    const body = await res.json();
    expect(body).toHaveProperty("error", "Too Many Requests");
  });

  it("returns 429 with Retry-After when write limit is exceeded", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 2,
      readMaxRequests: 100,
    });
    cleanups.push(stopCleanup);

    // Use up the write limit
    await app.request("/layouts/abc", {
      method: "PUT",
      headers: { "x-real-ip": "1.2.3.4" },
    });
    await app.request("/layouts/abc", {
      method: "PUT",
      headers: { "x-real-ip": "1.2.3.4" },
    });

    // Third write should be rate limited
    const res = await app.request("/layouts/abc", {
      method: "PUT",
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
  });

  it("exempts health endpoints from rate limiting", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 1,
      readMaxRequests: 1,
    });
    cleanups.push(stopCleanup);

    // Exhaust limits first
    await app.request("/layouts", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    await app.request("/layouts/abc", {
      method: "PUT",
      headers: { "x-real-ip": "1.2.3.4" },
    });

    // Health endpoints should still work
    const res = await app.request("/health", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(res.status).toBe(200);

    const res2 = await app.request("/api/health", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(res2.status).toBe(200);
  });

  it("exempts version endpoints from rate limiting", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 1,
      readMaxRequests: 1,
    });
    cleanups.push(stopCleanup);

    // Exhaust limits
    await app.request("/layouts", {
      headers: { "x-real-ip": "1.2.3.4" },
    });

    const res = await app.request("/version", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(res.status).toBe(200);

    const res2 = await app.request("/api/version", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(res2.status).toBe(200);
  });

  it("exempts OPTIONS (CORS preflight) requests from rate limiting", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 1,
      readMaxRequests: 1,
    });
    cleanups.push(stopCleanup);

    // Exhaust read limit
    await app.request("/layouts", {
      headers: { "x-real-ip": "1.2.3.4" },
    });

    // Confirm rate limited
    const limited = await app.request("/layouts", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(limited.status).toBe(429);

    // OPTIONS should not be rate limited (returns 404 because no OPTIONS handler,
    // but NOT 429)
    const res = await app.request("/layouts", {
      method: "OPTIONS",
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(res.status).not.toBe(429);
  });

  it("exempts auth callback/check/logout endpoints from rate limiting", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 1,
      readMaxRequests: 1,
    });
    cleanups.push(stopCleanup);

    // Exhaust read limit
    await app.request("/layouts", {
      headers: { "x-real-ip": "1.2.3.4" },
    });

    const res = await app.request("/auth/callback", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(res.status).toBe(200);

    const res2 = await app.request("/api/auth/callback", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(res2.status).toBe(200);
  });

  it("throttles GET /auth/login (login initiation is no longer exempt)", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 1,
      readMaxRequests: 2,
    });
    cleanups.push(stopCleanup);

    // Two requests are within the read limit.
    const first = await app.request("/auth/login", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(first.status).toBe(200);
    const second = await app.request("/auth/login", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(second.status).toBe(200);

    // The third login initiation from the same IP is rate limited.
    const third = await app.request("/auth/login", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(third.status).toBe(429);
  });

  it("throttles GET /api/auth/login (login initiation is no longer exempt)", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 1,
      readMaxRequests: 2,
    });
    cleanups.push(stopCleanup);

    await app.request("/api/auth/login", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    await app.request("/api/auth/login", {
      headers: { "x-real-ip": "1.2.3.4" },
    });

    const res = await app.request("/api/auth/login", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(res.status).toBe(429);
  });

  it("does not throttle local-auth POST /auth/login with the global write limiter", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 1,
      readMaxRequests: 100,
    });
    cleanups.push(stopCleanup);

    // Exhaust the global write limiter with a real write route.
    await app.request("/layouts/abc", {
      method: "PUT",
      headers: { "x-real-ip": "1.2.3.4" },
    });
    const writeLimited = await app.request("/layouts/abc", {
      method: "PUT",
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(writeLimited.status).toBe(429);

    // POST login from the same IP must stay exempt from the global write
    // limiter (its dedicated login limiter handles brute-force throttling), so
    // it is not 429 even though the write bucket is empty.
    const first = await app.request("/auth/login", {
      method: "POST",
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(first.status).toBe(200);
    const second = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(second.status).toBe(200);
  });

  it("still throttles GET /auth/login (initiation) even though POST login is exempt", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 100,
      readMaxRequests: 1,
    });
    cleanups.push(stopCleanup);

    const first = await app.request("/auth/login", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(first.status).toBe(200);
    const second = await app.request("/auth/login", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(second.status).toBe(429);
  });

  it("rate limits via the socket peer when trust-proxy is on and headers are absent", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 100,
      readMaxRequests: 1,
      trustProxy: true,
    });
    cleanups.push(stopCleanup);

    // Mock the Bun server so getConnInfo() resolves a fixed socket peer for
    // every request. With no X-Real-IP / X-Forwarded-For header, the resolver
    // must fall back to that peer so the request is still rate limited.
    const env = {
      server: {
        requestIP: () => ({ address: "198.51.100.9", family: "IPv4", port: 0 }),
      },
    };

    const first = await app.request("/layouts", {}, env);
    expect(first.status).toBe(200);

    const second = await app.request("/layouts", {}, env);
    expect(second.status).toBe(429);
  });

  it("tracks different IPs independently", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 1,
      readMaxRequests: 1,
    });
    cleanups.push(stopCleanup);

    // IP 1 uses its read limit
    await app.request("/layouts", {
      headers: { "x-real-ip": "1.1.1.1" },
    });

    // IP 1 is now rate limited
    const limited = await app.request("/layouts", {
      headers: { "x-real-ip": "1.1.1.1" },
    });
    expect(limited.status).toBe(429);

    // IP 2 should still be allowed
    const allowed = await app.request("/layouts", {
      headers: { "x-real-ip": "2.2.2.2" },
    });
    expect(allowed.status).toBe(200);
  });

  it("resolves IP from X-Real-IP header", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 1,
      readMaxRequests: 1,
    });
    cleanups.push(stopCleanup);

    // Use up the limit with X-Real-IP
    await app.request("/layouts", {
      headers: { "x-real-ip": "10.0.0.1" },
    });

    // Same IP via X-Real-IP should be rate limited
    const res = await app.request("/layouts", {
      headers: { "x-real-ip": "10.0.0.1" },
    });
    expect(res.status).toBe(429);
  });

  it("falls back to X-Forwarded-For when X-Real-IP is absent", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 1,
      readMaxRequests: 1,
    });
    cleanups.push(stopCleanup);

    // Use up the limit with X-Forwarded-For
    await app.request("/layouts", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    });

    // Same last IP in X-Forwarded-For should be rate limited
    const res = await app.request("/layouts", {
      headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.1" },
    });
    expect(res.status).toBe(429);
  });

  it("counts DELETE as a write operation", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 1,
      readMaxRequests: 100,
    });
    cleanups.push(stopCleanup);

    // Use up write limit with PUT
    await app.request("/layouts/abc", {
      method: "PUT",
      headers: { "x-real-ip": "1.2.3.4" },
    });

    // DELETE should be rate limited
    const res = await app.request("/layouts/abc", {
      method: "DELETE",
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(res.status).toBe(429);
  });

  it("includes X-RateLimit-Remaining header on allowed requests", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 30,
      readMaxRequests: 5,
    });
    cleanups.push(stopCleanup);

    const res = await app.request("/layouts", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
  });

  it("skips rate limiting when client IP is not available", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 1,
      readMaxRequests: 1,
    });
    cleanups.push(stopCleanup);

    // No IP headers at all: requests should pass through without rate limiting.
    // A second headerless request must also pass: if headerless clients were
    // collapsed into one shared "unknown" bucket, this would 429 (readMax = 1).
    const res = await app.request("/layouts");
    expect(res.status).toBe(200);

    const res2 = await app.request("/layouts");
    expect(res2.status).toBe(200);
  });

  it("ignores spoofed X-Real-IP when trust-proxy is off (one peer trips the limiter)", async () => {
    const { app, stopCleanup } = createTestApp({
      writeMaxRequests: 1,
      readMaxRequests: 2,
      trustProxy: false,
    });
    cleanups.push(stopCleanup);

    // Mock the Bun server so getConnInfo() resolves a fixed socket peer for
    // every request, regardless of the (spoofed) X-Real-IP header.
    const env = {
      server: {
        requestIP: () => ({ address: "198.51.100.7", family: "IPv4", port: 0 }),
      },
    };

    // Rotating X-Real-IP per request must NOT create fresh buckets when the
    // peer address is the same.
    await app.request(
      "/layouts",
      { headers: { "x-real-ip": "10.0.0.1" } },
      env,
    );
    await app.request(
      "/layouts",
      { headers: { "x-real-ip": "10.0.0.2" } },
      env,
    );
    const res = await app.request(
      "/layouts",
      { headers: { "x-real-ip": "10.0.0.3" } },
      env,
    );
    expect(res.status).toBe(429);
  });
});

describe("resolveClientIpFromHeaders", () => {
  function makeReq(headers: Record<string, string>) {
    const lower: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      lower[key.toLowerCase()] = value;
    }
    return { header: (name: string) => lower[name.toLowerCase()] };
  }

  it("ignores X-Real-IP and returns the peer address when trust-proxy is off", () => {
    const req = makeReq({ "x-real-ip": "9.9.9.9" });
    const result = resolveClientIpFromHeaders(req, {
      trustProxy: false,
      peerAddress: "203.0.113.5",
    });
    expect(result).toBe("203.0.113.5");
  });

  it("ignores X-Forwarded-For and returns the peer address when trust-proxy is off", () => {
    const req = makeReq({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" });
    const result = resolveClientIpFromHeaders(req, {
      trustProxy: false,
      peerAddress: "203.0.113.5",
    });
    expect(result).toBe("203.0.113.5");
  });

  it("returns null when trust-proxy is off and no peer address is available", () => {
    const req = makeReq({ "x-real-ip": "9.9.9.9" });
    const result = resolveClientIpFromHeaders(req, {
      trustProxy: false,
      peerAddress: null,
    });
    expect(result).toBeNull();
  });

  it("honors X-Real-IP when trust-proxy is on", () => {
    const req = makeReq({ "x-real-ip": "9.9.9.9" });
    const result = resolveClientIpFromHeaders(req, {
      trustProxy: true,
      peerAddress: "203.0.113.5",
    });
    expect(result).toBe("9.9.9.9");
  });

  it("falls back to the last X-Forwarded-For entry when trust-proxy is on", () => {
    const req = makeReq({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    const result = resolveClientIpFromHeaders(req, {
      trustProxy: true,
      peerAddress: null,
    });
    expect(result).toBe("5.6.7.8");
  });

  it("falls back to the peer address when trust-proxy is on and both headers are absent", () => {
    const req = makeReq({});
    const result = resolveClientIpFromHeaders(req, {
      trustProxy: true,
      peerAddress: "203.0.113.5",
    });
    expect(result).toBe("203.0.113.5");
  });

  it("returns null when trust-proxy is on but neither headers nor peer are available", () => {
    const req = makeReq({});
    const result = resolveClientIpFromHeaders(req, {
      trustProxy: true,
      peerAddress: null,
    });
    expect(result).toBeNull();
  });
});
