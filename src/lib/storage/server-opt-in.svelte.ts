/**
 * Browser-to-server opt-in. When a server is reachable in browser mode, this
 * uploads the active layout to the server (matching exportAllBrowser's
 * active-layout scope; full multi-layout upload rides on the future tabs work),
 * then sets the upgrade-only override. The caller reloads on a true result so
 * the app boots cleanly in server mode. Browser localStorage is never deleted.
 *
 * When a server layout already exists under the active layout's UUID, the switch
 * does not overwrite it blindly. switchToServerMode returns a "conflict" result
 * carrying the server copy's metadata so the caller can ask the user to replace
 * it (confirmServerOverwrite) or keep it (adoptServerCopy). See #2608.
 */
import { checkApiHealth, saveLayoutToServer, listSavedLayouts } from "./api";
import {
  setApiAvailable,
  setStorageModeOverride,
  clearStorageModeOverride,
  getStorageModeOverride,
} from "./availability.svelte";
import { setServerBaseUpdatedAt } from "./server-base";
import { clearSession } from "./working-copy";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getImageStore } from "$lib/stores/images.svelte";

/** Metadata of a server layout that already exists under the active layout's UUID. */
export interface ServerCopyInfo {
  id: string;
  updatedAt: string;
  name: string;
  rackCount: number;
  deviceCount: number;
}

/** Result of a browser-to-server storage opt-in attempt: success, or failure with a reason. */
export type SwitchResult =
  | { switched: true }
  | {
      switched: false;
      reason:
        | "unreachable"
        | "upload-failed"
        | "override-failed"
        | "probe-failed";
      message: string;
    }
  | { switched: false; reason: "conflict"; serverCopy: ServerCopyInfo };

const OVERRIDE_FAILED_MESSAGE =
  "Could not save the server-mode preference in this browser. Check private browsing or storage settings.";

const UNREACHABLE_MESSAGE = "The storage server is no longer reachable.";

function overrideFailedResult(): SwitchResult {
  return {
    switched: false,
    reason: "override-failed",
    message: OVERRIDE_FAILED_MESSAGE,
  };
}

/**
 * Persist the server-mode override so getStorageMode resolves to "server" and
 * saveLayoutToServer routes user images to the asset API (disk) instead of
 * embedding them inline, which would blow the server's 1MB layout PUT cap.
 *
 * apiAvailable is set BEFORE the override on purpose: while only apiAvailable is
 * true the mode is still "browser" (manager Effect 2 guards on mode first), so
 * setting the non-reactive override afterwards never wakes server autosave.
 *
 * Returns an override-failed result when localStorage refused the write (private
 * browsing, quota); null on success.
 */
function persistOverride(): SwitchResult | null {
  setApiAvailable(true);
  setStorageModeOverride();
  // setStorageModeOverride swallows a localStorage write failure, so verify it
  // actually stuck; otherwise the reload would land back in browser mode.
  if (getStorageModeOverride() !== "server") {
    setApiAvailable(false);
    return overrideFailedResult();
  }
  return null;
}

/**
 * Finish the switch: persist the override, then upload the active layout when
 * there is one. `base` is the optimistic-concurrency base sent to the server:
 * null for a fresh create (nothing to clobber), or the server's last-known
 * updatedAt when replacing a copy we just probed.
 */
