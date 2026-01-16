/**
 * Drag and Drop Utilities
 * Handles drag data, position calculation, and drop validation
 */

import type { DeviceType, DeviceFace, Rack, SlotPosition } from "$lib/types";
import { canPlaceDevice } from "./collision";
import { RAIL_WIDTH } from "$lib/constants/layout";
import { toInternalUnits } from "./position";

/**
 * Shared drag state - workaround for browser security restriction
 * that prevents reading dataTransfer.getData() during dragover.
 * Set on dragstart, read during dragover, cleared on dragend.
 */
let currentDragData: DragData | null = null;

export function setCurrentDragData(data: DragData | null): void {
  currentDragData = data;
}

export function getCurrentDragData(): DragData | null {
  return currentDragData;
}

/**
 * Drag data structure for drag-and-drop operations
 */
export interface DragData {
  /** Type of drag operation */
  type: "palette" | "rack-device";
  /** Device type being dragged */
  device: DeviceType;
  /** Source rack ID (for rack-device type) */
  sourceRackId?: string;
  /** Source device index in rack (for rack-device type) */
  sourceIndex?: number;
}

/**
 * Drop feedback states
 */
export type DropFeedback = "valid" | "invalid" | "blocked";

/**
 * Calculate the target U position from mouse Y coordinate
 * @param mouseY - Mouse Y position relative to rack SVG
 * @param rackHeight - Rack height in U
 * @param uHeight - Height of one U in pixels
 * @param rackPadding - Top padding of rack SVG
 * @returns Target U position (1-indexed, 1 is at bottom)
 */
export function calculateDropPosition(
  mouseY: number,
  rackHeight: number,
  uHeight: number,
  _rackPadding: number,
): number {
  // SVG coordinate system: y=0 at top
  // U1 is at bottom, U{rackHeight} is at top
  // Total rack height in pixels = rackHeight * uHeight
  const totalHeight = rackHeight * uHeight;

  // Calculate which U the mouse is over
  // mouseY=0 -> top -> U{rackHeight}
  // mouseY=totalHeight -> bottom -> U1

  // First, clamp mouseY to valid range
  const clampedY = Math.max(0, Math.min(mouseY, totalHeight));

  // Calculate U from bottom (U1 = bottom)
  // At y=totalHeight, U=1. At y=0, U=rackHeight
  const uFromTop = Math.floor(clampedY / uHeight);
  const uPosition = rackHeight - uFromTop;

  // Clamp to valid range [1, rackHeight]
  return Math.max(1, Math.min(uPosition, rackHeight));
}

/**
 * Calculate the target slot position from mouse X coordinate
 * @param mouseX - Mouse X position relative to rack interior
 * @param rackWidth - Rack interior width in pixels
 * @param slotWidth - Device slot width (1 = half, 2 = full)
 * @returns Target slot position ('left', 'right', or 'full')
 */
export function calculateDropSlotPosition(
  mouseX: number,
  rackWidth: number,
  slotWidth: number = 2,
): SlotPosition {
  // Full-width devices always use 'full' position
  if (slotWidth === 2) {
    return "full";
  }

  // Half-width devices: determine left or right based on X position
  const midpoint = rackWidth / 2;
  return mouseX < midpoint ? "left" : "right";
}

/**
 * Get drop feedback for a potential placement
 * @param rack - Target rack
 * @param deviceLibrary - Device library for height lookup
 * @param deviceHeight - Height of device being dropped
 * @param targetU - Target U position
 * @param excludeIndex - Optional device index to exclude from collision check (for moves within same rack)
 * @param targetFace - Target face for placement (defaults to 'front')
 * @param targetSlot - Target slot position (defaults to 'full')
 * @returns Feedback: 'valid', 'invalid', or 'blocked'
 */
export function getDropFeedback(
  rack: Rack,
  deviceLibrary: DeviceType[],
  deviceHeight: number,
  targetU: number,
  excludeIndex?: number,
  targetFace: DeviceFace = "front",
  targetSlot: SlotPosition = "full",
): DropFeedback {
  // Check bounds first (in human U units)
  if (targetU < 1) {
    return "invalid";
  }

  if (targetU + deviceHeight - 1 > rack.height) {
    return "invalid";
  }

  // Convert to internal units for collision check
  const targetPositionInternal = toInternalUnits(targetU);

  // Check for collisions with face-aware and slot-aware validation
  // Face is authoritative: only the explicit face value matters for collision
  const canPlace = canPlaceDevice(
    rack,
    deviceLibrary,
    deviceHeight,
    targetPositionInternal,
    excludeIndex,
    targetFace,
    targetSlot,
  );

  if (!canPlace) {
    return "blocked";
  }

  return "valid";
}

