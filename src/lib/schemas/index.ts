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
  "firewall",
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
  .passthrough()
  .superRefine((data, ctx) => {
    // Half-depth devices have one physical face; interfaces cannot span both.
    // Unspecified position defaults to 'front', so implicit-front + explicit-rear is also invalid.
    if (
      data.is_full_depth === false &&
      data.interfaces &&
      data.interfaces.length > 0
    ) {
      const positions = data.interfaces.map(
        (iface: { position?: string }) => iface.position ?? "front",
      );
      const uniquePositions = new Set(positions);
      if (uniquePositions.size > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Half-depth device cannot have interfaces on both front and rear faces",
          path: ["interfaces"],
        });
      }
    }
  });

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
    // Position accepts decimals on input for legacy migration (pre-0.7.0 files use U-values like 1.5)
    // Migration in LayoutSchemaBase.transform converts to internal units using Math.round()
    // Container children use 0-indexed positions, rack-level must be >= 0.5 (validated by refine)
    position: z.number().min(0, "Position must be non-negative"),
    face: DeviceFaceSchema,

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

    // --- Auto-Created Placement ---
    /** True when synthesized automatically (e.g. a carrier for a sub-U device) */
    auto_created: z.boolean().default(false),

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
      // Rack-level devices (no container_id) must have position >= 0.5
      // (allows half-U positions at bottom of rack in legacy files)
      // After migration, positions become internal units (>= 3 for 0.5U)
      if (!data.container_id && data.position < 0.5) {
        return false;
      }
      return true;
    },
    {
      message: "Rack-level device position must be at least 0.5",
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
 * UUID pattern for layout metadata.id
 * Standard UUID format: 8-4-4-4-12 hex characters with hyphens
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Layout metadata schema for YAML file headers.
 * Part of the data directory refactor (#570).
 *
 * @see docs/plans/2026-01-22-data-directory-refactor-design.md
 */
export const LayoutMetadataSchema = z
  .object({
    /** UUID - stable identity across renames/moves */
    id: z
      .string()
      .min(1, "Metadata ID is required")
      .regex(UUID_PATTERN, "Metadata ID must be a valid UUID format"),
    /** Human-readable layout name */
    name: z
      .string()
      .min(1, "Metadata name is required")
      .max(100, "Metadata name must be 100 characters or less"),
    /** Format version for future migrations (e.g., "1.0") */
    schema_version: z.string().min(1, "Schema version is required"),
    /** Optional notes about the layout */
    description: z
      .string()
      .max(1000, "Description must be 1000 characters or less")
      .optional(),
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
    /** Optional metadata section for new YAML format (#570) */
    metadata: LayoutMetadataSchema.optional(),
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
 * Current data-format version the running app reads and writes (MAJOR.MINOR).
 *
 * This is the schema_version, distinct from the app `version` (provenance, bumps
 * every release). A reader gates loadability strictly on the MAJOR component of a
 * document's metadata.schema_version against this constant. See the versioning
 * policy in docs/reference/SCHEMA.md (#1113).
 */
export const SCHEMA_VERSION = "1.0";

/** MAJOR component of a MAJOR.MINOR version string (untrusted-input safe). */
function majorOf(version: string): number {
  const major = parseInt(version.trim().split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : 0;
}

/**
 * Reject a layout whose data-format MAJOR is newer than the running app (#2205).
 *
 * Gates strictly on the MAJOR of metadata.schema_version, never the app `version`
 * (which bumps every release and would over-reject). An absent schema_version is
 * treated as the current format (MAJOR matches), so legacy files predating
 * versioning load. Older MAJOR is not rejected here: it falls through to the
 * migration path. The check is read-only and non-destructive: it throws before
 * any parse or write so the original input is never modified.
 *
 * @param schemaVersion - The document's metadata.schema_version, if present.
 * @throws Error when the document MAJOR is newer than the app understands.
 */
export function assertSchemaVersionSupported(
  schemaVersion: string | undefined,
): void {
  // Absent schema_version reads as the current format (every file predating
  // versioning is the current MAJOR by construction).
  if (schemaVersion === undefined) {
    return;
  }
  if (majorOf(schemaVersion) > majorOf(SCHEMA_VERSION)) {
    throw new Error(
      `This layout was created by a newer version of Rackula (format ${schemaVersion}). ` +
        `Update Rackula to open it. Your file was not changed.`,
    );
  }
}

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
 * New: position = internal units (6, 12)
 *
 * Carrier-first (#2158): rails register equipment at whole-U boundaries only,
 * so a legacy fractional U position (e.g. 1.5) snaps to the nearest whole U
 * during migration. This keeps every legacy load path (file, YAML, share)
 * valid against the whole-U schema enforcement; the store-ingress adapter then
 * wraps any sub-U / half-width gear in a carrier.
 *
 * Container children (with container_id) are NOT migrated since they use
 * 0-indexed positions relative to the container.
 */
function migrateDevicePositions<
  T extends { position: number; container_id?: string },
>(devices: T[]): T[] {
  return devices.map((device) => {
    // Container children keep their 0-indexed positions
    if (device.container_id !== undefined) {
      return device;
    }
    // Rack-level devices: snap to the nearest whole U (min U1), in internal units.
    const wholeU = Math.max(1, Math.round(device.position));
    return {
      ...device,
      position: wholeU * UNITS_PER_U,
    } as T;
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
export const LayoutSchemaBase = LayoutSchemaInput.transform((data) => {
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

  // Generate IDs for racks missing them, deduplicate device IDs, and migrate positions if needed.
  const racksWithIds = racks.map((rack) => {
    // Deduplicate device IDs to prevent Svelte each_key_duplicate errors (#1363)
    const seenDeviceIds = new Set<string>();
    const idRemap = new Map<string, string>();
    const deduplicatedDevices = rack.devices.map((d) => {
      let nextId = d.id;
      if (seenDeviceIds.has(nextId)) {
        const oldId = nextId;
        do {
          nextId = nanoid();
        } while (seenDeviceIds.has(nextId));
        idRemap.set(oldId, nextId);
      }
      seenDeviceIds.add(nextId);
      const nextContainerId =
        d.container_id && idRemap.has(d.container_id)
          ? idRemap.get(d.container_id)!
          : d.container_id;
      return nextId === d.id && nextContainerId === d.container_id
        ? d
        : { ...d, id: nextId, container_id: nextContainerId };
    });

    return {
      ...rack,
      id: rack.id ?? nanoid(),
      devices: migratePositions
        ? migrateDevicePositions(deduplicatedDevices)
        : deduplicatedDevices,
    };
  });

  // Build the output without the legacy 'rack' field
  const { rack: _legacyRack, racks: _inputRacks, ...rest } = data;
  void _legacyRack; // Explicitly ignore legacy field
  void _inputRacks; // Explicitly ignore input racks (using racksWithIds instead)

  return {
    ...rest,
    // After migration, stamp with current app version
    version: migratePositions ? VERSION : data.version,
    racks: racksWithIds,
    device_types: data.device_types,
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

    // Track which (container_id, slot_id) cells are already claimed so two
    // children cannot share one cell.
    const claimedCells = new Set<string>();

    for (
      let deviceIndex = 0;
      deviceIndex < rack.devices.length;
      deviceIndex++
    ) {
      const device = rack.devices[deviceIndex]!;

      // === Carrier-first rail enforcement (rack-level devices, #2158/C4) ===
      // A device that registers directly to the rails must mount at a whole-U
      // boundary, and only full-width whole-U gear may do so. Sub-U,
      // non-integer-height, or half-width gear must sit inside a carrier. Blank
      // filler panels are exempt: a blank may rail-mount at any height.
      if (!device.container_id) {
        // Rail positions are stored in internal units (U * UNITS_PER_U).
        if (device.position % UNITS_PER_U !== 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Device "${device.name ?? device.id}" is at a fractional rail position. Rail-mounted devices must sit at a whole-U boundary.`,
            path: ["racks", rackIndex, "devices", deviceIndex, "position"],
          });
        }

        const railType = deviceTypeBySlug.get(device.device_type);
        if (railType && railType.category !== "blank") {
          const isHalfWidth = (railType.slot_width ?? 2) === 1;
          const isSubU = railType.u_height < 1;
          const isNonIntegerHeight = !Number.isInteger(railType.u_height);
          if (isHalfWidth || isSubU || isNonIntegerHeight) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Device "${device.name ?? device.id}" is sub-U or half-width and cannot mount directly to the rails. It must be a child of a carrier (set container_id and slot_id).`,
              path: [
                "racks",
                rackIndex,
                "devices",
                deviceIndex,
                "container_id",
              ],
            });
          }
        }
        continue;
      }

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
      const slotById = new Map(containerType.slots.map((s) => [s.id, s]));
      if (!device.slot_id || !slotById.has(device.slot_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Device "${device.name ?? device.id}" references invalid slot "${device.slot_id}" in container "${container.name ?? container.id}". Valid slots: ${[...slotById.keys()].join(", ")}`,
          path: ["racks", rackIndex, "devices", deviceIndex, "slot_id"],
        });
      } else {
        // 3a. One child per cell: a (container, slot) pair holds at most one child.
        const cellKey = `${device.container_id}::${device.slot_id}`;
        if (claimedCells.has(cellKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Slot "${device.slot_id}" in container "${container.name ?? container.id}" is already occupied. Each cell holds one child.`,
            path: ["racks", rackIndex, "devices", deviceIndex, "slot_id"],
          });
        } else {
          claimedCells.add(cellKey);
        }

        // 3b. Child must fit its cell (height_units / width_fraction).
        const slot = slotById.get(device.slot_id)!;
        const childForFit = deviceTypeBySlug.get(device.device_type);
        if (childForFit) {
          // Category fit: when a slot restricts accepted categories, the child's
          // category must be allowed. Mirrors canPlaceInSlot so schema and store
          // enforce identical slot rules (an empty/absent accepts allows all).
          if (
            slot.accepts &&
            slot.accepts.length > 0 &&
            !slot.accepts.includes(childForFit.category)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Device "${device.name ?? device.id}" (category "${childForFit.category}") is not accepted by slot "${device.slot_id}". Accepts: ${slot.accepts.join(", ")}.`,
              path: ["racks", rackIndex, "devices", deviceIndex, "slot_id"],
            });
          }

          const slotHeight = slot.height_units ?? 1;
          if (childForFit.u_height > slotHeight) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Device "${device.name ?? device.id}" is too tall to fit slot "${device.slot_id}" (${childForFit.u_height}U > ${slotHeight}U cell).`,
              path: ["racks", rackIndex, "devices", deviceIndex, "slot_id"],
            });
          }

          // Width fit mirrors canPlaceInSlot exactly, including its 0.01 float
          // tolerance, so the schema and the store agree on third-width slots
          // (0.33 / 0.34). Tightening the tolerance here would diverge from the
          // store's fit check.
          const requiredFraction =
            (childForFit.slot_width ?? 2) === 1 ? 0.5 : 1.0;
          const availableFraction = slot.width_fraction ?? 1.0;
          if (requiredFraction > availableFraction + 0.01) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Device "${device.name ?? device.id}" is too wide to fit slot "${device.slot_id}".`,
              path: ["racks", rackIndex, "devices", deviceIndex, "slot_id"],
            });
          }
        }
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
export type LayoutMetadataZod = z.infer<typeof LayoutMetadataSchema>;
export type LayoutZod = z.infer<typeof LayoutSchema>;
export type CableType = z.infer<typeof CableTypeSchema>;
export type CableStatus = z.infer<typeof CableStatusSchema>;
export type LengthUnit = z.infer<typeof LengthUnitSchema>;
export type CableZod = z.infer<typeof CableSchema>;
/** Validated slot position - row/col are non-negative integers (unlike plain SlotPosition2D interface which accepts any number) */
export type SlotPosition2DZod = z.infer<typeof SlotPosition2DSchema>;
export type SlotZod = z.infer<typeof SlotSchema>;
