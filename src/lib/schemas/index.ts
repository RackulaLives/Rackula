/**
 * Layout Zod Validation Schemas
 * v0.7.0+ uses internal position units (1/6U)
 */

import { z } from "../zod";
import { nanoid } from "nanoid";
import { UNITS_PER_U } from "$lib/types/constants";
import { VERSION } from "$lib/version";

/**
 * Slug pattern: lowercase alphanumeric with hyphens, no leading/trailing/consecutive hyphens
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Hex colour pattern: 6-character hex with # prefix
 */
const HEX_COLOUR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// ============================================================================
// Basic Schemas
// ============================================================================

/**
 * Slug schema for device identification
 */
export const SlugSchema = z
  .string()
  .min(1, "Slug is required")
  .max(100, "Slug must be 100 characters or less")
  .regex(
    SLUG_PATTERN,
    "Slug must be lowercase with hyphens only (no leading/trailing/consecutive)",
  );

/**
 * Device category enum
 */
export const DeviceCategorySchema = z.enum([
  "server",
  "network",
  "patch-panel",
  "power",
  "storage",
  "kvm",
  "av-media",
  "cooling",
  "shelf",
  "blank",
  "cable-management",
  "chassis",
  "other",
]);

/**
 * Rack form factor enum
 */
export const FormFactorSchema = z.enum([
  "2-post",
  "4-post",
  "4-post-cabinet",
  "wall-mount",
  "open-frame",
]);

/**
 * Device face in rack
 */
export const DeviceFaceSchema = z.enum(["front", "rear", "both"]);

/**
 * Weight unit enum
 */
export const WeightUnitSchema = z.enum(["kg", "lb"]);

/**
 * Display mode enum
 */
export const DisplayModeSchema = z.enum(["label", "image", "image-label"]);

/**
 * Airflow direction enum (NetBox-compatible)
 */
export const AirflowSchema = z.enum([
  "passive",
  "front-to-rear",
  "rear-to-front",
  "left-to-right",
  "right-to-left",
  "side-to-rear",
  "mixed",
]);

/**
 * Subdevice role enum
 */
export const SubdeviceRoleSchema = z.enum(["parent", "child"]);

/**
 * Slot position enum for horizontal device placement
 */
export const SlotPositionSchema = z.enum(["left", "right", "full"]);

/**
 * Slot width enum for device width in slots
 */
export const SlotWidthSchema = z.union([z.literal(1), z.literal(2)]);

/**
 * Rack width in inches (physical rack standard widths).
 * Rackula-specific extension (not in NetBox DeviceType schema).
 */
export const RackWidthSchema = z.union([
  z.literal(10),
  z.literal(19),
  z.literal(23),
]);

/**
 * Network interface type enum (NetBox-compatible subset)
 */
export const InterfaceTypeSchema = z.enum([
  // Copper Ethernet
  "100base-tx",
  "1000base-t",
  "2.5gbase-t",
  "5gbase-t",
  "10gbase-t",
  // Modular - SFP/SFP+/SFP28
  "1000base-x-sfp",
  "10gbase-x-sfpp",
  "25gbase-x-sfp28",
  // Modular - QSFP/QSFP28/QSFP-DD
  "40gbase-x-qsfpp",
  "100gbase-x-qsfp28",
  "100gbase-x-qsfpdd",
  "200gbase-x-qsfp56",
  "200gbase-x-qsfpdd",
  "400gbase-x-qsfpdd",
  // Console & Management
  "console",
  "usb-a",
  "usb-b",
  "usb-c",
  "usb-mini-b",
  "usb-micro-b",
  // Virtual
  "virtual",
  "lag",
  // Other
  "other",
]);

/**
 * PoE type enum (NetBox-compatible)
 */
