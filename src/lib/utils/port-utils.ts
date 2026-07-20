/**
 * Port Utilities
 * Functions for port instantiation when devices are placed
 */

import type { DeviceType, PlacedPort, PortDirection } from "$lib/types";
import { generateId } from "$lib/utils/device";

export type PortCategory = "network" | "power" | "console" | "av";

/**
 * Pro audio / AV interface types (spike #1927 taxonomy). Listed explicitly
 * rather than matched by substring: the set spans audio, video, control, and
 * data connectors (xlr, hdmi, rs-232, dante, ...) with no shared naming
 * pattern to key off, unlike the power/console heuristics below.
 */
const AV_INTERFACE_TYPES = new Set<string>([
  // Audio
  "xlr-3",
  "trs-1-4",
  "ts-1-4",
  "rca",
  "adat-optical",
  "midi-din",
  "bnc",
  "db25-audio",
  "phoenix",
  "speakon",
  "xlr-5",
  // Video
  "displayport",
  "hdmi",
  "sdi-bnc",
  "vga",
  // Control
  "dmx-xlr",
  "rs-232",
  "rs-422",
  // Other
  "aes3",
  "avb",
  "dante",
]);

/**
 * Interface types whose direction defaults to "input" (spike #1927 taxonomy):
 * console ports and the AV control-serial types. Checked before
 * AV_INTERFACE_TYPES in inferDirection() since rs-232/rs-422 are members of
 * both sets and the specific input default takes priority. Management-only
 * interfaces also default to "input", but via the separate mgmt_only check
 * in inferDirection(), not through this set: the "management" interface
 * type itself falls through to "bidirectional" unless mgmt_only is set.
 */
const INPUT_DEFAULT_TYPES = new Set<string>(["console", "rs-232", "rs-422"]);

/**
 * Categorize an interface type string into network, power, console, or av.
 * Uses string matching for network/power/console so it handles future types
 * (e.g. power-inlet-*) even before they are added to the InterfaceType enum.
 */
export function getPortCategory(type: string): PortCategory {
  if (AV_INTERFACE_TYPES.has(type)) {
    return "av";
  }
  if (
    type === "console" ||
    type.includes("usb") ||
    type.includes("serial") ||
    type.includes("de-9")
  ) {
    return "console";
  }
  if (type.includes("power") || type.includes("iec") || type.includes("nema")) {
    return "power";
  }
  return "network";
}

/**
 * Infer the default signal direction for an interface type (spike #1927).
 * Used when an InterfaceTemplate (or PlacedPort) does not set `direction`
 * explicitly:
 * - Management-only interfaces default to "input".
 * - Console and AV control-serial types (rs-232, rs-422) default to "input".
 * - All other AV types (XLR, HDMI, SDI, ...) have no default: direction must
 *   be set explicitly on the device type.
 * - Everything else (network, power, USB, etc.) defaults to "bidirectional".
 *
 * @param type - Interface type string
 * @param mgmtOnly - Whether the interface is management-only
 * @returns The inferred direction, or undefined if none should be assumed
 */
export function inferDirection(
  type: string,
  mgmtOnly?: boolean,
): PortDirection | undefined {
  if (mgmtOnly) {
    return "input";
  }
  if (INPUT_DEFAULT_TYPES.has(type)) {
    return "input";
  }
  if (AV_INTERFACE_TYPES.has(type)) {
    return undefined;
  }
  return "bidirectional";
}

/** Connector gender for display. Computed only, never stored (spike #1927). */
export type ConnectorGender = "male" | "female";

/**
 * Derive the connector gender for a port from its type and resolved
 * direction, for connectors with a strong convention (spike #1927,
 * Finding 6):
 * - XLR-3 follows AES14 (signal flows out of male pins) so an output port is
 *   male and an input port is female; XLR-5 follows the same convention.
 *   Without a resolved in/out direction the gender is not derivable.
 * - Speakon chassis connectors are male regardless of direction (the mating
 *   cable end is female); a port models the chassis side.
 * - dmx-xlr is deliberately not derived: DMX512 (ANSI E1.11) reverses the
 *   AES14 convention (transmitters are female), so the XLR rule would
 *   mislead here.
 * Ambiguous connectors (TRS, TS, RCA, ...) return undefined.
 */
export function deriveGender(
  type: string,
  direction?: PortDirection,
): ConnectorGender | undefined {
  switch (type) {
    case "xlr-3":
    case "xlr-5":
      if (direction === "output") return "male";
      if (direction === "input") return "female";
      return undefined;
    case "speakon":
      return "male";
    default:
      return undefined;
  }
}

/**
 * Instantiate ports from a DeviceType's interface templates
 * Creates PlacedPort instances with stable UUIDs for each interface
 *
 * @param deviceType - The device type containing interface templates
 * @returns Array of PlacedPort instances with unique IDs, indexes, and cached types
 */
export function instantiatePorts(deviceType: DeviceType): PlacedPort[] {
  if (!deviceType.interfaces || deviceType.interfaces.length === 0) {
    return [];
  }

  return deviceType.interfaces.map((iface, index) => ({
    id: generateId(),
    template_name: iface.name,
    template_index: index,
    type: iface.type,
  }));
}
