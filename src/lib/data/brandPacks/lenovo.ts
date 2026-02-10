/**
 * Lenovo Brand Pack
 * Pre-defined device types for Lenovo rack-mountable devices
 * Source: NetBox community devicetype-library
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * Lenovo device definitions (10 devices)
 */
export const lenovoDevices: DeviceType[] = [
  {
    slug: "lenovo-thinksystem-sr250-v2",
    u_height: 1,
    manufacturer: "Lenovo",
    model: "ThinkSystem SR250 V2",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "lenovo-thinksystem-sr530",
    u_height: 1,
    manufacturer: "Lenovo",
    model: "ThinkSystem SR530",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "lenovo-thinksystem-sr550",
    u_height: 2,
    manufacturer: "Lenovo",
    model: "ThinkSystem SR550",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "lenovo-thinksystem-sr630",
    u_height: 1,
    manufacturer: "Lenovo",
    model: "ThinkSystem SR630",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "lenovo-thinksystem-sr635",
    u_height: 1,
    manufacturer: "Lenovo",
    model: "ThinkSystem SR635",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "lenovo-thinksystem-sr645",
    u_height: 1,
    manufacturer: "Lenovo",
    model: "ThinkSystem SR645",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "lenovo-thinksystem-sr650",
    u_height: 2,
    manufacturer: "Lenovo",
    model: "ThinkSystem SR650",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "lenovo-thinksystem-sr650-v2",
    u_height: 2,
    manufacturer: "Lenovo",
    model: "ThinkSystem SR650 V2",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "lenovo-thinksystem-sr655-v3",
    u_height: 2,
    manufacturer: "Lenovo",
    model: "ThinkSystem SR655 V3",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "lenovo-thinksystem-sr665-v3",
    u_height: 2,
    manufacturer: "Lenovo",
    model: "ThinkSystem SR665 V3",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },

  // Additional devices from NetBox library (Issue #1109 Phase 1)
  {
    slug: "lenovo-thinksystem-sr850-v2",
    u_height: 2,
    manufacturer: "Lenovo",
    model: "ThinkSystem SR850 V2",
    is_full_depth: true,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
    front_image: true,
    rear_image: true,
  },
];
