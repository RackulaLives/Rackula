/**
 * NetBox Device Import Utilities
 * Parses NetBox devicetype-library YAML format and converts to Rackula DeviceType
 */

import type {
  DeviceType,
  DeviceCategory,
  Airflow,
  RackWidth,
} from "$lib/types";
import type { InterfaceTemplate } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";
import { parseYaml } from "./yaml";

/**
 * NetBox device type YAML structure
 * Based on https://github.com/netbox-community/devicetype-library
 */
export interface NetBoxDeviceType {
  manufacturer: string;
  model: string;
  slug: string;
  u_height?: number;
  is_full_depth?: boolean;
  part_number?: string;
  airflow?: string;
  front_image?: boolean;
  rear_image?: boolean;
  weight?: number;
  weight_unit?: string;
  subdevice_role?: string;
  interfaces?: NetBoxInterface[];
  console_ports?: NetBoxConsolePort[];
  console_server_ports?: NetBoxConsolePort[];
  power_ports?: NetBoxPowerPort[];
  power_outlets?: NetBoxPowerOutlet[];
  device_bays?: NetBoxDeviceBay[];
  module_bays?: NetBoxModuleBay[];
  inventory_items?: NetBoxInventoryItem[];
  comments?: string;
}

export interface NetBoxInterface {
  name: string;
  type: string;
  mgmt_only?: boolean;
  label?: string;
  poe_mode?: string;
  poe_type?: string;
}

export interface NetBoxConsolePort {
  name: string;
  type?: string;
  label?: string;
}

export interface NetBoxPowerPort {
  name: string;
  type?: string;
  maximum_draw?: number;
  allocated_draw?: number;
}

export interface NetBoxPowerOutlet {
  name: string;
  type?: string;
  power_port?: string;
  feed_leg?: string;
}

export interface NetBoxDeviceBay {
  name: string;
  label?: string;
}

export interface NetBoxModuleBay {
  name: string;
  label?: string;
  position?: string;
}

export interface NetBoxInventoryItem {
  name: string;
  label?: string;
  manufacturer?: string;
  part_id?: string;
}

/**
 * Result of parsing NetBox YAML
 */
export interface NetBoxParseResult {
  success: true;
  data: NetBoxDeviceType;
}

export interface NetBoxParseError {
  success: false;
  error: string;
}

export type NetBoxParseOutput = NetBoxParseResult | NetBoxParseError;

/**
 * Result of converting to Rackula DeviceType
 */
export interface ImportResult {
  deviceType: DeviceType;
  inferredCategory: DeviceCategory;
  warnings: string[];
}

/**
 * Parse NetBox YAML string to structured data
 */
export async function parseNetBoxYaml(
  yamlString: string,
): Promise<NetBoxParseOutput> {
  try {
    const data = await parseYaml<NetBoxDeviceType>(yamlString);

    // Validate required fields
    if (!data || typeof data !== "object") {
      return { success: false, error: "Invalid YAML: expected an object" };
    }

    if (!data.manufacturer) {
      return { success: false, error: "Missing required field: manufacturer" };
    }

    if (!data.model) {
      return { success: false, error: "Missing required field: model" };
    }

    if (!data.slug) {
      return { success: false, error: "Missing required field: slug" };
    }

    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `YAML parse error: ${message}` };
  }
}

/**
 * Infer device category from manufacturer, model, and other hints
 */
