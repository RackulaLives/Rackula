/**
 * NetBox Device Type Export
 * Converts a Rackula DeviceType to netbox-community/devicetype-library YAML.
 *
 * Warning contract: a warning means NetBox receives a different value than
 * Rackula holds (a fallback, a mapped type, a shortened or renamed bay, a
 * changed subdevice role, a dropped slot grid or height). Warnings are returned and written into the file as a
 * comment block. Fields NetBox device types have no field for (colour,
 * category, tags, slot_width, rack_widths, interface position, and so on)
 * are always dropped and never warned, since every type carries some of
 * them; the field-mapping guide lists them instead.
 * Field mapping: docs/reference/NETBOX-FIELD-MAPPING.md
 */

import type {
  DeviceType,
  InterfaceTemplate,
  KnownInterfaceType,
  PoEType,
} from "$lib/types";
import { serializeToYaml } from "./yaml";
import { isKnownInterfaceType } from "./port-utils";

/** Manufacturer written when the device type has none (NetBox requires one). */
export const FALLBACK_MANUFACTURER = "Generic";

/**
 * Rackula interface types that NetBox also defines. Every other type Rackula
 * knows (AV connectors, USB, serial, console) is a Rackula addition that
 * NetBox would reject, so it exports as "other". A type added to Rackula later
 * therefore exports as "other" until it is listed here.
 */
const NETBOX_INTERFACE_TYPES: ReadonlySet<KnownInterfaceType> = new Set([
  "100base-tx",
  "1000base-t",
  "2.5gbase-t",
  "5gbase-t",
  "10gbase-t",
  "1000base-x-sfp",
  "10gbase-x-sfpp",
  "25gbase-x-sfp28",
  "40gbase-x-qsfpp",
  "100gbase-x-qsfp28",
  "100gbase-x-qsfpdd",
  "200gbase-x-qsfp56",
  "200gbase-x-qsfpdd",
  "400gbase-x-qsfpdd",
  "virtual",
  "lag",
  "other",
]);

/** Rackula PoE types that NetBox also defines. */
const NETBOX_POE_TYPES: ReadonlySet<PoEType> = new Set([
  "type1-ieee802.3af",
  "type2-ieee802.3at",
  "type3-ieee802.3bt",
  "type4-ieee802.3bt",
  "passive-24v-2pair",
  "passive-48v-2pair",
]);

export interface NetBoxExportResult {
  /** devicetype-library YAML, warnings included as a leading comment block */
  yaml: string;
  /** Every lossy change made while exporting */
  warnings: string[];
}

/** Drop undefined values so the YAML only carries fields that are set. */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** Count occurrences per key, keeping first-seen order for stable warnings. */
function tally(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function exportInterfaces(
  interfaces: InterfaceTemplate[],
  warnings: string[],
): Record<string, unknown>[] {
  const rackulaOnly = new Map<string, number>();
  const unknown = new Map<string, number>();
  const droppedPoe = new Map<string, number>();

  const exported = interfaces.map((iface) => {
    let type: string = iface.type;
    if (!isKnownInterfaceType(iface.type)) {
      tally(unknown, iface.type);
    } else if (!NETBOX_INTERFACE_TYPES.has(iface.type)) {
      tally(rackulaOnly, iface.type);
      type = "other";
    }

    let poeType: PoEType | undefined = iface.poe_type;
    if (poeType && !NETBOX_POE_TYPES.has(poeType)) {
      tally(droppedPoe, poeType);
      poeType = undefined;
    }

    return compact({
      name: iface.name,
      label: iface.label,
      type,
      mgmt_only: iface.mgmt_only,
      poe_mode: iface.poe_mode,
      poe_type: poeType,
    });
  });

  for (const [type, count] of rackulaOnly) {
    warnings.push(
      `Interface type "${type}" is not a NetBox type: ${count} interface(s) exported as "other"`,
    );
  }
  for (const [type, count] of unknown) {
    warnings.push(
      `Interface type "${type}" is not known to this Rackula version: ${count} interface(s) exported unchanged, NetBox may reject it`,
    );
  }
  for (const [poeType, count] of droppedPoe) {
    warnings.push(
      `PoE type "${poeType}" is not a NetBox type: removed from ${count} interface(s)`,
    );
  }
  return exported;
}

/** NetBox's maximum device bay name length. */
const NETBOX_BAY_NAME_MAX = 64;

/**
 * Fit each name to maxLength, then make the names unique: a repeat gets a
 * numeric suffix (" 2", " 3", ...), trimming the name so the result still
 * fits maxLength. Shared with the importer, which applies it to slot names.
 */
export function uniqueNames(names: string[], maxLength: number): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const base = name.slice(0, maxLength);
    let unique = base;
    for (let n = 2; used.has(unique); n++) {
      const suffix = ` ${n}`;
      unique = `${base.slice(0, maxLength - suffix.length)}${suffix}`;
    }
    used.add(unique);
    return unique;
  });
}

/**
 * Device bays named within NetBox's length limit and unique within the type,
 * both of which NetBox requires. Each shortened or renamed bay warns.
 */
