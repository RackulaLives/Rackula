/**
 * GUITK Brand Pack
 * Pre-defined device types for 10-inch rack power accessories.
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

export const guitkDevices: DeviceType[] = [
  {
    slug: "guitk-10in-1u-pdu-6-outlet",
    u_height: 1,
    manufacturer: "GUITK",
    model: '10" Rack PDU, 6 Outlet',
    is_full_depth: false,
    is_powered: true,
    slot_width: 1,
    rack_widths: [10],
    outlet_count: 6,
    colour: CATEGORY_COLOURS.power,
    category: "power",
    notes:
      "10-inch 1U rack PDU with 6 NEMA 5-15 outlets, 2 USB-A ports, 1020J surge protection, 15A overload switch, and 6 ft 14AWG cord.",
    links: [
      {
        label: "Amazon B0G1M1ZWP4",
        url: "https://www.amazon.com/dp/B0G1M1ZWP4",
      },
    ],
    custom_fields: {
      rackula_fit: {
        source_asin: "B0G1M1ZWP4",
        usb_a_ports: 2,
        surge_joules: 1020,
        max_current_amps: 15,
        cord_length_ft: 6,
        cord_gauge_awg: 14,
      },
    },
  },
];
