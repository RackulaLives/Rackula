/**
 * beforeunload risk predicate
 * Decides whether leaving the page right now could lose data. The handler
 * is attached only while this returns true (Chrome guidance: never attach
 * beforeunload permanently). Genuine in-flight loss means a debounced
 * session save that has not flushed yet, or in server mode a dirty layout
 * while the server is unreachable or a save is mid-flight. Dirty-but-
 * persisted changes in browser mode are safe in the localStorage working
 * copy and never warn.
 */

export interface UnloadRiskState {
  /** User setting: warn on unsaved changes (gates the whole warning) */
  warnOnUnsavedChanges: boolean;
  /** A debounced localStorage session save is scheduled but not yet flushed */
  sessionSavePending: boolean;
  /** A server save is debounce-pending or mid-flight */
  serverSavePending: boolean;
  /** This install persists to the API (approximated by ever having connected) */
  serverMode: boolean;
  /** The API is currently reachable (null = not checked yet, treated as reachable) */
  serverReachable: boolean | null;
  /** The layout has changes not yet saved to its durable home */
  isDirty: boolean;
}

export function shouldWarnBeforeUnload(state: UnloadRiskState): boolean {
  if (!state.warnOnUnsavedChanges) return false;
  if (state.sessionSavePending) return true;
  // null = health check pending, not confirmed unreachable — treat as reachable
  const serverDown = state.serverReachable === false;
  return (
    state.serverMode && state.isDirty && (serverDown || state.serverSavePending)
  );
}
