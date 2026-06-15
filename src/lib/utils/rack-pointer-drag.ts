/**
 * Rack Pointer Drag Listeners
 * Attaches document-level listeners for custom pointer-based drag events.
 * This is the Safari #397 workaround: RackDevice dispatches rackula:dragmove
 * and rackula:dragend instead of native DnD on pointer-event browsers.
 *
 * Extracted from Rack.svelte to reduce component size.
 */

import type { Rack, DeviceType, DeviceFace } from "$lib/types";
import type { ContainerHoverInfo } from "$lib/utils/dragdrop";
import {
  resolveDropTarget,
  resolveDropAction,
  type RackDimensions,
} from "$lib/utils/rack-drop-coordinator";
import {
  dispatchDropAction,
  type RackEventCallbacks,
} from "$lib/utils/rack-drop-handlers";
import type { DropPreviewState } from "$lib/utils/rack-interaction-handlers";
import type { getLayoutStore } from "$lib/stores/layout.svelte";
import type { getToastStore } from "$lib/stores/toast.svelte";

export interface PointerDragContext {
  getSvgElement: () => SVGSVGElement | null;
  getRack: () => Rack;
  getDeviceLibrary: () => DeviceType[];
  getRackDims: () => RackDimensions;
  getFaceFilter: () => DeviceFace | undefined;
  getSelectedDeviceId: () => string | null | undefined;
  getEventCallbacks: () => RackEventCallbacks;
  setDropPreview: (preview: DropPreviewState | null) => void;
  setContainerHoverInfo: (info: ContainerHoverInfo | null) => void;
  onDragFinished: () => void;
  layoutStore: ReturnType<typeof getLayoutStore>;
  toastStore: ReturnType<typeof getToastStore>;
}

// Document-level drag events fire on every rack listener. Without a bounds
// check, racks process events whose pointer is over a sibling rack, causing
// stale previews and incorrect drop dispatch in multi-rack layouts (#1467).
function isPointerOutsideSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): boolean {
  const rect = svg.getBoundingClientRect();
  return (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  );
}

/**
 * Create and attach pointer drag event listeners.
 * Returns a cleanup function that removes the listeners.
 */
export function attachPointerDragListeners(
  ctx: PointerDragContext,
): () => void {
  function handleDragMove(event: CustomEvent) {
    const svgElement = ctx.getSvgElement();
    if (!svgElement) return;
    const { clientX, clientY, device } = event.detail;
    if (isPointerOutsideSvg(svgElement, clientX, clientY)) {
      // Pointer left this rack — clear any preview/hover state we set earlier.
      // Otherwise a stale drop preview remains visible while the user drags
      // over a sibling rack.
      ctx.setContainerHoverInfo(null);
      ctx.setDropPreview(null);
      return;
    }
    const rack = ctx.getRack();
    const isInternalMove = event.detail.rackId === rack.id;
    const excludeIndex = isInternalMove ? event.detail.deviceIndex : undefined;

    const result = resolveDropTarget(
      { svgElement, clientX, clientY },
      ctx.getRackDims(),
      rack,
      ctx.getDeviceLibrary(),
      device,
      ctx.getFaceFilter(),
      excludeIndex,
    );

    ctx.setContainerHoverInfo(result.containerHoverInfo);
    ctx.setDropPreview(result.dropPreview);
  }

  function handleDragEnd(event: CustomEvent) {
    const svgElement = ctx.getSvgElement();
    if (!svgElement) return;
    const {
      clientX,
      clientY,
      device,
      rackId: sourceRackId,
      deviceIndex,
    } = event.detail;

    // Always clear this rack's local drag state, even if the drop landed
    // elsewhere — the source rack still needs its preview/hover cleared.
    ctx.setDropPreview(null);
    ctx.setContainerHoverInfo(null);

    // Only the rack containing the pointer at drop time should dispatch the
    // drop action. Other racks must skip dispatch to avoid duplicate/incorrect
    // drops in multi-rack layouts (#1467).
    if (isPointerOutsideSvg(svgElement, clientX, clientY)) {
      ctx.onDragFinished();
      return;
    }

    // Preserve existing slot_position for pointer-based moves
    const sourceRack = ctx.layoutStore.getRackById(sourceRackId);
    const existingSlot = sourceRack?.devices[deviceIndex]?.slot_position;

    const rack = ctx.getRack();
    const deviceLibrary = ctx.getDeviceLibrary();
    const faceFilter = ctx.getFaceFilter();

    const coords = { svgElement, clientX, clientY };
    const dims = ctx.getRackDims();

    const action = resolveDropAction(
      coords,
      dims,
      rack,
      deviceLibrary,
      { type: "rack-device", device, sourceRackId, sourceIndex: deviceIndex },
      faceFilter,
      false,
      existingSlot,
    );

    dispatchDropAction(action, ctx.getEventCallbacks(), {
      rack,
      deviceLibrary,
      faceFilter,
      toastStore: ctx.toastStore,
      layoutStore: ctx.layoutStore,
      coords,
      dims,
    });

    ctx.onDragFinished();
  }

  document.addEventListener(
    "rackula:dragmove",
    handleDragMove as EventListener,
  );
  document.addEventListener("rackula:dragend", handleDragEnd as EventListener);

  return () => {
    document.removeEventListener(
      "rackula:dragmove",
      handleDragMove as EventListener,
    );
    document.removeEventListener(
      "rackula:dragend",
      handleDragEnd as EventListener,
    );
  };
}
