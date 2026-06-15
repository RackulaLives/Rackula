/**
 * Drag and Drop Utilities
 * Handles drag data, position calculation, and drop validation
 */

import type {
  DeviceType,
  DeviceFace,
  Rack,
  Slot,
  SlotPosition,
} from "$lib/types";
import { canPlaceDevice, findNextFreeChildPosition } from "./collision";
import { RAIL_WIDTH } from "$lib/constants/layout";
import { toInternalUnits, toHumanUnits } from "./position";

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
 * Calculate the target U position from mouse Y coordinate.
 * Rails register equipment at whole-U boundaries only (carrier-first model);
 * sub-U gear mounts inside a carrier, not at a fractional rail offset.
 * @param mouseY - Mouse Y position relative to rack SVG
 * @param rackHeight - Rack height in U
 * @param uHeight - Height of one U in pixels
 * @param _rackPadding - Top padding of rack SVG (kept for call-site symmetry)
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
    // Safari requires drag image element to be in the DOM
    transparentDragImage.style.position = "fixed";
    transparentDragImage.style.left = "-9999px";
    transparentDragImage.style.top = "-9999px";
    transparentDragImage.style.opacity = "0";
    transparentDragImage.style.pointerEvents = "none";
    document.body.appendChild(transparentDragImage);
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
 * Find the column index at a given X position within a container's slots.
 * Columns are derived from the distinct col values in the slot grid.
 * @param slots - Array of slots in the container
 * @param xOffsetInRack - X position relative to rack interior (0 = left edge)
 * @param interiorWidth - Width of rack interior in pixels
 * @returns The matched column index, or null if outside the grid
 */
function colAtX(
  slots: Slot[],
  xOffsetInRack: number,
  interiorWidth: number,
): number | null {
  // Columns share their width_fraction within a row; use the bottom row (the
  // first occurrence of each col) to walk the column boundaries left to right.
  const cols = [...new Set(slots.map((s) => s.position.col))].sort(
    (a, b) => a - b,
  );
  let accumulated = 0;
  for (const col of cols) {
    const colSlot = slots.find((s) => s.position.col === col)!;
    const width = interiorWidth * (colSlot.width_fraction ?? 1.0);
    if (xOffsetInRack >= accumulated && xOffsetInRack < accumulated + width) {
      return col;
    }
    accumulated += width;
  }
  return null;
}

/**
 * Find the row index at a given Y position within a container's U band.
 * Rows are 0-indexed from the bottom of the container. A 2-row carrier splits
 * its single U into a lower half (row 0) and an upper half (row 1).
 * @param slots - Array of slots in the container
 * @param mouseY - Mouse Y relative to rack SVG (0 = top)
 * @param rackHeight - Rack height in U
 * @param uHeight - Height of one U in pixels
 * @param containerBottomU - Container's bottom U position (human U)
 * @param containerHeightU - Container height in U
 * @returns The matched row index (clamped to the grid)
 */
