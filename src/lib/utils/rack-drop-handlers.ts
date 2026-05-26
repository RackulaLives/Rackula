/**
 * Rack Drop Event Handlers
 * Dispatches resolved drop actions into Svelte custom events.
 * Extracted from Rack.svelte to reduce component size.
 */

import type { DeviceFace, SlotPosition } from "$lib/types";
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
      slot_position?: SlotPosition;
    }>,
  ) => void;
  ondevicemoverack?: (
    event: CustomEvent<{
      sourceRackId: string;
      sourceIndex: number;
      targetRackId: string;
      targetPosition: number;
      face: DeviceFace;
      slot_position?: SlotPosition;
    }>,
  ) => void;
  ondevicedrop?: (
    event: CustomEvent<{
      rackId: string;
      slug: string;
      position: number;
      slot_position?: SlotPosition;
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
            slot_position: action.slotPosition,
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
            slot_position: action.slotPosition,
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
            slot_position: action.slotPosition,
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
          null, // skip container detection
        );
        dispatchDropAction(fallbackAction, callbacks, collisionContext);
      }
      break;
    }
    case "invalid": {
      hapticError();
      if (collisionContext) {
        const message = buildCollisionMessage(
          action.feedback,
          collisionContext.rack,
          collisionContext.deviceLibrary,
          action.deviceHeight,
          action.targetU,
          action.excludeIndex,
          collisionContext.faceFilter,
          action.slotPosition,
        );
        if (message) {
          collisionContext.toastStore.showToast(message, "warning", 3000);
        }
      }
      break;
    }
  }
}
