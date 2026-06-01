/**
 * Beelink Brand Pack
 * Pre-defined device types for Beelink mini-PC equipment
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * Beelink device definitions
 *
 * Mini S12 Pro: Compact mini-PC for shelf placement
 */
export const beelinkDevices: DeviceType[] = [
  {
    slug: "beelink-mini-s12-pro",
    u_height: 1,
    manufacturer: "Beelink",
    model: "Mini S12 Pro",
    slot_width: 1,
    is_full_depth: false,
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
];
