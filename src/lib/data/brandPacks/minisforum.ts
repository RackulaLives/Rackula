/**
 * Minisforum Brand Pack
 * Pre-defined device types for Minisforum mini-workstation equipment.
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * Minisforum device definitions.
 */
export const minisforumDevices: DeviceType[] = [
  {
    slug: "minisforum-ms02-ultra",
    u_height: 2.5,
    manufacturer: "Minisforum",
    model: "MS-02 Ultra",
    slot_width: 2,
    rack_widths: [10],
    is_full_depth: false,
    is_powered: true,
    weight: 3.45,
    weight_unit: "kg",
    airflow: "mixed",
    colour: CATEGORY_COLOURS.server,
    category: "server",
    notes:
      "4.8 L mini workstation with built-in 350 W PSU. Treat RackMate fit as unverified until chassis orientation, cable bend, airflow, and mount load are measured.",
    links: [
      {
        label: "Minisforum MS-02 Ultra",
        url: "https://store.minisforum.com/products/minisforum-ms-02-ultra-workstation",
      },
      {
        label: "ServeTheHome MS-02 Ultra review",
        url: "https://www.servethehome.com/minisforum-ms-02-ultra-review-intel-new-home-lab-king/",
      },
    ],
    custom_fields: {
      rackula_fit: {
        status: "needs_measurement",
        chassis_liters: 4.8,
        internal_psu_watts: 350,
        reported_dimensions_mm: {
          width: 222,
          depth: 225,
          height: 97,
          confidence: "third_party_reported",
        },
        open_checks: [
          "exact chassis dimensions in planned orientation",
          "rack internal rail-to-rail width",
          "rear cable bend radius",
          "side intake and exhaust clearance",
          "shelf load and heat deflection",
        ],
      },
    },
  },
];
