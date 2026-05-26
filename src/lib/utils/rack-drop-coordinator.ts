/**
 * Rack Drop Coordinator
 * Consolidates the drag-drop calculation pipeline used by native DnD,
 * custom pointer events (Safari workaround), and mobile touch-to-place.
 */

import type {
  Rack,
  DeviceType,
  DeviceFace,
  PlacedDevice,
  SlotPosition,
} from "$lib/types";
import {
  calculateDropPosition,
  calculateDropSlotPosition,
  getDropFeedback,
  detectContainerDropTarget,
  detectContainerHover,
  type DragData,
  type DropFeedback,
  type ContainerHoverInfo,
  type ContainerDropTarget,
} from "$lib/utils/dragdrop";
import { findCollisions } from "$lib/utils/collision";
import { getDeviceDisplayName } from "$lib/utils/device";
import { screenToSVG } from "$lib/utils/coordinates";

/** Pixel-based measurements of a rack, used by the drop calculation pipeline. */
export interface RackDimensions {
  rackHeight: number;
  rackWidth: number;
  interiorWidth: number;
  uHeight: number;
  rackPadding: number;
  railWidth: number;
}

/** SVG element and client coordinates for a drop or drag-over event. */
export interface DropCoordinateInput {
  svgElement: SVGSVGElement;
  clientX: number;
  clientY: number;
}

/** Visual preview state for the drop target overlay rendered in the rack SVG. */
export interface DropPreview {
  position: number;
  height: number;
  feedback: DropFeedback;
  slotPosition: SlotPosition;
  isHalfWidth: boolean;
}

/** Full result from drop target resolution, including preview and container hover state. */
export interface DropTargetResult {
  targetU: number;
  xOffsetInRack: number;
  slotPosition: SlotPosition;
  isHalfWidth: boolean;
  feedback: DropFeedback;
  containerHoverInfo: ContainerHoverInfo | null;
  dropPreview: DropPreview;
}

/**
 * Discriminated union describing the resolved action for a drop event.
 * - `internal-move`: device moved within the same rack
 * - `cross-rack-move`: device moved between racks
 * - `palette-drop`: new device placed from the palette
 * - `container-drop`: device placed into a container slot
 * - `invalid`: drop blocked by collision or out-of-bounds
 */
export type DropAction =
  | {
      kind: "internal-move";
      rackId: string;
      deviceIndex: number;
      targetU: number;
      slotPosition: SlotPosition;
    }
  | {
      kind: "cross-rack-move";
      sourceRackId: string;
      sourceIndex: number;
      targetRackId: string;
      targetU: number;
      face: DeviceFace;
      slotPosition: SlotPosition;
    }
  | {
      kind: "palette-drop";
      rackId: string;
      slug: string;
      targetU: number;
      slotPosition: SlotPosition;
    }
  | {
      kind: "container-drop";
      rackId: string;
      containerTarget: ContainerDropTarget;
      slug: string;
      dragData: DragData;
    }
  | {
      kind: "invalid";
      feedback: DropFeedback;
      targetU: number;
      deviceHeight: number;
      slotPosition: SlotPosition;
      excludeIndex?: number;
    };

/**
 * Convert screen coordinates to SVG-relative position data used by the drop pipeline.
 */
function resolveCoordinates(
  coords: DropCoordinateInput,
  dims: RackDimensions,
): {
  mouseY: number;
  xOffsetInRack: number;
  svgCoords: { x: number; y: number };
} {
  const svgCoords = screenToSVG(
    coords.svgElement,
    coords.clientX,
    coords.clientY,
  );
  const mouseY = svgCoords.y - dims.rackPadding;
  const xOffsetInRack = svgCoords.x - dims.railWidth;
  return { mouseY, xOffsetInRack, svgCoords };
}

/**
 * Derive the exclude index for collision checks.
 * Internal moves exclude the source device; all other operations don't.
 */
export function deriveExcludeIndex(
  dragSource: DragData,
  targetRackId: string,
): number | undefined {
  if (
    dragSource.type === "rack-device" &&
    dragSource.sourceRackId === targetRackId &&
    dragSource.sourceIndex !== undefined
  ) {
    return dragSource.sourceIndex;
  }
  return undefined;
}

/**
 * Unified drop-target resolution pipeline.
 * Called by handleDragOver, handleDragMove, and handleTouchEnd to calculate
 * preview position and feedback.
 */
