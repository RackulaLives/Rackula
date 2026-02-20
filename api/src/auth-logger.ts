/**
 * Structured authentication event logger.
 *
 * Emits JSON lines to stdout for Docker/self-hosted log forwarding.
 * All sensitive fields (tokens, passwords, session IDs) are redacted.
 */

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

// Fields that must never appear in logs.
const REDACTED_FIELDS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-forwarded-for",
]);

/**
 * Extracts minimal, safe request context for logging.
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
  const line = JSON.stringify(event);
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