export const PoETypeSchema = z.enum([
  "type1-ieee802.3af",
  "type2-ieee802.3at",
  "type3-ieee802.3bt",
  "type4-ieee802.3bt",
  "passive-24v-1pair",
  "passive-24v-2pair",
  "passive-48v-1pair",
  "passive-48v-2pair",
  "passive-56v-4pair",
]);

/**
 * PoE mode enum
 */
export const PoEModeSchema = z.enum(["pd", "pse"]);

/**
 * Interface position enum
 */
export const InterfacePositionSchema = z.enum(["front", "rear"]);

/**
 * Cable type enum (NetBox-compatible)
 */
export const CableTypeSchema = z.enum([
  // Copper Ethernet
  "cat5e",
  "cat6",
  "cat6a",
  "cat7",
  "cat8",
  // Direct Attach Copper
  "dac-passive",
  "dac-active",
  // Fiber - Multi-mode
  "mmf-om3",
  "mmf-om4",
  // Fiber - Single-mode
  "smf-os2",
  // Active Optical Cable
  "aoc",
  // Power & Serial
  "power",
  "serial",
]);

/**
 * Cable status enum (NetBox-compatible)
 */
export const CableStatusSchema = z.enum([
  "connected",
  "planned",
  "decommissioning",
]);

/**
 * Length unit enum for cable measurements
 */
export const LengthUnitSchema = z.enum(["m", "cm", "ft", "in"]);

// ============================================================================
// Container Slot Schemas (v0.6.0)
// ============================================================================

/**
 * Position within a container's slot grid
 */
export const SlotPosition2DSchema = z.object({
  row: z.number().int().min(0, "Row must be non-negative"),
  col: z.number().int().min(0, "Column must be non-negative"),
});

/**
 * Slot definition for container devices
 * A DeviceType with slots[] is a container that can hold child devices
 */
export const SlotSchema = z
  .object({
    id: z.string().min(1, "Slot ID is required"),
    name: z.string().max(100).optional(),
    position: SlotPosition2DSchema,
    width_fraction: z
      .number()
      .positive("Width fraction must be positive")
      .max(1, "Width fraction cannot exceed 1")
      .optional(),
    height_units: z
      .number()
      .positive("Height units must be positive")
      .max(50, "Height units cannot exceed 50U")
      .optional(),
    accepts: z.array(DeviceCategorySchema).optional(),
  })
  .passthrough();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validates that all slugs in an array are unique
 * @param device_types - Array of objects with slug property
 * @returns Array of duplicate slugs (empty if all unique)
 */
export function validateSlugUniqueness(
  device_types: { slug: string }[],
): string[] {
  const slugCounts = new Map<string, number>();

  for (const dt of device_types) {
    slugCounts.set(dt.slug, (slugCounts.get(dt.slug) ?? 0) + 1);
  }

  const duplicates: string[] = [];
  for (const [slug, count] of slugCounts) {
    if (count > 1) {
      duplicates.push(slug);
    }
  }

  return duplicates;
}

// ============================================================================
// Component Schemas (NetBox-compatible)
// ============================================================================

/**
 * Network interface template schema (NetBox-compatible with Rackula extensions)
 */
export const InterfaceTemplateSchema = z
  .object({
    name: z.string().min(1, "Interface name is required"),
    type: InterfaceTypeSchema,
    label: z.string().max(64).optional(),
    mgmt_only: z.boolean().optional(),
    position: InterfacePositionSchema.optional(),
    poe_mode: PoEModeSchema.optional(),
    poe_type: PoETypeSchema.optional(),
  })
  .passthrough();

/**
 * @deprecated Use InterfaceTemplateSchema instead
 * Legacy network interface schema (kept for backward compatibility)
 */
export const InterfaceSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    mgmt_only: z.boolean().optional(),
  })
  .passthrough();

/**
 * Power port (input) schema
 */
export const PowerPortSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().optional(),
    maximum_draw: z.number().positive().optional(),
    allocated_draw: z.number().positive().optional(),
  })
  .passthrough();

