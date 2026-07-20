/**
 * Carrier-first read-path adapter (#2290, epic #2158).
 *
 * Normalizes legacy layout data to the carrier-first model on load. Rails
 * register equipment at whole-U boundaries only; sub-U and half-width gear
 * mounts inside a container ("carrier") that registers to the rails. This
 * adapter runs at the single store ingress (loadLayout), so every load path
 * (file, API, archive, share decode, browser restore, YAML editor) passes
 * through it before the layout reaches reactive state.
 *
 * It also owns the legacy cables -> connections migration (#3091): the
 * deprecated Cable model (device id + interface name references) is no
 * longer part of the Layout type, but a prior-release file can still carry a
 * `cables` array. This adapter converts a resolvable cable into a Connection
 * (PlacedPort.id references) and drops an unresolvable one, so the legacy
 * key is still accepted on read even though it is never written again.
 *
 * It normalizes; it does NOT enforce. Schema/store enforcement lands in C4.
 *
 * Input is untrusted: share links and localStorage bodies reach loadLayout
 * without a full Zod pass, so every field is treated defensively. A malformed
 * device or rack is left as-is rather than throwing; a bad layout can never
 * block a load.
 *
 * The adapter is idempotent: loadLayout re-runs on every restore, so a layout
 * that is already carrier-first passes through unchanged (no double-wrapping,
 * no re-snap drift).
 */

import type {
  Layout,
  PlacedDevice,
  DeviceType,
  DeviceFace,
  Rack,
  Connection,
  PlacedPort,
} from "$lib/types";
import { UNITS_PER_U } from "$lib/types/constants";
import { generateId } from "$lib/utils/device";
import { findStarterDevice } from "$lib/data/starterLibrary";
import { ensurePreCarrierBackup } from "./pre-carrier-backup";
import { getStorageMode } from "./availability.svelte";
import { markPreCarrierMigrationPending } from "./pre-carrier-migration-pending";
import { layoutDebug } from "$lib/utils/debug";

/**
 * A placed device as it may appear in raw legacy input. The carrier-first model
 * dropped `slot_position` from the live PlacedDevice type (#2294), but a
 * pre-carrier file still carries a left/right slot marker. The adapter runs
 * before Zod, on untrusted raw input, so it reads the legacy field through this
 * permissive shape rather than the enforced runtime type. Output is always a
 * clean carrier-first PlacedDevice.
 */
type LegacyPlacedDevice = PlacedDevice & {
  slot_position?: "left" | "right" | "full";
};

/** Read the legacy left/right slot marker off a raw device, if present. */
function legacySlot(d: PlacedDevice): "left" | "right" | "full" | undefined {
  return (d as LegacyPlacedDevice).slot_position;
}

/** Stable synthesized-carrier slugs (defined in C1's starter library). */
export const CARRIER_2COL_SLUG = "carrier-1u-2col";
export const CARRIER_2X2_SLUG = "carrier-1u-2x2";
/** Height-matched 2U carrier for whole-U half-width gear taller than 1U (#2854). */
export const CARRIER_2U_2COL_SLUG = "carrier-2u-2col";

/** Slot ids on carrier-1u-2col (full-height half-width columns). */
const COL_SLOTS = ["col-1", "col-2"] as const;
/** Slot ids on carrier-1u-2x2 (half-width half-height cells, bottom row first). */
const GRID_SLOTS = ["r0-c0", "r0-c1", "r1-c0", "r1-c1"] as const;

/** The carrier slugs this adapter knows how to hydrate from the starter library. */
const KNOWN_CARRIER_SLUGS = new Set<string>([
  CARRIER_2COL_SLUG,
  CARRIER_2X2_SLUG,
  CARRIER_2U_2COL_SLUG,
]);

/**
 * A rack-level device has none of the child-placement markers set.
 *
 * A falsy container_id (undefined or "") is rack-level here, matching how
 * PlacedDeviceSchema, the carrier-first refine, and migrations.ts distinguish
 * rail devices from container children (#2759, same class as #2699). A prior-
 * release rack-level device can serialize container_id as "" (the schema's own
 * default), so a strict `=== undefined` check misclassified it as a container
 * child.
 *
 * parent_device and device_bay stay strict (`=== undefined`): they are
 * schema-only fields (see PlacedDevice in types/index.ts) that no serializer
 * in this codebase has ever written a value for, so there is no prior-release
 * data that could carry an empty-string value for either.
 */
