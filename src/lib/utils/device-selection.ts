import type { PlacedDevice, Rack } from "$lib/types";

/**
 * Identifying detail carried by a device-selection event.
 *
 * `deviceId` (the placed device's UUID) is the preferred, unambiguous
 * identifier. `slug`/`position` are kept as a fallback for compatibility.
 */
export interface DeviceSelectionDetail {
  /** UUID of the placed device (preferred, unambiguous identifier) */
  deviceId?: string;
  /** device_type slug (fallback identifier) */
  slug: string;
  /** position in internal units (fallback identifier) */
  position: number;
}

/**
 * Resolve which placed device a selection event refers to.
 *
 * Prefers the stable UUID when present. The legacy `(device_type, position)`
 * fallback is AMBIGUOUS for two half-width devices sharing the same U (#1680):
 * both share an identical pair, so `.find()` always returns the left one and
 * the right device becomes structurally unselectable. Matching on the UUID
 * first removes that ambiguity.
 */
export function resolveSelectedDevice(
  rack: Rack,
  detail: DeviceSelectionDetail,
): PlacedDevice | undefined {
  if (detail.deviceId) {
    const byId = rack.devices.find((d) => d.id === detail.deviceId);
    if (byId) return byId;
  }

  return rack.devices.find(
    (d) => d.device_type === detail.slug && d.position === detail.position,
  );
}
