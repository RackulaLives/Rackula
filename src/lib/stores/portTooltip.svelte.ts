/**
 * Port Tooltip Store
 *
 * Global state for managing port tooltip visibility and content.
 * Used by PortIndicators to show tooltips and App to render them.
 */

import type { InterfaceTemplate } from "$lib/types";

/** Port tooltip state */
export interface PortTooltipState {
  port: InterfaceTemplate | null;
  x: number;
  y: number;
  visible: boolean;
}

/** Port tooltip store singleton */
let tooltipState = $state<PortTooltipState>({
  port: null,
  x: 0,
  y: 0,
  visible: false,
});

/**
 * Show the port tooltip at the specified position
 */
export function showPortTooltip(
  port: InterfaceTemplate,
  x: number,
  y: number,
): void {
  tooltipState = {
    port,
    x,
    y,
    visible: true,
  };
}

/**
 * Hide the port tooltip
 */
export function hidePortTooltip(): void {
  tooltipState = {
    ...tooltipState,
    visible: false,
  };
}

/**
 * Get the current tooltip state (reactive)
 */
export function getPortTooltipState(): PortTooltipState {
  return tooltipState;
}
