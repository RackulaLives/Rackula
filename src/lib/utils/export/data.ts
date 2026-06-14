import type { Rack, DeviceType } from "$lib/types";
import { formatPosition } from "$lib/utils/position";

/**
 * Leading characters that spreadsheet applications (Excel, Google Sheets,
 * LibreOffice) treat as the start of a formula. Device names and device-type
 * model/manufacturer can come from user-entered or imported (NetBox) data, so
 * a value beginning with one of these is neutralized to prevent CSV / formula
 * injection when the file is opened in a spreadsheet.
 */
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * Escape a CSV field value
 * - Prefixes a leading formula trigger (=, +, -, @, tab, carriage return) with
 *   a single quote so the cell is treated as text, not a formula
 * - Wraps in quotes if contains comma, quote, or newline
 * - Doubles any existing quotes
 */
function escapeCSVField(value: string): string {
  const sanitized = FORMULA_TRIGGERS.has(value.charAt(0)) ? `'${value}` : value;
  if (
    sanitized.includes(",") ||
    sanitized.includes('"') ||
    sanitized.includes("\n")
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
