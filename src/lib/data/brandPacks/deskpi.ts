/**
 * DeskPi Brand Pack
 * Pre-defined device types for DeskPi 10-inch rack accessories
 * Popular homelab brand for Raspberry Pi rack mounting solutions
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
    colour: CATEGORY_COLOURS["patch-panel"],
    category: "patch-panel",
  },
  {
    slug: "deskpi-12-port-keystone-patch-panel-1u",
    u_height: 1,
    manufacturer: "DeskPi",
    model: "12-Port CAT6 Keystone Patch Panel",
    is_full_depth: false,
    colour: CATEGORY_COLOURS["patch-panel"],
    category: "patch-panel",
  },
  {
    slug: "deskpi-d-type-patch-panel-1u",
    u_height: 1,
    manufacturer: "DeskPi",
    model: "7D D-Type Patch Panel",
    is_full_depth: false,
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
    colour: CATEGORY_COLOURS["cable-management"],
    category: "cable-management",
  },
  {
    slug: "deskpi-vented-shelf-0-5u",
    u_height: 0.5,
    manufacturer: "DeskPi",
    model: "Vented Rack Shelf",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.shelf,
    category: "shelf",
  },
  {
    slug: "deskpi-rack-shelf-1u",
    u_height: 1,
    manufacturer: "DeskPi",
    model: "Rack Shelf",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.shelf,
    category: "shelf",
  },
];
