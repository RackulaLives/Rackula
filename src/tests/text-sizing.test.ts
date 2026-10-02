import { describe, it, expect } from "vitest";
import {
  calculateFontSize,
  estimateTextWidth,
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
  LABEL_MIN_WIDTH,
  PORT_ZONE_GAP,
} from "$lib/utils/port-geometry";
import { createTestInterfaceTemplate } from "./factories";

/**
 * Reference advance widths of Inter Medium (static/fonts/Inter-Medium.woff2),
 * the canvas device-label font at weight 500, in units of a 2048-unit em.
 * Read from the font's hmtx table with fontTools. Kerning is left out: in
 * Inter it narrows typical names slightly and widens only rare pairs such as
 * WW, by under 3%.
 */
const INTER_MEDIUM_ADVANCE: Record<string, number> = {
  " ": 546,
  "!": 623,
  '"': 1012,
  "#": 1308,
  $: 1323,
  "%": 2034,
  "&": 1338,
  "'": 641,
  "(": 755,
  ")": 755,
  "*": 1066,
  "+": 1367,
  ",": 621,
  "-": 947,
  ".": 621,
  "/": 757,
  "0": 1322,
  "1": 850,
  "2": 1262,
  "3": 1284,
  "4": 1344,
  "5": 1266,
  "6": 1290,
  "7": 1170,
  "8": 1289,
  "9": 1290,
  ":": 621,
  ";": 646,
  "<": 1367,
  "=": 1367,
  ">": 1367,
  "?": 1080,
  "@": 2012,
  A: 1452,
  B: 1345,
  C: 1502,
  D: 1478,
  E: 1235,
  F: 1207,
  G: 1531,
  H: 1525,
  I: 558,
  J: 1178,
  K: 1408,
  L: 1158,
  M: 1869,
  N: 1549,
  O: 1570,
  P: 1314,
  Q: 1574,
  R: 1327,
  S: 1323,
  T: 1337,
  U: 1516,
  V: 1452,
  W: 2054,
  X: 1435,
  Y: 1426,
  Z: 1312,
  "[": 755,
  "\\": 757,
  "]": 755,
  "^": 976,
  _: 948,
  "`": 690,
  a: 1163,
  b: 1266,
  c: 1182,
  d: 1266,
  e: 1203,
  f: 777,
  g: 1269,
  h: 1232,
  i: 516,
  j: 516,
  k: 1145,
  l: 516,
  m: 1819,
  n: 1232,
  o: 1237,
  p: 1266,
  q: 1266,
  r: 792,
  s: 1103,
  t: 697,
  u: 1232,
  v: 1177,
  w: 1698,
  x: 1141,
  y: 1178,
  z: 1145,
  "{": 902,
  "|": 708,
  "}": 902,
  "~": 1367,
  "…": 1864,
};

/** Rendered width of ASCII text in Inter Medium, in pixels. */
function referenceWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const char of text) units += INTER_MEDIUM_ADVANCE[char];
  return (units / 2048) * fontSize;
}

/** Mixed-case device names with digits and punctuation. */
const TYPICAL_NAMES = [
  "Patch Panel (24-Port)",
  "Dell PowerEdge R740xd",
  "UniFi Dream Machine Pro",
  "Synology DS920+",
  "Cisco Catalyst 9300-48P",
  "Raspberry Pi 4 Model B",
  "Brush panel, 1U",
  "Storage array: tier-2 [backup]",
  "pfSense firewall",
  "HPE ProLiant DL380 Gen10",
  "Core Distribution Patch Panel Row 12 Cabinet 4 Upper",
];

/** All-caps names and runs of the widest glyphs. */
const WIDE_NAMES = [
  "WWWWWWWWWW",
  "MMMMMMMM",
  "mmmmwwww",
  "ALL CAPS DEVICE NAME",
  "WAN MODEM",
  "QNAP TS-H1290FX",
  "OOOOQQQQ",
  "Mm Ww Mm Ww",
  "@@@%%%",
];

