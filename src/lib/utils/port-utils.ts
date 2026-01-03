/**
 * Port Utilities
 * Functions for port instantiation when devices are placed
 */

import type { DeviceType, PlacedPort } from "$lib/types";
import { generateId } from "$lib/utils/device";

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
