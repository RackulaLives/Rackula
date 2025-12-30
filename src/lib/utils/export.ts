/**
 * Export utilities for generating images from rack layouts
 */

import type {
  Rack,
  DeviceType,
  ExportOptions,
  ExportFormat,
  DeviceCategory,
  ExportBackground,
} from "$lib/types";
import type { ImageStoreMap } from "$lib/types/images";
import { getBlockedSlots } from "./blocked-slots";
import {
  fitTextToWidth,
  DEVICE_LABEL_MAX_FONT,
  DEVICE_LABEL_MIN_FONT,
  DEVICE_LABEL_ICON_SPACE_LEFT,
  DEVICE_LABEL_ICON_SPACE_RIGHT,
} from "./text-sizing";
import {
  U_HEIGHT_PX,
  BASE_RACK_WIDTH,
  RAIL_WIDTH,
  RACK_PADDING_HIDDEN,
} from "$lib/constants/layout";

// Note: jsPDF is imported dynamically in exportAsPDF() to avoid loading
// the large jsPDF + html2canvas bundle (~200KB) on app startup.
// See issue #68 for details.

// Aliases for export context (export uses hidden padding since view labels show rack name)
const U_HEIGHT = U_HEIGHT_PX;
const RACK_WIDTH = BASE_RACK_WIDTH;
const RACK_PADDING = RACK_PADDING_HIDDEN;
const RACK_GAP = 40;
const LEGEND_PADDING = 20;
const LEGEND_ITEM_HEIGHT = 24;
const EXPORT_PADDING = 20;
const RACK_NAME_HEIGHT = 18; // Space for rack name above rack
const VIEW_LABEL_HEIGHT = 15; // Space for FRONT/REAR labels
const RACK_BOTTOM_PADDING = 2; // Visual breathing room below bottom rail

// Legend text sizing constants
const LEGEND_MAX_FONT_SIZE = 12;
const LEGEND_MIN_FONT_SIZE = 9;
const LEGEND_TEXT_WIDTH = 160; // Available width for legend device names

// QR Code export constants
const QR_SIZE = 150; // Size of QR code in pixels for screen exports
const QR_PADDING = 10; // Padding around QR code
const QR_LABEL_HEIGHT = 20; // Height for "Scan to open in Rackula" label

// Brand colours for QR label
const BRAND_PURPLE_DARK = "#BD93F9";
const BRAND_PURPLE_LIGHT = "#644AC9";

// Theme colours
const DARK_BG = "#1a1a1a";
const LIGHT_BG = "#f5f5f5";
const DARK_RACK_INTERIOR = "#2d2d2d";
const LIGHT_RACK_INTERIOR = "#e0e0e0";
const DARK_RACK_RAIL = "#404040";
const LIGHT_RACK_RAIL = "#c0c0c0";
const DARK_TEXT = "#ffffff";
const LIGHT_TEXT = "#1a1a1a";
const DARK_GRID = "#505050";
const LIGHT_GRID = "#a0a0a0";

/**
 * Filter devices by face for export
 * Full-depth devices are visible from both sides, so they're included on both faces
 */
function filterDevicesByFace(
  devices: Rack["devices"],
  faceFilter: "front" | "rear" | undefined,
  deviceLibrary: DeviceType[],
): Rack["devices"] {
  if (!faceFilter) return devices;
  return devices.filter((d) => {
    // Both-face devices are always visible
    if (d.face === "both") return true;
    // Devices on this face are visible
    if (d.face === faceFilter) return true;
    // Full-depth devices on the opposite face are also visible
    const deviceType = deviceLibrary.find((dt) => dt.slug === d.device_type);
    if (deviceType) {
      const isFullDepth = deviceType.is_full_depth !== false;
      if (isFullDepth) return true;
    }
    return false;
  });
}

/**
 * Create SVG elements for a category icon
 * Returns an array of SVG elements to append to a parent group
 */
