import { loadSessionWithTimestamp, resolveBrowserLaunch } from "$lib/storage";

/**
 * Whether locally persisted state has unexported changes to protect from a
 * `?l=` share-link entry (#2988), read directly off storage rather than the
 * live layout store.
 *
 * At share-link boot time (App.svelte's onMount, before any restore has run)
 * the live layout store still holds its pristine pre-restore value: reading
 * changesSinceExport off it would see 0 unconditionally, and a genuine fresh
 * install would additionally look dirty the moment its default rack gets
 * seeded later in the boot sequence, which is not real work worth guarding.
 * Reading storage directly avoids both false negatives and false positives.
 */
export function hasUnrestoredLocalChanges(serverMode: boolean): boolean {
  if (serverMode) {
    return (loadSessionWithTimestamp()?.changesSinceExport ?? 0) > 0;
  }
  const launch = resolveBrowserLaunch();
  if (launch.action !== "restore") return false;
  const activeEntry = launch.index.activeId
    ? launch.index.library[launch.index.activeId]
    : undefined;
  return (activeEntry?.changesSinceExport ?? 0) > 0;
}
