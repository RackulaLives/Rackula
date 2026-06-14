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
 * - No recorded base (a legacy session from before the echo model): the
 *   relationship to the server cannot be proven, so the local copy must not
 *   silently overwrite the server's. Load the server copy and snapshot the
 *   local one. Without a base the next PUT would omit the echo header and the
 *   server would overwrite without snapshotting, losing a diverged server copy.
 * - The server's updatedAt still equals the base this copy was reconciled
 *   against: the local copy is simply ahead of an unchanged server ("ahead"),
 *   so keep it.
 * - Otherwise the two have diverged: resolve last-write-wins by recency. When
 *   the server is newer, load the server copy and snapshot the losing local
 *   copy (snapshotLocalUuid) so it is not lost; when local is newer, keep it
 *   ("local-newer") - the next PUT echoes the stale base, so the server
 *   snapshots its losing copy on the mismatch.
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
  if (localServerUpdatedAt === null) {
    return { kind: "load-server", server: match, snapshotLocalUuid: localUuid };
  }
  if (localServerUpdatedAt === match.updatedAt) {
    return { kind: "restore-local", reason: "ahead" };
  }
  if (isServerNewer(localSavedAt, match.updatedAt)) {
    return { kind: "load-server", server: match, snapshotLocalUuid: localUuid };
  }
  return { kind: "restore-local", reason: "local-newer" };
}

export interface ReconcileDeps {
  serializeLosingCopy: () => Promise<string>;
  uploadSnapshot: (uuid: string, yaml: string) => Promise<boolean>;
  loadServer: (item: SavedLayoutItem) => Promise<void>;
  restoreLocal: (reason: "ahead" | "unknown-to-server" | "local-newer") => void;
  toast: (message: string, type: "success" | "info" | "warning") => void;
}

export async function applyReconcile(
  action: ReconcileAction,
  deps: ReconcileDeps,
): Promise<void> {
  if (action.kind === "restore-local") {
    deps.restoreLocal(action.reason);
    if (action.reason === "local-newer") {
      deps.toast(
        "Kept your newer local changes; the server's copy will be saved as a snapshot when you save.",
        "info",
      );
    }
    return;
  }
  // load-server: snapshot the losing local copy first; a snapshot failure must
  // never discard it (issue #2041 AC7), so fall back to keeping the local copy.
  if (action.snapshotLocalUuid) {
    const yaml = await deps.serializeLosingCopy();
    const ok = await deps.uploadSnapshot(action.snapshotLocalUuid, yaml);
    if (!ok) {
      deps.restoreLocal("local-newer");
      deps.toast(
        "Could not back up your local copy, so it was kept. Reload to retry.",
        "warning",
      );
      return;
    }
  }
  await deps.loadServer(action.server);
  deps.toast(
    "Server had a newer version; your previous copy was saved as a snapshot.",
    "info",
  );
}
