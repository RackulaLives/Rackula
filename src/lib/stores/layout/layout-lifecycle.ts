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

  // Track seen IDs to detect duplicates
  const seenIds = new Set<string>();

  // Ensure runtime view is set, show_rear defaults, and all racks have valid IDs
  ctx.setLayout({
    ...layoutData,
    metadata,
    racks: layoutData.racks.map((r, index) => {
      // Generate ID if missing or duplicate
      let rackId = r.id && r.id.trim().length > 0 ? r.id : generateRackId();
      if (seenIds.has(rackId)) {
        rackId = generateRackId();
      }
      seenIds.add(rackId);

      // Deduplicate device IDs and remap container_id references — defence-in-depth (#1363)
      const seenDeviceIds = new Set<string>();
      const idRemap = new Map<string, string>();
      const devices = r.devices.map((d) => {
        const originalId = d.id;
        let nextId = originalId;
        if (!nextId || seenDeviceIds.has(nextId)) {
          nextId = generateUniqueDeviceId(seenDeviceIds);
          if (originalId) {
            idRemap.set(originalId, nextId);
          }
        } else {
          seenDeviceIds.add(nextId);
        }
        const nextContainerId =
          d.container_id && idRemap.has(d.container_id)
            ? idRemap.get(d.container_id)!
            : d.container_id;
        return nextId === originalId && nextContainerId === d.container_id
          ? d
          : { ...d, id: nextId, container_id: nextContainerId };
      });

      return {
        ...r,
        id: rackId,
        devices,
        position: Number.isFinite(r.position) ? r.position : index,
        view: r.view ?? "front",
        show_rear: r.show_rear ?? true,
      };
    }),
  });
  ctx.resetBackupTracking();

  // Set active rack to first rack
  ctx.setActiveRackId(ctx.getLayout().racks[0]?.id ?? null);

  // Mark as started (user has loaded a layout)
  ctx.markStarted();
}
