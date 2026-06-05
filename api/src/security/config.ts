import { createHmac, randomBytes } from "node:crypto";
import { MIN_AUTH_LOG_HASH_KEY_LENGTH } from "../auth-logger";
import { logger } from "../logger";
import { normalizeOrigin } from "./request-utils";
import type {
  ApiSecurityConfig,
  AuthMode,
  AuthSessionSameSite,
  EnvMap,
} from "./types";

const AUTH_MODES = new Set<AuthMode>(["none", "oidc", "local"]);
const SESSION_SECRET_MIN_LENGTH = 32;
const DEFAULT_AUTH_COOKIE_NAME = "rackula_auth_session";
const DEFAULT_AUTH_LOGIN_PATH = "/auth/login";
const COOKIE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const CORS_ORIGIN_EMPTY_ERROR =
  "CORS_ORIGIN is set but empty. Provide at least one origin.";
const DEFAULT_AUTH_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const DEFAULT_AUTH_SESSION_IDLE_TIMEOUT_SECONDS = 30 * 60;
const AUTH_LOG_HASH_CONTEXT = "rackula:auth-log:v1:";
const GENERATED_AUTH_LOG_HASH_KEY_BYTES = 32;
const MIN_AUTH_SESSION_TIMEOUT_SECONDS = 60;
const MAX_AUTH_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_AUTH_SESSION_SAME_SITE: AuthSessionSameSite = "Lax";

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

function deriveAuthLogHashKey(authSessionSecret: string): string {
  return createHmac("sha256", authSessionSecret)
    .update(AUTH_LOG_HASH_CONTEXT)
    .digest("hex");
}

