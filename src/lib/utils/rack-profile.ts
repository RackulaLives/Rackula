import type { Rack } from "$lib/types";
import {
  DEFAULT_RACK_DEPTH_MM,
  RACKMATE_T1_PLUS_DEPTH_MM,
  RACKMATE_T1_PLUS_HEIGHT,
} from "$lib/types/constants";

export const RACKMATE_T1_PLUS_NAME = "RackMate T1 Plus";
export const RACKMATE_T1_PLUS_WIDTH: Rack["width"] = 10;

export function isRackMateRackWidth(
  width: Rack["width"] | number | undefined,
): width is typeof RACKMATE_T1_PLUS_WIDTH {
  return width === RACKMATE_T1_PLUS_WIDTH;
}

export function rackDepthForProfile(
  width: Rack["width"] | number | undefined,
  depthMm?: number,
): number {
  if (isRackMateRackWidth(width)) return RACKMATE_T1_PLUS_DEPTH_MM;
  return depthMm ?? DEFAULT_RACK_DEPTH_MM;
}

export function withRackProfileDefaults<
  T extends { width: Rack["width"]; depth_mm?: number },
>(rack: T): T & { depth_mm: number } {
  return {
    ...rack,
    depth_mm: rackDepthForProfile(rack.width, rack.depth_mm),
  };
}

export function createRackMateT1PlusDefaults(): Pick<
  Rack,
  | "name"
  | "height"
  | "width"
  | "depth_mm"
  | "form_factor"
  | "desc_units"
  | "starting_unit"
> {
  return {
    name: RACKMATE_T1_PLUS_NAME,
    height: RACKMATE_T1_PLUS_HEIGHT,
    width: RACKMATE_T1_PLUS_WIDTH,
    depth_mm: RACKMATE_T1_PLUS_DEPTH_MM,
    form_factor: "4-post-cabinet",
    desc_units: false,
    starting_unit: 1,
  };
}
