/**
 * The server `updatedAt` the local working copy is based on. Threaded into PUTs
 * (so the server can detect divergence and snapshot) and refreshed whenever a
 * server layout is loaded or saved. A plain module variable: nothing reactive
 * depends on it, and a pure module keeps manager <-> load-pipeline cycle-free.
 */
let serverBaseUpdatedAt: string | null = null;
export function getServerBaseUpdatedAt(): string | null {
  return serverBaseUpdatedAt;
}
export function setServerBaseUpdatedAt(value: string | null): void {
  serverBaseUpdatedAt = value;
}
