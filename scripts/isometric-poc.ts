/**
 * Isometric Export Proof-of-Concept
 *
 * Generates example isometric rack export images to validate visual approach.
 * Run with: npx tsx scripts/isometric-poc.ts
 *
 * Issue: #300
 */

import { writeFileSync } from "fs";
import { JSDOM } from "jsdom";

// ============================================================================
// Constants (matching export.ts)
// ============================================================================

const U_HEIGHT = 22;
const RACK_WIDTH = 220;
const RAIL_WIDTH = 17;
const RACK_PADDING = 4;
const RACK_GAP = 60; // Increased for isometric
const EXPORT_PADDING = 20;
const LEGEND_ITEM_HEIGHT = 24;
const LEGEND_PADDING = 20;

// Isometric projection constants
const COS_30 = Math.cos(Math.PI / 6); // 0.866
const SIN_30 = Math.sin(Math.PI / 6); // 0.5

// Depth visualization
const FULL_DEPTH_PX = 24; // Pixels for full-depth side panel
const HALF_DEPTH_PX = 12; // Pixels for half-depth side panel

// Theme colors (dark theme)
const DARK_BG = "#1a1a1a";
const DARK_RACK_INTERIOR = "#2d2d2d";
const DARK_RACK_RAIL = "#404040";
const DARK_TEXT = "#ffffff";

// ============================================================================
// Types
// ============================================================================

interface Device {
  slug: string;
  model: string;
  category: string;
  colour: string;
  u_height: number;
  is_full_depth: boolean;
}

interface PlacedDevice {
  device_type: string;
  position: number; // Bottom U position
  colour_override?: string;
}

interface Rack {
  name: string;
  height: number;
  devices: PlacedDevice[];
}

// ============================================================================
// Test Data
// ============================================================================

const testDevices: Device[] = [
  {
    slug: "udm-pro",
    model: "UDM Pro",
    category: "network",
    colour: "#3498db",
    u_height: 1,
    is_full_depth: false,
  },
  {
    slug: "usw-pro-48",
    model: "USW-Pro-48",
    category: "network",
    colour: "#3498db",
    u_height: 1,
    is_full_depth: false,
  },
  {
    slug: "poweredge-r730",
    model: "PowerEdge R730",
    category: "server",
    colour: "#27ae60",
    u_height: 2,
    is_full_depth: true,
  },
  {
    slug: "poweredge-r640",
    model: "PowerEdge R640",
    category: "server",
    colour: "#27ae60",
    u_height: 1,
    is_full_depth: true,
  },
  {
    slug: "synology-rs820",
    model: "RS820+",
    category: "storage",
    colour: "#9b59b6",
    u_height: 1,
    is_full_depth: true,
  },
  {
    slug: "synology-rs1221",
    model: "RS1221+",
    category: "storage",
    colour: "#9b59b6",
    u_height: 2,
    is_full_depth: true,
  },
  {
    slug: "cyberpower-or1500",
    model: "CyberPower OR1500",
    category: "power",
    colour: "#e74c3c",
    u_height: 2,
    is_full_depth: true,
  },
  {
    slug: "apc-smt1500rm",
    model: "APC SMT1500RM",
    category: "power",
    colour: "#e74c3c",
    u_height: 2,
    is_full_depth: true,
  },
  {
    slug: "patch-panel",
    model: "24-Port Patch Panel",
    category: "network",
    colour: "#3498db",
    u_height: 1,
    is_full_depth: false,
  },
  {
    slug: "blank-panel-1u",
    model: "1U Blank Panel",
    category: "blank",
    colour: "#7f8c8d",
    u_height: 1,
    is_full_depth: false,
  },
];

