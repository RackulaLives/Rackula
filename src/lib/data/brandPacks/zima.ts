/**
 * Zima Brand Pack
 * Pre-defined device types for Zima single-board server equipment
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * Zima device definitions
 *
 * Zimaboard: Single-board x86 server for shelf placement
 */
export const zimaDevices: DeviceType[] = [
  {
    slug: "zimaboard",
    u_height: 0.5,
    manufacturer: "Zima",
    model: "Zimaboard",
    slot_width: 1,
    is_full_depth: false,
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
];
