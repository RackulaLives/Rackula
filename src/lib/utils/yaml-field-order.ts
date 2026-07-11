/**
 * YAML field-ordering helpers.
 *
 * Pure functions that arrange a Layout and its parts into the controlled field
 * order of schema v1.0.0 before serialization, and round-trip any unrecognised
 * top-level sections so additive data is never dropped on save (#2208). yaml.ts
 * uses the single orderLayoutFields entry point.
 */

import type {
  Layout,
  DeviceType,
  PlacedDevice,
  Rack,
  Cable,
  LayoutMetadata,
} from "$lib/types";
import type { SerializedImages } from "$lib/utils/image-encoding";

/**
 * Order DeviceType fields according to schema v1.0.0
 * Field order: slug, manufacturer, model, part_number, u_height, slot_width, is_full_depth, is_powered,
 *              weight, weight_unit, airflow, front_image, rear_image, colour, category, tags,
 *              notes, serial_number, asset_tag, links, custom_fields, interfaces, power_ports,
 *              power_outlets, device_bays, inventory_items, subdevice_role, slots, va_rating
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
  if (dt.slot_width !== undefined) ordered.slot_width = dt.slot_width;
  // Preserve rack_widths whenever defined, including an explicitly-empty array,
  // so an author's `rack_widths: []` survives save/load losslessly (#2927).
  if (dt.rack_widths !== undefined) ordered.rack_widths = dt.rack_widths;
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

  // --- Container Support ---
  if (dt.slots !== undefined && dt.slots.length > 0) ordered.slots = dt.slots;

  // --- Power Device Properties ---
  if (dt.va_rating !== undefined) ordered.va_rating = dt.va_rating;

  appendUnknownKeys(ordered, dt, KNOWN_DEVICE_TYPE_KEYS);

  return ordered;
}

/**
 * Order PlacedDevice fields according to schema v1.0.0
 * Field order: id, device_type, name, label, position, face, ports, front_image,
 *              rear_image, colour_override, parent_device, device_bay, container_id,
 *              slot_id, auto_created, notes, custom_fields
 */
function orderPlacedDeviceFields(
  device: PlacedDevice,
): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};

  // --- Core Fields ---
  ordered.id = device.id;
  ordered.device_type = device.device_type;
  if (device.name !== undefined) ordered.name = device.name;
  // Legacy placement label alias; written next to name so both survive a save.
  if (device.label !== undefined) ordered.label = device.label;
  ordered.position = device.position;
  ordered.face = device.face;

  // --- Port Instances ---
  if (device.ports !== undefined && device.ports.length > 0)
    ordered.ports = device.ports;

  // --- Placement Image Override ---
  if (device.front_image !== undefined)
    ordered.front_image = device.front_image;
  if (device.rear_image !== undefined) ordered.rear_image = device.rear_image;

  // --- Placement Colour Override ---
  if (device.colour_override !== undefined)
    ordered.colour_override = device.colour_override;

  // --- Subdevice Placement ---
  if (device.parent_device !== undefined)
    ordered.parent_device = device.parent_device;
  if (device.device_bay !== undefined) ordered.device_bay = device.device_bay;

  // --- Container Child Placement ---
  if (device.container_id !== undefined)
    ordered.container_id = device.container_id;
  if (device.slot_id !== undefined) ordered.slot_id = device.slot_id;

  // --- Auto-Created Placement ---
  // Only written when true; the schema defaults it to false on load.
  if (device.auto_created) ordered.auto_created = true;

  // --- Extension Fields ---
  if (device.notes !== undefined) ordered.notes = device.notes;
  if (device.custom_fields !== undefined)
    ordered.custom_fields = device.custom_fields;

  appendUnknownKeys(ordered, device, KNOWN_PLACED_DEVICE_KEYS);

  return ordered;
}

/**
 * Order Rack fields according to schema v1.0.0
 * Field order: id, name, height, width, depth_mm, base_weight, desc_units, show_rear, form_factor, starting_unit, position, devices, notes
 */
