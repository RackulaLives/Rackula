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

  // Additional devices from NetBox library (Issue #1111 Phase 2)
  {
    slug: "arista-dcs-7020tr-48-f",
    u_height: 1,
    manufacturer: "Arista",
    model: "DCS-7020TR-48-F",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true
  },

  {
    slug: "arista-dcs-7020tra-48-f",
    u_height: 1,
    manufacturer: "Arista",
    model: "DCS-7020TRA-48-F",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true
  },

  {
    slug: "arista-dcs-7050cx3-32c-f",
    u_height: 1,
    manufacturer: "Arista",
    model: "DCS-7050CX3-32C-F",
    is_full_depth: true,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true
  },

  {
    slug: "arista-dcs-7050cx3-32s-d-f",
    u_height: 1,
    manufacturer: "Arista",
    model: "DCS-7050CX3-32S-D-F",
    is_full_depth: true,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true
  },

  {
    slug: "arista-dcs-7050cx3-32s-f",
    u_height: 1,
    manufacturer: "Arista",
    model: "DCS-7050CX3-32S-F",
    is_full_depth: true,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true
  },

  {
    slug: "arista-dcs-7050cx4m-48d8-f",
    u_height: 1,
    manufacturer: "Arista",
    model: "DCS-7050CX4M-48D8-F",
    is_full_depth: true,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true
  },
];
