/**
 * Rack Drop Coordinator
 * Consolidates the drag-drop calculation pipeline used by native DnD,
 * custom pointer events (Safari workaround), and mobile touch-to-place.
 */

import type { Rack, DeviceType, DeviceFace, PlacedDevice } from "$lib/types";
import {
  calculateDropPosition,
  getDropFeedback,
  detectContainerDropTarget,
  detectContainerHover,
  type DragData,
  type DropFeedback,
  type ContainerHoverInfo,
  type ContainerDropTarget,
} from "$lib/utils/dragdrop";
import {
  findCollisions,
  synthesizeCarrierForDevice,
  requiresChassisBay,
} from "$lib/utils/collision";
import { findDeviceType } from "$lib/utils/device-lookup";
import { getDeviceDisplayName } from "$lib/utils/device";
import { screenToSVG } from "$lib/utils/coordinates";
import { pendingCollisionFace } from "$lib/utils/effective-face";

/**
 * The rail height of a synthesised carrier, defaulting to 1U if the slug is
 * somehow absent from the library (defensive: the synthesised carriers are
 * always present). Shared by resolveDropTarget and resolveDropAction so both
 * validate the same rail footprint.
 */
function getCarrierHeight(
  carrierSlug: string,
  deviceLibrary: DeviceType[],
): number {
  return findDeviceType(carrierSlug, deviceLibrary)?.u_height ?? 1;
}

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
}

