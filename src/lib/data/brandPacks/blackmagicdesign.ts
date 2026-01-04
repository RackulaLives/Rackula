/**
 * Blackmagicdesign Brand Pack
 * Pre-defined device types for Blackmagicdesign rack-mountable devices
 * Source: NetBox community devicetype-library
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * Blackmagicdesign device definitions (7 devices)
 */
export const blackmagicdesignDevices: DeviceType[] = [
  {
    slug: "blackmagicdesign-atem-constellation-1-m-e-4k",
    u_height: 1,
    manufacturer: "Blackmagicdesign",
    model: "ATEM Constellation 1 M/E 4k",
    is_full_depth: false,
    airflow: "right-to-left",
    colour: CATEGORY_COLOURS["av-media"],
    category: "av-media",
  },
  {
    slug: "blackmagicdesign-atem-constellation-1-m-e-hd",
    u_height: 1,
    manufacturer: "Blackmagicdesign",
    model: "ATEM Constellation 1 M/E HD",
    is_full_depth: false,
    airflow: "right-to-left",
    colour: CATEGORY_COLOURS["av-media"],
    category: "av-media",
  },
  {
    slug: "blackmagicdesign-atem-constellation-2-m-e-4k",
    u_height: 1,
    manufacturer: "Blackmagicdesign",
    model: "ATEM Constellation 2 M/E 4k",
    is_full_depth: false,
    airflow: "right-to-left",
    colour: CATEGORY_COLOURS["av-media"],
    category: "av-media",
  },
  {
    slug: "blackmagicdesign-atem-constellation-2-m-e-hd",
    u_height: 1,
    manufacturer: "Blackmagicdesign",
    model: "ATEM Constellation 2 M/E HD",
    is_full_depth: false,
    airflow: "right-to-left",
    colour: CATEGORY_COLOURS["av-media"],
    category: "av-media",
  },
  {
    slug: "blackmagicdesign-atem-constellation-4-m-e-4k",
    u_height: 2,
    manufacturer: "Blackmagicdesign",
    model: "ATEM Constellation 4 M/E 4k",
    is_full_depth: false,
    airflow: "right-to-left",
    colour: CATEGORY_COLOURS["av-media"],
    category: "av-media",
  },
  {
    slug: "blackmagicdesign-atem-constellation-4-m-e-hd",
    u_height: 2,
    manufacturer: "Blackmagicdesign",
    model: "ATEM Constellation 4 M/E HD",
    is_full_depth: false,
    airflow: "right-to-left",
    colour: CATEGORY_COLOURS["av-media"],
    category: "av-media",
  },
  {
    slug: "blackmagicdesign-atem-constellation-8k",
    u_height: 2,
    manufacturer: "Blackmagicdesign",
    model: "ATEM Constellation 8K",
    is_full_depth: false,
    airflow: "right-to-left",
    colour: CATEGORY_COLOURS["av-media"],
    category: "av-media",
  },
];
