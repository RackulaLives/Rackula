/**
 * Origin policy middleware for mutating (write) API routes.
 *
 * Enforces that state-changing requests (POST, PUT, PATCH, DELETE) originate
 * from a trusted origin. This fills the gap between CSRF protection (which
 * only covers session-authenticated requests) and write-token auth (which
 * only validates bearer tokens without checking origin).
 *
 * Non-browser clients (curl, API tools) that send a valid `Authorization`
 * header bypass origin checks, since they may not include an `Origin` header.
 *
 * @module origin-policy
 */

import type { MiddlewareHandler } from "hono";
import { resolveRequestOrigin, isTrustedOrigin } from "./request-utils";
import { STATE_CHANGING_METHODS, type ApiSecurityConfig } from "./types";

/**
 * Creates middleware that enforces an origin policy on mutating requests.
 *
 * @param securityConfig - Origin policy enablement and trusted origins.
 * @returns Hono middleware that returns `403` JSON for origin policy violations.
 * @remarks
 * - Skips entirely when `originPolicyEnabled` is false.
 * - Skips non-mutating methods (GET, HEAD, OPTIONS).
 * - Allows requests with a valid `Authorization: Bearer` header regardless of origin.
 * - Falls back from `Origin` to `Referer` header for origin resolution.
 * - Blocks mutating requests with no origin and no auth token.
 */
export function createOriginPolicyMiddleware(
  securityConfig: Pick<
    ApiSecurityConfig,
    "originPolicyEnabled" | "csrfTrustedOrigins"
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

    // Non-browser clients with bearer auth bypass origin checks.
    const authorization = c.req.header("Authorization");
    if (authorization?.match(/^Bearer\s+\S+$/i)) {
      await next();
      return;
    }

    const requestOrigin = resolveRequestOrigin(c.req.raw);

    // No origin and no auth token: block the request.
    if (!requestOrigin) {
      return c.json(
        {
          error: "Forbidden",
          message:
            "Origin policy: mutating requests require an Origin or Referer header, or a Bearer authorization token.",
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