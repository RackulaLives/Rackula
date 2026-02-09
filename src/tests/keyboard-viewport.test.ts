import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupKeyboardViewportAdaptation } from "$lib/utils/keyboard-viewport";

type MockViewportHandler = (event: Event) => void;

interface MockVisualViewport {
  height: number;
  offsetTop: number;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function setInnerHeight(value: number): void {
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value,
  });
}

function setVisualViewport(value: VisualViewport | undefined): void {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    writable: true,
    value,
  });
}

function createMockVisualViewport(): {
  viewport: MockVisualViewport;
  getResizeHandler: () => MockViewportHandler;
} {
  let resizeHandler: MockViewportHandler | null = null;

  const viewport: MockVisualViewport = {
    height: 900,
    offsetTop: 0,
    addEventListener: vi.fn((event: string, handler: MockViewportHandler) => {
      if (event === "resize") {
        resizeHandler = handler;
      }
    }),
    removeEventListener: vi.fn(),
  };

  return {
    viewport,
    getResizeHandler: () => {
      if (!resizeHandler) {
        throw new Error("Resize handler not registered");
      }
      return resizeHandler;
    },
  };
}

describe("keyboard viewport adaptation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(performance.now());
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    setInnerHeight(900);
    document.documentElement.style.removeProperty("--keyboard-height");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.documentElement.style.removeProperty("--keyboard-height");
  });

  it("sets --keyboard-height when visual viewport shrinks on mobile", () => {
    const { viewport, getResizeHandler } = createMockVisualViewport();
    setVisualViewport(viewport as unknown as VisualViewport);

    const cleanup = setupKeyboardViewportAdaptation({
      isMobile: () => true,
      debounceMs: 0,
      keyboardThresholdPx: 0,
    });

    viewport.height = 640;
    const resizeHandler = getResizeHandler();
    resizeHandler(new Event("resize"));
    vi.runAllTimers();

    expect(
      document.documentElement.style.getPropertyValue("--keyboard-height"),
    ).toBe("260px");

    cleanup();
  });

  it("keeps --keyboard-height at 0px when visualViewport is unavailable", () => {
    setVisualViewport(undefined);

    const cleanup = setupKeyboardViewportAdaptation({
      isMobile: () => true,
    });

    expect(
      document.documentElement.style.getPropertyValue("--keyboard-height"),
    ).toBe("0px");

    cleanup();
  });

  it("does not register visual viewport listeners on desktop", () => {
    const { viewport } = createMockVisualViewport();
    setVisualViewport(viewport as unknown as VisualViewport);

    const cleanup = setupKeyboardViewportAdaptation({
      isMobile: () => false,
    });

    expect(viewport.addEventListener).not.toHaveBeenCalled();
    expect(
      document.documentElement.style.getPropertyValue("--keyboard-height"),
    ).toBe("0px");

    cleanup();
  });

  it("scrolls focused input into view when keyboard is visible", () => {
    const { viewport, getResizeHandler } = createMockVisualViewport();
    setVisualViewport(viewport as unknown as VisualViewport);

    const input = document.createElement("input");
    const scrollIntoView = vi.fn();
    input.scrollIntoView = scrollIntoView;
    input.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 700,
      width: 200,
      height: 32,
      top: 700,
      right: 200,
      bottom: 732,
      left: 0,
      toJSON: () => ({}),
    }));
    document.body.appendChild(input);
    input.focus();

    const cleanup = setupKeyboardViewportAdaptation({
      isMobile: () => true,
      debounceMs: 0,
      keyboardThresholdPx: 0,
    });

    viewport.height = 560;
    const resizeHandler = getResizeHandler();
    resizeHandler(new Event("resize"));
    vi.runAllTimers();

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });

    cleanup();
    input.remove();
  });

  it("does not scroll focused select elements into view", () => {
    const { viewport, getResizeHandler } = createMockVisualViewport();
    setVisualViewport(viewport as unknown as VisualViewport);

    const select = document.createElement("select");
    const scrollIntoView = vi.fn();
    select.scrollIntoView = scrollIntoView;
    select.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 700,
      width: 200,
      height: 32,
      top: 700,
      right: 200,
      bottom: 732,
      left: 0,
      toJSON: () => ({}),
    }));
    document.body.appendChild(select);
    select.focus();

    const cleanup = setupKeyboardViewportAdaptation({
      isMobile: () => true,
      debounceMs: 0,
      keyboardThresholdPx: 0,
    });

    viewport.height = 560;
    const resizeHandler = getResizeHandler();
    resizeHandler(new Event("resize"));
    vi.runAllTimers();

    expect(scrollIntoView).not.toHaveBeenCalled();

    cleanup();
    select.remove();
  });
});
