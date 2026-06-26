import { describe, it, expect } from "vitest";
import { effectiveFace } from "$lib/utils/effective-face";

describe("effectiveFace", () => {
  it("returns 'both' for a full-depth device regardless of stored face", () => {
    expect(effectiveFace({ face: "front" }, { is_full_depth: undefined })).toBe(
      "both",
    );
    expect(effectiveFace({ face: "rear" }, { is_full_depth: true })).toBe(
      "both",
    );
    expect(effectiveFace({ face: "both" }, {})).toBe("both");
  });

  it("returns the stored face for a half-depth device", () => {
    expect(effectiveFace({ face: "front" }, { is_full_depth: false })).toBe(
      "front",
    );
    expect(effectiveFace({ face: "rear" }, { is_full_depth: false })).toBe(
      "rear",
    );
  });

  it("returns the stored face when the device type is unknown", () => {
    expect(effectiveFace({ face: "front" }, undefined)).toBe("front");
  });
});
