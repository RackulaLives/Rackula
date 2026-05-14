/**
 * FS.COM Brand Pack
 * Pre-defined device types for FS.COM rack-mountable network switches
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * FS.COM device definitions (4 devices)
 */
export const fsDevices: DeviceType[] = [
  {
    slug: "fs-s8050-20q4c",
    u_height: 1,
    manufacturer: "FS.COM",
    model: "S8050-20Q4C",
    is_full_depth: true,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
  {
    slug: "fs-s5850-32s2q",
    u_height: 1,
    manufacturer: "FS.COM",
    model: "S5850-32S2Q",
    is_full_depth: true,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
  {
    slug: "fs-s5850-24s2q",
    u_height: 1,
    manufacturer: "FS.COM",
    model: "S5850-24S2Q",
    is_full_depth: true,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
  {
    slug: "fs-s3410-10tf-p",
    u_height: 1,
    manufacturer: "FS.COM",
    model: "S3410-10TF-P",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
];
