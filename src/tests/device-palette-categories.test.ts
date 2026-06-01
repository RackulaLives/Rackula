import { describe, it, expect } from "vitest";
import { DeviceCategorySchema } from "$lib/schemas";
import { categoryOrder } from "$lib/utils/deviceFilters";

describe("DevicePalette category grouping", () => {
  it("includes all DeviceCategory values in categoryOrder", () => {
    for (const cat of DeviceCategorySchema.options) {
      expect(categoryOrder).toContain(cat);
    }
  });

  it("includes chassis devices in category-grouped sections", () => {
    expect(categoryOrder).toContain("chassis");
  });
});
