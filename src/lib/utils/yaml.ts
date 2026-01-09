/**
 * YAML Serialization Utilities
 * For folder-based project format
 * Schema v1.0.0: Flat structure with controlled field ordering
 *
 * Uses dynamic import for js-yaml to reduce initial bundle size.
 * The library is only loaded when save/load operations are performed.
 */

import type { Layout, DeviceType, PlacedDevice, Rack, Cable } from "$lib/types";
import { LayoutSchema, type LayoutZod } from "$lib/schemas";

/**
 * Lazily load js-yaml library
 * Cached after first load for subsequent calls
 */
let yamlModule: typeof import("js-yaml") | null = null;

async function getYaml(): Promise<typeof import("js-yaml")> {
  if (!yamlModule) {
    yamlModule = await import("js-yaml");
  }
  return yamlModule;
}

/**
 * Serialize object to YAML string
 */
export async function serializeToYaml(data: unknown): Promise<string> {
  const yaml = await getYaml();
  return yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
  });
}

/**
 * Parse YAML string to object
 */
export async function parseYaml<T = unknown>(yamlString: string): Promise<T> {
  const yaml = await getYaml();
  return yaml.load(yamlString) as T;
}

/**
 * Order DeviceType fields according to schema v1.0.0
 * Field order: slug, manufacturer, model, part_number, u_height, is_full_depth, is_powered,
 *              weight, weight_unit, airflow, front_image, rear_image, colour, category, tags,
 *              notes, serial_number, asset_tag, links, custom_fields, interfaces, power_ports,
 *              power_outlets, device_bays, inventory_items, subdevice_role, va_rating
 */
function orderDeviceTypeFields(dt: DeviceType): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};

  // --- Core Identity ---
  ordered.slug = dt.slug;
  if (dt.manufacturer !== undefined) ordered.manufacturer = dt.manufacturer;
  if (dt.model !== undefined) ordered.model = dt.model;
  if (dt.part_number !== undefined) ordered.part_number = dt.part_number;

  // --- Physical Properties ---
  ordered.u_height = dt.u_height;
  if (dt.is_full_depth !== undefined) ordered.is_full_depth = dt.is_full_depth;
  if (dt.is_powered !== undefined) ordered.is_powered = dt.is_powered;
  if (dt.weight !== undefined) ordered.weight = dt.weight;
  if (dt.weight_unit !== undefined) ordered.weight_unit = dt.weight_unit;
  if (dt.airflow !== undefined) ordered.airflow = dt.airflow;

  // --- Image Flags ---
  if (dt.front_image !== undefined) ordered.front_image = dt.front_image;
  if (dt.rear_image !== undefined) ordered.rear_image = dt.rear_image;

  // --- Rackula Fields (flat) ---
  ordered.colour = dt.colour;
  ordered.category = dt.category;
  if (dt.tags !== undefined && dt.tags.length > 0) ordered.tags = dt.tags;

  // --- Extension Fields ---
  if (dt.notes !== undefined) ordered.notes = dt.notes;
  if (dt.serial_number !== undefined) ordered.serial_number = dt.serial_number;
  if (dt.asset_tag !== undefined) ordered.asset_tag = dt.asset_tag;
  if (dt.links !== undefined && dt.links.length > 0) ordered.links = dt.links;
  if (dt.custom_fields !== undefined) ordered.custom_fields = dt.custom_fields;

  // --- Component Arrays ---
  if (dt.interfaces !== undefined && dt.interfaces.length > 0)
    ordered.interfaces = dt.interfaces;
  if (dt.power_ports !== undefined && dt.power_ports.length > 0)
    ordered.power_ports = dt.power_ports;
  if (dt.power_outlets !== undefined && dt.power_outlets.length > 0)
    ordered.power_outlets = dt.power_outlets;
  if (dt.device_bays !== undefined && dt.device_bays.length > 0)
    ordered.device_bays = dt.device_bays;
  if (dt.inventory_items !== undefined && dt.inventory_items.length > 0)
    ordered.inventory_items = dt.inventory_items;

  // --- Subdevice Support ---
  if (dt.subdevice_role !== undefined)
    ordered.subdevice_role = dt.subdevice_role;

  // --- Power Device Properties ---
  if (dt.va_rating !== undefined) ordered.va_rating = dt.va_rating;

  return ordered;
}

/**
 * Order PlacedDevice fields according to schema v1.0.0
 * Field order: id, device_type, name, position, face, front_image, rear_image,
 *              parent_device, device_bay, notes, custom_fields
 */
