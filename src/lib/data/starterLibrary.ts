/**
 * Starter Device Type Library
 * Generic rack devices for quick prototyping and universal fallbacks
 *
 * Includes:
 * - Full-width and half-width (slot_width: 1) devices
 * - Shelf containers with slots and mini devices for shelf placement
 * - Carriers (carrier-1u-2col, carrier-1u-2x2, K-79, AV joining tray) that hold
 *   sub-U / half-width gear; the two carrier-* slugs are stable synthesis targets
 * All branded devices have been moved to brandPacks/
 */

import type {
  DeviceType,
  DeviceCategory,
  Slot,
  SubdeviceRole,
} from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

interface StarterDeviceSpec {
  slug: string;
  model: string;
  u_height: number;
  category: DeviceCategory;
  is_full_depth?: boolean;
  /** Width in slots: 1 = half-width, 2 = full-width. Default: 2 */
  slot_width?: 1 | 2;
  /** Container slots for shelf/container/chassis devices */
  slots?: Slot[];
  /** Subdevice role: parent (container) or child (fits in parent bay) */
  subdevice_role?: SubdeviceRole;
}

const STARTER_DEVICES: StarterDeviceSpec[] = [
  // Servers (4)
  { slug: "1u-server", model: "Server", u_height: 1, category: "server" },
  { slug: "2u-server", model: "Server", u_height: 2, category: "server" },
  { slug: "3u-server", model: "Server", u_height: 3, category: "server" },
  { slug: "4u-server", model: "Server", u_height: 4, category: "server" },

  // Firewall (2)
  {
    slug: "1u-router-firewall",
    model: "Router/Firewall",
    u_height: 1,
    category: "firewall",
  },
  {
    slug: "2u-router-firewall",
    model: "Router/Firewall",
    u_height: 2,
    category: "firewall",
  },

  // Network (2)
  {
    slug: "24-port-switch",
    model: "Switch (24-Port)",
    u_height: 1,
    category: "network",
  },
  {
    slug: "48-port-switch",
    model: "Switch (48-Port)",
    u_height: 1,
    category: "network",
  },

  // Storage (4)
  { slug: "1u-storage", model: "Storage", u_height: 1, category: "storage" },
  { slug: "2u-storage", model: "Storage", u_height: 2, category: "storage" },
  { slug: "3u-storage", model: "Storage", u_height: 3, category: "storage" },
  { slug: "4u-storage", model: "Storage", u_height: 4, category: "storage" },

  // Power (4)
  {
    slug: "1u-pdu",
    model: "PDU",
    u_height: 1,
    category: "power",
    is_full_depth: true,
  },
  {
    slug: "2u-pdu",
    model: "PDU",
    u_height: 2,
    category: "power",
    is_full_depth: true,
  },
  { slug: "2u-ups", model: "UPS", u_height: 2, category: "power" },
  { slug: "4u-ups", model: "UPS", u_height: 4, category: "power" },

  // Patch Panels (3)
  {
    slug: "1u-fiber-patch-panel",
    model: "Fiber Patch Panel",
    u_height: 1,
    category: "patch-panel",
    is_full_depth: false,
  },
  {
    slug: "24-port-patch-panel",
    model: "Patch Panel (24-Port)",
    u_height: 1,
    category: "patch-panel",
    is_full_depth: false,
  },
  {
    slug: "48-port-patch-panel",
    model: "Patch Panel (48-Port)",
    u_height: 2,
    category: "patch-panel",
    is_full_depth: false,
  },

  // KVM (2)
  {
    slug: "1u-console-drawer",
    model: "Console Drawer",
    u_height: 1,
    category: "kvm",
  },
  { slug: "1u-kvm", model: "KVM Switch", u_height: 1, category: "kvm" },

  // AV/Media (8)
  {
    slug: "1u-amplifier",
    model: "Amplifier",
    u_height: 1,
    category: "av-media",
  },
  {
    slug: "2u-amplifier",
    model: "Amplifier",
    u_height: 2,
    category: "av-media",
  },
  {
    slug: "1u-audio-processor",
    model: "Audio Processor",
    u_height: 1,
    category: "av-media",
  },
  {
    slug: "1u-av-receiver",
    model: "AV Receiver",
    u_height: 1,
    category: "av-media",
  },
  {
    slug: "2u-av-receiver",
    model: "AV Receiver",
    u_height: 2,
    category: "av-media",
  },
  {
    slug: "3u-power-amplifier",
    model: "Power Amplifier",
    u_height: 3,
    category: "av-media",
  },
  {
    slug: "1u-streaming-encoder",
    model: "Streaming Encoder",
    u_height: 1,
    category: "av-media",
  },
  {
    slug: "1u-video-switcher",
    model: "Video Switcher",
    u_height: 1,
    category: "av-media",
  },

  // Cooling (2)
  {
    slug: "1u-fan-panel",
    model: "Fan Panel",
    u_height: 1,
    category: "cooling",
    is_full_depth: false,
  },
  {
    slug: "2u-fan-panel",
    model: "Fan Panel",
    u_height: 2,
    category: "cooling",
    is_full_depth: false,
  },

  // Shelves - Static (4)
  {
    slug: "1u-cantilever-shelf",
    model: "Cantilever Shelf",
    u_height: 1,
    category: "shelf",
    is_full_depth: false,
  },
  { slug: "1u-shelf", model: "Shelf", u_height: 1, category: "shelf" },
  { slug: "2u-shelf", model: "Shelf", u_height: 2, category: "shelf" },
  {
    slug: "1u-vented-shelf",
    model: "Vented Shelf",
    u_height: 1,
    category: "shelf",
  },

  // Shelf Containers - with slots for mini devices (4)
  {
    slug: "shelf-1u-2slot",
    model: "Shelf (2 Slot)",
    u_height: 1,
    category: "shelf",
    slots: [
      {
        id: "left",
        name: "Left",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
        height_units: 1,
      },
      {
        id: "right",
        name: "Right",
        position: { row: 0, col: 1 },
        width_fraction: 0.5,
        height_units: 1,
      },
    ],
  },
  {
    slug: "shelf-1u-3slot",
    model: "Shelf (3 Slot)",
    u_height: 1,
    category: "shelf",
    slots: [
      {
        id: "left",
        name: "Left",
        position: { row: 0, col: 0 },
        width_fraction: 0.33,
        height_units: 1,
      },
      {
        id: "center",
        name: "Center",
        position: { row: 0, col: 1 },
        width_fraction: 0.34,
        height_units: 1,
      },
      {
        id: "right",
        name: "Right",
        position: { row: 0, col: 2 },
        width_fraction: 0.33,
        height_units: 1,
      },
    ],
  },
  {
    slug: "shelf-2u-2slot",
    model: "Shelf (2 Slot)",
    u_height: 2,
    category: "shelf",
    slots: [
      {
        id: "left",
        name: "Left",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
        height_units: 2,
      },
      {
        id: "right",
        name: "Right",
        position: { row: 0, col: 1 },
        width_fraction: 0.5,
        height_units: 2,
      },
    ],
  },
  {
    slug: "shelf-2u-3slot",
    model: "Shelf (3 Slot)",
    u_height: 2,
    category: "shelf",
    slots: [
      {
        id: "left",
        name: "Left",
        position: { row: 0, col: 0 },
        width_fraction: 0.33,
        height_units: 2,
      },
      {
        id: "center",
        name: "Center",
        position: { row: 0, col: 1 },
        width_fraction: 0.34,
        height_units: 2,
      },
      {
        id: "right",
        name: "Right",
        position: { row: 0, col: 2 },
        width_fraction: 0.33,
        height_units: 2,
      },
    ],
  },

  // Carriers - generic 1U mounts for sub-U / half-width gear.
  // The two synthesized-carrier slugs below (carrier-1u-2col, carrier-1u-2x2)
  // are STABLE: the import adapter and drag/drop synthesize these exact slugs.
  // Slots omit `accepts` so fit is dimensional, not category-based.
  {
    slug: "carrier-1u-2col",
    model: "Carrier (1U, 2 Column)",
    u_height: 1,
    category: "shelf",
    subdevice_role: "parent",
    slots: [
      {
        id: "col-1",
        name: "Column 1",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
        height_units: 1,
      },
      {
        id: "col-2",
        name: "Column 2",
        position: { row: 0, col: 1 },
        width_fraction: 0.5,
        height_units: 1,
      },
    ],
  },
  {
    slug: "carrier-1u-2x2",
    model: "Carrier (1U, 2x2)",
    u_height: 1,
    category: "shelf",
    subdevice_role: "parent",
    // Row 0 is the bottom row (SlotPosition2D: row is 0-indexed from bottom).
    slots: [
      {
        id: "r0-c0",
        name: "Bottom Left",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
        height_units: 0.5,
      },
      {
        id: "r0-c1",
        name: "Bottom Right",
        position: { row: 0, col: 1 },
        width_fraction: 0.5,
        height_units: 0.5,
      },
      {
        id: "r1-c0",
        name: "Top Left",
        position: { row: 1, col: 0 },
        width_fraction: 0.5,
        height_units: 0.5,
      },
      {
        id: "r1-c1",
        name: "Top Right",
        position: { row: 1, col: 1 },
        width_fraction: 0.5,
        height_units: 0.5,
      },
    ],
  },
  {
    slug: "carrier-k79-2x2",
    model: "K-79 Mounting Kit",
    u_height: 1,
    category: "shelf",
    subdevice_role: "parent",
    // Row 0 is the bottom row (SlotPosition2D: row is 0-indexed from bottom).
    slots: [
      {
        id: "r0-c0",
        name: "Bottom Left",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
        height_units: 0.5,
      },
      {
        id: "r0-c1",
        name: "Bottom Right",
        position: { row: 0, col: 1 },
        width_fraction: 0.5,
        height_units: 0.5,
      },
      {
        id: "r1-c0",
        name: "Top Left",
        position: { row: 1, col: 0 },
        width_fraction: 0.5,
        height_units: 0.5,
      },
      {
        id: "r1-c1",
        name: "Top Right",
        position: { row: 1, col: 1 },
        width_fraction: 0.5,
        height_units: 0.5,
      },
    ],
  },
  {
    slug: "carrier-av-tray-2col",
    model: "AV Joining Tray (2 Column)",
    u_height: 1,
    category: "shelf",
    subdevice_role: "parent",
    slots: [
      // Width-only: slots omit height_units so the tray never has a height
      // grid (the MikroTik 2x2 grid is not assumed universal).
      {
        id: "col-1",
        name: "Left",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
      },
      {
        id: "col-2",
        name: "Right",
        position: { row: 0, col: 1 },
        width_fraction: 0.5,
      },
    ],
  },

  // Mini Devices - for placement on shelf slots
  // A single generic entry (generic-mini-pc) with a generic model value.
  // Branded mini PCs and SBCs live in their own brand packs.
  {
    slug: "generic-mini-pc",
    model: "Mini PC",
    u_height: 1,
    category: "server",
    slot_width: 1,
    is_full_depth: false,
  },

  // Blade Chassis and Blade Servers (4)
  // Blade chassis are containers that hold blade server modules
  {
    slug: "blade-chassis-4u",
    model: "Blade Chassis (4-Bay)",
    u_height: 4,
    category: "chassis",
    subdevice_role: "parent",
    slots: [
      {
        id: "bay-1",
        name: "Bay 1",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
        height_units: 2,
        accepts: ["server"],
      },
      {
        id: "bay-2",
        name: "Bay 2",
        position: { row: 0, col: 1 },
        width_fraction: 0.5,
        height_units: 2,
        accepts: ["server"],
      },
      {
        id: "bay-3",
        name: "Bay 3",
        position: { row: 1, col: 0 },
        width_fraction: 0.5,
        height_units: 2,
        accepts: ["server"],
      },
      {
        id: "bay-4",
        name: "Bay 4",
        position: { row: 1, col: 1 },
        width_fraction: 0.5,
        height_units: 2,
        accepts: ["server"],
      },
    ],
  },
  {
    slug: "blade-chassis-7u",
    model: "Blade Chassis (8-Bay)",
    u_height: 7,
    category: "chassis",
    subdevice_role: "parent",
    slots: [
      {
        id: "bay-1",
        name: "Bay 1",
        position: { row: 0, col: 0 },
        width_fraction: 0.25,
        height_units: 7,
        accepts: ["server"],
      },
      {
        id: "bay-2",
        name: "Bay 2",
        position: { row: 0, col: 1 },
        width_fraction: 0.25,
        height_units: 7,
        accepts: ["server"],
      },
      {
        id: "bay-3",
        name: "Bay 3",
        position: { row: 0, col: 2 },
        width_fraction: 0.25,
        height_units: 7,
        accepts: ["server"],
      },
      {
        id: "bay-4",
        name: "Bay 4",
        position: { row: 0, col: 3 },
        width_fraction: 0.25,
        height_units: 7,
        accepts: ["server"],
      },
    ],
  },
  {
    slug: "blade-server-half",
    model: "Blade Server (Half-Height)",
    u_height: 2,
    category: "server",
    subdevice_role: "child",
    slot_width: 1,
    is_full_depth: false,
  },
  {
    slug: "blade-server-full",
    model: "Blade Server (Full-Height)",
    u_height: 4,
    category: "server",
    subdevice_role: "child",
    slot_width: 1,
    is_full_depth: false,
  },

  // Blanks (5)
  {
    slug: "0-5u-blank",
    model: "Blank Panel",
    u_height: 0.5,
    category: "blank",
    is_full_depth: false,
  },
  {
    slug: "1u-blank",
    model: "Blank Panel",
    u_height: 1,
    category: "blank",
    is_full_depth: false,
  },
  {
    slug: "2u-blank",
    model: "Blank Panel",
    u_height: 2,
    category: "blank",
    is_full_depth: false,
  },
  {
    slug: "3u-blank",
    model: "Blank Panel",
    u_height: 3,
    category: "blank",
    is_full_depth: false,
  },
  {
    slug: "4u-blank",
    model: "Blank Panel",
    u_height: 4,
    category: "blank",
    is_full_depth: false,
  },

  // Cable Management (3)
  {
    slug: "1u-brush-panel",
    model: "Brush Panel",
    u_height: 1,
    category: "cable-management",
    is_full_depth: false,
  },
  {
    slug: "1u-cable-manager",
    model: "Cable Manager",
    u_height: 1,
    category: "cable-management",
    is_full_depth: false,
  },
  {
    slug: "2u-cable-manager",
    model: "Cable Manager",
    u_height: 2,
    category: "cable-management",
    is_full_depth: false,
  },

  // Half-Width Devices (8) - slot_width: 1
  {
    slug: "1u-half-blank",
    model: "Half Blank Panel",
    u_height: 1,
    category: "blank",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "2u-half-blank",
    model: "Half Blank Panel",
    u_height: 2,
    category: "blank",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "1u-half-shelf",
    model: "Half Shelf",
    u_height: 1,
    category: "shelf",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "1u-half-patch-panel",
    model: "Half Patch Panel",
    u_height: 1,
    category: "patch-panel",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "1u-half-switch",
    model: "Half Switch (8-Port)",
    u_height: 1,
    category: "network",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "1u-half-brush-panel",
    model: "Half Brush Panel",
    u_height: 1,
    category: "cable-management",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "1u-mini-ups",
    model: "Mini UPS",
    u_height: 1,
    category: "power",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "1u-half-fan",
    model: "Half Fan Panel",
    u_height: 1,
    category: "cooling",
    is_full_depth: false,
    slot_width: 1,
  },
];