const testRack: Rack = {
  name: "HomeLab-01",
  height: 24,
  devices: [
    { device_type: "cyberpower-or1500", position: 1 }, // Bottom: UPS
    { device_type: "apc-smt1500rm", position: 3 }, // UPS 2
    { device_type: "synology-rs1221", position: 5 }, // Storage 2U
    { device_type: "synology-rs820", position: 7 }, // Storage 1U
    { device_type: "blank-panel-1u", position: 8 }, // Blank
    { device_type: "poweredge-r730", position: 9 }, // Server 2U
    { device_type: "poweredge-r640", position: 11 }, // Server 1U
    { device_type: "poweredge-r640", position: 12 }, // Server 1U
    { device_type: "blank-panel-1u", position: 13 }, // Blank
    { device_type: "patch-panel", position: 14 }, // Patch panel
    { device_type: "usw-pro-48", position: 15 }, // Switch
    { device_type: "usw-pro-48", position: 16 }, // Switch
    { device_type: "udm-pro", position: 17 }, // Router
  ],
};

// ============================================================================
// Color Utilities
// ============================================================================

function darkenColor(hex: string, percent: number): string {
  // Remove # if present
  const color = hex.replace("#", "");
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  const factor = 1 - percent / 100;
  const newR = Math.round(r * factor);
  const newG = Math.round(g * factor);
  const newB = Math.round(b * factor);

  return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
}

function lightenColor(hex: string, percent: number): string {
  const color = hex.replace("#", "");
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  const factor = percent / 100;
  const newR = Math.round(r + (255 - r) * factor);
  const newG = Math.round(g + (255 - g) * factor);
  const newB = Math.round(b + (255 - b) * factor);

  return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
}

// ============================================================================
// SVG Generation
// ============================================================================

function generateIsometricSVG(
  rack: Rack,
  devices: Device[],
  isDualView: boolean = false,
): string {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  const document = dom.window.document;

  const rackHeight = rack.height * U_HEIGHT;
  const rackTotalHeight = rackHeight + RAIL_WIDTH * 2 + RACK_PADDING;

  // Calculate isometric dimensions
  const flatWidth = isDualView ? RACK_WIDTH * 2 + RACK_GAP : RACK_WIDTH;
  const flatHeight = rackTotalHeight + 40; // Extra for name

  // After isometric transform
  const isoWidth = (flatWidth + flatHeight) * COS_30 + FULL_DEPTH_PX;
  const isoHeight = (flatWidth + flatHeight) * SIN_30 + FULL_DEPTH_PX;

  // Legend dimensions
  const legendWidth = 180;
  const legendItems = [...new Set(rack.devices.map((d) => d.device_type))];
  const legendHeight =
    legendItems.length * LEGEND_ITEM_HEIGHT + LEGEND_PADDING * 2;

  const svgWidth = isoWidth + legendWidth + EXPORT_PADDING * 3;
  const svgHeight = Math.max(isoHeight, legendHeight) + EXPORT_PADDING * 2 + 60; // Extra for legend title

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(Math.ceil(svgWidth)));
  svg.setAttribute("height", String(Math.ceil(svgHeight)));
  svg.setAttribute(
    "viewBox",
    `0 0 ${Math.ceil(svgWidth)} ${Math.ceil(svgHeight)}`,
  );
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // Background
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", DARK_BG);
  svg.appendChild(bg);

  // Create isometric content group
  const isoGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const offsetX = EXPORT_PADDING + flatHeight * COS_30;
  const offsetY = EXPORT_PADDING + 30;
  isoGroup.setAttribute(
    "transform",
    `translate(${offsetX}, ${offsetY}) matrix(${COS_30}, ${SIN_30}, ${-COS_30}, ${SIN_30}, 0, 0)`,
  );

  // Render rack(s)
  if (isDualView) {
    renderRack(document, isoGroup, rack, devices, 0, 0, "FRONT");
    renderRack(
      document,
      isoGroup,
      rack,
      devices,
      RACK_WIDTH + RACK_GAP,
      0,
      "REAR",
    );
  } else {
    renderRack(document, isoGroup, rack, devices, 0, 0, "FRONT");
  }

  svg.appendChild(isoGroup);

  // Render legend (flat, not transformed)
  const legendX = isoWidth + EXPORT_PADDING * 2;
  const legendY = EXPORT_PADDING;
  renderLegend(document, svg, legendX, legendY, rack, devices);

  // Add title
  const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
  title.setAttribute("x", String(svgWidth / 2));
  title.setAttribute("y", String(svgHeight - 15));
  title.setAttribute("fill", DARK_TEXT);
  title.setAttribute("font-size", "12");
  title.setAttribute("font-family", "system-ui, sans-serif");
  title.setAttribute("text-anchor", "middle");
  title.setAttribute("opacity", "0.6");
  title.textContent = "Isometric Export POC - Rackula";
  svg.appendChild(title);

  return svg.outerHTML;
}