function orderPlacedDeviceFields(
  device: PlacedDevice,
): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};

  // --- Core Fields ---
  ordered.id = device.id;
  ordered.device_type = device.device_type;
  if (device.name !== undefined) ordered.name = device.name;
  ordered.position = device.position;
  ordered.face = device.face;

  // --- Placement Image Override ---
  if (device.front_image !== undefined)
    ordered.front_image = device.front_image;
  if (device.rear_image !== undefined) ordered.rear_image = device.rear_image;

  // --- Subdevice Placement ---
  if (device.parent_device !== undefined)
    ordered.parent_device = device.parent_device;
  if (device.device_bay !== undefined) ordered.device_bay = device.device_bay;

  // --- Extension Fields ---
  if (device.notes !== undefined) ordered.notes = device.notes;
  if (device.custom_fields !== undefined)
    ordered.custom_fields = device.custom_fields;

  return ordered;
}

/**
 * Order Rack fields according to schema v1.0.0
 * Field order: id, name, height, width, desc_units, form_factor, starting_unit, position, devices, notes
 */
function orderRackFields(rack: Rack): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};

  if (rack.id !== undefined) ordered.id = rack.id;
  ordered.name = rack.name;
  ordered.height = rack.height;
  ordered.width = rack.width;
  ordered.desc_units = rack.desc_units;
  ordered.form_factor = rack.form_factor;
  ordered.starting_unit = rack.starting_unit;
  ordered.position = rack.position;
  ordered.devices = rack.devices.map(orderPlacedDeviceFields);
  if (rack.notes !== undefined) ordered.notes = rack.notes;

  return ordered;
}

/**
 * Order Cable fields according to schema v1.0.0
 * Field order: id, a_device_id, a_interface, b_device_id, b_interface, type, color, label, length, length_unit, status
 */
function orderCableFields(cable: Cable): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};

  // --- Core Fields ---
  ordered.id = cable.id;

  // --- A-side termination ---
  ordered.a_device_id = cable.a_device_id;
  ordered.a_interface = cable.a_interface;

  // --- B-side termination ---
  ordered.b_device_id = cable.b_device_id;
  ordered.b_interface = cable.b_interface;

  // --- Cable properties ---
  if (cable.type !== undefined) ordered.type = cable.type;
  if (cable.color !== undefined) ordered.color = cable.color;
  if (cable.label !== undefined) ordered.label = cable.label;
  if (cable.length !== undefined) ordered.length = cable.length;
  if (cable.length_unit !== undefined) ordered.length_unit = cable.length_unit;
  if (cable.status !== undefined) ordered.status = cable.status;

  return ordered;
}

/**
 * Serialize a layout to YAML string
 * Excludes runtime-only fields (view) and orders fields according to schema v1.0.0
 */
export async function serializeLayoutToYaml(layout: Layout): Promise<string> {
  const layoutForSerialization: Record<string, unknown> = {
    version: layout.version,
    name: layout.name,
    racks: layout.racks.map(orderRackFields),
    device_types: layout.device_types.map(orderDeviceTypeFields),
    settings: layout.settings,
  };

  // Only include rack_groups if present
  if (layout.rack_groups !== undefined && layout.rack_groups.length > 0) {
    layoutForSerialization.rack_groups = layout.rack_groups;
  }

  // Only include cables if present
  if (layout.cables !== undefined && layout.cables.length > 0) {
    layoutForSerialization.cables = layout.cables.map(orderCableFields);
  }

  return serializeToYaml(layoutForSerialization);
}

/**
 * Convert Zod-validated layout to runtime Layout type
 * Adds runtime defaults (e.g., rack.view) and preserves cables
 */
function toRuntimeLayout(parsed: LayoutZod): Layout {
  return {
    ...parsed,
    racks: parsed.racks.map((rack) => ({
      ...rack,
      view: "front",
    })),
    rack_groups: parsed.rack_groups,
    cables: parsed.cables,
  };
}

/**
 * Parse YAML string to layout
 * Validates against schema and adds runtime defaults
 */
export async function parseLayoutYaml(yamlString: string): Promise<Layout> {
  // Parse YAML (may throw on invalid syntax)
  const parsed = await parseYaml(yamlString);

  // Validate against schema - result.data is typed as LayoutZod
  const result = LayoutSchema.safeParse(parsed);

  if (!result.success) {
    // Format error message with details
    const errors = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return `${path}: ${issue.message}`;
      })
      .join(", ");

    throw new Error(`Invalid layout: ${errors}`);
  }

  // Convert to runtime Layout type with defaults
  return toRuntimeLayout(result.data);
}
