import type { Layout, DeviceType, PlacedDevice } from "$lib/types";
import { UNITS_PER_U, CATEGORY_COLOURS } from "$lib/types/constants";
import { generateId } from "$lib/utils/device";
import { CARRIER_1U_2COL } from "$lib/data/starterLibrary";
import { sessionDebug } from "$lib/utils/debug";

const log = sessionDebug.storage;

/**
 * Read-path adapter that normalises legacy placements to the carrier-first
 * model. Runs at the single store ingress on raw parsed input, before Zod
 * enforcement, so existing layouts never fail validation:
 *
 * - Fractional rail positions snap to the nearest whole U.
 * - A co-located legacy half-width pair (slot_position left/right at the same
 *   position and face) is wrapped in a synthesized 1x2 carrier (auto_created),
 *   with the two devices becoming its children.
 * - A lone legacy half-width device (slot_position left/right) is wrapped the
 *   same way, occupying one carrier column.
 *
 * The synthesized carrier DeviceType is added to device_types so the result is
 * self-contained for save and share.
 *
 * Idempotent: a layout already in carrier-first form (no slot_position, whole-U
 * rails) passes through unchanged.
 */
export function adaptLegacyLayout(raw: Record<string, unknown>): Layout {
  const layout = raw as unknown as Layout;
  if (!Array.isArray(layout.racks)) return layout;

  let usedCarrier = false;

  for (const rack of layout.racks) {
    if (!Array.isArray(rack.devices)) continue;
    const result = adaptRackDevices(rack.devices);
    rack.devices = result.devices;
    usedCarrier ||= result.usedCarrier;
  }

  if (usedCarrier) ensureCarrierType(layout);

  return layout;
}

interface AdaptResult {
  devices: PlacedDevice[];
  usedCarrier: boolean;
}

function adaptRackDevices(devices: PlacedDevice[]): AdaptResult {
  // Children stay as-is; they are addressed by container_id/slot_id already.
  const children = devices.filter((d) => d.container_id !== undefined);
  const rails = devices.filter((d) => d.container_id === undefined);

  const halfWidth = rails.filter(
    (d) => d.slot_position === "left" || d.slot_position === "right",
  );
  const plain = rails.filter(
    (d) => d.slot_position === undefined || d.slot_position === "full",
  );

  // Snap fractional rail positions on plain rail devices.
  for (const device of plain) {
    device.position = snapToWholeU(device.position);
    // A defaulted "full" slot_position is meaningless on a rail device.
    if (device.slot_position === "full") delete device.slot_position;
  }

  if (halfWidth.length === 0) {
    return { devices: [...plain, ...children], usedCarrier: false };
  }

  // Group half-width devices by snapped position + face so a left/right pair at
  // the same rail slot shares one carrier.
  const groups = new Map<string, PlacedDevice[]>();
  for (const device of halfWidth) {
    const snapped = snapToWholeU(device.position);
    const key = `${snapped}:${device.face}`;
    const group = groups.get(key) ?? [];
    group.push(device);
    groups.set(key, group);
  }

  const synthesized: PlacedDevice[] = [];
  for (const [key, group] of groups) {
    const [position, face] = key.split(":");
    const carrierId = generateId();
    const carrier: PlacedDevice = {
      id: carrierId,
      device_type: CARRIER_1U_2COL,
      position: Number(position),
      face: face as PlacedDevice["face"],
      auto_created: true,
    };
    synthesized.push(carrier);

    // "left" takes col-1, "right" takes col-2; anything else fills the next
    // free column so no child is dropped.
    let nextColumn = 0;
    for (const child of group) {
      const slotId =
        child.slot_position === "left"
          ? "col-1"
          : child.slot_position === "right"
            ? "col-2"
            : COLUMNS[nextColumn] ?? COLUMNS[0]!;
      child.container_id = carrierId;
      child.slot_id = slotId;
      child.position = 0;
      delete child.slot_position;
      nextColumn += 1;
    }
    synthesized.push(...group);
  }

  return {
    devices: [...plain, ...synthesized, ...children],
    usedCarrier: true,
  };
}

const COLUMNS = ["col-1", "col-2"] as const;

function snapToWholeU(position: number): number {
  if (!Number.isFinite(position)) return position;
  return Math.round(position / UNITS_PER_U) * UNITS_PER_U;
}

/**
 * The synthesized 1x2 carrier definition. Mirrors the stable starter-library
 * entry so an adapted layout is self-contained even when its device_types do
 * not already include the carrier.
 */
const CARRIER_1U_2COL_TYPE: DeviceType = {
  slug: CARRIER_1U_2COL,
  model: "Carrier (1U, 2 Column)",
  u_height: 1,
  category: "shelf",
  colour: CATEGORY_COLOURS.shelf,
  subdevice_role: "parent",
  slots: [
    {
      id: "col-1",
      name: "Column 1",
      position: { row: 0, col: 0 },
      width_fraction: 0.5,
      height_units: 1,
    },
    {
      id: "col-2",
      name: "Column 2",
      position: { row: 0, col: 1 },
      width_fraction: 0.5,
      height_units: 1,
    },
  ],
};

function ensureCarrierType(layout: Layout): void {
  if (!Array.isArray(layout.device_types)) {
    layout.device_types = [];
  }
  if (layout.device_types.some((t) => t.slug === CARRIER_1U_2COL)) return;
  layout.device_types.push({ ...CARRIER_1U_2COL_TYPE });
  log("adapter added synthesized carrier type %s", CARRIER_1U_2COL);
}
