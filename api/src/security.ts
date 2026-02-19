import type { MiddlewareHandler } from "hono";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

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
  authSessionCookieName: string;
  authSessionCookieSecure: boolean;
  authSessionCookieSameSite: AuthSessionSameSite;
  authSessionMaxAgeSeconds: number;
  authSessionIdleTimeoutSeconds: number;
  authSessionGeneration: number;
  authLoginPath: string;
  csrfProtectionEnabled: boolean;
  csrfTrustedOrigins: string[];
}

export type EnvMap = Record<string, string | undefined>;

const WRITE_METHODS = new Set(["PUT", "DELETE"]);
export const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const AUTH_MODES = new Set<AuthMode>(["none", "oidc", "local"]);
const AUTH_PUBLIC_PATHS = new Set([
  "/health",
  "/api/health",
  "/auth/login",
  "/auth/callback",
  "/auth/check",
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/check",
]);
const API_ROUTE_PREFIXES = ["/api", "/layouts", "/assets"];
const SESSION_SECRET_MIN_LENGTH = 32;
const MAX_SIGNED_AUTH_SESSION_TOKEN_BYTES = 8 * 1024;
const DEFAULT_AUTH_COOKIE_NAME = "rackula_auth_session";
const DEFAULT_AUTH_LOGIN_PATH = "/auth/login";
const COOKIE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const CORS_ORIGIN_EMPTY_ERROR =
  "CORS_ORIGIN is set but empty. Provide at least one origin.";
const DEFAULT_AUTH_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const DEFAULT_AUTH_SESSION_IDLE_TIMEOUT_SECONDS = 30 * 60;
const MIN_AUTH_SESSION_TIMEOUT_SECONDS = 60;
const MAX_AUTH_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const AUTH_SESSION_REFRESH_THRESHOLD_SECONDS = 60;
const DEFAULT_AUTH_SESSION_SAME_SITE: AuthSessionSameSite = "Lax";
// Domain-separates session HMAC signatures from other potential HMAC uses.
const AUTH_SESSION_SIGNATURE_CONTEXT = "rackula:session:v2:";
const MAX_INVALIDATED_AUTH_SESSIONS = 10_000;

// Session invalidations are stored in-memory for the current API process only.
// This is acceptable for the current single-process baseline but does not survive
// restarts or coordinate across replicas. For distributed/HA deployments, replace
// this map with a shared TTL-backed store (for example Redis).
// Tracking: https://github.com/RackulaLives/Rackula/issues/1269
const invalidatedAuthSessionIds = new Map<string, number>();

function timingSafeTokenCompare(
  presentedToken: string,
  expectedToken: string,
): boolean {
  const presentedHash = createHash("sha256").update(presentedToken).digest();
  const expectedHash = createHash("sha256").update(expectedToken).digest();
  return timingSafeEqual(presentedHash, expectedHash);
}

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

function parseOptionalBoolean(
  name: string,
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(`${name} must be "true" or "false".`);
}

function parseCorsOrigins(raw: string): string | string[] {
  const [firstOrigin, ...remainingOrigins] = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (!firstOrigin) {
    throw new Error(CORS_ORIGIN_EMPTY_ERROR);
  }

  if (remainingOrigins.length === 0) {
    return firstOrigin;
  }

  return [firstOrigin, ...remainingOrigins];
}

function hasWildcardOrigin(origin: string | string[]): boolean {
  if (typeof origin === "string") {
    return origin === "*";
  }
  return origin.includes("*");
}

function parseAuthMode(value: string | undefined): AuthMode {
  const normalized = value?.trim().toLowerCase();
  const authMode = normalized || "none";
  if (AUTH_MODES.has(authMode as AuthMode)) {
    return authMode as AuthMode;
  }

  throw new Error(
    `Invalid auth mode: "${value}". Supported values: none, oidc, local.`,
  );
}

function parseAuthCookieName(value: string | undefined): string {
  const cookieName = value?.trim() || DEFAULT_AUTH_COOKIE_NAME;
  if (!COOKIE_NAME_PATTERN.test(cookieName)) {
    throw new Error(
      `Invalid auth session cookie name: "${cookieName}". Use alphanumeric, '-' or '_' characters only.`,
    );
  }
  return cookieName;
}

