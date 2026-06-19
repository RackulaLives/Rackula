/**
 * Module-level seam for the "Restore from file" trigger.
 *
 * Restoring replaces the working copy with a file the user picks. When there are
 * changes not yet in any exported file, a confirm-replace dialog offers to
 * export first; that dialog and its export-first-then-load flow live in
 * RestoreFromFileDialog (the stateful UI must stay in a component).
 * RestoreFromFileDialog registers its trigger here on mount; the module dispatch
 * (createActionDispatch) and the Toolbar app-menu dispatch both run the command
 * through runRestoreFromFile, so the palette, app menu, and keyboard all reach
 * the one trigger identically.
 *
 * Mirrors import-devices-trigger: callers depend on this module, not on a
 * component-instance ref.
 */
type RestoreFromFileTrigger = () => void;

let trigger: RestoreFromFileTrigger | null = null;

/**
 * Register the restore trigger. RestoreFromFileDialog calls this on mount and
 * passes the cleanup it returns to its $effect teardown.
 */
export function registerRestoreFromFileTrigger(
  fn: RestoreFromFileTrigger,
): () => void {
  trigger = fn;
  return () => {
    if (trigger === fn) trigger = null;
  };
}

/** Start the restore-from-file flow. No-op before the dialog mounts. */
export function runRestoreFromFile(): void {
  trigger?.();
}