function createCategoryIconElements(
  category: DeviceCategory,
  color: string,
  bgColor: string,
): SVGElement[] {
  const elements: SVGElement[] = [];
  const ns = "http://www.w3.org/2000/svg";

  switch (category) {
    case "server": {
      // Server: Horizontal lines (like rack server front)
      for (const [y, h] of [
        [3, 3],
        [7, 3],
        [11, 2],
      ] as const) {
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", "2");
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", "12");
        rect.setAttribute("height", String(h));
        rect.setAttribute("rx", "0.5");
        rect.setAttribute("fill", color);
        elements.push(rect);
      }
      break;
    }
    case "network": {
      // Network: Connected nodes
      for (const [cx, cy] of [
        [8, 4],
        [4, 12],
        [12, 12],
      ] as const) {
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", String(cx));
        circle.setAttribute("cy", String(cy));
        circle.setAttribute("r", "2");
        circle.setAttribute("fill", color);
        elements.push(circle);
      }
      for (const [x1, y1, x2, y2] of [
        [8, 6, 4, 10],
        [8, 6, 12, 10],
      ] as const) {
        const line = document.createElementNS(ns, "line");
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "1.5");
        elements.push(line);
      }
      break;
    }
    case "patch-panel": {
      // Patch Panel: Grid of dots
      for (const [cx, cy] of [
        [4, 5],
        [8, 5],
        [12, 5],
        [4, 11],
        [8, 11],
        [12, 11],
      ] as const) {
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", String(cx));
        circle.setAttribute("cy", String(cy));
        circle.setAttribute("r", "1.5");
        circle.setAttribute("fill", color);
        elements.push(circle);
      }
      break;
    }
    case "power": {
      // Power: Lightning bolt
      const polygon = document.createElementNS(ns, "polygon");
      polygon.setAttribute("points", "9,1 5,8 8,8 7,15 11,6 8,6");
      polygon.setAttribute("fill", color);
      elements.push(polygon);
      break;
    }
    case "storage": {
      // Storage: Stacked drives
      for (const y of [2, 6, 10]) {
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", "2");
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", "12");
        rect.setAttribute("height", "3");
        rect.setAttribute("rx", "0.5");
        rect.setAttribute("fill", color);
        elements.push(rect);
      }
      for (const cy of [3.5, 7.5, 11.5]) {
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", "12");
        circle.setAttribute("cy", String(cy));
        circle.setAttribute("r", "0.75");
        circle.setAttribute("fill", bgColor);
        elements.push(circle);
      }
      break;
    }
    case "kvm": {
      // KVM: Monitor with keyboard
      const monitor = document.createElementNS(ns, "rect");
      monitor.setAttribute("x", "3");
      monitor.setAttribute("y", "2");
      monitor.setAttribute("width", "10");
      monitor.setAttribute("height", "7");
      monitor.setAttribute("rx", "0.5");
      monitor.setAttribute("fill", color);
      elements.push(monitor);

      const screen = document.createElementNS(ns, "rect");
      screen.setAttribute("x", "4");
      screen.setAttribute("y", "3");
      screen.setAttribute("width", "8");
      screen.setAttribute("height", "5");
      screen.setAttribute("fill", bgColor);
      elements.push(screen);

      const keyboard = document.createElementNS(ns, "rect");
      keyboard.setAttribute("x", "2");
      keyboard.setAttribute("y", "11");
      keyboard.setAttribute("width", "12");
      keyboard.setAttribute("height", "3");
      keyboard.setAttribute("rx", "0.5");
      keyboard.setAttribute("fill", color);
      elements.push(keyboard);
      break;
    }
    case "av-media": {
      // AV/Media: Speaker
      const base = document.createElementNS(ns, "rect");
      base.setAttribute("x", "3");
      base.setAttribute("y", "4");
      base.setAttribute("width", "4");
      base.setAttribute("height", "8");
      base.setAttribute("rx", "0.5");
      base.setAttribute("fill", color);
      elements.push(base);

      const cone = document.createElementNS(ns, "path");
      cone.setAttribute("d", "M8 3 L12 1 L12 15 L8 13 Z");
      cone.setAttribute("fill", color);
      elements.push(cone);
      break;
    }
    case "cooling": {
      // Cooling: Fan blades
      const outer = document.createElementNS(ns, "circle");
      outer.setAttribute("cx", "8");
      outer.setAttribute("cy", "8");
      outer.setAttribute("r", "6");
      outer.setAttribute("fill", "none");
      outer.setAttribute("stroke", color);
      outer.setAttribute("stroke-width", "1.5");
      elements.push(outer);

      const center = document.createElementNS(ns, "circle");
      center.setAttribute("cx", "8");
      center.setAttribute("cy", "8");
      center.setAttribute("r", "1.5");
      center.setAttribute("fill", color);
      elements.push(center);

      for (const [x1, y1, x2, y2] of [
        [8, 3, 8, 6],
        [8, 10, 8, 13],
        [3, 8, 6, 8],
        [10, 8, 13, 8],
      ] as const) {
        const line = document.createElementNS(ns, "line");
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "1.5");
        elements.push(line);
      }
      break;
    }
    case "shelf": {
      // Shelf: Horizontal platform with angled supports
      const platform = document.createElementNS(ns, "rect");
      platform.setAttribute("x", "2");
      platform.setAttribute("y", "7");
      platform.setAttribute("width", "12");
      platform.setAttribute("height", "2");
      platform.setAttribute("rx", "0.3");
      platform.setAttribute("fill", color);
      elements.push(platform);

      for (const [x1, x2] of [
        [3, 4],
        [13, 12],
      ] as const) {
        const leg = document.createElementNS(ns, "line");
        leg.setAttribute("x1", String(x1));
        leg.setAttribute("y1", "9");
        leg.setAttribute("x2", String(x2));
        leg.setAttribute("y2", "13");
        leg.setAttribute("stroke", color);
        leg.setAttribute("stroke-width", "1.5");
        elements.push(leg);
      }
      break;
    }
    case "blank": {
      // Blank: Empty rectangle
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", "2");
      rect.setAttribute("y", "4");
      rect.setAttribute("width", "12");
      rect.setAttribute("height", "8");
      rect.setAttribute("rx", "0.5");
      rect.setAttribute("fill", "none");
      rect.setAttribute("stroke", color);
      rect.setAttribute("stroke-width", "1.5");
      elements.push(rect);
      break;
    }
    default: {
      // Other: Question mark in circle
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", "8");
      circle.setAttribute("cy", "8");
      circle.setAttribute("r", "6");
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", color);
      circle.setAttribute("stroke-width", "1.5");
      elements.push(circle);

      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", "8");
      text.setAttribute("y", "11");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "8");
      text.setAttribute("font-weight", "bold");
      text.setAttribute("fill", color);
      text.textContent = "?";
      elements.push(text);
      break;
    }
  }

  return elements;
}

/**
 * Generate an SVG element for export
 * @param racks - Racks to export
 * @param deviceLibrary - Device library for device definitions
 * @param options - Export options including displayMode
 * @param images - Optional map of device images (required when displayMode is 'image')
 */
