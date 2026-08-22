import { describe, expect, it } from "vitest";
import { deriveGender } from "$lib/utils/port-utils";

describe("deriveGender", () => {
  it("derives XLR gender per AES14 from direction", () => {
    expect(deriveGender("xlr-3", "output")).toBe("male");
    expect(deriveGender("xlr-3", "input")).toBe("female");
    expect(deriveGender("xlr-5", "output")).toBe("male");
    expect(deriveGender("xlr-5", "input")).toBe("female");
  });

  it("returns undefined for XLR without a resolved direction", () => {
    expect(deriveGender("xlr-3")).toBeUndefined();
    expect(deriveGender("xlr-3", "bidirectional")).toBeUndefined();
  });

  it("derives Speakon chassis gender regardless of direction", () => {
    expect(deriveGender("speakon")).toBe("male");
    expect(deriveGender("speakon", "input")).toBe("male");
    expect(deriveGender("speakon", "output")).toBe("male");
  });

  it("returns undefined for ambiguous or non-AV connectors", () => {
    expect(deriveGender("trs-1-4")).toBeUndefined();
    expect(deriveGender("ts-1-4")).toBeUndefined();
    expect(deriveGender("rca")).toBeUndefined();
    expect(deriveGender("hdmi")).toBeUndefined();
    expect(deriveGender("1000base-t")).toBeUndefined();
  });

  it("does not derive dmx-xlr (DMX512 reverses the AES14 convention)", () => {
    expect(deriveGender("dmx-xlr", "output")).toBeUndefined();
    expect(deriveGender("dmx-xlr", "input")).toBeUndefined();
  });
});
