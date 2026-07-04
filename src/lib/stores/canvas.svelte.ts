/**
 * Canvas Store
 * Manages panzoom instance and canvas state for zoom/pan functionality
 */

import type panzoom from "panzoom";
import { cubicOut } from "svelte/easing";
import type { Rack, RackGroup, DeviceType } from "$lib/types";
import {
  calculateFitAll,
  calculateRacksBoundingBox,
  ensureVisibleTransform,
  racksToPositions,
  racksToPositionsWithIds,
} from "$lib/utils/canvas";
import { canvasDebug } from "$lib/utils/debug";
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
import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
} from "$lib/utils/safe-storage";

// Panzoom constants
export const ZOOM_MIN = 0.25; // 25% - allows fitting 6+ large racks
export const ZOOM_MAX = 2; // 200%

// Round zoom levels the in/out buttons snap to, ascending from ZOOM_MIN to ZOOM_MAX
const ZOOM_LADDER = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

/**
 * Snap a zoom level to the next rung on the ladder in the given direction.
 * Stepping "in" returns the smallest rung strictly greater than current;
 * stepping "out" returns the largest rung strictly less than current.
 * On-rung values advance one rung. The result is clamped to ZOOM_MIN/ZOOM_MAX.
 */
export function snapZoom(current: number, direction: "in" | "out"): number {
  if (direction === "in") {
    const next = ZOOM_LADDER.find((rung) => rung > current);
    return next ?? ZOOM_MAX;
  }
  const prev = [...ZOOM_LADDER].reverse().find((rung) => rung < current);
  return prev ?? ZOOM_MIN;
}

const VIEWPORT_KEY = "Rackula:viewport";

type PanzoomInstance = ReturnType<typeof panzoom>;

// Module-level state
let panzoomInstance = $state<PanzoomInstance | null>(null);
let currentZoom = $state(1); // 1 = 100%
let canvasElement = $state<HTMLElement | null>(null);
let isPanning = $state(false);
let isZooming = $state(false);
// Bumped once at the start of each programmatic camera move so consumers that
// must follow camera motion (the verb bar overlay) re-measure. Covers the
// animated tween (smoothMoveTo and its callers: focusRack, zoomToDevice,
// ensureRacksVisible) and every direct viewport mutator (zoomIn, zoomOut,
// setZoom, resetZoom, moveTo, fitAll, restoreViewport). moveTo in particular
// fires no panstart/zoom event for programmatic calls, so the bump is required
// there; the zoom mutators also bump for a deterministic signal rather than
// relying on the transient isZooming window from the panzoom zoom event.
// Pan/zoom gestures are signalled separately via isInteracting.
let cameraMoveId = $state(0);
let zoomEndTimer: ReturnType<typeof setTimeout> | null = null;
let viewportSaveTimer: ReturnType<typeof setTimeout> | null = null;
let suppressViewportSave = false;

// Camera transition state. A single requestAnimationFrame loop interpolates the
// whole camera (x, y, and scale together) so every frame lands on one value; there
// is no separate zoom animation for the pan to drift against, and no stale timeout.
const CAMERA_ANIM_DURATION_MS = 300;
let cameraRafId: number | null = null;
let cameraAnim: {
  fromX: number;
  fromY: number;
  fromScale: number;
  toX: number;
  toY: number;
  toScale: number;
  startTime: number | null;
} | null = null;

// prefers-reduced-motion query, allocated once and reused so the check costs
// nothing per call. (svelte/motion's prefersReducedMotion captures matchMedia at
// import time, which cannot be re-stubbed per test; this local, resettable query
// keeps the gate testable while still allocating a single MediaQueryList.)
let reducedMotionQuery: MediaQueryList | null = null;

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
  isZooming = false;
  cameraMoveId = 0;
  cancelZoomEnd();
  cancelViewportSave();
  cancelCameraAnimation();
  reducedMotionQuery = null;
  suppressViewportSave = false;
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
    get isInteracting() {
      return isPanning || isZooming;
    },
    get cameraMoveId() {
      return cameraMoveId;
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
    ensureRacksVisible,
    focusRack,
    zoomToDevice,
    restoreViewport,
    clearSavedViewport,
  };
}

