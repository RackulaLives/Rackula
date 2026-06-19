import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getCanvasStore,
  resetCanvasStore,
  snapZoom,
  ZOOM_MIN,
  ZOOM_MAX,
} from "$lib/stores/canvas.svelte";
import { createMockPanzoom } from "./mocks/panzoom";
import { createTestRack, createTestDeviceType } from "./factories";
import {
  U_HEIGHT_PX,
  BASE_RACK_WIDTH,
  RAIL_WIDTH,
  BASE_RACK_PADDING,
  RACK_ROW_PADDING,
  DUAL_VIEW_GAP,
  DUAL_VIEW_EXTRA_HEIGHT,
} from "$lib/constants/layout";
import { toInternalUnits } from "$lib/utils/position";

describe("Canvas Store", () => {
  beforeEach(() => {
    resetCanvasStore();
  });

  describe("initial state", () => {
    it("starts with zoom at 1 (100%)", () => {
      const store = getCanvasStore();
      expect(store.zoom).toBe(1);
    });

    it("starts with zoomPercentage at 100", () => {
      const store = getCanvasStore();
      expect(store.zoomPercentage).toBe(100);
    });

    it("starts with no panzoom instance", () => {
      const store = getCanvasStore();
      expect(store.hasPanzoom).toBe(false);
    });

    it("can zoom in from initial state", () => {
      const store = getCanvasStore();
      expect(store.canZoomIn).toBe(true);
    });

    it("can zoom out from initial state", () => {
      const store = getCanvasStore();
      expect(store.canZoomOut).toBe(true);
    });
  });

  describe("setPanzoomInstance", () => {
    it("sets hasPanzoom to true", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom();

      store.setPanzoomInstance(mockPanzoom);

      expect(store.hasPanzoom).toBe(true);
    });

    it("syncs zoom from panzoom instance", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1.5);

      store.setPanzoomInstance(mockPanzoom);

      expect(store.zoom).toBe(1.5);
      expect(store.zoomPercentage).toBe(150);
    });

    it("registers zoom event listener", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom();

      store.setPanzoomInstance(mockPanzoom);

      expect(mockPanzoom.on).toHaveBeenCalledWith("zoom", expect.any(Function));
    });
  });

  describe("disposePanzoom", () => {
    it("disposes panzoom instance", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom();

      store.setPanzoomInstance(mockPanzoom);
      store.disposePanzoom();

      expect(mockPanzoom.dispose).toHaveBeenCalled();
      expect(store.hasPanzoom).toBe(false);
    });
  });

  describe("snapZoom", () => {
    it("snaps out from an off-ladder value to the rung below", () => {
      expect(snapZoom(1.18, "out")).toBe(1.0);
    });

    it("snaps in from an off-ladder value to the rung above", () => {
      expect(snapZoom(1.18, "in")).toBe(1.25);
    });

    it("advances one rung when out from a value on the ladder", () => {
      expect(snapZoom(1.0, "out")).toBe(0.75);
    });

    it("advances one rung when in from a value on the ladder", () => {
      expect(snapZoom(1.0, "in")).toBe(1.25);
    });

    it("stays at ZOOM_MIN when stepping out from the minimum", () => {
      expect(snapZoom(ZOOM_MIN, "out")).toBe(ZOOM_MIN);
    });

    it("stays at ZOOM_MAX when stepping in from the maximum", () => {
      expect(snapZoom(ZOOM_MAX, "in")).toBe(ZOOM_MAX);
    });

    it("clamps a below-minimum value to ZOOM_MIN when stepping out", () => {
      expect(snapZoom(ZOOM_MIN - 0.1, "out")).toBe(ZOOM_MIN);
    });

    it("clamps an above-maximum value to ZOOM_MAX when stepping in", () => {
      expect(snapZoom(ZOOM_MAX + 0.1, "in")).toBe(ZOOM_MAX);
    });

    it("steps in toward the maximum from just below it", () => {
      expect(snapZoom(1.9, "in")).toBe(ZOOM_MAX);
    });

    it("steps out toward the minimum from just above it", () => {
      expect(snapZoom(0.3, "out")).toBe(ZOOM_MIN);
    });
  });

  describe("zoomIn", () => {
    it("does nothing without panzoom instance", () => {
      const store = getCanvasStore();
      const initialZoom = store.zoom;

      store.zoomIn();

      expect(store.zoom).toBe(initialZoom);
    });

    it("snaps up to the next ladder rung", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.zoomIn();

      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, 1.25);
    });

    it("snaps up to the nearest ladder rung from an off-ladder value", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1.18);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.zoomIn();

      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, 1.25);
    });

    it("does not exceed ZOOM_MAX", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(ZOOM_MAX);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.zoomIn();

      expect(mockPanzoom.zoomAbs).not.toHaveBeenCalled();
    });

    it("clamps to ZOOM_MAX when approaching limit", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(ZOOM_MAX - 0.1);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.zoomIn();

      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, ZOOM_MAX);
    });
  });

  describe("zoomOut", () => {
    it("does nothing without panzoom instance", () => {
      const store = getCanvasStore();
      const initialZoom = store.zoom;

      store.zoomOut();

      expect(store.zoom).toBe(initialZoom);
    });

    it("snaps down to the next ladder rung", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.zoomOut();

      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, 0.75);
    });

    it("snaps down to the nearest ladder rung from an off-ladder value", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1.18);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.zoomOut();

      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, 1.0);
    });

    it("does not go below ZOOM_MIN", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(ZOOM_MIN);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.zoomOut();

      expect(mockPanzoom.zoomAbs).not.toHaveBeenCalled();
    });

    it("clamps to ZOOM_MIN when approaching limit", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(ZOOM_MIN + 0.1);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.zoomOut();

      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, ZOOM_MIN);
    });
  });

  describe("setZoom", () => {
    it("sets zoom to specific value", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.setZoom(1.5);

      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, 1.5);
    });

    it("clamps to ZOOM_MIN", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.setZoom(0.1);

      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, ZOOM_MIN);
    });

    it("clamps to ZOOM_MAX", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.setZoom(5);

      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, ZOOM_MAX);
    });
  });

  describe("resetZoom", () => {
    it("resets zoom to 1 and position to origin", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1.5);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.resetZoom();

      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, 1);
      expect(mockPanzoom.moveTo).toHaveBeenCalledWith(0, 0);
    });
  });

  describe("getTransform", () => {
    it("returns default transform without panzoom", () => {
      const store = getCanvasStore();
      const transform = store.getTransform();

      expect(transform).toEqual({ x: 0, y: 0, scale: 1 });
    });

    it("returns panzoom transform when available", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1.5);
      // Manually set transform
      mockPanzoom.moveTo(100, 200);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      const transform = store.getTransform();

      expect(transform.scale).toBe(1.5);
    });
  });

  describe("canZoomIn/canZoomOut", () => {
    it("canZoomIn is false at ZOOM_MAX", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(ZOOM_MAX);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );

      expect(store.canZoomIn).toBe(false);
    });

    it("canZoomOut is false at ZOOM_MIN", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(ZOOM_MIN);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );

      expect(store.canZoomOut).toBe(false);
    });
  });

  describe("smoothMoveTo", () => {
    it("zooms at origin then moves when reduced motion not preferred", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);

      // Mock matchMedia to return false for reduced motion
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: false })),
      );

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.smoothMoveTo(100, 200, 1.5);

      // Should zoom at origin (0, 0) to avoid coordinate confusion
      expect(mockPanzoom.smoothZoomAbs).toHaveBeenCalledWith(0, 0, 1.5);
      // Note: moveTo is called async via setTimeout, so we can't test it here easily

      vi.unstubAllGlobals();
    });

    it("zooms at origin then moves when reduced motion preferred", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);

      // Mock matchMedia to return true for reduced motion
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: true })),
      );

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.smoothMoveTo(100, 200, 1.5);

      // Should zoom at origin (0, 0) then apply pan offset
      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, 1.5);
      expect(mockPanzoom.moveTo).toHaveBeenCalledWith(100, 200);

      vi.unstubAllGlobals();
    });
  });

  describe("zoom event sync", () => {
    it("updates zoom when panzoom emits zoom event", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);

      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );

      // Simulate zoom change via zoomAbs (which triggers the zoom event)
      mockPanzoom.zoomAbs(0, 0, 1.75);

      expect(store.zoom).toBe(1.75);
      expect(store.zoomPercentage).toBe(175);
    });
  });

  describe("fitAll", () => {
    it("fitAll function is callable", () => {
      const store = getCanvasStore();

      // fitAll should be a function on the store
      expect(typeof store.fitAll).toBe("function");
    });

    it("fitAll does nothing without panzoom instance", () => {
      const store = getCanvasStore();
      const initialZoom = store.zoom;

      // Should not throw when called without panzoom
      store.fitAll([]);

      expect(store.zoom).toBe(initialZoom);
    });

    it("fitAll does nothing when canvas element is cleared", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);
      const mockCanvas = document.createElement("div");
      Object.defineProperty(mockCanvas, "clientWidth", { value: 800 });
      Object.defineProperty(mockCanvas, "clientHeight", { value: 600 });

      store.setCanvasElement(mockCanvas);
      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );
      store.setCanvasElement(null);

      const mockRacks = [
        {
          name: "Test",
          height: 42,
          width: 19 as const,
          position: 0,
          desc_units: false,
          form_factor: "4-post" as const,
          starting_unit: 1,
          devices: [],
        },
      ] as Parameters<typeof store.fitAll>[0];

      store.fitAll(mockRacks);

      expect(mockPanzoom.zoomAbs).not.toHaveBeenCalled();
      expect(mockPanzoom.moveTo).not.toHaveBeenCalled();
    });

    it("fitAll centers rack in viewport when panzoom is available", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);

      // Mock matchMedia for reduced motion check
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: false })),
      );

      // Mock canvas element for viewport dimensions
      const mockCanvas = document.createElement("div");
      Object.defineProperty(mockCanvas, "clientWidth", { value: 800 });
      Object.defineProperty(mockCanvas, "clientHeight", { value: 600 });

      store.setCanvasElement(mockCanvas);
      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );

      // Call fitAll with mock rack data
      const mockRacks = [
        {
          name: "Test",
          height: 42,
          width: 19 as const,
          position: 0,
          desc_units: false,
          form_factor: "4-post" as const,
          starting_unit: 1,
          devices: [],
        },
      ] as Parameters<typeof store.fitAll>[0];

      store.fitAll(mockRacks);

      // Should call zoomAbs and moveTo to center the content
      expect(mockPanzoom.zoomAbs).toHaveBeenCalled();
      expect(mockPanzoom.moveTo).toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });

  describe("zoomToDevice", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    function setupCanvasAndPanzoom(
      viewportWidth: number,
      viewportHeight: number,
      initialScale = 1,
      prefersReducedMotion = false,
    ) {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(initialScale);

      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: prefersReducedMotion })),
      );

      const mockCanvas = document.createElement("div");
      Object.defineProperty(mockCanvas, "clientWidth", {
        value: viewportWidth,
      });
      Object.defineProperty(mockCanvas, "clientHeight", {
        value: viewportHeight,
      });

      store.setCanvasElement(mockCanvas);
      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );

      return { store, mockPanzoom };
    }

    it("does nothing when no panzoom instance is set", () => {
      const store = getCanvasStore();
      const rack = createTestRack({ height: 42, devices: [] });
      const deviceType = createTestDeviceType({ u_height: 2 });

      // No panzoom set - should not throw
      expect(() => store.zoomToDevice(rack, 0, [deviceType])).not.toThrow();
    });

    it("does nothing when deviceIndex is out of range", () => {
      const { store, mockPanzoom } = setupCanvasAndPanzoom(400, 700);
      const rack = createTestRack({ height: 42, devices: [] });
      const deviceType = createTestDeviceType({ u_height: 2 });

      store.zoomToDevice(rack, 0, [deviceType]);

      // No devices in rack: index 0 is out of range, nothing should be called
      expect(mockPanzoom.smoothZoomAbs).not.toHaveBeenCalled();
      expect(mockPanzoom.zoomAbs).not.toHaveBeenCalled();
    });

    it("does nothing when device type is not found in library", () => {
      const { store, mockPanzoom } = setupCanvasAndPanzoom(400, 700);
      const rack = createTestRack({
        height: 42,
        devices: [
          {
            id: "placed-1",
            device_type: "unknown-slug",
            position: toInternalUnits(1),
            face: "front",
          },
        ],
      });
      const deviceType = createTestDeviceType({
        slug: "different-slug",
        u_height: 2,
      });

      store.zoomToDevice(rack, 0, [deviceType]);

      expect(mockPanzoom.smoothZoomAbs).not.toHaveBeenCalled();
      expect(mockPanzoom.zoomAbs).not.toHaveBeenCalled();
    });

    it("clamps target zoom to ZOOM_MAX for small devices in large viewports", () => {
      // A 1U device in a 42U rack with a 700px viewport will produce a zoom
      // well above ZOOM_MAX if unclamped. Verify it is clamped.
      const { store, mockPanzoom } = setupCanvasAndPanzoom(400, 700);
      const rack = createTestRack({
        height: 42,
        devices: [
          {
            id: "placed-1",
            device_type: "tiny-switch",
            position: toInternalUnits(1),
            face: "front",
          },
        ],
      });
      const deviceType = createTestDeviceType({
        slug: "tiny-switch",
        u_height: 1,
      });

      store.zoomToDevice(rack, 0, [deviceType]);

      // smoothZoomAbs is called by smoothMoveTo (reduced motion = false)
      expect(mockPanzoom.smoothZoomAbs).toHaveBeenCalled();
      const [, , scale] = mockPanzoom.smoothZoomAbs.mock.calls[0] as [
        number,
        number,
        number,
      ];
      expect(scale).toBeLessThanOrEqual(ZOOM_MAX);
    });

    it("clamps target zoom to ZOOM_MIN for very tall devices", () => {
      // A rack-height device in a tiny viewport could produce a zoom below
      // ZOOM_MIN. Verify it is clamped.
      const { store, mockPanzoom } = setupCanvasAndPanzoom(100, 100);
      const rack = createTestRack({
        height: 42,
        devices: [
          {
            id: "placed-1",
            device_type: "tall-chassis",
            position: toInternalUnits(1),
            face: "front",
          },
        ],
      });
      const deviceType = createTestDeviceType({
        slug: "tall-chassis",
        u_height: 42,
      });

      store.zoomToDevice(rack, 0, [deviceType]);

      expect(mockPanzoom.smoothZoomAbs).toHaveBeenCalled();
      const [, , scale] = mockPanzoom.smoothZoomAbs.mock.calls[0] as [
        number,
        number,
        number,
      ];
      expect(scale).toBeGreaterThanOrEqual(ZOOM_MIN);
    });

    it("centers the device in the viewport", () => {
      // For a known device position, verify that the pan places the device
      // center at the viewport center.
      const viewportWidth = 400;
      const viewportHeight = 700;
      const { store, mockPanzoom } = setupCanvasAndPanzoom(
        viewportWidth,
        viewportHeight,
      );

      const rackHeight = 42;
      const deviceUHeight = 2;
      const positionU = 1; // human U position at which device starts
      const deviceInternalPos = toInternalUnits(positionU);

      const rack = createTestRack({
        height: rackHeight,
        devices: [
          {
            id: "placed-1",
            device_type: "test-server",
            position: deviceInternalPos,
            face: "front",
          },
        ],
      });
      const deviceType = createTestDeviceType({
        slug: "test-server",
        u_height: deviceUHeight,
      });

      vi.useFakeTimers();
      store.zoomToDevice(rack, 0, [deviceType]);

      expect(mockPanzoom.smoothZoomAbs).toHaveBeenCalled();
      const [, , zoom] = mockPanzoom.smoothZoomAbs.mock.calls[0] as [
        number,
        number,
        number,
      ];

      // Compute expected pan based on the same math as zoomToDevice
      const deviceYInRack =
        (rackHeight - positionU - deviceUHeight + 1) * U_HEIGHT_PX;
      const deviceHeight = deviceUHeight * U_HEIGHT_PX;
      const deviceAbsY =
        RACK_ROW_PADDING +
        DUAL_VIEW_EXTRA_HEIGHT +
        BASE_RACK_PADDING +
        RAIL_WIDTH +
        deviceYInRack;
      const dualViewWidth = BASE_RACK_WIDTH * 2 + DUAL_VIEW_GAP;
      const deviceAbsX = RACK_ROW_PADDING + dualViewWidth / 2;
      const expectedPanX = viewportWidth / 2 - deviceAbsX * zoom;
      const expectedPanY =
        viewportHeight / 2 - (deviceAbsY + deviceHeight / 2) * zoom;

      // smoothMoveTo delivers the moveTo call via setTimeout(..., 0).
      // Flush all pending timers so moveTo fires synchronously here.
      vi.runAllTimers();

      expect(mockPanzoom.moveTo).toHaveBeenCalledOnce();
      const [panX, panY] = mockPanzoom.moveTo.mock.calls[0] as [number, number];
      expect(panX).toBeCloseTo(expectedPanX, 5);
      expect(panY).toBeCloseTo(expectedPanY, 5);
    });

    it("uses instant transition when reduced motion is preferred", () => {
      // prefersReducedMotion=true routes through the instant path (zoomAbs + moveTo)
      const { store, mockPanzoom } = setupCanvasAndPanzoom(400, 700, 1, true);

      const rack = createTestRack({
        height: 42,
        devices: [
          {
            id: "placed-1",
            device_type: "test-server",
            position: toInternalUnits(1),
            face: "front",
          },
        ],
      });
      const deviceType = createTestDeviceType({
        slug: "test-server",
        u_height: 2,
      });

      store.zoomToDevice(rack, 0, [deviceType]);

      // Reduced motion: uses zoomAbs (instant) not smoothZoomAbs
      expect(mockPanzoom.zoomAbs).toHaveBeenCalled();
      expect(mockPanzoom.smoothZoomAbs).not.toHaveBeenCalled();
      // moveTo is called synchronously (no timer on the reduced-motion path)
      expect(mockPanzoom.moveTo).toHaveBeenCalled();
    });
  });
});
