/**
 * Canvas Store
 * Manages panzoom instance and canvas state for zoom/pan functionality
 */

import type panzoom from "panzoom";
import type { Rack, RackGroup, DeviceType } from "$lib/types";
import { calculateFitAll, racksToPositions } from "$lib/utils/canvas";
import { debug } from "$lib/utils/debug";
import {
  U_HEIGHT_PX,
  BASE_RACK_WIDTH,
  RAIL_WIDTH,
  BASE_RACK_PADDING,
  RACK_ROW_PADDING,
  DUAL_VIEW_GAP,
  DUAL_VIEW_EXTRA_HEIGHT,
} from "$lib/constants/layout";
import { toHumanUnits } from "$lib/utils/position";

// Panzoom constants
export const ZOOM_MIN = 0.25; // 25% - allows fitting 6+ large racks
export const ZOOM_MAX = 2; // 200%
export const ZOOM_STEP = 0.25; // 25%

type PanzoomInstance = ReturnType<typeof panzoom>;

// Module-level state
let panzoomInstance = $state<PanzoomInstance | null>(null);
let currentZoom = $state(1); // 1 = 100%
let canvasElement = $state<HTMLElement | null>(null);
let isPanning = $state(false);

// Derived values
const canZoomIn = $derived(currentZoom < ZOOM_MAX);
const canZoomOut = $derived(currentZoom > ZOOM_MIN);
const zoomPercentage = $derived(Math.round(currentZoom * 100));

/**
 * Reset the store to initial state (primarily for testing)
 */
export function resetCanvasStore(): void {
  if (panzoomInstance) {
    panzoomInstance.dispose();
  }
  panzoomInstance = null;
  currentZoom = 1;
  canvasElement = null;
  isPanning = false;
}

/**
 * Get access to the Canvas store
 * @returns Store object with state and actions
 */
export function getCanvasStore() {
  return {
    // State getters
    get zoom() {
      return currentZoom;
    },
    get zoomPercentage() {
      return zoomPercentage;
    },
    get canZoomIn() {
      return canZoomIn;
    },
    get canZoomOut() {
      return canZoomOut;
    },
    get hasPanzoom() {
      return panzoomInstance !== null;
    },
    get isPanning() {
      return isPanning;
    },

    // Actions
    setPanzoomInstance,
    setCanvasElement,
    disposePanzoom,
    zoomIn,
    zoomOut,
    setZoom,
    resetZoom,
    getTransform,
    moveTo,
    smoothMoveTo,
    fitAll,
    zoomToDevice,
  };
}

/**
 * Set the panzoom instance (called from Canvas component on mount)
 */
function setPanzoomInstance(instance: PanzoomInstance): void {
  panzoomInstance = instance;

  // Listen for zoom changes to keep state in sync
  instance.on("zoom", () => {
    const transform = instance.getTransform();
    currentZoom = transform.scale;
  });

  // Track panning state to prevent accidental selection after pan
  instance.on("panstart", () => {
    isPanning = true;
  });
  instance.on("panend", () => {
    // Small delay to let click event fire first, then reset
    setTimeout(() => {
      isPanning = false;
    }, 50);
  });

  // Initialize currentZoom from panzoom
  const transform = instance.getTransform();
  currentZoom = transform.scale;
}

/**
 * Dispose panzoom instance (called from Canvas component on unmount)
 */
function disposePanzoom(): void {
  if (panzoomInstance) {
    panzoomInstance.dispose();
    panzoomInstance = null;
  }
}

/**
 * Zoom in by one step
 */
function zoomIn(): void {
  if (!panzoomInstance || currentZoom >= ZOOM_MAX) return;

  const newZoom = Math.min(currentZoom + ZOOM_STEP, ZOOM_MAX);
  const transform = panzoomInstance.getTransform();

  // Zoom centered on current view
  panzoomInstance.zoomAbs(transform.x, transform.y, newZoom);
}

/**
 * Zoom out by one step
 */
function zoomOut(): void {
  if (!panzoomInstance || currentZoom <= ZOOM_MIN) return;

  const newZoom = Math.max(currentZoom - ZOOM_STEP, ZOOM_MIN);
  const transform = panzoomInstance.getTransform();

  panzoomInstance.zoomAbs(transform.x, transform.y, newZoom);
}

/**
 * Set zoom to specific level
 * @param scale - Zoom scale (1 = 100%)
 */
function setZoom(scale: number): void {
  if (!panzoomInstance) return;

  const clampedScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));
  const transform = panzoomInstance.getTransform();

  panzoomInstance.zoomAbs(transform.x, transform.y, clampedScale);
}

/**
 * Reset zoom to 100% and center
 */
function resetZoom(): void {
  if (!panzoomInstance) return;

  panzoomInstance.zoomAbs(0, 0, 1);
  panzoomInstance.moveTo(0, 0);
}

/**
 * Get current transform state
 */
function getTransform(): { x: number; y: number; scale: number } {
  if (!panzoomInstance) {
    return { x: 0, y: 0, scale: 1 };
  }
  return panzoomInstance.getTransform();
}

/**
 * Move to specific position
 */
function moveTo(x: number, y: number): void {
  if (!panzoomInstance) return;
  panzoomInstance.moveTo(x, y);
}

/**
 * Smooth animated move to position with zoom
 */
