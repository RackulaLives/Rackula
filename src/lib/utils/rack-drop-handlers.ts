/**
 * Rack Drop Event Handlers
 * Dispatches resolved drop actions into Svelte custom events.
 * Extracted from Rack.svelte to reduce component size.
 */

import type { DeviceFace } from "$lib/types";
import type { DropAction } from "$lib/utils/rack-drop-coordinator";
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
      const success = layoutStore.placeInContainer(
        action.rackId,
        action.slug,
        action.containerTarget.containerId,
        action.containerTarget.slotId,
        action.containerTarget.position,
      );
      if (success) {
        if (
          action.dragData.type === "rack-device" &&
          action.dragData.sourceRackId &&
          action.dragData.sourceIndex !== undefined
        ) {
          layoutStore.removeDeviceFromRack(
            action.dragData.sourceRackId,
            action.dragData.sourceIndex,
          );
        }
        break;
      }
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
      const success = layoutStore.placeDeviceSmart(
        action.rackId,
        action.slug,
        action.targetU,
        action.face,
      );
      if (!success) {
        hapticError();
        collisionContext.toastStore.showToast(
          "No room for this device here",
          "warning",
          3000,
        );
        break;
      }
      if (
        action.dragData.type === "rack-device" &&
        action.dragData.sourceRackId &&
        action.dragData.sourceIndex !== undefined
      ) {
        layoutStore.removeDeviceFromRack(
          action.dragData.sourceRackId,
          action.dragData.sourceIndex,
        );
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