export function generateExportSVG(
  racks: Rack[],
  deviceLibrary: DeviceType[],
  options: ExportOptions,
  images?: ImageStoreMap,
): SVGElement {
  const {
    includeNames,
    includeLegend,
    background,
    exportView,
    displayMode = "label",
    includeQR,
    qrCodeDataUrl,
  } = options;

  // Determine if we should render QR code
  const shouldRenderQR = includeQR === true && !!qrCodeDataUrl;

  // Determine if we're doing dual-view export
  const isDualView = exportView === "both";

  // Get unique devices used in racks for legend
  const usedDeviceSlugs = new Set<string>();
  for (const rack of racks) {
    for (const device of rack.devices) {
      usedDeviceSlugs.add(device.device_type);
    }
  }
  const usedDevices = deviceLibrary.filter((d) => usedDeviceSlugs.has(d.slug));

  // Calculate dimensions
  const maxRackHeight = Math.max(...racks.map((r) => r.height), 0);
  // For dual view: each rack takes 2x width + gap between front/rear (but respect show_rear)
  const singleRackWidth =
    racks.length * RACK_WIDTH + (racks.length - 1) * RACK_GAP;
  // Count how many racks will actually show dual view (respecting show_rear setting)
  const dualViewRackCount = isDualView
    ? racks.filter((r) => r.show_rear !== false).length
    : 0;
  const singleViewRackCount = racks.length - dualViewRackCount;
  const totalRackWidth = isDualView
    ? dualViewRackCount * (RACK_WIDTH * 2 + RACK_GAP) +
      singleViewRackCount * RACK_WIDTH +
      (racks.length - 1) * RACK_GAP
    : singleRackWidth;

  // Calculate space needed above rack for names and labels
  const headerSpace = includeNames
    ? isDualView
      ? RACK_NAME_HEIGHT + VIEW_LABEL_HEIGHT // Name + view labels
      : RACK_NAME_HEIGHT // Just name
    : isDualView
      ? VIEW_LABEL_HEIGHT // Just view labels
      : 0;
  // Rack internal height: top padding + top rail + U slots + bottom rail + bottom padding
  const rackAreaHeight =
    maxRackHeight * U_HEIGHT +
    RACK_PADDING +
    RAIL_WIDTH * 2 +
    RACK_BOTTOM_PADDING +
    headerSpace;
  const legendWidth = includeLegend ? 180 : 0;
  const legendHeight = includeLegend
    ? usedDevices.length * LEGEND_ITEM_HEIGHT + LEGEND_PADDING * 2
    : 0;

  // Calculate QR code dimensions
  const qrTotalSize = QR_SIZE + QR_PADDING * 2; // QR size including padding
  const qrAreaHeight = qrTotalSize + QR_LABEL_HEIGHT; // QR + label above it

  // Calculate sidebar (legend + QR column) dimensions
  // QR code shares the same column as legend, positioned at the bottom
  const hasSidebar = includeLegend || shouldRenderQR;
  const sidebarWidth = Math.max(
    includeLegend ? legendWidth : 0,
    shouldRenderQR ? qrTotalSize : 0,
  );

  const contentWidth =
    totalRackWidth + (hasSidebar ? LEGEND_PADDING + sidebarWidth : 0);
  const contentHeight = Math.max(rackAreaHeight, legendHeight);

  const svgWidth = contentWidth + EXPORT_PADDING * 2;
  const svgHeight =
    Math.max(contentHeight, shouldRenderQR ? qrAreaHeight : 0) +
    EXPORT_PADDING * 2;

  // Determine colours based on background
  const isDark = background === "dark";
  const bgColor =
    background === "transparent"
      ? "none"
      : background === "dark"
        ? DARK_BG
        : LIGHT_BG;
  const rackInterior = isDark ? DARK_RACK_INTERIOR : LIGHT_RACK_INTERIOR;
  const rackRail = isDark ? DARK_RACK_RAIL : LIGHT_RACK_RAIL;
  const textColor = isDark ? DARK_TEXT : LIGHT_TEXT;
  const gridColor = isDark ? DARK_GRID : LIGHT_GRID;

  // Create SVG
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(svgWidth));
  svg.setAttribute("height", String(svgHeight));
  svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // Background
  if (background !== "transparent") {
    const bgRect = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    bgRect.setAttribute("class", "export-background");
    bgRect.setAttribute("x", "0");
    bgRect.setAttribute("y", "0");
    bgRect.setAttribute("width", String(svgWidth));
    bgRect.setAttribute("height", String(svgHeight));
    bgRect.setAttribute("fill", bgColor);
    svg.appendChild(bgRect);
  } else {
    // Add transparent background marker for tests
    const bgRect = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    bgRect.setAttribute("class", "export-background");
    bgRect.setAttribute("x", "0");
    bgRect.setAttribute("y", "0");
    bgRect.setAttribute("width", String(svgWidth));
    bgRect.setAttribute("height", String(svgHeight));
    bgRect.setAttribute("fill", "none");
    svg.appendChild(bgRect);
  }

  // Helper function to render a single rack view
  function renderRackView(
    rack: Rack,
    xOffset: number,
    yOffset: number,
    faceFilter: "front" | "rear" | undefined,
    viewLabel?: string,
  ): SVGGElement {
    const rackGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    rackGroup.setAttribute("transform", `translate(${xOffset}, ${yOffset})`);

    const rackHeight = rack.height * U_HEIGHT;

    // Rack interior
    const interior = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    interior.setAttribute("x", String(RAIL_WIDTH));
    interior.setAttribute("y", String(RACK_PADDING + RAIL_WIDTH));
    interior.setAttribute("width", String(RACK_WIDTH - RAIL_WIDTH * 2));
    interior.setAttribute("height", String(rackHeight));
    interior.setAttribute("fill", rackInterior);
    rackGroup.appendChild(interior);

    // Top bar (horizontal)
    const topBar = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    topBar.setAttribute("x", "0");
    topBar.setAttribute("y", String(RACK_PADDING));
    topBar.setAttribute("width", String(RACK_WIDTH));
    topBar.setAttribute("height", String(RAIL_WIDTH));
    topBar.setAttribute("fill", rackRail);
    rackGroup.appendChild(topBar);

    // Bottom bar (horizontal)
    const bottomBar = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    bottomBar.setAttribute("x", "0");
    bottomBar.setAttribute("y", String(RACK_PADDING + RAIL_WIDTH + rackHeight));
    bottomBar.setAttribute("width", String(RACK_WIDTH));
    bottomBar.setAttribute("height", String(RAIL_WIDTH));
    bottomBar.setAttribute("fill", rackRail);
    rackGroup.appendChild(bottomBar);

    // Left rail (vertical)
    const leftRail = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    leftRail.setAttribute("x", "0");
    leftRail.setAttribute("y", String(RACK_PADDING + RAIL_WIDTH));
    leftRail.setAttribute("width", String(RAIL_WIDTH));
    leftRail.setAttribute("height", String(rackHeight));
    leftRail.setAttribute("fill", rackRail);
    rackGroup.appendChild(leftRail);

    // Right rail (vertical)
    const rightRail = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    rightRail.setAttribute("x", String(RACK_WIDTH - RAIL_WIDTH));
    rightRail.setAttribute("y", String(RACK_PADDING + RAIL_WIDTH));
    rightRail.setAttribute("width", String(RAIL_WIDTH));
    rightRail.setAttribute("height", String(rackHeight));
    rightRail.setAttribute("fill", rackRail);
    rackGroup.appendChild(rightRail);

    // Grid lines
    for (let i = 0; i <= rack.height; i++) {
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      const y = i * U_HEIGHT + RACK_PADDING + RAIL_WIDTH;
      line.setAttribute("x1", String(RAIL_WIDTH));
      line.setAttribute("y1", String(y));
      line.setAttribute("x2", String(RACK_WIDTH - RAIL_WIDTH));
      line.setAttribute("y2", String(y));
      line.setAttribute("stroke", gridColor);
      line.setAttribute("stroke-width", "1");
      rackGroup.appendChild(line);
    }

    // Mounting holes on both rails (3 per U) - matches Rack.svelte exactly
    const holeColor = isDark ? "#505050" : "#a0a0a0";
    const leftHoleX = RAIL_WIDTH - 4;
    const rightHoleX = RACK_WIDTH - RAIL_WIDTH + 1;

    for (let i = 0; i < rack.height; i++) {
      const baseY = i * U_HEIGHT + RACK_PADDING + RAIL_WIDTH + 4;

      // Three holes per U, matching canvas offsets: -2, 5, 12
      for (const offsetY of [-2, 5, 12]) {
        // Left rail holes
        const leftHole = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        leftHole.setAttribute("x", String(leftHoleX));
        leftHole.setAttribute("y", String(baseY + offsetY));
        leftHole.setAttribute("width", "3");
        leftHole.setAttribute("height", "4");
        leftHole.setAttribute("rx", "0.5");
        leftHole.setAttribute("fill", holeColor);
        rackGroup.appendChild(leftHole);

        // Right rail holes
        const rightHole = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        rightHole.setAttribute("x", String(rightHoleX));
        rightHole.setAttribute("y", String(baseY + offsetY));
        rightHole.setAttribute("width", "3");
        rightHole.setAttribute("height", "4");
        rightHole.setAttribute("rx", "0.5");
        rightHole.setAttribute("fill", holeColor);
        rackGroup.appendChild(rightHole);
      }
    }

    // U labels on left rail
    // Respect desc_units and starting_unit settings (mirrors Rack.svelte logic)
    const startUnit = rack.starting_unit ?? 1;
    for (let i = 0; i < rack.height; i++) {
      const uNumber = rack.desc_units
        ? startUnit + i // Descending: lowest number at top
        : startUnit + (rack.height - 1) - i; // Ascending: highest number at top
      const labelY = i * U_HEIGHT + U_HEIGHT / 2 + RACK_PADDING + RAIL_WIDTH;

      const label = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      label.setAttribute("x", String(RAIL_WIDTH / 2));
      label.setAttribute("y", String(labelY));
      label.setAttribute("fill", textColor);
      label.setAttribute("font-size", "10");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "middle");
      label.setAttribute("font-family", "system-ui, sans-serif");
      label.textContent = String(uNumber);
      rackGroup.appendChild(label);
    }

    // Render blocked slots (hatching for half-depth devices on opposite face)
    if (faceFilter) {
      const blockedSlots = getBlockedSlots(rack, faceFilter, deviceLibrary);
      if (blockedSlots.length > 0) {
        // Create pattern definition if not already in defs
        const patternId = `blocked-stripe-pattern-${faceFilter}`;
        let defs = svg.querySelector("defs");
        if (!defs) {
          defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
          svg.insertBefore(defs, svg.firstChild);
        }
        if (!defs.querySelector(`#${patternId}`)) {
          const pattern = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "pattern",
          );
          pattern.setAttribute("id", patternId);
          pattern.setAttribute("patternUnits", "userSpaceOnUse");
          pattern.setAttribute("width", "8");
          pattern.setAttribute("height", "8");
          pattern.setAttribute("patternTransform", "rotate(45)");
          const rect = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "rect",
          );
          rect.setAttribute("width", "4");
          rect.setAttribute("height", "8");
          rect.setAttribute(
            "fill",
            isDark ? "rgba(239, 68, 68, 0.35)" : "rgba(239, 68, 68, 0.35)",
          );
          pattern.appendChild(rect);
          defs.appendChild(pattern);
        }

        // Render blocked slot rectangles
        for (const slot of blockedSlots) {
          const slotY =
            (rack.height - slot.top) * U_HEIGHT + RACK_PADDING + RAIL_WIDTH;
          const slotHeight = (slot.top - slot.bottom + 1) * U_HEIGHT;
          const slotWidth = RACK_WIDTH - 2 * RAIL_WIDTH;

          // Background wash
          const bgRect = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "rect",
          );
          bgRect.setAttribute("x", String(RAIL_WIDTH));
          bgRect.setAttribute("y", String(slotY));
          bgRect.setAttribute("width", String(slotWidth));
          bgRect.setAttribute("height", String(slotHeight));
          bgRect.setAttribute("fill", "rgba(239, 68, 68, 0.08)");
          bgRect.setAttribute("opacity", "0.5");
          rackGroup.appendChild(bgRect);

          // Stripe pattern
          const stripeRect = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "rect",
          );
          stripeRect.setAttribute("x", String(RAIL_WIDTH));
          stripeRect.setAttribute("y", String(slotY));
          stripeRect.setAttribute("width", String(slotWidth));
          stripeRect.setAttribute("height", String(slotHeight));
          stripeRect.setAttribute("fill", `url(#${patternId})`);
          stripeRect.setAttribute("opacity", "0.8");
          rackGroup.appendChild(stripeRect);
        }
      }
    }

    // Filter and render devices
    const filteredDevices = filterDevicesByFace(
      rack.devices,
      faceFilter,
      deviceLibrary,
    );
    for (const placedDevice of filteredDevices) {
      const device = deviceLibrary.find(
        (d) => d.slug === placedDevice.device_type,
      );
      if (!device) continue;

      // Device display name
      const deviceDisplayName = device.model ?? device.slug;

      // Device Y position matches Rack.svelte: includes RACK_PADDING + RAIL_WIDTH offset
      const deviceY =
        (rack.height - placedDevice.position - device.u_height + 1) * U_HEIGHT +
        RACK_PADDING +
        RAIL_WIDTH;
      const deviceHeight = device.u_height * U_HEIGHT - 2;
      const deviceWidth = RACK_WIDTH - RAIL_WIDTH * 2 - 4;

      // Always render device rect as background
      const deviceRect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      deviceRect.setAttribute("x", String(RAIL_WIDTH + 2));
      deviceRect.setAttribute("y", String(deviceY + 1));
      deviceRect.setAttribute("width", String(deviceWidth));
      deviceRect.setAttribute("height", String(deviceHeight));
      deviceRect.setAttribute(
        "fill",
        placedDevice.colour_override ?? device.colour,
      );
      deviceRect.setAttribute("rx", "2");
      deviceRect.setAttribute("ry", "2");
      rackGroup.appendChild(deviceRect);

      // Check if we should show an image
      const face = faceFilter === "rear" ? "rear" : "front";
      const deviceImages = images?.get(device.slug);
      const deviceImage = deviceImages?.[face];
      // Support both URL-based (bundled) and dataUrl-based (user upload) images
      const imageUrl = deviceImage?.url ?? deviceImage?.dataUrl;
      const isImageMode =
        displayMode === "image" || displayMode === "image-label";
      const showImage = isImageMode && imageUrl;

      if (showImage) {
        // Render device image
        const imageEl = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "image",
        );
        imageEl.setAttribute("x", String(RAIL_WIDTH + 2));
        imageEl.setAttribute("y", String(deviceY + 1));
        imageEl.setAttribute("width", String(deviceWidth));
        imageEl.setAttribute("height", String(deviceHeight));
        imageEl.setAttribute("href", imageUrl);
        imageEl.setAttribute("preserveAspectRatio", "xMidYMid slice");
        rackGroup.appendChild(imageEl);

        // Clip the image to rounded corners
        const clipId = `clip-${device.slug}-${placedDevice.position}`;
        const clipPath = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "clipPath",
        );
        clipPath.setAttribute("id", clipId);
        const clipRect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        clipRect.setAttribute("x", String(RAIL_WIDTH + 2));
        clipRect.setAttribute("y", String(deviceY + 1));
        clipRect.setAttribute("width", String(deviceWidth));
        clipRect.setAttribute("height", String(deviceHeight));
        clipRect.setAttribute("rx", "2");
        clipRect.setAttribute("ry", "2");
        clipPath.appendChild(clipRect);
        rackGroup.appendChild(clipPath);
        imageEl.setAttribute("clip-path", `url(#${clipId})`);
      } else {
        // Category icon (only for devices tall enough and with a category)
        if (deviceHeight >= 20 && device.category) {
          const iconSize = 12;
          const iconX = RAIL_WIDTH + 6;
          const iconY = deviceY + (deviceHeight - iconSize) / 2 + 1;

          const iconSvg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
          );
          iconSvg.setAttribute("x", String(iconX));
          iconSvg.setAttribute("y", String(iconY));
          iconSvg.setAttribute("width", String(iconSize));
          iconSvg.setAttribute("height", String(iconSize));
          iconSvg.setAttribute("viewBox", "0 0 16 16");

          // White icon with slight transparency for visibility on coloured backgrounds
          const iconColor = "rgba(255, 255, 255, 0.85)";
          const iconBgColor = placedDevice.colour_override ?? device.colour;
          const iconElements = createCategoryIconElements(
            device.category,
            iconColor,
            iconBgColor,
          );
          for (const el of iconElements) {
            iconSvg.appendChild(el);
          }
          rackGroup.appendChild(iconSvg);
        }
      }

      // Device name (always shown unless image mode without labels)
      // In image mode, name is still shown as overlay for accessibility
      const labelText = placedDevice.name || deviceDisplayName;

      // Calculate available width for text (using shared constants from text-sizing.ts)
      const textAvailableWidth = showImage
        ? deviceWidth - 16 // Small padding in image mode
        : deviceWidth -
          DEVICE_LABEL_ICON_SPACE_LEFT -
          DEVICE_LABEL_ICON_SPACE_RIGHT;

      // Apply auto-sizing to fit text within available width
      const fittedLabel = fitTextToWidth(labelText, {
        maxFontSize: DEVICE_LABEL_MAX_FONT,
        minFontSize: DEVICE_LABEL_MIN_FONT,
        availableWidth: textAvailableWidth,
      });

      const deviceNameEl = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      deviceNameEl.setAttribute("x", String(RACK_WIDTH / 2));
      deviceNameEl.setAttribute("y", String(deviceY + deviceHeight / 2 + 1));
      deviceNameEl.setAttribute("fill", "#ffffff");
      deviceNameEl.setAttribute("font-size", String(fittedLabel.fontSize));
      deviceNameEl.setAttribute("text-anchor", "middle");
      deviceNameEl.setAttribute("dominant-baseline", "middle");
      deviceNameEl.setAttribute("font-family", "system-ui, sans-serif");
      if (showImage) {
        // Add text shadow for visibility over images
        deviceNameEl.setAttribute(
          "style",
          "text-shadow: 0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.5);",
        );
      }
      deviceNameEl.textContent = fittedLabel.text;
      rackGroup.appendChild(deviceNameEl);
    }

    // View label (FRONT/REAR) for dual-view export
    if (viewLabel) {
      const viewLabelText = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      viewLabelText.setAttribute("x", String(RACK_WIDTH / 2));
      viewLabelText.setAttribute("y", "-8");
      viewLabelText.setAttribute("fill", textColor);
      viewLabelText.setAttribute("font-size", "11");
      viewLabelText.setAttribute("text-anchor", "middle");
      viewLabelText.setAttribute("font-family", "system-ui, sans-serif");
      viewLabelText.setAttribute("font-weight", "500");
      viewLabelText.textContent = viewLabel;
      rackGroup.appendChild(viewLabelText);
    }

    // Rack name (positioned above rack) - only for non-dual-view
    // In dual-view, the name is rendered separately above both front/rear views
    if (includeNames && !viewLabel) {
      const nameText = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      nameText.setAttribute("class", "rack-name");
      nameText.setAttribute("x", String(RACK_WIDTH / 2));
      // Position above the rack (negative Y relative to rackGroup)
      nameText.setAttribute("y", String(-5));
      nameText.setAttribute("fill", textColor);
      nameText.setAttribute("font-size", "13");
      nameText.setAttribute("text-anchor", "middle");
      nameText.setAttribute("font-family", "system-ui, sans-serif");
      nameText.textContent = rack.name;
      rackGroup.appendChild(nameText);
    }

    return rackGroup;
  }

  // Render each rack (single or dual view)
  // Track cumulative X position to handle mixed single/dual racks properly
  let currentX = EXPORT_PADDING;

  racks.forEach((rack) => {
    // Position rack below header space (name/labels)
    const rackY =
      EXPORT_PADDING + headerSpace + (maxRackHeight - rack.height) * U_HEIGHT;

    // Respect rack's show_rear setting - if false, force front-only even when isDualView
    const shouldShowRear = rack.show_rear !== false;
    const effectiveDualView = isDualView && shouldShowRear;

    if (effectiveDualView) {
      // Dual view: render front and rear side-by-side
      const dualRackWidth = RACK_WIDTH * 2 + RACK_GAP;
      const baseX = currentX;

      // Render rack name centered above both views
      if (includeNames) {
        const nameText = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text",
        );
        nameText.setAttribute("class", "rack-name");
        nameText.setAttribute("x", String(baseX + dualRackWidth / 2));
        // Position name at top of header space (above view labels)
        const nameY = rackY - VIEW_LABEL_HEIGHT - 5;
        nameText.setAttribute("y", String(nameY));
        nameText.setAttribute("fill", textColor);
        nameText.setAttribute("font-size", "13");
        nameText.setAttribute("text-anchor", "middle");
        nameText.setAttribute("font-family", "system-ui, sans-serif");
        nameText.textContent = rack.name;
        svg.appendChild(nameText);
      }

      // Front view on the left
      const frontGroup = renderRackView(rack, baseX, rackY, "front", "FRONT");
      svg.appendChild(frontGroup);

      // Rear view on the right
      const rearX = baseX + RACK_WIDTH + RACK_GAP;
      const rearGroup = renderRackView(rack, rearX, rackY, "rear", "REAR");
      svg.appendChild(rearGroup);

      // Advance X position for next rack
      currentX += dualRackWidth + RACK_GAP;
    } else {
      // Single view: render with optional face filter
      // Note: Rack name is handled inside renderRackView when no viewLabel is provided
      const rackX = currentX;
      const faceFilter =
        exportView === "front" || exportView === "rear"
          ? exportView
          : undefined;
      const rackGroup = renderRackView(rack, rackX, rackY, faceFilter);

      svg.appendChild(rackGroup);

      // Advance X position for next rack
      currentX += RACK_WIDTH + RACK_GAP;
    }
  });

  // Legend
  if (includeLegend && usedDevices.length > 0) {
    const legendX = EXPORT_PADDING + totalRackWidth + LEGEND_PADDING;
    const legendY = EXPORT_PADDING;

    const legendGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    legendGroup.setAttribute("class", "export-legend");
    legendGroup.setAttribute("transform", `translate(${legendX}, ${legendY})`);

    // Add background box when using transparent background (so legend text is legible)
    if (background === "transparent") {
      const legendBgPadding = 8;
      const legendBgWidth = legendWidth + legendBgPadding * 2;
      const legendBgHeight = legendHeight + legendBgPadding;

      const legendBg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      legendBg.setAttribute("class", "legend-background");
      legendBg.setAttribute("x", String(-legendBgPadding));
      legendBg.setAttribute("y", "0");
      legendBg.setAttribute("width", String(legendBgWidth));
      legendBg.setAttribute("height", String(legendBgHeight));
      legendBg.setAttribute("fill", "rgba(255, 255, 255, 0.95)");
      legendBg.setAttribute("rx", "4");
      legendBg.setAttribute("ry", "4");
      legendGroup.appendChild(legendBg);
    }

    // Legend title
    const legendTitle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    legendTitle.setAttribute("x", "0");
    legendTitle.setAttribute("y", "16");
    legendTitle.setAttribute("fill", textColor);
    legendTitle.setAttribute("font-size", "14");
    legendTitle.setAttribute("font-weight", "bold");
    legendTitle.setAttribute("font-family", "system-ui, sans-serif");
    legendTitle.textContent = "Legend";
    legendGroup.appendChild(legendTitle);

    // Legend items
    usedDevices.forEach((device, i) => {
      const itemY = LEGEND_PADDING + 8 + i * LEGEND_ITEM_HEIGHT;
      const deviceDisplayName = device.model ?? device.slug;

      const itemGroup = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g",
      );
      itemGroup.setAttribute("class", "legend-item");

      // Category icon (replaces colour swatch) or fallback to colour swatch
      if (device.category) {
        const iconGroup = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        iconGroup.setAttribute("x", "0");
        iconGroup.setAttribute("y", String(itemY));
        iconGroup.setAttribute("width", "16");
        iconGroup.setAttribute("height", "16");
        iconGroup.setAttribute("viewBox", "0 0 16 16");

        const iconElements = createCategoryIconElements(
          device.category,
          textColor,
          bgColor,
        );
        for (const el of iconElements) {
          iconGroup.appendChild(el);
        }
        itemGroup.appendChild(iconGroup);
      } else {
        // Fallback to colour swatch if no category
        const swatch = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        swatch.setAttribute("x", "0");
        swatch.setAttribute("y", String(itemY));
        swatch.setAttribute("width", "16");
        swatch.setAttribute("height", "16");
        swatch.setAttribute("fill", device.colour);
        swatch.setAttribute("rx", "2");
        itemGroup.appendChild(swatch);
      }

      // Device name with auto-sizing
      const legendLabelText = `${deviceDisplayName} (${device.u_height}U)`;
      const fittedLegendLabel = fitTextToWidth(legendLabelText, {
        maxFontSize: LEGEND_MAX_FONT_SIZE,
        minFontSize: LEGEND_MIN_FONT_SIZE,
        availableWidth: LEGEND_TEXT_WIDTH,
      });

      const nameText = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      nameText.setAttribute("x", "24");
      nameText.setAttribute("y", String(itemY + 12));
      nameText.setAttribute("fill", textColor);
      nameText.setAttribute("font-size", String(fittedLegendLabel.fontSize));
      nameText.setAttribute("font-family", "system-ui, sans-serif");
      nameText.textContent = fittedLegendLabel.text;
      itemGroup.appendChild(nameText);

      legendGroup.appendChild(itemGroup);
    });

    svg.appendChild(legendGroup);
  }

  // QR Code (in sidebar column, at bottom)
  if (shouldRenderQR && qrCodeDataUrl) {
    const qrGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    qrGroup.setAttribute("class", "export-qr");

    // Position QR in sidebar column (same X as legend), at bottom of content area
    const sidebarX = EXPORT_PADDING + totalRackWidth + LEGEND_PADDING;
    const qrY = EXPORT_PADDING + contentHeight - qrAreaHeight;
    qrGroup.setAttribute(
      "transform",
      `translate(${sidebarX}, ${Math.max(qrY, EXPORT_PADDING)})`,
    );

    // Label: "Scan to open in Rackula" with Rackula in brand purple
    const labelGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    labelGroup.setAttribute("x", String(qrTotalSize / 2));
    labelGroup.setAttribute("y", "12");
    labelGroup.setAttribute("text-anchor", "middle");
    labelGroup.setAttribute("font-size", "11");
    labelGroup.setAttribute("font-family", "system-ui, sans-serif");

    const labelPart1 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "tspan",
    );
    labelPart1.setAttribute("fill", textColor);
    labelPart1.textContent = "Scan to open in ";
    labelGroup.appendChild(labelPart1);

    const labelPart2 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "tspan",
    );
    labelPart2.setAttribute(
      "fill",
      isDark ? BRAND_PURPLE_DARK : BRAND_PURPLE_LIGHT,
    );
    labelPart2.setAttribute("font-weight", "600");
    labelPart2.textContent = "Rackula";
    labelGroup.appendChild(labelPart2);

    qrGroup.appendChild(labelGroup);

    // White background for QR code visibility (below the label)
    const qrBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    qrBg.setAttribute("x", "0");
    qrBg.setAttribute("y", String(QR_LABEL_HEIGHT));
    qrBg.setAttribute("width", String(qrTotalSize));
    qrBg.setAttribute("height", String(qrTotalSize));
    qrBg.setAttribute("fill", "#ffffff");
    qrBg.setAttribute("rx", "4");
    qrBg.setAttribute("ry", "4");
    qrGroup.appendChild(qrBg);

    // QR code image
    const qrImage = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "image",
    );
    qrImage.setAttribute("x", String(QR_PADDING));
    qrImage.setAttribute("y", String(QR_LABEL_HEIGHT + QR_PADDING));
    qrImage.setAttribute("width", String(QR_SIZE));
    qrImage.setAttribute("height", String(QR_SIZE));
    qrImage.setAttribute("href", qrCodeDataUrl);
    qrImage.setAttribute("preserveAspectRatio", "xMidYMid meet");
    qrGroup.appendChild(qrImage);

    svg.appendChild(qrGroup);
  }

  return svg;
}

