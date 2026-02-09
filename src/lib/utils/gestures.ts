/**
 * Touch Gesture Utilities
 * Composable gesture detection for touch interactions
 */

const DEFAULT_LONG_PRESS_DURATION = 500; // ms
const MOVE_THRESHOLD = 10; // px
export const RACK_SWIPE_MIN_DISTANCE = 50; // px
export const RACK_SWIPE_PAN_THRESHOLD = 20; // px
const DEFAULT_HORIZONTAL_DOMINANCE_RATIO = 1.5;
const DEFAULT_MAX_SWIPE_DURATION = 300; // ms

/**
 * Options for useLongPress
 */
export interface LongPressOptions {
  /** Duration in ms before triggering (default: 500) */
  duration?: number;
  /** Progress callback (0-1) called during hold */
  onProgress?: (progress: number) => void;
  /** Called when long press starts (pointerdown) */
  onStart?: (x: number, y: number) => void;
  /** Called when long press is cancelled */
  onCancel?: () => void;
}

/**
 * Direction for rack swipe navigation.
 */
export type RackSwipeDirection = "next" | "previous";

/**
 * Input for rack swipe gesture classification.
 */
export interface RackSwipeGestureInput {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs: number;
  isMultiTouch: boolean;
}

/**
 * Configuration for rack swipe gesture classification.
 */
export interface RackSwipeGestureOptions {
  minSwipeDistance?: number;
  panThreshold?: number;
  horizontalDominanceRatio?: number;
  maxSwipeDurationMs?: number;
}

/**
 * Classify a touch gesture as rack swipe navigation or non-swipe.
 * Returns `next`/`previous` only when a horizontal single-touch flick is detected.
 * Threshold order: multi-touch rejection -> vertical-pan rejection -> horizontal flick checks.
 */
export function classifyRackSwipeGesture(
  input: RackSwipeGestureInput,
  options: RackSwipeGestureOptions = {},
): RackSwipeDirection | null {
  if (input.isMultiTouch) {
    return null;
  }

  const minSwipeDistance = options.minSwipeDistance ?? RACK_SWIPE_MIN_DISTANCE;
  const panThreshold = options.panThreshold ?? RACK_SWIPE_PAN_THRESHOLD;
  const configuredDominanceRatio =
    options.horizontalDominanceRatio ?? DEFAULT_HORIZONTAL_DOMINANCE_RATIO;
  const horizontalDominanceRatio =
    configuredDominanceRatio > 0
      ? configuredDominanceRatio
      : DEFAULT_HORIZONTAL_DOMINANCE_RATIO;
  const verticalDominanceRatio = 1 / horizontalDominanceRatio;
  const maxSwipeDurationMs =
    options.maxSwipeDurationMs ?? DEFAULT_MAX_SWIPE_DURATION;

  const deltaX = input.endX - input.startX;
  const deltaY = input.endY - input.startY;
  const absDeltaX = Math.abs(deltaX);
  const absDeltaY = Math.abs(deltaY);
  const totalDistance = Math.hypot(deltaX, deltaY);
  const isHorizontalDominant = absDeltaX > absDeltaY * horizontalDominanceRatio;

  const isVerticalPan =
    totalDistance > panThreshold &&
    absDeltaY > absDeltaX * verticalDominanceRatio;

  if (isVerticalPan) {
    return null;
  }

  const isHorizontalFlick =
    absDeltaX >= minSwipeDistance &&
    isHorizontalDominant &&
    input.durationMs <= maxSwipeDurationMs;

  if (!isHorizontalFlick) {
    return null;
  }

  // Swipe left -> next rack, swipe right -> previous rack.
  return deltaX < 0 ? "next" : "previous";
}

/**
 * Add long-press gesture detection to an element
 * @param element - Target element
 * @param callback - Function to call on long-press
 * @param options - Configuration options
 * @returns Cleanup function to remove event listeners
 */
export function useLongPress(
  element: HTMLElement | SVGElement,
  callback: () => void,
  options: LongPressOptions | number = {},
): () => void {
  // Support legacy API: useLongPress(el, cb, duration)
  const opts: LongPressOptions =
    typeof options === "number" ? { duration: options } : options;
  const duration = opts.duration ?? DEFAULT_LONG_PRESS_DURATION;
  const { onProgress, onStart, onCancel } = opts;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let animationFrameId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let hasMoved = false;
  let isActive = false;
  let activePointerId: number | null = null;

  const cancelLongPress = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (isActive) {
      isActive = false;
      onCancel?.();
    }
    activePointerId = null;
  };

  const updateProgress = () => {
    if (!isActive || !onProgress) return;

    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    onProgress(progress);

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(updateProgress);
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    // Cancel active long press if a second pointer touches (pinch/zoom gesture).
    if (!e.isPrimary) {
      if (isActive) {
        cancelLongPress();
      }
      return;
    }

    // Defensive reset if a previous gesture somehow remained active.
    if (isActive) {
      cancelLongPress();
    }

    // Store initial position
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startTime = performance.now();
    hasMoved = false;
    isActive = true;

    // Notify start
    onStart?.(e.clientX, e.clientY);

    // Start progress updates
    if (onProgress) {
      onProgress(0);
      animationFrameId = requestAnimationFrame(updateProgress);
    }

    // Start timer
    timeoutId = setTimeout(() => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      // Ensure final progress is delivered before callback
      onProgress?.(1);

      isActive = false;
      activePointerId = null;
      callback();
      timeoutId = null;
    }, duration);
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    cancelLongPress();
  };

  const handlePointerCancel = (e: PointerEvent) => {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    cancelLongPress();
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    if (!timeoutId || hasMoved) return;

    // Calculate distance moved
    const deltaX = Math.abs(e.clientX - startX);
    const deltaY = Math.abs(e.clientY - startY);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Cancel if moved beyond threshold
    if (distance > MOVE_THRESHOLD) {
      hasMoved = true;
      cancelLongPress();
    }
  };

  // Attach event listeners
  element.addEventListener("pointerdown", handlePointerDown);
  element.addEventListener("pointerup", handlePointerUp);
  element.addEventListener("pointercancel", handlePointerCancel);
  element.addEventListener("pointermove", handlePointerMove);

  // Return cleanup function
  return () => {
    cancelLongPress();
    element.removeEventListener("pointerdown", handlePointerDown);
    element.removeEventListener("pointerup", handlePointerUp);
    element.removeEventListener("pointercancel", handlePointerCancel);
    element.removeEventListener("pointermove", handlePointerMove);
  };
}
