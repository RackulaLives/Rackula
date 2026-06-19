import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import type { ComponentProps } from "svelte";
import MobileBottomNav from "$lib/components/mobile/MobileBottomNav.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";

/**
 * Force the viewport store to report mobile so the self-guarded nav renders.
 * The store reads window.matchMedia on (re)initialisation.
 */
function setMobileViewport(isMobile: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) =>
      ({
        matches: isMobile,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  });
  resetViewportStore();
}

describe("MobileBottomNav", () => {
  let onLayouts: ReturnType<typeof vi.fn>;
  let onRacks: ReturnType<typeof vi.fn>;
  let onDevices: ReturnType<typeof vi.fn>;
  let onView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onLayouts = vi.fn();
    onRacks = vi.fn();
    onDevices = vi.fn();
    onView = vi.fn();
    setMobileViewport(true);
  });

  afterEach(() => {
    setMobileViewport(false);
  });

  function renderNav(
    overrides: Partial<ComponentProps<typeof MobileBottomNav>> = {},
  ) {
    return render(MobileBottomNav, {
      props: {
        onlayoutsclick: onLayouts,
        onracksclick: onRacks,
        ondevicesclick: onDevices,
        onviewclick: onView,
        ...overrides,
      },
    });
  }

  it("does not render when the viewport is not mobile", () => {
    setMobileViewport(false);
    renderNav();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("exposes the four mobile navigation tabs", () => {
    renderNav();
    expect(screen.getByRole("button", { name: "Layouts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Racks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Devices" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
  });

  it("fires only the Layouts callback when the Layouts tab is tapped", async () => {
    renderNav();
    await fireEvent.click(screen.getByRole("button", { name: "Layouts" }));
    expect(onLayouts).toHaveBeenCalledTimes(1);
    expect(onRacks).not.toHaveBeenCalled();
    expect(onDevices).not.toHaveBeenCalled();
    expect(onView).not.toHaveBeenCalled();
  });

  it("fires only the Racks callback when the Racks tab is tapped", async () => {
    renderNav();
    await fireEvent.click(screen.getByRole("button", { name: "Racks" }));
    expect(onRacks).toHaveBeenCalledTimes(1);
    expect(onLayouts).not.toHaveBeenCalled();
    expect(onDevices).not.toHaveBeenCalled();
    expect(onView).not.toHaveBeenCalled();
  });

  it("fires only the Devices callback when the Devices tab is tapped", async () => {
    renderNav();
    await fireEvent.click(screen.getByRole("button", { name: "Devices" }));
    expect(onDevices).toHaveBeenCalledTimes(1);
    expect(onLayouts).not.toHaveBeenCalled();
    expect(onRacks).not.toHaveBeenCalled();
    expect(onView).not.toHaveBeenCalled();
  });

  it("fires only the View callback when the View tab is tapped", async () => {
    renderNav();
    await fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onLayouts).not.toHaveBeenCalled();
    expect(onRacks).not.toHaveBeenCalled();
    expect(onDevices).not.toHaveBeenCalled();
  });

  it("marks the active tab with aria-current", () => {
    renderNav({ activeTab: "racks" });
    expect(screen.getByRole("button", { name: "Racks" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Layouts" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