function smoothMoveTo(x: number, y: number, scale: number): void {
  if (!panzoomInstance) return;

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // First apply zoom, then apply pan offset
  // Note: zoomAbs takes screen coords for zoom center, not pan offset
  // So we zoom at origin (0,0) then apply the pan
  if (prefersReducedMotion) {
    panzoomInstance.zoomAbs(0, 0, scale);
    panzoomInstance.moveTo(x, y);
  } else {
    // For smooth animation, we need to zoom then pan
    // Use smooth zoom at origin
    panzoomInstance.smoothZoomAbs(0, 0, scale);
    // Wait a tick for zoom to start, then move
    setTimeout(() => {
      if (panzoomInstance) {
        panzoomInstance.moveTo(x, y);
      }
    }, 0);
  }
}

/**
 * Set the canvas container element (for viewport measurements)
 */
function setCanvasElement(element: HTMLElement): void {
  canvasElement = element;
}

/**
 * Fit all racks in the viewport
 * @param racks - Array of racks from the layout store
 * @param rackGroups - Array of rack groups (for bayed rack handling)
 */
function fitAll(racks: Rack[], rackGroups: RackGroup[] = []): void {
  if (!panzoomInstance || !canvasElement || racks.length === 0) return;

  // Get viewport dimensions
  const viewportWidth = canvasElement.clientWidth;
  const viewportHeight = canvasElement.clientHeight;

  // Convert racks to positions and calculate fit
  const rackPositions = racksToPositions(racks, rackGroups);
  const { zoom, panX, panY } = calculateFitAll(
    rackPositions,
    viewportWidth,
    viewportHeight,
  );

  debug.group("Fit All Calculation");
  debug.log("Viewport:", { width: viewportWidth, height: viewportHeight });
  debug.log("Rack positions:", rackPositions);
  debug.log("Calculated:", { zoom, panX, panY });
  debug.log("Current transform before:", panzoomInstance.getTransform());
  debug.groupEnd();

  // Apply zoom and pan (instant - fitAll is typically called after viewport changes
  // where smooth animation would feel laggy or disorienting)
  panzoomInstance.zoomAbs(0, 0, zoom);
  panzoomInstance.moveTo(panX, panY);

  debug.log("Transform after fitAll:", panzoomInstance.getTransform());
}

/**
 * Zoom to a specific device in the rack (mobile auto-zoom)
 * @param rack - The rack containing the device
 * @param deviceIndex - Index of the device in the rack's devices array
 * @param deviceTypes - Array of device types from the layout
 */
function zoomToDevice(
  rack: Rack,
  deviceIndex: number,
  deviceTypes: DeviceType[],
): void {
  if (!panzoomInstance || !canvasElement) return;
  if (deviceIndex < 0 || deviceIndex >= rack.devices.length) return;

  const device = rack.devices[deviceIndex];
  if (!device) return;

  // Find device type to get u_height
  const deviceType = deviceTypes.find((dt) => dt.slug === device.device_type);
  if (!deviceType) return;

  // Calculate device position in SVG coordinates
  // Device Y position: from top of SVG viewBox
  // Convert device.position from internal units to human U
  const rackHeight = rack.height;
  const positionU = toHumanUnits(device.position);
  const deviceYInRack =
    (rackHeight - positionU - deviceType.u_height + 1) * U_HEIGHT_PX;
  const deviceHeight = deviceType.u_height * U_HEIGHT_PX;

  // Device absolute Y: includes rack padding, top rail, and dual-view extra height
  const deviceAbsY =
    RACK_ROW_PADDING +
    DUAL_VIEW_EXTRA_HEIGHT +
    BASE_RACK_PADDING +
    RAIL_WIDTH +
    deviceYInRack;

  // Device X position: centered between two rack views in dual-view mode
  const dualViewWidth = BASE_RACK_WIDTH * 2 + DUAL_VIEW_GAP;
  const deviceAbsX = RACK_ROW_PADDING + dualViewWidth / 2;

  // Get viewport dimensions
  const viewportWidth = canvasElement.clientWidth;
  const viewportHeight = canvasElement.clientHeight;

  // Target zoom: make device take up about 40% of viewport height
  const targetDeviceHeightRatio = 0.4;
  const targetZoom = Math.min(
    (viewportHeight * targetDeviceHeightRatio) / deviceHeight,
    ZOOM_MAX,
  );
  const zoom = Math.max(ZOOM_MIN, targetZoom);

  // Calculate pan to center device in viewport
  // Pan formula: deviceCenter * zoom - viewportCenter = panOffset
  const deviceCenterX = deviceAbsX;
  const deviceCenterY = deviceAbsY + deviceHeight / 2;

  // Invert panzoom transform: panOffset = viewportCenter - deviceCenter * zoom
  const panX = viewportWidth / 2 - deviceCenterX * zoom;
  const panY = viewportHeight / 2 - deviceCenterY * zoom;

  debug.group("Zoom to Device");
  debug.log("Device:", {
    index: deviceIndex,
    position: device.position,
    uHeight: deviceType.u_height,
  });
  debug.log("SVG coords:", {
    deviceYInRack,
    deviceHeight,
    deviceAbsX,
    deviceAbsY,
  });
  debug.log("Viewport:", { width: viewportWidth, height: viewportHeight });
  debug.log("Calculated:", { zoom, panX, panY });
  debug.groupEnd();

  // Apply zoom and pan
  smoothMoveTo(panX, panY, zoom);
}
