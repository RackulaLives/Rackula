import { describe, it, expect } from "vitest";
import { InterfaceTemplateSchema } from "$lib/schemas";
import { getPortCategory } from "$lib/utils/port-utils";
import { createTestInterfaceTemplate } from "./factories";

const PRO_AUDIO_TYPES = [
  "xlr-3",
  "trs-1-4",
  "ts-1-4",
  "rca",
  "adat-optical",
  "midi-din",
  "bnc",
  "db25-audio",
] as const;

describe("pro-audio interface types", () => {
  it.each(PRO_AUDIO_TYPES)(
    "schema accepts an interface template of type %s",
    (type) => {
      const result = InterfaceTemplateSchema.safeParse(
        createTestInterfaceTemplate({ type }),
      );
      expect(result.success).toBe(true);
    },
  );
});

// Remaining spike #1927 AV connector types (#1929): audio, video, control,
// and data-over-AV, added after the studio-audio subset landed via #3086.
const AV_CONNECTIVITY_TYPES = [
  // Audio
  "xlr-5",
  "speakon",
  "phoenix",
  // Video
  "hdmi",
  "displayport",
  "sdi-bnc",
  "vga",
  // Control
  "dmx-xlr",
  "rs-232",
  "rs-422",
  // Other
  "dante",
  "avb",
  "aes3",
] as const;

describe("AV connectivity interface types", () => {
  it.each(AV_CONNECTIVITY_TYPES)(
    "schema accepts an interface template of type %s",
    (type) => {
      const result = InterfaceTemplateSchema.safeParse(
        createTestInterfaceTemplate({ type }),
      );
      expect(result.success).toBe(true);
    },
  );
});

describe("AV port category routing", () => {
  it.each([...PRO_AUDIO_TYPES, ...AV_CONNECTIVITY_TYPES])(
    "%s routes to the av port category",
    (type) => {
      expect(getPortCategory(type)).toBe("av");
    },
  );

  it("leaves non-AV types on their existing category", () => {
    expect(getPortCategory("1000base-t")).toBe("network");
    expect(getPortCategory("console")).toBe("console");
    expect(getPortCategory("usb-c")).toBe("console");
  });
});
