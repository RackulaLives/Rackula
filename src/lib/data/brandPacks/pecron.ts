/**
 * PECRON Brand Pack
 * Pre-defined device types for portable power stations.
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

export const pecronDevices: DeviceType[] = [
  {
    slug: "pecron-e300lfp",
    u_height: 4,
    manufacturer: "PECRON",
    model: "E300LFP Portable Power Station",
    is_full_depth: false,
    is_powered: true,
    airflow: "mixed",
    subdevice_role: "child",
    slot_width: 2,
    rack_widths: [10, 19],
    weight: 4.8,
    weight_unit: "kg",
    colour: CATEGORY_COLOURS.power,
    category: "power",
    notes:
      "288Wh LiFePO4 portable power station with 600W AC output. Model as a 4U tray-mounted bay in RackMate layouts; 254mm length leaves only nominal clearance in a 260mm-deep rack.",
    links: [
      {
        label: "PECRON E300LFP",
        url: "https://www.pecron.com/products/pecron-e300lfp-portable-power-station-600w-288wh",
      },
    ],
    custom_fields: {
      portable_power: {
        capacity_wh: 288,
        ac_output_watts: 600,
        ups_output_watts: 600,
        battery_chemistry: "LiFePO4",
        cycle_life_to_80_percent: 3500,
        ac_input_watts: 300,
        solar_input_watts: 100,
      },
      rackula_fit: {
        status: "physically_plausible_needs_measurement",
        recommended_tray_u: 4,
        recommended_mount_slugs: ["deskpi-rackmate-4u-power-station-tray"],
        rackmate_t1_plus_depth_mm: 260,
        rackmate_t1_plus_depth_clearance_mm: 6,
        dimensions_mm: {
          length: 254,
          width: 172,
          height: 154,
        },
        open_checks: [
          "AC plug and cord bend clearance at the rear or side outlet path",
          "tray retention for a 4.8kg portable battery",
          "front display and button access in the chosen orientation",
          "side and rear ventilation clearance under load",
        ],
      },
    },
  },
];
