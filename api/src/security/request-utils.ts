/**
 * Shared request utilities used by CSRF and origin-policy middleware.
 *
 * @module request-utils
 */

/**
 * Normalizes a URL string to its `origin` form (`scheme://host[:port]`).
 *
 * @throws Error when the input is not a parseable URL.
 */
export function normalizeOrigin(input: string): string {
  try {
    const url = new URL(input);
    return url.origin;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid CORS origin "${input}": ${reason}`, {
      cause: error,
    });
  }
}

/**
 * Resolves the origin of a request from `Origin` or `Referer` headers.
 *
 * Checks the `Origin` header first (standard for CORS/CSRF), then falls back
 * to the `Referer` header's origin. Returns `null` when neither header is
 * present or parseable. Treats the literal string `"null"` as absent
 * (a known CSRF attack vector).
 *
 * When `Origin` is present but malformed, falls through to `Referer` rather
 * than rejecting immediately. This avoids false 403s for requests that
 * include a valid Referer but a garbled Origin (e.g., from misconfigured
 * proxies).
 */
export function resolveRequestOrigin(request: Request): string | null {
  const originHeader = request.headers.get("origin");
  if (originHeader && originHeader !== "null") {
    try {
      return normalizeOrigin(originHeader);
    } catch {
      // Malformed Origin: fall through to Referer rather than rejecting.
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

/**
 * Checks whether an origin string is in the list of trusted origins.
 */
export function isTrustedOrigin(
  requestOrigin: string,
  trustedOrigins: string[],
): boolean {
  return trustedOrigins.includes(requestOrigin);
}