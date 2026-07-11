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

/**
 * The face a *pending* (not yet placed) device should be checked against for
 * collision purposes, given the raw view/target face the caller is trying to
 * place onto. Mirrors `effectiveFace` for a device already in the rack: a
 * full-depth device always collides on "both" faces regardless of which
 * sub-view (front/rear) the cursor or keyboard cursor is over, so its
 * collision face can never be narrowed to a single face. Half-depth devices
 * collide only on the given view face.
 *
 * Shared by the drag/tap preview (resolveDropTarget, resolveDropAction) and
 * the keyboard cursor (validStartPositions, keyboardCursorPreview) so all
 * three agree with the store (placeDeviceRecorded) on whether a full-depth
 * device would collide with an existing device on the opposite face (#2925).
 *
 * is_full_depth undefined or true means full-depth; false means half-depth.
 */
export function pendingCollisionFace(
  deviceType: Pick<DeviceType, "is_full_depth"> | undefined,
  viewFace: DeviceFace | undefined,
): DeviceFace | undefined {
  if (deviceType && deviceType.is_full_depth !== false) {
    return "both";
  }
  return viewFace;
}
