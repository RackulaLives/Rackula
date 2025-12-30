/**
 * Isometric Export Proof-of-Concept
 *
 * Issue: #300
 * Parent: #299 (Isometric Export Feature)
 * Research: docs/research/spike-293-isometric-3d-view.md
 *
 * This script generates sample isometric SVG exports to validate
 * the visual approach before implementing in the main export.ts.
 *
 * Run: npx tsx scripts/isometric-poc.ts
 * Output: docs/research/isometric-poc-single.svg
 *         docs/research/isometric-poc-dual.svg
 */

import { JSDOM } from "jsdom";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Constants
// ============================================================================

// Isometric transform constants (true 30° isometric projection)
const COS_30 = Math.cos(Math.PI / 6); // ≈ 0.866
const SIN_30 = Math.sin(Math.PI / 6); // 0.5

// Rack dimensions
const RACK_WIDTH = 200; // pixels for 19" rack front face
const U_HEIGHT = 20; // pixels per U
const RACK_U = 12; // 12U rack for POC

// Depth visualization
const FULL_DEPTH_PX = 24; // Full-depth device side panel width
const HALF_DEPTH_PX = 12; // Half-depth device side panel width
const RACK_DEPTH_PX = 24; // Rack frame depth

// Color adjustments
const SIDE_DARKEN = 0.25; // 25% darker for side panels
const TOP_LIGHTEN = 0.15; // 15% lighter for top surfaces

// Layout
const LEGEND_GAP = 40; // Gap between rack and legend
const DUAL_VIEW_GAP = 60; // Gap between front and rear views

// ============================================================================
// Sample Devices
// ============================================================================

interface POCDevice {
  name: string;
  uHeight: number;
  uPosition: number; // Bottom U position (1-based)
  color: string;
  isFullDepth: boolean;
}

const sampleDevices: POCDevice[] = [
  {
    name: "UPS",
    uHeight: 2,
    uPosition: 1,
    color: "#50fa7b",
    isFullDepth: true,
  },
  {
    name: "Patch Panel",
    uHeight: 1,
    uPosition: 3,
    color: "#8be9fd",
    isFullDepth: false,
  },
  {
    name: "Network Switch",
    uHeight: 1,
    uPosition: 4,
    color: "#ff79c6",
    isFullDepth: false,
  },
  {
    name: "Server 1",
    uHeight: 2,
    uPosition: 5,
    color: "#bd93f9",
    isFullDepth: true,
  },
  {
    name: "NAS",
    uHeight: 4,
    uPosition: 7,
    color: "#ffb86c",
    isFullDepth: true,
  },
  {
    name: "Blank Panel",
    uHeight: 2,
    uPosition: 11,
    color: "#44475a",
    isFullDepth: false,
  },
];

// ============================================================================
// Color Utilities
// ============================================================================

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function darkenColor(hex: string, amount: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex(hsl.h, hsl.s, Math.max(0, hsl.l * (1 - amount)));
}

function lightenColor(hex: string, amount: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex(hsl.h, hsl.s, Math.min(100, hsl.l * (1 + amount)));
}

// ============================================================================
// SVG Generation
// ============================================================================

function createSvgDocument(
  width: number,
  height: number,
): { document: Document; svg: SVGSVGElement } {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><svg xmlns="http://www.w3.org/2000/svg"></svg></body></html>',
  );
  const document = dom.window.document;
  const svg = document.querySelector("svg") as unknown as SVGSVGElement;

  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  // Background
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", "#282a36");
  svg.appendChild(bg);

  return { document, svg };
}

