/**
 * QR code / legend layout (#2929)
 *
 * The sidebar column stacks the legend above the QR block. The shared column
 * height budget must account for both: when the legend is the tallest sidebar
 * element (many device types, a short rack), the QR block still needs its own
 * space below the last legend row, or the opaque QR background paints over
 * the bottom legend entries.
 */
import { describe, it, expect } from "vitest";
import { generateExportSVG } from "$lib/utils/export";
import type { ExportOptions, DeviceType } from "$lib/types";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";

const QR_DATA_URL = "data:image/png;base64,QRCODE";

const baseOptions: ExportOptions = {
  format: "png",
  scope: "all",
  includeNames: true,
  includeLegend: true,
  background: "dark",
  exportView: "front",
  displayMode: "label",
  includeQR: true,
  qrCodeDataUrl: QR_DATA_URL,
};

// Legend rows are grouped with class="legend-item"; each row's icon/swatch
// child carries its own y/height attributes, so the last row's bottom edge
// can be read directly off the rendered output (no private layout constants).
function legendItemGroups(svg: SVGElement): SVGGElement[] {
  return Array.from(svg.getElementsByTagName("g")).filter(
    (g) => g.getAttribute("class") === "legend-item",
  );
}

function legendGroup(svg: SVGElement): SVGGElement {
  const group = Array.from(svg.getElementsByTagName("g")).find(
    (g) => g.getAttribute("class") === "export-legend",
  );
  if (!group) throw new Error("export-legend group not found");
  return group;
}

function qrGroup(svg: SVGElement): SVGGElement {
  const group = Array.from(svg.getElementsByTagName("g")).find(
    (g) => g.getAttribute("class") === "export-qr",
  );
  if (!group) throw new Error("export-qr group not found");
  return group;
}

function translateY(el: SVGElement): number {
  const transform = el.getAttribute("transform") ?? "";
  const match = /translate\(\s*[^,]+,\s*([^)]+)\)/.exec(transform);
  if (!match?.[1]) throw new Error(`no translate() Y in "${transform}"`);
  return Number(match[1]);
}

describe("export QR / legend layout (#2929)", () => {
  it("keeps the QR block below the last legend row when the legend is the tallest sidebar element", () => {
    // Many device types (tall legend) on a very short rack (small rack area),
    // so the legend, not the rack, drives the sidebar column height.
    const deviceTypes: DeviceType[] = Array.from({ length: 12 }, (_, i) =>
      createTestDeviceType({ slug: `device-${i}`, u_height: 1 }),
    );
    const rack = createTestRack({
      height: 2,
      devices: deviceTypes.map((deviceType, i) =>
        createTestDevice({
          id: `dev-${i}`,
          device_type: deviceType.slug,
          position: 1,
        }),
      ),
    });

    const svg = generateExportSVG([rack], deviceTypes, baseOptions);

    const items = legendItemGroups(svg);
    expect(items.length).toBeGreaterThan(0);
    const lastItem = items[items.length - 1]!;
    // Every test device type defaults to category "server", so each legend
    // row renders a nested <svg> icon (not the colour-swatch fallback); its
    // y + height give the row's bottom edge within the legend group.
    const icons = Array.from(lastItem.getElementsByTagName("svg"));
    expect(icons.length).toBeGreaterThan(0);
    const icon = icons[0]!;
    const rowBottom =
      Number(icon.getAttribute("y")) + Number(icon.getAttribute("height"));

    const legendBottom = translateY(legendGroup(svg)) + rowBottom;
    const qrTop = translateY(qrGroup(svg));

    expect(qrTop).toBeGreaterThanOrEqual(legendBottom);
  });

  it("does not reserve phantom legend space above the QR when the legend has no items", () => {
    // includeLegend is true but the rack has no devices, so no legend group is
    // drawn. The height budget must not reserve legend space, or the QR block
    // is pushed down by a phantom gap (#2952 CodeAnt finding).
    const rack = createTestRack({ height: 2, devices: [] });

    const svg = generateExportSVG([rack], [], baseOptions);

    // No legend group is rendered for an empty rack.
    expect(
      Array.from(svg.getElementsByTagName("g")).some(
        (g) => g.getAttribute("class") === "export-legend",
      ),
    ).toBe(false);

    // With no legend and QR the tallest element, the QR sits at the top of the
    // content area (clamped to EXPORT_PADDING), not offset by phantom legend
    // height.
    const EXPORT_PADDING = 20;
    expect(translateY(qrGroup(svg))).toBe(EXPORT_PADDING);
  });
});
