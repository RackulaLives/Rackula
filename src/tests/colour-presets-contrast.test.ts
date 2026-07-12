/**
 * Issue #3005: ColourPicker's preset swatches previously offered raw bright
 * Dracula accents (e.g. #FF5555). Picking one became the device's fill colour,
 * and the device label always renders in near-white (`--neutral-50`, see
 * RackDevice.svelte's `.device-name { fill: var(--neutral-50) }`), so a bright
 * preset put the label text under WCAG AA (BRAND.md forbids bright accents as
 * text backgrounds). This asserts every preset actually clears 4.5:1 against
 * that label colour via a computed contrast ratio, not a hardcoded hex
 * comparison, so a future preset addition that regresses contrast is caught.
 */
import { describe, it, expect } from "vitest";
import { COLOUR_PRESETS } from "$lib/constants/colourPresets";
import { getContrastRatio, tokenColors } from "$lib/utils/contrast";

describe("ColourPicker preset swatches (#3005)", () => {
  const deviceLabelColour = tokenColors["neutral-50"];

  it("offers at least one preset", () => {
    expect(COLOUR_PRESETS.length).toBeGreaterThan(0);
  });

  it.each(COLOUR_PRESETS.map((preset) => [preset.name, preset.hex]))(
    "%s (%s) meets WCAG AA (4.5:1) against the device label colour",
    (_name, hex) => {
      const ratio = getContrastRatio(deviceLabelColour, hex);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );
});
