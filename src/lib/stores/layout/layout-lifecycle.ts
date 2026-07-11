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
import { adaptLegacyLayout } from "$lib/storage";
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
 * @param reservedDeviceIds - Device ids already live in other open tabs. The
 *   per-rack dedup is seeded with these so a restored layout reusing an id live
 *   elsewhere is regenerated, never aliasing the global image store's
 *   placement-<deviceId> keys across tabs (spike #2182).
 */
export function loadLayout(
  ctx: LayoutStateAccess,
  rawLayout: Layout,
  reservedDeviceIds?: ReadonlySet<string>,
): void {
  // Carrier-first read-path adapter (#2290): this is the single store ingress
  // every load path funnels through (file/API/archive, share decode, browser
  // restore, YAML editor). Normalize legacy data to carrier-first here, before
  // any other processing, so no path can place unadapted data into the store.
  // Idempotent: re-running on an already-adapted layout is a no-op.
  const layoutData = adaptLegacyLayout(rawLayout);

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

  // Cross-tab reservation: ids live in other open tabs. Minted ids are added
  // here so a multi-rack restore stays unique against both the rest of the
  // layout and every other open tab (#2182).
  const reserved = new Set<string>(reservedDeviceIds ?? []);

  // Layout-global old -> new device-id map, accumulated across every rack.
  // container_id resolution below stays scoped to its own rack's local map
  // (unchanged from #2155); this global copy exists so the layout-level
  // cable pass can rewrite an endpoint regardless of which rack its device
  // was regenerated in (#2923).
  const layoutDeviceIdRemap = new Map<string, string>();

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
      // A collision is a duplicate within this rack OR an id reserved by another
      // open tab. Regenerate against both sets so the new id is globally unique.
      if (!nextId || seenDeviceIds.has(nextId) || reserved.has(nextId)) {
        nextId = generateUniqueDeviceId(seenDeviceIds, reserved);
        if (originalId) {
          deviceIdRemap.set(originalId, nextId);
          // First regenerated mapping wins, matching the rack-id remap above
          // (#2155). If the same original id is regenerated more than once
          // (a duplicate id shared across racks that is also reserved, so no
          // copy survives), keep the first so cable resolution is
          // deterministic and independent of rack iteration order (#2923).
          if (!layoutDeviceIdRemap.has(originalId)) {
            layoutDeviceIdRemap.set(originalId, nextId);
          }
        }
      } else {
        seenDeviceIds.add(nextId);
      }
      reserved.add(nextId);
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

  // Second pass (layout-level): rewrite cable endpoints through the
  // layout-global device-id map so cables stay attached to their (possibly
  // regenerated) devices. A cable can connect devices in different racks, so
  // this runs after every rack's device ids are finalized rather than in the
  // per-rack pass above. Only remap when the referenced id was renamed away
  // (no surviving device anywhere in the layout still holds it); a reference
  // to a surviving original id is preserved, mirroring the container_id and
  // rack_groups precedence above (#2923).
  const liveDeviceIds = new Set(
    racksFirstPass.flatMap((r) => r.devices.map((d) => d.id)),
  );
  const cables = layoutData.cables?.map((cable) => ({
    ...cable,
    a_device_id: liveDeviceIds.has(cable.a_device_id)
      ? cable.a_device_id
      : (layoutDeviceIdRemap.get(cable.a_device_id) ?? cable.a_device_id),
    b_device_id: liveDeviceIds.has(cable.b_device_id)
      ? cable.b_device_id
      : (layoutDeviceIdRemap.get(cable.b_device_id) ?? cable.b_device_id),
  }));

  // Ensure runtime view is set, show_rear defaults, and all racks have valid IDs
  ctx.setLayout({
    ...layoutData,
    metadata,
    racks: racksFirstPass,
    ...(rackGroups !== undefined ? { rack_groups: rackGroups } : {}),
    ...(cables !== undefined ? { cables } : {}),
  });
  ctx.resetBackupTracking();

  // Clear undo/redo history: the commands on the stack reference the layout
  // being replaced. Without this, Ctrl+Z would replay them against the freshly
  // loaded layout, mutating the wrong document. Each layout owns its own
  // history, so swapping content into this instance must reset its stacks.
  ctx.getHistory().clear();

  // Set active rack to first rack
  ctx.setActiveRackId(ctx.getLayout().racks[0]?.id ?? null);

  // Mark as started (user has loaded a layout)
  ctx.markStarted();
}