function isRackLevel(d: PlacedDevice): boolean {
  return (
    !d.container_id &&
    d.parent_device === undefined &&
    d.device_bay === undefined
  );
}

/**
 * Drop children whose container_id references a device that no longer exists
 * in this rack (#2911). A carrier removed without cascading to its children
 * (a pre-fix release, or any other path that skips it) leaves a dangling
 * container_id that the full LayoutSchema rejects, making the whole layout
 * unreadable. Salvage the rest of the layout by dropping just the orphaned
 * children rather than failing the load outright; removing devices can never
 * introduce a carrier-first violation, so the result always validates.
 *
 * Dropping is repeated to a fixed point: a dropped device may itself be a
 * container, which orphans its own children, so re-scan until no reference
 * dangles. A falsy container_id (undefined or "") is rack-level and never
 * dropped, matching how the rest of the pipeline (PlacedDeviceSchema, the
 * carrier-first refine, migrations) distinguishes rail devices from children.
 */
function dropOrphanedChildren(devices: PlacedDevice[]): {
  devices: PlacedDevice[];
  changed: boolean;
} {
  let current = devices;
  let changed = false;
  for (;;) {
    const ids = new Set<string>();
    for (const d of current) {
      if (d && typeof d === "object" && typeof d.id === "string") {
        ids.add(d.id);
      }
    }
    const kept = current.filter((d) => {
      if (d === null || typeof d !== "object") return true;
      if (!d.container_id) return true;
      return ids.has(d.container_id);
    });
    if (kept.length === current.length) break;
    changed = true;
    current = kept;
  }
  return changed ? { devices: current, changed } : { devices, changed };
}

/** Snap an internal-unit rail position to the nearest whole U (min U1). */
function snapToWholeU(position: number): number {
  if (!Number.isFinite(position)) return UNITS_PER_U;
  const wholeU = Math.max(1, Math.round(position / UNITS_PER_U));
  return wholeU * UNITS_PER_U;
}

/** True when this device type mounts at half the rack width (slot_width 1). */
function isHalfWidth(deviceType: DeviceType | undefined): boolean {
  return (deviceType?.slot_width ?? 2) === 1;
}

/** True when this device type needs a height grid (sub-1U height). */
function isSubUHeight(deviceType: DeviceType | undefined): boolean {
  const h = deviceType?.u_height ?? 1;
  return h < 1 || !Number.isInteger(h);
}

/**
 * A rack-level device must move into a carrier when it is half-width or sub-U
 * height, or it carries a legacy left/right slot_position. Full-width whole-U
 * gear stays on the rails.
 */
function needsCarrier(
  device: PlacedDevice,
  deviceType: DeviceType | undefined,
): boolean {
  const slot = legacySlot(device);
  if (slot === "left" || slot === "right") {
    return true;
  }
  return isHalfWidth(deviceType) || isSubUHeight(deviceType);
}

interface CarrierBuild {
  carrier: PlacedDevice;
  children: PlacedDevice[];
}

/** Build a synthesized carrier of the given slug holding the given devices. */
function buildCarrier(
  slug: string,
  slotIds: readonly string[],
  wrapped: PlacedDevice[],
  position: number,
  face: DeviceFace,
): CarrierBuild {
  const carrierId = generateId();
  const carrier: PlacedDevice = {
    id: carrierId,
    device_type: slug,
    position,
    face,
    auto_created: true,
  };
  // Preserve legacy left/right intent: a device explicitly marked "left" takes
  // the first column, "right" the second. Devices without slot_position keep
  // their input order. A stable sort keeps unrelated ordering intact.
  const slotRank = (d: PlacedDevice): number => {
    const slot = legacySlot(d);
    return slot === "left" ? 0 : slot === "right" ? 2 : 1;
  };
  const ordered = [...wrapped].sort((a, b) => slotRank(a) - slotRank(b));
  const children = ordered.slice(0, slotIds.length).map((d, index) => {
    // Children are located by slot alone: clear rail/legacy placement fields
    // and attach to the carrier with an explicit slot (a data transform, not
    // an interactive drop, so the slot is assigned deterministically).
    const {
      slot_position: _legacySlot,
      container_id: _legacyContainer,
      slot_id: _legacySlotId,
      ...rest
    } = d as LegacyPlacedDevice;
    void _legacySlot;
    void _legacyContainer;
    void _legacySlotId;
    return {
      ...rest,
      container_id: carrierId,
      slot_id: slotIds[index]!,
      position: 0,
    } satisfies PlacedDevice;
  });
  return { carrier, children };
}

