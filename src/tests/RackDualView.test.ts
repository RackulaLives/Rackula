import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import RackDualView from "$lib/components/RackDualView.svelte";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { createTestRack, createTestDeviceLibrary } from "./factories";

describe("RackDualView Component", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetCanvasStore();
    getLayoutStore().markStarted();
  });

  describe("Container Structure", () => {
    it("renders a container with class rack-dual-view", () => {
      const rack = createTestRack();
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const dualView = container.querySelector(".rack-dual-view");
      expect(dualView).toBeInTheDocument();
    });

    it("contains two rack views with classes rack-front and rack-rear", () => {
      const rack = createTestRack();
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const frontView = container.querySelector(".rack-front");
      const rearView = container.querySelector(".rack-rear");
      expect(frontView).toBeInTheDocument();
      expect(rearView).toBeInTheDocument();
    });
  });

  describe("Rack Name", () => {
    it("displays the rack name once, centered above both views", () => {
      const rack = createTestRack({ name: "My Server Rack" });
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      // Should have exactly one visible rack name in the dual-view container
      // (The individual Rack components' names are hidden via CSS)
      const dualViewName = container.querySelector(".rack-dual-view-name");
      expect(dualViewName).toBeInTheDocument();
      expect(dualViewName?.textContent).toBe("My Server Rack");
    });

    it("rack name has correct class for styling", () => {
      const rack = createTestRack({ name: "Test Rack" });
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const rackName = container.querySelector(".rack-dual-view-name");
      expect(rackName).toBeInTheDocument();
      expect(rackName?.textContent).toBe("Test Rack");
    });
  });

  describe("View Labels", () => {
    it("shows FRONT label above the front view", () => {
      const rack = createTestRack();
      render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      expect(screen.getByText("FRONT")).toBeInTheDocument();
    });

    it("shows REAR label above the rear view", () => {
      const rack = createTestRack();
      render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      expect(screen.getByText("REAR")).toBeInTheDocument();
    });

    it("labels have correct class for styling", () => {
      const rack = createTestRack();
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const labels = container.querySelectorAll(".rack-view-label");
      expect(labels).toHaveLength(2);
    });
  });

  describe("Selection State", () => {
    it("applies aria-selected=true to container when selected", () => {
      const rack = createTestRack();
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: true,
        },
      });

      const dualView = container.querySelector(".rack-dual-view");
      expect(dualView?.getAttribute("aria-selected")).toBe("true");
    });

    it("applies aria-selected=false to container when not selected", () => {
      const rack = createTestRack();
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const dualView = container.querySelector(".rack-dual-view");
      expect(dualView?.getAttribute("aria-selected")).toBe("false");
    });

    it("has selected class when selected=true", () => {
      const rack = createTestRack();
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: true,
        },
      });

      const dualView = container.querySelector(".rack-dual-view");
      expect(dualView).toHaveClass("selected");
    });
  });

  describe("Events", () => {
    it("dispatches select event when front view is clicked", async () => {
      const rack = createTestRack();
      const handleSelect = vi.fn();

      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
          onselect: handleSelect,
        },
      });

      // Click on the SVG inside the front view to trigger selection
      const frontViewSvg = container.querySelector(".rack-front svg");
      await fireEvent.click(frontViewSvg!);

      expect(handleSelect).toHaveBeenCalledTimes(1);
      expect(handleSelect.mock.calls[0]![0].detail.rackId).toBe("rack-0");
    });

    it("dispatches select event when rear view is clicked", async () => {
      const rack = createTestRack();
      const handleSelect = vi.fn();

      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
          onselect: handleSelect,
        },
      });

      // Click on the SVG inside the rear view to trigger selection
      const rearViewSvg = container.querySelector(".rack-rear svg");
      await fireEvent.click(rearViewSvg!);

      expect(handleSelect).toHaveBeenCalledTimes(1);
      expect(handleSelect.mock.calls[0]![0].detail.rackId).toBe("rack-0");
    });
  });

  describe("Device Display", () => {
    it("shows half-depth front-face devices only in front view", () => {
      const rack = createTestRack({
        // half-depth-device is half-depth, so it should only appear on its face
        devices: [
          { device_type: "half-depth-device", position: 1, face: "front" },
        ],
      });
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const frontView = container.querySelector(".rack-front");
      const rearView = container.querySelector(".rack-rear");

      // Half-depth device should only be in front view
      const frontDevices = frontView?.querySelectorAll(".rack-device");
      const rearDevices = rearView?.querySelectorAll(".rack-device");

      expect(frontDevices?.length).toBe(1);
      expect(rearDevices?.length).toBe(0);
    });

    it("respects face override even for full-depth devices (Issue #383)", () => {
      const rack = createTestRack({
        // server-1 is full-depth, but face is explicitly set to "front"
        // The face field is the source of truth - device should only show on front
        devices: [{ device_type: "server-1", position: 1, face: "front" }],
      });
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const frontView = container.querySelector(".rack-front");
      const rearView = container.querySelector(".rack-rear");

      // Full-depth device with face="front" should only be visible in front view
      const frontDevices = frontView?.querySelectorAll(".rack-device");
      const rearDevices = rearView?.querySelectorAll(".rack-device");

      expect(frontDevices?.length).toBe(1);
      expect(rearDevices?.length).toBe(0); // Should NOT show on rear
    });

    it("shows full-depth devices with face='both' in both views", () => {
      const rack = createTestRack({
        // server-1 is full-depth with face="both" (the default), should be visible from both sides
        devices: [{ device_type: "server-1", position: 1, face: "both" }],
      });
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const frontView = container.querySelector(".rack-front");
      const rearView = container.querySelector(".rack-rear");

      // Full-depth device with face="both" should be visible in both views
      const frontDevices = frontView?.querySelectorAll(".rack-device");
      const rearDevices = rearView?.querySelectorAll(".rack-device");

      expect(frontDevices?.length).toBe(1);
      expect(rearDevices?.length).toBe(1);
    });

    it("shows rear-face devices only in rear view", () => {
      const rack = createTestRack({
        devices: [
          { device_type: "half-depth-device", position: 1, face: "rear" },
        ],
      });
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const frontView = container.querySelector(".rack-front");
      const rearView = container.querySelector(".rack-rear");

      const frontDevices = frontView?.querySelectorAll(".rack-device");
      const rearDevices = rearView?.querySelectorAll(".rack-device");

      expect(frontDevices?.length).toBe(0);
      expect(rearDevices?.length).toBe(1);
    });

    it("shows both-face devices in both views", () => {
      const rack = createTestRack({
        devices: [{ device_type: "server-1", position: 1, face: "both" }],
      });
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const frontView = container.querySelector(".rack-front");
      const rearView = container.querySelector(".rack-rear");

      const frontDevices = frontView?.querySelectorAll(".rack-device");
      const rearDevices = rearView?.querySelectorAll(".rack-device");

      expect(frontDevices?.length).toBe(1);
      expect(rearDevices?.length).toBe(1);
    });
  });

  describe("Accessibility", () => {
    it("has appropriate aria-label on container", () => {
      const rack = createTestRack({ name: "Server Rack" });
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const dualView = container.querySelector(".rack-dual-view");
      expect(dualView?.getAttribute("aria-label")).toContain("Server Rack");
    });

    it("has tabindex for keyboard focus", () => {
      const rack = createTestRack();
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const dualView = container.querySelector(".rack-dual-view");
      expect(dualView?.getAttribute("tabindex")).toBe("0");
    });

    it("dispatches select on Enter key", async () => {
      const rack = createTestRack();
      const handleSelect = vi.fn();

      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
          onselect: handleSelect,
        },
      });

      const dualView = container.querySelector(".rack-dual-view");
      await fireEvent.keyDown(dualView!, { key: "Enter" });

      expect(handleSelect).toHaveBeenCalledTimes(1);
    });

    it("dispatches select on Space key", async () => {
      const rack = createTestRack();
      const handleSelect = vi.fn();

      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
          onselect: handleSelect,
        },
      });

      const dualView = container.querySelector(".rack-dual-view");
      await fireEvent.keyDown(dualView!, { key: " " });

      expect(handleSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe("Layout", () => {
    it("both views have the same visual height", () => {
      const rack = createTestRack({ height: 12 });
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const frontView = container.querySelector(".rack-front svg");
      const rearView = container.querySelector(".rack-rear svg");

      // Both SVGs should have same viewBox height
      const frontViewBox = frontView?.getAttribute("viewBox");
      const rearViewBox = rearView?.getAttribute("viewBox");

      expect(frontViewBox).toBe(rearViewBox);
    });
  });

  describe("Long Press", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not render long-press-active class when enableLongPress is false", () => {
      const rack = createTestRack();
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
          enableLongPress: false,
        },
      });

      const dualView = container.querySelector(".rack-dual-view");
      expect(dualView).not.toHaveClass("long-press-active");
    });

    it("has container element reference for long press gesture", () => {
      const rack = createTestRack();
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
          enableLongPress: true,
          onlongpress: vi.fn(),
        },
      });

      const dualView = container.querySelector(".rack-dual-view");
      expect(dualView).toBeInTheDocument();
    });

    it("exposes --long-press-progress CSS variable", () => {
      const rack = createTestRack();
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
          enableLongPress: true,
          onlongpress: vi.fn(),
        },
      });

      const dualView = container.querySelector(
        ".rack-dual-view",
      ) as HTMLElement;
      // The CSS variable should be set (initial value of 0)
      expect(dualView.style.getPropertyValue("--long-press-progress")).toBe(
        "0",
      );
    });

    it("fires onlongpress callback after 500ms hold", async () => {
      const rack = createTestRack();
      const handleLongPress = vi.fn();
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
          enableLongPress: true,
          onlongpress: handleLongPress,
        },
      });

      const dualView = container.querySelector(".rack-dual-view")!;

      // Simulate pointer down with isPrimary (required for gesture)
      await fireEvent.pointerDown(dualView, { isPrimary: true });

      // Should not fire before 500ms
      vi.advanceTimersByTime(499);
      expect(handleLongPress).not.toHaveBeenCalled();

      // Should fire after 500ms
      vi.advanceTimersByTime(1);
      expect(handleLongPress).toHaveBeenCalledTimes(1);
    });

    it("cancels long press when pointer moves beyond threshold", async () => {
      const rack = createTestRack();
      const handleLongPress = vi.fn();
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
          enableLongPress: true,
          onlongpress: handleLongPress,
        },
      });

      const dualView = container.querySelector(".rack-dual-view")!;

      // Start press at origin
      await fireEvent.pointerDown(dualView, {
        isPrimary: true,
        clientX: 0,
        clientY: 0,
      });

      // Move beyond 10px threshold
      await fireEvent.pointerMove(dualView, {
        clientX: 15,
        clientY: 0,
      });

      // Advance past duration - should NOT fire due to movement
      vi.advanceTimersByTime(500);
      expect(handleLongPress).not.toHaveBeenCalled();
    });

    it("cancels long press when pointer released early", async () => {
      const rack = createTestRack();
      const handleLongPress = vi.fn();
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
          enableLongPress: true,
          onlongpress: handleLongPress,
        },
      });

      const dualView = container.querySelector(".rack-dual-view")!;

      await fireEvent.pointerDown(dualView, { isPrimary: true });
      vi.advanceTimersByTime(200);

      // Release early
      await fireEvent.pointerUp(dualView);

      // Advance past remaining duration - should NOT fire
      vi.advanceTimersByTime(300);
      expect(handleLongPress).not.toHaveBeenCalled();
    });
  });

  describe("Single View Mode", () => {
    it("only renders front view when show_rear is false", () => {
      const rack = createTestRack({ show_rear: false });
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const frontView = container.querySelector(".rack-front");
      const rearView = container.querySelector(".rack-rear");

      expect(frontView).toBeInTheDocument();
      expect(rearView).not.toBeInTheDocument();
    });

    it("has single-view class on container when show_rear is false", () => {
      const rack = createTestRack({ show_rear: false });
      const { container } = render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      const dualViewContainer = container.querySelector(
        ".rack-dual-view-container",
      );
      expect(dualViewContainer).toHaveClass("single-view");
    });

    it("does not show FRONT label in single view mode", () => {
      const rack = createTestRack({ show_rear: false });
      render(RackDualView, {
        props: {
          rack,
          deviceLibrary: createTestDeviceLibrary(),
          selected: false,
        },
      });

      // In single view mode, the FRONT label should not be shown
      expect(screen.queryByText("FRONT")).not.toBeInTheDocument();
    });
  });
});
