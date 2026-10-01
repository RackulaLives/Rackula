/**
 * GMKtec Brand Pack
 * Pre-defined device types for GMKtec equipment
 * Source: NetBox community devicetype-library
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

export const gmktecDevices: DeviceType[] = [
  {
    slug: "gmktec-nucbox-g5",
    u_height: 1,
    manufacturer: "GMKtec",
    model: "NucBox G5",
    width_mm: 72,
    height_mm: 44.5,
    is_full_depth: false,
    colour: CATEGORY_COLOURS.server,
    category: "server",
    front_image: true,
    rear_image: true,
  },
];