async function commitSwitch(base: string | null): Promise<SwitchResult> {
  const failed = persistOverride();
  if (failed) return failed;

  const layoutStore = getLayoutStore();
  if (layoutStore.hasRack) {
    // Seed the server base before the upload so a server-autosave that races the
    // (possibly slow, image-heavy) upload echoes this base rather than a null
    // one, keeping the divergence-snapshot check honest mid-upload (#2608).
    setServerBaseUpdatedAt(base);
    try {
      // $state.snapshot already returns a detached deep copy safe to hand off.
      await saveLayoutToServer(
        $state.snapshot(layoutStore.layout),
        getImageStore().getUserImages(),
        base,
      );
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

/**
 * Find a server layout already stored under `uuid`, returning its display
 * metadata or null when none exists. UUIDs are matched case-insensitively to
 * mirror the server (a PUT with either casing hits the same stored layout), so
 * the prompt fires whenever an overwrite would actually land. Throws when the
 * server cannot be queried; the caller treats that as fail-closed.
 */
async function findServerCopy(uuid: string): Promise<ServerCopyInfo | null> {
  const target = uuid.toLowerCase();
  const items = await listSavedLayouts();
  const match = items.find((it) => it.id.toLowerCase() === target);
  if (!match) return null;
  return {
    id: match.id,
    updatedAt: match.updatedAt,
    name: match.name,
    rackCount: match.rackCount,
    deviceCount: match.deviceCount,
  };
}

/**
 * Guard the resolution helpers against a stale prompt: the conflict banner is
 * non-blocking, so the active layout can change (a switch, a load) between the
 * probe and the user's click. Only proceed when the active layout is still the
 * one the prompt was about, matched case-insensitively to mirror the server.
 */
function activeLayoutMatches(serverCopy: ServerCopyInfo): boolean {
  const uuid = getLayoutStore().layout?.metadata?.id;
  return !!uuid && uuid.toLowerCase() === serverCopy.id.toLowerCase();
}

function staleResult(): SwitchResult {
  return {
    switched: false,
    reason: "probe-failed",
    message: "The active layout changed. Please try switching again.",
  };
}

/**
 * Switches the app from browser to server storage mode.
 *
 * Re-checks server health, then probes for an existing server layout under the
 * active layout's UUID. If one exists, returns a "conflict" result instead of
 * overwriting; otherwise uploads the active layout, sets the upgrade-only
 * override, and returns switched: true. The caller reloads on success.
 *
 * Returns switched: false with a reason when a step fails or needs the user:
 * - "unreachable": health check failed
 * - "probe-failed": could not determine whether a server copy exists
 * - "override-failed": localStorage refused to persist the server-mode preference
 * - "upload-failed": the layout upload threw before completing
 * - "conflict": a server copy already exists (carries its metadata)
 */
export async function switchToServerMode(): Promise<SwitchResult> {
  // Re-verify health so a server that dropped since the probe does not strand
  // the user in a dead server mode.
  const healthy = await checkApiHealth();
  if (!healthy) {
    return {
      switched: false,
      reason: "unreachable",
      message: UNREACHABLE_MESSAGE,
    };
  }

  // Mark the API reachable so the probe (and any upload) can run. The override
  // stays UNSET here, so getStorageMode is still "browser" and server autosave
  // stays dormant: we can read server state without risking a stray PUT.
  setApiAvailable(true);

  const layoutStore = getLayoutStore();

  // Empty workspace: there is nothing to upload, so the conflict prompt does not
  // apply. Switch and clear the legacy session so a stale or emptied layout that
  // shares a UUID with a server copy can never later autosave over it.
  if (!layoutStore.hasRack) {
    return switchEmptyWorkspace();
  }

  const uuid = layoutStore.layout?.metadata?.id;
  // Only a stable UUID can collide with a server copy. Without one the upload
  // path reports any save error itself (saveLayoutToServer requires a
  // metadata.id), so there is nothing to probe for here.
  if (uuid) {
    let existing: ServerCopyInfo | null;
    try {
      existing = await findServerCopy(uuid);
    } catch {
      // Fail closed: if we cannot tell whether a server copy exists, do not
      // risk a blind overwrite. Leave the user in browser mode to retry.
      setApiAvailable(false);
      return {
        switched: false,
        reason: "probe-failed",
        message:
          "Couldn't check the server for an existing copy. Please try again.",
      };
    }
    // The active layout can change while findServerCopy is in flight (the app
    // stays interactive). Re-validate before acting so a layout swapped in mid-
    // probe is never prompted for or blind-uploaded against a stale probe. Match
    // case-insensitively, like findServerCopy and the server.
    const currentUuid = layoutStore.layout?.metadata?.id;
    if (
      currentUuid?.toLowerCase() !== uuid.toLowerCase() ||
      !layoutStore.hasRack
    ) {
      setApiAvailable(false);
      return staleResult();
    }
    if (existing) {
      // Hand the decision back to the caller instead of overwriting. Restore
      // the clean browser baseline (the override was never set; drop
      // apiAvailable) so nothing is half-switched while the user decides; the
      // resolution helpers re-establish availability.
      setApiAvailable(false);
      return { switched: false, reason: "conflict", serverCopy: existing };
    }
  }

  // No existing server copy: switch and upload as a fresh create. No base is
  // needed since there is nothing to clobber.
  return await commitSwitch(null);
}

/**
 * Switch an empty workspace (no racks) to server mode. Nothing is uploaded, and
 * the legacy session is cleared so an empty or stale layout that happens to
 * share a UUID with a server copy cannot later autosave over it; the reload
 * boots cleanly to the server library. apiAvailable is left false so no autosave
 * wakes before the reload.
 */
function switchEmptyWorkspace(): SwitchResult {
  setApiAvailable(false);
  setStorageModeOverride();
  if (getStorageModeOverride() !== "server") {
    return overrideFailedResult();
  }
  clearSession();
  return { switched: true };
}

/**
 * Replace the existing server copy with the browser copy after the user
 * confirms. Bails out if the active layout changed since the prompt, so a stale
 * probe never commits the wrong layout. Re-checks health first so a server that
 * dropped while the user read the prompt yields a clean "unreachable" message
 * rather than a raw upload error. Passing the server's last-known updatedAt as
 * the base gives real optimistic concurrency: if the server copy changed between
 * the prompt and this click, the server snapshots it before overwriting (the
 * filesystem divergence check); otherwise it is a clean, user-consented
 * overwrite. The caller reloads on success.
 */
export async function confirmServerOverwrite(
  serverCopy: ServerCopyInfo,
): Promise<SwitchResult> {
  if (!activeLayoutMatches(serverCopy)) return staleResult();
  const healthy = await checkApiHealth();
  if (!healthy) {
    return {
      switched: false,
      reason: "unreachable",
      message: UNREACHABLE_MESSAGE,
    };
  }
  // Re-validate after the await: the active layout can change while the health
  // check is in flight. Require racks too, so a now-empty layout cannot report a
  // false success without actually uploading anything.
  if (!activeLayoutMatches(serverCopy) || !getLayoutStore().hasRack) {
    return staleResult();
  }
  return await commitSwitch(serverCopy.updatedAt);
}

/**
 * Keep the server's copy: switch to server mode WITHOUT uploading, so the
 * browser fork can never clobber it. The legacy autosave slot is cleared so the
 * reload boots cleanly in server mode with the kept layout available in the
 * Layouts list; the browser fork stays in the browser workspace storage
 * (recoverable by switching back). Nothing the fork could autosave is left in a
 * server-mode session, so the kept copy is never at risk.
 *
 * Bails out if the active layout changed since the prompt. Re-checks health
 * first because, unlike replace, there is no upload to surface a server that
 * dropped while the user read the prompt. Forces apiAvailable off before setting
 * the override: a true apiAvailable here would let server autosave (manager
 * Effect 2) PUT the fork over the very copy we are keeping before the reload
 * lands. This is done explicitly rather than assumed, so the exported function
 * is safe regardless of caller state. App.svelte re-checks health on reload.
 */
export async function adoptServerCopy(
  serverCopy: ServerCopyInfo,
): Promise<SwitchResult> {
  if (!activeLayoutMatches(serverCopy)) return staleResult();
  const healthy = await checkApiHealth();
  if (!healthy) {
    return {
      switched: false,
      reason: "unreachable",
      message: UNREACHABLE_MESSAGE,
    };
  }
  // Re-validate after the await: the active layout can change while the health
  // check is in flight, and "keep" must act on the layout the prompt was about.
  if (!activeLayoutMatches(serverCopy)) return staleResult();

  setApiAvailable(false);
  setStorageModeOverride();
  if (getStorageModeOverride() !== "server") {
    return overrideFailedResult();
  }

  // Drop any legacy single-slot session so the server-mode reload does not
  // restore a stale layout; the kept copy is opened from the Layouts list. The
  // browser workspace (multi-layout) storage is untouched.
  clearSession();
  return { switched: true };
}
