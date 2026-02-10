/**
 * Arista Brand Pack
 * Pre-defined device types for Arista equipment
 * Source: NetBox community devicetype-library
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

export const aristaDevices: DeviceType[] = [
  {
    slug: "arista-dcs-7020sr-24c2-f",
    u_height: 1,
    manufacturer: "Arista",
    model: "DCS-7020SR-24C2-F",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true,
  },

  {
    slug: "arista-dcs-7020srg-24c2-f",
    u_height: 1,
    manufacturer: "Arista",
    model: "DCS-7020SRG-24C2-F",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true,
  },
];