function scheduleViewportSave(): void {
  if (suppressViewportSave || !panzoomInstance) return;
  if (viewportSaveTimer) clearTimeout(viewportSaveTimer);
  viewportSaveTimer = setTimeout(() => {
    if (panzoomInstance) {
      const t = panzoomInstance.getTransform();
      canvasDebug.transform("viewport save: %o", {
        x: t.x,
        y: t.y,
        scale: t.scale,
      });
      safeSetItem(
        VIEWPORT_KEY,
        JSON.stringify({ x: t.x, y: t.y, scale: t.scale }),
      );
    }
    viewportSaveTimer = null;
  }, 500);
}

function cancelViewportSave(): void {
  if (viewportSaveTimer) {
    clearTimeout(viewportSaveTimer);
    viewportSaveTimer = null;
  }
}

function cancelZoomEnd(): void {
  if (zoomEndTimer) {
    clearTimeout(zoomEndTimer);
    zoomEndTimer = null;
  }
}

function clearSavedViewport(): void {
  cancelViewportSave();
  safeRemoveItem(VIEWPORT_KEY);
}

/**
 * Restore the saved viewport transform from localStorage.
 * Returns true if a saved viewport was found and applied.
 * Used on page load to resume where the user left off.
 */
function restoreViewport(): boolean {
  if (!panzoomInstance) return false;
  const raw = safeGetItem(VIEWPORT_KEY);
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw) as { x: number; y: number; scale: number };
    if (
      !Number.isFinite(saved.x) ||
      !Number.isFinite(saved.y) ||
      !Number.isFinite(saved.scale)
    ) {
      // Remove corrupted entry so future saves can work correctly
      safeRemoveItem(VIEWPORT_KEY);
      return false;
    }
    const scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, saved.scale));
    canvasDebug.transform("viewport restore: %o", {
      x: saved.x,
      y: saved.y,
      scale,
    });
    cameraMoveId++;
    cancelCameraAnimation();
    panzoomInstance.zoomAbs(0, 0, scale);
    panzoomInstance.moveTo(saved.x, saved.y);
    currentZoom = scale;
    return true;
  } catch {
    // Remove unparseable entry so it doesn't block future restores
    safeRemoveItem(VIEWPORT_KEY);
    return false;
  }
}

/**
 * Set the panzoom instance (called from Canvas component on mount)
 */
function setPanzoomInstance(instance: PanzoomInstance): void {
  panzoomInstance = instance;

  // Listen for zoom changes to keep state in sync, and debounce-save viewport
  instance.on("zoom", () => {
    const transform = instance.getTransform();
    currentZoom = transform.scale;
    // panzoom has no zoomstart/zoomend, so treat a burst of zoom events as one
    // gesture: flag it now and clear shortly after the last event. The verb bar
    // drops its live backdrop-filter while this is set to avoid per-frame blur
    // repaints.
    isZooming = true;
    if (zoomEndTimer) clearTimeout(zoomEndTimer);
    zoomEndTimer = setTimeout(() => {
      isZooming = false;
      zoomEndTimer = null;
    }, 140);
    scheduleViewportSave();
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
    scheduleViewportSave();
  });

  // Initialize currentZoom from panzoom
  const transform = instance.getTransform();
  currentZoom = transform.scale;
}

/**
 * Dispose panzoom instance (called from Canvas component on unmount)
 */
function disposePanzoom(): void {
  cancelViewportSave();
  cancelZoomEnd();
  cancelCameraAnimation();
  isZooming = false;
  if (panzoomInstance) {
    panzoomInstance.dispose();
    panzoomInstance = null;
  }
}

/**
 * Zoom in to the next ladder rung
 */
function zoomIn(): void {
  if (!panzoomInstance || currentZoom >= ZOOM_MAX) return;

  cameraMoveId++;
  cancelCameraAnimation();
  const newZoom = snapZoom(currentZoom, "in");
  const transform = panzoomInstance.getTransform();

  // Zoom centered on current view
  panzoomInstance.zoomAbs(transform.x, transform.y, newZoom);
}

/**
 * Zoom out to the next ladder rung
 */