function createRackFrame(document: Document, rackHeight: number): SVGGElement {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

  // Rack frame colors
  const frameColor = "#6272a4";
  const frameSide = darkenColor(frameColor, SIDE_DARKEN);
  const frameTop = lightenColor(frameColor, TOP_LIGHTEN);

  // Front face (main rectangle)
  const front = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  front.setAttribute("x", "0");
  front.setAttribute("y", "0");
  front.setAttribute("width", String(RACK_WIDTH));
  front.setAttribute("height", String(rackHeight));
  front.setAttribute("fill", frameColor);
  front.setAttribute("stroke", "#44475a");
  front.setAttribute("stroke-width", "2");
  group.appendChild(front);

  // Side panel (right side, going back in isometric space)
  const sidePoints = [
    `${RACK_WIDTH},0`,
    `${RACK_WIDTH + RACK_DEPTH_PX},${(-RACK_DEPTH_PX * SIN_30) / COS_30}`,
    `${RACK_WIDTH + RACK_DEPTH_PX},${rackHeight - (RACK_DEPTH_PX * SIN_30) / COS_30}`,
    `${RACK_WIDTH},${rackHeight}`,
  ].join(" ");

  const side = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  side.setAttribute("points", sidePoints);
  side.setAttribute("fill", frameSide);
  side.setAttribute("stroke", "#44475a");
  side.setAttribute("stroke-width", "1");
  group.appendChild(side);

  // Top surface
  const topPoints = [
    `0,0`,
    `${RACK_DEPTH_PX},${(-RACK_DEPTH_PX * SIN_30) / COS_30}`,
    `${RACK_WIDTH + RACK_DEPTH_PX},${(-RACK_DEPTH_PX * SIN_30) / COS_30}`,
    `${RACK_WIDTH},0`,
  ].join(" ");

  const top = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  top.setAttribute("points", topPoints);
  top.setAttribute("fill", frameTop);
  top.setAttribute("stroke", "#44475a");
  top.setAttribute("stroke-width", "1");
  group.appendChild(top);

  return group;
}

function createDevice(
  document: Document,
  device: POCDevice,
  rackHeight: number,
): SVGGElement {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

  const deviceHeight = device.uHeight * U_HEIGHT;
  const deviceY =
    rackHeight - device.uPosition * U_HEIGHT - deviceHeight + U_HEIGHT;
  const depthPx = device.isFullDepth ? FULL_DEPTH_PX : HALF_DEPTH_PX;

  const sideColor = darkenColor(device.color, SIDE_DARKEN);
  const topColor = lightenColor(device.color, TOP_LIGHTEN);

  // Front face
  const front = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  front.setAttribute("x", "4"); // 4px inset for rack rails
  front.setAttribute("y", String(deviceY));
  front.setAttribute("width", String(RACK_WIDTH - 8)); // Account for both rails
  front.setAttribute("height", String(deviceHeight));
  front.setAttribute("fill", device.color);
  front.setAttribute("stroke", "#282a36");
  front.setAttribute("stroke-width", "1");
  group.appendChild(front);

  // Side panel (extends to the right in isometric space)
  const sideX = RACK_WIDTH - 4;
  const sidePoints = [
    `${sideX},${deviceY}`,
    `${sideX + depthPx},${deviceY - (depthPx * SIN_30) / COS_30}`,
    `${sideX + depthPx},${deviceY + deviceHeight - (depthPx * SIN_30) / COS_30}`,
    `${sideX},${deviceY + deviceHeight}`,
  ].join(" ");

  const side = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  side.setAttribute("points", sidePoints);
  side.setAttribute("fill", sideColor);
  side.setAttribute("stroke", "#282a36");
  side.setAttribute("stroke-width", "1");
  group.appendChild(side);

  // Top surface
  const topPoints = [
    `4,${deviceY}`,
    `${4 + depthPx},${deviceY - (depthPx * SIN_30) / COS_30}`,
    `${sideX + depthPx},${deviceY - (depthPx * SIN_30) / COS_30}`,
    `${sideX},${deviceY}`,
  ].join(" ");

  const top = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  top.setAttribute("points", topPoints);
  top.setAttribute("fill", topColor);
  top.setAttribute("stroke", "#282a36");
  top.setAttribute("stroke-width", "1");
  group.appendChild(top);

  return group;
}

