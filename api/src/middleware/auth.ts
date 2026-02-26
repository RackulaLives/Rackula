import type { Context } from "hono";
import type { Auth } from "../auth/config";

/**
 * Creates a Better Auth handler for Hono routes.
 *
 * Mounts at /api/auth/* to handle Better Auth endpoints:
 * - POST /api/auth/sign-in - OIDC authentication initiation
 * - GET /api/auth/callback - OIDC callback handler
 * - POST /api/auth/sign-out - Session termination
 * - GET /api/auth/session - Current session status
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