function renderRack(
  document: Document,
  parent: SVGGElement,
  rack: Rack,
  devices: Device[],
  xOffset: number,
  yOffset: number,
  label: string,
): void {
  const rackGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  rackGroup.setAttribute("transform", `translate(${xOffset}, ${yOffset})`);

  const rackHeight = rack.height * U_HEIGHT;
  const interiorWidth = RACK_WIDTH - RAIL_WIDTH * 2;

  // === RACK FRAME (3D) ===

  // Right side depth (darkest)
  const rightSideDepth = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  const rsX = RACK_WIDTH;
  const rsY = RACK_PADDING;
  const rsH = rackHeight + RAIL_WIDTH * 2;
  rightSideDepth.setAttribute(
    "points",
    `${rsX},${rsY} ${rsX + FULL_DEPTH_PX},${rsY} ${rsX + FULL_DEPTH_PX},${rsY + rsH} ${rsX},${rsY + rsH}`,
  );
  rightSideDepth.setAttribute("fill", darkenColor(DARK_RACK_RAIL, 30));
  rackGroup.appendChild(rightSideDepth);

  // Top surface (lighter)
  const topSurface = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  const tsY = RACK_PADDING;
  topSurface.setAttribute(
    "points",
    `0,${tsY} ${RACK_WIDTH},${tsY} ${RACK_WIDTH + FULL_DEPTH_PX},${tsY} ${FULL_DEPTH_PX},${tsY}`,
  );
  topSurface.setAttribute("fill", lightenColor(DARK_RACK_RAIL, 15));
  rackGroup.appendChild(topSurface);

  // Rack interior
  const interior = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  interior.setAttribute("x", String(RAIL_WIDTH));
  interior.setAttribute("y", String(RACK_PADDING + RAIL_WIDTH));
  interior.setAttribute("width", String(interiorWidth));
  interior.setAttribute("height", String(rackHeight));
  interior.setAttribute("fill", DARK_RACK_INTERIOR);
  rackGroup.appendChild(interior);

  // Top bar
  const topBar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  topBar.setAttribute("x", "0");
  topBar.setAttribute("y", String(RACK_PADDING));
  topBar.setAttribute("width", String(RACK_WIDTH));
  topBar.setAttribute("height", String(RAIL_WIDTH));
  topBar.setAttribute("fill", DARK_RACK_RAIL);
  rackGroup.appendChild(topBar);

  // Bottom bar
  const bottomBar = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  bottomBar.setAttribute("x", "0");
  bottomBar.setAttribute("y", String(RACK_PADDING + RAIL_WIDTH + rackHeight));
  bottomBar.setAttribute("width", String(RACK_WIDTH));
  bottomBar.setAttribute("height", String(RAIL_WIDTH));
  bottomBar.setAttribute("fill", DARK_RACK_RAIL);
  rackGroup.appendChild(bottomBar);

  // Left rail
  const leftRail = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  leftRail.setAttribute("x", "0");
  leftRail.setAttribute("y", String(RACK_PADDING));
  leftRail.setAttribute("width", String(RAIL_WIDTH));
  leftRail.setAttribute("height", String(rackHeight + RAIL_WIDTH * 2));
  leftRail.setAttribute("fill", DARK_RACK_RAIL);
  rackGroup.appendChild(leftRail);

  // Right rail
  const rightRail = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  rightRail.setAttribute("x", String(RACK_WIDTH - RAIL_WIDTH));
  rightRail.setAttribute("y", String(RACK_PADDING));
  rightRail.setAttribute("width", String(RAIL_WIDTH));
  rightRail.setAttribute("height", String(rackHeight + RAIL_WIDTH * 2));
  rightRail.setAttribute("fill", DARK_RACK_RAIL);
  rackGroup.appendChild(rightRail);

  // === DEVICES (sorted by position, higher U first for proper overlapping) ===
  const sortedDevices = [...rack.devices].sort(
    (a, b) => b.position - a.position,
  );

  for (const placedDevice of sortedDevices) {
    const device = devices.find((d) => d.slug === placedDevice.device_type);
    if (!device) continue;

    const deviceY =
      (rack.height - placedDevice.position - device.u_height + 1) * U_HEIGHT +
      RACK_PADDING +
      RAIL_WIDTH;
    const deviceHeight = device.u_height * U_HEIGHT - 2;
    const deviceWidth = interiorWidth - 4;
    const deviceX = RAIL_WIDTH + 2;
    const deviceColor = placedDevice.colour_override ?? device.colour;
    const depthPx = device.is_full_depth ? FULL_DEPTH_PX : HALF_DEPTH_PX;

    // Device side panel (depth) - render first so it's behind
    const sidePanel = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polygon",
    );
    const spX = deviceX + deviceWidth;
    const spY = deviceY + 1;
    sidePanel.setAttribute(
      "points",
      `${spX},${spY} ${spX + depthPx},${spY} ${spX + depthPx},${spY + deviceHeight} ${spX},${spY + deviceHeight}`,
    );
    sidePanel.setAttribute("fill", darkenColor(deviceColor, 25));
    rackGroup.appendChild(sidePanel);

    // Device top surface (optional - adds more 3D feel)
    const topPanel = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polygon",
    );
    topPanel.setAttribute(
      "points",
      `${deviceX},${spY} ${spX},${spY} ${spX + depthPx},${spY} ${deviceX + depthPx},${spY}`,
    );
    topPanel.setAttribute("fill", lightenColor(deviceColor, 15));
    rackGroup.appendChild(topPanel);

    // Device front face
    const deviceRect = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    deviceRect.setAttribute("x", String(deviceX));
    deviceRect.setAttribute("y", String(deviceY + 1));
    deviceRect.setAttribute("width", String(deviceWidth));
    deviceRect.setAttribute("height", String(deviceHeight));
    deviceRect.setAttribute("fill", deviceColor);
    deviceRect.setAttribute("rx", "2");
    rackGroup.appendChild(deviceRect);
  }

  // View label
  const viewLabel = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  viewLabel.setAttribute("x", String(RACK_WIDTH / 2));
  viewLabel.setAttribute("y", String(-5));
  viewLabel.setAttribute("fill", DARK_TEXT);
  viewLabel.setAttribute("font-size", "11");
  viewLabel.setAttribute("font-family", "system-ui, sans-serif");
  viewLabel.setAttribute("text-anchor", "middle");
  viewLabel.setAttribute("font-weight", "bold");
  viewLabel.textContent = label;
  rackGroup.appendChild(viewLabel);

  parent.appendChild(rackGroup);
}