function rowAtY(
  slots: Slot[],
  mouseY: number,
  rackHeight: number,
  uHeight: number,
  containerBottomU: number,
  containerHeightU: number,
): number {
  const rowCount = new Set(slots.map((s) => s.position.row)).size;
  if (rowCount <= 1) return 0;

  // SVG y grows downward; U1 is at the bottom. A device whose bottom is at U n
  // occupies y in [(rackHeight - n) * uHeight, ...). The container's visual top
  // edge is the top of its highest U (containerBottomU + containerHeightU - 1).
  const containerTopY =
    (rackHeight - (containerBottomU + containerHeightU - 1)) * uHeight;
  const containerPxHeight = containerHeightU * uHeight;
  // Fraction from the top of the container (0 = top, 1 = bottom).
  const fromTop = (mouseY - containerTopY) / containerPxHeight;
  const clamped = Math.max(0, Math.min(fromTop, 0.999));
  // Row 0 is the bottom; invert so the bottom slice maps to row 0.
  const rowFromTop = Math.floor(clamped * rowCount);
  return rowCount - 1 - rowFromTop;
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
 * Detect if a drop lands within a container, picking the cell by BOTH column
 * (x) and row (y) so every cell of a 2x2 / half-height carrier is reachable.
 * No pre-selection is required: any container at the target U is considered.
 * If the targeted cell is occupied or unfit, the first free fitting cell is
 * used so a drop always lands somewhere fillable.
 *
 * @param rack - Target rack containing the container
 * @param deviceLibrary - Device library for type lookup
 * @param draggedDevice - The device being dropped (for cell-fit checks)
 * @param mouseY - Mouse Y relative to rack SVG (0 = top), for row targeting
 * @param xOffsetInRack - X offset within rack interior (pixels from left rail)
 * @param rackWidth - Total rack width in pixels
 * @param rackHeight - Rack height in U
 * @param uHeight - Height of one U in pixels
 * @param faceFilter - Active face; containers on the opposite face are ignored
 * @returns ContainerDropTarget if drop is on a fillable cell, null otherwise
 */
export function detectContainerDropTarget(
  rack: Rack,
  deviceLibrary: DeviceType[],
  draggedDevice: DeviceType,
  mouseY: number,
  xOffsetInRack: number,
  rackWidth: number,
  rackHeight: number,
  uHeight: number,
  faceFilter?: DeviceFace,
): ContainerDropTarget | null {
  const targetU = calculateDropPosition(mouseY, rackHeight, uHeight, 0);

  for (const container of rack.devices) {
    // Skip container children: they live inside a parent, not at the rail.
    if (container.container_id) continue;
    // Skip containers on the opposite face ('both' always matches).
    if (!faceMatches(container.face, faceFilter)) continue;

    const containerType = deviceLibrary.find(
      (d) => d.slug === container.device_type,
    );
    const slots = containerType?.slots;
    if (!slots || slots.length === 0) continue;

    // Rail positions are whole-U; convert the container bottom to human U.
    const containerBottomU = toHumanUnits(container.position);
    const containerTopU = containerBottomU + containerType.u_height - 1;
    if (targetU < containerBottomU || targetU > containerTopU) continue;

    const interiorWidth = rackWidth - RAIL_WIDTH * 2;
    const col = colAtX(slots, xOffsetInRack, interiorWidth);
    const row = rowAtY(
      slots,
      mouseY,
      rackHeight,
      uHeight,
      containerBottomU,
      containerType.u_height,
    );

    const children = rack.devices.filter(
      (d) => d.container_id === container.id,
    );
    const occupied = new Set(
      children.map((c) => c.slot_id).filter((id): id is string => !!id),
    );

    // Prefer the cell directly under the cursor when it is free and fits.
    const aimed =
      col !== null
        ? slots.find((s) => s.position.col === col && s.position.row === row)
        : undefined;
    if (
      aimed &&
      !occupied.has(aimed.id) &&
      isSlotCompatible(aimed, draggedDevice)
    ) {
      return { containerId: container.id, slotId: aimed.id, position: 0 };
    }

    // Otherwise fall back to the first free cell (also covers an occupied aim).
    const fittingSlots = slots.filter((s) =>
      isSlotCompatible(s, draggedDevice),
    );
    const free = findNextFreeChildPosition(
      { ...containerType, slots: fittingSlots },
      children,
    );
    if (free) {
      return {
        containerId: container.id,
        slotId: free.slotId,
        position: free.position,
      };
    }

    // Container is under the cursor but full: do not fall through to the rail.
    return null;
  }

  return null;
}

/**
 * Whether a container's face is reachable from the active face filter. A 'both'
 * face (and an undefined filter) always matches; otherwise the faces must be
 * equal. Opposite explicit faces (front vs rear) do not match.
 */
function faceMatches(
  containerFace: DeviceFace,
  faceFilter: DeviceFace | undefined,
): boolean {
  if (!faceFilter || faceFilter === "both") return true;
  if (containerFace === "both") return true;
  return containerFace === faceFilter;
}

/**
 * Container hover information for drag overlay
 * Used to show slot grid during drag-over
 */
export interface ContainerHoverInfo {
  /** ID of the container PlacedDevice */
  containerId: string;
  /** The slot ID currently under cursor (null if between slots) */
  targetSlotId: string | null;
  /** Whether the current slot is a valid drop target for the dragged device */
  isValidTarget: boolean;
}

/**
 * Detect if cursor is hovering over any container during drag, for the slot
 * overlay. Uses the same column (x) and row (y) targeting as the actual drop,
 * so the highlighted cell matches where the device would land.
 *
 * @param rack - The rack to search
 * @param deviceLibrary - Device library for looking up device types
 * @param draggedDevice - The device being dragged (for compatibility check)
 * @param mouseY - Mouse Y relative to rack SVG (0 = top), for row targeting
 * @param xOffsetInRack - X position relative to rack interior (0 = left rail)
 * @param rackWidth - Total rack width in pixels
 * @param rackHeight - Rack height in U
 * @param uHeight - Height of one U in pixels
 * @param faceFilter - Active face; containers on the opposite face are ignored
 * @returns ContainerHoverInfo if hovering over a container, null otherwise
 */
export function detectContainerHover(
  rack: Rack,
  deviceLibrary: DeviceType[],
  draggedDevice: DeviceType,
  mouseY: number,
  xOffsetInRack: number,
  rackWidth: number,
  rackHeight: number,
  uHeight: number,
  faceFilter?: DeviceFace,
): ContainerHoverInfo | null {
  const targetU = calculateDropPosition(mouseY, rackHeight, uHeight, 0);

  for (const placedDevice of rack.devices) {
    // Skip container children
    if (placedDevice.container_id) continue;
    // Skip containers on the opposite face ('both' always matches).
    if (!faceMatches(placedDevice.face, faceFilter)) continue;

    const deviceType = deviceLibrary.find(
      (d) => d.slug === placedDevice.device_type,
    );
    const slots = deviceType?.slots;
    if (!slots || slots.length === 0) continue;

    // Rail positions are whole-U; convert the container bottom to human U.
    const containerBottomU = toHumanUnits(placedDevice.position);
    const containerTopU = containerBottomU + deviceType.u_height - 1;
    if (targetU < containerBottomU || targetU > containerTopU) continue;

    // Found a container at this position - resolve the cell under the cursor.
    const interiorWidth = rackWidth - RAIL_WIDTH * 2;
    const col = colAtX(slots, xOffsetInRack, interiorWidth);
    const row = rowAtY(
      slots,
      mouseY,
      rackHeight,
      uHeight,
      containerBottomU,
      deviceType.u_height,
    );
    const slot =
      col !== null
        ? slots.find((s) => s.position.col === col && s.position.row === row)
        : undefined;

    return {
      containerId: placedDevice.id,
      targetSlotId: slot?.id ?? null,
      isValidTarget: slot ? isSlotCompatible(slot, draggedDevice) : false,
    };
  }

  return null;
}

/**
 * Check if a device is compatible with a slot.
 * A device is compatible if:
 * - The slot's accepts array is empty (accepts all) OR includes the device's category
 * - The device fits within the slot dimensions
 */
function isSlotCompatible(slot: Slot, device: DeviceType): boolean {
  // Check category is allowed (empty accepts = all allowed)
  if (slot.accepts && slot.accepts.length > 0) {
    if (!slot.accepts.includes(device.category)) {
      return false;
    }
  }

  // Check width fits (slot_width 1 = half, 2 = full)
  const slotWidth = device.slot_width ?? 2;
  const requiredFraction = slotWidth === 1 ? 0.5 : 1.0;
  const availableFraction = slot.width_fraction ?? 1.0;
  if (requiredFraction > availableFraction + 0.01) {
    return false;
  }

  // Check height fits
  const slotHeight = slot.height_units ?? 1;
  if (device.u_height > slotHeight) {
    return false;
  }

  return true;
}
