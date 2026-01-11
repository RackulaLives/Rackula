/**
 * Layout Store Helpers
 * Helper functions for working with types in the layout store
 */

import type {
  DeviceType,
  PlacedDevice,
  DeviceFace,
  Layout,
  DeviceCategory,
  Airflow,
  WeightUnit,
  InterfaceTemplate,
} from "$lib/types";
import { generateDeviceSlug } from "$lib/utils/slug";
import { generateId } from "$lib/utils/device";

/**
 * Input data for creating a new device type
 * Schema v1.0.0: Uses 'notes' field instead of 'comments'
 */
export interface CreateDeviceTypeInput {
  name: string;
  u_height: number;
  category: DeviceCategory;
  colour: string;
  manufacturer?: string;
  model?: string;
  is_full_depth?: boolean;
  weight?: number;
  weight_unit?: WeightUnit;
  airflow?: Airflow;
  notes?: string;
  tags?: string[];
  interfaces?: InterfaceTemplate[];
}

/**
 * Create a new DeviceType with auto-generated slug
 * Schema v1.0.0: Flat structure with colour, category at top level
 * @param data - Input data for the device type
 * @returns A complete DeviceType object
 */
export function createDeviceType(data: CreateDeviceTypeInput): DeviceType {
  // Generate slug from manufacturer/model or name
  const slug = generateDeviceSlug(data.manufacturer, data.model, data.name);

  const deviceType: DeviceType = {
    // --- Core Identity ---
    slug,
    // --- Physical Properties ---
    u_height: data.u_height,
    // --- Rackula Fields (flat structure in v1.0.0) ---
    colour: data.colour,
    category: data.category,
  };

  // Add optional fields if provided
  if (data.manufacturer) {
    deviceType.manufacturer = data.manufacturer;
  }
  // Use model if provided, otherwise fall back to name for display
  if (data.model) {
    deviceType.model = data.model;
  } else if (data.name) {
    deviceType.model = data.name;
  }
  // Handle is_full_depth: explicit value takes precedence, otherwise default based on category
  if (data.is_full_depth !== undefined) {
    deviceType.is_full_depth = data.is_full_depth;
  } else if (data.category === "shelf") {
    // Shelf devices span full rack depth by design
    deviceType.is_full_depth = true;
  }
  if (data.weight !== undefined) {
    deviceType.weight = data.weight;
  }
  if (data.weight_unit) {
    deviceType.weight_unit = data.weight_unit;
  }
  if (data.airflow) {
    deviceType.airflow = data.airflow;
  }
  if (data.notes) {
    deviceType.notes = data.notes;
  }
  if (data.tags && data.tags.length > 0) {
    deviceType.tags = data.tags;
  }
  if (data.interfaces && data.interfaces.length > 0) {
    deviceType.interfaces = data.interfaces;
  }

  return deviceType;
}

/**
 * Create a placed device referencing a device type by slug
 * Schema v1.0.0: PlacedDevice now requires a UUID id field
 * @param device_type - Slug of the device type
 * @param position - U position in rack
 * @param face - Which face(s) the device occupies
 * @param name - Optional display name override
 * @returns A PlacedDevice object with generated UUID
 */
export function createDevice(
  device_type: string,
  position: number,
  face: DeviceFace,
  name?: string,
): PlacedDevice {
  const device: PlacedDevice = {
    id: generateId(),
    device_type,
    position,
    face,
  };

  if (name !== undefined) {
    device.name = name;
  }

  return device;
}

/**
 * Find a device type by slug
 * @param device_types - Array of device types to search
 * @param slug - Slug to find
 * @returns The device type or undefined if not found
 */
export function findDeviceType(
  device_types: DeviceType[],
  slug: string,
): DeviceType | undefined {
  return device_types.find((dt) => dt.slug === slug);
}

/**
 * Get the display name for a placed device
 * Priority: device.name > deviceType.model > deviceType.slug
 * @param device - The placed device
 * @param device_types - Array of device types for lookup
 * @returns The display name string
 */
export function getDeviceDisplayName(
  device: PlacedDevice,
  device_types: DeviceType[],
): string {
  // Use device name if set
  if (device.name) {
    return device.name;
  }

  // Look up the device type
  const deviceType = findDeviceType(device_types, device.device_type);

  if (deviceType) {
    // Use model if available
    if (deviceType.model) {
      return deviceType.model;
    }
  }

  // Fall back to slug
  return device.device_type;
}

/**
 * Add a device type to the layout (immutable)
 * @param layout - The layout to modify
 * @param deviceType - The device type to add
 * @returns A new layout with the device type added
 * @throws Error if a device type with the same slug already exists
 */
export function addDeviceTypeToLayout(
  layout: Layout,
  deviceType: DeviceType,
): Layout {
  // Check for duplicate slug
  const existing = findDeviceType(layout.device_types, deviceType.slug);
  if (existing) {
    throw new Error(`Duplicate device type slug: ${deviceType.slug}`);
  }

  return {
    ...layout,
    device_types: [...layout.device_types, deviceType],
  };
}

/**
 * Remove a device type from the layout (immutable)
 * Also removes all placed devices referencing this device type
 * @param layout - The layout to modify
 * @param slug - The slug of the device type to remove
 * @returns A new layout with the device type and referencing devices removed
 */
export function removeDeviceTypeFromLayout(
  layout: Layout,
  slug: string,
): Layout {
  // Filter out the device type
  const newDeviceTypes = layout.device_types.filter((dt) => dt.slug !== slug);

  // Filter out placed devices referencing this type from all racks
  const newRacks = layout.racks.map((rack) => ({
    ...rack,
    devices: rack.devices.filter((d) => d.device_type !== slug),
  }));

  return {
    ...layout,
    device_types: newDeviceTypes,
    racks: newRacks,
  };
}

/**
 * Place a device in the rack (immutable)
 * @param layout - The layout to modify
 * @param device - The device to place
 * @param rackIndex - The index of the rack to place the device in (default: 0)
 * @returns A new layout with the device placed
 * @throws Error if the device type does not exist in device_types
 */
export function placeDeviceInRack(
  layout: Layout,
  device: PlacedDevice,
  rackIndex: number = 0,
): Layout {
  // Validate device type exists
  const deviceType = findDeviceType(layout.device_types, device.device_type);
  if (!deviceType) {
    throw new Error(`Device type not found: ${device.device_type}`);
  }

  const rack = layout.racks[rackIndex];
  if (!rack) {
    throw new Error(`Rack not found at index: ${rackIndex}`);
  }

  return {
    ...layout,
    racks: layout.racks.map((r, i) =>
      i === rackIndex ? { ...r, devices: [...r.devices, device] } : r,
    ),
  };
}

/**
 * Remove a device from the rack by index (immutable)
 * @param layout - The layout to modify
 * @param index - The index of the device to remove
 * @param rackIndex - The index of the rack to remove the device from (default: 0)
 * @returns A new layout with the device removed
 */
export function removeDeviceFromRack(
  layout: Layout,
  index: number,
  rackIndex: number = 0,
): Layout {
  const rack = layout.racks[rackIndex];
  if (!rack) {
    return layout;
  }

  // Handle out-of-bounds gracefully
  if (index < 0 || index >= rack.devices.length) {
    return layout;
  }

  const newDevices = [...rack.devices];
  newDevices.splice(index, 1);

  return {
    ...layout,
    racks: layout.racks.map((r, i) =>
      i === rackIndex ? { ...r, devices: newDevices } : r,
    ),
  };
}
