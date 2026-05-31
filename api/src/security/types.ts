import type { LocalCredentials } from "../local-auth";

export type AuthMode = "none" | "oidc" | "local";
export type AuthSessionSameSite = "Lax" | "Strict" | "None";

export interface AuthSessionClaims {
  sub: string;
  sid: string;
  role?: string;
  iat: number;
  exp: number;
  idleExp: number;
  generation: number;
}

export interface AuthSessionClaimsInput {
  sub: string;
  sid?: string;
  role?: string;
  iat?: number;
  exp?: number;
  idleExp?: number;
  generation?: number;
}

export interface CreateAuthSessionTokenOptions {
  nowSeconds?: number;
  sessionMaxAgeSeconds?: number;
  sessionIdleTimeoutSeconds?: number;
  sessionGeneration?: number;
}

export interface VerifyAuthSessionTokenOptions {
  nowSeconds?: number;
  expectedGeneration?: number;
  maxSessionMaxAgeSeconds?: number;
}

export interface ApiSecurityConfig {
  corsOrigin: string | string[];
  allowInsecureCors: boolean;
  isProduction: boolean;
  writeAuthToken?: string;
  authMode: AuthMode;
  authEnabled: boolean;
  authSessionSecret?: string;
  authLogHashKey: string;
  authSessionCookieName: string;
  authSessionCookieSecure: boolean;
  authSessionCookieSameSite: AuthSessionSameSite;
  authSessionMaxAgeSeconds: number;
  authSessionIdleTimeoutSeconds: number;
  authSessionGeneration: number;
  authLoginPath: string;
  csrfProtectionEnabled: boolean;
  csrfTrustedOrigins: string[];
  originPolicyEnabled: boolean;
  localCredentials?: LocalCredentials;
}

export type EnvMap = Record<string, string | undefined>;

/**
 * HTTP methods that are considered to change server state.
 *
 * Used by CSRF protection middleware and validation logic to determine
 * whether a request requires origin verification. Exported and immutable.
 *
 * @constant
 * @type {Set<string>}
 * @example
 * ```ts
 * // Methods are stored as uppercase strings — normalize input before checking:
 * if (STATE_CHANGING_METHODS.has(method.toUpperCase())) { ... }
 * ```
 */
export const STATE_CHANGING_METHODS = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);