function orderRackFields(rack: Rack): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};

  if (rack.id !== undefined) ordered.id = rack.id;
  ordered.name = rack.name;
  ordered.height = rack.height;
  ordered.width = rack.width;
  if (rack.depth_mm !== undefined) ordered.depth_mm = rack.depth_mm;
  if (rack.base_weight !== undefined) ordered.base_weight = rack.base_weight;
  ordered.desc_units = rack.desc_units;
  // Persist the rear-view toggle; without it the schema default (true) wins on reload.
  ordered.show_rear = rack.show_rear;
  ordered.form_factor = rack.form_factor;
  ordered.starting_unit = rack.starting_unit;
  ordered.position = rack.position;
  ordered.devices = rack.devices.map(orderPlacedDeviceFields);
  if (rack.notes !== undefined) ordered.notes = rack.notes;

  appendUnknownKeys(ordered, rack, KNOWN_RACK_KEYS);

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

  appendUnknownKeys(ordered, cable, KNOWN_CABLE_KEYS);

  return ordered;
}

/**
 * Order metadata fields according to design spec
 * Field order: id, name, schema_version, description
 */
function orderMetadataFields(
  metadata: LayoutMetadata,
): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};

  ordered.id = metadata.id;
  ordered.name = metadata.name;
  ordered.schema_version = metadata.schema_version;
  if (metadata.description !== undefined && metadata.description !== "") {
    ordered.description = metadata.description;
  }

  return ordered;
}

/**
 * Top-level keys the serializer writes explicitly above. Any other top-level key
 * (an unknown additive section from a newer schema, or a recognised-but-not-yet-
 * serialised field such as `connections`) is round-tripped by appendUnknownSections
 * so it is never silently dropped on save (#2208). `connections` is deliberately
 * NOT listed: neither serializer writes it yet, so excluding it lets the fallback
 * preserve it until explicit serialization exists.
 */
const KNOWN_TOP_LEVEL_KEYS = new Set<string>([
  "metadata",
  "version",
  "name",
  "racks",
  "rack",
  "rack_groups",
  "device_types",
  "settings",
  "cables",
]);

/**
 * Reserved keys that must never be copied from untrusted parsed YAML onto a plain
 * object: assigning them would mutate the prototype (prototype-pollution vector).
 */
const UNSAFE_KEYS = new Set<string>(["__proto__", "constructor", "prototype"]);

/**
 * Copy any unrecognised top-level keys from the layout onto the serialized object,
 * after the known fields, so additive sections survive a load and resave.
 */
function appendUnknownSections(
  target: Record<string, unknown>,
  layout: Layout,
): void {
  for (const [key, value] of Object.entries(
    layout as unknown as Record<string, unknown>,
  )) {
    if (value === undefined) continue;
    if (UNSAFE_KEYS.has(key)) continue;
    if (KNOWN_TOP_LEVEL_KEYS.has(key)) continue;
    if (key in target) continue;
    target[key] = value;
  }
}

/**
 * Fields each nested orderer below explicitly handles, whether or not it ends
 * up writing them (e.g. an empty array skipped for tidiness, or `Rack.view`,
 * which is runtime-only and deliberately never persisted). Kept separate from
 * "did the orderer write this key" so appendUnknownKeys can tell an
 * intentional omission apart from a field the allowlist never learned about.
 */
const KNOWN_DEVICE_TYPE_KEYS = new Set<string>([
  "slug",
  "manufacturer",
  "model",
  "part_number",
  "u_height",
  "slot_width",
  "rack_widths",
  "is_full_depth",
  "is_powered",
  "weight",
  "weight_unit",
  "airflow",
  "front_image",
  "rear_image",
  "colour",
  "category",
  "tags",
  "notes",
  "serial_number",
  "asset_tag",
  "links",
  "custom_fields",
  "interfaces",
  "power_ports",
  "power_outlets",
  "device_bays",
  "inventory_items",
  "subdevice_role",
  "slots",
  "va_rating",
]);

