/**
 * Browser-to-server opt-in. When a server is reachable in browser mode, this
 * uploads the active layout to the server (matching exportAllBrowser's
 * active-layout scope; full multi-layout upload rides on the future tabs work),
 * then sets the upgrade-only override. The caller reloads on a true result so
 * the app boots cleanly in server mode. Browser localStorage is never deleted.
 */
import { checkApiHealth, saveLayoutToServer } from "./api";
import { setApiAvailable, setStorageModeOverride } from "./availability.svelte";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getImageStore } from "$lib/stores/images.svelte";

export type SwitchResult =
  | { switched: true }
  | {
      switched: false;
      reason: "unreachable" | "upload-failed";
      message: string;
    };

export async function switchToServerMode(): Promise<SwitchResult> {
  // Re-verify health so a server that dropped since the probe does not strand
  // the user in a dead server mode.
  const healthy = await checkApiHealth();
  if (!healthy) {
    return {
      switched: false,
      reason: "unreachable",
      message: "The storage server is no longer reachable.",
    };
  }

  // Mark the API available so saveLayoutToServer's guard passes. We have just
  // confirmed the server is reachable; after the page reloads into server mode,
  // initializePersistence() re-establishes availability normally.
  setApiAvailable(true);

  const layoutStore = getLayoutStore();
  if (layoutStore.hasRack) {
    try {
      const snapshot = structuredClone($state.snapshot(layoutStore.layout));
      await saveLayoutToServer(snapshot, getImageStore().getUserImages(), null);
    } catch (error) {
      return {
        switched: false,
        reason: "upload-failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not upload your layout to the server.",
      };
    }
  }

  setStorageModeOverride();
  return { switched: true };
}
