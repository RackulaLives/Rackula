/**
 * Image crop utilities
 * Geometry for the device image cropper: the crop frame takes the drawn shape
 * of the device image (U height by interior rack width plus the image
 * overflow), and the image is panned and zoomed behind it. The frame is always
 * fully covered by the image.
 */

import {
  DEVICE_IMAGE_OVERFLOW,
  getInteriorWidth,
  getRackWidth,
  U_HEIGHT_PX,
} from "$lib/constants/layout";
import {
  MAX_DEVICE_HEIGHT,
  MIN_DEVICE_HEIGHT,
  STANDARD_RACK_WIDTH,
} from "$lib/types/constants";

/** Largest zoom allowed, as a multiple of the cover scale. */
export const MAX_CROP_ZOOM = 10;

/** Longest edge of the cropped output image, in pixels. */
export const MAX_CROP_OUTPUT_EDGE = 2400;

export interface Size {
  width: number;
  height: number;
}

/** Image placement relative to the crop frame's top-left corner, in frame pixels. */
export interface CropView {
  x: number;
  y: number;
  /** Frame pixels per natural image pixel. */
  scale: number;
}

/** Source rectangle in natural image pixels. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Device height the crop frame is shaped for: the given height when it is a
 * valid device height, otherwise 1U.
 */
export function getCropUnitHeight(uHeight: number): number {
  return Number.isFinite(uHeight) &&
    uHeight >= MIN_DEVICE_HEIGHT &&
    uHeight <= MAX_DEVICE_HEIGHT
    ? uHeight
    : 1;
}

/**
 * Width-to-height ratio of the box a device image is drawn into in the rack.
 *
 * A device that spans the rails (fraction 1) is drawn a little wider than the
 * clear interior, because the image overhangs the rails for a mounted look. A
 * narrower device sits in a carrier cell, which is drawn inside the interior
 * with no overhang, so its share of the interior is the whole frame.
 *
 * @param uHeight - Device height in rack units
 * @param rackWidth - Nominal rack width in inches (10, 19, 21, or 23)
 * @param widthFraction - The device's share of the rack interior, 0 to 1
 */
export function getDeviceImageAspect(
  uHeight: number,
  rackWidth: number = STANDARD_RACK_WIDTH,
  widthFraction: number = 1,
): number {
  const interior = getInteriorWidth(getRackWidth(rackWidth));
  const fraction =
    Number.isFinite(widthFraction) && widthFraction > 0 && widthFraction < 1
      ? widthFraction
      : 1;
  const width =
    fraction < 1 ? interior * fraction : interior + DEVICE_IMAGE_OVERFLOW * 2;
  return width / (getCropUnitHeight(uHeight) * U_HEIGHT_PX);
}

/**
 * Share of a crop (of the given aspect) that stays visible when it is drawn
 * centred and sliced into a box of another aspect.
 */
export function getVisibleFraction(aspect: number, drawnAspect: number): Size {
  return drawnAspect < aspect
    ? { width: drawnAspect / aspect, height: 1 }
    : { width: 1, height: aspect / drawnAspect };
}

/**
 * Largest frame of the given aspect ratio that fits inside a bounding box.
 */
export function fitFrame(aspect: number, bounds: Size): Size {
  if (bounds.width / bounds.height > aspect) {
    return { width: bounds.height * aspect, height: bounds.height };
  }
  return { width: bounds.width, height: bounds.width / aspect };
}

/** Smallest scale at which the image covers the whole frame. */
export function getCoverScale(image: Size, frame: Size): number {
  return Math.max(frame.width / image.width, frame.height / image.height);
}

/** Keep a scale within [cover, cover * MAX_CROP_ZOOM]. */
function clampScale(scale: number, image: Size, frame: Size): number {
  const minScale = getCoverScale(image, frame);
  return Math.min(Math.max(scale, minScale), minScale * MAX_CROP_ZOOM);
}

/** Pixels a wheel notch reported in DOM_DELTA_LINE units stands for. */
const WHEEL_LINE_HEIGHT_PX = 16;