function zoomOut(): void {
  if (!panzoomInstance || currentZoom <= ZOOM_MIN) return;

  cameraMoveId++;
  cancelCameraAnimation();
  const newZoom = snapZoom(currentZoom, "out");
  const transform = panzoomInstance.getTransform();

  panzoomInstance.zoomAbs(transform.x, transform.y, newZoom);
}

/**
 * Set zoom to specific level
 * @param scale - Zoom scale (1 = 100%)
 */
function setZoom(scale: number): void {
  if (!panzoomInstance) return;

  cameraMoveId++;
  cancelCameraAnimation();
  const clampedScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));
  const transform = panzoomInstance.getTransform();

  panzoomInstance.zoomAbs(transform.x, transform.y, clampedScale);
}

/**
 * Reset zoom to 100% and center
 */
function resetZoom(): void {
  if (!panzoomInstance) return;

  cameraMoveId++;
  cancelCameraAnimation();
  suppressViewportSave = true;
  clearSavedViewport();
  panzoomInstance.zoomAbs(0, 0, 1);
  panzoomInstance.moveTo(0, 0);
  suppressViewportSave = false;
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
  // Pure pan: programmatic moveTo fires no panstart/zoom event, so without
  // this bump the verb bar overlay would not re-measure after a moveTo.
  cameraMoveId++;
  cancelCameraAnimation();
  panzoomInstance.moveTo(x, y);
}

/**
 * Whether the user prefers reduced motion. The MediaQueryList is created once and
 * reused, so this costs nothing per call.
 */
function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  reducedMotionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return reducedMotionQuery.matches;
}

/** Stop the camera animation loop and drop its target. */
function cancelCameraAnimation(): void {
  if (cameraRafId !== null) {
    cancelAnimationFrame(cameraRafId);
    cameraRafId = null;
  }
  cameraAnim = null;
}

/**
 * One frame of the camera transition. Reads the interpolated (x, y, scale) and
 * applies zoomAbs at the origin (which scales the pan about (0,0)) then moveTo,
 * which overwrites the pan with the exact interpolated value. Every frame therefore
 * settles on one camera value with no drift.
 */
function stepCameraAnimation(now: number): void {
  cameraRafId = null;
  if (!panzoomInstance || !cameraAnim) return;

  cameraAnim.startTime ??= now;
  const elapsed = now - cameraAnim.startTime;
  const raw = Math.min(1, elapsed / CAMERA_ANIM_DURATION_MS);
  const eased = cubicOut(raw);

  const scale =
    cameraAnim.fromScale + (cameraAnim.toScale - cameraAnim.fromScale) * eased;
  const x = cameraAnim.fromX + (cameraAnim.toX - cameraAnim.fromX) * eased;
  const y = cameraAnim.fromY + (cameraAnim.toY - cameraAnim.fromY) * eased;

  panzoomInstance.zoomAbs(0, 0, scale);
  panzoomInstance.moveTo(x, y);

  if (raw < 1) {
    cameraRafId = requestAnimationFrame(stepCameraAnimation);
  } else {
    cameraAnim = null;
  }
}

/**
 * Smooth animated move to position with zoom.
 *
 * Interpolates x, y, and scale together in a single requestAnimationFrame loop.
 * Calling it again mid-animation retargets from the current camera (read live from
 * panzoom), so the previous target is discarded and never applied afterwards.
 */
function smoothMoveTo(x: number, y: number, scale: number): void {
  if (!panzoomInstance) return;

  // Wake consumers that follow camera motion (the verb bar overlay) for both
  // the animated tween and the reduced-motion instant landing below.
  cameraMoveId++;

  // Reduced motion: land the camera instantly, cancelling any in-flight transition.
  if (prefersReducedMotion()) {
    cancelCameraAnimation();
    panzoomInstance.zoomAbs(0, 0, scale);
    panzoomInstance.moveTo(x, y);
    return;
  }

  // Retarget from where the camera actually is now. Overwriting cameraAnim drops the
  // previous target (fixing the interruption race) and re-anchors the clock so the
  // ease blends smoothly from the current position.
  const current = panzoomInstance.getTransform();
  cameraAnim = {
    fromX: current.x,
    fromY: current.y,
    fromScale: current.scale,
    toX: x,
    toY: y,
    toScale: scale,
    startTime: null,
  };
  if (cameraRafId === null) {
    cameraRafId = requestAnimationFrame(stepCameraAnimation);
  }
}

