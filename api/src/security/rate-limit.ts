/**
 * Fixed-window rate limiter for API request throttling.
 *
 * Creates independent limiter instances (e.g., one for reads, one for writes)
 * with configurable limits, window duration, and automatic cleanup of stale
 * entries. Uses a fixed-window algorithm: each IP gets a counter that resets
 * when the window expires, not a true sliding window.
 *
 * @module rate-limit
 */

/**
 * Configuration for a single rate limiter instance.
 */
export interface RateLimitConfig {
  /** Maximum requests allowed per window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Interval in milliseconds between cleanup sweeps. */
  cleanupIntervalMs: number;
  /** Time-to-live for stale entries in milliseconds. */
  entryTtlMs: number;
}

/**
 * Result of a rate limit check.
 */
export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Milliseconds until the window resets (only set when `allowed` is false). */
  retryAfterMs?: number;
  /** Number of remaining requests in the current window. */
  remaining: number;
}

/**
 * A rate limiter instance with check, reset, and cleanup control.
 */
export interface RateLimiter {
  /** Check if a request from the given IP is allowed and increment the counter. */
  check(ip: string): RateLimitResult;
  /** Reset the rate limit counter for a specific IP. */
  reset(ip: string): void;
  /** Stop the periodic cleanup timer. Call during test teardown. */
  stopCleanup(): void;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/**
 * Create a fixed-window rate limiter.
 *
 * Each IP address gets a counter that resets when the window expires. When
 * the counter reaches `maxRequests`, subsequent requests are rejected with a
 * `retryAfterMs` value indicating when the window resets.
 *
 * A periodic cleanup timer removes stale entries to prevent unbounded memory
 * growth. Call `stopCleanup()` to cancel the timer (important in tests).
 */
export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  const { maxRequests, windowMs, cleanupIntervalMs, entryTtlMs } = config;
  const entries = new Map<string, RateLimitEntry>();

  // TTL must be at least as long as the window to avoid evicting active entries.
  const effectiveTtlMs = Math.max(entryTtlMs, windowMs);

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of entries) {
      if (now - entry.windowStart > effectiveTtlMs) {
        entries.delete(ip);
      }
    }
  }, cleanupIntervalMs);

  // Allow cleanup timer to not prevent process exit
  if (typeof cleanup === "object" && "unref" in cleanup) {
    cleanup.unref();
  }

  return {
    check(ip: string): RateLimitResult {
      const now = Date.now();
      const entry = entries.get(ip);

      // No entry: first request from this IP in the window
      if (!entry) {
        entries.set(ip, { count: 1, windowStart: now });
        return { allowed: true, remaining: maxRequests - 1 };
      }

      // Window expired: reset the counter
      if (now >= entry.windowStart + windowMs) {
        entries.set(ip, { count: 1, windowStart: now });
        return { allowed: true, remaining: maxRequests - 1 };
      }

      // At limit: reject
      if (entry.count >= maxRequests) {
        const retryAfterMs = entry.windowStart + windowMs - now;
        return {
          allowed: false,
          retryAfterMs: Math.max(0, retryAfterMs),
          remaining: 0,
        };
      }

      // Under limit: allow and increment
      entry.count += 1;
      return { allowed: true, remaining: maxRequests - entry.count };
    },

    reset(ip: string): void {
      entries.delete(ip);
    },

    stopCleanup(): void {
      clearInterval(cleanup);
    },
  };
}
