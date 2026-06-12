/**
 * Layout Lifecycle Domain Module
 *
 * Extracted from layout.svelte.ts - creating a fresh layout and loading
 * an existing one (with defensive ID/position assignment for older layouts).
 */

import type { Layout } from "$lib/types";
import { createLayout } from "$lib/utils/serialization";
import { generateId } from "$lib/utils/device";
import { generateRackId } from "$lib/utils/rack";
import type { LayoutStateAccess } from "./types";
import { generateUniqueDeviceId } from "./mutators";

/**
 * Create a new layout with the given name
 * @param name - Layout name
 */
export function createNewLayout(ctx: LayoutStateAccess, name: string): void {
  ctx.setLayout(createLayout(name));
  ctx.resetBackupTracking();
}

/**
 * Load a layout directly
 * Preserves all racks in the layout (multi-rack support)
 * Defensively assigns IDs and positions to support older layouts
 * @param layoutData - Layout to load
 */
export function loadLayout(ctx: LayoutStateAccess, layoutData: Layout): void {
  // Ensures metadata with UUID exists for persistence
  const metadata = layoutData.metadata
    ? { ...layoutData.metadata }
    : { id: generateId() };
  if (!metadata.id) {
    metadata.id = generateId();
  }

  // First pass: regenerate missing/duplicate rack and device IDs, recording the
  // old -> new id mappings. References are NOT rewritten yet (#2155). Rack ids
  // are deduplicated across the whole layout; device ids are deduplicated
  // per-rack, matching the existing behaviour (#1363).
  const seenRackIds = new Set<string>();
  const rackIdRemap = new Map<string, string>();

  const racksFirstPass = layoutData.racks.map((r, index) => {
    const originalRackId = r.id;
    let rackId =
      originalRackId && originalRackId.trim().length > 0
        ? originalRackId
        : generateRackId();
    if (seenRackIds.has(rackId)) {
      rackId = generateRackId();
    }
    seenRackIds.add(rackId);
    // Record the remap even for empty/whitespace originals so a group entry
    // referencing that exact (now-renamed) value can follow it (#2155). When an
    // id collides more than once, the first regenerated mapping wins; later
    // collisions of the same value resolve to a surviving rack anyway.
    if (rackId !== originalRackId && !rackIdRemap.has(originalRackId)) {
      rackIdRemap.set(originalRackId, rackId);
    }

    const seenDeviceIds = new Set<string>();
    const deviceIdRemap = new Map<string, string>();
    const devices = r.devices.map((d) => {
      const originalId = d.id;
      let nextId = originalId;
      if (!nextId || seenDeviceIds.has(nextId)) {
        nextId = generateUniqueDeviceId(seenDeviceIds);
        if (originalId) {
          deviceIdRemap.set(originalId, nextId);
        }
      } else {
        seenDeviceIds.add(nextId);
      }
      return nextId === originalId ? d : { ...d, id: nextId };
    });

    const finalDeviceIds = new Set(devices.map((d) => d.id));

    // Second pass (per-rack): rewrite container_id only when the originally
    // referenced id was renamed away (no longer present); a reference to a
    // surviving original id is preserved (#2155).
    const remappedDevices = devices.map((d) => {
      const originalContainerId = d.container_id;
      if (!originalContainerId) return d;
      if (finalDeviceIds.has(originalContainerId)) return d;
      const nextContainerId = deviceIdRemap.get(originalContainerId);
      if (!nextContainerId || nextContainerId === originalContainerId) return d;
      return { ...d, container_id: nextContainerId };
    });

    return {
      ...r,
      id: rackId,
      devices: remappedDevices,
      position: Number.isFinite(r.position) ? r.position : index,
      view: r.view ?? "front",
      show_rear: r.show_rear ?? true,
    };
  });

  // Second pass (layout-level): rewrite rack_groups[].rack_ids through the
  // rack-id map so regenerated racks stay attached to their groups. Only remap
  // when the referenced id was renamed away (no surviving rack still holds it);
  // a reference to a surviving original id is preserved (#2155).
  const finalRackIds = new Set(racksFirstPass.map((r) => r.id));
  const rackGroups = layoutData.rack_groups?.map((group) => ({
    ...group,
    rack_ids: group.rack_ids.map((id) =>
      finalRackIds.has(id) ? id : (rackIdRemap.get(id) ?? id),
    ),
  }));

  // Ensure runtime view is set, show_rear defaults, and all racks have valid IDs
  ctx.setLayout({
    ...layoutData,
    metadata,
    racks: racksFirstPass,
    ...(rackGroups !== undefined ? { rack_groups: rackGroups } : {}),
  });
  ctx.resetBackupTracking();

  // Set active rack to first rack
  ctx.setActiveRackId(ctx.getLayout().racks[0]?.id ?? null);

  // Mark as started (user has loaded a layout)
  ctx.markStarted();
}