/**
 * Export SVG element as string with XML declaration
 */
export function exportAsSVG(svg: SVGElement): string {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;
}

/**
 * Export SVG as PNG blob
 */
export async function exportAsPNG(
  svg: SVGElement,
  scale: number = 2,
): Promise<Blob> {
  return exportAsRaster(svg, "image/png", scale);
}

/**
 * Export SVG as JPEG blob
 */
export async function exportAsJPEG(
  svg: SVGElement,
  scale: number = 2,
  quality: number = 0.92,
): Promise<Blob> {
  return exportAsRaster(svg, "image/jpeg", scale, quality);
}

/**
 * Export SVG string as PDF blob (US Letter size, centered)
 */
export async function exportAsPDF(
  svgString: string,
  background: ExportBackground,
): Promise<Blob> {
  // Dynamically import jsPDF to avoid loading it (and html2canvas) on app startup
  const { jsPDF } = await import("jspdf");

  // Parse SVG to get dimensions
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
  const svgElement = svgDoc.documentElement;

  const imgWidth = parseInt(svgElement.getAttribute("width") || "0", 10);
  const imgHeight = parseInt(svgElement.getAttribute("height") || "0", 10);

  if (imgWidth === 0 || imgHeight === 0) {
    throw new Error("Invalid SVG dimensions");
  }

  // Convert SVG to canvas first
  const canvas = await svgToCanvas(svgString, imgWidth, imgHeight, background);

  // US Letter dimensions in points (72 dpi)
  const letterWidth = 612; // 8.5 inches
  const letterHeight = 792; // 11 inches

  // Create PDF (landscape if image is wider than tall)
  const isLandscape = imgWidth > imgHeight;

  const pdf = new jsPDF({
    orientation: isLandscape ? "landscape" : "portrait",
    unit: "pt",
    format: "letter",
  });

  // Calculate scaling to fit on page with margins
  const margin = 36; // 0.5 inch margins
  const pageWidth = isLandscape ? letterHeight : letterWidth;
  const pageHeight = isLandscape ? letterWidth : letterHeight;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;

  const scale = Math.min(
    availableWidth / imgWidth,
    availableHeight / imgHeight,
  );

  const scaledWidth = imgWidth * scale;
  const scaledHeight = imgHeight * scale;

  // Center on page
  const x = (pageWidth - scaledWidth) / 2;
  const y = (pageHeight - scaledHeight) / 2;

  // Add image to PDF
  const imgData = canvas.toDataURL("image/png");
  pdf.addImage(imgData, "PNG", x, y, scaledWidth, scaledHeight);

  // Return as blob
  return pdf.output("blob");
}

