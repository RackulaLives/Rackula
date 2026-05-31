/**
 * Port Utilities
 * Functions for port instantiation when devices are placed
 */

import type { DeviceType, PlacedPort } from "$lib/types";
import { generateId } from "$lib/utils/device";

export type PortCategory = "network" | "power" | "console";

/**
 * Categorize an interface type string into network, power, or console.
 * Uses string matching so it handles future types (e.g. power-inlet-*) even
 * before they are added to the InterfaceType enum.
 */
export function getPortCategory(type: string): PortCategory {
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