/**
 * Power outlet (output) schema
 */
export const PowerOutletSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().optional(),
    power_port: z.string().optional(),
    feed_leg: z.enum(["A", "B", "C"]).optional(),
  })
  .passthrough();

/**
 * Device bay schema (for blade chassis, modular switches)
 */
export const DeviceBaySchema = z
  .object({
    name: z.string().min(1),
    position: z.string().optional(),
  })
  .passthrough();

/**
 * Inventory item schema
 */
export const InventoryItemSchema = z
  .object({
    name: z.string().min(1),
    manufacturer: z.string().optional(),
    part_id: z.string().optional(),
    serial: z.string().optional(),
    asset_tag: z.string().optional(),
  })
  .passthrough();

/**
 * Device link schema
 */
export const DeviceLinkSchema = z
  .object({
    label: z.string().min(1),
    url: z.string().url(),
  })
  .passthrough();

// ============================================================================
// PlacedPort Schema
// ============================================================================

/**
 * PlacedPort schema - instantiated port with stable UUID
 * Created when a device is placed in a rack
 */
export const PlacedPortSchema = z
  .object({
    id: z.string().min(1, "Port ID is required"),
    template_name: z.string().min(1, "Template name is required"),
    template_index: z
      .number()
      .int()
      .min(0, "Template index must be non-negative"),
    type: InterfaceTypeSchema,
    label: z.string().max(64).optional(),
  })
  .passthrough();

// ============================================================================
// Connection Schema (Port-based - MVP)
// ============================================================================

/**
 * Connection schema - port-to-port connection (MVP model)
 * Uses PlacedPort.id for stable references
 */
export const ConnectionSchema = z
  .object({
    id: z.string().min(1, "Connection ID is required"),
    a_port_id: z.string().min(1, "A-side port ID is required"),
    b_port_id: z.string().min(1, "B-side port ID is required"),
    label: z.string().max(100).optional(),
    color: z
      .string()
      .regex(
        HEX_COLOUR_PATTERN,
        "Color must be a valid hex color (e.g., #FF5500)",
      )
      .optional(),
  })
  .passthrough()
  .refine((data) => data.a_port_id !== data.b_port_id, {
    message: "Cannot connect a port to itself",
    path: ["b_port_id"],
  });

// ============================================================================
// Cable Schemas (NetBox-compatible) - DEPRECATED
// ============================================================================

/**
 * @deprecated Use ConnectionSchema instead - Cable uses fragile device+interface references
 */
export const CableSchema = z
  .object({
    // Unique identifier
    id: z.string().min(1, "Cable ID is required"),

    // A-side termination
    a_device_id: z.string().min(1, "A-side device ID is required"),
    a_interface: z.string().min(1, "A-side interface is required"),

    // B-side termination
    b_device_id: z.string().min(1, "B-side device ID is required"),
    b_interface: z.string().min(1, "B-side interface is required"),

    // Cable properties
    type: CableTypeSchema.optional(),
    color: z
      .string()
      .regex(
        HEX_COLOUR_PATTERN,
        "Color must be a valid hex color (e.g., #FF5500)",
      )
      .optional(),
    label: z.string().max(100).optional(),
    length: z.number().positive().optional(),
    length_unit: LengthUnitSchema.optional(),
    status: CableStatusSchema.optional(),
  })
  .passthrough()
  .refine(
    (data) => {
      // If length is provided, length_unit must also be provided
      if (data.length !== undefined && data.length_unit === undefined) {
        return false;
      }
      return true;
    },
    {
      message: "length_unit is required when length is specified",
      path: ["length_unit"],
    },
  );

// ============================================================================
// Composite Schemas
// ============================================================================

/**
 * Device Type schema - library template definition
 * Schema v1.0.0: Flat structure with NetBox-compatible fields
 */