function parseLoginPath(value: string | undefined): string {
  const path = value?.trim() || DEFAULT_AUTH_LOGIN_PATH;
  if (path.startsWith("//")) {
    throw new Error(
      `Invalid auth login path: "${path}". External URLs are not allowed.`,
    );
  }
  if (!path.startsWith("/")) {
    throw new Error(
      `Invalid auth login path: "${path}". Expected an absolute path like "/auth/login".`,
    );
  }
  if (path.includes("://")) {
    throw new Error(
      `Invalid auth login path: "${path}". External URLs are not allowed.`,
    );
  }
  return path;
}

function parseAuthSessionSameSite(value: string | undefined): AuthSessionSameSite {
  if (!value || value.trim().length === 0) {
    return DEFAULT_AUTH_SESSION_SAME_SITE;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "lax") {
    return "Lax";
  }
  if (normalized === "strict") {
    return "Strict";
  }
  if (normalized === "none") {
    return "None";
  }

  throw new Error(
    "RACKULA_AUTH_SESSION_COOKIE_SAMESITE must be one of: Lax, Strict, None.",
  );
}

function parseBoundedPositiveInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max?: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return fallback;
  }

  if (!/^\d+$/.test(trimmedValue)) {
    throw new Error(`${name} must be an integer >= ${min}.`);
  }

  const parsed = Number.parseInt(trimmedValue, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`${name} must be an integer >= ${min}.`);
  }

  if (typeof max === "number" && parsed > max) {
    throw new Error(`${name} must be <= ${max}.`);
  }

  return parsed;
}

function parseNonNegativeInteger(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return fallback;
  }

  if (!/^\d+$/.test(trimmedValue)) {
    throw new Error(`${name} must be an integer >= 0.`);
  }

  const parsed = Number.parseInt(trimmedValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be an integer >= 0.`);
  }

  return parsed;
}

function normalizeOrigin(input: string): string {
  try {
    const url = new URL(input);
    return url.origin;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid CORS origin "${input}": ${reason}`);
  }
}

function parseTrustedOrigins(corsOrigin: string | string[]): string[] {
  const rawOrigins = typeof corsOrigin === "string" ? [corsOrigin] : corsOrigin;

  if (rawOrigins.includes("*")) {
    return [];
  }

  const uniqueOrigins = new Set<string>();
  for (const rawOrigin of rawOrigins) {
    uniqueOrigins.add(normalizeOrigin(rawOrigin));
  }

  return [...uniqueOrigins];
}

