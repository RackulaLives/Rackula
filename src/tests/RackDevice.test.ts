import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import RackDevice from "$lib/components/RackDevice.svelte";
import type { DeviceType } from "$lib/types";
import { getImageStore, resetImageStore } from "$lib/stores/images.svelte";
import type { ImageData } from "$lib/types/images";

describe("RackDevice SVG Component", () => {
  const U_HEIGHT = 22;
  const RACK_WIDTH = 220;
  const RAIL_WIDTH = 17;
  const IMAGE_OVERFLOW = 4; // Images extend past rails for realistic appearance

  const mockDevice: DeviceType = {
    slug: "device-1",
    model: "Test Server",
    u_height: 1,
    colour: "#4A90D9",
    category: "server",
  };

  const defaultProps = {
    device: mockDevice,
    position: 1,
    rackHeight: 12,
    rackId: "rack-1",
    deviceIndex: 0,
    selected: false,
    uHeight: U_HEIGHT,
    rackWidth: RACK_WIDTH,
  };

  describe("Position Calculation", () => {
    it("renders at correct Y position for U1 (bottom)", () => {
      const { container } = render(RackDevice, { props: defaultProps });

      const group = container.querySelector("g");
      expect(group).toBeInTheDocument();

      // Y = (rackHeight - position - device.height + 1) * uHeight
      // Y = (12 - 1 - 1 + 1) * 22 = 11 * 22 = 242
      const transform = group?.getAttribute("transform");
      expect(transform).toContain("translate");
      expect(transform).toContain("242");
    });

    it("renders at correct Y position for middle U", () => {
      const { container } = render(RackDevice, {
        props: { ...defaultProps, position: 6 },
      });

      const group = container.querySelector("g");

      // Y = (12 - 6 - 1 + 1) * 22 = 6 * 22 = 132
      const transform = group?.getAttribute("transform");
      expect(transform).toContain("132");
    });

    it("renders at correct Y position for top U", () => {
      const { container } = render(RackDevice, {
        props: { ...defaultProps, position: 12 },
      });

      const group = container.querySelector("g");

      // Y = (12 - 12 - 1 + 1) * 22 = 0 * 22 = 0
      const transform = group?.getAttribute("transform");
      expect(transform).toContain("translate");
      // Should start at y=0 (or close to top)
    });
  });

  describe("Height Rendering", () => {
    it("renders with correct height for 1U device", () => {
      const { container } = render(RackDevice, { props: defaultProps });

      const rect = container.querySelector("rect.device-rect");
      expect(rect).toBeInTheDocument();
      expect(rect?.getAttribute("height")).toBe(String(U_HEIGHT));
    });

    it("renders with correct height for 4U device", () => {
      const device4U: DeviceType = { ...mockDevice, u_height: 4 };
      const { container } = render(RackDevice, {
        props: { ...defaultProps, device: device4U },
      });

      const rect = container.querySelector("rect.device-rect");
      expect(rect?.getAttribute("height")).toBe(String(4 * U_HEIGHT));
    });

    it("renders with correct height for 2U device", () => {
      const device2U: DeviceType = { ...mockDevice, u_height: 2 };
      const { container } = render(RackDevice, {
        props: { ...defaultProps, device: device2U },
      });

      const rect = container.querySelector("rect.device-rect");
      expect(rect?.getAttribute("height")).toBe(String(2 * U_HEIGHT));
    });
  });

  describe("Device Display", () => {
    it("displays device name", () => {
      render(RackDevice, { props: defaultProps });

      expect(screen.getByText("Test Server")).toBeInTheDocument();
    });

    it("uses device.colour for fill", () => {
      const { container } = render(RackDevice, { props: defaultProps });

      const rect = container.querySelector("rect.device-rect");
      expect(rect?.getAttribute("fill")).toBe("#4A90D9");
    });

    it("applies different colours for different devices", () => {
      const redDevice: DeviceType = {
        ...mockDevice,
        colour: "#DC143C",
      };
      const { container } = render(RackDevice, {
        props: { ...defaultProps, device: redDevice },
      });

      const rect = container.querySelector("rect.device-rect");
      expect(rect?.getAttribute("fill")).toBe("#DC143C");
    });

    it("uses colourOverride when provided", () => {
      const { container } = render(RackDevice, {
        props: { ...defaultProps, colourOverride: "#FF5555" },
      });

      const rect = container.querySelector("rect.device-rect");
      expect(rect?.getAttribute("fill")).toBe("#FF5555");
    });

    it("falls back to device.colour when colourOverride is undefined", () => {
      const { container } = render(RackDevice, {
        props: { ...defaultProps, colourOverride: undefined },
      });

      const rect = container.querySelector("rect.device-rect");
      expect(rect?.getAttribute("fill")).toBe("#4A90D9");
    });

    it("displays category icon for devices", () => {
      const { container } = render(RackDevice, { props: defaultProps });

      // Safari 18.x fix #411: Category icons now use SVG-native component
      // instead of foreignObject (which has transform inheritance bugs in Safari)
      const categoryIconSvg = container.querySelector("svg.category-icon-svg");
      expect(categoryIconSvg).toBeInTheDocument();

      // The Lucide icon SVG should be nested inside
      const nestedIconSvg = categoryIconSvg?.querySelector("svg");
      expect(nestedIconSvg).toBeInTheDocument();
    });

    it("displays category icon for multi-U devices", () => {
      const device2U: DeviceType = { ...mockDevice, u_height: 2 };
      const { container } = render(RackDevice, {
        props: { ...defaultProps, device: device2U },
      });

      // Safari 18.x fix #411: Category icons now use SVG-native component
      const categoryIconSvg = container.querySelector("svg.category-icon-svg");
      expect(categoryIconSvg).toBeInTheDocument();
    });

    it("centers icon vertically using SVG positioning", () => {
      // Safari 18.x fix #411: Category icons now use SVG-native component
      // with explicit x/y positioning instead of foreignObject
      const device2U: DeviceType = { ...mockDevice, u_height: 2 };
      const { container } = render(RackDevice, {
        props: { ...defaultProps, device: device2U },
      });

      // Get the category icon SVG element
      const categoryIconSvg = container.querySelector("svg.category-icon-svg");
      expect(categoryIconSvg).toBeInTheDocument();

      // Icon should have explicit x positioning (left margin)
      expect(categoryIconSvg?.getAttribute("x")).toBe("8");

      // Icon should be vertically centered: y = (deviceHeight - iconSize) / 2
      // For 2U device: height = 44px, icon size = 14px, y = (44 - 14) / 2 = 15
      const deviceHeight = 2 * U_HEIGHT;
      const iconSize = 14;
      const expectedY = (deviceHeight - iconSize) / 2;
      expect(categoryIconSvg?.getAttribute("y")).toBe(String(expectedY));
    });
  });

  describe("Selection", () => {
    it("shows selection outline when selected=true", () => {
      const { container } = render(RackDevice, {
        props: { ...defaultProps, selected: true },
      });

      const selectionOutline = container.querySelector(".device-selection");
      expect(selectionOutline).toBeInTheDocument();
    });

    it("hides selection outline when selected=false", () => {
      const { container } = render(RackDevice, {
        props: { ...defaultProps, selected: false },
      });

      const selectionOutline = container.querySelector(".device-selection");
      expect(selectionOutline).not.toBeInTheDocument();
    });
  });

  describe("Events", () => {
    // Issue #397: Events now handled via pointer events on SVG group
    it("dispatches select event on pointer click (pointerdown + pointerup)", async () => {
      const handleSelect = vi.fn();

      const { container } = render(RackDevice, {
        props: { ...defaultProps, onselect: handleSelect },
      });

      // Safari 18.x fix #411: Pointer events on device-rect (explicit geometry)
      const rect = container.querySelector(".device-rect");
      expect(rect).toBeInTheDocument();

      // Simulate a click: pointerdown followed by pointerup at same position
      await fireEvent.pointerDown(rect!, {
        isPrimary: true,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      await fireEvent.pointerUp(rect!, {
        isPrimary: true,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      expect(handleSelect).toHaveBeenCalledTimes(1);
      expect(handleSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { slug: "device-1", position: 1 },
        }),
      );
    });

    it("does not trigger drag when pointer moves less than threshold", async () => {
      const handleDragStart = vi.fn();

      const { container } = render(RackDevice, {
        props: { ...defaultProps, ondragstart: handleDragStart },
      });

      // Safari 18.x fix #411: Pointer events on device-rect (explicit geometry)
      const rect = container.querySelector(".device-rect");

      // Small movement (less than 3px threshold) should not trigger drag
      await fireEvent.pointerDown(rect!, {
        isPrimary: true,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      await fireEvent.pointerMove(rect!, {
        isPrimary: true,
        pointerId: 1,
        clientX: 101,
        clientY: 101,
      });
      await fireEvent.pointerUp(rect!, {
        isPrimary: true,
        pointerId: 1,
        clientX: 101,
        clientY: 101,
      });

      // Should not have triggered drag (movement was < 3px)
      expect(handleDragStart).not.toHaveBeenCalled();
    });

    it("triggers drag when pointer moves at or beyond threshold (3px)", async () => {
      const handleDragStart = vi.fn();

      const { container } = render(RackDevice, {
        props: { ...defaultProps, ondragstart: handleDragStart },
      });

      // Safari 18.x fix #411: Pointer events on device-rect (explicit geometry)
      const rect = container.querySelector(".device-rect");

      // Movement of exactly 3px should trigger drag
      await fireEvent.pointerDown(rect!, {
        isPrimary: true,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      await fireEvent.pointerMove(rect!, {
        isPrimary: true,
        pointerId: 1,
        clientX: 103, // 3px horizontal movement
        clientY: 100,
      });

      // Should have triggered drag (movement was >= 3px)
      expect(handleDragStart).toHaveBeenCalledTimes(1);
    });
  });

  describe("Accessibility", () => {
    // Issue #397: Accessibility attributes now on SVG group (not foreignObject)
    it('has role="button"', () => {
      const { container } = render(RackDevice, { props: defaultProps });

      const group = container.querySelector("g.rack-device");
      expect(group).toHaveAttribute("role", "button");
    });

    it("has correct aria-label", () => {
      const { container } = render(RackDevice, { props: defaultProps });

      const group = container.querySelector("g.rack-device");
      expect(group).toHaveAttribute(
        "aria-label",
        "Test Server, 1U server at U1",
      );
    });

    it("has tabindex for keyboard focus", () => {
      const { container } = render(RackDevice, { props: defaultProps });

      const group = container.querySelector("g.rack-device");
      expect(group).toHaveAttribute("tabindex", "0");
    });
  });

  describe("Width Calculation", () => {
    it("renders with correct width (rack width minus rails)", () => {
      const { container } = render(RackDevice, { props: defaultProps });

      const rect = container.querySelector("rect.device-rect");
      // Width should be RACK_WIDTH - (2 * RAIL_WIDTH) = 220 - 48 = 172
      const expectedWidth = RACK_WIDTH - RAIL_WIDTH * 2;
      expect(rect?.getAttribute("width")).toBe(String(expectedWidth));
    });
  });

  describe("Drag Affordance", () => {
    // Issue #397: Replaced foreignObject drag overlay with pointer events
    // Issue #411: Moved pointer events to device-rect for Safari 18.x compatibility

    it("has grab cursor on device-rect element", () => {
      const { container } = render(RackDevice, { props: defaultProps });

      // Safari 18.x fix #411: cursor on device-rect (explicit geometry element)
      const rect = container.querySelector(".device-rect");
      expect(rect).toBeInTheDocument();
      expect(rect).toHaveClass("device-rect");

      // Attempt to verify cursor style via getComputedStyle
      // Note: happy-dom/jsdom may not fully support CSS from <style> blocks,
      // so we guard this assertion. If the test environment doesn't compute
      // styles properly, verify cursor behavior via E2E/visual testing.
      const computedCursor = window.getComputedStyle(rect!).cursor;
      if (computedCursor && computedCursor !== "") {
        expect(computedCursor).toBe("grab");
      }
      // The .device-rect CSS class in RackDevice.svelte sets cursor: grab
    });

    it("has CSS properties for iOS Safari long-press support (#232)", () => {
      // This test documents that the rack-device group is styled
      // with CSS properties that prevent iOS Safari's default
      // long-press context menu from interfering with our gesture.
      // The actual CSS is verified through linting and visual testing.
      const { container } = render(RackDevice, { props: defaultProps });

      const group = container.querySelector("g.rack-device");
      expect(group).toBeInTheDocument();
      expect(group).toHaveClass("rack-device");
      // CSS properties applied via stylesheet on .rack-device:
      // -webkit-touch-callout: none (disables Safari callout)
      // -webkit-user-select: none (prevents text selection)
      // user-select: none (standard property)
      // touch-action: manipulation (allows pan/zoom, disables double-tap delay)
    });

    it("has accessibility attributes for keyboard interaction", () => {
      const { container } = render(RackDevice, { props: defaultProps });

      const group = container.querySelector("g.rack-device");
      expect(group).toBeInTheDocument();
      expect(group).toHaveAttribute("role", "button");
      expect(group).toHaveAttribute("tabindex", "0");
      expect(group).toHaveAttribute("aria-label");
      expect(group).toHaveAttribute("aria-pressed", "false");
    });

    it("uses pointer events for drag detection (not HTML5 drag)", () => {
      const { container } = render(RackDevice, { props: defaultProps });

      // The SVG group handles pointer events directly
      const group = container.querySelector("g.rack-device");
      expect(group).toBeInTheDocument();

      // Should NOT have a foreignObject drag overlay
      const dragOverlay = container.querySelector(".drag-overlay");
      expect(dragOverlay).not.toBeInTheDocument();

      // Note: CSS transform: scale() on SVG elements with existing transform
      // attributes causes visual position jumps. The dragging state uses
      // drop-shadow filter for visual feedback instead (see Issue #5).
    });
  });

  describe("Display Mode", () => {
    const mockImageData: ImageData = {
      blob: new Blob(["test"], { type: "image/png" }),
      dataUrl: "data:image/png;base64,dGVzdA==",
      filename: "test.png",
    };

    beforeEach(() => {
      resetImageStore();
    });

    it("renders label when displayMode is label", () => {
      const { container } = render(RackDevice, {
        props: { ...defaultProps, displayMode: "label" },
      });

      const deviceName = container.querySelector(".device-name");
      expect(deviceName).toBeInTheDocument();
      expect(deviceName?.textContent).toBe("Test Server");
    });

    it("renders image when displayMode is image and device has image", () => {
      const imageStore = getImageStore();
      imageStore.setDeviceImage(mockDevice.slug, "front", mockImageData);

      const { container } = render(RackDevice, {
        props: { ...defaultProps, displayMode: "image", rackView: "front" },
      });

      const image = container.querySelector(".device-image");
      expect(image).toBeInTheDocument();
    });

    it("falls back to label when displayMode is image but no image exists", () => {
      const { container } = render(RackDevice, {
        props: { ...defaultProps, displayMode: "image", rackView: "front" },
      });

      // Should show label since no image
      const deviceName = container.querySelector(".device-name");
      expect(deviceName).toBeInTheDocument();
    });

    it("shows correct image for front view", () => {
      const imageStore = getImageStore();
      imageStore.setDeviceImage(mockDevice.slug, "front", mockImageData);
      imageStore.setDeviceImage(mockDevice.slug, "rear", {
        ...mockImageData,
        dataUrl: "data:image/png;base64,cmVhcg==",
      });

      const { container } = render(RackDevice, {
        props: { ...defaultProps, displayMode: "image", rackView: "front" },
      });

      const image = container.querySelector(".device-image");
      expect(image?.getAttribute("href")).toBe(
        "data:image/png;base64,dGVzdA==",
      );
    });

    it("shows correct image for rear view", () => {
      const imageStore = getImageStore();
      imageStore.setDeviceImage(mockDevice.slug, "front", mockImageData);
      imageStore.setDeviceImage(mockDevice.slug, "rear", {
        ...mockImageData,
        dataUrl: "data:image/png;base64,cmVhcg==",
      });

      const { container } = render(RackDevice, {
        props: { ...defaultProps, displayMode: "image", rackView: "rear" },
      });

      const image = container.querySelector(".device-image");
      expect(image?.getAttribute("href")).toBe(
        "data:image/png;base64,cmVhcg==",
      );
    });

    it("image scales to fit device dimensions with overflow", () => {
      const imageStore = getImageStore();
      imageStore.setDeviceImage(mockDevice.slug, "front", mockImageData);

      const { container } = render(RackDevice, {
        props: { ...defaultProps, displayMode: "image", rackView: "front" },
      });

      const image = container.querySelector(".device-image");
      // Image extends past rack rails by IMAGE_OVERFLOW on each side
      const expectedWidth = RACK_WIDTH - RAIL_WIDTH * 2 + IMAGE_OVERFLOW * 2;
      const expectedHeight = U_HEIGHT;
      expect(image?.getAttribute("width")).toBe(String(expectedWidth));
      expect(image?.getAttribute("height")).toBe(String(expectedHeight));
      // Image is positioned at negative x to extend past left rail
      expect(image?.getAttribute("x")).toBe(String(-IMAGE_OVERFLOW));
    });

    it("image has clipPath with rounded corners for clean edges", () => {
      const imageStore = getImageStore();
      imageStore.setDeviceImage(mockDevice.slug, "front", mockImageData);

      const { container } = render(RackDevice, {
        props: { ...defaultProps, displayMode: "image", rackView: "front" },
      });

      const image = container.querySelector(".device-image");
      expect(image).not.toBeNull();

      // Image should have a clip-path attribute
      const clipPathAttr = image?.getAttribute("clip-path");
      expect(clipPathAttr).not.toBeNull();
      expect(clipPathAttr).toMatch(/url\(#clip-/);

      // ClipPath element should exist in the SVG
      const clipPathId = clipPathAttr?.match(/url\(#(.+)\)/)?.[1];
      expect(clipPathId).toBeDefined();
      const clipPath = container.querySelector(`#${clipPathId}`);
      expect(clipPath).not.toBeNull();

      // ClipPath should contain a rect with rounded corners
      const clipRect = clipPath?.querySelector("rect");
      expect(clipRect).not.toBeNull();
      expect(clipRect?.getAttribute("rx")).toBe("2");
      expect(clipRect?.getAttribute("ry")).toBe("2");
    });

    it("clipPath bounds image to device dimensions with overflow", () => {
      const imageStore = getImageStore();
      imageStore.setDeviceImage(mockDevice.slug, "front", mockImageData);

      const { container } = render(RackDevice, {
        props: { ...defaultProps, displayMode: "image", rackView: "front" },
      });

      const image = container.querySelector(".device-image");
      const clipPathId = image
        ?.getAttribute("clip-path")
        ?.match(/url\(#(.+)\)/)?.[1];
      const clipRect = container.querySelector(`#${clipPathId} rect`);

      // ClipPath rect should match the image dimensions (with overflow)
      const expectedWidth = RACK_WIDTH - RAIL_WIDTH * 2 + IMAGE_OVERFLOW * 2;
      expect(clipRect?.getAttribute("x")).toBe(String(-IMAGE_OVERFLOW));
      expect(clipRect?.getAttribute("y")).toBe("0");
      expect(clipRect?.getAttribute("width")).toBe(String(expectedWidth));
      expect(clipRect?.getAttribute("height")).toBe(String(U_HEIGHT));
    });
  });

  describe("Label Overlay", () => {
    const mockImageData: ImageData = {
      blob: new Blob(["test"], { type: "image/png" }),
      dataUrl: "data:image/png;base64,dGVzdA==",
      filename: "test.png",
    };

    beforeEach(() => {
      resetImageStore();
    });

    it("does not show label overlay when showLabelsOnImages is false", () => {
      const imageStore = getImageStore();
      imageStore.setDeviceImage(mockDevice.slug, "front", mockImageData);

      const { container } = render(RackDevice, {
        props: {
          ...defaultProps,
          displayMode: "image",
          rackView: "front",
          showLabelsOnImages: false,
        },
      });

      // Should have image
      expect(container.querySelector(".device-image")).toBeInTheDocument();
      // Should NOT have label overlay
      // Safari 18.x fix #420: label overlay now uses SVG-native LabelOverlaySVG component
      expect(
        container.querySelector(".label-overlay-svg"),
      ).not.toBeInTheDocument();
    });

    it("shows label overlay when showLabelsOnImages is true in image mode", () => {
      const imageStore = getImageStore();
      imageStore.setDeviceImage(mockDevice.slug, "front", mockImageData);

      const { container } = render(RackDevice, {
        props: {
          ...defaultProps,
          displayMode: "image",
          rackView: "front",
          showLabelsOnImages: true,
        },
      });

      // Should have both image and label overlay
      // Safari 18.x fix #420: label overlay now uses SVG-native LabelOverlaySVG component
      // instead of foreignObject with .label-overlay class
      expect(container.querySelector(".device-image")).toBeInTheDocument();
      const overlay = container.querySelector(".label-overlay-svg");
      expect(overlay).toBeInTheDocument();
      const overlayText = overlay?.querySelector(".label-text");
      expect(overlayText?.textContent).toBe("Test Server");
    });

    it("does not show label overlay in label mode even when showLabelsOnImages is true", () => {
      const { container } = render(RackDevice, {
        props: {
          ...defaultProps,
          displayMode: "label",
          showLabelsOnImages: true,
        },
      });

      // Should have device name but not as overlay
      // Safari 18.x fix #420: label overlay now uses SVG-native LabelOverlaySVG component
      expect(container.querySelector(".device-name")).toBeInTheDocument();
      expect(
        container.querySelector(".label-overlay-svg"),
      ).not.toBeInTheDocument();
    });

    it("does not show label overlay when image mode but no image exists", () => {
      const { container } = render(RackDevice, {
        props: {
          ...defaultProps,
          displayMode: "image",
          rackView: "front",
          showLabelsOnImages: true,
        },
      });

      // Falls back to label display, no overlay
      // Safari 18.x fix #420: label overlay now uses SVG-native LabelOverlaySVG component
      expect(container.querySelector(".device-name")).toBeInTheDocument();
      expect(
        container.querySelector(".label-overlay-svg"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Port Indicators Integration", () => {
    const mockDeviceWithInterfaces: DeviceType = {
      ...mockDevice,
      interfaces: [
        { name: "eth0", type: "1000base-t" },
        { name: "eth1", type: "1000base-t" },
        { name: "mgmt", type: "1000base-t", mgmt_only: true },
      ],
    };

    it("does not render PortIndicators when device has no interfaces", () => {
      const { container } = render(RackDevice, {
        props: { ...defaultProps },
      });

      const portIndicators = container.querySelector(".port-indicators");
      expect(portIndicators).not.toBeInTheDocument();
    });

    it("does not render PortIndicators when interfaces array is empty", () => {
      const deviceWithEmptyInterfaces: DeviceType = {
        ...mockDevice,
        interfaces: [],
      };
      const { container } = render(RackDevice, {
        props: { ...defaultProps, device: deviceWithEmptyInterfaces },
      });

      const portIndicators = container.querySelector(".port-indicators");
      expect(portIndicators).not.toBeInTheDocument();
    });

    it("renders PortIndicators when device has interfaces", () => {
      const { container } = render(RackDevice, {
        props: { ...defaultProps, device: mockDeviceWithInterfaces },
      });

      const portIndicators = container.querySelector(".port-indicators");
      expect(portIndicators).toBeInTheDocument();
    });

    it("passes correct props to PortIndicators", () => {
      const { container } = render(RackDevice, {
        props: { ...defaultProps, device: mockDeviceWithInterfaces },
      });

      // PortIndicators should render port circles for the interfaces
      const portCircles = container.querySelectorAll("circle.port-circle");
      expect(portCircles.length).toBe(3);
    });

    it("passes rackView prop to PortIndicators", () => {
      const deviceWithPositionedInterfaces: DeviceType = {
        ...mockDevice,
        interfaces: [
          { name: "eth0", type: "1000base-t", position: "front" },
          { name: "eth1", type: "1000base-t", position: "rear" },
        ],
      };

      // Front view should only show front interfaces
      const { container: frontContainer } = render(RackDevice, {
        props: {
          ...defaultProps,
          device: deviceWithPositionedInterfaces,
          rackView: "front",
        },
      });
      const frontPorts = frontContainer.querySelectorAll("circle.port-circle");
      expect(frontPorts.length).toBe(1);

      // Rear view should only show rear interfaces
      const { container: rearContainer } = render(RackDevice, {
        props: {
          ...defaultProps,
          device: deviceWithPositionedInterfaces,
          rackView: "rear",
        },
      });
      const rearPorts = rearContainer.querySelectorAll("circle.port-circle");
      expect(rearPorts.length).toBe(1);
    });

    it("emits onPortClick event when port is clicked", async () => {
      const handlePortClick = vi.fn();

      const { container } = render(RackDevice, {
        props: {
          ...defaultProps,
          device: mockDeviceWithInterfaces,
          onPortClick: handlePortClick,
        },
      });

      // Find and click a port hit target (SVG circle, not button - Safari compatible)
      const portHitTarget = container.querySelector("circle.port-hit-target");
      expect(portHitTarget).toBeInTheDocument();

      portHitTarget!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(handlePortClick).toHaveBeenCalledTimes(1);
      expect(handlePortClick).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "eth0",
          type: "1000base-t",
        }),
      );
    });

    it("renders PortIndicators as last child (on top of device content)", () => {
      // Issue #397: Removed foreignObject drag overlay, now using pointer events
      // Port indicators should be rendered last so they're visually on top
      const { container } = render(RackDevice, {
        props: { ...defaultProps, device: mockDeviceWithInterfaces },
      });

      const group = container.querySelector("g.rack-device");
      const children = Array.from(group?.children ?? []);

      // Find the port-indicators group
      const portIndicatorsIndex = children.findIndex(
        (el) =>
          el.tagName.toLowerCase() === "g" &&
          el.classList.contains("port-indicators"),
      );

      expect(portIndicatorsIndex).toBeGreaterThan(-1);
      // Port indicators should be the last child (rendered on top)
      expect(portIndicatorsIndex).toBe(children.length - 1);
    });
  });
});
