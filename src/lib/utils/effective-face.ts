import type { DeviceFace, DeviceType, PlacedDevice } from "$lib/types";

/**
 * The face a placed device effectively occupies, given its device type.
 *
 * A full-depth device physically spans the whole rack depth, so it always
 * occupies both faces no matter what `face` value its placement stores. Stored
 * `face` is therefore non-authoritative for full-depth devices: legacy or
 * imported data may carry "front" or "rear", but the device is treated as
 * "both". Half-depth devices use their stored face.
 *
 * is_full_depth undefined or true means full-depth; false means half-depth.
 */
export function effectiveFace(
  placedDevice: Pick<PlacedDevice, "face">,
  deviceType: Pick<DeviceType, "is_full_depth"> | undefined,
): DeviceFace {
  if (deviceType && deviceType.is_full_depth !== false) {
    return "both";
  }
  return placedDevice.face;
}
