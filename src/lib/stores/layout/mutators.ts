/**
 * Raw Mutators for Layout Store
 *
 * Extracted from layout.svelte.ts — handles direct state mutation for
 * device types, placed devices, rack settings, and cables.
 * These bypass dirty tracking and validation — used by the command pattern
 * (undo/redo system).
 *
 * Operations on placed devices use the active rack via getTargetRack()
 * unless a rackId is explicitly provided.
 */

import type {
  Cable,
  DeviceFace,
  DeviceType,
  PlacedDevice,
  Rack,
  SlotPosition,
} from "$lib/types";
import { layoutDebug } from "$lib/utils/debug";
import { generateId } from "$lib/utils/device";
import { sanitizeFilename } from "$lib/utils/imageUpload";
import type { LayoutStateAccess } from "./types";
import { getTargetRack } from "./rack-actions";

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Generate a unique device ID that doesn't collide with the given set (#1363)
 */
export function generateUniqueDeviceId(seen: Set<string>): string {
  let id = generateId();
  while (seen.has(id)) id = generateId();
  seen.add(id);
  return id;
}

/**
 * Dev-mode invariant: warn if a rack contains duplicate device IDs (#1363)
 */
function assertUniqueDeviceIds(rack: Rack): void {
  if (!import.meta.env.DEV) return;
  const ids = rack.devices.map((d) => d.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    layoutDebug.state(`Duplicate device IDs in rack "${rack.name}":`, dupes);
  }
}

/**
 * Update a rack at a specific index using an updater function.
 * Performs an immutable update on layout.racks for Svelte reactivity.
 * @param ctx - Layout state access
 * @param index - Rack index
 * @param updater - Function to produce the updated rack
 */
export function updateRackAtIndex(
  ctx: LayoutStateAccess,
  index: number,
  updater: (rack: Rack) => Rack,
): void {
  const layout = ctx.getLayout();
  ctx.setLayout({
    ...layout,
    racks: layout.racks.map((r, i) => {
      if (i !== index) return r;
      const updated = updater(r);
      assertUniqueDeviceIds(updated);
      return updated;
    }),
  });
}

// =============================================================================
// Device Type Raw Mutators
// =============================================================================

/**
 * Add a device type directly (raw)
 * @param ctx - Layout state access
 * @param deviceType - Device type to add
 */
export function addDeviceTypeRaw(
  ctx: LayoutStateAccess,
  deviceType: DeviceType,
): void {
  const layout = ctx.getLayout();
  ctx.setLayout({
    ...layout,
    device_types: [...layout.device_types, deviceType],
  });
}

/**
 * Remove a device type directly (raw)
 * Also removes any placed devices of this type from ALL racks
 * @param ctx - Layout state access
 * @param slug - Device type slug to remove
 */
export function removeDeviceTypeRaw(
  ctx: LayoutStateAccess,
  slug: string,
): void {
  const layout = ctx.getLayout();
  ctx.setLayout({
    ...layout,
    device_types: layout.device_types.filter((dt) => dt.slug !== slug),
    racks: layout.racks.map((rack) => ({
      ...rack,
      devices: rack.devices.filter((d) => d.device_type !== slug),
    })),
  });
}

/**
 * Update a device type directly (raw)
 * @param ctx - Layout state access
 * @param slug - Device type slug to update
 * @param updates - Properties to update
 */
export function updateDeviceTypeRaw(
  ctx: LayoutStateAccess,
  slug: string,
  updates: Partial<DeviceType>,
): void {
  const layout = ctx.getLayout();
  ctx.setLayout({
    ...layout,
    device_types: layout.device_types.map((dt) =>
      dt.slug === slug ? { ...dt, ...updates } : dt,
    ),
  });
}

// =============================================================================
// Placed Device Raw Mutators
// =============================================================================

/**
 * Place a device directly (raw) - no validation
 * Targets the specified rack, or falls back to active rack
 * @param ctx - Layout state access
 * @param device - Device to place
 * @param rackId - Optional rack ID to target (uses active rack if not provided)
 * @returns Index where device was placed, or -1 if no rack available
 */
