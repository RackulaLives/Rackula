/**
 * Layout Zod Validation Schemas
 * Schema v1.0.0 - Flat structure with NetBox-compatible fields
 */

import { z } from "../zod";

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
  })
  .passthrough();

/**
 * Placed device schema - instance in rack
 */
export const PlacedDeviceSchema = z
  .object({
    id: z.string().min(1, "ID is required"),
    device_type: SlugSchema,
    name: z.string().max(100, "Name must be 100 characters or less").optional(),
    position: z.number().int().min(1, "Position must be at least 1"),
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

    // --- Extension Fields ---
    notes: z.string().max(1000).optional(),
    custom_fields: z.record(z.string(), z.any()).optional(),
  })
  .passthrough();

/**
 * Rack schema (id is required for multi-rack support)
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
export const RackGroupLayoutPresetSchema = z.enum(["bayed", "row", "custom"]);

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
 * Complete layout schema (base, without refinements)
 * Uses racks array for multi-rack support
 */
const LayoutSchemaBase = z
  .object({
    version: z.string(),
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or less"),
    racks: z.array(RackSchema).min(1, "At least one rack is required"),
    rack_groups: z.array(RackGroupSchema).optional(),
    device_types: z.array(DeviceTypeSchema),
    settings: LayoutSettingsSchema,
    connections: z.array(ConnectionSchema).optional(),
    /** @deprecated Use connections instead */
    cables: z.array(CableSchema).optional(),
  })
  .passthrough();

/**
 * Complete layout schema with slug uniqueness and referential integrity validation
 */
export const LayoutSchema = LayoutSchemaBase.superRefine((data, ctx) => {
  // Validate device type slug uniqueness
  const duplicates = validateSlugUniqueness(data.device_types);
  if (duplicates.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate device type slugs: ${duplicates.join(", ")}`,
      path: ["device_types"],
    });
  }

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