/**
 * A wheel event's deltaY in pixels, whatever unit the browser reported.
 *
 * Chrome and Safari report DOM_DELTA_PIXEL, so deltaY is already pixels, but
 * Firefox reports DOM_DELTA_LINE with deltaY of about 3 per notch. Reading that
 * as pixels makes a notch roughly a thirtieth of its intended zoom step, so
 * scroll-to-zoom looks broken. DOM_DELTA_PAGE is a viewport height.
 *
 * @param deltaY - The event's raw deltaY.
 * @param deltaMode - The event's deltaMode (0 pixel, 1 line, 2 page).
 * @param pageHeight - Viewport height in pixels, used for DOM_DELTA_PAGE.
 */
export function wheelDeltaPixels(
  deltaY: number,
  deltaMode: number,
  pageHeight: number,
): number {
  if (deltaMode === 1) return deltaY * WHEEL_LINE_HEIGHT_PX;
  if (deltaMode === 2) return deltaY * pageHeight;
  return deltaY;
}

/**
 * Keep the scale within [cover, cover * MAX_CROP_ZOOM] and the image covering
 * the frame on every side.
 */
export function clampView(view: CropView, image: Size, frame: Size): CropView {
  const scale = clampScale(view.scale, image, frame);
  const minX = frame.width - image.width * scale;
  const minY = frame.height - image.height * scale;
  return {
    x: Math.min(0, Math.max(minX, view.x)),
    y: Math.min(0, Math.max(minY, view.y)),
    scale,
  };
}

/**
 * Change the scale while keeping the image point under (anchorX, anchorY),
 * in frame pixels, fixed on screen. The result is clamped.
 */
export function zoomView(
  view: CropView,
  nextScale: number,
  anchorX: number,
  anchorY: number,
  image: Size,
  frame: Size,
): CropView {
  const scale = clampScale(nextScale, image, frame);
  const ratio = scale / view.scale;
  return clampView(
    {
      x: anchorX - (anchorX - view.x) * ratio,
      y: anchorY - (anchorY - view.y) * ratio,
      scale,
    },
    image,
    frame,
  );
}

/** Move the image by (dx, dy) frame pixels. The result is clamped. */
export function panView(
  view: CropView,
  dx: number,
  dy: number,
  image: Size,
  frame: Size,
): CropView {
  return clampView(
    { x: view.x + dx, y: view.y + dy, scale: view.scale },
    image,
    frame,
  );
}

/** The part of the natural image visible inside the frame. */
export function getCropRect(
  view: CropView,
  image: Size,
  frame: Size,
): CropRect {
  const width = Math.min(image.width, frame.width / view.scale);
  const height = Math.min(image.height, frame.height / view.scale);
  return {
    x: Math.min(image.width - width, Math.max(0, -view.x / view.scale)),
    y: Math.min(image.height - height, Math.max(0, -view.y / view.scale)),
    width,
    height,
  };
}

/**
 * Output size for a crop: the crop's natural resolution, scaled down so the
 * longest edge is at most MAX_CROP_OUTPUT_EDGE, keeping the frame aspect.
 */
export function getCropOutputSize(crop: CropRect, aspect: number): Size {
  let width = crop.width;
  let height = width / aspect;
  const longest = Math.max(width, height);
  if (longest > MAX_CROP_OUTPUT_EDGE) {
    const ratio = MAX_CROP_OUTPUT_EDGE / longest;
    width *= ratio;
    height *= ratio;
  }
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

/**
 * Draw the crop of an image into a new file of the same type. A crop of the
 * whole image at its natural size returns the source file untouched, so it is
 * not re-encoded.
 */
export function cropImageToFile(
  image: HTMLImageElement,
  crop: CropRect,
  aspect: number,
  source: File,
): Promise<File> {
  const output = getCropOutputSize(crop, aspect);
  if (
    Math.abs(crop.x) < 0.5 &&
    Math.abs(crop.y) < 0.5 &&
    output.width === image.naturalWidth &&
    output.height === image.naturalHeight
  ) {
    return Promise.resolve(source);
  }
  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Failed to get canvas context"));
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    output.width,
    output.height,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to create blob from canvas"));
          return;
        }
        resolve(new File([blob], source.name, { type: blob.type }));
      },
      source.type,
      0.92,
    );
  });
}
