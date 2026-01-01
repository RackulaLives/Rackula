/**
 * AC Infinity Brand Pack
 * Pre-defined device types for AC Infinity cooling equipment
 * Source: AC Infinity official specifications
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * AC Infinity device definitions (3 Cloudplate rack cooling fans)
 *
 * Cloudplate series are rack-mounted cooling fans:
 * - T1: 1U, exhaust airflow, 60 CFM
 * - T2: 1U, top exhaust airflow, 300 CFM
 * - T7: 2U, exhaust airflow, 220 CFM
 */
export const acInfinityDevices: DeviceType[] = [
  {
    slug: "ac-infinity-cloudplate-t1",
    u_height: 1,
    manufacturer: "AC Infinity",
    model: "Cloudplate T1",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.cooling,
    category: "cooling",
    front_image: true,
  },
  {
    slug: "ac-infinity-cloudplate-t2",
    u_height: 1,
    manufacturer: "AC Infinity",
    model: "Cloudplate T2",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.cooling,
    category: "cooling",
    front_image: true,
  },
  {
    slug: "ac-infinity-cloudplate-t7",
    u_height: 2,
    manufacturer: "AC Infinity",
    model: "Cloudplate T7",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.cooling,
    category: "cooling",
    front_image: true,
  },
];
