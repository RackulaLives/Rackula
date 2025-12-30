/**
 * Touch Gesture Utilities
 * Composable gesture detection for touch interactions
 */

const DEFAULT_LONG_PRESS_DURATION = 500; // ms
const MOVE_THRESHOLD = 10; // px

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
 * Add long-press gesture detection to an element
 * @param element - Target element
 * @param callback - Function to call on long-press
 * @param options - Configuration options
 * @returns Cleanup function to remove event listeners
 */
export function useLongPress(
  element: HTMLElement,
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
    // Only handle primary pointer (ignore multi-touch)
    if (!e.isPrimary) return;

    // Store initial position
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

      // Trigger haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      isActive = false;
      callback();
      timeoutId = null;
    }, duration);
  };

  const handlePointerUp = () => {
    cancelLongPress();
  };

  const handlePointerCancel = () => {
    cancelLongPress();
  };

  const handlePointerMove = (e: PointerEvent) => {
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
