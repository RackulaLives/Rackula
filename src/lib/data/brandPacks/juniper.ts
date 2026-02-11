/**
 * Juniper Brand Pack
 * Pre-defined device types for Juniper equipment
 * Source: NetBox community devicetype-library
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

export const juniperDevices: DeviceType[] = [
  {
    slug: "juniper-ex2300-48p",
    u_height: 1,
    manufacturer: "Juniper",
    model: "EX2300-48P",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true,
  },

  {
    slug: "juniper-ex2300-c-12p",
    u_height: 1,
    manufacturer: "Juniper",
    model: "EX2300-C-12P",
    is_full_depth: false,
    airflow: "passive",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true,
  },

  // Additional devices from NetBox library (Issue #1111 Phase 2)
  {
    slug: "juniper-ex3400-48p",
    u_height: 1,
    manufacturer: "Juniper",
    model: "EX3400-48P",
    is_full_depth: true,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true
  },

  {
    slug: "juniper-ex3400-48t",
    u_height: 1,
    manufacturer: "Juniper",
    model: "EX3400-48T",
    is_full_depth: true,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true
  },

  {
    slug: "juniper-ex4000-12mp",
    u_height: 1,
    manufacturer: "Juniper",
    model: "EX4000-12MP",
    is_full_depth: false,
    airflow: "passive",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true
  },

  {
    slug: "juniper-ex4000-12p",
    u_height: 1,
    manufacturer: "Juniper",
    model: "EX4000-12P",
    is_full_depth: false,
    airflow: "passive",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true
  },

  {
    slug: "juniper-ex4000-12t",
    u_height: 1,
    manufacturer: "Juniper",
    model: "EX4000-12T",
    is_full_depth: false,
    airflow: "passive",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true
  },

  {
    slug: "juniper-ex4000-24mp",
    u_height: 1,
    manufacturer: "Juniper",
    model: "EX4000-24MP",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true
  },
];
