/**
 * Mobile keyboard viewport adaptation for bottom-positioned UI.
 *
 * Uses the visual viewport API when available to expose keyboard height as a
 * CSS custom property and keep focused inputs visible while typing.
 */

const KEYBOARD_HEIGHT_VAR = "--keyboard-height";
const DEFAULT_DEBOUNCE_MS = 80;
const DEFAULT_KEYBOARD_THRESHOLD_PX = 80;
const FOCUS_SCROLL_MARGIN_PX = 16;

export interface KeyboardViewportAdaptationOptions {
  isMobile: () => boolean;
  debounceMs?: number;
  keyboardThresholdPx?: number;
}

function setKeyboardHeight(heightPx: number): void {
  const normalized = Math.max(0, Math.round(heightPx));
  document.documentElement.style.setProperty(
    KEYBOARD_HEIGHT_VAR,
    `${normalized}px`,
  );
}

function isEditableElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;

  if (element instanceof HTMLInputElement) {
    return ![
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "range",
      "reset",
      "submit",
    ].includes(element.type);
  }

  return element instanceof HTMLTextAreaElement;
}

/**
 * Sets up mobile keyboard adaptation and returns a cleanup function.
 *
 * - Desktop: does not attach `visualViewport` listeners.
 * - Mobile + unsupported `visualViewport`: graceful no-op with 0px keyboard height.
 */
export function setupKeyboardViewportAdaptation(
  options: KeyboardViewportAdaptationOptions,
): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const keyboardThresholdPx =
    options.keyboardThresholdPx ?? DEFAULT_KEYBOARD_THRESHOLD_PX;

  let keyboardHeight = 0;
  let viewportListenerAttached = false;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let scrollFrameId: number | null = null;

  function updateKeyboardHeight(nextHeight: number): void {
    const normalized = Math.max(0, Math.round(nextHeight));
    if (normalized === keyboardHeight) return;
    keyboardHeight = normalized;
    setKeyboardHeight(normalized);
  }

  function getVisibleViewportBottom(): number {
    const viewport = window.visualViewport;
    if (viewport) {
      return viewport.height + viewport.offsetTop;
    }
    return window.innerHeight - keyboardHeight;
  }

  function maybeScrollFocusedInputIntoView(): void {
    const activeElement = document.activeElement;
    if (!isEditableElement(activeElement)) return;

    const rect = activeElement.getBoundingClientRect();
    const visibleBottom = getVisibleViewportBottom();
    if (rect.bottom <= visibleBottom - FOCUS_SCROLL_MARGIN_PX) return;

    activeElement.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  }

  function scheduleFocusedInputVisibilityCheck(): void {
    if (scrollFrameId !== null) {
      cancelAnimationFrame(scrollFrameId);
    }
    scrollFrameId = requestAnimationFrame(() => {
      scrollFrameId = null;
      maybeScrollFocusedInputIntoView();
    });
  }

  function measureAndApplyKeyboardHeight(): void {
    if (!options.isMobile()) {
      updateKeyboardHeight(0);
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      updateKeyboardHeight(0);
      return;
    }

    const rawKeyboardHeight = window.innerHeight - viewport.height;
    const nextKeyboardHeight =
      rawKeyboardHeight > keyboardThresholdPx ? rawKeyboardHeight : 0;
    updateKeyboardHeight(nextKeyboardHeight);

    if (nextKeyboardHeight > 0) {
      scheduleFocusedInputVisibilityCheck();
    }
  }

  function handleViewportResize(): void {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      measureAndApplyKeyboardHeight();
    }, debounceMs);
  }

  function enableViewportListener(): void {
    const viewport = window.visualViewport;
    if (!viewport || viewportListenerAttached) return;

    viewport.addEventListener("resize", handleViewportResize);
    viewportListenerAttached = true;
    measureAndApplyKeyboardHeight();
  }

  function disableViewportListener(): void {
    const viewport = window.visualViewport;
    if (viewport && viewportListenerAttached) {
      viewport.removeEventListener("resize", handleViewportResize);
    }
    viewportListenerAttached = false;
    updateKeyboardHeight(0);
  }

  function syncViewportListenerState(): void {
    if (options.isMobile()) {
      enableViewportListener();
    } else {
      disableViewportListener();
    }
  }

  function handleWindowResize(): void {
    syncViewportListenerState();
    if (options.isMobile()) {
      handleViewportResize();
    }
  }

  function handleFocusIn(event: FocusEvent): void {
    if (!options.isMobile() || keyboardHeight <= 0) return;
    if (!isEditableElement(event.target as Element | null)) return;
    scheduleFocusedInputVisibilityCheck();
  }

  setKeyboardHeight(0);
  syncViewportListenerState();

  window.addEventListener("resize", handleWindowResize);
  document.addEventListener("focusin", handleFocusIn, true);

  return () => {
    window.removeEventListener("resize", handleWindowResize);
    document.removeEventListener("focusin", handleFocusIn, true);
    disableViewportListener();

    if (resizeTimer) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }

    if (scrollFrameId !== null) {
      cancelAnimationFrame(scrollFrameId);
      scrollFrameId = null;
    }

    setKeyboardHeight(0);
  };
}
