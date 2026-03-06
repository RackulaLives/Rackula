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

  it.each([
    {
      name: "text input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "text";
        return el;
      },
    },
    {
      name: "search input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "search";
        return el;
      },
    },
    {
      name: "tel input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "tel";
        return el;
      },
    },
    {
      name: "url input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "url";
        return el;
      },
    },
    {
      name: "email input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "email";
        return el;
      },
    },
    {
      name: "password input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "password";
        return el;
      },
    },
    {
      name: "number input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "number";
        return el;
      },
    },
    {
      name: "input with no type (defaults to text)",
      createElement: () => document.createElement("input"),
    },
    {
      name: "textarea",
      createElement: () => document.createElement("textarea"),
    },
    {
      name: "contentEditable element",
      createElement: () => {
        const editable = document.createElement("div");
        editable.tabIndex = -1;
        Object.defineProperty(editable, "isContentEditable", {
          value: true,
          configurable: true,
        });
        return editable;
      },
    },
  ])(
    "scrolls focused $name into view when keyboard is visible",
    ({ createElement }) => {
      const { viewport, getResizeHandler } = createMockVisualViewport();
      setVisualViewport(viewport as unknown as VisualViewport);

      const element = createElement();
      const scrollIntoView = vi.fn();
      element.scrollIntoView = scrollIntoView;
      element.getBoundingClientRect = vi.fn(() => ({
        x: 0,
        y: 700,
        width: 200,
        height: 80,
        top: 700,
        right: 200,
        bottom: 780,
        left: 0,
        toJSON: () => ({}),
      }));
      document.body.appendChild(element);
      element.focus();

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
      element.remove();
    },
  );

  it.each([
    {
      name: "select",
      createElement: () => document.createElement("select"),
    },
    {
      name: "button input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "button";
        return el;
      },
    },
    {
      name: "checkbox input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "checkbox";
        return el;
      },
    },
    {
      name: "color input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "color";
        return el;
      },
    },
    {
      name: "file input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "file";
        return el;
      },
    },
    {
      name: "hidden input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "hidden";
        return el;
      },
    },
    {
      name: "radio input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "radio";
        return el;
      },
    },
    {
      name: "range input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "range";
        return el;
      },
    },
    {
      name: "reset input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "reset";
        return el;
      },
    },
    {
      name: "submit input",
      createElement: () => {
        const el = document.createElement("input");
        el.type = "submit";
        return el;
      },
    },
  ])(
    "does not scroll focused $name into view",
    ({ createElement }) => {
      const { viewport, getResizeHandler } = createMockVisualViewport();
      setVisualViewport(viewport as unknown as VisualViewport);

      const element = createElement();
      const scrollIntoView = vi.fn();
      element.scrollIntoView = scrollIntoView;
      element.getBoundingClientRect = vi.fn(() => ({
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
      document.body.appendChild(element);
      element.focus();

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
      element.remove();
    },
  );
});
