/**
 * Command Adapters for Layout Store
 *
 * Extracted from layout.svelte.ts — provides the bridge between the
 * command system (undo/redo) and the raw mutators via
 * getCommandStoreAdapter(), which creates adapter objects implementing
 * DeviceTypeCommandStore, DeviceCommandStore, and RackCommandStore.
 *
 * Recorded actions (Command objects executed through the history system)
 * live in recorded-device-actions.ts, recorded-device-type-actions.ts,
 * and recorded-rack-actions.ts.
 */

import { layoutDebug } from "$lib/utils/debug";
import type {
  DeviceTypeCommandStore,
  DeviceCommandStore,
  RackCommandStore,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getTargetRack } from "./rack-actions";
import {
  addDeviceTypeRaw,
  removeDeviceTypeRaw,
  updateDeviceTypeRaw,
  placeDeviceRaw,
  removeDeviceAtIndexRaw,
  moveDeviceRaw,
  updateDeviceFaceRaw,
  updateDeviceNameRaw,
  updateDevicePlacementImageRaw,
  updateDeviceColourRaw,
  updateDeviceSlotPositionRaw,
  updateDeviceNotesRaw,
  updateDeviceIpRaw,
  getDeviceAtIndex,
  getPlacedDevicesForType,
  updateRackRaw,
  replaceRackRaw,
  clearRackDevicesRaw,
  restoreRackDevicesRaw,
  addCableRaw,
  removeCableRaw,
} from "./mutators";

// =============================================================================
// Command Store Adapter
// Creates an adapter that implements the command store interfaces
// Operations target the active rack
// =============================================================================

/**
 * Resolve the rack ID for adapter operations.
 * Uses active rack, validates it exists, and warns on fallback.
 */
function resolveAdapterRackId(
  ctx: LayoutStateAccess,
  caller: string,
): string | undefined {
  const activeId = ctx.getActiveRackId();
  if (activeId) {
    // Validate the active rack still exists
    if (ctx.findRack(activeId)) {
      return activeId;
    }
    layoutDebug.device(
      "%s: activeRackId '%s' is stale (rack no longer exists), falling back",
      caller,
      activeId,
    );
  }
  // Fall back to first rack
  const target = getTargetRack(ctx);
  if (target) {
    return target.rack.id;
  }
  return undefined;
}

/**
 * Create a command store adapter implementing DeviceTypeCommandStore,
 * DeviceCommandStore, and RackCommandStore interfaces.
 * Used by the command (undo/redo) system to call raw mutators.
 * @param ctx - Layout state access
 */
export function getCommandStoreAdapter(
  ctx: LayoutStateAccess,
): DeviceTypeCommandStore & DeviceCommandStore & RackCommandStore {
  return {
    // DeviceTypeCommandStore
    addDeviceTypeRaw: (deviceType) => addDeviceTypeRaw(ctx, deviceType),
    removeDeviceTypeRaw: (slug) => removeDeviceTypeRaw(ctx, slug),
    updateDeviceTypeRaw: (slug, updates) =>
      updateDeviceTypeRaw(ctx, slug, updates),
    placeDeviceRaw: (device) => placeDeviceRaw(ctx, device),
    removeDeviceAtIndexRaw: (index) => removeDeviceAtIndexRaw(ctx, index),
    getPlacedDevicesForType: (slug) => getPlacedDevicesForType(ctx, slug),
    setActiveRackId: (id) => ctx.setActiveRackId(id),
    getActiveRackId: () => ctx.getActiveRackId(),
    addCableRaw: (cable) => addCableRaw(ctx, cable),
    removeCableRaw: (id) => removeCableRaw(ctx, id),

    // DeviceCommandStore
    moveDeviceRaw: (index, newPosition) =>
      moveDeviceRaw(ctx, index, newPosition),
    updateDeviceFaceRaw: (index, face) => updateDeviceFaceRaw(ctx, index, face),
    updateDeviceNameRaw: (index, name) => updateDeviceNameRaw(ctx, index, name),
    updateDevicePlacementImageRaw: (index, face, filename) => {
      const rackId = resolveAdapterRackId(ctx, "updateDevicePlacementImageRaw");
      if (!rackId) {
        layoutDebug.device("updateDevicePlacementImageRaw: No rack available");
        return;
      }
      updateDevicePlacementImageRaw(ctx, rackId, index, face, filename);
    },
    updateDeviceColourRaw: (index, colour) => {
      const rackId = resolveAdapterRackId(ctx, "updateDeviceColourRaw");
      if (!rackId) {
        layoutDebug.device("updateDeviceColourRaw: No rack available");
        return;
      }
      updateDeviceColourRaw(ctx, rackId, index, colour);
    },
    updateDeviceSlotPositionRaw: (index, slotPosition) => {
      const rackId = resolveAdapterRackId(ctx, "updateDeviceSlotPositionRaw");
      if (!rackId) {
        layoutDebug.device("updateDeviceSlotPositionRaw: No rack available");
        return;
      }
      updateDeviceSlotPositionRaw(ctx, rackId, index, slotPosition);
    },
    updateDeviceNotesRaw: (index, notes) => {
      const rackId = resolveAdapterRackId(ctx, "updateDeviceNotesRaw");
      if (!rackId) {
        layoutDebug.device("updateDeviceNotesRaw: No rack available");
        return;
      }
      updateDeviceNotesRaw(ctx, rackId, index, notes);
    },
    updateDeviceIpRaw: (index, ip) => {
      const rackId = resolveAdapterRackId(ctx, "updateDeviceIpRaw");
      if (!rackId) {
        layoutDebug.device("updateDeviceIpRaw: No rack available");
        return;
      }
      updateDeviceIpRaw(ctx, rackId, index, ip);
    },
    getDeviceAtIndex: (index) => getDeviceAtIndex(ctx, index),

    // RackCommandStore
    updateRackRaw: (updates) => updateRackRaw(ctx, updates),
    replaceRackRaw: (newRack) => replaceRackRaw(ctx, newRack),
    clearRackDevicesRaw: () => clearRackDevicesRaw(ctx),
    restoreRackDevicesRaw: (devices) => restoreRackDevicesRaw(ctx, devices),
    getRack: () => {
      const target = getTargetRack(ctx);
      if (target) return target.rack;
      const firstRack = ctx.getLayout().racks[0];
      if (!firstRack) throw new Error("No rack available in RackCommandStore");
      return firstRack;
    },
  };
}
