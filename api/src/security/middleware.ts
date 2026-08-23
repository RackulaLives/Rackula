import type { MiddlewareHandler } from "hono";
import { createHash, timingSafeEqual } from "node:crypto";
import { safeLogAuthEvent } from "../auth-logger";
import {
  createRefreshedAuthSessionCookieHeader,
  resolveAuthenticatedSessionClaims,
} from "./tokens";
import type { ApiSecurityConfig, AuthSessionClaims } from "./types";

const WRITE_METHODS = new Set(["POST", "PUT", "DELETE"]);
const _AUTH_PUBLIC_PATHS = new Set([
  "/health",
  "/api/health",
  "/version",
  "/api/version",
  "/auth/login",
  "/auth/callback",
  "/auth/check",
  "/auth/logout",
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/check",
  "/api/auth/logout",
  // Better Auth's generic-oauth plugin routes its callback at
  // {basePath}/oauth2/callback/{providerId}, and advertises that URI to the IdP
  // whenever RACKULA_OIDC_REDIRECT_URI points at it. The bare form is what the
  // API sees after nginx strips the /api prefix
  // (deploy/nginx.conf.template). Both must bypass the gate: the callback is
  // what creates the session, so requiring one here loops the browser. See #3140.
  "/auth/oauth2/callback/oidc",
  "/api/auth/oauth2/callback/oidc",
]);
/** Immutable set of paths exempt from auth. */
export const AUTH_PUBLIC_PATHS: ReadonlySet<string> = _AUTH_PUBLIC_PATHS;

/**
 * Paths exempt from rate limiting. This is {@link AUTH_PUBLIC_PATHS} minus the
 * login-initiation routes: those must stay throttled so an attacker cannot
 * flood OIDC login initiations (state/PKCE generation, Set-Cookie, upstream
 * IdP work). The callback/check/logout routes remain exempt, including the
 * oauth2 callback paths: Better Auth validates the signed state cookie before
 * any upstream discovery fetch, so an unauthenticated flood costs one signature
 * verification and generates no IdP traffic.
 */
const _RATE_LIMIT_EXEMPT_PATHS = new Set(
  [..._AUTH_PUBLIC_PATHS].filter(
    (path) => path !== "/auth/login" && path !== "/api/auth/login",
  ),
);
export const RATE_LIMIT_EXEMPT_PATHS: ReadonlySet<string> =
  _RATE_LIMIT_EXEMPT_PATHS;
const API_ROUTE_PREFIXES = ["/api", "/layouts", "/assets"];
/**
 * Better Auth's generic-oauth callback shape, with and without the /api prefix
 * that nginx strips. Used to turn a misrouted OAuth callback into a legible
 * error instead of a redirect loop. See #3140.
 */
const OAUTH_CALLBACK_PATH_PATTERN = /^\/(?:api\/)?auth\/oauth2\/callback\//;

function timingSafeTokenCompare(
  presentedToken: string,
  expectedToken: string,
): boolean {
  const presentedHash = createHash("sha256").update(presentedToken).digest();
  const expectedHash = createHash("sha256").update(expectedToken).digest();
  return timingSafeEqual(presentedHash, expectedHash);
}