/** Full result from drop target resolution, including preview and container hover state. */
export interface DropTargetResult {
  targetU: number;
  xOffsetInRack: number;
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
    }
  | {
      kind: "cross-rack-move";
      sourceRackId: string;
      sourceIndex: number;
      targetRackId: string;
      targetU: number;
      face: DeviceFace;
    }
  | {
      kind: "palette-drop";
      rackId: string;
      slug: string;
      targetU: number;
    }
  | {
      kind: "container-drop";
      rackId: string;
      containerTarget: ContainerDropTarget;
      slug: string;
      dragData: DragData;
    }
  | {
      kind: "carrier-drop";
      rackId: string;
      slug: string;
      targetU: number;
      face: DeviceFace;
      dragData: DragData;
    }
  | {
      kind: "invalid";
      feedback: DropFeedback;
      targetU: number;
      deviceHeight: number;
      excludeIndex?: number;
      /**
       * Explicit user-facing message that overrides the collision-derived one.
       * Set for the honest "requires a chassis" case (a chassis child dropped on
       * bare rails), which has no colliding device to name.
       */
      message?: string;
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
): DropTargetResult {
  const { mouseY, xOffsetInRack } = resolveCoordinates(coords, dims);

  const targetU = calculateDropPosition(
    mouseY,
    dims.rackHeight,
    dims.uHeight,
    dims.rackPadding,
  );

  const containerHover = detectContainerHover(
    rack,
    deviceLibrary,
    device,
    mouseY,
    xOffsetInRack,
    dims.rackWidth,
    dims.rackHeight,
    dims.uHeight,
    faceFilter,
  );

  // Carrier-first: a sub-U / half-width device (including a chassis child) never
  // lands on a bare rail. Its preview is valid when an existing container under
  // the cursor has a free, fitting cell (a resolvable bay), or else - for a
  // device that can synthesise its own rail carrier - when that carrier's full
  // footprint would fit at this U. A device that requires a carrier but has none
  // synthesisable (a chassis child) is INVALID on bare rails: it can only go
  // into an existing bay. This mirrors placeDeviceSmart so preview and placement
  // agree.
  const carrierSlug = synthesizeCarrierForDevice(device);
  const needsBay = requiresChassisBay(device);
  // Both a carrier-synthesising device and a bay-only device can drop into an
  // existing container cell under the cursor.
  const resolvableContainerTarget =
    carrierSlug !== null || needsBay
      ? detectContainerDropTarget(
          rack,
          deviceLibrary,
          device,
          mouseY,
          xOffsetInRack,
          dims.rackWidth,
          dims.rackHeight,
          dims.uHeight,
          faceFilter,
        )
      : null;

  let feedback: DropFeedback;
  if (resolvableContainerTarget) {
    feedback = "valid";
  } else if (carrierSlug) {
    // Synthesise a rail carrier at this U: validate its full rail footprint.
    const carrierHeight = getCarrierHeight(carrierSlug, deviceLibrary);
    feedback = getDropFeedback(
      rack,
      deviceLibrary,
      carrierHeight,
      targetU,
      excludeIndex,
      "both",
    );
  } else if (needsBay) {
    // Requires a chassis bay but none is under the cursor: honestly invalid.
    feedback = "invalid";
  } else {
    // Widen a full-depth pending device to both faces so the preview matches
    // the store's placement (#2925); see pendingCollisionFace.
    feedback = getDropFeedback(
      rack,
      deviceLibrary,
      device.u_height,
      targetU,
      excludeIndex,
      pendingCollisionFace(device, faceFilter),
    );
  }

  return {
    targetU,
    xOffsetInRack,
    feedback,
    containerHoverInfo: containerHover,
    dropPreview: {
      position: targetU,
      height: device.u_height,
      feedback,
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
  /** Set true to skip container detection (the fallthrough re-resolution after a failed container placement). */
  skipContainer: boolean = false,
): DropAction {
  const { mouseY, xOffsetInRack } = resolveCoordinates(coords, dims);

  const targetU = calculateDropPosition(
    mouseY,
    dims.rackHeight,
    dims.uHeight,
    dims.rackPadding,
  );

  // Carrier-first: a sub-U / half-width device must land inside a carrier.
  const carrierSlug = synthesizeCarrierForDevice(dragData.device);

  // Drop into the cell under the cursor when hovering a container with a free,
  // fitting cell (y-aware: both column and row). Skipped on the failed-container
  // fallback re-resolution.
  if (!skipContainer) {
    const containerTarget = detectContainerDropTarget(
      rack,
      deviceLibrary,
      dragData.device,
      mouseY,
      xOffsetInRack,
      dims.rackWidth,
      dims.rackHeight,
      dims.uHeight,
      faceFilter,
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
  }

  const excludeIndex = deriveExcludeIndex(dragData, rack.id);

  // No container under the cursor: a carriable device synthesises (or fills) a
  // carrier at the target U via the store. Validate the carrier's full rail
  // footprint (height-matched: a 2U carrier needs 2U of clear rail).
  if (carrierSlug) {
    const carrierHeight = getCarrierHeight(carrierSlug, deviceLibrary);
    const carrierFeedback = getDropFeedback(
      rack,
      deviceLibrary,
      carrierHeight,
      targetU,
      excludeIndex,
      "both",
    );
    if (carrierFeedback !== "valid") {
      return {
        kind: "invalid",
        feedback: carrierFeedback,
        targetU,
        deviceHeight: carrierHeight,
        excludeIndex,
      };
    }
    return {
      kind: "carrier-drop",
      rackId: rack.id,
      slug: dragData.device.slug,
      targetU,
      face: faceFilter ?? "front",
      dragData,
    };
  }

  // A device that requires a carrier but has none synthesisable (a chassis
  // child) can only go into an existing chassis bay - handled above when the
  // cursor is over one. On bare rails it is honestly invalid: say it needs a
  // chassis rather than fall through to a rail placement the store would refuse
  // with a misleading "No space".
  if (requiresChassisBay(dragData.device)) {
    return {
      kind: "invalid",
      feedback: "invalid",
      targetU,
      deviceHeight: dragData.device.u_height,
      excludeIndex,
      message: chassisRequirementMessage(dragData.device),
    };
  }

  // Widen a full-depth pending device to both faces so the resolved drop
  // matches the store's placement (#2925); see pendingCollisionFace.
  const feedback = getDropFeedback(
    rack,
    deviceLibrary,
    dragData.device.u_height,
    targetU,
    excludeIndex,
    pendingCollisionFace(dragData.device, faceFilter),
  );

  if (feedback !== "valid") {
    return {
      kind: "invalid",
      feedback,
      targetU,
      deviceHeight: dragData.device.u_height,
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
    };
  }

  return {
    kind: "palette-drop",
    rackId: rack.id,
    slug: dragData.device.slug,
    targetU,
  };
}

/**
 * Honest message for a device that can only mount inside a chassis bay (a
 * chassis child, or a half-width device with no rail carrier). Shown instead of
 * a misleading "No space" when such a device is dropped on bare rails.
 */
export function chassisRequirementMessage(device: DeviceType): string {
  const name = device.model ?? device.slug;
  return `${name} must be placed in a chassis bay`;
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
): string | null {
  if (feedback === "blocked") {
    const collisions: PlacedDevice[] = findCollisions(
      rack,
      deviceLibrary,
      deviceHeight,
      targetU,
      excludeIndex,
      faceFilter,
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