export function placeDeviceRaw(
  ctx: LayoutStateAccess,
  device: PlacedDevice,
  rackId?: string,
): number {
  const target = getTargetRack(ctx, rackId);
  if (!target) return -1;

  // Guard: regenerate ID if it already exists in this rack (#1363)
  const existingIds = new Set(target.rack.devices.map((d) => d.id));
  const safeDevice = existingIds.has(device.id)
    ? { ...device, id: generateUniqueDeviceId(existingIds) }
    : device;

  const newDevices = [...target.rack.devices, safeDevice];
  updateRackAtIndex(ctx, target.index, (rack) => ({
    ...rack,
    devices: newDevices,
  }));
  return newDevices.length - 1;
}

/**
 * Remove a device at index directly (raw)
 * Uses active rack
 * @param ctx - Layout state access
 * @param index - Device index to remove
 * @returns The removed device or undefined
 */
export function removeDeviceAtIndexRaw(
  ctx: LayoutStateAccess,
  index: number,
): PlacedDevice | undefined {
  const target = getTargetRack(ctx);
  if (!target) return undefined;
  if (index < 0 || index >= target.rack.devices.length) return undefined;

  const removed = target.rack.devices[index];

  updateRackAtIndex(ctx, target.index, (rack) => ({
    ...rack,
    devices: rack.devices.filter((_, i) => i !== index),
  }));
  return removed;
}

/**
 * Move a device directly (raw) - no collision checking
 * Uses active rack
 * @param ctx - Layout state access
 * @param index - Device index
 * @param newPosition - New position
 * @returns true if moved
 */
export function moveDeviceRaw(
  ctx: LayoutStateAccess,
  index: number,
  newPosition: number,
): boolean {
  const target = getTargetRack(ctx);
  if (!target) return false;
  if (index < 0 || index >= target.rack.devices.length) return false;

  updateRackAtIndex(ctx, target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) =>
      i === index ? { ...d, position: newPosition } : d,
    ),
  }));
  return true;
}

/**
 * Update a device's face directly (raw)
 * Uses active rack
 * @param ctx - Layout state access
 * @param index - Device index
 * @param face - New face value
 */
export function updateDeviceFaceRaw(
  ctx: LayoutStateAccess,
  index: number,
  face: DeviceFace,
): void {
  const target = getTargetRack(ctx);
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  updateRackAtIndex(ctx, target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) => (i === index ? { ...d, face } : d)),
  }));
}

/**
 * Update a device's custom display name directly (raw)
 * Uses active rack
 * @param ctx - Layout state access
 * @param index - Device index
 * @param name - New custom name (undefined to clear)
 */
export function updateDeviceNameRaw(
  ctx: LayoutStateAccess,
  index: number,
  name: string | undefined,
): void {
  const target = getTargetRack(ctx);
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  // Normalize empty string to undefined
  const normalizedName = name?.trim() || undefined;

  updateRackAtIndex(ctx, target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) =>
      i === index ? { ...d, name: normalizedName } : d,
    ),
  }));
}

/**
 * Update a device's placement image directly (raw)
 * @param ctx - Layout state access
 * @param rackId - Rack ID (for multi-rack support)
 * @param index - Device index
 * @param face - Which face to update ('front' or 'rear')
 * @param filename - Image filename (undefined to clear)
 */
export function updateDevicePlacementImageRaw(
  ctx: LayoutStateAccess,
  rackId: string,
  index: number,
  face: "front" | "rear",
  filename: string | undefined,
): void {
  const target = getTargetRack(ctx, rackId);
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  // Sanitize filename to prevent path traversal attacks
  const sanitizedFilename = filename ? sanitizeFilename(filename) : undefined;

  // Update the appropriate field based on face
  const fieldName = face === "front" ? "front_image" : "rear_image";

  updateRackAtIndex(ctx, target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) =>
      i === index ? { ...d, [fieldName]: sanitizedFilename } : d,
    ),
  }));
}

/**
 * Update a device's colour override directly (raw)
 * @param ctx - Layout state access
 * @param rackId - Rack ID (for multi-rack support)
 * @param index - Device index
 * @param colour - Hex colour string (undefined to clear and use device type colour)
 */
export function updateDeviceColourRaw(
  ctx: LayoutStateAccess,
  rackId: string,
  index: number,
  colour: string | undefined,
): void {
  const target = getTargetRack(ctx, rackId);
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  updateRackAtIndex(ctx, target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) =>
      i === index ? { ...d, colour_override: colour } : d,
    ),
  }));
}

