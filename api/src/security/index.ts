export type {
  ApiSecurityConfig,
  AuthMode,
  AuthSessionClaims,
  AuthSessionClaimsInput,
  AuthSessionSameSite,
  CreateAuthSessionTokenOptions,
  EnvMap,
  VerifyAuthSessionTokenOptions,
} from "./types";
export { STATE_CHANGING_METHODS } from "./types";

export {
  createAuthSessionCookieHeader,
  createExpiredAuthSessionCookieHeader,
} from "./cookies";

export {
  clearInvalidatedAuthSessions,
  invalidateAuthSession,
} from "./sessions";

export {
  createRefreshedAuthSessionCookieHeader,
  createSignedAuthSessionToken,
  resolveAuthenticatedSessionClaims,
  verifySignedAuthSessionToken,
} from "./tokens";

export { createCsrfProtectionMiddleware } from "./csrf";

export { normalizeOrigin } from "./request-utils";

export {
  createAuthGateMiddleware,
  createWriteAuthMiddleware,
  AUTH_PUBLIC_PATHS,
} from "./middleware";

export { createRateLimiter } from "./rate-limit";
export type {
  RateLimitConfig,
  RateLimitResult,
  RateLimiter,
} from "./rate-limit";

export {
  createRateLimitMiddleware,
  resolveClientIpFromHeaders,
} from "./rate-limit-middleware";
export type { RateLimitMiddlewareConfig } from "./rate-limit-middleware";

export { createOriginPolicyMiddleware } from "./origin-policy";

export { resolveApiSecurityConfig } from "./config";
