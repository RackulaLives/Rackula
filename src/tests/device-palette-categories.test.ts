import { describe, it, expect } from "vitest";
import { DeviceCategorySchema } from "$lib/schemas";
import { categoryOrder } from "$lib/utils/deviceFilters";

describe("DevicePalette category grouping", () => {
  it("categoryOrder is in sync with DeviceCategorySchema", () => {
    for (const cat of DeviceCategorySchema.options) {
      expect(categoryOrder).toContain(cat);
    }
    for (const cat of categoryOrder) {
      expect(DeviceCategorySchema.options).toContain(cat);
    }
    expect(categoryOrder.length).toBe(new Set(categoryOrder).size);
  });
});
