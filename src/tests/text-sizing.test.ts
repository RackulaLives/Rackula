import { describe, it, expect } from "vitest";
import {
  calculateFontSize,
  truncateWithEllipsis,
  fitTextToWidth,
  wrapText,
  computeDeviceLabelLayout,
  REAR_TAG_WIDTH,
  DEVICE_LABEL_MAX_FONT,
  DEVICE_LABEL_MIN_FONT,
  DEVICE_LABEL_IMAGE_MAX_FONT,
  DEVICE_LABEL_ICON_SPACE_LEFT,
  DEVICE_LABEL_ICON_SPACE_RIGHT,
} from "$lib/utils/text-sizing";
import {
  computeDeviceZones,
  countVisiblePorts,
  PORT_ZONE_GAP,
} from "$lib/utils/port-geometry";
import { createTestInterfaceTemplate } from "./factories";

describe("Text Sizing Utility", () => {
  describe("calculateFontSize", () => {
    const defaultOptions = {
      maxFontSize: 13,
      minFontSize: 9,
      availableWidth: 150,
    };

    it("returns max font size for short text", () => {
      const result = calculateFontSize("Server", defaultOptions);
      expect(result).toBe(13);
    });

    it("returns max font size for empty text", () => {
      const result = calculateFontSize("", defaultOptions);
      expect(result).toBe(13);
    });

    it("scales down font for longer text", () => {
      const result = calculateFontSize(
        "HP ProLiant DL380 Gen10 - Production DB",
        defaultOptions,
      );
      expect(result).toBeLessThan(13);
      expect(result).toBeGreaterThanOrEqual(9);
    });

    it("returns min font size for very long text", () => {
      const result = calculateFontSize(
        "This is an extremely long device name that would never fit in a normal rack device label area",
        defaultOptions,
      );
      expect(result).toBe(9);
    });

    it("respects custom min/max font sizes", () => {
      const result = calculateFontSize("Medium length name", {
        maxFontSize: 16,
        minFontSize: 10,
        availableWidth: 100,
      });
      expect(result).toBeGreaterThanOrEqual(10);
      expect(result).toBeLessThanOrEqual(16);
    });

    it("handles narrow available width", () => {
      const result = calculateFontSize("Server Name", {
        ...defaultOptions,
        availableWidth: 50,
      });
      expect(result).toBeLessThan(13);
    });

    it("handles wide available width", () => {
      const result = calculateFontSize("Short", {
        ...defaultOptions,
        availableWidth: 300,
      });
      expect(result).toBe(13);
    });
  });

  describe("truncateWithEllipsis", () => {
    it("returns original text if it fits", () => {
      const result = truncateWithEllipsis("Short", 100, 13);
      expect(result).toBe("Short");
    });

    it("truncates long text with ellipsis", () => {
      const result = truncateWithEllipsis(
        "This is a very long device name",
        80,
        13,
      );
      expect(result).toContain("…");
      expect(result.length).toBeLessThan(
        "This is a very long device name".length,
      );
    });

    it("returns ellipsis only for extremely narrow width", () => {
      const result = truncateWithEllipsis("Server", 10, 13);
      expect(result).toBe("…");
    });

    it("handles empty string", () => {
      const result = truncateWithEllipsis("", 100, 13);
      expect(result).toBe("");
    });
  });

  describe("fitTextToWidth", () => {
    const defaultOptions = {
      maxFontSize: 13,
      minFontSize: 9,
      availableWidth: 150,
    };

    it("returns original text and max size for short text", () => {
      const result = fitTextToWidth("Server", defaultOptions);
      expect(result.text).toBe("Server");
      expect(result.fontSize).toBe(13);
    });

    it("scales font for medium-length text", () => {
      const result = fitTextToWidth("HP ProLiant DL380 Gen10", defaultOptions);
      expect(result.text).toBe("HP ProLiant DL380 Gen10");
      expect(result.fontSize).toBeLessThanOrEqual(13);
      expect(result.fontSize).toBeGreaterThanOrEqual(9);
    });

    it("truncates and uses min size for very long text", () => {
      const result = fitTextToWidth(
        "This is an extremely long device name that will definitely need truncation",
        { ...defaultOptions, availableWidth: 100 },
      );
      expect(result.text).toContain("…");
      expect(result.fontSize).toBe(9);
    });

    it("handles empty text", () => {
      const result = fitTextToWidth("", defaultOptions);
      expect(result.text).toBe("");
      expect(result.fontSize).toBe(13);
    });

    it("handles zero available width", () => {
      const result = fitTextToWidth("Server", {
        ...defaultOptions,
        availableWidth: 0,
      });
      expect(result.text).toBe("…");
      expect(result.fontSize).toBe(9);
    });

    it("handles negative available width", () => {
      const result = fitTextToWidth("Server", {
        ...defaultOptions,
        availableWidth: -100,
      });
      expect(result.text).toBe("…");
      expect(result.fontSize).toBe(9);
    });

    it("uses fixed character width regardless of actual glyph width", () => {
      // Implementation uses a fixed CHAR_WIDTH_RATIO (0.58) for all characters.
      // This means "WWWWWWWWWW" and "iiiiiiiiii" (both 10 chars) produce
      // identical results despite real rendering differences.
      const wideChars = fitTextToWidth("WWWWWWWWWW", {
        ...defaultOptions,
        availableWidth: 100,
      });
      const narrowChars = fitTextToWidth("iiiiiiiiii", {
        ...defaultOptions,
        availableWidth: 100,
      });
      // Same character count = same result (known limitation)
      expect(wideChars.fontSize).toBe(narrowChars.fontSize);
      expect(wideChars.text.length).toBe(narrowChars.text.length);
    });

    it("scales based on character count not actual glyph widths", () => {
      // With constrained width, longer strings scale down regardless of character type
      const constrainedOptions = { ...defaultOptions, availableWidth: 80 };
      const shortText = fitTextToWidth("WWWWW", constrainedOptions); // 5 chars
      const longText = fitTextToWidth("iiiiiiiiiiiiiiii", constrainedOptions); // 16 chars
      // Shorter string gets larger font despite using "wide" characters
      // because algorithm only considers character count, not glyph widths
      expect(shortText.fontSize).toBeGreaterThan(longText.fontSize);
    });
  });

  describe("Shared Constants", () => {
    it("exports correct device label font sizes", () => {
      expect(DEVICE_LABEL_MAX_FONT).toBe(13);
      expect(DEVICE_LABEL_MIN_FONT).toBe(9);
      expect(DEVICE_LABEL_IMAGE_MAX_FONT).toBe(12);
    });

    it("exports correct icon spacing values", () => {
      expect(DEVICE_LABEL_ICON_SPACE_LEFT).toBe(28);
      expect(DEVICE_LABEL_ICON_SPACE_RIGHT).toBe(20);
    });

    it("icon spacing leaves reasonable text area", () => {
      // For a typical device width of ~140px (150px - 2*5px rails)
      const typicalDeviceWidth = 140;
      const availableForText =
        typicalDeviceWidth -
        DEVICE_LABEL_ICON_SPACE_LEFT -
        DEVICE_LABEL_ICON_SPACE_RIGHT;
      // Should leave at least 80px for text
      expect(availableForText).toBeGreaterThanOrEqual(80);
    });
  });

  describe("wrapText", () => {
    const text = "Nothing rear-mounted in this rack yet";

    it("keeps text on one line when it fits", () => {
      expect(wrapText(text, 1000, 11)).toEqual([text]);
    });

    it("breaks at word boundaries so every line fits the width", () => {
      const width = 80;
      const lines = wrapText(text, width, 11);
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(
          fitTextToWidth(line, {
            maxFontSize: 11,
            minFontSize: 11,
            availableWidth: width,
          }).text,
        ).toBe(line);
      }
      expect(lines.join(" ")).toBe(text);
    });

    it("puts a word wider than the width on its own line instead of splitting it", () => {
      const lines = wrapText("a rear-mounted b", 20, 11);
      expect(lines).toContain("rear-mounted");
      expect(lines.join(" ")).toBe("a rear-mounted b");
    });

    it("returns no lines for empty text", () => {
      expect(wrapText("   ", 100, 11)).toEqual([]);
    });
  });

  describe("computeDeviceLabelLayout", () => {
    /** 19-inch rack interior width (BASE_RACK_WIDTH - 2 * RAIL_WIDTH). */
    const WIDE = 186;
    /** 10-inch rack interior width. */
    const NARROW = 82;
    /** 1U device height (U_HEIGHT_PX). */
    const ONE_U = 22;

    function layoutFor(
      deviceWidth: number,
      visiblePortCount: number,
      isRearTreatment = false,
    ) {
      const zones = computeDeviceZones({
        deviceWidth,
        deviceHeight: ONE_U,
        visiblePortCount,
      });
      return {
        zones,
        layout: computeDeviceLabelLayout({
          zones,
          deviceWidth,
          isRearTreatment,
        }),
      };
    }

    function fit(name: string, availableWidth: number) {
      return fitTextToWidth(name, {
        maxFontSize: DEVICE_LABEL_MAX_FONT,
        minFontSize: DEVICE_LABEL_MIN_FONT,
        availableWidth,
      });
    }

    it("keeps the centred label and its width when no ports are visible", () => {
      for (const isRearTreatment of [false, true]) {
        const { layout } = layoutFor(WIDE, 0, isRearTreatment);
        expect(layout.anchor).toBe("middle");
        expect(layout.x).toBe(WIDE / 2);
        expect(layout.availableWidth).toBe(
          WIDE - DEVICE_LABEL_ICON_SPACE_LEFT - DEVICE_LABEL_ICON_SPACE_RIGHT,
        );
        expect(layout.rearTag).toBeUndefined();
      }
    });

    it("starts the label at the label zone and keeps it left of the ports", () => {
      for (const count of [1, 12, 24, 48]) {
        const { zones, layout } = layoutFor(WIDE, count);
        expect(layout.anchor).toBe("start");
        expect(layout.x).toBe(zones.labelX);
        expect(layout.availableWidth).toBeLessThanOrEqual(zones.labelWidth);
        expect(layout.x + layout.availableWidth).toBeLessThanOrEqual(
          zones.portZone.x - PORT_ZONE_GAP,
        );
        expect(layout.rearTag).toBeUndefined();
      }
    });

    it("gives the label less room on a device with ports than on one without", () => {
      expect(layoutFor(WIDE, 24).layout.availableWidth).toBeLessThan(
        layoutFor(WIDE, 0).layout.availableWidth,
      );
    });

    it("puts the REAR tag between the label and the port zone", () => {
      for (const count of [4, 24, 48]) {
        const { zones, layout } = layoutFor(WIDE, count, true);
        const front = layoutFor(WIDE, count).layout;
        const tag = layout.rearTag;
        if (!tag) throw new Error("expected an in-flow REAR tag");

        // Right-anchored immediately left of the port zone, vertically centred.
        expect(tag.x).toBe(zones.portZone.x - PORT_ZONE_GAP);
        expect(tag.y).toBe(ONE_U / 2);
        // The label gives up the tag's width and never runs under it.
        expect(layout.availableWidth).toBeLessThan(front.availableWidth);
        expect(layout.x + layout.availableWidth).toBeLessThan(
          tag.x - REAR_TAG_WIDTH,
        );
      }
    });

    it("truncates a long name on a 24-port 1U device instead of overflowing", () => {
      const name = "Core Distribution Patch Panel Row 12 Cabinet 4 Upper";
      const { layout } = layoutFor(WIDE, 24);
      const fitted = fit(name, layout.availableWidth);

      expect(fitted.text.endsWith("…")).toBe(true);
      // The same name keeps more of its text when no ports take room.
      expect(
        fit(name, layoutFor(WIDE, 0).layout.availableWidth).text.length,
      ).toBeGreaterThan(fitted.text.length);
    });

    it("never returns a negative width on a narrow rack", () => {
      for (const count of [0, 4, 24, 48]) {
        for (const isRearTreatment of [false, true]) {
          const { layout } = layoutFor(NARROW, count, isRearTreatment);
          expect(layout.availableWidth).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it("counts only the ports on the face in view", () => {
      const interfaces = [
        createTestInterfaceTemplate({ name: "eth0" }),
        createTestInterfaceTemplate({ name: "eth1", position: "front" }),
        createTestInterfaceTemplate({ name: "mgmt", position: "rear" }),
      ];
      expect(countVisiblePorts(interfaces, "front")).toBe(2);
      expect(countVisiblePorts(interfaces, "rear")).toBe(1);
      expect(countVisiblePorts([], "front")).toBe(0);
    });
  });
});