function isApiRequestPath(pathname: string): boolean {
  return API_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthPublicPath(pathname: string): boolean {
  return _AUTH_PUBLIC_PATHS.has(pathname);
}

function buildLoginRedirectUrl(requestUrl: string, loginPath: string): string {
  if (loginPath.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(loginPath)) {
    throw new Error(
      `Invalid auth login path: "${loginPath}". External URLs are not allowed.`,
    );
  }

  const url = new URL(requestUrl);
  const safePath = url.pathname.replace(/^\/+/, "/");
  const next = `${safePath}${url.search}${url.hash}`;
  return `${loginPath}?next=${encodeURIComponent(next)}`;
}

/**
 * Creates middleware that enforces auth for non-public routes.
 *
 * @param securityConfig - Auth gate settings and session verification parameters.
 * @returns Hono middleware that allows authenticated requests and blocks anonymous access.
 * @remarks Side effects: sets `authSubject` on the request context and may append refreshed cookies.
 */
export function createAuthGateMiddleware(
  securityConfig: Pick<
    ApiSecurityConfig,
    | "authEnabled"
    | "authLoginPath"
    | "authSessionSecret"
    | "authSessionCookieName"
    | "authSessionCookieSecure"
    | "authSessionCookieSameSite"
    | "authSessionIdleTimeoutSeconds"
    | "authSessionGeneration"
    | "authSessionMaxAgeSeconds"
  >,
  resolveFallbackClaims?: (
    request: Request,
  ) => Promise<AuthSessionClaims | null>,
): MiddlewareHandler {
  return async (c, next): Promise<void | Response> => {
    if (!securityConfig.authEnabled) {
      await next();
      return;
    }

    const { pathname } = new URL(c.req.url);
    if (isAuthPublicPath(pathname)) {
      await next();
      return;
    }

    const signedClaims = resolveAuthenticatedSessionClaims(
      c.req.raw,
      securityConfig,
    );
    if (signedClaims) {
      c.set("authSubject", signedClaims.sub);
      c.set("authClaims", signedClaims);

      const refreshedCookie = createRefreshedAuthSessionCookieHeader(
        signedClaims,
        securityConfig,
      );
      if (refreshedCookie) {
        c.header("Set-Cookie", refreshedCookie, { append: true });
      }

      await next();
      return;
    }

    if (resolveFallbackClaims) {
      const fallbackClaims = await resolveFallbackClaims(c.req.raw);
      if (fallbackClaims) {
        c.set("authSubject", fallbackClaims.sub);
        c.set("authClaims", fallbackClaims);
        await next();
        return;
      }
    }

    // An OAuth callback reaching this point is always a misconfiguration: the
    // redirect URI the IdP was handed is not a path Rackula serves. Redirecting
    // it to login re-initiates OIDC, the IdP silently re-approves, and the
    // browser loops until ERR_TOO_MANY_REDIRECTS. Fail loudly instead, naming
    // the setting to fix. Matching on the path rather than on code/state query
    // params keeps ordinary deep links carrying those names unaffected. See #3140.
    if (OAUTH_CALLBACK_PATH_PATTERN.test(pathname)) {
      safeLogAuthEvent("auth.session.invalid", c.req.raw, {
        reason:
          "OAuth callback received on an unrouted path; check that RACKULA_OIDC_REDIRECT_URI matches the redirect URI registered with your identity provider",
      });

      return c.json(
        {
          error: "Bad Request",
          message:
            "OAuth callback received on a path Rackula does not serve. Verify RACKULA_OIDC_REDIRECT_URI and the redirect URI registered with your identity provider.",
        },
        400,
      );
    }

    safeLogAuthEvent("auth.session.invalid", c.req.raw, {
      reason: "missing or invalid session cookie",
    });

    if (isApiRequestPath(pathname)) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required.",
        },
        401,
      );
    }

    return c.redirect(
      buildLoginRedirectUrl(c.req.url, securityConfig.authLoginPath),
    );
  };
}

/**
 * Creates middleware that enforces bearer-token authorization on write routes.
 *
 * @param writeAuthToken - Expected bearer token for protected write operations.
 * @returns Hono middleware that returns `401/403` on missing or invalid tokens.
 * @remarks When `writeAuthToken` is undefined, middleware becomes a pass-through.
 */
export function createWriteAuthMiddleware(
  writeAuthToken?: string,
): MiddlewareHandler {
  return async (c, next): Promise<void | Response> => {
    if (!WRITE_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    if (!writeAuthToken) {
      await next();
      return;
    }

    const authorization = c.req.header("Authorization");
    if (!authorization) {
      return c.json(
        {
          error: "Unauthorized",
          message:
            "Missing write auth token. Provide Authorization: Bearer <token>.",
        },
        401,
      );
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return c.json(
        {
          error: "Unauthorized",
          message:
            "Malformed Authorization header. Expected format: Bearer <token>.",
        },
        401,
      );
    }

    const presentedToken = match[1]?.trim();
    if (
      !presentedToken ||
      !timingSafeTokenCompare(presentedToken, writeAuthToken)
    ) {
      return c.json(
        {
          error: "Forbidden",
          message: "Invalid write auth token.",
        },
        403,
      );
    }

    await next();
  };
}
