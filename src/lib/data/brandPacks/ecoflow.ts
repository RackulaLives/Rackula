/**
 * EcoFlow Brand Pack
 * Pre-defined device types for portable power stations.
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

export const ecoflowDevices: DeviceType[] = [
  {
    slug: "ecoflow-river-3",
    u_height: 3,
    manufacturer: "EcoFlow",
    model: "RIVER 3 Portable Power Station",
    is_full_depth: false,
    is_powered: true,
    airflow: "mixed",
    subdevice_role: "child",
    slot_width: 2,
    rack_widths: [10, 19],
    weight: 3.54,
    weight_unit: "kg",
    colour: CATEGORY_COLOURS.power,
    category: "power",
    notes:
      "245Wh LiFePO4 portable power station with 300W AC output. It is easier to allocate vertically than the 600W-class options but still needs real cable-clearance measurement in a 260mm-deep RackMate.",
    links: [
      {
        label: "EcoFlow RIVER 3",
        url: "https://us.ecoflow.com/products/river-3-portable-power-station",
      },
    ],
    custom_fields: {
      portable_power: {
        capacity_wh: 245,
        ac_output_watts: 300,
        surge_watts: 600,
        x_boost_watts: 600,
        battery_chemistry: "LiFePO4",
        cycle_life_to_80_percent: 3000,
        ups_switchover_ms: 20,
        ac_input_watts: 320,
        solar_input_watts: 110,
      },
      rackula_fit: {
        status: "physically_plausible_needs_measurement",
        recommended_tray_u: 3,
        recommended_mount_slugs: ["deskpi-rackmate-3u-power-station-tray"],
        rackmate_t1_plus_depth_mm: 260,
        rackmate_t1_plus_depth_clearance_mm: 6,
        dimensions_in: {
          length: 10,
          width: 8.3,
          height: 4.4,
        },
        dimensions_mm: {
          length: 254,
          width: 211,
          height: 112,
        },
        open_checks: [
          "whether the 254mm dimension must run front-to-back",
          "AC plug and cord bend clearance",
          "front display and button access in the chosen orientation",
          "tray retention for a 3.54kg portable battery",
        ],
      },
    },
  },
  {
    slug: "ecoflow-river-3-plus",
    u_height: 4,
    manufacturer: "EcoFlow",
    model: "RIVER 3 Plus Portable Power Station",
    is_full_depth: false,
    is_powered: true,
    airflow: "mixed",
    subdevice_role: "child",
    slot_width: 2,
    rack_widths: [10, 19],
    weight: 4.72,
    weight_unit: "kg",
    colour: CATEGORY_COLOURS.power,
    category: "power",
    notes:
      "286Wh LiFePO4 portable power station with 600W AC output. Similar RackMate bay class to the PECRON E300LFP: reserve 4U and verify real cable, width, and ventilation clearance.",
    links: [
      {
        label: "EcoFlow RIVER 3 Plus",
        url: "https://us.ecoflow.com/products/river-3-plus-portable-power-station",
      },
    ],
    custom_fields: {
      portable_power: {
        capacity_wh: 286,
        ac_output_watts: 600,
        surge_watts: 1200,
        x_boost_watts: 1200,
        battery_chemistry: "LiFePO4",
        cycle_life_to_80_percent: 3000,
        ups_switchover_ms: 10,
        ac_input_watts: 380,
        solar_input_watts: 220,
      },
      rackula_fit: {
        status: "physically_plausible_needs_measurement",
        recommended_tray_u: 4,
        recommended_mount_slugs: ["deskpi-rackmate-4u-power-station-tray"],
        rackmate_t1_plus_depth_mm: 260,
        rackmate_t1_plus_depth_clearance_mm: 26,
        dimensions_in: {
          length: 9.2,
          width: 9.1,
          height: 5.8,
        },
        dimensions_mm: {
          length: 234,
          width: 231,
          height: 147,
        },
        open_checks: [
          "usable rail-to-rail width for the 231mm body dimension",
          "rear AC cable exit and bend radius",
          "front display and button access in the chosen orientation",
          "tray retention for a 4.72kg portable battery",
        ],
      },
    },
  },
];