const KNOWN_PLACED_DEVICE_KEYS = new Set<string>([
  "id",
  "device_type",
  "name",
  "label",
  "position",
  "face",
  "ports",
  "front_image",
  "rear_image",
  "colour_override",
  "parent_device",
  "device_bay",
  "container_id",
  "slot_id",
  "auto_created",
  "notes",
  "custom_fields",
]);

const KNOWN_RACK_KEYS = new Set<string>([
  "id",
  "name",
  "height",
  "width",
  "depth_mm",
  "base_weight",
  "desc_units",
  "show_rear",
  "form_factor",
  "starting_unit",
  "position",
  "devices",
  "notes",
  // Runtime-only current-face-filter state; never persisted to YAML.
  "view",
]);

const KNOWN_CABLE_KEYS = new Set<string>([
  "id",
  "a_device_id",
  "a_interface",
  "b_device_id",
  "b_interface",
  "type",
  "color",
  "label",
  "length",
  "length_unit",
  "status",
]);

/**
 * Copy any unrecognised keys from a nested source object (a DeviceType,
 * PlacedDevice, Rack, or Cable parsed by its `.passthrough()` Zod schema)
 * onto the ordered output, after the known fields, so unknown fields from a
 * newer schema or legacy declared fields not yet wired into the orderer (e.g.
 * `comments`, `outlet_count`) survive a load and resave (#2927).
 */
function appendUnknownKeys(
  target: Record<string, unknown>,
  source: object,
  knownKeys: ReadonlySet<string>,
): void {
  for (const [key, value] of Object.entries(
    source as Record<string, unknown>,
  )) {
    if (value === undefined) continue;
    if (UNSAFE_KEYS.has(key)) continue;
    if (knownKeys.has(key)) continue;
    target[key] = value;
  }
}

/**
 * Options for orderLayoutFields.
 */
interface OrderLayoutFieldsOptions {
  /** Layout metadata to write as the leading `metadata:` section, if present. */
  metadata?: LayoutMetadata;
  /**
   * Encoded user images to embed as a trailing `images:` section (#617). Set
   * explicitly so appendUnknownSections sees `images` already present and does
   * not double-emit it (#2208).
   */
  images?: SerializedImages;
}

/**
 * Arrange a Layout into the controlled schema v1.0.0 field order for
 * serialization, embedding an optional metadata header and trailing images
 * section, then round-tripping any unrecognised top-level sections (#2208).
 */
export function orderLayoutFields(
  layout: Layout,
  options: OrderLayoutFieldsOptions = {},
): Record<string, unknown> {
  const layoutForSerialization: Record<string, unknown> = {};

  // Include metadata at the top if present
  if (options.metadata !== undefined) {
    layoutForSerialization.metadata = orderMetadataFields(options.metadata);
  }

  // Standard layout fields
  layoutForSerialization.version = layout.version;
  layoutForSerialization.name = layout.name;
  layoutForSerialization.racks = layout.racks.map(orderRackFields);
  layoutForSerialization.device_types = layout.device_types.map(
    orderDeviceTypeFields,
  );
  layoutForSerialization.settings = layout.settings;

  // Only include rack_groups if present
  if (layout.rack_groups !== undefined && layout.rack_groups.length > 0) {
    layoutForSerialization.rack_groups = layout.rack_groups;
  }

  // Only include cables if present
  if (layout.cables !== undefined && layout.cables.length > 0) {
    layoutForSerialization.cables = layout.cables.map(orderCableFields);
  }

  // Embed user images explicitly so appendUnknownSections skips the `images`
  // key (key in target) instead of double-emitting it (#617 / #2208). Set last
  // so the base64 section trails the structural layout in the file. An
  // explicitly-provided empty `{}` (the user cleared every image) still counts
  // as handled, so a stale layout.images is not resurrected on resave (#2702).
  if (options.images !== undefined) {
    layoutForSerialization.images = options.images;
  }

  appendUnknownSections(layoutForSerialization, layout);

  return layoutForSerialization;
}