export function inferCategory(netbox: NetBoxDeviceType): DeviceCategory {
  const model = netbox.model.toLowerCase();
  const manufacturer = netbox.manufacturer.toLowerCase();
  const slug = netbox.slug.toLowerCase();
  const combined = `${manufacturer} ${model} ${slug}`;

  // Network devices
  if (
    combined.includes("switch") ||
    combined.includes("router") ||
    combined.includes("gateway") ||
    combined.includes("firewall") ||
    combined.includes("access point") ||
    combined.includes("wap") ||
    // Access point patterns - use word boundaries to avoid matching qnap, snap, etc.
    /\bap[-\s]/.test(combined) ||
    /-ap\b/.test(combined) ||
    combined.includes("usw") ||
    combined.includes("usg") ||
    combined.includes("udm") ||
    combined.includes("fortigate") ||
    combined.includes("catalyst") ||
    combined.includes("nexus") ||
    combined.includes("aruba") ||
    combined.includes("pfsense") ||
    combined.includes("opnsense") ||
    netbox.interfaces?.some((i) => i.type.includes("base"))
  ) {
    return "network";
  }

  // Storage devices
  if (
    combined.includes("nas") ||
    combined.includes("storage") ||
    combined.includes("diskstation") ||
    combined.includes("rackstation") ||
    model.startsWith("ds") ||
    model.startsWith("rs") ||
    model.startsWith("ts-") ||
    manufacturer.includes("qnap") ||
    manufacturer.includes("synology") ||
    combined.includes("truenas") ||
    combined.includes("freenas")
  ) {
    return "storage";
  }

  // Power devices - UPS
  if (
    combined.includes("ups") ||
    combined.includes("smart-ups") ||
    combined.includes("back-ups") ||
    combined.includes("uninterruptible")
  ) {
    return "power";
  }

  // Power devices - PDU
  if (combined.includes("pdu") || combined.includes("power distribution")) {
    return "power";
  }

  // Patch panels
  if (combined.includes("patch panel") || combined.includes("patch-panel")) {
    return "patch-panel";
  }

  // KVM/Console
  if (
    combined.includes("kvm") ||
    combined.includes("console") ||
    combined.includes("ip-kvm") ||
    manufacturer.includes("raritan") ||
    manufacturer.includes("aten") ||
    manufacturer.includes("avocent") ||
    combined.includes("dominion") ||
    netbox.console_server_ports?.length
  ) {
    return "kvm";
  }

  // Servers
  if (
    combined.includes("server") ||
    combined.includes("poweredge") ||
    combined.includes("proliant") ||
    combined.includes("thinkserver") ||
    combined.includes("primergy") ||
    combined.includes("thinksystem") ||
    combined.includes("nvr") ||
    combined.includes("supermicro") ||
    manufacturer.includes("dell") ||
    manufacturer.includes("hpe") ||
    manufacturer.includes("hp") ||
    manufacturer.includes("lenovo") ||
    manufacturer.includes("supermicro")
  ) {
    return "server";
  }

  // AV/Media
  if (
    combined.includes("amplifier") ||
    combined.includes("receiver") ||
    combined.includes("video") ||
    combined.includes("encoder") ||
    combined.includes("decoder") ||
    combined.includes("streaming") ||
    combined.includes("blackmagic") ||
    combined.includes("aja") ||
    combined.includes("teradek")
  ) {
    return "av-media";
  }

  // Cooling
  if (
    combined.includes("fan") ||
    combined.includes("cooling") ||
    combined.includes("air") ||
    netbox.airflow === "passive"
  ) {
    return "cooling";
  }

  // Shelves
  if (
    combined.includes("shelf") ||
    combined.includes("tray") ||
    combined.includes("cantilever")
  ) {
    return "shelf";
  }

  // Blank panels
  if (combined.includes("blank") || combined.includes("filler")) {
    return "blank";
  }

  // Cable management
  if (
    combined.includes("cable") ||
    combined.includes("brush") ||
    combined.includes("management")
  ) {
    return "cable-management";
  }

  // Default fallback
  return "other";
}

/**
 * Map NetBox airflow values to Rackula airflow type
 */
function mapAirflow(netboxAirflow?: string): Airflow | undefined {
  if (!netboxAirflow) return undefined;

  const airflowMap: Record<string, Airflow> = {
    passive: "passive",
    "front-to-rear": "front-to-rear",
    "rear-to-front": "rear-to-front",
    "left-to-right": "left-to-right",
    "right-to-left": "right-to-left",
    "side-to-rear": "side-to-rear",
    mixed: "mixed",
  };

  return airflowMap[netboxAirflow.toLowerCase()];
}

/**
 * Map NetBox interface to Rackula InterfaceTemplate
 */