function netBoxBays(names: string[], warnings: string[]): { name: string }[] {
  return uniqueNames(names, NETBOX_BAY_NAME_MAX).map((name, i) => {
    const original = names[i]!;
    if (original.length > NETBOX_BAY_NAME_MAX) {
      warnings.push(
        `Bay name is longer than NetBox's ${NETBOX_BAY_NAME_MAX} characters: exported as "${name}"`,
      );
    } else if (name !== original) {
      warnings.push(`Bay name "${original}" repeats: exported as "${name}"`);
    }
    return { name };
  });
}

/** Keep a warning on one comment line so it cannot inject YAML keys. */
function toCommentLine(warning: string): string {
  return `# - ${warning.replace(/[\r\n\u2028\u2029]+/g, " ")}`;
}

/**
 * Convert a Rackula DeviceType to devicetype-library YAML.
 */
export async function exportToNetBoxYaml(
  deviceType: DeviceType,
): Promise<NetBoxExportResult> {
  const warnings: string[] = [];

  let manufacturer = deviceType.manufacturer;
  if (!manufacturer) {
    manufacturer = FALLBACK_MANUFACTURER;
    warnings.push(
      `Manufacturer is not set, exported as "${FALLBACK_MANUFACTURER}"`,
    );
  }

  let model = deviceType.model;
  if (!model) {
    model = deviceType.name || deviceType.slug;
    warnings.push(`Model is not set, exported as "${model}"`);
  }

  // A container's slots become device bays, named after the slot (or its id);
  // its slot grid does not survive. A type without slots keeps any device
  // bays it carries (a NetBox import).
  const slotCount = deviceType.slots?.length ?? 0;
  if (slotCount > 0) {
    warnings.push(
      `${slotCount} slot(s) exported as device bays: slot positions and sizes are not carried`,
    );
  }
  const bays = netBoxBays(
    slotCount > 0
      ? (deviceType.slots ?? []).map((slot) => slot.name || slot.id)
      : (deviceType.device_bays ?? []).map((bay) => bay.name),
    warnings,
  );

  // devicetype-library requires subdevice_role: parent whenever device bays exist.
  const subdeviceRole = bays.length > 0 ? "parent" : deviceType.subdevice_role;
  if (subdeviceRole !== deviceType.subdevice_role) {
    warnings.push(
      `Subdevice role ${deviceType.subdevice_role ? `"${deviceType.subdevice_role}"` : "unset"}, exported as "parent": NetBox requires it for a type with device bays`,
    );
  }

  // NetBox requires child device types to be 0U.
  let uHeight = deviceType.u_height;
  if (subdeviceRole === "child") {
    uHeight = 0;
    warnings.push(
      `Exported as a 0U child type (NetBox rule): the ${deviceType.u_height}U height is not carried`,
    );
  }

  let weightUnit = deviceType.weight_unit;
  if (deviceType.weight !== undefined && !weightUnit) {
    weightUnit = "kg";
    warnings.push('Weight has no unit, exported as "kg"');
  }

  const interfaces = exportInterfaces(deviceType.interfaces ?? [], warnings);
  const powerPorts = (deviceType.power_ports ?? []).map((port) =>
    compact({
      name: port.name,
      type: port.type,
      maximum_draw: port.maximum_draw,
      allocated_draw: port.allocated_draw,
    }),
  );
  const powerOutlets = (deviceType.power_outlets ?? []).map((outlet) =>
    compact({
      name: outlet.name,
      type: outlet.type,
      power_port: outlet.power_port,
      feed_leg: outlet.feed_leg,
    }),
  );
  const inventoryItems = (deviceType.inventory_items ?? []).map((item) =>
    compact({
      name: item.name,
      manufacturer: item.manufacturer,
      part_id: item.part_id,
    }),
  );

  // devicetype-library key order.
  const document = compact({
    manufacturer,
    model,
    slug: deviceType.slug,
    part_number: deviceType.part_number,
    u_height: uHeight,
    is_full_depth: deviceType.is_full_depth ?? true,
    airflow: deviceType.airflow,
    weight: deviceType.weight,
    weight_unit: deviceType.weight !== undefined ? weightUnit : undefined,
    is_powered: deviceType.is_powered,
    subdevice_role: subdeviceRole,
    comments: deviceType.notes ?? deviceType.comments,
    interfaces: interfaces.length > 0 ? interfaces : undefined,
    "power-ports": powerPorts.length > 0 ? powerPorts : undefined,
    "power-outlets": powerOutlets.length > 0 ? powerOutlets : undefined,
    "device-bays": bays.length > 0 ? bays : undefined,
    "inventory-items": inventoryItems.length > 0 ? inventoryItems : undefined,
  });

  const header =
    warnings.length > 0
      ? [
          "# Exported from Rackula. Changes made for NetBox:",
          ...warnings.map(toCommentLine),
        ].join("\n") + "\n"
      : "";

  return {
    yaml: `---\n${header}${await serializeToYaml(document)}`,
    warnings,
  };
}
