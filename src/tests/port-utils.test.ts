import { describe, it, expect } from "vitest";
import {
  getDominantInterfaceType,
  getPortMarkerShape,
  inferDirection,
} from "$lib/utils/port-utils";
import { InterfaceTemplateSchema, PlacedPortSchema } from "$lib/schemas";
import { createTestInterfaceTemplate, createTestPlacedPort } from "./factories";

describe("inferDirection", () => {
  it("defaults management-only interfaces to input", () => {
    expect(inferDirection("1000base-t", true)).toBe("input");
  });

  it("mgmt_only takes priority over an AV type's no-default rule", () => {
    expect(inferDirection("hdmi", true)).toBe("input");
  });

  it.each(["console", "rs-232", "rs-422"])("defaults %s to input", (type) => {
    expect(inferDirection(type)).toBe("input");
  });

  it.each([
    "xlr-3",
    "trs-1-4",
    "ts-1-4",
    "rca",
    "adat-optical",
    "midi-din",
    "bnc",
    "db25-audio",
    "phoenix",
    "speakon",
    "xlr-5",
    "displayport",
    "hdmi",
    "sdi-bnc",
    "vga",
    "dmx-xlr",
    "aes3",
    "avb",
    "dante",
  ])("has no default direction for AV type %s", (type) => {
    expect(inferDirection(type)).toBeUndefined();
  });

  it.each(["1000base-t", "10gbase-t", "usb-c", "management", "virtual"])(
    "defaults %s to bidirectional",
    (type) => {
      expect(inferDirection(type)).toBe("bidirectional");
    },
  );
});

describe("PlacedPort direction override", () => {
  it("can differ from and override the InterfaceTemplate default", () => {
    const template = createTestInterfaceTemplate({
      type: "hdmi",
      direction: "input",
    });
    const port = createTestPlacedPort({ type: "hdmi", direction: "output" });

    expect(InterfaceTemplateSchema.parse(template).direction).toBe("input");
    expect(PlacedPortSchema.parse(port).direction).toBe("output");
  });
});

describe("getPortMarkerShape", () => {
  it.each([
    "1000base-x-sfp",
    "10gbase-x-sfpp",
    "25gbase-x-sfp28",
    "40gbase-x-qsfpp",
    "400gbase-x-qsfpdd",
  ])("draws pluggable type %s as a square", (type) => {
    expect(getPortMarkerShape(type)).toBe("square");
  });

  it.each(["1000base-t", "10gbase-t", "console", "hdmi", "other"])(
    "draws %s as a circle",
    (type) => {
      expect(getPortMarkerShape(type)).toBe("circle");
    },
  );

  it("draws an unknown type from a newer build as a circle", () => {
    expect(getPortMarkerShape("constructor")).toBe("circle");
  });

  it("draws an unknown pluggable type from a newer build as a square", () => {
    expect(getPortMarkerShape("800gbase-x-qsfpdd")).toBe("square");
  });
});

describe("getDominantInterfaceType", () => {
  it("returns the most frequent type", () => {
    expect(
      getDominantInterfaceType([
        "10gbase-x-sfpp",
        "1000base-t",
        "1000base-t",
        "1000base-t",
        "10gbase-x-sfpp",
      ]),
    ).toBe("1000base-t");
  });

  it("breaks a tie in favour of the type that appears first", () => {
    expect(
      getDominantInterfaceType([
        "10gbase-x-sfpp",
        "1000base-t",
        "1000base-t",
        "10gbase-x-sfpp",
      ]),
    ).toBe("10gbase-x-sfpp");
  });

  it("counts a type named after an Object prototype member", () => {
    expect(
      getDominantInterfaceType(["constructor", "constructor", "1000base-t"]),
    ).toBe("constructor");
  });

  it("has no dominant type for no ports", () => {
    expect(getDominantInterfaceType([])).toBeUndefined();
  });
});