/** Carrier shape a sub-U / half-width device needs. */
type CarrierShape = "2col" | "2u-2col" | "2x2";

/** Pick the carrier shape for a device: sub-U gear needs the 2x2 grid, 2U gear needs 2u-2col, others use 2col. */
function carrierShapeFor(deviceType: DeviceType | undefined): CarrierShape {
  if (isSubUHeight(deviceType)) return "2x2";
  return deviceType?.u_height === 2 ? "2u-2col" : "2col";
}

const SHAPE_SLUG: Record<CarrierShape, string> = {
  "2col": CARRIER_2COL_SLUG,
  "2u-2col": CARRIER_2U_2COL_SLUG,
  "2x2": CARRIER_2X2_SLUG,
};
const SHAPE_SLOTS: Record<CarrierShape, readonly string[]> = {
  "2col": COL_SLOTS,
  "2u-2col": COL_SLOTS,
  "2x2": GRID_SLOTS,
};

/**
 * Adapt one rack's devices to carrier-first. Returns the new device list plus
 * the set of carrier slugs that were synthesized (so device_types can be
 * topped up) and whether anything changed.
 */
function adaptRackDevices(
  devices: PlacedDevice[],
  deviceTypeBySlug: Map<string, DeviceType>,
): { devices: PlacedDevice[]; carrierSlugs: Set<string>; changed: boolean } {
  const carrierSlugs = new Set<string>();

  // Drop children whose container no longer exists in this rack (#2911)
  // before any other processing, so a dangling reference can never survive
  // into the carrier-normalization or referential-integrity checks below.
  const { devices: sanitized, changed: orphansDropped } =
    dropOrphanedChildren(devices);
  let changed = orphansDropped;

  // Children pass through untouched; only rack-level devices are normalized.
  // A malformed (non-object) entry from untrusted data is passed through as-is
  // rather than dereferenced, so a bad device can never crash the adaptation.
  const passthrough: PlacedDevice[] = [];
  const rackDevices: PlacedDevice[] = [];
  for (const d of sanitized) {
    if (d === null || typeof d !== "object") {
      passthrough.push(d);
      continue;
    }
    if (isRackLevel(d)) rackDevices.push(d);
    else passthrough.push(d);
  }

  // Snap fractional rail positions first, so co-location grouping below sees
  // the snapped whole-U value.
  const snapped = rackDevices.map((d) => {
    const next = snapToWholeU(d.position);
    if (next !== d.position) changed = true;
    return next === d.position ? d : { ...d, position: next };
  });

  // Detect bare co-located pairs: exactly two rack-level devices at the same
  // (snapped position, face) with no slot_position. A valid carrier-first
  // layout cannot stack two full-width devices on one U, so this unambiguously
  // marks a half-width pair whose slot_position (and slot_width) was stripped
  // by the dd25f4c serializer (#1248, #1602). They become a 2-column carrier,
  // the same recovery the deleted recoverSlotPositions performed.
  //
  // Already-synthesized carriers are excluded: overflow chunking can put two
  // auto-created carriers at the same (position, face), and they must never be
  // re-wrapped, or a second adapter run would nest carriers (idempotency).
  const isExistingCarrier = (d: PlacedDevice): boolean =>
    d.auto_created === true || KNOWN_CARRIER_SLUGS.has(d.device_type);
  const coLocated = new Map<string, PlacedDevice[]>();
  for (const d of snapped) {
    const slot = legacySlot(d);
    if (slot === "left" || slot === "right") continue;
    if (isExistingCarrier(d)) continue;
    const key = `${d.position}|${d.face}`;
    const group = coLocated.get(key);
    if (group) group.push(d);
    else coLocated.set(key, [d]);
  }
  const forcedPairIds = new Set<string>();
  for (const group of coLocated.values()) {
    if (group.length === 2 && group.every((d) => legacySlot(d) === undefined)) {
      for (const d of group) forcedPairIds.add(d.id);
    }
  }

  // Group candidates that need a carrier by (position, face, carrier shape) so
  // a legacy half-width pair lands in one shared 2-column carrier, while a
  // co-located half-height device gets its own 2x2 grid carrier. Heterogeneous
  // co-located gear is never forced into a mismatched carrier.
  const result: PlacedDevice[] = [];
  const groups = new Map<
    string,
    { shape: CarrierShape; items: PlacedDevice[] }
  >();
  for (const d of snapped) {
    const dt = deviceTypeBySlug.get(d.device_type);
    const forced = forcedPairIds.has(d.id);
    if (!forced && !needsCarrier(d, dt)) {
      result.push(d);
      continue;
    }
    // A forced bare pair always wraps as a 2-column carrier; otherwise the
    // device's own dimensions choose the shape.
    const shape = forced ? "2col" : carrierShapeFor(dt);
    const key = `${d.position}|${d.face}|${shape}`;
    const group = groups.get(key);
    if (group) group.items.push(d);
    else groups.set(key, { shape, items: [d] });
  }

  for (const { shape, items } of groups.values()) {
    const first = items[0];
    if (!first) continue;
    const slug = SHAPE_SLUG[shape];
    const slotIds = SHAPE_SLOTS[shape];
    // Chunk across as many carriers as needed so no device is ever dropped: a
    // group larger than one carrier's slot count spills into another carrier
    // rather than being silently truncated.
    for (let i = 0; i < items.length; i += slotIds.length) {
      const chunk = items.slice(i, i + slotIds.length);
      const { carrier, children } = buildCarrier(
        slug,
        slotIds,
        chunk,
        first.position,
        first.face,
      );
      carrierSlugs.add(slug);
      result.push(carrier, ...children);
    }
    changed = true;
  }

  return {
    devices: [...result, ...passthrough],
    carrierSlugs,
    changed,
  };
}