export const DeviceTypeSchema = z
  .object({
    // --- Core Identity ---
    slug: SlugSchema,
    manufacturer: z.string().max(100).optional(),
    model: z.string().max(100).optional(),
    part_number: z.string().max(100).optional(),

    // --- Physical Properties ---
    u_height: z
      .number()
      .min(0.5, "Height must be at least 0.5U")
      .max(50, "Height cannot exceed 50U")
      .refine((val) => val % 0.5 === 0, "Height must be a multiple of 0.5U"),
    slot_width: SlotWidthSchema.optional(),
    rack_widths: z.array(RackWidthSchema).optional(),
    is_full_depth: z.boolean().optional(),
    is_powered: z.boolean().optional(),
    weight: z.number().positive().optional(),
    weight_unit: WeightUnitSchema.optional(),
    airflow: AirflowSchema.optional(),

    // --- Image Flags ---
    front_image: z.boolean().optional(),
    rear_image: z.boolean().optional(),

    // --- Rackula Fields (flat, not nested) ---
    colour: z
      .string()
      .regex(HEX_COLOUR_PATTERN, "Colour must be a valid 6-character hex code"),
    category: DeviceCategorySchema,
    tags: z.array(z.string()).optional(),

    // --- Extension Fields ---
    notes: z.string().max(1000).optional(),
    serial_number: z.string().max(100).optional(),
    asset_tag: z.string().max(100).optional(),
    links: z.array(DeviceLinkSchema).optional(),
    custom_fields: z.record(z.string(), z.any()).optional(),

    // --- Component Arrays ---
    interfaces: z.array(InterfaceTemplateSchema).optional(),
    power_ports: z.array(PowerPortSchema).optional(),
    power_outlets: z.array(PowerOutletSchema).optional(),
    device_bays: z.array(DeviceBaySchema).optional(),
    inventory_items: z.array(InventoryItemSchema).optional(),

    // --- Subdevice Support ---
    subdevice_role: SubdeviceRoleSchema.optional(),

    // --- Power Device Properties ---
    va_rating: z
      .number()
      .int()
      .positive("VA rating must be a positive integer")
      .optional(),

    // --- Container Support (v0.6.0) ---
    /**
     * Slot definitions for container devices.
     * Presence of slots[] with length > 0 indicates this is a container device.
     */
    slots: z.array(SlotSchema).optional(),
  })
  .passthrough();

/**
 * Placed device schema - instance in rack
 * Position semantics:
 * - Rack-level devices: position is 1-indexed U position
 * - Container children (container_id set): position is 0-indexed relative to container
 */
export const PlacedDeviceSchema = z
  .object({
    id: z.string().min(1, "ID is required"),
    device_type: SlugSchema,
    name: z.string().max(100, "Name must be 100 characters or less").optional(),
    // Position is 1-indexed for rack-level, 0-indexed for container children
    // Validation: min 0 to allow container children, superRefine validates rack-level >= 1
    position: z.number().int().min(0, "Position must be non-negative"),
    face: DeviceFaceSchema,
    slot_position: SlotPositionSchema.optional(),

    // --- Port Instances ---
    ports: z.array(PlacedPortSchema).default([]),

    // --- Placement Image Override ---
    front_image: z.string().optional(),
    rear_image: z.string().optional(),

    // --- Placement Colour Override ---
    colour_override: z
      .string()
      .regex(
        /^#[0-9A-Fa-f]{6}$/,
        "Colour must be a valid hex colour (e.g., #FF5555)",
      )
      .optional(),

    // --- Subdevice Placement ---
    parent_device: z.string().optional(),
    device_bay: z.string().optional(),

    // --- Container Child Placement (v0.6.0) ---
    /** UUID of parent PlacedDevice if nested in a container */
    container_id: z.string().optional(),
    /** Which slot in parent container (references Slot.id) */
    slot_id: z.string().optional(),

    // --- Extension Fields ---
    notes: z.string().max(1000).optional(),
    custom_fields: z.record(z.string(), z.any()).optional(),
  })
  .passthrough()
  .refine(
    (data) => {
      // If container_id is set, slot_id should also be set
      if (data.container_id && !data.slot_id) {
        return false;
      }
      return true;
    },
    {
      message: "slot_id is required when container_id is set",
      path: ["slot_id"],
    },
  )
  .refine(
    (data) => {
      // Rack-level devices (no container_id) must have position >= 1
      if (!data.container_id && data.position < 1) {
        return false;
      }
      return true;
    },
    {
      message: "Rack-level device position must be at least 1",
      path: ["position"],
    },
  );

