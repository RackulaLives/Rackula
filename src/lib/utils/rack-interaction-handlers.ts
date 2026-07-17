/**
 * Rack Interaction Handlers
 * Factory for drag-and-drop, touch, and keyboard event handlers.
 * Extracted from Rack.svelte to reduce component size.
 *
 * These handlers are created via a factory function that receives
 * reactive getters for the values they need from the component.
 */

import type { Rack, DeviceType, DeviceFace } from "$lib/types";
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
    false,
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
      true, // skip container detection
    );
    dispatchDropAction(fallbackAction, ctx.getEventCallbacks(), {
      rack,
      deviceLibrary,
      faceFilter,
      toastStore: ctx.toastStore,
      layoutStore: ctx.layoutStore,
    });
    return;
  }

  dispatchDropAction(action, ctx.getEventCallbacks(), {
    rack,
    deviceLibrary,
    faceFilter,
    toastStore: ctx.toastStore,
    layoutStore: ctx.layoutStore,
  });
}

/**
 * Resolve the drop target under the given client coordinates and, when valid,
 * dispatch a `placementtap`. Shared by the touch (handleTouchEnd) and
 * mouse/pointer (handlePlacementClick) tap-to-place paths.
 */
function dispatchPlacementAt(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  ctx: RackHandlerContext,
  device: DeviceType,
  onplacementtap?: (
    event: CustomEvent<{ position: number; face: "front" | "rear" }>,
  ) => void,
): void {
  const result = resolveDropTarget(
    { svgElement: svg, clientX, clientY },
    ctx.getRackDims(),
    ctx.getRack(),
    ctx.getDeviceLibrary(),
    device,
    ctx.getFaceFilter(),
  );

  if (result.feedback === "valid") {
    // Placement faces are "front" | "rear". getFaceFilter() is typed DeviceFace
    // but callers only ever supply "front" or "rear" (Rack.svelte derives it
    // from faceFilter ?? rack.view); collapse anything else to "front".
    const faceFilter = ctx.getFaceFilter();
    onplacementtap?.(
      new CustomEvent("placementtap", {
        detail: {
          position: result.targetU,
          face: faceFilter === "rear" ? ("rear" as const) : ("front" as const),
        },
      }),
    );
  } else {
    hapticError();
    ctx.toastStore.showToast("Can't place device here", "warning", 3000);
  }
}

/**
 * Handle touch end events for mobile tap-to-place workflow (touchscreen input).
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

  dispatchPlacementAt(
    event.currentTarget as SVGSVGElement,
    touch.clientX,
    touch.clientY,
    ctx,
    device,
    onplacementtap,
  );
}

/**
 * Track the pointer during click/tap-to-place so the placement ghost follows
 * the mouse (#2992). Resolves the U under the pointer with the exact same
 * pipeline the placement click uses (resolveDropTarget), then moves the
 * placement store's cursor there. The ghost rendered from that cursor
 * (keyboardCursorPreview in Rack.svelte) therefore always shows where a click
 * would land, and the keyboard arrows continue from wherever the pointer left
 * the cursor.
 *
 * Hot path: this runs on every pointermove over the rack, like the drag
 * preview's dragmove handler. The cursor and face writes are primitive-valued
 * store assignments, so Svelte's signal equality makes the per-pixel calls
 * no-ops until the resolved U (or hovered rack/face) actually changes.
 */
export function handlePlacementHover(
  event: MouseEvent | PointerEvent,
  svg: SVGSVGElement,
  ctx: RackHandlerContext,
  device: DeviceType,
  placement: {
    setCursor: (rackId: string, position: number | null) => void;
    setTargetFace: (face: "front" | "rear") => void;
  },
): void {
  const result = resolveDropTarget(
    { svgElement: svg, clientX: event.clientX, clientY: event.clientY },
    ctx.getRackDims(),
    ctx.getRack(),
    ctx.getDeviceLibrary(),
    device,
    ctx.getFaceFilter(),
  );

  // Keep the armed face in step with the hovered rack copy (front/rear in
  // dual view), matching the face the click path would place onto.
  const faceFilter = ctx.getFaceFilter();
  placement.setTargetFace(faceFilter === "rear" ? "rear" : "front");
  placement.setCursor(ctx.getRack().id, result.targetU);
}

/**
 * Handle mouse/pointer tap-to-place onto the rack.
 *
 * The touch flow (handleTouchEnd) only fires for real TouchEvents, which
 * desktop browsers do NOT synthesise for mouse/trackpad input. In mobile mode
 * (viewport <= 1024px) a mouse user could pick a device from the palette but
 * never complete the placement tap (#1757). This mirrors the touch flow for
 * click input so placement works for any pointing device, in any browser.
 *
 * Touch input keeps using handleTouchEnd (whose preventDefault() suppresses the
 * synthesised click), so this does not double-fire on touchscreens.
 *
 * The rack `<svg>` is passed explicitly because this is invoked from the
 * accessible rack-container click handler, whose `currentTarget` is the
 * wrapping element rather than the SVG used for coordinate resolution.
 */
export function handlePlacementClick(
  event: MouseEvent,
  svg: SVGSVGElement,
  ctx: RackHandlerContext,
  device: DeviceType,
  onplacementtap?: (
    event: CustomEvent<{ position: number; face: "front" | "rear" }>,
  ) => void,
): void {
  dispatchPlacementAt(
    svg,
    event.clientX,
    event.clientY,
    ctx,
    device,
    onplacementtap,
  );
}
