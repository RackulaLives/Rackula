/**
 * Browser-to-server opt-in. When a server is reachable in browser mode, this
 * uploads the active layout to the server (matching exportAllBrowser's
 * active-layout scope; full multi-layout upload rides on the future tabs work),
 * then sets the upgrade-only override. The caller reloads on a true result so
 * the app boots cleanly in server mode. Browser localStorage is never deleted.
 */
import { checkApiHealth, saveLayoutToServer } from "./api";
import {
  setApiAvailable,
  setStorageModeOverride,
  clearStorageModeOverride,
  getStorageModeOverride,
} from "./availability.svelte";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getImageStore } from "$lib/stores/images.svelte";

/** Result of a browser-to-server storage opt-in attempt: success, or failure with a reason. */
export type SwitchResult =
  | { switched: true }
  | {
      switched: false;
      reason: "unreachable" | "upload-failed" | "override-failed";
      message: string;
    };

/**
 * Switches the app from browser to server storage mode.
 *
 * Re-checks server health, uploads the active layout (matching exportAllBrowser's
 * active-layout scope), sets the upgrade-only override, then returns switched: true.
 * The caller reloads on success so the app boots cleanly in server mode.
 *
 * Returns switched: false with a reason when any step fails:
 * - "unreachable": health check failed
 * - "override-failed": localStorage refused to persist the server-mode preference
 * - "upload-failed": the layout upload threw before completing
 */
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

  // Mark the API available so saveLayoutToServer's guard passes, and set the
  // override BEFORE the upload so saveLayoutToServer sees server mode and routes
  // user images to the asset API (disk) instead of embedding them inline, which
  // would blow the server's 1MB layout PUT cap for image-heavy layouts.
  setApiAvailable(true);
  setStorageModeOverride();

  // setStorageModeOverride swallows a localStorage write failure (private
  // browsing, quota). If the override did not persist, the reload would land
  // back in browser mode, so report failure instead of a false success.
  if (getStorageModeOverride() !== "server") {
    setApiAvailable(false);
    return {
      switched: false,
      reason: "override-failed",
      message:
        "Could not save the server-mode preference in this browser. Check private browsing or storage settings.",
    };
  }

  const layoutStore = getLayoutStore();
  if (layoutStore.hasRack) {
    try {
      const snapshot = structuredClone($state.snapshot(layoutStore.layout));
      await saveLayoutToServer(snapshot, getImageStore().getUserImages(), null);
    } catch (error) {
      // Revert the opt-in so a failed upload leaves the user honestly in browser
      // mode with their browser data intact, not stranded mid-switch.
      clearStorageModeOverride();
      setApiAvailable(false);
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

  return { switched: true };
}