export function resolveDropTarget(
  coords: DropCoordinateInput,
  dims: RackDimensions,
  rack: Rack,
  deviceLibrary: DeviceType[],
  device: DeviceType,
  faceFilter: DeviceFace | undefined,
  excludeIndex?: number,
  slotPositionOverride?: SlotPosition,
): DropTargetResult {
  const { mouseY, xOffsetInRack } = resolveCoordinates(coords, dims);

  const targetU = calculateDropPosition(
    mouseY,
    dims.rackHeight,
    dims.uHeight,
    dims.rackPadding,
  );

  const deviceSlotWidth = device.slot_width ?? 2;
  const slotPosition =
    slotPositionOverride ??
    calculateDropSlotPosition(
      xOffsetInRack,
      dims.interiorWidth,
      deviceSlotWidth,
    );
  const isHalfWidth = deviceSlotWidth === 1;

  const containerHover = detectContainerHover(
    rack,
    deviceLibrary,
    device,
    targetU,
    xOffsetInRack,
    dims.rackWidth,
  );

  const feedback = getDropFeedback(
    rack,
    deviceLibrary,
    device.u_height,
    targetU,
    excludeIndex,
    faceFilter,
    slotPosition,
  );

  return {
    targetU,
    xOffsetInRack,
    slotPosition,
    isHalfWidth,
    feedback,
    containerHoverInfo: containerHover,
    dropPreview: {
      position: targetU,
      height: device.u_height,
      feedback,
      slotPosition,
      isHalfWidth,
    },
  };
}

/**
 * Unified drop-action resolution pipeline.
 * Called by handleDrop and handleDragEnd to classify the drop into an action.
 */
export function resolveDropAction(
  coords: DropCoordinateInput,
  dims: RackDimensions,
  rack: Rack,
  deviceLibrary: DeviceType[],
  dragData: DragData,
  faceFilter: DeviceFace | undefined,
  /** Container selection ID. Pass null to skip container detection (used for fallthrough after failed container placement). */
  selectedDeviceId?: string | null,
  slotPositionOverride?: SlotPosition,
): DropAction {
  const { mouseY, xOffsetInRack } = resolveCoordinates(coords, dims);

  const targetU = calculateDropPosition(
    mouseY,
    dims.rackHeight,
    dims.uHeight,
    dims.rackPadding,
  );

  const deviceSlotWidth = dragData.device.slot_width ?? 2;
  const slotPosition =
    slotPositionOverride ??
    calculateDropSlotPosition(
      xOffsetInRack,
      dims.interiorWidth,
      deviceSlotWidth,
    );

  // Check for container slot drop (requires container to be selected)
  const containerTarget = detectContainerDropTarget(
    rack,
    deviceLibrary,
    targetU,
    xOffsetInRack,
    dims.rackWidth,
    selectedDeviceId,
  );

  if (containerTarget) {
    return {
      kind: "container-drop",
      rackId: rack.id,
      containerTarget,
      slug: dragData.device.slug,
      dragData,
    };
  }

  const excludeIndex = deriveExcludeIndex(dragData, rack.id);
  const feedback = getDropFeedback(
    rack,
    deviceLibrary,
    dragData.device.u_height,
    targetU,
    excludeIndex,
    faceFilter,
    slotPosition,
  );

  if (feedback !== "valid") {
    return {
      kind: "invalid",
      feedback,
      targetU,
      deviceHeight: dragData.device.u_height,
      slotPosition,
      excludeIndex,
    };
  }

  const isInternalMove =
    dragData.type === "rack-device" &&
    dragData.sourceRackId === rack.id &&
    dragData.sourceIndex !== undefined;

  const isCrossRackMove =
    dragData.type === "rack-device" &&
    dragData.sourceRackId !== rack.id &&
    dragData.sourceIndex !== undefined;

  if (isInternalMove && dragData.sourceIndex !== undefined) {
    return {
      kind: "internal-move",
      rackId: rack.id,
      deviceIndex: dragData.sourceIndex,
      targetU,
      slotPosition,
    };
  }

  if (
    isCrossRackMove &&
    dragData.sourceIndex !== undefined &&
    dragData.sourceRackId
  ) {
    return {
      kind: "cross-rack-move",
      sourceRackId: dragData.sourceRackId,
      sourceIndex: dragData.sourceIndex,
      targetRackId: rack.id,
      targetU,
      face: faceFilter ?? "front",
      slotPosition,
    };
  }

  return {
    kind: "palette-drop",
    rackId: rack.id,
    slug: dragData.device.slug,
    targetU,
    slotPosition,
  };
}

/**
 * Build a user-facing collision message for blocked/invalid drops.
 */
export function buildCollisionMessage(
  feedback: DropFeedback,
  rack: Rack,
  deviceLibrary: DeviceType[],
  deviceHeight: number,
  targetU: number,
  excludeIndex?: number,
  faceFilter?: DeviceFace,
  slotPosition?: SlotPosition,
): string | null {
  if (feedback === "blocked") {
    const collisions: PlacedDevice[] = findCollisions(
      rack,
      deviceLibrary,
      deviceHeight,
      targetU,
      excludeIndex,
      faceFilter,
      slotPosition,
    );

    if (collisions.length > 0) {
      const blockingNames = collisions.map((placed) =>
        getDeviceDisplayName(placed, deviceLibrary),
      );
      return blockingNames.length === 1
        ? `Position blocked by ${blockingNames[0]}`
        : `Position blocked by ${blockingNames.join(", ")}`;
    }
    return null;
  }

  if (feedback === "invalid") {
    return "Device doesn't fit at this position";
  }

  return null;
}