/**
 * Convert SVG string to canvas
 */
async function svgToCanvas(
  svgString: string,
  width: number,
  height: number,
  background: ExportBackground,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  const scale = 2; // Higher resolution for PDF
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  ctx.scale(scale, scale);

  // Fill background if not transparent
  if (background !== "transparent") {
    ctx.fillStyle = background === "dark" ? DARK_BG : LIGHT_BG;
    ctx.fillRect(0, 0, width, height);
  }

  // Convert SVG to data URL and load as image
  const svgBlob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Internal function to render SVG to canvas and export as raster image
 */
async function exportAsRaster(
  svg: SVGElement,
  mimeType: string,
  scale: number,
  quality?: number,
): Promise<Blob> {
  const width = parseInt(svg.getAttribute("width") || "0", 10);
  const height = parseInt(svg.getAttribute("height") || "0", 10);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  // Scale the canvas
  ctx.scale(scale, scale);

  // For JPEG, fill with white background first (no transparency)
  if (mimeType === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  // Convert SVG to data URL
  const svgString = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svgBlob);

  try {
    // Load image
    const img = await loadImage(url);

    // Draw to canvas
    ctx.drawImage(img, 0, 0);

    // Convert to blob
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create blob"));
          }
        },
        mimeType,
        quality,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Load an image from URL
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

/**
 * Trigger download of a blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Escape a CSV field value
 * - Wraps in quotes if contains comma, quote, or newline
 * - Doubles any existing quotes
 */
function escapeCSVField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Export rack contents as CSV
 * Columns: Position, Name, Model, Manufacturer, U_Height, Category, Face
 * Sorted by position descending (top of rack first)
 *
 * @param rack - The rack to export
 * @param deviceTypes - Device type library for resolving device details
 */
export function exportToCSV(rack: Rack, deviceTypes: DeviceType[]): string {
  const header = "Position,Name,Model,Manufacturer,U_Height,Category,Face";

  // Create a map for quick device type lookup
  const deviceTypeMap = new Map(deviceTypes.map((dt) => [dt.slug, dt]));

  // Sort devices by position descending (top of rack first)
  const sortedDevices = [...rack.devices].sort(
    (a, b) => b.position - a.position,
  );

  // Build rows
  const rows: string[] = [];
  for (const device of sortedDevices) {
    const deviceType = deviceTypeMap.get(device.device_type);
    if (!deviceType) continue; // Skip unknown device types

    const position = String(device.position);
    const name = escapeCSVField(device.name || "");
    const model = escapeCSVField(deviceType.model || deviceType.slug);
    const manufacturer = escapeCSVField(deviceType.manufacturer || "");
    const uHeight = String(deviceType.u_height);
    const category = deviceType.category;
    const face = device.face;

    rows.push(
      `${position},${name},${model},${manufacturer},${uHeight},${category},${face}`,
    );
  }

  return [header, ...rows].join("\n");
}

/**
 * Generate a sanitized filename for export
 * Pattern: {layout-name}-{view}-{YYYY-MM-DD}.{ext}
 * For CSV (view=null): {layout-name}-{YYYY-MM-DD}.{ext}
 *
 * @param layoutName - The layout name to include in filename
 * @param view - The export view ('front', 'rear', 'both') or null for data exports like CSV
 * @param format - The export format extension
 */
export function generateExportFilename(
  layoutName: string,
  view: "front" | "rear" | "both" | null,
  format: ExportFormat,
): string {
  // Slugify the layout name: lowercase, hyphens, no special chars
  const slugified = layoutName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const baseName = slugified || "Rackula-export";

  // Format date as YYYY-MM-DD
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  // Build filename: include view for image exports, omit for CSV
  if (view) {
    return `${baseName}-${view}-${dateStr}.${format}`;
  }

  return `${baseName}-${dateStr}.${format}`;
}
