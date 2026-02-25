import type { Context, MiddlewareHandler } from "hono";
import type { Auth } from "../auth/config";

/**
 * Creates a Better Auth handler for Hono routes.
 *
 * Mounts at /auth/* to handle all Better Auth endpoints:
 * - POST /auth/sign-in - OIDC authentication initiation
 * - GET /auth/callback - OIDC callback handler
 * - POST /auth/sign-out - Session termination
 * - GET /auth/session - Current session status
 *
 * @returns Hono route handler that delegates to Better Auth
 */
export function createAuthHandler(
  auth: Auth,
): (c: Context) => Response | Promise<Response> {
  return (c: Context) => {
    return auth.handler(c.req.raw);
  };
}

/**
 * Creates optional auth middleware that attaches session if present but never blocks.
 *
 * Use for routes that work with both authenticated and unauthenticated users:
 * - GET /api/layouts - Public read access, enhanced for authenticated users
 * - GET /api/assets - Public access
 *
 * On session lookup failure (malformed/corrupt cookies), logs the error and
 * continues without a session to prevent 500s.
 *
 * @returns Hono middleware that optionally attaches session
 */
export function createOptionalAuthMiddleware(auth: Auth): MiddlewareHandler {
  return async (c, next) => {
    try {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      if (session) {
        c.set("authSession", session);
      }
    } catch (err) {
      console.debug("auth: session lookup failed, continuing without session", err);
    }

    await next();
  };
}
