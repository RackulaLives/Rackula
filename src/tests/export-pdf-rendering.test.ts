/**
 * PDF export rendering regressions (#1738, #1739, #1740)
 *
 * The vector PDF path (#1731) renders the shared export SVG through svg2pdf.js,
 * which does not support every SVG feature the browser-rendered PNG path does:
 *   - It ignores `dominant-baseline`, so vertically-centred text shifts up (#1738).
 *   - Numeric `font-weight` other than 400/700 produces an invalid jsPDF style
 *     (e.g. "normal600") and falls back to a serif font (times) (#1739).
 * `prepareSvgForPdf` normalises a *copy* of the SVG so the PNG path stays intact.
 *
 * Separately, bayed groups labelled each bay both via the explicit "Bay N" label
 * and via the bay rack's own name (defaulted to "Bay N"), overlapping them (#1740).
 */

import { describe, it, expect } from "vitest";
import { generateExportSVG, prepareSvgForPdf } from "$lib/utils/export";
import type { ExportOptions, RackGroup } from "$lib/types";
import { createTestRack } from "./factories";

const SVG_NS = "http://www.w3.org/2000/svg";

const baseOptions: ExportOptions = {
  format: "pdf",
  scope: "all",
  exportView: "both",
  includeNames: true,
  includeLegend: false,
  background: "solid",
  displayMode: "label",
};

function textNodesWithContent(svg: SVGElement, content: string) {
  return Array.from(svg.getElementsByTagName("text")).filter(
    (t) => t.textContent === content,
  );
}

describe("bayed export labels (#1740)", () => {
  it("does not render a bay's rack name on top of its bay label", () => {
    const rack1 = createTestRack({ id: "r1", name: "Bay 1", height: 12 });
    const rack2 = createTestRack({ id: "r2", name: "Bay 2", height: 12 });
    const group: RackGroup = {
      id: "g1",
      name: "Bayoncé",
      rack_ids: ["r1", "r2"],
      layout_preset: "bayed",
    };

    const svg = generateExportSVG([rack1, rack2], [], baseOptions, undefined, [
      group,
    ]);

    // "Bay 1" is a legitimate bay label once per row (front + rear) = 2.
    // Before the fix the bay rack's own name added two more, overlapping the labels.
    // eslint-disable-next-line no-restricted-syntax -- bayed export must label each bay once per row, never duplicate via rack name
    expect(textNodesWithContent(svg, "Bay 1")).toHaveLength(2);
    // eslint-disable-next-line no-restricted-syntax -- bayed export must label each bay once per row, never duplicate via rack name
    expect(textNodesWithContent(svg, "Bay 2")).toHaveLength(2);
  });
});

describe("prepareSvgForPdf — svg2pdf compatibility (#1738, #1739)", () => {
  it("mirrors dominant-baseline to alignment-baseline so text stays vertically centred", () => {
    const svg = document.createElementNS(SVG_NS, "svg") as SVGElement;
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("dominant-baseline", "middle");
    svg.appendChild(text);

    prepareSvgForPdf(svg);

    expect(text.getAttribute("alignment-baseline")).toBe("middle");
  });

  it("normalises numeric font-weight to a jsPDF-supported style (700) on text and tspan", () => {
    const svg = document.createElementNS(SVG_NS, "svg") as SVGElement;
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("font-weight", "600");
    const tspan = document.createElementNS(SVG_NS, "tspan");
    tspan.setAttribute("font-weight", "500");
    text.appendChild(tspan);
    svg.appendChild(text);

    prepareSvgForPdf(svg);

    expect(text.getAttribute("font-weight")).toBe("700");
    expect(tspan.getAttribute("font-weight")).toBe("700");
  });

  it("leaves normal-weight text unbolded", () => {
    const svg = document.createElementNS(SVG_NS, "svg") as SVGElement;
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("font-weight", "400");
    svg.appendChild(text);

    prepareSvgForPdf(svg);

    expect(text.getAttribute("font-weight")).toBe("400");
  });

  it("normalises the keyword weights bold/bolder/normal", () => {
    const svg = document.createElementNS(SVG_NS, "svg") as SVGElement;
    const make = (weight: string) => {
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("font-weight", weight);
      svg.appendChild(t);
      return t;
    };
    const bold = make("bold");
    const bolder = make("bolder");
    const normal = make("normal");

    prepareSvgForPdf(svg);

    expect(bold.getAttribute("font-weight")).toBe("700");
    expect(bolder.getAttribute("font-weight")).toBe("700");
    expect(normal.getAttribute("font-weight")).toBe("400");
  });
});
