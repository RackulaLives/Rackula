/**
 * Image crop utilities
 * Geometry for the device image cropper: the crop frame takes the drawn shape
 * of the device face (U height by interior rack width), and the image is
 * panned and zoomed behind it. The frame is always fully covered by the image.
 */

import {
  getInteriorWidth,
  getRackWidth,
  U_HEIGHT_PX,
} from "$lib/constants/layout";
import { STANDARD_RACK_WIDTH } from "$lib/types/constants";

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
 * Width-to-height ratio of a device face as it is drawn in the rack.
 * @param uHeight - Device height in rack units
 * @param rackWidth - Nominal rack width in inches (10, 19, 21, or 23)
 * @param halfWidth - Device occupies half of the rack width
 */
export function getDeviceImageAspect(
  uHeight: number,
  rackWidth: number = STANDARD_RACK_WIDTH,
  halfWidth = false,
): number {
  const units = Number.isFinite(uHeight) && uHeight > 0 ? uHeight : 1;
  const width =
    getInteriorWidth(getRackWidth(rackWidth)) * (halfWidth ? 0.5 : 1);
  return width / (units * U_HEIGHT_PX);
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

/**
 * Keep the scale within [cover, cover * MAX_CROP_ZOOM] and the image covering
 * the frame on every side.
 */
export function clampView(view: CropView, image: Size, frame: Size): CropView {
  const minScale = getCoverScale(image, frame);
  const scale = Math.min(
    Math.max(view.scale, minScale),
    minScale * MAX_CROP_ZOOM,
  );
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
  const minScale = getCoverScale(image, frame);
  const scale = Math.min(
    Math.max(nextScale, minScale),
    minScale * MAX_CROP_ZOOM,
  );
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
 * Draw the crop of an image into a new file of the same type.
 */
export function cropImageToFile(
  image: HTMLImageElement,
  crop: CropRect,
  aspect: number,
  source: File,
): Promise<File> {
  const output = getCropOutputSize(crop, aspect);
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