/**
 * Create drag data for palette item
 * @param device - DeviceType being dragged
 * @returns DragData for palette drag
 */
export function createPaletteDragData(device: DeviceType): DragData {
  return {
    type: "palette",
    device,
  };
}

/**
 * Create drag data for rack device
 * @param device - DeviceType being dragged
 * @param rackId - Source rack ID
 * @param deviceIndex - Index of device in rack
 * @returns DragData for rack device drag
 */
export function createRackDeviceDragData(
  device: DeviceType,
  rackId: string,
  deviceIndex: number,
): DragData {
  return {
    type: "rack-device",
    device,
    sourceRackId: rackId,
    sourceIndex: deviceIndex,
  };
}

/**
 * Serialize drag data to string for dataTransfer
 * @param data - Drag data to serialize
 * @returns JSON string
 */
export function serializeDragData(data: DragData): string {
  return JSON.stringify(data);
}

/**
 * Parse drag data from dataTransfer string
 * @param dataString - JSON string from dataTransfer
 * @returns Parsed DragData or null if invalid
 */
export function parseDragData(dataString: string): DragData | null {
  try {
    const data = JSON.parse(dataString) as DragData;
    if (
      (data.type === "palette" || data.type === "rack-device") &&
      data.device &&
      typeof data.device.slug === "string"
    ) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Transparent 1x1 canvas for hiding native drag ghost
 * Created once at module level to avoid per-drag allocation
 */
let transparentDragImage: HTMLCanvasElement | null = null;

function getTransparentDragImage(): HTMLCanvasElement {
  if (!transparentDragImage) {
    transparentDragImage = document.createElement("canvas");
    transparentDragImage.width = 1;
    transparentDragImage.height = 1;
  }
  return transparentDragImage;
}

/**
 * Hide the browser's native drag ghost image
 * Call this in dragstart handler to show only our custom DragTooltip
 * @param dataTransfer - The DataTransfer object from drag event
 */
export function hideNativeDragGhost(dataTransfer: DataTransfer): void {
  dataTransfer.setDragImage(getTransparentDragImage(), 0, 0);
}

/**
 * Container drop target information
 * Returned when a drop position is detected within a container slot
 */
export interface ContainerDropTarget {
  /** ID of the container PlacedDevice */
  containerId: string;
  /** Slot ID within the container */
  slotId: string;
  /** Position within the slot (0-indexed from bottom) */
  position: number;
}

/**
 * Detect if a drop position is within a container slot
 * Used during drag-drop to determine if device should be placed in container vs rack
 *
 * @param rack - Target rack containing the container
 * @param deviceLibrary - Device library for type lookup
 * @param targetU - Target U position being dropped on
 * @param xOffsetInRack - X offset within rack interior (pixels from left rail)
 * @param rackWidth - Total rack width in pixels
 * @param selectedContainerId - ID of currently selected container (UX: must select container first)
 * @returns ContainerDropTarget if drop is on a slot, null otherwise
 */
export function detectContainerDropTarget(
  rack: Rack,
  deviceLibrary: DeviceType[],
  targetU: number,
  xOffsetInRack: number,
  rackWidth: number,
  selectedContainerId?: string | null,
): ContainerDropTarget | null {
  // Only check selected container (UX: must select container first)
  if (!selectedContainerId) return null;

  // Find the selected container device
  const container = rack.devices.find((d) => d.id === selectedContainerId);
  if (!container) return null;

  const containerType = deviceLibrary.find(
    (d) => d.slug === container.device_type,
  );
  if (!containerType?.slots || containerType.slots.length === 0) return null;

  // Check if targetU is within container bounds
  const containerTop = container.position + containerType.u_height - 1;
  const containerBottom = container.position;
  if (targetU < containerBottom || targetU > containerTop) return null;

  // Calculate interior width (between rails)
  const interiorWidth = rackWidth - RAIL_WIDTH * 2;

  // Determine which slot based on x position
  let accumulatedWidth = 0;
  for (const slot of containerType.slots) {
    const slotWidth = interiorWidth * (slot.width_fraction ?? 1.0);
    if (
      xOffsetInRack >= accumulatedWidth &&
      xOffsetInRack < accumulatedWidth + slotWidth
    ) {
      return {
        containerId: container.id,
        slotId: slot.id,
        position: 0, // Place at bottom of slot
      };
    }
    accumulatedWidth += slotWidth;
  }

  return null;
}
