/**
 * YAML Serialization Utilities
 * For folder-based project format
 * Schema v1.0.0: Flat structure with controlled field ordering
 *
 * Uses dynamic import for js-yaml to reduce initial bundle size.
 * The library is only loaded when save/load operations are performed.
 */

import type { Layout, LayoutMetadata } from "$lib/types";
import {
  LayoutSchema,
  LayoutSchemaBase,
  assertSchemaVersionSupported,
  type LayoutZod,
} from "$lib/schemas";
import { adaptLegacyLayout } from "$lib/storage";
import { layoutDebug } from "$lib/utils/debug";
import {
  decodeYamlImages,
  type SerializedImages,
} from "$lib/utils/image-encoding";
import { orderLayoutFields } from "$lib/utils/yaml-field-order";
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
 * Editor `$schema` hint for exported YAML. Points at the published evergreen
 * schema (the prod URL from the Published Schema section of
 * docs/reference/SCHEMA.md). The schema evolves additively in place;
 * loadability is gated offline by `metadata.schema_version`, not by this URL.
 */
const SCHEMA_HINT_COMMENT =
  "# yaml-language-server: $schema=https://count.racku.la/schemas/rackula-layout.schema.json";

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

  // Build the metadata header only when an id is present, with the same fallback
  // name/schema_version defaults this path has always used.
  const metadata: LayoutMetadata | undefined =
    layout.metadata?.id != null
      ? {
          id: layout.metadata.id,
          name: layout.metadata.name ?? layout.name,
          schema_version: layout.metadata.schema_version || "1.0",
          description: layout.metadata.description,
        }
      : undefined;

  const layoutForSerialization = orderLayoutFields(layout, {
    metadata,
    images: encodedImages,
  });

  // Prepend the editor schema hint so YAML language servers validate the export
  // out of the box (#2230). A leading `#` comment is ignored on read.
  const body = await serializeToYaml(layoutForSerialization);
  return `${SCHEMA_HINT_COMMENT}\n${body}`;
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

  const layoutForSerialization = orderLayoutFields(layout, { metadata });

  // Prepend the editor schema hint so the folder-ZIP `.rackula.yaml` validates
  // out of the box too (#2230).
  const body = await serializeToYaml(layoutForSerialization);
  return `${SCHEMA_HINT_COMMENT}\n${body}`;
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
 * Validate an already-parsed runtime layout object against `LayoutSchema` and
 * convert it to a runtime Layout, returning null instead of throwing on failure.
 *
 * This is the shared ingress chokepoint for read paths that hold a runtime
 * layout object rather than a serialized YAML string (e.g. the localStorage
 * working copy and the multi-layout browser workspace). It applies the same
 * schema validation and forward-compat gate as the file/server load path, so no
 * read door bypasses the schema. Any new read door must route through this
 * function (or `validateParsedLayout` for the YAML-string path) rather than
 * calling `LayoutSchema` directly.
 *
 * Forward-compat gate (#2205, #2664): a document whose data-format MAJOR
 * (`metadata.schema_version`) is newer than this app is refused here, so a
 * future-major body in localStorage is rejected on EVERY read path, not just the
 * YAML file door. Unlike `validateParsedLayout`, which throws, this function
 * keeps its null-on-failure contract: the gate's throw is caught and surfaced as
 * `null` so no caller (autosave, browser workspace) ever sees an uncaught throw.
 *
 * The runtime layout carries an id-only `metadata` ({ id }) for identity, which
 * is intentionally looser than the strict YAML file-header `LayoutMetadataSchema`
 * (id + name + schema_version). The id is preserved across validation.
 */
export function parseLayoutObject(parsed: unknown): Layout | null {
  // Forward-compat gate (#2664): refuse a future-major document before any parse,
  // matching validateParsedLayout. assertSchemaVersionSupported throws; this door
  // returns null on failure, so a future major surfaces as null, not a throw.
  try {
    assertSchemaVersionSupported(readSchemaVersion(parsed));
  } catch {
    return null;
  }

  let metadata: Layout["metadata"];
  let body = parsed;

  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const { metadata: rawMetadata, ...rest } = parsed as Record<
      string,
      unknown
    >;
    if (
      rawMetadata !== null &&
      typeof rawMetadata === "object" &&
      !Array.isArray(rawMetadata)
    ) {
      // Untrusted localStorage data: keep only correctly-typed string fields so
      // a non-string id cannot reach consumers that call metadata.id.trim().
      // Format (e.g. UUID shape) is not enforced here; loadLayout re-mints an id
      // when absent.
      const candidate = rawMetadata as Record<string, unknown>;
      const safeMeta: Partial<LayoutMetadata> = {};
      if (typeof candidate.id === "string") safeMeta.id = candidate.id;
      if (typeof candidate.name === "string") safeMeta.name = candidate.name;
      if (typeof candidate.schema_version === "string") {
        safeMeta.schema_version = candidate.schema_version;
      }
      if (typeof candidate.description === "string") {
        safeMeta.description = candidate.description;
      }
      if (Object.keys(safeMeta).length > 0) {
        metadata = safeMeta;
      }
    }
    // Drop the top-level images section (base64 user images, #617) before
    // validation, same as validateParsedLayout, so base64 never rides onto the
    // runtime Layout (passthrough) and gets re-emitted on later saves.
    if (Object.prototype.hasOwnProperty.call(rest, "images")) {
      delete rest.images;
    }
    body = rest;
  }

  const result = LayoutSchema.safeParse(body);
  if (!result.success) {
    return null;
  }

  const layout = toRuntimeLayout(result.data);
  return metadata ? { ...layout, metadata } : layout;
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
/**
 * Read metadata.schema_version off an untrusted parsed object, if it is a string.
 * Returns undefined when absent or malformed (the gate treats absent as current).
 */
function readSchemaVersion(parsed: unknown): string | undefined {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const metadata = (parsed as Record<string, unknown>).metadata;
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return undefined;
  }
  const version = (metadata as Record<string, unknown>).schema_version;
  return typeof version === "string" ? version : undefined;
}

function validateParsedLayout(parsed: unknown): {
  layout: Layout;
  rawImages: unknown;
} {
  // Forward-compat gate (#2205): reject a document whose data-format MAJOR is
  // newer than this app before any parse or write. Read-only and non-destructive.
  assertSchemaVersionSupported(readSchemaVersion(parsed));

  let rawImages: unknown;

  if (parsed !== null && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(obj, "images")) {
      rawImages = obj.images;
      delete obj.images;
    }
  }

  // Legacy + carrier-first (#2158, #2451): older files may use the v0.6 single
  // `rack` shape or carry rack-level sub-U / half-width placements that the
  // carrier-first enforcement in LayoutSchema rejects. LayoutSchemaBase parses
  // and migrates structurally first - it converts a single `rack` into `racks[]`
  // and snaps pre-0.7.0 U-value positions to whole-U internal units (the same
  // structural migration migrateLayout runs on the browser localStorage path, so
  // a v0.6 single-rack YAML import reaches the same migrated layout as a browser
  // load) - but it does NOT enforce carrier-first. adaptLegacyLayout then
  // normalizes any sub-U / half-width gear into carriers, and the full
  // LayoutSchema (with enforcement) validates the adapted result. The adapter is
  // idempotent, so loadLayout re-running it after this parse is a no-op.
  const baseResult = LayoutSchemaBase.safeParse(parsed);
  if (!baseResult.success) {
    const errors = baseResult.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Invalid layout: ${errors}`);
  }

  const adapted = adaptLegacyLayout(baseResult.data as unknown as Layout);

  const result = LayoutSchema.safeParse(adapted);

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
