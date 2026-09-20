/**
 * Rack Drop Event Handlers
 * Dispatches resolved drop actions into Svelte custom events.
 * Extracted from Rack.svelte to reduce component size.
 */

import type { DeviceFace } from "$lib/types";
import { NEW_CELL_SLOT_ID } from "$lib/utils/dragdrop";
import type { DropAction } from "$lib/utils/rack-drop-coordinator";
import type { DragData } from "$lib/utils/dragdrop";
import {
  buildCollisionMessage,
  resolveDropAction,
  type DropCoordinateInput,
  type RackDimensions,
} from "$lib/utils/rack-drop-coordinator";
import type { Rack, DeviceType } from "$lib/types";
import type { getLayoutStore } from "$lib/stores/layout.svelte";
import type { getToastStore } from "$lib/stores/toast.svelte";
import { hapticError } from "$lib/utils/haptics";
import { NO_ROOM_MESSAGE } from "$lib/constants/toast-messages";

export interface RackEventCallbacks {
  ondevicemove?: (
    event: CustomEvent<{
      rackId: string;
      deviceIndex: number;
      newPosition: number;
    }>,
  ) => void;
  ondevicemoverack?: (
    event: CustomEvent<{
      sourceRackId: string;
      sourceIndex: number;
      targetRackId: string;
      targetPosition: number;
      face: DeviceFace;
    }>,
  ) => void;
  ondevicedrop?: (
    event: CustomEvent<{
      rackId: string;
      slug: string;
      position: number;
    }>,
  ) => void;
}

/**
 * Dispatch a resolved drop action by firing the appropriate custom event.
 * Handles invalid drops with toast messages and haptic feedback.
 */
export interface DropDispatchContext {
  rack: Rack;
  deviceLibrary: DeviceType[];
  faceFilter?: DeviceFace;
  toastStore: ReturnType<typeof getToastStore>;
  /** Required for container-drop handling in the pointer-drag path. */
  layoutStore?: ReturnType<typeof getLayoutStore>;
  /** Required for container-drop fallback re-resolution. */
  coords?: DropCoordinateInput;
  /** Required for container-drop fallback re-resolution. */
  dims?: RackDimensions;
}

/** The rack and index of a placed device being dragged, or null for a palette drag. */
function placedDragSource(
  dragData: DragData,
): { rackId: string; index: number } | null {
  if (
    dragData.type === "rack-device" &&
    dragData.sourceRackId &&
    dragData.sourceIndex !== undefined
  ) {
    return { rackId: dragData.sourceRackId, index: dragData.sourceIndex };
  }
  return null;
}

/**
 * Commit a container drop: a placed device being dragged moves into the cell
 * with its identity intact in one undo step (#2295); a palette drag places a
 * new device there. Returns false when the cell refused the device, so the
 * caller can fall back to a rack-level drop.
 */
export function placeContainerDrop(
  layoutStore: ReturnType<typeof getLayoutStore>,
  action: Extract<DropAction, { kind: "container-drop" }>,
): boolean {
  const { containerId, slotId, position } = action.containerTarget;

  // The row has no free cell but can grow one. Only a palette drop takes this
  // path: moving a device already in the layout keeps the existing move rules.
  if (slotId === NEW_CELL_SLOT_ID) {
    return layoutStore.extendCustomCarrier(
      action.rackId,
      containerId,
      action.slug,
    );
  }

  const source = placedDragSource(action.dragData);
  if (source) {
    return layoutStore.moveDeviceIntoContainer(
      source.rackId,
      source.index,
      action.rackId,
      containerId,
      slotId,
      position,
    );
  }
  return layoutStore.placeInContainer(
    action.rackId,
    action.slug,
    containerId,
    slotId,
    position,
  );
}

/**
 * Dispatch a resolved drop action by firing the appropriate custom event.
 * Handles invalid drops with toast messages and haptic feedback.
 */
export function dispatchDropAction(
  action: DropAction,
  callbacks: RackEventCallbacks,
  collisionContext?: DropDispatchContext,
): void {
  switch (action.kind) {
    case "internal-move":
      callbacks.ondevicemove?.(
        new CustomEvent("devicemove", {
          detail: {
            rackId: action.rackId,
            deviceIndex: action.deviceIndex,
            newPosition: action.targetU,
          },
        }),
      );
      break;
    case "cross-rack-move":
      callbacks.ondevicemoverack?.(
        new CustomEvent("devicemoverack", {
          detail: {
            sourceRackId: action.sourceRackId,
            sourceIndex: action.sourceIndex,
            targetRackId: action.targetRackId,
            targetPosition: action.targetU,
            face: action.face,
          },
        }),
      );
      break;
    case "palette-drop":
      callbacks.ondevicedrop?.(
        new CustomEvent("devicedrop", {
          detail: {
            rackId: action.rackId,
            slug: action.slug,
            position: action.targetU,
          },
        }),
      );
      break;
    case "container-drop": {
      if (!collisionContext?.layoutStore) break;
      const { layoutStore } = collisionContext;
      if (placeContainerDrop(layoutStore, action)) break;
      // Container placement failed — re-resolve without container detection
      if (collisionContext.coords && collisionContext.dims) {
        const fallbackAction = resolveDropAction(
          collisionContext.coords,
          collisionContext.dims,
          collisionContext.rack,
          collisionContext.deviceLibrary,
          action.dragData,
          collisionContext.faceFilter,
          true, // skip container detection
        );
        dispatchDropAction(fallbackAction, callbacks, collisionContext);
      }
      break;
    }
    case "carrier-drop": {
      if (!collisionContext?.layoutStore) break;
      const { layoutStore } = collisionContext;
      // A placed device being dragged moves with its identity intact (id,
      // fields, ports, connections) in one undo step; a palette drop places a
      // new device (#2295).
      const source = placedDragSource(action.dragData);
      const success = source
        ? layoutStore.moveDeviceSmart(
            source.rackId,
            source.index,
            action.rackId,
            action.targetU,
            action.face,
          )
        : layoutStore.placeDeviceSmart(
            action.rackId,
            action.slug,
            action.targetU,
            action.face,
          );
      if (!success) {
        hapticError();
        collisionContext.toastStore.showToast(NO_ROOM_MESSAGE, "warning", 3000);
      }
      break;
    }
    case "invalid": {
      hapticError();
      if (collisionContext) {
        // An explicit message (e.g. the honest "requires a chassis" case) wins
        // over the collision-derived one, which has no device to name here.
        const message =
          action.message ??
          buildCollisionMessage(
            action.feedback,
            collisionContext.rack,
            collisionContext.deviceLibrary,
            action.deviceHeight,
            action.targetU,
            action.excludeIndex,
            collisionContext.faceFilter,
          );
        if (message) {
          collisionContext.toastStore.showToast(message, "warning", 3000);
        }
      }
      break;
    }
  }
}