/**
 * Ensure every carrier device type referenced in the layout carries its
 * canonical slot definition. A carrier type can arrive without slots (a share
 * link does not encode the slot grid; only the slug round-trips) or be absent
 * entirely (the adapter just synthesized it). Both cases are repaired from the
 * starter library so the carrier's children resolve to real slots and render.
 *
 * Returns the (possibly new) device_types array and whether it changed.
 */
function hydrateCarrierTypes(
  deviceTypes: DeviceType[],
  referencedSlugs: Set<string>,
): { deviceTypes: DeviceType[]; changed: boolean } {
  const bySlug = new Map<string, DeviceType>();
  for (const dt of deviceTypes) {
    if (dt && typeof dt.slug === "string") bySlug.set(dt.slug, dt);
  }

  let changed = false;
  for (const slug of referencedSlugs) {
    if (!KNOWN_CARRIER_SLUGS.has(slug)) continue;
    const existing = bySlug.get(slug);
    // Already hydrated (has its slot grid): nothing to do.
    if (existing && (existing.slots?.length ?? 0) > 0) continue;
    const canonical = findStarterDevice(slug);
    if (!canonical) continue;
    bySlug.set(slug, canonical);
    changed = true;
  }

  return changed
    ? { deviceTypes: [...bySlug.values()], changed }
    : { deviceTypes, changed };
}

/**
 * A legacy Cable entry as it may appear in raw pre-#3091 layout input. Cable
 * (device id + interface name references) was retired in favour of Connection
 * (stable PlacedPort.id references, #3091); the type no longer exists on
 * Layout. This permissive shape reads whatever survives on untrusted input:
 * a `.passthrough()` Zod parse of the YAML/JSON `cables` key, or a fully raw
 * object handed to loadLayout's direct ingress (share decode, browser
 * restore).
 */
interface LegacyCable {
  id?: unknown;
  a_device_id?: unknown;
  a_interface?: unknown;
  b_device_id?: unknown;
  b_interface?: unknown;
  label?: unknown;
  color?: unknown;
}