/**
 * Set or clear the canvas container element (for viewport measurements)
 */
function setCanvasElement(element: HTMLElement | null): void {
  canvasElement = element;
}

/**
 * Fit all racks in the viewport
 * @param racks - Array of racks from the layout store
 * @param rackGroups - Array of rack groups (for bayed rack handling)
 * @param rightOffset - Optional offset for right-side overlay (e.g., drawer width)
 */
function fitAll(
  racks: Rack[],
  rackGroups: RackGroup[] = [],
  rightOffset: number = 0,
): void {
  if (!panzoomInstance || !canvasElement || racks.length === 0) return;

  cameraMoveId++;
  suppressViewportSave = true;
  cancelViewportSave();
  cancelCameraAnimation();

  // Get viewport dimensions, accounting for any right-side overlay
  const viewportWidth = canvasElement.clientWidth - rightOffset;
  const viewportHeight = canvasElement.clientHeight;

  // Convert racks to positions and calculate fit
  const rackPositions = racksToPositions(racks, rackGroups);
  const { zoom, panX, panY } = calculateFitAll(
    rackPositions,
    viewportWidth,
    viewportHeight,
  );

  canvasDebug.transform("fitAll viewport: %o", {
    width: viewportWidth,
    height: viewportHeight,
  });
  canvasDebug.transform("fitAll rack positions: %o", rackPositions);
  canvasDebug.transform("fitAll calculated: %o", { zoom, panX, panY });

  // Apply zoom and pan (instant - fitAll is typically called after viewport changes
  // where smooth animation would feel laggy or disorienting)
  panzoomInstance.zoomAbs(0, 0, zoom);
  panzoomInstance.moveTo(panX, panY);

  canvasDebug.transform("fitAll applied: %o", panzoomInstance.getTransform());

  suppressViewportSave = false;
}

/**
 * Ensure the given racks stay fully visible after a direct-manipulation commit
 * (resize release, keyboard resize step, or bay creation).
 *
 * Animates the camera by the minimum pan and zoom needed to bring the changed
 * extent on screen. When the extent already fits (an in-viewport resize, a
 * shrink, or an undo/redo that leaves it contained) the camera does not move.
 * Trigger this from the commit handlers, never from store mutations, so undo
 * and redo stay still.
 *
 * @param rackIds - IDs of the racks whose extent must stay visible (pass a
 *   bayed group's rack_ids to keep the whole group, including a new member,
 *   on screen)
 * @param allRacks - All racks from the layout store
 * @param rackGroups - All rack groups from the layout store (for bayed racks)
 * @param rightOffset - Optional offset for a right-side overlay (e.g., drawer)
 */
function ensureRacksVisible(
  rackIds: string[],
  allRacks: Rack[],
  rackGroups: RackGroup[] = [],
  rightOffset: number = 0,
): void {
  if (!panzoomInstance || !canvasElement || rackIds.length === 0) return;

  // Union the canvas positions of the target racks into a single extent. Bayed
  // group members share one position object, so any member resolves to the
  // whole group's bounding box.
  const targetIds = new Set(rackIds);
  const targetPositions = racksToPositionsWithIds(allRacks, rackGroups).filter(
    (pos) => pos.rackIds.some((id) => targetIds.has(id)),
  );
  if (targetPositions.length === 0) return;

  const target = calculateRacksBoundingBox(targetPositions);

  const viewportWidth = canvasElement.clientWidth - rightOffset;
  const viewportHeight = canvasElement.clientHeight;

  const current = panzoomInstance.getTransform();
  const next = ensureVisibleTransform(
    target,
    { width: viewportWidth, height: viewportHeight },
    { scale: current.scale, panX: current.x, panY: current.y },
  );

  // Already fully visible (contained, a shrink, or an undo/redo that leaves the
  // extent on screen): keep the camera still.
  if (
    next.scale === current.scale &&
    next.panX === current.x &&
    next.panY === current.y
  ) {
    return;
  }

  canvasDebug.transform("ensureRacksVisible: %o", { target, current, next });
  smoothMoveTo(next.panX, next.panY, next.scale);
}