/**
 * Rack schema base (without id requirement for legacy migration)
 * Used internally - LayoutSchema transform ensures id is always present in output
 */
const RackSchemaInput = z
  .object({
    id: z.string().min(1).optional(), // Optional for legacy migration
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or less"),
    height: z
      .number()
      .int()
      .min(1, "Height must be at least 1U")
      .max(100, "Height cannot exceed 100U"),
    width: z.union([
      z.literal(10),
      z.literal(19),
      z.literal(21),
      z.literal(23),
    ]),
    desc_units: z.boolean(),
    show_rear: z.boolean().default(true),
    form_factor: FormFactorSchema,
    starting_unit: z.number().int().min(1),
    position: z.number().int().min(0),
    devices: z.array(PlacedDeviceSchema),
    notes: z.string().max(1000).optional(),
  })
  .passthrough();

/**
 * Rack schema (id is required for multi-rack support)
 * After migration transform, id is always present
 */
export const RackSchema = z
  .object({
    id: z.string().min(1, "Rack ID is required"),
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or less"),
    height: z
      .number()
      .int()
      .min(1, "Height must be at least 1U")
      .max(100, "Height cannot exceed 100U"),
    width: z.union([
      z.literal(10),
      z.literal(19),
      z.literal(21),
      z.literal(23),
    ]),
    desc_units: z.boolean(),
    show_rear: z.boolean().default(true),
    form_factor: FormFactorSchema,
    starting_unit: z.number().int().min(1),
    position: z.number().int().min(0),
    devices: z.array(PlacedDeviceSchema),
    notes: z.string().max(1000).optional(),
  })
  .passthrough();

/**
 * Layout preset for rack groups
 */
export const RackGroupLayoutPresetSchema = z.enum(["bayed", "row"]);

/**
 * Rack group schema for touring/bayed rack configurations
 */
export const RackGroupSchema = z
  .object({
    id: z.string().min(1, "Group ID is required"),
    name: z.string().max(100).optional(),
    rack_ids: z
      .array(z.string().min(1, "Rack ID cannot be empty"))
      .min(1, "At least one rack ID is required"),
    layout_preset: RackGroupLayoutPresetSchema.optional(),
  })
  .passthrough();

/**
 * Layout settings schema
 */
export const LayoutSettingsSchema = z
  .object({
    display_mode: DisplayModeSchema,
    show_labels_on_images: z.boolean(),
  })
  .passthrough();

/**
 * Layout schema input (accepts legacy format)
 * Handles migration from Layout.rack → Layout.racks[]
 * Version is optional to support very old layouts without version field
 */
const LayoutSchemaInput = z
  .object({
    version: z.string().optional(),
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or less"),
    // Modern format: racks array (optional in input for legacy migration)
    racks: z.array(RackSchemaInput).optional(),
    // Legacy format: single rack (optional, converted by transform)
    rack: RackSchemaInput.optional(),
    rack_groups: z.array(RackGroupSchema).optional(),
    device_types: z.array(DeviceTypeSchema),
    settings: LayoutSettingsSchema,
    connections: z.array(ConnectionSchema).optional(),
    /** @deprecated Use connections instead */
    cables: z.array(CableSchema).optional(),
  })
  .passthrough();

/**
 * Compare two semver version strings
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 * Note: Pre-release suffixes (e.g., -dev, -alpha.1) and build metadata are stripped
 */
