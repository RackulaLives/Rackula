/**
 * YAML Serialization Utilities
 * For folder-based project format
 * Schema v1.0.0: Flat structure with controlled field ordering
 *
 * Uses dynamic import for js-yaml to reduce initial bundle size.
 * The library is only loaded when save/load operations are performed.
 */

import type {
  Layout,
  DeviceType,
  PlacedDevice,
  Rack,
  Cable,
  LayoutMetadata,
} from "$lib/types";
import { LayoutSchema, type LayoutZod } from "$lib/schemas";
import { layoutDebug } from "$lib/utils/debug";
import {
  decodeYamlImages,
  type SerializedImages,
} from "$lib/utils/image-encoding";
import type { ImageStoreMap } from "$lib/types/images";

/**
 * Warn if any rack contains duplicate device IDs before serialization (#1363)
 */
function warnDuplicateDeviceIds(layout: Layout): void {
  for (const rack of layout.racks) {
    const ids = rack.devices.map((d) => d.id);
    if (new Set(ids).size !== ids.length) {
      layoutDebug.state(
        'Saving layout with duplicate device IDs in rack "%s". This may cause load errors.',
        rack.name,
      );
    }
  }
}

const STANDARD_RACK_WIDTH = 19;

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
  return yaml.load(yamlString, { schema: yaml.JSON_SCHEMA }) as T;
}

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

  return ordered;
}

/**
 * Order PlacedDevice fields according to schema v1.0.0
 * Field order: id, device_type, name, position, face, slot_position, front_image, rear_image,
 *              parent_device, device_bay, container_id, slot_id, auto_created, notes, custom_fields
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
  if (device.slot_position !== undefined)
    ordered.slot_position = device.slot_position;

  // --- Placement Image Override ---
  if (device.front_image !== undefined)
    ordered.front_image = device.front_image;
  if (device.rear_image !== undefined) ordered.rear_image = device.rear_image;

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
 * Serialize a layout to YAML string
 * Excludes runtime-only fields (view) and orders fields according to schema v1.0.0
 * Includes metadata if present.
 *
 * When `encodedImages` is provided and non-empty, embeds user-uploaded device
 * images as base64 data URLs in a trailing `images:` section (#617). Setting
 * `images` explicitly here means appendUnknownSections sees `key in target` and
 * does not double-emit it (#2208 interaction).
 */
export async function serializeLayoutToYaml(
  layout: Layout,
  encodedImages?: SerializedImages,
): Promise<string> {
  warnDuplicateDeviceIds(layout);

  const layoutForSerialization: Record<string, unknown> = {};

  // Include metadata at the top if present
  if (layout.metadata?.id != null) {
    const metadataForSerialization: LayoutMetadata = {
      id: layout.metadata.id,
      name: layout.metadata.name ?? layout.name,
      schema_version: layout.metadata.schema_version || "1.0",
      description: layout.metadata.description,
    };
    layoutForSerialization.metadata = orderMetadataFields(
      metadataForSerialization,
    );
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
  // so the base64 section trails the structural layout in the file.
  if (encodedImages && Object.keys(encodedImages).length > 0) {
    layoutForSerialization.images = encodedImages;
  }

  appendUnknownSections(layoutForSerialization, layout);

  return serializeToYaml(layoutForSerialization);
}

/**
 * Serialize a layout to YAML string with metadata section (#919)
 * Stays base64-free: the ZIP path carries images as asset files, never inline.
 * Used for folder-based ZIP exports with UUID-based naming.
 *
 * Output format:
 * ```yaml
 * metadata:
 *   id: 550e8400-e29b-41d4-a716-446655440000
 *   name: My Homelab
 *   schema_version: "1.0"
 *   description: "Basement setup for home automation"
 *
 * version: "0.7.0"
 * name: My Homelab
 * racks: [...]
 * ```
 *
 * @param layout - The layout to serialize
 * @param metadata - Metadata with UUID, name, and version
 */
export async function serializeLayoutToYamlWithMetadata(
  layout: Layout,
  metadata: LayoutMetadata,
): Promise<string> {
  warnDuplicateDeviceIds(layout);

  const layoutForSerialization: Record<string, unknown> = {
    // Metadata section at the top
    metadata: orderMetadataFields(metadata),
    // Standard layout fields
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

  appendUnknownSections(layoutForSerialization, layout);

  return serializeToYaml(layoutForSerialization);
}

/**
 * Convert Zod-validated layout to runtime Layout type
 * Adds runtime defaults (e.g., rack.view) and preserves cables
 */
function toRuntimeLayout(parsed: LayoutZod): Layout {
  return {
    ...parsed,
    // Very old layouts may omit version; treat them as pre-0.7.0
    // (matches needsPositionMigration, which treats missing version as legacy)
    version: parsed.version ?? "0.0.0",
    racks: parsed.racks.map((rack) => ({
      ...rack,
      // Older/legacy inputs can omit width in transformed type inference.
      width: rack.width ?? STANDARD_RACK_WIDTH,
      view: "front",
    })),
    rack_groups: parsed.rack_groups,
    cables: parsed.cables,
  };
}

/**
 * Validate a parsed YAML object against the layout schema and convert it to a
 * runtime Layout.
 *
 * The top-level `images` key (base64 user images, #617) is deleted from the
 * parsed object BEFORE schema validation so the base64 never rides onto the
 * runtime Layout and appendUnknownSections never re-emits it on resave. The
 * stripped value is returned to the caller so it can be decoded separately.
 */
function validateParsedLayout(parsed: unknown): {
  layout: Layout;
  rawImages: unknown;
} {
  let rawImages: unknown;

  if (parsed !== null && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Object.hasOwn(obj, "images")) {
      rawImages = obj.images;
      delete obj.images;
    }
  }

  const result = LayoutSchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return `${path}: ${issue.message}`;
      })
      .join(", ");

    throw new Error(`Invalid layout: ${errors}`);
  }

  return { layout: toRuntimeLayout(result.data), rawImages };
}

/**
 * Parse YAML string to layout
 * Validates against schema and adds runtime defaults.
 * Strips and discards any embedded `images` section (use
 * parseLayoutYamlWithImages to recover them).
 */
export async function parseLayoutYaml(yamlString: string): Promise<Layout> {
  const parsed = await parseYaml(yamlString);
  return validateParsedLayout(parsed).layout;
}

/**
 * Parse YAML string to layout AND decode any embedded user images (#617).
 *
 * The `images` section is stripped before schema validation, then decoded and
 * validated (magic-byte sniff, size cap) by decodeYamlImages. A bad image is
 * counted in `failedImagesCount` (for the load toast) and never rejects the
 * layout. `failedKeys` lists which store keys failed, logged for support.
 */
export async function parseLayoutYamlWithImages(yamlString: string): Promise<{
  layout: Layout;
  images: ImageStoreMap;
  failedImagesCount: number;
  failedKeys: string[];
}> {
  const parsed = await parseYaml(yamlString);
  const { layout, rawImages } = validateParsedLayout(parsed);
  const { images, failedImagesCount, failedKeys } = decodeYamlImages(rawImages);

  if (failedKeys.length > 0) {
    layoutDebug.state(
      "parseLayoutYamlWithImages: %d image(s) rejected for keys %o",
      failedImagesCount,
      failedKeys,
    );
  }

  return { layout, images, failedImagesCount, failedKeys };
}
