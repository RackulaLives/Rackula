import { describe, expect, it } from "vitest";
import {
  InterfaceTemplateSchema,
  PlacedPortSchema,
  SignalTypeSchema,
} from "$lib/schemas";
import { getSignalLabel, inferSignalType } from "$lib/utils/port-utils";
import { createTestInterfaceTemplate, createTestPlacedPort } from "./factories";
import type { SignalType } from "$lib/types";

describe("inferSignalType", () => {
  it("infers mic level for XLR inputs and line level otherwise", () => {
    expect(inferSignalType("xlr-3", "input")).toBe("analog-audio-mic");
    expect(inferSignalType("xlr-3", "output")).toBe("analog-audio-line");
    expect(inferSignalType("xlr-3")).toBe("analog-audio-line");
  });

  it("maps analog connectors to line level and speakon to speaker level", () => {
    expect(inferSignalType("trs-1-4")).toBe("analog-audio-line");
    expect(inferSignalType("ts-1-4")).toBe("analog-audio-line");
    expect(inferSignalType("rca")).toBe("analog-audio-line");
    expect(inferSignalType("db25-audio")).toBe("analog-audio-line");
    expect(inferSignalType("phoenix")).toBe("analog-audio-line");
    expect(inferSignalType("speakon")).toBe("analog-audio-speaker");
  });

  it("maps digital audio, video, clock, and control connectors", () => {
    expect(inferSignalType("aes3")).toBe("digital-audio-aes3");
    expect(inferSignalType("dante")).toBe("digital-audio-dante");
    expect(inferSignalType("avb")).toBe("digital-audio-avb");
    expect(inferSignalType("hdmi")).toBe("digital-video-hdmi");
    expect(inferSignalType("sdi-bnc")).toBe("digital-video-sdi");
    expect(inferSignalType("bnc")).toBe("clock-word");
    expect(inferSignalType("midi-din")).toBe("control-midi");
  });

  it("returns undefined when the connector implies no distinct signal", () => {
    expect(inferSignalType("1000base-t")).toBeUndefined();
    expect(inferSignalType("console")).toBeUndefined();
    expect(inferSignalType("dmx-xlr")).toBeUndefined();
    expect(inferSignalType("adat-optical")).toBeUndefined();
    expect(inferSignalType("usb-c")).toBeUndefined();
  });
});

describe("getSignalLabel", () => {
  it("labels known signals and falls back to the raw slug", () => {
    expect(getSignalLabel("analog-audio-mic")).toBe("Mic level");
    expect(getSignalLabel("clock-word")).toBe("Word clock");
    expect(getSignalLabel("future-signal" as SignalType)).toBe("future-signal");
  });
});

describe("signal_type schema fields", () => {
  it("accepts signal_type on interface templates and placed ports", () => {
    const template = InterfaceTemplateSchema.parse(
      createTestInterfaceTemplate({
        type: "xlr-3",
        signal_type: "digital-audio-aes3",
      }),
    );
    expect(template.signal_type).toBe("digital-audio-aes3");

    const port = PlacedPortSchema.parse(
      createTestPlacedPort({ type: "xlr-3", signal_type: "analog-audio-mic" }),
    );
    expect(port.signal_type).toBe("analog-audio-mic");
  });

  it("rejects unknown signal_type values", () => {
    expect(SignalTypeSchema.safeParse("laser-show").success).toBe(false);
    expect(
      InterfaceTemplateSchema.safeParse({
        ...createTestInterfaceTemplate(),
        signal_type: "laser-show",
      }).success,
    ).toBe(false);
  });
});
