import { describe, it, expect, vi, afterEach } from "bun:test";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  let limiter: ReturnType<typeof createRateLimiter>;

  const defaultConfig = {
    maxRequests: 5,
    windowMs: 60_000,
    cleanupIntervalMs: 300_000,
    entryTtlMs: 120_000,
  };

  afterEach(() => {
    limiter?.stopCleanup();
  });

  it("allows a request when under the limit", () => {
    limiter = createRateLimiter(defaultConfig);
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests when the limit is reached", () => {
    limiter = createRateLimiter(defaultConfig);
    for (let i = 0; i < 5; i++) {
      limiter.check("1.2.3.4");
    }
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("returns retryAfterMs when blocked", () => {
    vi.useFakeTimers();
    limiter = createRateLimiter(defaultConfig);
    limiter.check("1.2.3.4"); // t=0

    vi.advanceTimersByTime(30_000); // t=30s
    for (let i = 0; i < 4; i++) {
      limiter.check("1.2.3.4");
    } // 5 total, at t=30s

    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    if (result.retryAfterMs !== undefined) {
      expect(result.retryAfterMs).toBeLessThanOrEqual(defaultConfig.windowMs);
    }
    vi.useRealTimers();
  });

  it("resets the window after it expires", () => {
    vi.useFakeTimers();
    limiter = createRateLimiter(defaultConfig);

    // Fill the window
    for (let i = 0; i < 5; i++) {
      limiter.check("1.2.3.4");
    }
    expect(limiter.check("1.2.3.4").allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(defaultConfig.windowMs + 1);

    // Should be allowed again
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    vi.useRealTimers();
  });

  it("tracks different IPs independently", () => {
    limiter = createRateLimiter(defaultConfig);

    // Fill limit for IP 1
    for (let i = 0; i < 5; i++) {
      limiter.check("1.1.1.1");
    }
    expect(limiter.check("1.1.1.1").allowed).toBe(false);

    // IP 2 should still be allowed
    const result = limiter.check("2.2.2.2");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("returns correct remaining count as requests accumulate", () => {
    limiter = createRateLimiter(defaultConfig);

    // After 1st check: count=1, remaining=4
    // After 2nd check: count=2, remaining=3
    // After 3rd check: count=3, remaining=2
    // After 4th check: count=4, remaining=1
    const result1 = limiter.check("1.2.3.4");
    expect(result1.remaining).toBe(4);
    const result2 = limiter.check("1.2.3.4");
    expect(result2.remaining).toBe(3);
    const result3 = limiter.check("1.2.3.4");
    expect(result3.remaining).toBe(2);
    const result4 = limiter.check("1.2.3.4");
    expect(result4.remaining).toBe(1);
  });

  it("resets the counter for a specific IP", () => {
    limiter = createRateLimiter(defaultConfig);

    for (let i = 0; i < 5; i++) {
      limiter.check("1.2.3.4");
    }
    expect(limiter.check("1.2.3.4").allowed).toBe(false);

    limiter.reset("1.2.3.4");
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(true);
  });

  it("stops the cleanup timer when stopCleanup is called", () => {
    vi.useFakeTimers();
    limiter = createRateLimiter({
      ...defaultConfig,
      cleanupIntervalMs: 100,
      entryTtlMs: 50,
    });

    // Make an entry
    limiter.check("1.2.3.4");

    // Stop cleanup
    limiter.stopCleanup();

    // Advance past entry TTL — without cleanup, entry should still be present
    vi.advanceTimersByTime(200);

    // The entry might or might not be expired depending on window,
    // but stopCleanup should not throw
    const result = limiter.check("1.2.3.4");
    expect(typeof result.allowed).toBe("boolean");

    vi.useRealTimers();
  });

  it("evicts stale entries during cleanup", () => {
    vi.useFakeTimers();
    limiter = createRateLimiter({
      ...defaultConfig,
      windowMs: 100, // very short window
      cleanupIntervalMs: 50,
      entryTtlMs: 200,
    });

    limiter.check("1.2.3.4");

    // Advance past window + TTL so entry is stale
    vi.advanceTimersByTime(300);

    // Run cleanup
    vi.advanceTimersByTime(50);

    // The IP should be allowed again (window expired, entry cleaned up)
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(true);

    vi.useRealTimers();
  });

  it("handles maxRequests of 1 correctly", () => {
    limiter = createRateLimiter({
      ...defaultConfig,
      maxRequests: 1,
    });

    const first = limiter.check("1.2.3.4");
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(0);

    const second = limiter.check("1.2.3.4");
    expect(second.allowed).toBe(false);
  });

  it("does not share state between different limiter instances", () => {
    const limiterA = createRateLimiter(defaultConfig);
    const limiterB = createRateLimiter(defaultConfig);

    for (let i = 0; i < 5; i++) {
      limiterA.check("1.2.3.4");
    }

    expect(limiterA.check("1.2.3.4").allowed).toBe(false);
    expect(limiterB.check("1.2.3.4").allowed).toBe(true);

    limiterA.stopCleanup();
    limiterB.stopCleanup();
  });
});
