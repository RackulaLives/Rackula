/**
 * Hono middleware for IP-based rate limiting on API routes.
 *
 * Applies separate limits for read (GET, HEAD) and write (PUT, DELETE) requests.
 * Health, version, and auth endpoints are exempt. OPTIONS (CORS preflight) requests
 * are also exempt to avoid blocking browser cross-origin checks.
 *
 * @module rate-limit-middleware
 */

import type { MiddlewareHandler } from "hono";
import { AUTH_PUBLIC_PATHS } from "./middleware";
import { createRateLimiter } from "./rate-limit";

const WRITE_METHODS = new Set(["PUT", "DELETE"]);

/**
 * Configuration for the rate limit middleware.
 */
export interface RateLimitMiddlewareConfig {
  /** Max write (PUT/DELETE) requests per IP per window. */
  writeMaxRequests: number;
  /** Write rate limit window in milliseconds. */
  writeWindowMs: number;
  /** Max read (GET/HEAD) requests per IP per window. */
  readMaxRequests: number;
  /** Read rate limit window in milliseconds. */
  readWindowMs: number;
  /** Interval in milliseconds between cleanup sweeps. */
  cleanupIntervalMs: number;
  /** Time-to-live for stale entries in milliseconds. */
  entryTtlMs: number;
}

/**
 * Resolve the client IP from a request's headers.
 *
 * Prefers X-Real-IP (set by nginx to $remote_addr, not client-spoofable).
 * Falls back to the last entry in X-Forwarded-For (closest proxy, harder to spoof).
 * Trims values and truncates to 64 chars. Returns null when neither header
 * yields a usable value.
 *
 * Shared by the API rate limiter and the local-login rate limiter so both
 * derive the client identity identically.
 */
export function resolveClientIpFromHeaders(req: {
  header: (name: string) => string | undefined;
}): string | null {
  const realIp = req.header("x-real-ip")?.trim();
  if (realIp) {
    return realIp.slice(0, 64);
  }

  const forwardedFor = req.header("x-forwarded-for");
  if (forwardedFor) {
    const lastProxy = forwardedFor.split(",").pop()?.trim();
    if (lastProxy) {
      return lastProxy.slice(0, 64);
    }
  }

  return null;
}

/**
 * Resolve the client IP from a Hono context.
 *
 * Thin wrapper over {@link resolveClientIpFromHeaders}. Returns null when the
 * IP cannot be determined, in which case rate limiting is skipped to avoid
 * collapsing all unidentifiable clients into a single shared bucket.
 */
function resolveClientIp(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  return resolveClientIpFromHeaders(c.req);
}

/**
 * Extended middleware interface that exposes cleanup control for tests.
 */
export interface RateLimitMiddleware extends MiddlewareHandler {
  /** Stop the cleanup timers. Call in test teardown. */
  stopCleanup(): void;
}

/**
 * Create a rate limiting middleware for Hono.
 *
 * Creates two independent rate limiters: one for write operations (PUT, DELETE)
 * and one for read operations (GET, HEAD). OPTIONS requests and public paths
 * (health, version, auth) are exempt.
 *
 * On rate limit violation, returns 429 with a `Retry-After` header (integer seconds)
 * and a JSON body: `{ error: "Too Many Requests", message: "..." }`.
 *
 * On allowed requests, sets `X-RateLimit-Remaining` header.
 */
export function createRateLimitMiddleware(
  config: RateLimitMiddlewareConfig,
): RateLimitMiddleware {
  const writeLimiter = createRateLimiter({
    maxRequests: config.writeMaxRequests,
    windowMs: config.writeWindowMs,
    cleanupIntervalMs: config.cleanupIntervalMs,
    entryTtlMs: config.entryTtlMs,
  });

  const readLimiter = createRateLimiter({
    maxRequests: config.readMaxRequests,
    windowMs: config.readWindowMs,
    cleanupIntervalMs: config.cleanupIntervalMs,
    entryTtlMs: config.entryTtlMs,
  });

  const middleware: RateLimitMiddleware = Object.assign(
    async (
      c: Parameters<MiddlewareHandler>[0],
      next: Parameters<MiddlewareHandler>[1],
    ): Promise<void | Response> => {
      const method = c.req.method.toUpperCase();
      const { pathname } = new URL(c.req.url);

      // Exempt CORS preflight
      if (method === "OPTIONS") {
        await next();
        return;
      }

      // Exempt public paths (health, version, auth)
      if (AUTH_PUBLIC_PATHS.has(pathname)) {
        await next();
        return;
      }

      const ip = resolveClientIp(c);

      // Skip rate limiting when client IP cannot be determined.
      // Using a shared "unknown" bucket would let one noisy client throttle
      // all other unidentifiable clients.
      if (!ip) {
        await next();
        return;
      }

      const limiter = WRITE_METHODS.has(method) ? writeLimiter : readLimiter;
      const result = limiter.check(ip);

      if (!result.allowed) {
        const retryAfterSeconds = Math.ceil((result.retryAfterMs ?? 0) / 1000);
        c.header("Retry-After", String(retryAfterSeconds));
        return c.json(
          {
            error: "Too Many Requests",
            message: "Rate limit exceeded. Try again later.",
          },
          429,
        );
      }

      c.header("X-RateLimit-Remaining", String(result.remaining));
      await next();
    },
    {
      stopCleanup(): void {
        writeLimiter.stopCleanup();
        readLimiter.stopCleanup();
      },
    },
  );

  return middleware;
}
