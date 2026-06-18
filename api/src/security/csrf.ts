import type { MiddlewareHandler } from "hono";
import { extractCookieValue } from "./cookies";
import { resolveRequestOrigin, isTrustedOrigin } from "./request-utils";
import { STATE_CHANGING_METHODS, type ApiSecurityConfig } from "./types";

// Paths that bypass CSRF validation — only safe GET-like auth bootstrap endpoints.
// Login paths are intentionally NOT exempt: the middleware's "no session cookie → skip"
// gate already allows initial logins, while re-auth with an existing session gets CSRF-checked.
// Logout is intentionally excluded: it's a state-changing POST that needs CSRF protection.
const CSRF_EXEMPT_AUTH_PATHS = new Set([
  "/health",
  "/api/health",
  "/auth/callback",
  "/auth/check",
  "/api/auth/callback",
  "/api/auth/check",
]);

function isStateChangingMethod(method: string): boolean {
  return STATE_CHANGING_METHODS.has(method.toUpperCase());
}

/**
 * Creates middleware that enforces origin-based CSRF checks for session-authenticated writes.
 *
 * @param securityConfig - CSRF enablement, trusted origins, and session cookie name.
 * @returns Hono middleware that returns `403` JSON for CSRF failures.
 * @remarks CSRF checks are skipped for non-state-changing methods and requests without session cookies.
 */
export function createCsrfProtectionMiddleware(
  securityConfig: Pick<
    ApiSecurityConfig,
    | "authEnabled"
    | "csrfProtectionEnabled"
    | "csrfTrustedOrigins"
    | "authSessionCookieName"
  >,
): MiddlewareHandler {
  return async (c, next): Promise<void | Response> => {
    if (!securityConfig.authEnabled || !securityConfig.csrfProtectionEnabled) {
      await next();
      return;
    }

    if (!isStateChangingMethod(c.req.method)) {
      await next();
      return;
    }

    const pathname = new URL(c.req.url).pathname;
    if (CSRF_EXEMPT_AUTH_PATHS.has(pathname)) {
      await next();
      return;
    }

    const hasSessionCookie = Boolean(
      extractCookieValue(
        c.req.header("cookie"),
        securityConfig.authSessionCookieName,
      ),
    );
    if (!hasSessionCookie) {
      await next();
      return;
    }

    const requestOrigin = resolveRequestOrigin(c.req.raw);
    if (!requestOrigin) {
      return c.json(
        {
          error: "Forbidden",
          message: "CSRF validation failed: missing Origin or Referer header.",
        },
        403,
      );
    }

    if (!isTrustedOrigin(requestOrigin, securityConfig.csrfTrustedOrigins)) {
      return c.json(
        {
          error: "Forbidden",
          message: "CSRF validation failed: request origin is not allowed.",
        },
        403,
      );
    }

    await next();
  };
}
