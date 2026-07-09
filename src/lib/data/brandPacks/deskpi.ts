/**
 * DeskPi Brand Pack
 * Pre-defined device types for DeskPi 10-inch rack accessories
 * Popular homelab brand for Raspberry Pi rack mounting solutions
 *
 * All DeskPi devices are 10-inch rack width (rack_widths: [10]),
 * which is half-width when used in a standard 19-inch rack (slot_width: 1).
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * DeskPi device definitions
 * Primarily 10-inch rack compatible devices for Raspberry Pi and networking
 */
export const deskpiDevices: DeviceType[] = [
  // ============================================
  // Patch Panels
  // ============================================
  {
    slug: "deskpi-12-port-patch-panel-0-5u",
    u_height: 0.5,
    manufacturer: "DeskPi",
    model: "12-Port CAT6 Patch Panel",
    is_full_depth: false,
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS["patch-panel"],
    category: "patch-panel",
  },
  {
    slug: "deskpi-12-port-keystone-patch-panel-1u",
    u_height: 1,
    manufacturer: "DeskPi",
    model: "12-Port CAT6 Keystone Patch Panel",
    is_full_depth: false,
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS["patch-panel"],
    category: "patch-panel",
  },
  {
    slug: "deskpi-d-type-patch-panel-1u",
    u_height: 1,
    manufacturer: "DeskPi",
    model: "7D D-Type Patch Panel",
    is_full_depth: false,
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS["patch-panel"],
    category: "patch-panel",
  },

  // ============================================
  // Raspberry Pi Rack Mounts
  // ============================================
  {
    slug: "deskpi-rackmate-1u-2-pi",
    u_height: 1,
    manufacturer: "DeskPi",
    model: "RackMate 1U (2x Raspberry Pi)",
    is_full_depth: false,
    airflow: "passive",
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "deskpi-rackmate-2u-4-pi",
    u_height: 2,
    manufacturer: "DeskPi",
    model: "RackMate 2U (4x Raspberry Pi)",
    is_full_depth: false,
    airflow: "passive",
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },

  // ============================================
  // Rack Accessories
  // ============================================
  {
    slug: "deskpi-brush-panel-0-5u",
    u_height: 0.5,
    manufacturer: "DeskPi",
    model: "Brush Cable Manager",
    is_full_depth: false,
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS["cable-management"],
    category: "cable-management",
  },
  {
    slug: "deskpi-vented-shelf-0-5u",
    u_height: 0.5,
    manufacturer: "DeskPi",
    model: "Vented Rack Shelf",
    is_full_depth: false,
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS.shelf,
    category: "shelf",
  },
  {
    slug: "deskpi-rack-shelf-1u",
    u_height: 1,
    manufacturer: "DeskPi",
    model: "Rack Shelf",
    is_full_depth: false,
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS.shelf,
    category: "shelf",
  },

  // ============================================
  // RackMate planning placeholders
  // ============================================
  {
    slug: "deskpi-rackmate-1u-cable-entry",
    u_height: 1,
    manufacturer: "DeskPi",
    model: "RackMate 1U Cable Entry / Service Space",
    is_full_depth: false,
    is_powered: false,
    rack_widths: [10],
    colour: CATEGORY_COLOURS["cable-management"],
    category: "cable-management",
    custom_fields: {
      rackula_fit: {
        role: "service-clearance",
      },
    },
  },
  {
    slug: "deskpi-rackmate-tiny-1u-mount",
    u_height: 1,
    manufacturer: "DeskPi",
    model: "RackMate 1U Tiny Mount Placeholder",
    is_full_depth: false,
    is_powered: false,
    rack_widths: [10],
    colour: CATEGORY_COLOURS.shelf,
    category: "shelf",
    notes: "Planning placeholder for a printable Lenovo Tiny-class mount.",
    custom_fields: {
      rackula_fit: {
        status: "needs_stl_selection",
        mount_type: "3d-printed",
      },
    },
    slots: [
      {
        id: "main",
        name: "Main",
        position: { row: 0, col: 0 },
        width_fraction: 1,
        height_units: 1,
        accepts: ["server"],
      },
    ],
  },
  {
    slug: "deskpi-rackmate-ms02-3u-shelf",
    u_height: 3,
    manufacturer: "DeskPi",
    model: "RackMate MS-02 Ultra 3U Shelf Placeholder",
    is_full_depth: false,
    is_powered: false,
    rack_widths: [10],
    weight: 0.8,
    weight_unit: "kg",
    colour: CATEGORY_COLOURS.shelf,
    category: "shelf",
    notes:
      "Planning placeholder for a custom MS-02 Ultra shelf. Confirm load, airflow, and cable clearance before building.",
    custom_fields: {
      rackula_fit: {
        status: "needs_design",
        mount_type: "custom-shelf",
        rack_internal_depth_mm: 260,
      },
    },
    slots: [
      {
        id: "main",
        name: "Main",
        position: { row: 0, col: 0 },
        width_fraction: 1,
        height_units: 3,
        accepts: ["server"],
      },
    ],
  },
];