/** A Layout that may still carry the legacy `cables` top-level key. */
type LegacyLayout = Layout & { cables?: unknown };

/**
 * Resolve a Cable endpoint (device id + interface name) to the matching
 * PlacedPort on that device, mirroring the historical validateCable lookup
 * (cables.svelte.ts) but against the port instances instead of the device
 * type's interface templates.
 *
 * Matches by PlacedPort.template_name, the only reference Cable ever carried.
 * Duplicate interface names on one device are legal (port-geometry.ts); when
 * more than one port shares the name, the port with the lowest
 * template_index wins, matching interface declaration order. This is a best-
 * effort default, not the exact disambiguation Cable itself supported: Cable
 * had no template_index field, so an ambiguous legacy cable's exact target is
 * genuinely unrecoverable.
 *
 * Returns undefined (never throws) when the device id or interface name does
 * not resolve, so the caller can drop the cable cleanly.
 */
function resolveLegacyCableEndpoint(
  devicesById: Map<string, PlacedDevice>,
  deviceId: unknown,
  interfaceName: unknown,
): PlacedPort | undefined {
  if (typeof deviceId !== "string" || typeof interfaceName !== "string") {
    return undefined;
  }
  const device = devicesById.get(deviceId);
  if (!device || !Array.isArray(device.ports)) return undefined;

  let best: PlacedPort | undefined;
  for (const port of device.ports) {
    if (!port || port.template_name !== interfaceName) continue;
    if (typeof port.id !== "string") continue;
    if (!best || port.template_index < best.template_index) {
      best = port;
    }
  }
  return best;
}

/**
 * Convert legacy Cable entries to Connection objects (#3091). Cable
 * references a device id plus an interface name (fragile, pre-PlacedPort);
 * Connection references PlacedPort.id directly (stable). Each endpoint is
 * resolved against the given racks' devices via resolveLegacyCableEndpoint;
 * an endpoint that does not resolve (unknown device, no port with that
 * name) drops the whole cable with a debug log, never a thrown error,
 * mirroring dropDanglingConnections' salvage-not-fail contract below. A
 * cable whose two endpoints resolve to the same port (a degenerate
 * self-loop) is dropped the same way, matching ConnectionSchema's
 * self-connection refine.
 *
 * Runs against `racks` (the carrier-adapted racks already computed by the
 * caller): carrier adaptation only ever touches container_id/slot_id/
 * position, never a device's id or its `ports` array, so resolution here is
 * equivalent to resolving against the raw input racks.
 *
 * A migrated connection always gets a freshly minted id: the legacy cable id
 * is not a meaningful Connection identity and reusing it risks colliding
 * with an id minted elsewhere. label and color carry over when present;
 * Cable's other fields (type, length, length_unit, status) have no
 * Connection equivalent and are intentionally dropped.
 */
function migrateLegacyCables(cables: unknown, racks: Rack[]): Connection[] {
  if (!Array.isArray(cables) || cables.length === 0) return [];

  const devicesById = new Map<string, PlacedDevice>();
  for (const rack of racks) {
    if (!rack || !Array.isArray(rack.devices)) continue;
    for (const device of rack.devices) {
      if (device && typeof device.id === "string") {
        devicesById.set(device.id, device);
      }
    }
  }

  const connections: Connection[] = [];
  for (const raw of cables as LegacyCable[]) {
    if (!raw || typeof raw !== "object") continue;
    const cableId = typeof raw.id === "string" ? raw.id : "(unknown)";

    const aPort = resolveLegacyCableEndpoint(
      devicesById,
      raw.a_device_id,
      raw.a_interface,
    );
    const bPort = resolveLegacyCableEndpoint(
      devicesById,
      raw.b_device_id,
      raw.b_interface,
    );

    if (!aPort || !bPort) {
      layoutDebug.state(
        "dropped legacy cable %s: endpoint did not resolve to a placed port",
        cableId,
      );
      continue;
    }
    // Object identity, not `.id` equality: migration runs before the
    // layout-lifecycle.ts port-id dedup pass, so two distinct ports on two
    // different devices can still share a not-yet-deduped literal id. Only a
    // literal self-reference (same array entry resolved from both endpoints)
    // is a genuine self-loop.
    if (aPort === bPort) {
      layoutDebug.state(
        "dropped legacy cable %s: both endpoints resolved to the same port",
        cableId,
      );
      continue;
    }

    connections.push({
      id: generateId(),
      a_port_id: aPort.id,
      b_port_id: bPort.id,
      ...(typeof raw.label === "string" ? { label: raw.label } : {}),
      ...(typeof raw.color === "string" ? { color: raw.color } : {}),
    });
  }

  return connections;
}

