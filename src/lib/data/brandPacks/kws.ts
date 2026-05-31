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
  // Patch Panels
  // ============================================
  {
    slug: "kws-patch-keystones-panel-2u",
    u_height: 2,
    manufacturer: "KWS",
    model: "Patch Keystones Panel 2U",
    is_full_depth: false,
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS["patch-panel"],
    category: "patch-panel",
  },
  {
    slug: "kws-patch-keystones-panel-3u",
    u_height: 3,
    manufacturer: "KWS",
    model: "Patch Keystones Panel 3U",
    is_full_depth: false,
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS["patch-panel"],
    category: "patch-panel",
  },

  // ============================================
  // Raspberry Pi Mounts
  // ============================================
  {
    slug: "kws-snapin-8bay-pi-cluster-2u",
    u_height: 2,
    manufacturer: "KWS",
    model: "SnapIn 8-Bay Raspberry Pi Cluster 2U",
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

  // ============================================
  // Cable Management
  // ============================================
  {
    slug: "kws-cable-management-mount-1u",
    u_height: 1,
    manufacturer: "KWS",
    model: "Cable Management Mount 1U",
    is_full_depth: false,
    slot_width: 1,
    rack_widths: [10],
    colour: CATEGORY_COLOURS["cable-management"],
    category: "cable-management",
  },
];
