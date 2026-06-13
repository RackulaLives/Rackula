import type { Rack, DeviceType } from "$lib/types";
import { formatPosition } from "$lib/utils/position";

/**
 * Escape a CSV field value
 * - Wraps in quotes if contains comma, quote, or newline
 * - Doubles any existing quotes
 */
function escapeCSVField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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
