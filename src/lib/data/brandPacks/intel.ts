/**
 * Intel Brand Pack
 * Pre-defined device types for Intel mini-PC equipment
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * Intel device definitions
 *
 * NUC: Compact mini-PC for shelf placement
 */
export const intelDevices: DeviceType[] = [
  {
    slug: "intel-nuc",
    u_height: 1,
    manufacturer: "Intel",
    model: "NUC",
    slot_width: 1,
    is_full_depth: false,
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
];
