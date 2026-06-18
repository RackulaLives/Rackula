/**
 * Focus management utilities for dialogs and modals.
 * Provides focus trapping, focus restoration, and focus-first utilities.
 */

/**
 * Selector for all focusable elements that can receive focus via Tab key.
 * Excludes elements with tabindex="-1" and disabled elements.
 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([tabindex="-1"]), [href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

/**
 * Svelte action to trap focus within an element.
 * Used for dialogs and modals to prevent focus escaping.
 *
 * @example
 * <div use:trapFocus>
 *   <button>First</button>
 *   <button>Last</button>
 * </div>
 */
export function trapFocus(node: HTMLElement) {
  function getFocusableElements(): HTMLElement[] {
    return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== "Tab") return;

    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) return;

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift+Tab: if on first element, wrap to last
      if (document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable?.focus();
      }
    } else {
      // Tab: if on last element, wrap to first
      if (document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable?.focus();
      }
    }
  }

  node.addEventListener("keydown", handleKeyDown);

  return {
    destroy() {
      node.removeEventListener("keydown", handleKeyDown);
    },
  };
}

/**
 * Focus the first focusable element within a container.
 *
 * @param container - The container element to search within
 * @example
 * focusFirst(dialogElement); // Focuses first button/input in dialog
 */
export function focusFirst(container: HTMLElement): void {
  const focusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  focusable?.focus();
}

/**
 * Store and restore focus for modal management.
 * Useful for returning focus to the element that opened a dialog.
 *
 * @example
 * const focusManager = createFocusManager();
 *
 * // When opening dialog
 * focusManager.save();
 *
 * // When closing dialog
 * focusManager.restore();
 */
export function createFocusManager() {
  let previousFocus: HTMLElement | null = null;

  return {
    /**
     * Save the currently focused element.
     */
    save() {
      previousFocus = document.activeElement as HTMLElement;
    },

    /**
     * Restore focus to the previously saved element.
     * Clears the saved reference after restoring.
     */
    restore() {
      previousFocus?.focus();
      previousFocus = null;
    },
  };
}
