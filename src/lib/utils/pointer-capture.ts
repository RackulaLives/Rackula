/**
 * Pointer capture utility for cross-browser resize handle compatibility.
 *
 * Firefox has known issues where mouse events during drag operations can be
 * interrupted or "stuck" when the pointer leaves and re-enters the element
 * boundaries. This is due to Firefox's native drag-and-drop detection
 * interfering with standard mouse events.
 *
 * Using setPointerCapture ensures the element continues receiving all pointer
 * events for the duration of the drag operation, regardless of where the
 * pointer moves on screen.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
 * @see https://bugzilla.mozilla.org/show_bug.cgi?id=43258
 */
import type { Action } from "svelte/action";
import Debug from "debug";

const debug = Debug("rackula:utils:pointer-capture");

/**
 * Svelte action that enables pointer capture on pointerdown for resize handles.
 *
 * This action listens for pointerdown events and captures the pointer to ensure
 * all subsequent pointer events (pointermove, pointerup, etc.) are directed to
 * this element until the pointer is released. This fixes resize handle
 * "sticking" issues in Firefox.
 *
 * The pointer capture is automatically released when:
 * - pointerup fires
 * - pointercancel fires
 * - The element is removed from the DOM
 *
 * @example
 * ```svelte
 * <div use:pointerCapture class="resize-handle">
 * ```
 */
export const pointerCapture: Action<HTMLElement> = (node) => {
  const handlePointerDown = (event: PointerEvent) => {
    // Only capture primary pointer (left mouse button or first touch)
    if (!event.isPrimary) return;

    // Set pointer capture to ensure we receive all subsequent events
    // This is the key fix for Firefox's drag event interference
    try {
      node.setPointerCapture(event.pointerId);
      debug("captured pointer %d", event.pointerId);
    } catch (error) {
      // setPointerCapture may fail if pointer is already captured elsewhere
      // Log for debugging but don't throw as this is a progressive enhancement
      debug("failed to capture pointer %d: %O", event.pointerId, error);
    }
  };

  // Listen for pointerdown to initiate capture
  node.addEventListener("pointerdown", handlePointerDown);

  return {
    destroy() {
      node.removeEventListener("pointerdown", handlePointerDown);
    },
  };
};
