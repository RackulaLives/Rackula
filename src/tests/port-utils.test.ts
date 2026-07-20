import { describe, it, expect } from "vitest";
import { inferDirection } from "$lib/utils/port-utils";
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
