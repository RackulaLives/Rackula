import type { MiddlewareHandler } from "hono";
import { STATE_CHANGING_METHODS, type AuthSessionClaims } from "./security";

// Role constants — single admin role for MVP.
// Future roles (editor, viewer) can be added here without changing middleware shape.
export const ROLE_ADMIN = "admin";

/**
 * Checks whether session claims carry admin privileges.
 */
export function isAdmin(claims: AuthSessionClaims | null | undefined): boolean {
  return claims?.role === ROLE_ADMIN;
}

/**
 * Creates middleware that requires admin role for state-changing operations.
 *
 * Expects `authClaims` to be set on the Hono context by the auth gate.
 * Passes through for safe methods (GET, HEAD, OPTIONS) so any authenticated user can read.
 * Returns 401 when no session exists, 403 when authenticated but not admin.
 */
export function createRequireAdminMiddleware(): MiddlewareHandler {
  return async (c, next): Promise<void | Response> => {
    if (!STATE_CHANGING_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    const claims = c.get("authClaims") as AuthSessionClaims | undefined;

    // Defensive: in normal wiring the auth gate (registered when authEnabled=true)
    // rejects unauthenticated requests before this middleware runs. This guard
    // exists for safety if the middleware is used standalone or wiring changes.
    if (!claims) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required.",
        },
        401,
      );
    }

    if (!isAdmin(claims)) {
      return c.json(
        {
          error: "Forbidden",
          message: "Admin role required.",
        },
        403,
      );
    }

    await next();
  };
}
