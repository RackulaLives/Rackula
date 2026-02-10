/**
 * Vertiv Brand Pack
 * Pre-defined device types for Vertiv equipment
 * Source: NetBox community devicetype-library
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

export const vertivDevices: DeviceType[] = [
  {
    slug: "vertiv-acs8008sac",
    u_height: 1,
    manufacturer: "Vertiv",
    model: "ACS8008SAC",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.power,
    category: "power",
  },
];