/**
 * Drop connections whose a_port_id or b_port_id does not resolve to a
 * PlacedPort anywhere in the given racks (#3090). A device (or carrier)
 * removed without cascading to its connections, or a hand-edited file, can
 * leave a Connection pointing at a port that no longer exists. Salvage the
 * rest of the layout by dropping just the dangling connections instead of
 * failing the load or leaving the reference dangling; mirrors
 * dropOrphanedChildren's container-reference salvage above. A malformed
 * (non-object) connection, or one whose port id fields are not strings, is
 * dropped too, matching the defensive handling of untrusted input elsewhere
 * in this adapter.
 */
function dropDanglingConnections(
  connections: Connection[] | undefined,
  racks: Rack[],
): { connections: Connection[] | undefined; changed: boolean } {
  // Array.isArray, not just truthiness: untrusted/hand-edited input can carry
  // a truthy non-array `connections` (e.g. `connections: {}`), which would
  // otherwise fall through to `.filter` below and throw, violating this
  // adapter's never-throw-on-malformed-input contract (#3090 review).
  if (!Array.isArray(connections) || connections.length === 0) {
    return { connections, changed: false };
  }

  const knownPortIds = new Set<string>();
  for (const rack of racks) {
    if (!rack || !Array.isArray(rack.devices)) continue;
    for (const device of rack.devices) {
      if (!device || !Array.isArray(device.ports)) continue;
      for (const port of device.ports) {
        if (port && typeof port.id === "string") knownPortIds.add(port.id);
      }
    }
  }

  let changed = false;
  const kept = connections.filter((connection) => {
    const valid =
      connection &&
      typeof connection.a_port_id === "string" &&
      typeof connection.b_port_id === "string" &&
      knownPortIds.has(connection.a_port_id) &&
      knownPortIds.has(connection.b_port_id);
    if (!valid) {
      changed = true;
      layoutDebug.state(
        "dropped dangling connection %s: port reference not found",
        connection?.id ?? "(unknown)",
      );
    }
    return valid;
  });

  return changed ? { connections: kept, changed } : { connections, changed };
}

/**
 * Normalize a legacy layout to carrier-first. Safe to run repeatedly. Writes a
 * one-time pre-migration backup before returning a changed layout, so the
 * irreversible first carrier-first autosave can be undone.
 */
