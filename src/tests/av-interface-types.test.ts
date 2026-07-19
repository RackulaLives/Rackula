import { describe, it, expect } from "vitest";
import { InterfaceTemplateSchema } from "$lib/schemas";

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
      const result = InterfaceTemplateSchema.safeParse({ name: "Mic 1", type });
      expect(result.success).toBe(true);
    },
  );
});