function renderLegend(
  document: Document,
  svg: SVGElement,
  x: number,
  y: number,
  rack: Rack,
  devices: Device[],
): void {
  const legendGroup = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "g",
  );
  legendGroup.setAttribute("transform", `translate(${x}, ${y})`);

  // Legend title
  const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
  title.setAttribute("x", "0");
  title.setAttribute("y", "15");
  title.setAttribute("fill", DARK_TEXT);
  title.setAttribute("font-size", "13");
  title.setAttribute("font-family", "system-ui, sans-serif");
  title.setAttribute("font-weight", "bold");
  title.textContent = "Devices";
  legendGroup.appendChild(title);

  // Get unique devices used
  const usedSlugs = [...new Set(rack.devices.map((d) => d.device_type))];
  const usedDevices = usedSlugs
    .map((slug) => devices.find((d) => d.slug === slug))
    .filter(Boolean) as Device[];

  let itemY = 35;
  for (const device of usedDevices) {
    // Color swatch
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
    legendGroup.appendChild(swatch);

    // Depth indicator
    if (!device.is_full_depth) {
      const halfIndicator = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      halfIndicator.setAttribute("x", "8");
      halfIndicator.setAttribute("y", String(itemY + 12));
      halfIndicator.setAttribute("fill", "#fff");
      halfIndicator.setAttribute("font-size", "8");
      halfIndicator.setAttribute("font-family", "system-ui, sans-serif");
      halfIndicator.setAttribute("text-anchor", "middle");
      halfIndicator.setAttribute("font-weight", "bold");
      halfIndicator.textContent = "½";
      legendGroup.appendChild(halfIndicator);
    }

    // Device name
    const name = document.createElementNS("http://www.w3.org/2000/svg", "text");
    name.setAttribute("x", "22");
    name.setAttribute("y", String(itemY + 12));
    name.setAttribute("fill", DARK_TEXT);
    name.setAttribute("font-size", "11");
    name.setAttribute("font-family", "system-ui, sans-serif");
    name.textContent = device.model;
    legendGroup.appendChild(name);

    // Category badge
    const category = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    category.setAttribute("x", "22");
    category.setAttribute("y", String(itemY + 24));
    category.setAttribute("fill", DARK_TEXT);
    category.setAttribute("font-size", "9");
    category.setAttribute("font-family", "system-ui, sans-serif");
    category.setAttribute("opacity", "0.6");
    category.textContent = `${device.u_height}U · ${device.category}`;
    legendGroup.appendChild(category);

    itemY += LEGEND_ITEM_HEIGHT + 8;
  }

  svg.appendChild(legendGroup);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("Generating isometric export POC images...\n");

  // Generate single rack view
  console.log("1. Generating single rack isometric view...");
  const singleSvg = generateIsometricSVG(testRack, testDevices, false);
  writeFileSync("docs/research/isometric-poc-single.svg", singleSvg);
  console.log("   ✓ Saved: docs/research/isometric-poc-single.svg");

  // Generate dual-view
  console.log("2. Generating dual-view isometric view...");
  const dualSvg = generateIsometricSVG(testRack, testDevices, true);
  writeFileSync("docs/research/isometric-poc-dual.svg", dualSvg);
  console.log("   ✓ Saved: docs/research/isometric-poc-dual.svg");

  console.log("\n✅ POC generation complete!");
  console.log("\nTo convert to PNG, open SVGs in browser and screenshot,");
  console.log("or use: npx svg2png-cli docs/research/isometric-poc-*.svg");

  // Visual observations
  console.log("\n" + "=".repeat(60));
  console.log("VISUAL OBSERVATIONS");
  console.log("=".repeat(60));
  console.log(`
1. Isometric transform applied using matrix(${COS_30.toFixed(3)}, ${SIN_30}, -${COS_30.toFixed(3)}, ${SIN_30}, 0, 0)
2. Device depth visualization:
   - Full-depth devices: ${FULL_DEPTH_PX}px side panel
   - Half-depth devices: ${HALF_DEPTH_PX}px side panel (with ½ indicator in legend)
3. Color scheme:
   - Side panels: 25% darker than front face
   - Top surfaces: 15% lighter than front face
4. Depth sorting: Higher U positions rendered first (appear behind lower devices)
5. Legend rendered flat (not transformed) for readability
6. Rack frame includes:
   - 3D right-side depth
   - Top surface highlight
   - Standard rails and bars

ADJUSTMENTS TO CONSIDER:
- Increase depth pixels if devices look too flat
- Adjust color darkening percentage for more/less contrast
- Add drop shadow under rack for grounding effect
- Consider floor/ground plane for context
`);
}

main().catch(console.error);
