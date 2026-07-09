/**
 * Lenovo Brand Pack
 * Pre-defined device types for Lenovo rack-mountable devices
 * Source: NetBox community devicetype-library
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * Lenovo device definitions
 */
export const lenovoDevices: DeviceType[] = [
  {
    slug: "lenovo-thinkcentre-m720q-tiny",
    u_height: 0.5,
    manufacturer: "Lenovo",
    model: "ThinkCentre M720q Tiny",
    slot_width: 2,
    rack_widths: [10],
    is_full_depth: false,
    is_powered: true,
    weight: 1.32,
    weight_unit: "kg",
    airflow: "mixed",
    subdevice_role: "child",
    colour: CATEGORY_COLOURS.server,
    category: "server",
    notes:
      "Tiny-only chassis is about 179 x 183 x 34.5 mm, or 37 mm with rubber feet, per Lenovo PSREF. Place inside a RackMate Tiny mount or chassis bay.",
    links: [
      {
        label: "Lenovo ThinkCentre M720 Tiny PSREF",
        url: "https://psref.lenovo.com/syspool/Sys/PDF/ThinkCentre/ThinkCentre_M720_Tiny/ThinkCentre_M720_Tiny_Spec.pdf",
      },
    ],
    custom_fields: {
      rackula_fit: {
        status: "candidate",
        dimensions_mm: {
          width: 179,
          depth: 183,
          height: 37,
        },
        power_adapter_options_watts: [65, 90, 135],
      },
    },
  },
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
