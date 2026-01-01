/**
 * Apple Brand Pack
 * Pre-defined device types for Apple rack-mount server equipment
 * Source: Apple Support, EveryMac.com
 *
 * The Xserve was Apple's rack-mounted server line manufactured 2002-2011.
 * The Xserve RAID was Apple's enterprise storage solution.
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * Apple device definitions (2 rack-mount devices)
 *
 * Xserve: 1U rack-mounted server (PowerPC G4/G5 2002-2006, Intel Xeon 2006-2011)
 * Xserve RAID: 3U rack-mounted storage (14 hot-swappable drives, up to 10.5TB)
 */
export const appleDevices: DeviceType[] = [
  {
    slug: "apple-xserve",
    u_height: 1,
    manufacturer: "Apple",
    model: "Xserve",
    is_full_depth: true,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
    front_image: true,
  },
  {
    slug: "apple-xserve-raid",
    u_height: 3,
    manufacturer: "Apple",
    model: "Xserve RAID",
    is_full_depth: true,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
    front_image: true,
  },
];
