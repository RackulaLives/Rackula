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
 * Network interface schema
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
    interfaces: z.array(InterfaceSchema).optional(),
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
 * Rack schema
 */
export const RackSchema = z
  .object({
    id: z.string().optional(),
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or less"),
    height: z
      .number()
      .int()
      .min(1, "Height must be at least 1U")
      .max(100, "Height cannot exceed 100U"),
    width: z.union([z.literal(10), z.literal(19), z.literal(23)]),
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
 */
const LayoutSchemaBase = z
  .object({
    version: z.string(),
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or less"),
    rack: RackSchema,
    device_types: z.array(DeviceTypeSchema),
    settings: LayoutSettingsSchema,
  })
  .passthrough();

/**
 * Complete layout schema with slug uniqueness validation
 */
export const LayoutSchema = LayoutSchemaBase.superRefine((data, ctx) => {
  const duplicates = validateSlugUniqueness(data.device_types);
  if (duplicates.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate device type slugs: ${duplicates.join(", ")}`,
      path: ["device_types"],
    });
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
export type Interface = z.infer<typeof InterfaceSchema>;
export type PowerPort = z.infer<typeof PowerPortSchema>;
export type PowerOutlet = z.infer<typeof PowerOutletSchema>;
export type DeviceBay = z.infer<typeof DeviceBaySchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type DeviceLink = z.infer<typeof DeviceLinkSchema>;
export type DeviceTypeZod = z.infer<typeof DeviceTypeSchema>;
export type PlacedDeviceZod = z.infer<typeof PlacedDeviceSchema>;
export type RackZod = z.infer<typeof RackSchema>;
export type LayoutSettingsZod = z.infer<typeof LayoutSettingsSchema>;
export type LayoutZod = z.infer<typeof LayoutSchema>;
