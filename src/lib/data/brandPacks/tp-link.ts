/**
 * TP-Link Brand Pack
 * Pre-defined device types for TP-Link networking equipment
 * Source: NetBox community devicetype-library
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * TP-Link device definitions (29 rack-mountable devices)
 */
export const tplinkDevices: DeviceType[] = [
  // ============================================
  // Omada Routers - ER Series
  // ============================================
  {
    slug: "tp-link-er605-v2",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "ER605-V2",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "passive",
  },
  {
    slug: "tp-link-er707-m2",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "ER707-M2",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "passive",
  },
  {
    slug: "tp-link-er7206",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "ER7206",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "passive",
  },

  // ============================================
  // Omada Controllers - OC Series
  // ============================================
  {
    slug: "tp-link-oc200",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "OC200",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
  {
    slug: "tp-link-oc300",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "OC300",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },

  // ============================================
  // Smart/Managed Switches - T Series
  // ============================================
  {
    slug: "tp-link-t1500g-10mbps",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "T1500G-10MPS",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "passive",
  },
  {
    slug: "tp-link-t2500g-10ts",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "T2500G-10TS",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
  {
    slug: "tp-link-t2600g-28mps",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "T2600G-28MPS",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
  {
    slug: "tp-link-t2600g-28ts",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "T2600G-28TS",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "passive",
  },
  {
    slug: "tp-link-t2600g-52ts",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "T2600G-52TS",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "passive",
  },

  // ============================================
  // DSL Modem/Router
  // ============================================
  {
    slug: "tp-link-td-w8950n",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TD-W8950N",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "passive",
  },

  // ============================================
  // PoE Switches - TL-SE Series
  // ============================================
  {
    slug: "tp-link-tl-se2109pb",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SE2109PB",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "left-to-right",
  },

  // ============================================
  // Unmanaged/Smart Switches - TL-SG Series
  // ============================================
  {
    slug: "tp-link-tl-sg1008mp",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG1008MP",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "right-to-left",
  },
  {
    slug: "tp-link-tl-sg1016de",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG1016DE",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
  {
    slug: "tp-link-tl-sg1016pe",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG1016PE",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "right-to-left",
  },
  {
    slug: "tp-link-tl-sg1024d",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG1024D",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
  {
    slug: "tp-link-tl-sg1218mpe",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG1218MPE",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "side-to-rear",
  },
  {
    slug: "tp-link-sg2210mp",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG2210MP",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "passive",
  },
  {
    slug: "tp-link-tl-sg2428p",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG2428P",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "left-to-right",
  },

  // ============================================
  // JetStream Managed Switches - TL-SG3xxx Series
  // ============================================
  {
    slug: "tp-link-tl-sg3210",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG3210",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "passive",
  },
  {
    slug: "tp-link-sg3210x-m2",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG3210X-M2",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "passive",
  },
  {
    slug: "tp-link-tl-sg3424",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG3424",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
  {
    slug: "tp-link-tl-sg3424p",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG3424P",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
  {
    slug: "tp-link-tl-sg3428",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG3428",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "passive",
  },
  {
    slug: "tp-link-tl-sg3428x",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG3428X",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    airflow: "passive",
  },
  {
    slug: "tp-link-tl-sg3428mp",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG3428MP",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
  {
    slug: "tp-link-tl-sg3428xmp",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG3428XMP",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
  {
    slug: "tp-link-tl-sg3452x",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SG3452X",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },

  // ============================================
  // 10G Switches - TL-SX Series
  // ============================================
  {
    slug: "tp-link-tl-sx3016f",
    u_height: 1,
    manufacturer: "TP-Link",
    model: "TL-SX3016F",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
];
