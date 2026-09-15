/**
 * Tests for the device image cropper geometry
 *
 * Covers the crop frame aspect (U height by rack width), cover clamping while
 * panning and zooming, anchored zoom, and mapping the view back to a source
 * rectangle in natural image pixels.
 */
import { describe, it, expect } from "vitest";
import {
  clampView,
  fitFrame,
  getCoverScale,
  getCropOutputSize,
  getCropRect,
  getDeviceImageAspect,
  getVisibleFraction,
  MAX_CROP_OUTPUT_EDGE,
  MAX_CROP_ZOOM,
  panView,
  zoomView,
} from "$lib/utils/image-crop";

const image = { width: 2000, height: 1000 };
const frame = { width: 400, height: 100 };

describe("getDeviceImageAspect", () => {
  it("gets taller as U height grows", () => {
    const oneU = getDeviceImageAspect(1, 19);
    const twoU = getDeviceImageAspect(2, 19);
    expect(twoU).toBeCloseTo(oneU / 2);
  });

  it("is narrower in a 10 inch rack than a 19 inch rack", () => {
    expect(getDeviceImageAspect(1, 10)).toBeLessThan(
      getDeviceImageAspect(1, 19),
    );
  });

  it("falls back to 1U for heights a device cannot have", () => {
    const oneU = getDeviceImageAspect(1, 19);
    expect(getDeviceImageAspect(Number.NaN, 19)).toBe(oneU);
    expect(getDeviceImageAspect(0, 19)).toBe(oneU);
    expect(getDeviceImageAspect(100, 19)).toBe(oneU);
  });
});

describe("getVisibleFraction", () => {
  it("trims the sides when drawn into a narrower box", () => {
    expect(getVisibleFraction(8, 4)).toEqual({ width: 0.5, height: 1 });
  });

  it("trims the top and bottom when drawn into a wider box", () => {
    expect(getVisibleFraction(4, 8)).toEqual({ width: 1, height: 0.5 });
  });
});

describe("fitFrame", () => {
  it("fills the width for wide frames", () => {
    expect(fitFrame(4, { width: 400, height: 300 })).toEqual({
      width: 400,
      height: 100,
    });
  });

  it("fills the height for tall frames", () => {
    expect(fitFrame(0.5, { width: 400, height: 300 })).toEqual({
      width: 150,
      height: 300,
    });
  });
});

describe("clampView", () => {
  it("never zooms out past the cover scale", () => {
    const view = clampView({ x: 0, y: 0, scale: 0.01 }, image, frame);
    expect(view.scale).toBe(getCoverScale(image, frame));
  });

  it("caps zoom at the maximum", () => {
    const view = clampView({ x: 0, y: 0, scale: 100 }, image, frame);
    expect(view.scale).toBeCloseTo(0.2 * MAX_CROP_ZOOM);
  });

  it("keeps the image covering every frame edge", () => {
    const view = clampView({ x: 50, y: -5000, scale: 0.4 }, image, frame);
    expect(view.x).toBe(0);
    expect(view.y).toBe(frame.height - image.height * 0.4);
  });
});

describe("panView", () => {
  it("moves the image within bounds", () => {
    const start = { x: -100, y: -100, scale: 0.4 };
    expect(panView(start, 30, -20, image, frame)).toEqual({
      x: -70,
      y: -120,
      scale: 0.4,
    });
  });
});

describe("zoomView", () => {
  it("keeps the image point under the anchor fixed", () => {
    const start = { x: 0, y: -50, scale: 0.2 };
    const anchorX = 200;
    const anchorY = 50;
    const naturalX = (anchorX - start.x) / start.scale;
    const naturalY = (anchorY - start.y) / start.scale;

    const zoomed = zoomView(start, 0.8, anchorX, anchorY, image, frame);

    expect(zoomed.scale).toBe(0.8);
    expect(zoomed.x + naturalX * zoomed.scale).toBeCloseTo(anchorX);
    expect(zoomed.y + naturalY * zoomed.scale).toBeCloseTo(anchorY);
  });

  it("clamps the position when zooming out near an edge", () => {
    // Unclamped, the anchored zoom would leave the image at (320, 80),
    // uncovering the frame's left and top edges.
    const zoomedIn = { x: 0, y: 0, scale: 1 };
    const out = zoomView(zoomedIn, 0.2, 400, 100, image, frame);
    expect(out).toEqual({ x: 0, y: 0, scale: 0.2 });
  });
});

describe("getCropRect", () => {
  it("maps the view to natural pixels with the frame aspect", () => {
    const crop = getCropRect({ x: -200, y: -100, scale: 0.5 }, image, frame);
    expect(crop).toEqual({ x: 400, y: 200, width: 800, height: 200 });
    expect(crop.width / crop.height).toBe(frame.width / frame.height);
  });

  it("stays inside the image", () => {
    const view = clampView({ x: -1e6, y: -1e6, scale: 1 }, image, frame);
    const crop = getCropRect(view, image, frame);
    expect(crop.x + crop.width).toBeLessThanOrEqual(image.width);
    expect(crop.y + crop.height).toBeLessThanOrEqual(image.height);
  });
});

describe("getCropOutputSize", () => {
  it("keeps natural resolution for small crops", () => {
    expect(
      getCropOutputSize({ x: 0, y: 0, width: 800, height: 200 }, 4),
    ).toEqual({ width: 800, height: 200 });
  });

  it("limits the longest edge for large crops", () => {
    const size = getCropOutputSize(
      { x: 0, y: 0, width: 6000, height: 1500 },
      4,
    );
    expect(size.width).toBe(MAX_CROP_OUTPUT_EDGE);
    expect(size.height).toBe(MAX_CROP_OUTPUT_EDGE / 4);
  });
});
