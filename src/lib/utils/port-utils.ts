/**
 * Port Utilities
 * Functions for port instantiation when devices are placed
 */

import type { DeviceType, PlacedPort } from "$lib/types";
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
