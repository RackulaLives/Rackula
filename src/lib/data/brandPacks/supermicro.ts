/**
 * Supermicro Brand Pack
 * Pre-defined device types for Supermicro rack-mountable servers
 * Source: NetBox community devicetype-library
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * Supermicro device definitions (7 rack-mountable devices)
 */
export const supermicroDevices: DeviceType[] = [
  // ============================================
  // 1U Entry Level Servers (Atom/Xeon-D)
  // ============================================
  {
    slug: "supermicro-sys-5018d-fn8t",
    u_height: 1,
    manufacturer: "Supermicro",
    model: "SuperServer 5018D-FN8T",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
    front_image: true,
  },
  {
    slug: "supermicro-sys-5019d-fn8tp",
    u_height: 1,
    manufacturer: "Supermicro",
    model: "SuperServer 5019D-FN8TP",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
    front_image: true,
  },

  // ============================================
  // 1U AMD Single Socket
  // ============================================
  {
    slug: "supermicro-as-1115sv-wtnrt",
    u_height: 1,
    manufacturer: "Supermicro",
    model: "AS-1115SV-WTNRT",
    is_full_depth: true,
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },

  // ============================================
  // 2U Dual Socket Servers (Intel)
  // ============================================
  {
    slug: "supermicro-sys-6028r-tr",
    u_height: 2,
    manufacturer: "Supermicro",
    model: "SYS-6028R-TR",
    is_full_depth: true,
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-sys-6029p-tr",
    u_height: 2,
    manufacturer: "Supermicro",
    model: "SuperServer 6029P-TR",
    is_full_depth: true,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
    front_image: true,
    rear_image: true,
  },

  // ============================================
  // 2U AMD Dual Socket
  // ============================================
  {
    slug: "supermicro-as-2124bt-htr",
    u_height: 2,
    manufacturer: "Supermicro",
    model: "AS-2124BT-HTR",
    is_full_depth: true,
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },

  // ============================================
  // 4U Storage Systems
  // ============================================
  {
    slug: "supermicro-ssg-6049p-e1cr36h",
    u_height: 4,
    manufacturer: "Supermicro",
    model: "SuperStorage 6049P-E1CR36H",
    is_full_depth: true,
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },

  // Additional devices from NetBox library
  {
    slug: "supermicro-as-2124bt-hntr",
    u_height: 2,
    manufacturer: "Supermicro",
    model: "A+ Server 2124BT-HNTR",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-asg-2015s-e1cr24l",
    u_height: 2,
    manufacturer: "Supermicro",
    model: "ASG-2015S-E1CR24L",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-as-3015mr-h8tnr",
    u_height: 3,
    manufacturer: "Supermicro",
    model: "MicroCloud A+ Server AS 3015MR-H8TNR",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-sse-g3648b",
    u_height: 1,
    manufacturer: "Supermicro",
    model: "SSE-G3648B",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-ssg-610p-acr12n4h",
    u_height: 1,
    manufacturer: "Supermicro",
    model: "Storage SuperServer SSG-610P-ACR12N4H",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-storage-superserver-ssg-620p-e1cr24l",
    u_height: 2,
    manufacturer: "Supermicro",
    model: "Storage SuperServer SSG-620P-E1CR24L",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-ssg-640p-e1cr36l",
    u_height: 4,
    manufacturer: "Supermicro",
    model: "Storage SuperServer SSG-640P-E1CR36L",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-sse-x3348tr",
    u_height: 1,
    manufacturer: "Supermicro",
    model: "Supermicro SSE-X3348TR",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-sys-1029u-tr4t",
    u_height: 1,
    manufacturer: "Supermicro",
    model: "SuperServer 1029U-TR4T",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-as-1014s-wtrt",
    u_height: 1,
    manufacturer: "Supermicro",
    model: "SuperServer A+ Server 1014S-WTRT",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-sys-110p-wtr",
    u_height: 1,
    manufacturer: "Supermicro",
    model: "SuperServer SYS-110P-WTR",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-superstorage-6027r-e1r12n",
    u_height: 2,
    manufacturer: "Supermicro",
    model: "SuperStorage 6027R-E1R12N",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-superstorage-6038r-e1cr16h",
    u_height: 3,
    manufacturer: "Supermicro",
    model: "SuperStorage 6038r-E1CR16H",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-sys-1019p-wtr",
    u_height: 1,
    manufacturer: "Supermicro",
    model: "SYS-1019P-WTR",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "supermicro-sys-1028r-wc1rt",
    u_height: 1,
    manufacturer: "Supermicro",
    model: "SYS-1028R-WC1RT",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
];
