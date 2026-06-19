/**
 * Helpers for placement image keys in the global image store.
 *
 * Format: `placement-{layoutId}:{deviceId}`
 * The colon separator is safe because layout and device ids are UUIDs
 * (hex + hyphens only).
 */

/** Build a namespaced placement image key. Falls back to legacy format when layoutId is absent. */
export function placementKey(layoutId: string, deviceId: string): string {
  return layoutId
    ? `placement-${layoutId}:${deviceId}`
    : `placement-${deviceId}`;
}

/** True for any key that starts with the placement prefix. */
export function isPlacementKey(key: string): boolean {
  return key.startsWith("placement-");
}

/**
 * Extract the raw device id from a placement key.
 * Handles both the current namespaced format (`placement-{layoutId}:{deviceId}`)
 * and the legacy un-namespaced format (`placement-{deviceId}`).
 */
export function deviceIdFromPlacementKey(key: string): string {
  const colonIdx = key.indexOf(":");
  if (colonIdx !== -1) {
    return key.slice(colonIdx + 1);
  }
  return key.slice("placement-".length);
}

/**
 * Extract the layout id from a namespaced placement key.
 * Returns undefined for legacy un-namespaced keys (`placement-{deviceId}`).
 */
export function layoutIdFromPlacementKey(key: string): string | undefined {
  const colonIdx = key.indexOf(":");
  if (colonIdx === -1) return undefined;
  return key.slice("placement-".length, colonIdx);
}
