/**
 * Pending pre-carrier-migration registry (server-storage mode, #2517).
 *
 * In server-storage mode the client signals the one-time carrier-first
 * migration to the server rather than snapshotting locally (browser mode keeps
 * ensurePreCarrierBackup). When adapt-legacy-layout actually changes a layout,
 * it marks that layout's uuid pending here. The next save-to-server consumes
 * the mark and attaches the X-Rackula-Pre-Carrier-Migration header, so the
 * server backs up the prior YAML exactly once before the migrating overwrite.
 *
 * The registry is module-level process state (a Set keyed by uuid). It is
 * consume-once: taking a uuid returns whether it was pending and clears it.
 */

const pending = new Set<string>();

/** Mark a layout uuid as needing the pre-carrier-migration header on its next save. */
export function markPreCarrierMigrationPending(uuid: string): void {
  if (!uuid) return;
  pending.add(uuid);
}

/**
 * Return whether the uuid was pending and clear it (consume-once). A second
 * call for the same uuid returns false until it is marked again.
 */
export function takePreCarrierMigrationPending(uuid: string): boolean {
  return pending.delete(uuid);
}
