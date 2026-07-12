/**
 * Module-level seam for the "Open layout" replace-guard trigger.
 *
 * Opening a file replaces the working copy, from any of three entry points:
 * Ctrl+O / the palette "Open layout" command (browser mode, via handleLoad),
 * and LoadDialog's two server-mode sub-flows, "Import from local file" and
 * clicking a saved-on-server row (#2987). Every caller routes its load
 * through runOpenFileFlow, which checks changesSinceExport itself so any
 * caller is safe without pre-checking dirty state: a fully backed-up copy
 * runs loadAction immediately, while unexported changes defer to the
 * registered trigger, which shows the confirm dialog (Cancel / Export first /
 * Replace) before loadAction runs. The confirm dialog and its
 * export-first-then-load flow live in OpenFileGuardDialog (the stateful UI
 * must stay in a component), which registers its trigger here on mount and
 * is the single dialog shared by all three entry points.
 *
 * Mirrors restore-file-trigger's module-seam shape; unlike that trigger
 * (whose registered function does its own dirty check inline in the
 * component), this one centralizes the check here so callers never need to
 * duplicate it at each call site.
 */
import { getLayoutStore } from "$lib/stores/layout.svelte";

/**
 * The deferred load to run once the guard clears. Called with `guarded: true`
 * when the user confirmed replacing unexported changes, `false` when the
 * working copy was already fully backed up and the guard let it through
 * immediately, so callers can vary the success toast accordingly (#2987 AC2).
 */
export type OpenFileLoadAction = (guarded: boolean) => unknown;

type OpenFileTrigger = (loadAction: OpenFileLoadAction) => void;

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

/**
 * Guard a load action behind the open-file replace-confirm flow. Runs
 * `loadAction(false)` immediately when the working copy has no changes since
 * the last export; otherwise defers to the registered trigger (opens the
 * confirm dialog), which runs `loadAction(true)` only if the user confirms.
 * No-op (loadAction dropped) if the dialog hasn't mounted yet when dirty.
 */
export function runOpenFileFlow(loadAction: OpenFileLoadAction): void {
  if (getLayoutStore().changesSinceExport > 0) {
    trigger?.(loadAction);
  } else {
    void loadAction(false);
  }
}
