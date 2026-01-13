/**
 * Drag Tooltip Store
 *
 * Global state for managing the drag tooltip that shows device name
 * and U-height during drag operations. The tooltip follows the cursor
 * and provides immediate context during device placement.
 *
 * Issue #306: feat: drag tooltip showing device name and U-height
 */

import type { DeviceType } from "$lib/types";

/** Drag tooltip state */
export interface DragTooltipState {
  /** Device being dragged */
  device: DeviceType | null;
  /** X position (clientX from mouse event) */
  x: number;
  /** Y position (clientY from mouse event) */
  y: number;
  /** Whether tooltip is visible */
  visible: boolean;
  /** Device category color for accent */
  categoryColor: string;
  /** Device U-height for sizing */
  uHeight: number;
}

/** Tooltip cursor offset (--space-4) */
const TOOLTIP_OFFSET_X = 16;
/** Tooltip cursor offset (--space-2 negative) */
const TOOLTIP_OFFSET_Y = -8;

/** Drag tooltip store singleton */
let tooltipState = $state<DragTooltipState>({
  device: null,
  x: 0,
  y: 0,
  visible: false,
  categoryColor: "",
  uHeight: 1,
});

/**
 * Show the drag tooltip at the specified cursor position
 * @param device - The device being dragged
 * @param clientX - Mouse clientX coordinate
 * @param clientY - Mouse clientY coordinate
 */
/** Maximum U-height for rack devices (standard 42U rack) */
const MAX_U_HEIGHT = 42;

/**
 * Check if a color value is valid (non-empty string)
 */
function isValidColor(color: string | undefined | null): color is string {
  return typeof color === "string" && color.trim() !== "";
}

export function showDragTooltip(
  device: DeviceType,
  clientX: number,
  clientY: number,
): void {
  // Clamp uHeight to valid range (1-42U)
  const clampedUHeight = Math.max(1, Math.min(device.u_height, MAX_U_HEIGHT));

  // Use device colour only if it's a valid non-empty string
  const categoryColor = isValidColor(device.colour)
    ? device.colour
    : "var(--colour-primary)";

  tooltipState = {
    device,
    x: clientX + TOOLTIP_OFFSET_X,
    y: clientY + TOOLTIP_OFFSET_Y,
    visible: true,
    categoryColor,
    uHeight: clampedUHeight,
  };
}

/**
 * Update the drag tooltip position (called on mouse move during drag)
 * @param clientX - Mouse clientX coordinate
 * @param clientY - Mouse clientY coordinate
 */
export function updateDragTooltipPosition(
  clientX: number,
  clientY: number,
): void {
  if (tooltipState.visible) {
    tooltipState = {
      ...tooltipState,
      x: clientX + TOOLTIP_OFFSET_X,
      y: clientY + TOOLTIP_OFFSET_Y,
    };
  }
}

/**
 * Hide the drag tooltip
 */
export function hideDragTooltip(): void {
  tooltipState = {
    device: null,
    x: 0,
    y: 0,
    visible: false,
    categoryColor: "",
    uHeight: 1,
  };
}

/**
 * Get the current tooltip state (reactive)
 */
export function getDragTooltipState(): DragTooltipState {
  return tooltipState;
}