/**
 * Focus on specific rack(s) by panning and zooming to fit them comfortably in the viewport.
 * Works for both individual racks and bayed rack groups.
 *
 * @param rackIds - Array of rack IDs to focus on (pass group rack_ids for bayed groups)
 * @param allRacks - All racks from the layout store (for looking up rack data)
 * @param rackGroups - All rack groups from the layout store (for bayed rack handling)
 * @param rightOffset - Optional offset for right-side overlay (e.g., drawer width)
 */
function focusRack(
  rackIds: string[],
  allRacks: Rack[],
  rackGroups: RackGroup[] = [],
  rightOffset: number = 0,
): void {
  if (!panzoomInstance || !canvasElement || rackIds.length === 0) return;

  // Filter to only the racks we want to focus on
  const targetRacks = allRacks.filter((r) => rackIds.includes(r.id));
  if (targetRacks.length === 0) return;

  // Find groups that contain ANY of the target racks
  // If focusing on a rack in a bayed group, we focus on the entire group
  const targetRackIdSet = new Set(rackIds);
  const relevantGroups = rackGroups.filter(
    (g) =>
      g.layout_preset === "bayed" &&
      g.rack_ids.some((id) => targetRackIdSet.has(id)),
  );

  // Collect all racks we need to focus on (including all racks in relevant bayed groups)
  // Use immutable Set construction instead of mutation
  const allRelevantRackIds = new Set([
    ...rackIds,
    ...relevantGroups.flatMap((g) => g.rack_ids),
  ]);
  const focusRacks = allRacks.filter((r) => allRelevantRackIds.has(r.id));

  // Get viewport dimensions, accounting for any right-side overlay
  const viewportWidth = canvasElement.clientWidth - rightOffset;
  const viewportHeight = canvasElement.clientHeight;

  // Calculate positions for ALL racks using the authoritative helper
  // This returns positions with rack IDs, enabling direct mapping
  const allPositionsWithIds = racksToPositionsWithIds(allRacks, rackGroups);

  // Build a lookup from rack ID to its canvas position
  // Note: All rack IDs in a bayed group map to the SAME position object reference
  // from allPositionsWithIds. This shared reference is intentional and relied upon
  // by the Set deduplication below.
  const rackIdToPosition: Record<string, (typeof allPositionsWithIds)[0]> = {};
  for (const pos of allPositionsWithIds) {
    for (const rid of pos.rackIds) {
      rackIdToPosition[rid] = pos;
    }
  }

  // Get the positions for only the racks we're focusing on
  // Deduplicate using Set: bayed racks share the same position object reference,
  // so Set correctly deduplicates them by reference equality. If positions are
  // ever deep-copied instead of shared, this deduplication would need to change
  // to use a different approach (e.g., comparing coordinates or using a Map).
  const rackPositions = [
    ...new Set(
      focusRacks
        .map((r) => rackIdToPosition[r.id])
        .filter((p): p is (typeof allPositionsWithIds)[0] => p !== undefined),
    ),
  ];

  canvasDebug.focus(
    "All %d racks -> %d positions",
    allRacks.length,
    allPositionsWithIds.length,
  );
  canvasDebug.focus("Focus rack positions: %o", rackPositions);

  const { zoom, panX, panY } = calculateFitAll(
    rackPositions,
    viewportWidth,
    viewportHeight,
  );

  canvasDebug.focus("Target rack IDs: %o", rackIds);
  canvasDebug.focus("Viewport: %o", {
    width: viewportWidth,
    height: viewportHeight,
  });
  canvasDebug.focus("Calculated: %o", { zoom, panX, panY });

  // Apply zoom and pan with smooth animation
  smoothMoveTo(panX, panY, zoom);
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

  canvasDebug.transform("zoomToDevice: %o", {
    deviceIndex,
    position: device.position,
    uHeight: deviceType.u_height,
    viewport: { width: viewportWidth, height: viewportHeight },
    calculated: { zoom, panX, panY },
  });

  // Apply zoom and pan
  smoothMoveTo(panX, panY, zoom);
}