/** Largest allowed over-estimate for typical names, as a ratio. */
const TYPICAL_MARGIN = 1.08;

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

    it("never cuts inside a flag or ZWJ emoji", () => {
      const segmenter = new Intl.Segmenter(undefined, {
        granularity: "grapheme",
      });
      for (const text of ["Rack 🇨🇦 Edge", "Lab 👨‍👩‍👧‍👦 Family Switch"]) {
        const boundaries = new Set(
          Array.from(segmenter.segment(text), (s) => s.index),
        );
        for (let width = 10; width <= 200; width++) {
          const kept = truncateWithEllipsis(text, width, 13).replace(/…$/, "");
          expect(text.startsWith(kept)).toBe(true);
          expect(kept === text || boundaries.has(kept.length)).toBe(true);
        }
      }
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

    it("gives narrow glyphs more room than wide ones of the same count", () => {
      const options = { ...defaultOptions, availableWidth: 100 };
      const wide = fitTextToWidth("WWWWWWWWWW", options);
      const narrow = fitTextToWidth("iiiiiiiiii", options);
      expect(narrow.fontSize).toBeGreaterThan(wide.fontSize);
    });

    it("never lets the fitted text overflow the available width", () => {
      const names = [...TYPICAL_NAMES, ...WIDE_NAMES];
      for (const name of names) {
        for (let availableWidth = 40; availableWidth <= 200; availableWidth++) {
          const fitted = fitTextToWidth(name, {
            ...defaultOptions,
            availableWidth,
          });
          expect(
            referenceWidth(fitted.text, fitted.fontSize),
          ).toBeLessThanOrEqual(availableWidth);
        }
      }
    });

    it("truncates only as far as the available width needs", () => {
      const name = "Core Distribution Patch Panel Row 12 Cabinet 4 Upper";
      const availableWidth = 120;
      const fitted = fitTextToWidth(name, {
        ...defaultOptions,
        availableWidth,
      });
      expect(fitted.text.endsWith("…")).toBe(true);
      // One more character would not have fitted by much: no wide unused gap.
      expect(referenceWidth(fitted.text, fitted.fontSize)).toBeGreaterThan(
        availableWidth * 0.85,
      );
    });
  });

  describe("estimateTextWidth", () => {
    it("never under-estimates a printable ASCII character", () => {
      for (const char of Object.keys(INTER_MEDIUM_ADVANCE)) {
        expect(estimateTextWidth(char, 13)).toBeGreaterThanOrEqual(
          referenceWidth(char, 13),
        );
      }
    });

    it("never under-estimates wide-glyph and all-caps names", () => {
      for (const name of WIDE_NAMES) {
        expect(estimateTextWidth(name, 13)).toBeGreaterThanOrEqual(
          referenceWidth(name, 13),
        );
      }
    });

    it("stays within the margin of the rendered width for typical names", () => {
      for (const name of TYPICAL_NAMES) {
        const ratio = estimateTextWidth(name, 13) / referenceWidth(name, 13);
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(TYPICAL_MARGIN);
      }
    });

    it("treats characters outside the table as wide", () => {
      expect(estimateTextWidth("机", 10)).toBeGreaterThanOrEqual(
        estimateTextWidth("W", 10),
      );
    });

    it("sizes accented letters like their base letters", () => {
      const plain = estimateTextWidth("Cafe Buro", 10);
      expect(estimateTextWidth("Café Büro", 10)).toBeCloseTo(plain);
      // Decomposed form: the combining marks add no advance.
      expect(estimateTextWidth("Café Büro", 10)).toBeCloseTo(plain);
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

    it("shows a 24-port patch panel's full name on a 19-inch rack", () => {
      const name = "Patch Panel (24-Port)";
      expect(fit(name, layoutFor(WIDE, 24).layout.availableWidth).text).toBe(
        name,
      );
    });

    it("never returns a negative width on a narrow rack", () => {
      for (const count of [0, 4, 24, 48]) {
        for (const isRearTreatment of [false, true]) {
          const { layout } = layoutFor(NARROW, count, isRearTreatment);
          expect(layout.availableWidth).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it("keeps the icon and the in-flow REAR tag on a 19-inch rack", () => {
      for (const count of [0, 4, 24, 48]) {
        expect(layoutFor(WIDE, count).layout.showIcon).toBe(true);
        expect(layoutFor(WIDE, count, true).layout.showIcon).toBe(true);
      }
      expect(layoutFor(WIDE, 24, true).layout.rearTag).toBeDefined();
      expect(layoutFor(WIDE, 24, true).layout.floatRearTag).toBe(false);
    });

    it("drops the icon so the label wins on a narrow rack with ports", () => {
      for (const count of [1, 12, 24, 48]) {
        const { zones, layout } = layoutFor(NARROW, count);
        expect(zones.labelWidth).toBeLessThan(LABEL_MIN_WIDTH);
        expect(layout.showIcon).toBe(false);
        expect(layout.anchor).toBe("start");
        // The label takes the icon's space and still stops before the ports.
        expect(layout.x).toBeLessThan(zones.labelX);
        expect(layout.availableWidth).toBeGreaterThan(zones.labelWidth);
        expect(layout.x + layout.availableWidth).toBeLessThanOrEqual(
          zones.portZone.x - PORT_ZONE_GAP,
        );
      }
    });

    it("omits the REAR tag when it would squeeze the label on a narrow rack", () => {
      for (const count of [4, 24, 48]) {
        const { layout } = layoutFor(NARROW, count, true);
        const front = layoutFor(NARROW, count).layout;
        expect(layout.rearTag).toBeUndefined();
        // Not floated either: the top-right tag would sit on the chip.
        expect(layout.floatRearTag).toBe(false);
        expect(layout.showIcon).toBe(false);
        expect(layout.x).toBe(front.x);
        expect(layout.availableWidth).toBe(front.availableWidth);
      }
    });

    it("keeps the icon and the floating REAR tag on a narrow rack without ports", () => {
      const { layout } = layoutFor(NARROW, 0, true);
      expect(layout.showIcon).toBe(true);
      expect(layout.anchor).toBe("middle");
      expect(layout.rearTag).toBeUndefined();
      expect(layout.floatRearTag).toBe(true);
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
