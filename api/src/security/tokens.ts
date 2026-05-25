import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { extractCookieValue, createAuthSessionCookieHeader } from "./cookies";
import {
  cleanupInvalidatedAuthSessions,
  isAuthSessionInvalidated,
} from "./sessions";
import type {
  ApiSecurityConfig,
  AuthSessionClaims,
  AuthSessionClaimsInput,
  CreateAuthSessionTokenOptions,
  VerifyAuthSessionTokenOptions,
} from "./types";

const MAX_SIGNED_AUTH_SESSION_TOKEN_BYTES = 8 * 1024;
const DEFAULT_AUTH_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const DEFAULT_AUTH_SESSION_IDLE_TIMEOUT_SECONDS = 30 * 60;
const MAX_AUTH_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const AUTH_SESSION_REFRESH_THRESHOLD_SECONDS = 60;
// Domain-separates session HMAC signatures from other potential HMAC uses.
const AUTH_SESSION_SIGNATURE_CONTEXT = "rackula:session:v2:";

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

function createSessionSignature(payloadPart: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(AUTH_SESSION_SIGNATURE_CONTEXT)
    .update(payloadPart)
    .digest();
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
    options.sessionIdleTimeoutSeconds ??
    DEFAULT_AUTH_SESSION_IDLE_TIMEOUT_SECONDS;
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

  return createAuthSessionCookieHeader(
    refreshedToken,
    claims.exp,
    securityConfig,
  );
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