function compareVersions(a: string, b: string): number {
  // Strip pre-release (-dev, -alpha.1, etc.) and build metadata (+build)
  const stripSuffix = (v: string) => v.split(/[-+]/)[0] ?? v;
  const cleanA = stripSuffix(a.trim());
  const cleanB = stripSuffix(b.trim());

  const partsA = cleanA.split(".").map((p) => parseInt(p) || 0);
  const partsB = cleanB.split(".").map((p) => parseInt(p) || 0);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] ?? 0;
    const partB = partsB[i] ?? 0;
    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }
  return 0;
}

/**
 * Check if a layout needs position migration.
 * Uses two checks (belt and suspenders):
 * 1. Version < 0.7.0 (when internal units were introduced)
 * 2. Heuristic: any rack-level device with position < UNITS_PER_U
 */
function needsPositionMigration(
  version: string | undefined,
  devices: { position: number; container_id?: string }[],
): boolean {
  // Check 1: Version-based detection
  // Layouts before 0.7.0 use old U-value positions
  if (!version || compareVersions(version, "0.7.0") < 0) {
    return true;
  }

  // Check 2: Heuristic fallback
  // If any rack-level device has position < UNITS_PER_U, it's old format
  // (U1 in new format = UNITS_PER_U, so valid positions are >= UNITS_PER_U)
  const hasOldFormatPosition = devices.some(
    (d) =>
      d.container_id === undefined &&
      d.position >= 1 &&
      d.position < UNITS_PER_U,
  );
  if (hasOldFormatPosition) {
    return true;
  }

  return false;
}

/**
 * Migrate device positions from old format to internal units
 * Old: position = U number (1, 2, 1.5)
 * New: position = internal units (6, 12, 9)
 *
 * Container children (with container_id) are NOT migrated since they use
 * 0-indexed positions relative to the container.
 */
function migrateDevicePositions(
  devices: { position: number; container_id?: string }[],
): { position: number; container_id?: string }[] {
  return devices.map((device) => {
    // Container children keep their 0-indexed positions
    if (device.container_id !== undefined) {
      return device;
    }
    // Rack-level devices: multiply position by UNITS_PER_U
    return {
      ...device,
      position: Math.round(device.position * UNITS_PER_U),
    };
  });
}

/**
 * Complete layout schema (base, with migration transform)
 * Uses racks array for multi-rack support
 * Transform handles:
 * - Legacy rack → racks[0] migration
 * - Generating nanoid for racks missing id field
 * - Position migration from U values to internal units (v0.7.0)
 */
const LayoutSchemaBase = LayoutSchemaInput.transform((data) => {
  // Determine the racks array
  let racks: z.infer<typeof RackSchemaInput>[];

  if (data.racks && data.racks.length > 0) {
    // Modern format: use racks array (ignore legacy rack if both present)
    racks = data.racks;
  } else if (data.rack) {
    // Legacy format: wrap single rack in array
    racks = [data.rack];
  } else {
    // Neither present - let validation fail naturally
    racks = [];
  }

  // Collect all devices across all racks for heuristic check
  const allDevices = racks.flatMap((r) => r.devices);

  // Check if positions need migration (pre-0.7.0 format)
  const migratePositions = needsPositionMigration(data.version, allDevices);

  // Generate IDs for racks missing them and migrate positions if needed
  const racksWithIds = racks.map((rack) => ({
    ...rack,
    id: rack.id ?? nanoid(),
    devices: migratePositions
      ? migrateDevicePositions(rack.devices)
      : rack.devices,
  }));

  // Build the output without the legacy 'rack' field
  const { rack: _legacyRack, racks: _inputRacks, ...rest } = data;
  void _legacyRack; // Explicitly ignore legacy field
  void _inputRacks; // Explicitly ignore input racks (using racksWithIds instead)

  return {
    ...rest,
    // After migration, stamp with current app version
    version: migratePositions ? VERSION : data.version,
    racks: racksWithIds,
  };
});

