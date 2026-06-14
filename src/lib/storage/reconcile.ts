import type { SavedLayoutItem } from "./api";
import { isServerNewer } from "./working-copy";

export type ReconcileAction =
  | { kind: "restore-local"; reason: "ahead" | "unknown-to-server" | "local-newer" }
  | { kind: "load-server"; server: SavedLayoutItem; snapshotLocalUuid: string | null };

/**
 * Decide what to do with a local working copy at startup against the server's
 * current layout list. The local copy is matched to a server layout by UUID:
 *
 * - No UUID match: the server has never seen this copy ("unknown-to-server"),
 *   so keep the local copy.
 * - The server's updatedAt still equals the base this copy was reconciled
 *   against: the local copy is simply ahead of an unchanged server ("ahead"),
 *   so keep it.
 * - Otherwise the two have diverged: resolve last-write-wins by recency. When
 *   the server is newer, load the server copy and snapshot the losing local
 *   copy (snapshotLocalUuid) so it is not lost; when local is newer, keep it
 *   ("local-newer").
 */
export function reconcileSession(args: {
  localUuid: string | null;
  localSavedAt: string | null;
  localServerUpdatedAt: string | null;
  serverLayouts: SavedLayoutItem[];
}): ReconcileAction {
  const { localUuid, localSavedAt, localServerUpdatedAt, serverLayouts } = args;
  const match = localUuid ? serverLayouts.find((l) => l.id === localUuid) : undefined;
  if (!match) return { kind: "restore-local", reason: "unknown-to-server" };
  if (localServerUpdatedAt !== null && localServerUpdatedAt === match.updatedAt) {
    return { kind: "restore-local", reason: "ahead" };
  }
  if (isServerNewer(localSavedAt, match.updatedAt)) {
    return { kind: "load-server", server: match, snapshotLocalUuid: localUuid };
  }
  return { kind: "restore-local", reason: "local-newer" };
}
