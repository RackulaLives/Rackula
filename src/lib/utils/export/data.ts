import type {
  Connection,
  DeviceType,
  InterfaceTemplate,
  PlacedDevice,
  PlacedPort,
  PortDirection,
  Rack,
} from "$lib/types";
import { resolveConnectionPortDirection } from "$lib/utils/connection-path";
import { appDebug } from "$lib/utils/debug";
import { getDeviceDisplayName } from "$lib/utils/device";
import { getSignalLabel, inferSignalType } from "$lib/utils/port-utils";
import { formatPosition } from "$lib/utils/position";

/**
 * Leading characters that spreadsheet applications (Excel, Google Sheets,
 * LibreOffice) treat as the start of a formula. Tab, carriage return, and line
 * feed are included because they are stripped as ignorable leading whitespace,
 * which would otherwise let a value like `\n=2+2` reach the formula parser.
 * Device names and device-type model/manufacturer can come from user-entered or
 * imported (NetBox) data, so a value beginning with one of these is neutralized
 * to prevent CSV / formula injection when the file is opened in a spreadsheet.
 */
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r", "\n"]);

/**
 * Escape a CSV field value
 * - Prefixes a leading formula trigger (=, +, -, @, tab, carriage return, line
 *   feed) with a single quote so the cell is treated as text, not a formula
 * - Wraps in quotes if contains comma, quote, newline, or carriage return
 * - Doubles any existing quotes
 */
function escapeCSVField(value: string): string {
  const sanitized = FORMULA_TRIGGERS.has(value.charAt(0)) ? `'${value}` : value;
  if (
    sanitized.includes(",") ||
    sanitized.includes('"') ||
    sanitized.includes("\n") ||
    sanitized.includes("\r")
  ) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Export rack contents as CSV
 * Columns: Position, Name, Model, Manufacturer, U_Height, Category, Face
 * Sorted by position descending (top of rack first)
 *
 * @param rack - The rack to export
 * @param deviceTypes - Device type library for resolving device details
 */
export function exportToCSV(rack: Rack, deviceTypes: DeviceType[]): string {
  const header = "Position,Name,Model,Manufacturer,U_Height,Category,Face";

  // Create a map for quick device type lookup
  const deviceTypeMap = new Map(deviceTypes.map((dt) => [dt.slug, dt]));

  // Sort devices by position descending (top of rack first)
  const sortedDevices = [...rack.devices].sort(
    (a, b) => b.position - a.position,
  );

  // Build rows
  const rows: string[] = [];
  for (const device of sortedDevices) {
    const deviceType = deviceTypeMap.get(device.device_type);
    if (!deviceType) continue; // Skip unknown device types

    const position = formatPosition(device.position);
    const name = escapeCSVField(device.name || "");
    const model = escapeCSVField(deviceType.model || deviceType.slug);
    const manufacturer = escapeCSVField(deviceType.manufacturer || "");
    const uHeight = String(deviceType.u_height);
    const category = deviceType.category;
    const face = device.face;

    rows.push(
      `${position},${name},${model},${manufacturer},${uHeight},${category},${face}`,
    );
  }

  return [header, ...rows].join("\n");
}

/** A connection endpoint resolved to the rack, device, and port it lives on. */
interface PatchEndpoint {
  rackIndex: number;
  rack: Rack;
  device: PlacedDevice;
  /** Rack-level position used for top-to-bottom ordering. */
  position: number;
  port: PlacedPort;
  iface: InterfaceTemplate | undefined;
  direction: PortDirection | undefined;
}

/**
 * Export the layout's connections as a CSV patch list (#1940)
 * Columns: Source Rack, Source Device, Source Port, Direction, Destination
 * Rack, Destination Device, Destination Port, Signal, Label/Notes
 *
 * A row runs from the output end to the other end when exactly one end is an
 * output. Otherwise it keeps the stored a-then-b order. Direction is "→" for an
 * output-to-input row and "↔" for anything else. Rows sort by source rack
 * (layout order), source device top to bottom, then source port index.
 *
 * A connection whose port does not resolve to a placed port is skipped and
 * counted, matching the loader, which drops dangling connections (#3090).
 *
 * @param racks - Every rack in the layout
 * @param connections - Layout-level connections
 * @param deviceTypes - Device type library for resolving names and interfaces
 */
export function exportConnectionsToCSV(
  racks: Rack[],
  connections: Connection[],
  deviceTypes: DeviceType[],
): { csv: string; skipped: number } {
  const header =
    "Source Rack,Source Device,Source Port,Direction,Destination Rack,Destination Device,Destination Port,Signal,Label/Notes";

  const deviceTypeMap = new Map(deviceTypes.map((dt) => [dt.slug, dt]));
  const endpoints = new Map<string, PatchEndpoint>();
  racks.forEach((rack, rackIndex) => {
    const devicesById = new Map(rack.devices.map((d) => [d.id, d]));
    for (const device of rack.devices) {
      // A container child's position is relative to its container, so it
      // sorts at the container's rack position.
      const container = device.container_id
        ? devicesById.get(device.container_id)
        : undefined;
      const position = container ? container.position : device.position;
      const interfaces = deviceTypeMap.get(device.device_type)?.interfaces;
      for (const port of device.ports ?? []) {
        const iface = interfaces?.[port.template_index];
        endpoints.set(port.id, {
          rackIndex,
          rack,
          device,
          position,
          port,
          iface,
          direction: resolveConnectionPortDirection(port, iface),
        });
      }
    }
  });

  let skipped = 0;
  const resolved: {
    source: PatchEndpoint;
    destination: PatchEndpoint;
    arrow: string;
    label: string;
  }[] = [];
  for (const connection of connections) {
    const a = endpoints.get(connection.a_port_id);
    const b = endpoints.get(connection.b_port_id);
    if (!a || !b) {
      skipped++;
      appDebug.export(
        "patch list skipped connection %s: port reference not found",
        connection.id,
      );
      continue;
    }
    const bIsSource = b.direction === "output" && a.direction !== "output";
    const source = bIsSource ? b : a;
    const destination = bIsSource ? a : b;
    const arrow =
      source.direction === "output" && destination.direction === "input"
        ? "→"
        : "↔";
    resolved.push({
      source,
      destination,
      arrow,
      label: connection.label ?? "",
    });
  }

  resolved.sort(
    (x, y) =>
      x.source.rackIndex - y.source.rackIndex ||
      y.source.position - x.source.position ||
      x.source.port.template_index - y.source.port.template_index,
  );

  const rows = resolved.map(({ source, destination, arrow, label }) => {
    const signal =
      explicitSignal(source) ??
      explicitSignal(destination) ??
      inferredSignal(source) ??
      inferredSignal(destination);
    return [
      source.rack.name,
      getDeviceDisplayName(source.device, deviceTypes),
      source.port.label || source.port.template_name,
      arrow,
      destination.rack.name,
      getDeviceDisplayName(destination.device, deviceTypes),
      destination.port.label || destination.port.template_name,
      signal ? getSignalLabel(signal) : "",
      label,
    ]
      .map(escapeCSVField)
      .join(",");
  });

  return { csv: [header, ...rows].join("\n"), skipped };
}

function explicitSignal(endpoint: PatchEndpoint) {
  return endpoint.port.signal_type ?? endpoint.iface?.signal_type;
}

function inferredSignal(endpoint: PatchEndpoint) {
  return inferSignalType(
    endpoint.iface?.type ?? endpoint.port.type,
    endpoint.direction,
  );
}
