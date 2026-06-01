/**
 * Raspberry Pi Brand Pack
 * Pre-defined device types for Raspberry Pi single-board computers
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * Raspberry Pi device definitions
 *
 * Pi 5, Pi 4: Single-board computers for shelf placement
 */
export const raspberryPiDevices: DeviceType[] = [
  {
    slug: "raspberry-pi-5",
    u_height: 0.5,
    manufacturer: "Raspberry Pi",
    model: "Pi 5",
    slot_width: 1,
    is_full_depth: false,
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "raspberry-pi-4",
    u_height: 0.5,
    manufacturer: "Raspberry Pi",
    model: "Pi 4",
    slot_width: 1,
    is_full_depth: false,
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
];