function mapInterface(netbox: NetBoxInterface): InterfaceTemplate {
  return {
    name: netbox.name,
    type: netbox.type as InterfaceTemplate["type"],
    label: netbox.label,
    mgmt_only: netbox.mgmt_only,
    poe_mode: netbox.poe_mode as InterfaceTemplate["poe_mode"],
    poe_type: netbox.poe_type as InterfaceTemplate["poe_type"],
  };
}

/**
 * Convert NetBox device type to Rackula DeviceType
 */
export function convertToDeviceType(
  netbox: NetBoxDeviceType,
  options?: {
    category?: DeviceCategory;
    colour?: string;
    rack_widths?: RackWidth[];
  },
): ImportResult {
  const warnings: string[] = [];

  // Infer category if not provided
  const inferredCategory = inferCategory(netbox);
  const category = options?.category ?? inferredCategory;

  // Use provided colour or default for category
  const colour = options?.colour ?? CATEGORY_COLOURS[category];

  // Build the device type
  const deviceType: DeviceType = {
    slug: netbox.slug,
    manufacturer: netbox.manufacturer,
    model: netbox.model,
    u_height: netbox.u_height ?? 1,
    is_full_depth: netbox.is_full_depth ?? true,
    colour,
    category,
  };

  // Apply rack_widths if provided (NetBox doesn't have this field)
  if (options?.rack_widths && options.rack_widths.length > 0) {
    deviceType.rack_widths = options.rack_widths;
  }

  // Optional fields
  if (netbox.part_number) {
    deviceType.part_number = netbox.part_number;
  }

  if (netbox.airflow) {
    const mappedAirflow = mapAirflow(netbox.airflow);
    if (mappedAirflow) {
      deviceType.airflow = mappedAirflow;
    } else {
      warnings.push(`Unknown airflow value: ${netbox.airflow}`);
    }
  }

  if (netbox.front_image !== undefined) {
    deviceType.front_image = netbox.front_image;
  }

  if (netbox.rear_image !== undefined) {
    deviceType.rear_image = netbox.rear_image;
  }

  if (netbox.weight !== undefined) {
    deviceType.weight = netbox.weight;
    deviceType.weight_unit =
      (netbox.weight_unit as DeviceType["weight_unit"]) ?? "kg";
  }

  if (netbox.subdevice_role) {
    deviceType.subdevice_role =
      netbox.subdevice_role as DeviceType["subdevice_role"];
  }

  if (netbox.comments) {
    deviceType.notes = netbox.comments;
  }

  // Map interfaces
  if (netbox.interfaces && netbox.interfaces.length > 0) {
    deviceType.interfaces = netbox.interfaces.map(mapInterface);
  }

  // Map power ports
  if (netbox.power_ports && netbox.power_ports.length > 0) {
    deviceType.power_ports = netbox.power_ports.map((p) => ({
      name: p.name,
      type: p.type,
      maximum_draw: p.maximum_draw,
      allocated_draw: p.allocated_draw,
    }));
  }

  // Map power outlets
  if (netbox.power_outlets && netbox.power_outlets.length > 0) {
    deviceType.power_outlets = netbox.power_outlets.map((o) => ({
      name: o.name,
      type: o.type,
      power_port: o.power_port,
      feed_leg: o.feed_leg as DeviceType["power_outlets"][0]["feed_leg"],
    }));
  }

  // Map device bays
  if (netbox.device_bays && netbox.device_bays.length > 0) {
    deviceType.device_bays = netbox.device_bays.map((b) => ({
      name: b.name,
    }));
  }

  return {
    deviceType,
    inferredCategory,
    warnings,
  };
}

/**
 * Full import pipeline: parse YAML and convert to DeviceType
 */
export async function importFromNetBoxYaml(
  yamlString: string,
  options?: {
    category?: DeviceCategory;
    colour?: string;
  },
): Promise<
  { success: true; result: ImportResult } | { success: false; error: string }
> {
  const parseResult = await parseNetBoxYaml(yamlString);

  if (!parseResult.success) {
    return { success: false, error: parseResult.error };
  }

  const result = convertToDeviceType(parseResult.data, options);
  return { success: true, result };
}
