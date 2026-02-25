/**
 * Structured authentication event logger.
 *
 * Emits JSON lines to stdout for Docker/self-hosted log forwarding.
 * All sensitive fields (tokens, passwords, session IDs) are redacted.
 */
import { createHmac } from "node:crypto";

export type AuthEventType =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.logout"
  | "auth.session.invalid"
  | "auth.denied";

export interface AuthEvent {
  timestamp: string;
  event: AuthEventType;
  subject?: string;
  reason?: string;
  method?: string;
  path?: string;
  ip?: string;
}

const DEFAULT_AUTH_LOG_HASH_KEY = "rackula:auth-log:v1:default";
export const MIN_AUTH_LOG_HASH_KEY_LENGTH = 16;
type AuthIdentifierType = "subject" | "ip";
let authLogHashKey: string | undefined;
let hasWarnedDefaultHashKey = false;

export function resetAuthLogHashConfigForTests(): void {
  authLogHashKey = undefined;
  hasWarnedDefaultHashKey = false;
}

export function getAuthLogHashKeyForTests(): string | undefined {
  return authLogHashKey;
}

// Fields that must never appear in logs.
const REDACTED_FIELDS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-forwarded-for",
]);

/**
 * Configures the keyed hash input used to pseudonymize log identifiers.
 */
export function configureAuthLogHashKey(hashKey: string | undefined): void {
  const normalized = hashKey?.trim();
  const normalizedLength = normalized?.length ?? 0;
  if (
    normalizedLength > 0 &&
    normalizedLength < MIN_AUTH_LOG_HASH_KEY_LENGTH
  ) {
    // Primary validation lives in resolveApiSecurityConfig(security.ts); this is a
    // defensive fallback for direct caller usage that bypasses config resolution.
    console.warn(
      `[auth-logger] Ignoring auth log hash key shorter than ${MIN_AUTH_LOG_HASH_KEY_LENGTH} characters. This fallback applies only when resolveApiSecurityConfig is not used.`,
    );
    authLogHashKey = undefined;
  } else {
    authLogHashKey = normalizedLength > 0 ? normalized : undefined;
    if (authLogHashKey) {
      console.debug(
        `[auth-logger] Auth log hash key configured (>=${MIN_AUTH_LOG_HASH_KEY_LENGTH} chars).`,
      );
    }
  }
  hasWarnedDefaultHashKey = false;
}

function getAuthLogHashKey(): string {
  if (authLogHashKey) {
    return authLogHashKey;
  }

  if (!hasWarnedDefaultHashKey) {
    console.warn(
      "[auth-logger] No auth log hash key configured. Falling back to default auth log hash key; configure RACKULA_AUTH_LOG_HASH_KEY to avoid predictable cross-instance pseudonyms.",
    );
    hasWarnedDefaultHashKey = true;
  }

  return DEFAULT_AUTH_LOG_HASH_KEY;
}

/**
 * Pseudonymizes potentially identifying values using a keyed SHA-256 hash.
 */
export function pseudonymizeIdentifier(
  value: string,
  identifierType: AuthIdentifierType,
): string {
  const normalized = normalizeIdentifier(value);
  if (!normalized) {
    throw new Error("Cannot pseudonymize an empty identifier value.");
  }

  return pseudonymizeNormalizedIdentifier(normalized, identifierType);
}

function normalizeIdentifier(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function pseudonymizeNormalizedIdentifier(
  normalizedValue: string,
  identifierType: AuthIdentifierType,
): string {
  return createHmac("sha256", getAuthLogHashKey())
    .update(`${identifierType}:${normalizedValue}`)
    .digest("hex");
}

function pseudonymizeOptionalIdentifier(
  value: string | undefined,
  identifierType: AuthIdentifierType,
): string | undefined {
  const normalized = normalizeIdentifier(value);
  if (!normalized) {
    return undefined;
  }

  return pseudonymizeNormalizedIdentifier(normalized, identifierType);
}

/**
 * Extracts minimal, safe request context for logging.
 *
 * Uses `x-real-ip` exclusively for client IP — this header is set by the trusted
 * reverse proxy (nginx). `x-forwarded-for` is intentionally excluded because it
 * is client-spoofable and is already listed in {@link REDACTED_FIELDS}.
 */
export function extractRequestContext(
  request: Request,
): Pick<AuthEvent, "method" | "path" | "ip"> {
  const url = new URL(request.url);
  return {
    method: request.method,
    path: url.pathname,
    ip: request.headers.get("x-real-ip") ?? undefined,
  };
}

/**
 * Redacts a header map, replacing sensitive values with "[REDACTED]".
 */
export function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = REDACTED_FIELDS.has(key.toLowerCase())
      ? "[REDACTED]"
      : value;
  }
  return redacted;
}

/**
 * Emits a structured auth event as a JSON line to stdout.
 */
export function emitAuthEvent(event: AuthEvent): void {
  const sanitizedEvent: AuthEvent = {
    ...event,
    subject: pseudonymizeOptionalIdentifier(event.subject, "subject"),
    ip: pseudonymizeOptionalIdentifier(event.ip, "ip"),
  };
  const line = JSON.stringify(sanitizedEvent);
  // Use process.stdout.write for atomic line output in Docker environments.
  process.stdout.write(`${line}\n`);
}

/**
 * Convenience: build and emit an auth event with request context.
 */
export function logAuthEvent(
  eventType: AuthEventType,
  request: Request,
  extra?: { subject?: string; reason?: string },
): void {
  const ctx = extractRequestContext(request);
  emitAuthEvent({
    timestamp: new Date().toISOString(),
    event: eventType,
    ...ctx,
    ...extra,
  });
}

/**
 * Fault-tolerant wrapper around {@link logAuthEvent}.
 *
 * Swallows and logs errors so that a logging failure (e.g. HMAC misconfiguration)
 * never crashes the request handler that called it.
 */
export function safeLogAuthEvent(
  eventType: AuthEventType,
  request: Request,
  extra?: { subject?: string; reason?: string },
): void {
  try {
    logAuthEvent(eventType, request, extra);
  } catch (err) {
    console.error("[auth-logger] Failed to log auth event:", err);
  }
}
