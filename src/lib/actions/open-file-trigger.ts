/**
 * Module-level seam for the "Open layout" (Ctrl+O) replace-guard trigger.
 *
 * Opening a local file replaces the working copy. handleLoad (browser mode)
 * checks changesSinceExport itself and only calls this trigger when there are
 * changes not yet in any exported file; a fully backed-up copy goes straight to
 * the file picker without involving this trigger at all (#2987). The confirm
 * dialog and its export-first-then-load flow live in OpenFileGuardDialog (the
 * stateful UI must stay in a component), which registers its trigger here on
 * mount.
 *
 * Mirrors restore-file-trigger: callers depend on this module, not on a
 * component-instance ref.
 */
type OpenFileTrigger = () => void;

let trigger: OpenFileTrigger | null = null;

/**
 * Register the open-file confirm trigger. OpenFileGuardDialog calls this on
 * mount and passes the cleanup it returns to its $effect teardown.
 */
export function registerOpenFileTrigger(fn: OpenFileTrigger): () => void {
  trigger = fn;
  return () => {
    if (trigger === fn) trigger = null;
  };
}

/** Show the open-file replace-guard dialog. No-op before the dialog mounts. */
export function runOpenFileFlow(): void {
  trigger?.();
}
