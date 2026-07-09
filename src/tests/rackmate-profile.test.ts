import { describe, expect, it } from "vitest";
import { LayoutSchema, RackSchema } from "$lib/schemas";
import { createDefaultRack } from "$lib/utils/serialization";
import { RACKMATE_T1_PLUS_DEPTH_MM } from "$lib/types/constants";

describe("RackMate profile defaults", () => {
  it("creates 10-inch racks at the RackMate T1 Plus depth", () => {
    const rack = createDefaultRack("RackMate", 8, 10);

    expect(rack.depth_mm).toBe(RACKMATE_T1_PLUS_DEPTH_MM);
  });

  it("keeps generic racks at the standard default depth", () => {
    const rack = createDefaultRack("Generic", 24, 19);

    expect(rack.depth_mm).toBe(1000);
  });

  it("normalizes standalone 10-inch rack schema parses to RackMate depth", () => {
    const parsed = RackSchema.parse({
      id: "rack-1",
      name: "RackMate",
      height: 8,
      width: 10,
      depth_mm: 1000,
      desc_units: false,
      show_rear: true,
      form_factor: "4-post-cabinet",
      starting_unit: 1,
      position: 0,
      devices: [],
    });

    expect(parsed.depth_mm).toBe(RACKMATE_T1_PLUS_DEPTH_MM);
  });

  it("normalizes loaded 10-inch layouts to RackMate depth", () => {
    const parsed = LayoutSchema.parse({
      version: "1.0.0",
      name: "RackMate layout",
      racks: [
        {
          id: "rack-1",
          name: "RackMate",
          height: 8,
          width: 10,
          depth_mm: 1000,
          desc_units: false,
          show_rear: true,
          form_factor: "4-post-cabinet",
          starting_unit: 1,
          position: 0,
          devices: [],
        },
      ],
      device_types: [],
      settings: {
        display_mode: "label",
        show_labels_on_images: false,
      },
    });

    expect(parsed.racks[0]?.depth_mm).toBe(RACKMATE_T1_PLUS_DEPTH_MM);
  });
});
