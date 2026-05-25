const MAX_INVALIDATED_AUTH_SESSIONS = 10_000;

// Session invalidations are stored in-memory for the current API process only.
// This is acceptable for the current single-process baseline but does not survive
// restarts or coordinate across replicas. For distributed/HA deployments, replace
// this map with a shared TTL-backed store (for example Redis).
// Tracking: https://github.com/RackulaLives/Rackula/issues/1269
const invalidatedAuthSessionIds = new Map<string, number>();

/**
 * Prunes invalidation entries whose expiry has passed.
 *
 * @internal Called by token verification and invalidation paths to keep the
 * in-memory map bounded.
 */
export function cleanupInvalidatedAuthSessions(nowSeconds: number): void {
  // Prune expired in-memory invalidation records to keep map growth bounded.
  // A shared TTL-backed backing store should own this lifecycle in multi-instance deployments.
  for (const [sessionId, expiresAtSeconds] of invalidatedAuthSessionIds) {
    if (expiresAtSeconds <= nowSeconds) {
      invalidatedAuthSessionIds.delete(sessionId);
    }
  }
}

/**
 * Returns whether the given session id is currently marked as invalidated.
 *
 * @internal Used by token verification to enforce server-side revocation.
 */
export function isAuthSessionInvalidated(
  sessionId: string,
  nowSeconds: number,
): boolean {
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

    for (const [
      candidateSessionId,
      candidateExpiry,
    ] of invalidatedAuthSessionIds) {
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
