/**
 * Origin policy middleware for mutating (write) API routes.
 *
 * Enforces that state-changing requests (POST, PUT, PATCH, DELETE) originate
 * from a trusted origin. This fills the gap between CSRF protection (which
 * only covers session-authenticated requests) and write-token auth (which
 * only validates bearer tokens without checking origin).
 *
 * Non-browser clients (curl, API tools) that present a valid write auth
 * bearer token bypass origin checks, since they may not include an Origin
 * header. The token is validated via timing-safe comparison against the
 * configured write auth token.
 *
 * @module origin-policy
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { resolveRequestOrigin, isTrustedOrigin } from "./request-utils";
import { AUTH_PUBLIC_PATHS } from "./middleware";
import { STATE_CHANGING_METHODS, type ApiSecurityConfig } from "./types";

/**
 * Timing-safe comparison of two strings using SHA-256 hashing.
 * Returns true if the strings are equal.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const aHash = createHash("sha256").update(a).digest();
  const bHash = createHash("sha256").update(b).digest();
  return timingSafeEqual(aHash, bHash);
}

/**
 * Creates middleware that enforces an origin policy on mutating requests.
 *
 * @param securityConfig - Origin policy enablement, trusted origins, and write auth token.
 * @returns Hono middleware that returns `403` JSON for origin policy violations.
 * @remarks
 * - Skips entirely when `originPolicyEnabled` is false.
 * - Skips non-mutating methods (GET, HEAD, OPTIONS).
 * - Allows requests with a valid write auth bearer token regardless of origin.
 * - Falls back from `Origin` to `Referer` header for origin resolution.
 * - Blocks mutating requests with no origin and no valid auth token.
 */
export function createOriginPolicyMiddleware(
  securityConfig: Pick<
    ApiSecurityConfig,
    "originPolicyEnabled" | "csrfTrustedOrigins" | "writeAuthToken"
  >,
): MiddlewareHandler {
  return async (c, next): Promise<void | Response> => {
    if (!securityConfig.originPolicyEnabled) {
      await next();
      return;
    }

    if (!STATE_CHANGING_METHODS.has(c.req.method.toUpperCase())) {
      await next();
      return;
    }

    // Auth and health endpoints are exempt from origin checks.
    // Login forms must be accessible without an Origin header.
    const { pathname } = new URL(c.req.url);
    if (AUTH_PUBLIC_PATHS.has(pathname)) {
      await next();
      return;
    }

    // Non-browser clients with a valid write auth bearer token bypass origin checks.
    if (securityConfig.writeAuthToken) {
      const authorization = c.req.header("Authorization");
      const match = authorization?.match(/^Bearer\s+(.+)$/i);
      if (
        match?.[1] &&
        timingSafeStringEqual(match[1].trim(), securityConfig.writeAuthToken)
      ) {
        await next();
        return;
      }
    }

    const requestOrigin = resolveRequestOrigin(c.req.raw);

    // No origin and no valid auth token: block the request.
    if (!requestOrigin) {
      return c.json(
        {
          error: "Forbidden",
          message:
            "Origin policy: mutating requests require an Origin or Referer header, or a valid Bearer authorization token.",
        },
        403,
      );
    }

    if (!isTrustedOrigin(requestOrigin, securityConfig.csrfTrustedOrigins)) {
      return c.json(
        {
          error: "Forbidden",
          message: "Origin policy: request origin is not allowed.",
        },
        403,
      );
    }

    await next();
  };
}