function createLegend(
  document: Document,
  devices: POCDevice[],
  startY: number,
): SVGGElement {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

  // Title
  const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
  title.setAttribute("x", "10");
  title.setAttribute("y", String(startY));
  title.setAttribute("fill", "#f8f8f2");
  title.setAttribute("font-family", "Inter, system-ui, sans-serif");
  title.setAttribute("font-size", "14");
  title.setAttribute("font-weight", "bold");
  title.textContent = "LEGEND";
  group.appendChild(title);

  // Device entries
  devices.forEach((device, index) => {
    const entryY = startY + 25 + index * 24;

    // Color swatch
    const swatch = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    swatch.setAttribute("x", "10");
    swatch.setAttribute("y", String(entryY - 12));
    swatch.setAttribute("width", "16");
    swatch.setAttribute("height", "16");
    swatch.setAttribute("fill", device.color);
    swatch.setAttribute("stroke", "#44475a");
    swatch.setAttribute("stroke-width", "1");
    group.appendChild(swatch);

    // Half-depth indicator on swatch
    if (!device.isFullDepth) {
      const halfIndicator = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      halfIndicator.setAttribute("x", "18");
      halfIndicator.setAttribute("y", String(entryY));
      halfIndicator.setAttribute("fill", "#282a36");
      halfIndicator.setAttribute("font-family", "Inter, system-ui, sans-serif");
      halfIndicator.setAttribute("font-size", "10");
      halfIndicator.setAttribute("font-weight", "bold");
      halfIndicator.setAttribute("text-anchor", "middle");
      halfIndicator.textContent = "½";
      group.appendChild(halfIndicator);
    }

    // Device name
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", "34");
    text.setAttribute("y", String(entryY));
    text.setAttribute("fill", "#f8f8f2");
    text.setAttribute("font-family", "Inter, system-ui, sans-serif");
    text.setAttribute("font-size", "12");
    text.textContent = `${device.name} (${device.uHeight}U)`;
    group.appendChild(text);
  });

  return group;
}

function generateSingleView(): string {
  const rackHeight = RACK_U * U_HEIGHT;

  // Calculate canvas size to fit isometric rack + legend
  const isoWidth = RACK_WIDTH + RACK_DEPTH_PX + 50;
  const isoHeight = rackHeight + RACK_DEPTH_PX + 50;
  const legendHeight = 25 + sampleDevices.length * 24 + 20;

  const canvasWidth = Math.max(isoWidth, 250);
  const canvasHeight = isoHeight + LEGEND_GAP + legendHeight;

  const { document, svg } = createSvgDocument(canvasWidth, canvasHeight);

  // Create isometric group with transform
  const isoGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const offsetX = 80;
  const offsetY = RACK_DEPTH_PX + 30;

  // Apply isometric transform
  isoGroup.setAttribute(
    "transform",
    `translate(${offsetX}, ${offsetY}) matrix(${COS_30}, ${SIN_30}, ${-COS_30}, ${SIN_30}, 0, 0)`,
  );

  // Add rack frame
  isoGroup.appendChild(createRackFrame(document, rackHeight));

  // Add devices (sorted by U position descending for correct z-order)
  const sortedDevices = [...sampleDevices].sort(
    (a, b) => b.uPosition - a.uPosition,
  );
  sortedDevices.forEach((device) => {
    isoGroup.appendChild(createDevice(document, device, rackHeight));
  });

  svg.appendChild(isoGroup);

  // View label
  const viewLabel = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  viewLabel.setAttribute("x", String(canvasWidth / 2));
  viewLabel.setAttribute("y", String(isoHeight - 10));
  viewLabel.setAttribute("fill", "#6272a4");
  viewLabel.setAttribute("font-family", "Inter, system-ui, sans-serif");
  viewLabel.setAttribute("font-size", "12");
  viewLabel.setAttribute("text-anchor", "middle");
  viewLabel.textContent = "FRONT";
  svg.appendChild(viewLabel);

  // Add legend (not transformed)
  const legendY = isoHeight + LEGEND_GAP;
  svg.appendChild(createLegend(document, sampleDevices, legendY));

  return svg.outerHTML;
}

