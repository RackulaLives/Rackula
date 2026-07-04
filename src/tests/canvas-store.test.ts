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

/**
 * Stub window.matchMedia so the reduced-motion gate resolves to `matches`.
 * Cleared per test via vi.unstubAllGlobals() in each describe's afterEach.
 */
function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches })),
  );
}

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
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("interpolates x, y, and scale together and settles on the target", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);
      stubReducedMotion(false);
      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );

      vi.useFakeTimers();
      store.smoothMoveTo(100, 200, 1.5);
      // Drive the animation loop to completion.
      vi.advanceTimersByTime(400);

      // The old hand-sequenced zoom is gone: no smoothZoomAbs, no setTimeout hop.
      expect(mockPanzoom.smoothZoomAbs).not.toHaveBeenCalled();
      // Every animated frame lands one interpolated camera: zoomAbs at origin then moveTo.
      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(
        0,
        0,
        expect.any(Number),
      );
      // The final frame settles exactly on the requested camera (x, y, and scale).
      const lastMove = mockPanzoom.moveTo.mock.calls.at(-1) as [number, number];
      expect(lastMove[0]).toBeCloseTo(100, 5);
      expect(lastMove[1]).toBeCloseTo(200, 5);
      const lastZoom = mockPanzoom.zoomAbs.mock.calls.at(-1) as [
        number,
        number,
        number,
      ];
      expect(lastZoom[2]).toBeCloseTo(1.5, 5);
    });

    it("retargets from the current camera and never applies the first target", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);
      stubReducedMotion(false);
      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );

      vi.useFakeTimers();
      store.smoothMoveTo(100, 200, 1.5);
      // Let the camera travel a visible fraction of the first ease, then interrupt.
      vi.advanceTimersByTime(150);
      const moved = store.getTransform();
      expect(moved.x).toBeGreaterThan(0);
      expect(moved.x).toBeLessThan(100); // partway, not yet at the first target

      const callsBeforeRetarget = mockPanzoom.moveTo.mock.calls.length;
      store.smoothMoveTo(500, 600, 2);

      // The retargeted tween's first frame must blend from where the camera actually
      // is (the moved position), not restart from the origin.
      vi.advanceTimersByTime(16);
      const firstRetargetMove = mockPanzoom.moveTo.mock.calls[
        callsBeforeRetarget
      ] as [number, number];
      expect(firstRetargetMove[0]).toBeCloseTo(moved.x, 5);
      expect(firstRetargetMove[1]).toBeCloseTo(moved.y, 5);

      vi.advanceTimersByTime(400);
      // The camera settles on the second target...
      const lastMove = mockPanzoom.moveTo.mock.calls.at(-1) as [number, number];
      expect(lastMove[0]).toBeCloseTo(500, 5);
      expect(lastMove[1]).toBeCloseTo(600, 5);
      // ...and the interrupted first target is never applied (no stale-timeout snap).
      expect(mockPanzoom.moveTo.mock.calls).not.toContainEqual([100, 200]);
    });

    it("lands instantly with no animation when reduced motion is preferred", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);
      stubReducedMotion(true);
      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );

      const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame");
      store.smoothMoveTo(100, 200, 1.5);

      // Instant zoomAbs + moveTo, no animation frame scheduled.
      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, 1.5);
      expect(mockPanzoom.moveTo).toHaveBeenCalledWith(100, 200);
      expect(mockPanzoom.smoothZoomAbs).not.toHaveBeenCalled();
      expect(rafSpy).not.toHaveBeenCalled();

      rafSpy.mockRestore();
    });

    it("an instant camera op cancels an in-flight animation", () => {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);
      stubReducedMotion(false);
      store.setPanzoomInstance(
        mockPanzoom as ReturnType<typeof import("panzoom").default>,
      );

      vi.useFakeTimers();
      store.smoothMoveTo(100, 200, 1.5);
      vi.advanceTimersByTime(150); // animation is mid-flight
      store.resetZoom(); // instant op: lands the camera at origin, 100%

      // The cancelled animation must not resume and drag the camera to its target.
      vi.advanceTimersByTime(400);
      expect(mockPanzoom.getTransform()).toEqual({ x: 0, y: 0, scale: 1 });
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

      stubReducedMotion(false);

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

  describe("ensureRacksVisible", () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    function setup(viewportWidth: number, viewportHeight: number) {
      const store = getCanvasStore();
      const mockPanzoom = createMockPanzoom(1);
      stubReducedMotion(false);
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

    it("does nothing without a panzoom instance", () => {
      const store = getCanvasStore();
      const rack = createTestRack({ id: "rack-1" });
      expect(() => store.ensureRacksVisible(["rack-1"], [rack])).not.toThrow();
    });

    it("keeps the camera still when the rack is already fully visible", () => {
      // A viewport far larger than the rack contains it at scale 1, pan 0.
      const { store, mockPanzoom } = setup(5000, 5000);
      const rack = createTestRack({ id: "rack-1", height: 42 });

      store.ensureRacksVisible(["rack-1"], [rack]);

      // Camera still: the animated path never runs, so nothing is applied.
      expect(mockPanzoom.zoomAbs).not.toHaveBeenCalled();
      expect(mockPanzoom.moveTo).not.toHaveBeenCalled();
    });

    it("moves the camera when the rack extends past the viewport", () => {
      // A tiny viewport cannot contain the rack, so the camera must animate.
      const { store, mockPanzoom } = setup(200, 200);
      const rack = createTestRack({ id: "rack-1", height: 42 });

      vi.useFakeTimers();
      store.ensureRacksVisible(["rack-1"], [rack]);
      vi.advanceTimersByTime(400);

      // The animated camera lands via per-frame zoomAbs(0, 0, scale) + moveTo.
      expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(
        0,
        0,
        expect.any(Number),
      );
      expect(mockPanzoom.moveTo).toHaveBeenCalled();
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

      stubReducedMotion(prefersReducedMotion);

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

      vi.useFakeTimers();
      store.zoomToDevice(rack, 0, [deviceType]);
      vi.advanceTimersByTime(400);

      // The camera animates to the (clamped) target via per-frame zoomAbs.
      const [, , scale] = mockPanzoom.zoomAbs.mock.calls.at(-1) as [
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

      vi.useFakeTimers();
      store.zoomToDevice(rack, 0, [deviceType]);
      vi.advanceTimersByTime(400);

      const [, , scale] = mockPanzoom.zoomAbs.mock.calls.at(-1) as [
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
      // Drive the animation loop to completion so the camera lands on target.
      vi.advanceTimersByTime(400);

      // The camera settles on the (clamped) target zoom, read from the final frame.
      const [, , zoom] = mockPanzoom.zoomAbs.mock.calls.at(-1) as [
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

      // The final animation frame lands the device center at the viewport center.
      const [panX, panY] = mockPanzoom.moveTo.mock.calls.at(-1) as [
        number,
        number,
      ];
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
