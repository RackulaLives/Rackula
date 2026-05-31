/**
 * KWS Brand Pack
 * Pre-defined device types for the KWS 10-inch homelab rack system.
 *
 * KWS is a modular, heavy-duty 10-inch rack system designed by Ilan Kushnir
 * and distributed as free 3D-printable models on MakerWorld.
 * Source: https://makerworld.com/en/collections/17479078-kws-rack-system
 *
 * All KWS devices are 10-inch rack width (rack_widths: [10]).
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

export const kwsDevices: DeviceType[] = [
  // ============================================
  // Raspberry Pi Mounts
  // ============================================
  {
    slug: "kws-snap-in-system-2u",
    u_height: 2,
    manufacturer: "KWS",
    model: "KWS Snap-in System",
    is_full_depth: false,
    airflow: "passive",
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS.server,
    category: "server",
  },
  {
    slug: "kws-screen-module-pi-2u",
    u_height: 2,
    manufacturer: "KWS",
    model: "Screen Module (Raspberry Pi) 2U",
    is_full_depth: false,
    airflow: "passive",
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS.kvm,
    category: "kvm",
  },

  // ============================================
  // Storage
  // ============================================
  {
    slug: "kws-synology-4bay-nas-module-4u",
    u_height: 4,
    manufacturer: "KWS",
    model: "4-Bay NAS Module (Synology)",
    is_full_depth: false,
    airflow: "front-to-rear",
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },

  // ============================================
  // Shelves
  // ============================================
  {
    slug: "kws-power-supplies-shelf-2u",
    u_height: 2,
    manufacturer: "KWS",
    model: "Power Supplies Shelf 2U",
    is_full_depth: false,
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS.shelf,
    category: "shelf",
  },
];