export function adaptLegacyLayout(layout: Layout): Layout {
  if (!layout) return layout;
  // loadLayout immediately maps over layoutData.racks, so a malformed layout
  // with no racks array must be normalized to an empty rack list here rather
  // than forwarded; the ingress degrades to an empty load instead of crashing.
  if (!Array.isArray(layout.racks)) {
    return { ...layout, racks: [] };
  }

  const deviceTypeBySlug = new Map<string, DeviceType>();
  for (const dt of layout.device_types ?? []) {
    if (dt && typeof dt.slug === "string") deviceTypeBySlug.set(dt.slug, dt);
  }

  // Every carrier slug referenced in the layout, so its type can be hydrated.
  // Seed with carriers already present as child containers / placed carriers
  // (e.g. a decoded share link whose carrier type lost its slot grid).
  const referencedCarrierSlugs = new Set<string>();
  for (const rack of layout.racks) {
    if (!rack || !Array.isArray(rack.devices)) continue;
    for (const d of rack.devices) {
      if (d && KNOWN_CARRIER_SLUGS.has(d.device_type)) {
        referencedCarrierSlugs.add(d.device_type);
      }
    }
  }

  let racksChanged = false;
  const racks = layout.racks.map((rack) => {
    if (!rack || !Array.isArray(rack.devices)) return rack;
    const { devices, carrierSlugs, changed } = adaptRackDevices(
      rack.devices,
      deviceTypeBySlug,
    );
    if (changed) racksChanged = true;
    for (const slug of carrierSlugs) referencedCarrierSlugs.add(slug);
    return changed ? { ...rack, devices } : rack;
  });

  const { deviceTypes, changed: typesChanged } = hydrateCarrierTypes(
    layout.device_types ?? [],
    referencedCarrierSlugs,
  );

  // Legacy cables -> connections migration (#3091): converts fragile
  // device-id + interface-name Cable references into stable PlacedPort.id
  // Connection references, resolved against the carrier-adapted racks (same
  // equivalence-to-raw-input reasoning as the dangling-connection salvage
  // below). Runs BEFORE that salvage so a migrated connection gets the same
  // referential-integrity check as a hand-authored one, and merges into
  // `layout.connections` before the salvage call rather than after.
  //
  // Ordering with layout-lifecycle.ts's port-id dedup pass: this function
  // (adaptLegacyLayout) runs before that pass, so a migrated connection's
  // a_port_id/b_port_id are resolved against the SAME pre-dedup port ids the
  // dedup pass will later scan. Connections never reference device ids (only
  // port ids), so the earlier device-id dedup pass in layout-lifecycle.ts
  // cannot affect them either way; only a literal duplicate port id can
  // trigger a remap, and the dedup pass rewrites every connection in
  // `layoutData.connections` (migrated ones included, since they are already
  // merged in by the time layout-lifecycle.ts reads this field) to follow it.
  const legacyCables = (layout as LegacyLayout).cables;
  const cablesFieldPresent = Object.prototype.hasOwnProperty.call(
    layout,
    "cables",
  );
  const migratedConnections = migrateLegacyCables(legacyCables, racks);
  // Array.isArray, not `?? []`: untrusted/hand-edited input can carry a
  // truthy non-array `connections` (e.g. `connections: {}`), which `?? []`
  // does not catch (it only substitutes for null/undefined). Spreading that
  // directly would throw, matching the same malformed-input class
  // dropDanglingConnections below already guards against (#3090/#3115).
  const existingConnections = Array.isArray(layout.connections)
    ? layout.connections
    : [];
  const connectionsWithMigrated =
    migratedConnections.length > 0
      ? [...existingConnections, ...migratedConnections]
      : layout.connections;

  // Dangling connection salvage (#3090): runs against the carrier-adapted
  // racks so it sees the final port set, and against the migrated connection
  // list above so a migrated connection is held to the same integrity check.
  // Carrier adaptation never touches PlacedPort.id, so this is equivalent to
  // checking the raw input. Kept independent of racksChanged/typesChanged
  // below: a connection-only change must never trigger the pre-carrier-first
  // backup, which exists solely to protect the irreversible carrier rewrite.
  const { connections, changed: connectionsChanged } = dropDanglingConnections(
    connectionsWithMigrated,
    racks,
  );

  const carrierMigrationChanged = racksChanged || typesChanged;
  const connectionsFieldChanged =
    connectionsChanged || migratedConnections.length > 0;
  if (
    !carrierMigrationChanged &&
    !connectionsFieldChanged &&
    !cablesFieldPresent
  ) {
    return layout;
  }

  // Preserve the pre-carrier state once before the adapted layout can be written
  // back over the original. The two storage modes are mutually exclusive:
  // browser mode snapshots the whole localStorage state locally; server mode
  // instead marks this layout's uuid pending, so its next save-to-server signals
  // the server to durably back up the prior YAML (#2517).
  if (carrierMigrationChanged) {
    if (getStorageMode() === "server") {
      if (layout.metadata?.id) {
        markPreCarrierMigrationPending(layout.metadata.id);
      }
    } else {
      ensurePreCarrierBackup();
    }
  }

  // Cable is fully retired (#3091): the legacy `cables` field, when present,
  // was consumed above and is never re-attached to the output, so it can
  // never round-trip back out as an "unknown top-level section"
  // (yaml-field-order.ts appendUnknownSections).
  const { cables: _legacyCables, ...layoutWithoutCables } =
    layout as LegacyLayout;
  void _legacyCables;

  return {
    ...layoutWithoutCables,
    racks,
    device_types: deviceTypes,
    ...(connectionsFieldChanged ? { connections } : {}),
  };
}
