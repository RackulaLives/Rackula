/**
 * Pointer placement completion (#2992).
 *
 * Completes a click/tap-to-place placement with a visible confirmation: the
 * placed device becomes the selection, so the rack highlight and the edit
 * panel switch to it instead of silently staying on the previous state. The
 * aria-live announcement names the device and the landing slot, matching the
 * keyboard flow's richer copy.
 */

import type { DeviceType, PlacedDevice, Rack } from "$lib/types";
import type { getLayoutStore } from "$lib/stores/layout.svelte";
import type { getSelectionStore } from "$lib/stores/selection.svelte";
import type { getPlacementStore } from "$lib/stores/placement.svelte";
import { placedAnnouncement } from "./placement-keyboard";

export interface PointerPlacementStores {
  layoutStore: ReturnType<typeof getLayoutStore>;
  selectionStore: ReturnType<typeof getSelectionStore>;
  placementStore: ReturnType<typeof getPlacementStore>;
}

/**
 * The just-placed device: placements append to `rack.devices`, so the last
 * entry with the placed slug is the new one. For a sub-U device this is the
 * child inside its carrier (also appended after any synthesised carrier),
 * which is the device the user chose, not its wrapper.
 */
function findJustPlaced(rack: Rack, slug: string): PlacedDevice | undefined {
  for (let i = rack.devices.length - 1; i >= 0; i--) {
    const placed = rack.devices[i];
    if (placed && placed.device_type === slug) return placed;
  }
  return undefined;
}

/**
 * Place `device` at `position` on `face` of the rack, and on success confirm
 * visibly: select the placed device and end placement mode with a "Placed X
 * at U<n> of <rack>" announcement. On failure nothing changes and the mode
 * stays armed so the user can retry; the caller owns the failure cue (toast
 * and haptics).
 *
 * @returns true when the device was placed
 */
export function completePointerPlacement(
  stores: PointerPlacementStores,
  rackId: string,
  device: DeviceType,
  position: number,
  face: "front" | "rear",
): boolean {
  const { layoutStore, selectionStore, placementStore } = stores;

  // Carrier-first: a sub-U / half-width device synthesises (or fills) a
  // carrier; whole-U full-width gear mounts directly to the rails.
  const success = layoutStore.placeDeviceSmart(
    rackId,
    device.slug,
    position,
    face,
  );
  if (!success) return false;

  const rack = layoutStore.getRackById(rackId);
  const placed = rack ? findJustPlaced(rack, device.slug) : undefined;
  if (placed) {
    layoutStore.setActiveRack(rackId);
    selectionStore.selectDevice(rackId, placed.id, face);
  }
  placementStore.completePlacement(
    rack ? placedAnnouncement(device, rack.name, position) : undefined,
  );
  return true;
}