/**
 * Update a device's slot position directly (raw)
 * @param ctx - Layout state access
 * @param rackId - Rack ID (for multi-rack support)
 * @param index - Device index
 * @param slotPosition - New slot position ('left', 'right', or 'full')
 */
export function updateDeviceSlotPositionRaw(
  ctx: LayoutStateAccess,
  rackId: string,
  index: number,
  slotPosition: SlotPosition,
): void {
  const target = getTargetRack(ctx, rackId);
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  updateRackAtIndex(ctx, target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) =>
      i === index ? { ...d, slot_position: slotPosition } : d,
    ),
  }));
}

/**
 * Update a device's notes directly (raw)
 * @param ctx - Layout state access
 * @param rackId - Rack ID (for multi-rack support)
 * @param index - Device index
 * @param notes - Notes string (undefined to clear)
 */
export function updateDeviceNotesRaw(
  ctx: LayoutStateAccess,
  rackId: string,
  index: number,
  notes: string | undefined,
): void {
  const target = getTargetRack(ctx, rackId);
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  // Normalize empty string to undefined
  const normalizedNotes = notes?.trim() || undefined;

  updateRackAtIndex(ctx, target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) =>
      i === index ? { ...d, notes: normalizedNotes } : d,
    ),
  }));
}

/**
 * Update a device's IP address/hostname directly (raw)
 * @param ctx - Layout state access
 * @param rackId - Rack ID (for multi-rack support)
 * @param index - Device index
 * @param ip - IP address/hostname string (undefined to clear)
 */
export function updateDeviceIpRaw(
  ctx: LayoutStateAccess,
  rackId: string,
  index: number,
  ip: string | undefined,
): void {
  const target = getTargetRack(ctx, rackId);
  if (!target) return;
  if (index < 0 || index >= target.rack.devices.length) return;

  // Normalize empty string to undefined
  const normalizedIp = ip?.trim() || undefined;

  updateRackAtIndex(ctx, target.index, (rack) => ({
    ...rack,
    devices: rack.devices.map((d, i) => {
      if (i !== index) return d;

      // Handle custom_fields object lifecycle - default to empty object for safe spreading
      const currentCustomFields = d.custom_fields ?? {};

      if (normalizedIp === undefined) {
        // Removing IP - clean up custom_fields if it becomes empty
        if (!Object.hasOwn(currentCustomFields, "ip")) {
          return d; // No change needed - IP doesn't exist
        }
        const { ip: _ip, ...restFields } = currentCustomFields;
        // If no other custom fields, set to undefined rather than empty object
        const newCustomFields =
          Object.keys(restFields).length > 0 ? restFields : undefined;
        return { ...d, custom_fields: newCustomFields };
      } else {
        // Setting IP - create or update custom_fields
        return {
          ...d,
          custom_fields: { ...currentCustomFields, ip: normalizedIp },
        };
      }
    }),
  }));
}

/**
 * Get a device at a specific index from the active rack
 * @param ctx - Layout state access
 * @param index - Device index
 * @returns The device or undefined
 */
export function getDeviceAtIndex(
  ctx: LayoutStateAccess,
  index: number,
): PlacedDevice | undefined {
  const target = getTargetRack(ctx);
  if (!target) return undefined;
  return target.rack.devices[index];
}

/**
 * Get all placed devices for a device type across all racks
 * @param ctx - Layout state access
 * @param slug - Device type slug
 * @returns Array of placed devices
 */
export function getPlacedDevicesForType(
  ctx: LayoutStateAccess,
  slug: string,
): PlacedDevice[] {
  // Collect from all racks for proper deletion handling
  return ctx
    .getLayout()
    .racks.flatMap((rack) =>
      rack.devices.filter((d) => d.device_type === slug),
    );
}

/**
 * Get all placed devices for a device type with their source rack IDs.
 * Used by DELETE_DEVICE_TYPE to restore devices to their original racks on undo.
 * @param ctx - Layout state access
 * @param slug - Device type slug
 * @returns Array of { rackId, device } pairs
 */
export function getPlacedDevicesWithRackForType(
  ctx: LayoutStateAccess,
  slug: string,
): { rackId: string; device: PlacedDevice }[] {
  return ctx.getLayout().racks.flatMap((rack) =>
    rack.devices
      .filter((d) => d.device_type === slug)
      .map((d) => ({ rackId: rack.id, device: d })),
  );
}