function isApiRequestPath(pathname: string): boolean {
  return API_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthPublicPath(pathname: string): boolean {
  return AUTH_PUBLIC_PATHS.has(pathname);
}

function isStateChangingMethod(method: string): boolean {
  return STATE_CHANGING_METHODS.has(method.toUpperCase());
}

function buildLoginRedirectUrl(requestUrl: string, loginPath: string): string {
  if (loginPath.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(loginPath)) {
    throw new Error(`Invalid auth login path: "${loginPath}". External URLs are not allowed.`);
  }

  const url = new URL(requestUrl);
  const safePath = url.pathname.replace(/^\/+/, "/");
  const next = `${safePath}${url.search}${url.hash}`;
  return `${loginPath}?next=${encodeURIComponent(next)}`;
}

function extractCookieValue(
  cookieHeader: string | null | undefined,
  cookieName: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const cookies = cookieHeader.split(";");
  for (const rawCookie of cookies) {
    const trimmed = rawCookie.trim();
    if (trimmed.length === 0) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const name = trimmed.slice(0, separatorIndex);
    if (name !== cookieName) continue;

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/\\(["\\])/g, "$1");
    }

    if (!value) {
      return undefined;
    }

    // buildSessionCookieHeader() encodes values with encodeURIComponent().
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function createSessionSignature(payloadPart: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(AUTH_SESSION_SIGNATURE_CONTEXT)
    .update(payloadPart)
    .digest();
}

function cleanupInvalidatedAuthSessions(nowSeconds: number): void {
  // Prune expired in-memory invalidation records to keep map growth bounded.
  // A shared TTL-backed backing store should own this lifecycle in multi-instance deployments.
  for (const [sessionId, expiresAtSeconds] of invalidatedAuthSessionIds) {
    if (expiresAtSeconds <= nowSeconds) {
      invalidatedAuthSessionIds.delete(sessionId);
    }
  }
}

function isAuthSessionInvalidated(sessionId: string, nowSeconds: number): boolean {
  const expiresAtSeconds = invalidatedAuthSessionIds.get(sessionId);
  if (expiresAtSeconds === undefined) {
    return false;
  }

  if (expiresAtSeconds <= nowSeconds) {
    invalidatedAuthSessionIds.delete(sessionId);
    return false;
  }

  return true;
}

function resolveRequestOrigin(request: Request): string | null {
  const originHeader = request.headers.get("origin");
  if (originHeader && originHeader !== "null") {
    try {
      return normalizeOrigin(originHeader);
    } catch {
      return null;
    }
  }

  const refererHeader = request.headers.get("referer");
  if (!refererHeader) {
    return null;
  }

  try {
    return new URL(refererHeader).origin;
  } catch {
    return null;
  }
}

function isTrustedOrigin(requestOrigin: string, trustedOrigins: string[]): boolean {
  return trustedOrigins.includes(requestOrigin);
}

function toCookieExpirationDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toUTCString();
}

function buildSessionCookieHeader(
  token: string,
  expiresAtSeconds: number,
  securityConfig: Pick<
    ApiSecurityConfig,
    | "authSessionCookieName"
    | "authSessionCookieSecure"
    | "authSessionCookieSameSite"
  >,
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const maxAgeSeconds = Math.max(0, expiresAtSeconds - nowSeconds);

  const parts = [
    `${securityConfig.authSessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${securityConfig.authSessionCookieSameSite}`,
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${toCookieExpirationDate(expiresAtSeconds)}`,
  ];

  if (securityConfig.authSessionCookieSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

interface AuthSessionPayload {
  v: number;
  sub: string;
  sid: string;
  role?: string;
  iat: number;
  exp: number;
  idleExp: number;
  generation: number;
}

/**
 * Creates a signed auth session token from validated claims.
 *
 * @param claims - Session claims to encode into the signed payload.
 * @param secret - HMAC secret used to sign the payload.
 * @param options - Optional issuance-time and policy overrides.
 * @returns Signed session token string in `payload.signature` format.
 * @throws Error when claims or policy-derived timestamps are invalid.
 */
export function createSignedAuthSessionToken(
  claims: AuthSessionClaimsInput,
  secret: string,
  options: CreateAuthSessionTokenOptions = {},
): string {
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAgeSeconds =
    options.sessionMaxAgeSeconds ?? DEFAULT_AUTH_SESSION_MAX_AGE_SECONDS;
  const idleTimeoutSeconds =
    options.sessionIdleTimeoutSeconds ?? DEFAULT_AUTH_SESSION_IDLE_TIMEOUT_SECONDS;
  const sessionGeneration = options.sessionGeneration ?? 0;

  const subject = claims.sub.trim();
  if (!subject) {
    throw new Error("Auth session claims must include a non-empty subject.");
  }

  const sessionId = claims.sid?.trim() || randomUUID();
  const issuedAt = claims.iat ?? nowSeconds;
  const expiresAt = claims.exp ?? issuedAt + maxAgeSeconds;
  const idleExpiresAt =
    claims.idleExp ?? Math.min(expiresAt, issuedAt + idleTimeoutSeconds);
  const generation = claims.generation ?? sessionGeneration;

  if (!Number.isInteger(issuedAt) || issuedAt <= 0) {
    throw new Error("Auth session issued-at must be a positive integer.");
  }

  if (!Number.isInteger(expiresAt) || expiresAt <= issuedAt) {
    throw new Error("Auth session expiration must be after issued-at.");
  }

  if (!Number.isInteger(idleExpiresAt) || idleExpiresAt <= issuedAt) {
    throw new Error("Auth session idle expiration must be after issued-at.");
  }

  if (idleExpiresAt > expiresAt) {
    throw new Error(
      "Auth session idle expiration cannot exceed absolute expiration.",
    );
  }

  if (expiresAt - issuedAt > maxAgeSeconds) {
    throw new Error("Auth session lifetime exceeds configured max age.");
  }

  if (!Number.isInteger(generation) || generation < 0) {
    throw new Error("Auth session generation must be an integer >= 0.");
  }

  const payload: AuthSessionPayload = {
    v: 2,
    sub: subject,
    sid: sessionId,
    iat: issuedAt,
    exp: expiresAt,
    idleExp: idleExpiresAt,
    generation,
  };

  if (claims.role) {
    payload.role = claims.role;
  }

  const payloadPart = Buffer.from(JSON.stringify(payload), "utf-8").toString(
    "base64url",
  );
  const signaturePart = createSessionSignature(payloadPart, secret).toString(
    "base64url",
  );

  return `${payloadPart}.${signaturePart}`;
}

/**
 * Verifies and decodes a signed auth session token.
 *
 * @param token - Signed token produced by {@link createSignedAuthSessionToken}.
 * @param secret - HMAC secret expected to match the token signature.
 * @param options - Optional verification constraints for time and generation.
 * @returns Auth session claims when the token is valid; otherwise `null`.
 * @remarks This function returns `null` for all validation failures rather than throwing.
 * @remarks Side effect: expired in-memory invalidation entries may be pruned.
 */
export function verifySignedAuthSessionToken(
  token: string,
  secret: string,
  options: VerifyAuthSessionTokenOptions = {},
): AuthSessionClaims | null {
  if (
    token.length === 0 ||
    token.length > MAX_SIGNED_AUTH_SESSION_TOKEN_BYTES
  ) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadPart, signaturePart] = parts;
  if (!payloadPart || !signaturePart) {
    return null;
  }

  let presentedSignature: Buffer;
  try {
    presentedSignature = Buffer.from(signaturePart, "base64url");
  } catch {
    return null;
  }

  const expectedSignature = createSessionSignature(payloadPart, secret);
  if (
    presentedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(presentedSignature, expectedSignature)
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    const decoded = Buffer.from(payloadPart, "base64url").toString("utf-8");
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const payload = parsed as Partial<AuthSessionPayload>;
  if (
    payload.v !== 2 ||
    typeof payload.sub !== "string" ||
    !payload.sub.trim() ||
    typeof payload.sid !== "string" ||
    !payload.sid.trim() ||
    typeof payload.iat !== "number" ||
    !Number.isInteger(payload.iat) ||
    typeof payload.exp !== "number" ||
    !Number.isInteger(payload.exp) ||
    typeof payload.idleExp !== "number" ||
    !Number.isInteger(payload.idleExp) ||
    typeof payload.generation !== "number" ||
    !Number.isInteger(payload.generation) ||
    payload.generation < 0
  ) {
    return null;
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    payload.iat <= 0 ||
    payload.exp <= payload.iat ||
    payload.idleExp <= payload.iat ||
    payload.idleExp > payload.exp
  ) {
    return null;
  }

  const maxAgeSeconds =
    options.maxSessionMaxAgeSeconds ?? MAX_AUTH_SESSION_MAX_AGE_SECONDS;
  if (payload.exp - payload.iat > maxAgeSeconds) {
    return null;
  }

  if (payload.exp <= nowSeconds || payload.idleExp <= nowSeconds) {
    return null;
  }

  if (
    typeof options.expectedGeneration === "number" &&
    payload.generation !== options.expectedGeneration
  ) {
    return null;
  }

  cleanupInvalidatedAuthSessions(nowSeconds);
  if (isAuthSessionInvalidated(payload.sid, nowSeconds)) {
    return null;
  }

  const claims: AuthSessionClaims = {
    sub: payload.sub.trim(),
    sid: payload.sid.trim(),
    iat: payload.iat,
    exp: payload.exp,
    idleExp: payload.idleExp,
    generation: payload.generation,
  };

  if (typeof payload.role === "string" && payload.role.length > 0) {
    claims.role = payload.role;
  }

  return claims;
}

/**
 * Marks a session id as invalidated until its absolute expiration time.
 *
 * @param sessionId - Session id to revoke.
 * @param expiresAtSeconds - Absolute token expiration epoch seconds.
 * @returns `void`.
 * @remarks Side effect: mutates the in-memory invalidation map and prunes expired entries.
 */
export function invalidateAuthSession(
  sessionId: string,
  expiresAtSeconds: number,
): void {
  const trimmedSessionId = sessionId.trim();
  if (!trimmedSessionId) {
    return;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  cleanupInvalidatedAuthSessions(nowSeconds);

  if (expiresAtSeconds <= nowSeconds) {
    return;
  }

  // Bound in-memory invalidation tracking to avoid unbounded growth.
  // TODO: if MAX_INVALIDATED_AUTH_SESSIONS is increased materially, replace
  // this linear scan with a min-heap or shared sorted-set backend.
  while (invalidatedAuthSessionIds.size >= MAX_INVALIDATED_AUTH_SESSIONS) {
    let earliestExpiry = Number.POSITIVE_INFINITY;
    let earliestExpirySessionId: string | undefined;

    for (const [candidateSessionId, candidateExpiry] of invalidatedAuthSessionIds) {
      if (candidateExpiry < earliestExpiry) {
        earliestExpiry = candidateExpiry;
        earliestExpirySessionId = candidateSessionId;
      }
    }

    if (!earliestExpirySessionId) {
      break;
    }

    invalidatedAuthSessionIds.delete(earliestExpirySessionId);
  }

  invalidatedAuthSessionIds.set(trimmedSessionId, expiresAtSeconds);
}

/**
 * Clears all in-memory invalidated session ids.
 *
 * @returns `void`.
 * @remarks Side effect: empties the in-memory invalidation map.
 */
export function clearInvalidatedAuthSessions(): void {
  invalidatedAuthSessionIds.clear();
}

/**
 * Builds a `Set-Cookie` header value for an active auth session token.
 *
 * @param token - Signed auth session token.
 * @param expiresAtSeconds - Absolute cookie expiration epoch seconds.
 * @param securityConfig - Cookie naming and security attributes.
 * @returns Serialized `Set-Cookie` header value.
 */
export function createAuthSessionCookieHeader(
  token: string,
  expiresAtSeconds: number,
  securityConfig: Pick<
    ApiSecurityConfig,
    | "authSessionCookieName"
    | "authSessionCookieSecure"
    | "authSessionCookieSameSite"
  >,
): string {
  return buildSessionCookieHeader(token, expiresAtSeconds, securityConfig);
}

/**
 * Builds a `Set-Cookie` header value that expires the auth session cookie immediately.
 *
 * @param securityConfig - Cookie naming and security attributes.
 * @returns Serialized `Set-Cookie` header value with `Max-Age=0`.
 */
export function createExpiredAuthSessionCookieHeader(
  securityConfig: Pick<
    ApiSecurityConfig,
    | "authSessionCookieName"
    | "authSessionCookieSecure"
    | "authSessionCookieSameSite"
  >,
): string {
  const parts = [
    `${securityConfig.authSessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    `SameSite=${securityConfig.authSessionCookieSameSite}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];

  if (securityConfig.authSessionCookieSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

/**
 * Creates a refreshed auth session cookie when idle timeout is near expiry.
 *
 * @param claims - Verified claims from the current session token.
 * @param securityConfig - Signing and cookie policy used for refresh decisions.
 * @returns Refreshed `Set-Cookie` header value, or `null` when no refresh is needed.
 * @throws Error when refreshed claims fail token creation validation.
 */
export function createRefreshedAuthSessionCookieHeader(
  claims: AuthSessionClaims,
  securityConfig: Pick<
    ApiSecurityConfig,
    | "authSessionSecret"
    | "authSessionCookieName"
    | "authSessionCookieSecure"
    | "authSessionCookieSameSite"
    | "authSessionIdleTimeoutSeconds"
    | "authSessionGeneration"
    | "authSessionMaxAgeSeconds"
  >,
): string | null {
  if (!securityConfig.authSessionSecret) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (claims.idleExp - nowSeconds > AUTH_SESSION_REFRESH_THRESHOLD_SECONDS) {
    return null;
  }

  const refreshedIdleExpiry = Math.min(
    claims.exp,
    nowSeconds + securityConfig.authSessionIdleTimeoutSeconds,
  );

  if (refreshedIdleExpiry <= claims.idleExp) {
    return null;
  }

  const refreshedToken = createSignedAuthSessionToken(
    {
      ...claims,
      idleExp: refreshedIdleExpiry,
    },
    securityConfig.authSessionSecret,
    {
      sessionMaxAgeSeconds: securityConfig.authSessionMaxAgeSeconds,
      sessionIdleTimeoutSeconds: securityConfig.authSessionIdleTimeoutSeconds,
      sessionGeneration: securityConfig.authSessionGeneration,
    },
  );

  return createAuthSessionCookieHeader(refreshedToken, claims.exp, securityConfig);
}

/**
 * Resolves authenticated session claims from the request cookie.
 *
 * @param request - Incoming HTTP request.
 * @param securityConfig - Auth enablement, cookie name, and verification policy.
 * @returns Verified claims when authentication succeeds; otherwise `null`.
 * @remarks Returns `null` when auth is disabled, cookie is missing, or token validation fails.
 */
export function resolveAuthenticatedSessionClaims(
  request: Request,
  securityConfig: Pick<
    ApiSecurityConfig,
    | "authEnabled"
    | "authSessionSecret"
    | "authSessionCookieName"
    | "authSessionGeneration"
    | "authSessionMaxAgeSeconds"
  >,
): AuthSessionClaims | null {
  if (!securityConfig.authEnabled || !securityConfig.authSessionSecret) {
    return null;
  }

  const cookieHeader = request.headers.get("cookie");
  const token = extractCookieValue(
    cookieHeader,
    securityConfig.authSessionCookieName,
  );
  if (!token) {
    return null;
  }

  return verifySignedAuthSessionToken(token, securityConfig.authSessionSecret, {
    expectedGeneration: securityConfig.authSessionGeneration,
    maxSessionMaxAgeSeconds: securityConfig.authSessionMaxAgeSeconds,
  });
}

/**
 * Resolves and validates API security configuration from environment variables.
 *
 * @param env - Environment key/value map.
 * @returns Normalized security configuration used by API middleware.
 * @throws Error when required values are missing or invalid for the selected mode.
 */
export function resolveApiSecurityConfig(
  env: EnvMap = process.env,
): ApiSecurityConfig {
  const isProduction = env.NODE_ENV === "production";
  const allowInsecureCors = parseBoolean(env.ALLOW_INSECURE_CORS);
  const configuredOrigin = env.CORS_ORIGIN?.trim();
  const authMode = parseAuthMode(env.RACKULA_AUTH_MODE ?? env.AUTH_MODE);
  const authEnabled = authMode !== "none";

  let corsOrigin: string | string[];

  if (configuredOrigin) {
    corsOrigin = parseCorsOrigins(configuredOrigin);
  } else if (!isProduction) {
    corsOrigin = "*";
  } else if (allowInsecureCors) {
    corsOrigin = "*";
  } else {
    throw new Error(
      "Refusing to start in production without CORS_ORIGIN. Set CORS_ORIGIN=https://your-domain.com (or ALLOW_INSECURE_CORS=true to explicitly allow wildcard CORS).",
    );
  }

  if (isProduction && hasWildcardOrigin(corsOrigin) && !allowInsecureCors) {
    throw new Error(
      "Refusing to use wildcard CORS in production. Set ALLOW_INSECURE_CORS=true to opt in explicitly.",
    );
  }

  const writeAuthTokenRaw = env.RACKULA_API_WRITE_TOKEN ?? env.API_WRITE_TOKEN;
  const writeAuthToken = writeAuthTokenRaw?.trim() || undefined;

  const authSessionCookieName = parseAuthCookieName(
    env.RACKULA_AUTH_SESSION_COOKIE_NAME ?? env.AUTH_SESSION_COOKIE_NAME,
  );
  const authLoginPath = parseLoginPath(env.RACKULA_AUTH_LOGIN_PATH);
  const authSessionSecretRaw =
    env.RACKULA_AUTH_SESSION_SECRET ?? env.AUTH_SESSION_SECRET;
  const authSessionSecret = authSessionSecretRaw?.trim() || undefined;

  if (authEnabled && !authSessionSecret) {
    throw new Error(
      "RACKULA_AUTH_MODE is enabled but RACKULA_AUTH_SESSION_SECRET is not set.",
    );
  }

  if (
    authEnabled &&
    authSessionSecret &&
    authSessionSecret.length < SESSION_SECRET_MIN_LENGTH
  ) {
    throw new Error(
      `RACKULA_AUTH_SESSION_SECRET must be at least ${SESSION_SECRET_MIN_LENGTH} characters when auth is enabled.`,
    );
  }

  const authSessionMaxAgeSeconds = parseBoundedPositiveInteger(
    "RACKULA_AUTH_SESSION_MAX_AGE_SECONDS",
    env.RACKULA_AUTH_SESSION_MAX_AGE_SECONDS,
    DEFAULT_AUTH_SESSION_MAX_AGE_SECONDS,
    MIN_AUTH_SESSION_TIMEOUT_SECONDS,
    MAX_AUTH_SESSION_MAX_AGE_SECONDS,
  );

  const authSessionIdleTimeoutSeconds = parseBoundedPositiveInteger(
    "RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS",
    env.RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS,
    DEFAULT_AUTH_SESSION_IDLE_TIMEOUT_SECONDS,
    MIN_AUTH_SESSION_TIMEOUT_SECONDS,
    authSessionMaxAgeSeconds,
  );

  const authSessionGeneration = parseNonNegativeInteger(
    "RACKULA_AUTH_SESSION_GENERATION",
    env.RACKULA_AUTH_SESSION_GENERATION,
    0,
  );

  const authSessionCookieSameSite = parseAuthSessionSameSite(
    env.RACKULA_AUTH_SESSION_COOKIE_SAMESITE,
  );

  const authSessionCookieSecure = parseOptionalBoolean(
    "RACKULA_AUTH_SESSION_COOKIE_SECURE",
    env.RACKULA_AUTH_SESSION_COOKIE_SECURE,
    isProduction,
  );

  if (authSessionCookieSameSite === "None" && !authSessionCookieSecure) {
    throw new Error(
      "RACKULA_AUTH_SESSION_COOKIE_SAMESITE=None requires RACKULA_AUTH_SESSION_COOKIE_SECURE=true.",
    );
  }

  const csrfProtectionEnabled = parseOptionalBoolean(
    "RACKULA_AUTH_CSRF_PROTECTION",
    env.RACKULA_AUTH_CSRF_PROTECTION,
    authEnabled,
  );

  const csrfTrustedOrigins = parseTrustedOrigins(corsOrigin);

  if (authEnabled && csrfProtectionEnabled && csrfTrustedOrigins.length === 0) {
    throw new Error(
      "Auth-enabled mode with CSRF protection requires explicit CORS_ORIGIN values (wildcard origins are not allowed).",
    );
  }

  return {
    corsOrigin,
    allowInsecureCors,
    isProduction,
    writeAuthToken,
    authMode,
    authEnabled,
    authSessionSecret,
    authSessionCookieName,
    authSessionCookieSecure,
    authSessionCookieSameSite,
    authSessionMaxAgeSeconds,
    authSessionIdleTimeoutSeconds,
    authSessionGeneration,
    authLoginPath,
    csrfProtectionEnabled,
    csrfTrustedOrigins,
  };
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

    const claims = resolveAuthenticatedSessionClaims(c.req.raw, securityConfig);
    if (claims) {
      c.set("authSubject", claims.sub);
      c.set("authClaims", claims);

      const refreshedCookie = createRefreshedAuthSessionCookieHeader(
        claims,
        securityConfig,
      );
      if (refreshedCookie) {
        c.header("Set-Cookie", refreshedCookie, { append: true });
      }

      await next();
      return;
    }

    if (isApiRequestPath(pathname)) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required.",
        },
        401,
      );
    }

    return c.redirect(buildLoginRedirectUrl(c.req.url, securityConfig.authLoginPath));
  };
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
    if (isAuthPublicPath(pathname)) {
      await next();
      return;
    }

    const hasSessionCookie = Boolean(
      extractCookieValue(c.req.header("cookie"), securityConfig.authSessionCookieName),
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
          message:
            "CSRF validation failed: missing Origin or Referer header.",
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