function generateDualView(): string {
  const rackHeight = RACK_U * U_HEIGHT;

  // Calculate canvas size for two isometric views side by side
  const singleIsoWidth = RACK_WIDTH + RACK_DEPTH_PX + 30;
  const isoHeight = rackHeight + RACK_DEPTH_PX + 50;
  const legendHeight = 25 + sampleDevices.length * 24 + 20;

  const canvasWidth = singleIsoWidth * 2 + DUAL_VIEW_GAP + 60;
  const canvasHeight = isoHeight + LEGEND_GAP + legendHeight;

  const { document, svg } = createSvgDocument(canvasWidth, canvasHeight);

  // Front view
  const frontGroup = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "g",
  );
  const frontOffsetX = 80;
  const frontOffsetY = RACK_DEPTH_PX + 30;

  frontGroup.setAttribute(
    "transform",
    `translate(${frontOffsetX}, ${frontOffsetY}) matrix(${COS_30}, ${SIN_30}, ${-COS_30}, ${SIN_30}, 0, 0)`,
  );

  frontGroup.appendChild(createRackFrame(document, rackHeight));

  const sortedDevices = [...sampleDevices].sort(
    (a, b) => b.uPosition - a.uPosition,
  );
  sortedDevices.forEach((device) => {
    frontGroup.appendChild(createDevice(document, device, rackHeight));
  });

  svg.appendChild(frontGroup);

  // Front label
  const frontLabel = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  frontLabel.setAttribute("x", String(singleIsoWidth / 2 + 30));
  frontLabel.setAttribute("y", String(isoHeight - 10));
  frontLabel.setAttribute("fill", "#6272a4");
  frontLabel.setAttribute("font-family", "Inter, system-ui, sans-serif");
  frontLabel.setAttribute("font-size", "12");
  frontLabel.setAttribute("text-anchor", "middle");
  frontLabel.textContent = "FRONT";
  svg.appendChild(frontLabel);

  // Rear view (same devices, shifted right)
  const rearGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const rearOffsetX = singleIsoWidth + DUAL_VIEW_GAP + 80;
  const rearOffsetY = RACK_DEPTH_PX + 30;

  rearGroup.setAttribute(
    "transform",
    `translate(${rearOffsetX}, ${rearOffsetY}) matrix(${COS_30}, ${SIN_30}, ${-COS_30}, ${SIN_30}, 0, 0)`,
  );

  rearGroup.appendChild(createRackFrame(document, rackHeight));

  sortedDevices.forEach((device) => {
    rearGroup.appendChild(createDevice(document, device, rackHeight));
  });

  svg.appendChild(rearGroup);

  // Rear label
  const rearLabel = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  rearLabel.setAttribute(
    "x",
    String(singleIsoWidth + DUAL_VIEW_GAP + singleIsoWidth / 2 + 30),
  );
  rearLabel.setAttribute("y", String(isoHeight - 10));
  rearLabel.setAttribute("fill", "#6272a4");
  rearLabel.setAttribute("font-family", "Inter, system-ui, sans-serif");
  rearLabel.setAttribute("font-size", "12");
  rearLabel.setAttribute("text-anchor", "middle");
  rearLabel.textContent = "REAR";
  svg.appendChild(rearLabel);

  // Add legend (not transformed, centered below both views)
  const legendY = isoHeight + LEGEND_GAP;
  svg.appendChild(createLegend(document, sampleDevices, legendY));

  return svg.outerHTML;
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const outputDir = path.join(__dirname, "..", "docs", "research");

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate single view
  const singleSvg = generateSingleView();
  const singlePath = path.join(outputDir, "isometric-poc-single.svg");
  fs.writeFileSync(singlePath, singleSvg);
  console.log(`✓ Generated: ${singlePath}`);

  // Generate dual view
  const dualSvg = generateDualView();
  const dualPath = path.join(outputDir, "isometric-poc-dual.svg");
  fs.writeFileSync(dualPath, dualSvg);
  console.log(`✓ Generated: ${dualPath}`);

  console.log("\nPOC complete! Open the SVG files in a browser to review.");
  console.log(
    "See docs/research/isometric-poc-notes.md for visual assessment.",
  );
}

main();