// =============================================================================
// Rack Settings Raw Mutators
// =============================================================================

/**
 * Update rack settings directly (raw)
 * Uses active rack
 * @param ctx - Layout state access
 * @param updates - Settings to update
 */
export function updateRackRaw(
  ctx: LayoutStateAccess,
  updates: Partial<Omit<Rack, "devices" | "view">>,
): void {
  const target = getTargetRack(ctx);
  if (!target) return;

  updateRackAtIndex(ctx, target.index, (rack) => ({ ...rack, ...updates }));
}

/**
 * Replace the entire rack directly (raw)
 * Uses active rack
 * @param ctx - Layout state access
 * @param newRack - New rack data
 */
export function replaceRackRaw(ctx: LayoutStateAccess, newRack: Rack): void {
  const target = getTargetRack(ctx);
  if (!target) return;

  updateRackAtIndex(ctx, target.index, () => newRack);
}

/**
 * Clear all devices from the active rack directly (raw)
 * @param ctx - Layout state access
 * @returns The removed devices
 */
export function clearRackDevicesRaw(ctx: LayoutStateAccess): PlacedDevice[] {
  const target = getTargetRack(ctx);
  if (!target) return [];

  const removed = [...target.rack.devices];
  updateRackAtIndex(ctx, target.index, (rack) => ({ ...rack, devices: [] }));
  return removed;
}

/**
 * Restore devices to the active rack directly (raw)
 * @param ctx - Layout state access
 * @param devices - Devices to restore
 */
export function restoreRackDevicesRaw(
  ctx: LayoutStateAccess,
  devices: PlacedDevice[],
): void {
  const target = getTargetRack(ctx);
  if (!target) return;

  // Guard: deduplicate IDs in restored device list (#1363)
  const seenIds = new Set<string>();
  const idRemap = new Map<string, string>();
  const safeDevices = devices
    .map((d) => {
      if (seenIds.has(d.id)) {
        const newId = generateUniqueDeviceId(seenIds);
        idRemap.set(d.id, newId);
        return { ...d, id: newId };
      }
      seenIds.add(d.id);
      return d;
    })
    .map((d) => {
      // Second pass: remap container_id references
      if (d.container_id && idRemap.has(d.container_id)) {
        return { ...d, container_id: idRemap.get(d.container_id)! };
      }
      return d;
    });

  updateRackAtIndex(ctx, target.index, (rack) => ({
    ...rack,
    devices: [...safeDevices],
  }));
}

// =============================================================================
// Cable Raw Mutators
// =============================================================================

/**
 * Add a cable directly (raw)
 * @param ctx - Layout state access
 * @param cable - Cable to add
 */
export function addCableRaw(ctx: LayoutStateAccess, cable: Cable): void {
  const layout = ctx.getLayout();
  ctx.setLayout({
    ...layout,
    cables: [...(layout.cables ?? []), cable],
  });
}

/**
 * Update a cable directly (raw)
 * @param ctx - Layout state access
 * @param id - Cable ID to update
 * @param updates - Properties to update
 */
export function updateCableRaw(
  ctx: LayoutStateAccess,
  id: string,
  updates: Partial<Omit<Cable, "id">>,
): void {
  const layout = ctx.getLayout();
  ctx.setLayout({
    ...layout,
    cables: (layout.cables ?? []).map((c) =>
      c.id === id ? { ...c, ...updates } : c,
    ),
  });
}

/**
 * Remove a cable directly (raw)
 * @param ctx - Layout state access
 * @param id - Cable ID to remove
 */
export function removeCableRaw(ctx: LayoutStateAccess, id: string): void {
  const layout = ctx.getLayout();
  ctx.setLayout({
    ...layout,
    cables: (layout.cables ?? []).filter((c) => c.id !== id),
  });
}

/**
 * Remove multiple cables directly (raw)
 * @param ctx - Layout state access
 * @param ids - Set of cable IDs to remove
 */
export function removeCablesRaw(
  ctx: LayoutStateAccess,
  ids: Set<string>,
): void {
  const layout = ctx.getLayout();
  ctx.setLayout({
    ...layout,
    cables: (layout.cables ?? []).filter((c) => !ids.has(c.id)),
  });
}