function resolveAuthLogHashKey(options: {
  authLogHashKeyRaw: string | undefined;
  authSessionSecret: string | undefined;
  isProduction: boolean;
}): string {
  const normalizedAuthLogHashKey = options.authLogHashKeyRaw?.trim();
  if (normalizedAuthLogHashKey) {
    if (normalizedAuthLogHashKey.length < MIN_AUTH_LOG_HASH_KEY_LENGTH) {
      throw new Error(
        `RACKULA_AUTH_LOG_HASH_KEY must be at least ${MIN_AUTH_LOG_HASH_KEY_LENGTH} characters.`,
      );
    }
    return normalizedAuthLogHashKey;
  }

  if (options.authSessionSecret) {
    return deriveAuthLogHashKey(options.authSessionSecret);
  }

  if (options.isProduction) {
    logger.warn(
      "⚠ Auth log hash key is not configured and no auth session secret is available. Generating an ephemeral per-process key. Set RACKULA_AUTH_LOG_HASH_KEY in production for stable pseudonymization.",
    );
  }

  return randomBytes(GENERATED_AUTH_LOG_HASH_KEY_BYTES).toString("hex");
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

function parseAuthSessionSameSite(
  value: string | undefined,
): AuthSessionSameSite {
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

/**
 * Parse a quota value from environment variables.
 * Accepts 0 (unlimited) or positive integers up to `max`.
 * Falls back to `fallback` when unset or empty.
 */
function parseQuotaValue(
  name: string,
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return fallback;
  }

  if (!/^\d+$/.test(trimmedValue)) {
    throw new Error(`${name} must be 0 (unlimited) or a positive integer.`);
  }

  const parsed = Number.parseInt(trimmedValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be 0 (unlimited) or a positive integer.`);
  }

  // 0 means unlimited, no upper bound check needed
  if (parsed === 0) {
    return 0;
  }

  if (parsed > max) {
    throw new Error(`${name} must be <= ${max} or 0 for unlimited.`);
  }

  return parsed;
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
  const authMode = parseAuthMode(env.RACKULA_AUTH_MODE);
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

  const writeAuthTokenRaw = env.RACKULA_API_WRITE_TOKEN;
  const writeAuthToken = writeAuthTokenRaw?.trim() || undefined;

  const authSessionCookieName = parseAuthCookieName(
    env.RACKULA_AUTH_SESSION_COOKIE_NAME,
  );
  const authLoginPath = parseLoginPath(env.RACKULA_AUTH_LOGIN_PATH);
  const authSessionSecretRaw = env.RACKULA_AUTH_SESSION_SECRET;
  const authSessionSecret = authSessionSecretRaw?.trim() || undefined;
  const authLogHashKeyRaw = env.RACKULA_AUTH_LOG_HASH_KEY;

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

  const authLogHashKey = resolveAuthLogHashKey({
    authLogHashKeyRaw,
    authSessionSecret,
    isProduction,
  });

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

  // Origin policy is enabled when auth is enabled and CSRF protection is active
  // (both require explicit trusted origins). When disabled (no auth or wildcard
  // CORS), origin checks are redundant — write-token auth alone protects write routes.
  const originPolicyEnabled = authEnabled && csrfProtectionEnabled;

  // Rate limiting configuration
  const DEFAULT_RATE_LIMIT_WRITE_MAX = 30;
  const DEFAULT_RATE_LIMIT_WRITE_WINDOW_MS = 60_000;
  const DEFAULT_RATE_LIMIT_READ_MAX = 120;
  const DEFAULT_RATE_LIMIT_READ_WINDOW_MS = 60_000;

  const rateLimitEnabled = parseOptionalBoolean(
    "RACKULA_RATE_LIMIT_ENABLED",
    env.RACKULA_RATE_LIMIT_ENABLED,
    true,
  );

  const rateLimitWriteMaxRequests = parseBoundedPositiveInteger(
    "RACKULA_RATE_LIMIT_WRITE_MAX",
    env.RACKULA_RATE_LIMIT_WRITE_MAX,
    DEFAULT_RATE_LIMIT_WRITE_MAX,
    1,
    10_000,
  );

  const rateLimitWriteWindowMs = parseBoundedPositiveInteger(
    "RACKULA_RATE_LIMIT_WRITE_WINDOW_MS",
    env.RACKULA_RATE_LIMIT_WRITE_WINDOW_MS,
    DEFAULT_RATE_LIMIT_WRITE_WINDOW_MS,
    1000,
    3_600_000,
  );

  const rateLimitReadMaxRequests = parseBoundedPositiveInteger(
    "RACKULA_RATE_LIMIT_READ_MAX",
    env.RACKULA_RATE_LIMIT_READ_MAX,
    DEFAULT_RATE_LIMIT_READ_MAX,
    1,
    100_000,
  );

  const rateLimitReadWindowMs = parseBoundedPositiveInteger(
    "RACKULA_RATE_LIMIT_READ_WINDOW_MS",
    env.RACKULA_RATE_LIMIT_READ_WINDOW_MS,
    DEFAULT_RATE_LIMIT_READ_WINDOW_MS,
    1000,
    3_600_000,
  );

  // Storage quota configuration
  const DEFAULT_MAX_LAYOUTS = 100;
  const DEFAULT_MAX_ASSETS_PER_LAYOUT = 50;

  const maxLayouts = parseQuotaValue(
    "RACKULA_MAX_LAYOUTS",
    env.RACKULA_MAX_LAYOUTS,
    DEFAULT_MAX_LAYOUTS,
    10_000,
  );

  const maxAssetsPerLayout = parseQuotaValue(
    "RACKULA_MAX_ASSETS_PER_LAYOUT",
    env.RACKULA_MAX_ASSETS_PER_LAYOUT,
    DEFAULT_MAX_ASSETS_PER_LAYOUT,
    1_000,
  );

  return {
    corsOrigin,
    allowInsecureCors,
    isProduction,
    writeAuthToken,
    authMode,
    authEnabled,
    authSessionSecret,
    authLogHashKey,
    authSessionCookieName,
    authSessionCookieSecure,
    authSessionCookieSameSite,
    authSessionMaxAgeSeconds,
    authSessionIdleTimeoutSeconds,
    authSessionGeneration,
    authLoginPath,
    csrfProtectionEnabled,
    csrfTrustedOrigins,
    originPolicyEnabled,
    rateLimitEnabled,
    rateLimitWriteMaxRequests,
    rateLimitWriteWindowMs,
    rateLimitReadMaxRequests,
    rateLimitReadWindowMs,
    maxLayouts,
    maxAssetsPerLayout,
  };
}