// Cache the transformed library
let cachedStarterLibrary: DeviceType[] | null = null;

/**
 * Get all starter library devices
 * Returns DeviceType[] with colors applied from category
 */
export function getStarterLibrary(): DeviceType[] {
  if (!cachedStarterLibrary) {
    cachedStarterLibrary = STARTER_DEVICES.map((spec) => ({
      slug: spec.slug,
      model: spec.model,
      u_height: spec.u_height,
      is_full_depth: spec.is_full_depth,
      slot_width: spec.slot_width ?? 2,
      colour: CATEGORY_COLOURS[spec.category],
      category: spec.category,
      slots: spec.slots,
      subdevice_role: spec.subdevice_role,
    }));
  }
  return cachedStarterLibrary;
}

/**
 * Find a starter device by slug
 */
export function findStarterDevice(slug: string): DeviceType | undefined {
  return getStarterLibrary().find((d) => d.slug === slug);
}

// Cache for starter slugs
let starterSlugsCache: Set<string> | null = null;

/**
 * Get a Set of all starter device slugs for fast lookup
 */
export function getStarterSlugs(): Set<string> {
  if (!starterSlugsCache) {
    starterSlugsCache = new Set(getStarterLibrary().map((d) => d.slug));
  }
  return starterSlugsCache;
}
