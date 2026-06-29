/**
 * Hono middleware for IP-based rate limiting on API routes.
 *
 * Applies separate limits for read (GET, HEAD) and write (POST, PUT, DELETE) requests.
 * Health, version, and auth endpoints are exempt. OPTIONS (CORS preflight) requests
 * are also exempt to avoid blocking browser cross-origin checks.
 *
 * @module rate-limit-middleware
 */

import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "hono/bun";
import { RATE_LIMIT_EXEMPT_PATHS } from "./middleware";
import { createRateLimiter } from "./rate-limit";

const WRITE_METHODS = new Set(["POST", "PUT", "DELETE"]);

/**
 * Configuration for the rate limit middleware.
 */
export interface RateLimitMiddlewareConfig {
  /** Max write (POST/PUT/DELETE) requests per IP per window. */
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
  /**
   * Whether to trust client-supplied X-Real-IP / X-Forwarded-For headers.
   * When false, the socket peer address is used instead so a direct client
   * cannot rotate the header to escape its rate-limit bucket.
   */
  trustProxy: boolean;
}

/**
 * Options controlling how the client identity is derived.
 */
export interface ClientIpResolution {
  /** Whether client-supplied forwarding headers are trusted. */
  trustProxy: boolean;
  /** The socket peer address, used when headers are not trusted. */
  peerAddress: string | null;
}

/**
 * Resolve the client IP used for rate-limit bucketing.
 *
 * When `trustProxy` is true (the request reaches the API only through a trusted
 * reverse proxy that overwrites the header, e.g. nginx setting `$remote_addr`),
 * prefers X-Real-IP, falls back to the last X-Forwarded-For entry, and finally
 * falls back to the socket peer address when both headers are absent so a
 * missing header never lets a client skip rate limiting.
 *
 * When `trustProxy` is false, the forwarding headers are client-controlled and
 * spoofable, so they are ignored and the socket peer address is used instead.
 *
 * Returns null only when there is no usable identity at all (no trusted header
 * and no peer address).
 *
 * Trims values and truncates to 64 chars. Shared by the API rate limiter and
 * the local-login rate limiter so both derive the client identity identically.
 */
export function resolveClientIpFromHeaders(
  req: { header: (name: string) => string | undefined },
  options: ClientIpResolution,
): string | null {
  const peer = options.peerAddress?.trim();

  if (!options.trustProxy) {
    return peer ? peer.slice(0, 64) : null;
  }

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

  // Both trusted headers are absent. Fall back to the socket peer so a request
  // with no forwarding headers still gets rate limited, rather than skipping.
  return peer ? peer.slice(0, 64) : null;
}

/**
 * Resolve the socket peer address from a Hono context.
 *
 * Returns null when the connection info is unavailable (for example under
 * `app.request()` in tests, where there is no underlying socket).
 */
export function resolvePeerAddress(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the client IP from a Hono context.
 *
 * Thin wrapper over {@link resolveClientIpFromHeaders}. Returns null when the
 * IP cannot be determined, in which case rate limiting is skipped to avoid
 * collapsing all unidentifiable clients into a single shared bucket.
 */
function resolveClientIp(c: Context, trustProxy: boolean): string | null {
  return resolveClientIpFromHeaders(c.req, {
    trustProxy,
    peerAddress: resolvePeerAddress(c),
  });
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
 * Creates two independent rate limiters: one for write operations (POST, PUT, DELETE)
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

      // Exempt public paths (health, version, auth callback/check/logout).
      // GET login-initiation paths are intentionally excluded so they stay
      // throttled by the global read limiter. Local-auth POST login is exempt
      // here so it stays on its own dedicated login (brute-force) limiter
      // rather than being consumed by the global write limiter.
      const isLocalLoginPost =
        method === "POST" &&
        (pathname === "/auth/login" || pathname === "/api/auth/login");
      if (RATE_LIMIT_EXEMPT_PATHS.has(pathname) || isLocalLoginPost) {
        await next();
        return;
      }

      const ip = resolveClientIp(c, config.trustProxy);

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
