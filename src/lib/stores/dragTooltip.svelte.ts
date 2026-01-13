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
}

/** Offset from cursor to prevent tooltip from obscuring drop target */
const TOOLTIP_OFFSET_X = 16;
const TOOLTIP_OFFSET_Y = -8;

/** Drag tooltip store singleton */
let tooltipState = $state<DragTooltipState>({
  device: null,
  x: 0,
  y: 0,
  visible: false,
});

/**
 * Show the drag tooltip at the specified cursor position
 * @param device - The device being dragged
 * @param clientX - Mouse clientX coordinate
 * @param clientY - Mouse clientY coordinate
 */
export function showDragTooltip(
  device: DeviceType,
  clientX: number,
  clientY: number,
): void {
  tooltipState = {
    device,
    x: clientX + TOOLTIP_OFFSET_X,
    y: clientY + TOOLTIP_OFFSET_Y,
    visible: true,
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
  };
}

/**
 * Get the current tooltip state (reactive)
 */
export function getDragTooltipState(): DragTooltipState {
  return tooltipState;
}
