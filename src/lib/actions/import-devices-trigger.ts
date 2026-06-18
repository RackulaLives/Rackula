/**
 * Module-level seam for the "Import devices" trigger.
 *
 * The device-library import opens a hidden <input type="file"> that lives in
 * DialogOrchestrator (the element and its onchange parser must stay in the
 * component). DialogOrchestrator registers its file-picker trigger here on
 * mount; the module dispatch (createActionDispatch) and App both run the
 * command through runImportDevices, so the palette, app menu, and keyboard all
 * reach the one trigger identically.
 *
 * Mirrors how the rest of the dispatch resolves singletons: callers depend on
 * this module, not on a component-instance ref.
 */
type ImportDevicesTrigger = () => void;

let trigger: ImportDevicesTrigger | null = null;

/**
 * Register the file-picker trigger. DialogOrchestrator calls this on mount and
 * passes the cleanup it returns to its $effect teardown.
 */
export function registerImportDevicesTrigger(
  fn: ImportDevicesTrigger,
): () => void {
  trigger = fn;
  return () => {
    if (trigger === fn) trigger = null;
  };
}

/** Open the device-library file picker. No-op before the orchestrator mounts. */
export function runImportDevices(): void {
  trigger?.();
}
