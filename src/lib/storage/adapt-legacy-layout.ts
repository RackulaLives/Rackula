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

import type { Layout, PlacedDevice, DeviceType, DeviceFace } from "$lib/types";
import { UNITS_PER_U } from "$lib/types/constants";
import { generateId } from "$lib/utils/device";
import { findStarterDevice } from "$lib/data/starterLibrary";
import { ensurePreCarrierBackup } from "./pre-carrier-backup";

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

/** Slot ids on carrier-1u-2col (full-height half-width columns). */
const COL_SLOTS = ["col-1", "col-2"] as const;
/** Slot ids on carrier-1u-2x2 (half-width half-height cells, bottom row first). */
const GRID_SLOTS = ["r0-c0", "r0-c1", "r1-c0", "r1-c1"] as const;

/** The carrier slugs this adapter knows how to hydrate from the starter library. */
const KNOWN_CARRIER_SLUGS = new Set<string>([
  CARRIER_2COL_SLUG,
  CARRIER_2X2_SLUG,
]);

/** A rack-level device has none of the child-placement markers set. */
function isRackLevel(d: PlacedDevice): boolean {
  return (
    d.container_id === undefined &&
    d.parent_device === undefined &&
    d.device_bay === undefined
  );
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
type CarrierShape = "2col" | "2x2";

/** Pick the carrier shape for a device: half-height gear needs the 2x2 grid. */
function carrierShapeFor(deviceType: DeviceType | undefined): CarrierShape {
  return isSubUHeight(deviceType) ? "2x2" : "2col";
}

const SHAPE_SLUG: Record<CarrierShape, string> = {
  "2col": CARRIER_2COL_SLUG,
  "2x2": CARRIER_2X2_SLUG,
};
const SHAPE_SLOTS: Record<CarrierShape, readonly string[]> = {
  "2col": COL_SLOTS,
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
  let changed = false;

  // Children pass through untouched; only rack-level devices are normalized.
  // A malformed (non-object) entry from untrusted data is passed through as-is
  // rather than dereferenced, so a bad device can never crash the adaptation.
  const passthrough: PlacedDevice[] = [];
  const rackDevices: PlacedDevice[] = [];
  for (const d of devices) {
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

  if (!racksChanged && !typesChanged) return layout;

  // Snapshot the pre-carrier browser state once, before the adapted layout can
  // be written back over the original by autosave.
  ensurePreCarrierBackup();

  return {
    ...layout,
    racks,
    device_types: deviceTypes,
  };
}
