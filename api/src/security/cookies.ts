import type { ApiSecurityConfig } from "./types";

/**
 * Extracts and URL-decodes a named cookie value from a `Cookie` header string.
 *
 * @param cookieHeader - Raw `Cookie` header value, or `null`/`undefined` when absent.
 * @param cookieName - Cookie name to resolve.
 * @returns Decoded cookie value, or `undefined` when the header is missing, the
 * named cookie is not present, the stored value is empty, or decoding fails.
 */
export function extractCookieValue(
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
