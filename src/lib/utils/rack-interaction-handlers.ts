/**
 * Rack Interaction Handlers
 * Factory for drag-and-drop, touch, and keyboard event handlers.
 * Extracted from Rack.svelte to reduce component size.
 *
 * These handlers are created via a factory function that receives
 * reactive getters for the values they need from the component.
 */

import type { Rack, DeviceType, DeviceFace, SlotPosition } from "$lib/types";
import {
  parseDragData,
  getCurrentDragData,
  type DropFeedback,
  type ContainerHoverInfo,
} from "$lib/utils/dragdrop";
import {
  resolveDropTarget,
  resolveDropAction,
  type RackDimensions,
} from "$lib/utils/rack-drop-coordinator";
import {
  dispatchDropAction,
  type RackEventCallbacks,
} from "$lib/utils/rack-drop-handlers";
import { hapticError } from "$lib/utils/haptics";
import type { getLayoutStore } from "$lib/stores/layout.svelte";
import type { getToastStore } from "$lib/stores/toast.svelte";

export interface DropPreviewState {
  position: number;
  height: number;
  feedback: DropFeedback;
  slotPosition?: SlotPosition;
  isHalfWidth?: boolean;
}

/** Reactive getters that the handlers read from the component. */
export interface RackHandlerContext {
  getRack: () => Rack;
  getDeviceLibrary: () => DeviceType[];
  getRackDims: () => RackDimensions;
  getFaceFilter: () => DeviceFace | undefined;
  getSelectedDeviceId: () => string | null | undefined;
  getEventCallbacks: () => RackEventCallbacks;
  setDropPreview: (preview: DropPreviewState | null) => void;
  setContainerHoverInfo: (info: ContainerHoverInfo | null) => void;
  layoutStore: ReturnType<typeof getLayoutStore>;
  toastStore: ReturnType<typeof getToastStore>;
}

/**
 * Handle native dragover events on the rack SVG.
 */
export function handleDragOver(
  event: DragEvent,
  ctx: RackHandlerContext,
): void {
  event.preventDefault();
  if (!event.dataTransfer) return;

  let dragData = parseDragData(
    event.dataTransfer.getData("application/json") ||
      event.dataTransfer.getData("text/plain"),
  );
  if (!dragData) {
    dragData = getCurrentDragData();
  }
  if (!dragData) return;

  const rack = ctx.getRack();
  const isInternalMove =
    dragData.type === "rack-device" &&
    dragData.sourceRackId === rack.id &&
    dragData.sourceIndex !== undefined;

  event.dataTransfer.dropEffect = isInternalMove ? "move" : "copy";

  const svg = event.currentTarget as SVGSVGElement;
  const excludeIndex = isInternalMove ? dragData.sourceIndex : undefined;

  const result = resolveDropTarget(
    { svgElement: svg, clientX: event.clientX, clientY: event.clientY },
    ctx.getRackDims(),
    rack,
    ctx.getDeviceLibrary(),
    dragData.device,
    ctx.getFaceFilter(),
    excludeIndex,
  );

  ctx.setContainerHoverInfo(result.containerHoverInfo);
  ctx.setDropPreview(result.dropPreview);
}

/**
 * Handle native dragenter events.
 */
export function handleDragEnter(event: DragEvent): void {
  event.preventDefault();
}

/**
 * Handle native dragleave events.
 */
export function handleDragLeave(
  event: DragEvent,
  ctx: RackHandlerContext,
): void {
  const svg = event.currentTarget as SVGElement;
  const relatedTarget = event.relatedTarget as Node | null;
  if (!relatedTarget || !svg.contains(relatedTarget)) {
    ctx.setDropPreview(null);
    ctx.setContainerHoverInfo(null);
  }
}

/**
 * Handle native drop events on the rack SVG.
 */
export function handleDrop(event: DragEvent, ctx: RackHandlerContext): void {
  event.preventDefault();
  ctx.setDropPreview(null);
  ctx.setContainerHoverInfo(null);

  if (!event.dataTransfer) return;

  const data =
    event.dataTransfer.getData("application/json") ||
    event.dataTransfer.getData("text/plain");
  const dragData = parseDragData(data);
  if (!dragData) return;

  const rack = ctx.getRack();
  const deviceLibrary = ctx.getDeviceLibrary();
  const faceFilter = ctx.getFaceFilter();
  const svg = event.currentTarget as SVGSVGElement;

  const action = resolveDropAction(
    { svgElement: svg, clientX: event.clientX, clientY: event.clientY },
    ctx.getRackDims(),
    rack,
    deviceLibrary,
    dragData,
    faceFilter,
    ctx.getSelectedDeviceId(),
  );

  // Container drops need special handling for source removal and fallback
  if (action.kind === "container-drop") {
    const success = ctx.layoutStore.placeInContainer(
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
        ctx.layoutStore.removeDeviceFromRack(
          action.dragData.sourceRackId,
          action.dragData.sourceIndex,
        );
      }
      return;
    }
    // Container placement failed — fall through to rack-level via re-resolve
    const fallbackAction = resolveDropAction(
      { svgElement: svg, clientX: event.clientX, clientY: event.clientY },
      ctx.getRackDims(),
      rack,
      deviceLibrary,
      dragData,
      faceFilter,
      null, // no selectedDeviceId = skip container detection
    );
    dispatchDropAction(fallbackAction, ctx.getEventCallbacks(), {
      rack,
      deviceLibrary,
      faceFilter,
      toastStore: ctx.toastStore,
    });
    return;
  }

  dispatchDropAction(action, ctx.getEventCallbacks(), {
    rack,
    deviceLibrary,
    faceFilter,
    toastStore: ctx.toastStore,
  });
}

/**
 * Handle touch end events for mobile tap-to-place workflow.
 */
export function handleTouchEnd(
  event: TouchEvent,
  ctx: RackHandlerContext,
  device: DeviceType,
  onplacementtap?: (
    event: CustomEvent<{ position: number; face: "front" | "rear" }>,
  ) => void,
): void {
  event.preventDefault();

  const touch = event.changedTouches[0];
  if (!touch) return;

  const svg = event.currentTarget as SVGSVGElement;
  const result = resolveDropTarget(
    { svgElement: svg, clientX: touch.clientX, clientY: touch.clientY },
    ctx.getRackDims(),
    ctx.getRack(),
    ctx.getDeviceLibrary(),
    device,
    ctx.getFaceFilter(),
  );

  if (result.feedback === "valid") {
    onplacementtap?.(
      new CustomEvent("placementtap", {
        detail: {
          position: result.targetU,
          face: ctx.getFaceFilter() ?? "front",
        },
      }),
    );
  } else {
    hapticError();
  }
}
