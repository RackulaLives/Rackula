import type { DeviceType, Rack } from "$lib/types";

/**
 * Stable slugs of the synthesised carriers (defined in the starter library).
 * The drag/drop layer and the import adapter both target these exact slugs.
 */
export const CARRIER_2COL_SLUG = "carrier-1u-2col";
export const CARRIER_2X2_SLUG = "carrier-1u-2x2";
export const CARRIER_2U_2COL_SLUG = "carrier-2u-2col";

/**
 * Whether a device explicitly declares itself native to the current rack width.
 * This is distinct from generic compatibility defaults: devices without
 * `rack_widths` still behave like standard 19-inch gear, and half-width
 * `slot_width: 1` devices still require carriers on 19-inch racks.
 */
export function isNativeRackWidthDevice(
  deviceType: DeviceType,
  rackWidth?: Rack["width"],
): boolean {
  return (
    rackWidth !== undefined && !!deviceType.rack_widths?.includes(rackWidth)
  );
}

/**
 * Whether a device must mount inside a carrier rather than directly on the
 * rails (carrier-first rule, #2158). Sub-U, non-integer-height, or half-width
 * gear cannot register to whole-U rails. Chassis children are always bay-only,
 * even when they declare compatibility with the current rack width. A
 * `slot_width: 1` device that explicitly declares the target rack width in
 * `rack_widths` is treated as native-width for that rack, so 10-inch RackMate
 * gear can rail-mount in a 10-inch rack while still being carrier-only in a
 * standard 19-inch rack. Blank filler panels are exempt: a blank may rail-mount
 * at any height.
 */
export function requiresCarrier(
  deviceType: DeviceType,
  rackWidth?: Rack["width"],
): boolean {
  if (deviceType.category === "blank") return false;
  const isChassisChild = deviceType.subdevice_role === "child";
  const isHalfWidth =
    (deviceType.slot_width ?? 2) === 1 &&
    !isNativeRackWidthDevice(deviceType, rackWidth);
  const isSubU = deviceType.u_height < 1;
  const isNonIntegerHeight = !Number.isInteger(deviceType.u_height);
  return isChassisChild || isHalfWidth || isSubU || isNonIntegerHeight;
}

/**
 * Pick the carrier slug that a half-width device must mount inside, based on
 * its height. Returns null when no rail carrier applies.
 */
export function synthesizeCarrierForDevice(
  deviceType: DeviceType,
  rackWidth?: Rack["width"],
): string | null {
  if (deviceType.subdevice_role === "child") {
    return null;
  }

  if (
    (deviceType.slot_width ?? 2) !== 1 ||
    isNativeRackWidthDevice(deviceType, rackWidth)
  ) {
    return null;
  }

  if (deviceType.u_height < 1) {
    return CARRIER_2X2_SLUG;
  }
  if (!Number.isInteger(deviceType.u_height)) {
    return null;
  }

  if (deviceType.u_height === 1) return CARRIER_2COL_SLUG;
  if (deviceType.u_height === 2) return CARRIER_2U_2COL_SLUG;
  return null;
}

/**
 * Whether a device can never register on the rails, even inside a synthesised
 * carrier, so it can be placed only inside an existing chassis/carrier bay.
 */
export function requiresChassisBay(
  deviceType: DeviceType,
  rackWidth?: Rack["width"],
): boolean {
  return (
    requiresCarrier(deviceType, rackWidth) &&
    synthesizeCarrierForDevice(deviceType, rackWidth) === null
  );
}
