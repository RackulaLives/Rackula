/**
 * Resolves the post-login "next" redirect target from a query string,
 * guarding against open redirect. Only same-origin relative paths are
 * allowed; anything else (protocol-relative //, absolute URLs, or a
 * backslash that the browser will normalise to a protocol-relative URL,
 * e.g. `/\evil.com`) falls back to "/".
 */
export function getSafeNextPath(search: string, origin: string): string {
  const params = new URLSearchParams(search);
  const next = params.get("next") ?? "/";
  const trimmed = next.trim();

  if (!trimmed.startsWith("/")) return "/";

  try {
    const resolved = new URL(trimmed, origin);
    if (resolved.origin !== origin) return "/";
  } catch {
    return "/";
  }

  return trimmed;
}