/**
 * Complete layout schema with slug uniqueness and referential integrity validation
 */
export const LayoutSchema = LayoutSchemaBase.superRefine((data, ctx) => {
  // Validate at least one rack is present
  if (!data.racks || data.racks.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one rack is required",
      path: ["racks"],
    });
    return; // Can't continue validation without racks
  }

  // === Rack ID uniqueness validation (#472) ===
  const rackIdCounts = new Map<string, number>();
  for (const rack of data.racks) {
    rackIdCounts.set(rack.id, (rackIdCounts.get(rack.id) ?? 0) + 1);
  }
  const duplicateRackIds = [...rackIdCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  if (duplicateRackIds.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate rack IDs: ${duplicateRackIds.join(", ")}`,
      path: ["racks"],
    });
  }

  // Validate device type slug uniqueness
  const duplicates = validateSlugUniqueness(data.device_types);
  if (duplicates.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate device type slugs: ${duplicates.join(", ")}`,
      path: ["device_types"],
    });
  }

  // Build rack lookup for group validations
  const rackById = new Map(data.racks.map((r) => [r.id, r]));

  // Validate rack_groups reference existing racks
  if (data.rack_groups && data.rack_groups.length > 0) {
    const validRackIds = new Set(data.racks.map((r) => r.id));
    for (
      let groupIndex = 0;
      groupIndex < data.rack_groups.length;
      groupIndex++
    ) {
      const group = data.rack_groups[groupIndex]!;
      const invalidIds = group.rack_ids.filter((id) => !validRackIds.has(id));
      if (invalidIds.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Rack group "${group.name ?? group.id}" references non-existent rack IDs: ${invalidIds.join(", ")}`,
          path: ["rack_groups", groupIndex, "rack_ids"],
        });
        continue; // Skip height validation for groups with invalid refs
      }

      // === Bayed group height validation (#472) ===
      // Bayed groups require all racks to have the same height
      if (group.layout_preset === "bayed") {
        const rackHeights = group.rack_ids.map(
          (id) => rackById.get(id)?.height,
        );
        const firstHeight = rackHeights[0];
        const mixedHeights = rackHeights.some((h) => h !== firstHeight);

        if (mixedHeights) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Bayed rack group "${group.name ?? group.id}" requires all racks to have the same height`,
            path: ["rack_groups", groupIndex],
          });
        }
      }
    }
  }

  // === Container validation (v0.6.0) ===
  // Build lookup maps for efficient validation
  const deviceTypeBySlug = new Map(
    data.device_types.map((dt) => [dt.slug, dt]),
  );

  // Check each rack's devices for container relationships
  for (let rackIndex = 0; rackIndex < data.racks.length; rackIndex++) {
    const rack = data.racks[rackIndex]!;
    const deviceById = new Map(rack.devices.map((d) => [d.id, d]));

    for (
      let deviceIndex = 0;
      deviceIndex < rack.devices.length;
      deviceIndex++
    ) {
      const device = rack.devices[deviceIndex]!;

      // Skip devices without container_id (rack-level devices)
      if (!device.container_id) continue;

      // 1. Validate container_id references an existing device in this rack
      const container = deviceById.get(device.container_id);
      if (!container) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Device "${device.name ?? device.id}" references non-existent container "${device.container_id}"`,
          path: ["racks", rackIndex, "devices", deviceIndex, "container_id"],
        });
        continue; // Skip further container validation for this device
      }

      // 2. Validate the container's DeviceType has slots
      const containerType = deviceTypeBySlug.get(container.device_type);
      if (!containerType) {
        // DeviceType doesn't exist - this would be caught by other validation
        continue;
      }

      if (!containerType.slots || containerType.slots.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Device "${device.name ?? device.id}" is placed in container "${container.name ?? container.id}" but container's device type "${container.device_type}" has no slots`,
          path: ["racks", rackIndex, "devices", deviceIndex, "container_id"],
        });
        continue;
      }

      // 3. Validate slot_id exists in the container's DeviceType.slots
      const validSlotIds = new Set(containerType.slots.map((s) => s.id));
      if (!device.slot_id || !validSlotIds.has(device.slot_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Device "${device.name ?? device.id}" references invalid slot "${device.slot_id}" in container "${container.name ?? container.id}". Valid slots: ${[...validSlotIds].join(", ")}`,
          path: ["racks", rackIndex, "devices", deviceIndex, "slot_id"],
        });
      }

      // 4. Validate no nested containers (single-level nesting only)
      const childType = deviceTypeBySlug.get(device.device_type);
      if (childType && childType.slots && childType.slots.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Device "${device.name ?? device.id}" is a container (has slots) but is placed inside another container. Single-level nesting only.`,
          path: ["racks", rackIndex, "devices", deviceIndex, "device_type"],
        });
      }
    }
  }
});

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type Slug = z.infer<typeof SlugSchema>;
export type DeviceCategory = z.infer<typeof DeviceCategorySchema>;
export type FormFactor = z.infer<typeof FormFactorSchema>;
export type DeviceFace = z.infer<typeof DeviceFaceSchema>;
export type WeightUnit = z.infer<typeof WeightUnitSchema>;
export type DisplayMode = z.infer<typeof DisplayModeSchema>;
export type Airflow = z.infer<typeof AirflowSchema>;
export type SubdeviceRole = z.infer<typeof SubdeviceRoleSchema>;
export type SlotPosition = z.infer<typeof SlotPositionSchema>;
export type SlotWidth = z.infer<typeof SlotWidthSchema>;
export type RackWidth = z.infer<typeof RackWidthSchema>;
export type InterfaceType = z.infer<typeof InterfaceTypeSchema>;
export type PoEType = z.infer<typeof PoETypeSchema>;
export type PoEMode = z.infer<typeof PoEModeSchema>;
export type InterfacePosition = z.infer<typeof InterfacePositionSchema>;
export type InterfaceTemplate = z.infer<typeof InterfaceTemplateSchema>;
/** @deprecated Use InterfaceTemplate instead */
export type Interface = z.infer<typeof InterfaceSchema>;
export type PowerPort = z.infer<typeof PowerPortSchema>;
export type PowerOutlet = z.infer<typeof PowerOutletSchema>;
export type DeviceBay = z.infer<typeof DeviceBaySchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type DeviceLink = z.infer<typeof DeviceLinkSchema>;
export type PlacedPortZod = z.infer<typeof PlacedPortSchema>;
export type ConnectionZod = z.infer<typeof ConnectionSchema>;
export type DeviceTypeZod = z.infer<typeof DeviceTypeSchema>;
export type PlacedDeviceZod = z.infer<typeof PlacedDeviceSchema>;
export type RackZod = z.infer<typeof RackSchema>;
export type RackGroupLayoutPreset = z.infer<typeof RackGroupLayoutPresetSchema>;
export type RackGroupZod = z.infer<typeof RackGroupSchema>;
export type LayoutSettingsZod = z.infer<typeof LayoutSettingsSchema>;
export type LayoutZod = z.infer<typeof LayoutSchema>;
export type CableType = z.infer<typeof CableTypeSchema>;
export type CableStatus = z.infer<typeof CableStatusSchema>;
export type LengthUnit = z.infer<typeof LengthUnitSchema>;
export type CableZod = z.infer<typeof CableSchema>;
/** Validated slot position - row/col are non-negative integers (unlike plain SlotPosition2D interface which accepts any number) */
export type SlotPosition2DZod = z.infer<typeof SlotPosition2DSchema>;
export type SlotZod = z.infer<typeof SlotSchema>;
