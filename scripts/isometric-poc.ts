/**
 * Isometric Export Proof-of-Concept v2
 *
 * Issue: #300
 * Parent: #299 (Isometric Export Feature)
 *
 * This script generates realistic isometric 3D rack cabinet SVGs.
 * The rack is rendered as a proper enclosure with devices mounted inside.
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
// Isometric Projection Utilities
// ============================================================================

// True isometric angles (30°)
const ISO_ANGLE = Math.PI / 6; // 30 degrees
const COS_30 = Math.cos(ISO_ANGLE);
const SIN_30 = Math.sin(ISO_ANGLE);

/**
 * Convert 3D point to 2D isometric projection.
 * X = right, Y = depth (into screen), Z = up
 */
function isoProject(x: number, y: number, z: number): { x: number; y: number } {
  return {
    x: (x - y) * COS_30,
    y: (x + y) * SIN_30 - z,
  };
}

// ============================================================================
// Constants
// ============================================================================

// Rack cabinet physical dimensions (in pixels)
const RACK_WIDTH = 160; // Front face width
const RACK_DEPTH = 100; // Cabinet depth
const U_HEIGHT = 18; // Pixels per U
const RACK_U = 12; // 12U rack for POC
const RACK_HEIGHT = RACK_U * U_HEIGHT;

// Frame dimensions
const FRAME_THICKNESS = 8; // Cabinet frame thickness
const RAIL_WIDTH = 6; // Mounting rail width
const RAIL_INSET = 12; // Distance from edge to rails

// Colors (Dracula theme)
const COLORS = {
  background: "#282a36",
  cabinetFrame: "#2d3142", // Dark cabinet frame
  cabinetSide: "#1e2130", // Even darker side
  cabinetTop: "#3d4258", // Lighter top
  cabinetInner: "#1a1c26", // Dark interior
  rail: "#44475a", // Mounting rails
  railHole: "#282a36", // Rail mounting holes
  led: "#50fa7b", // Status LED
  text: "#f8f8f2",
  textMuted: "#6272a4",
  ventSlot: "#1a1c26", // Vent slots
};

// Layout
const CANVAS_PADDING = 60;
const LEGEND_GAP = 30;

// ============================================================================
// Sample Devices
// ============================================================================

interface POCDevice {
  name: string;
  uHeight: number;
  uPosition: number; // Bottom U position (1-based)
  color: string;
  isFullDepth: boolean;
  hasLeds?: boolean;
  hasDriveBays?: boolean;
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
    color: "#6272a4",
    isFullDepth: false,
  },
  {
    name: "Network Switch",
    uHeight: 1,
    uPosition: 4,
    color: "#8be9fd",
    isFullDepth: false,
    hasLeds: true,
  },
  {
    name: "Server",
    uHeight: 2,
    uPosition: 5,
    color: "#bd93f9",
    isFullDepth: true,
    hasLeds: true,
  },
  {
    name: "NAS",
    uHeight: 4,
    uPosition: 7,
    color: "#ffb86c",
    isFullDepth: true,
    hasDriveBays: true,
  },
  {
    name: "Blank Panel",
    uHeight: 1,
    uPosition: 11,
    color: "#44475a",
    isFullDepth: false,
  },
];

// ============================================================================
// Color Utilities
// ============================================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function darkenColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function lightenColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

// ============================================================================
// SVG Helpers
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
  bg.setAttribute("fill", COLORS.background);
  svg.appendChild(bg);

  return { document, svg };
}

function createPolygon(
  document: Document,
  points: Array<{ x: number; y: number }>,
  fill: string,
  stroke?: string,
): SVGPolygonElement {
  const polygon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  polygon.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
  polygon.setAttribute("fill", fill);
  if (stroke) {
    polygon.setAttribute("stroke", stroke);
    polygon.setAttribute("stroke-width", "1");
  }
  return polygon;
}

function createRect(
  document: Document,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke?: string,
): SVGRectElement {
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", String(x));
  rect.setAttribute("y", String(y));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("fill", fill);
  if (stroke) {
    rect.setAttribute("stroke", stroke);
    rect.setAttribute("stroke-width", "1");
  }
  return rect;
}

// ============================================================================
// 3D Box Drawing (Isometric)
// ============================================================================

/**
 * Draw a 3D isometric box.
 * Origin (0,0,0) is front-bottom-left corner.
 */
function draw3DBox(
  document: Document,
  group: SVGGElement,
  originX: number,
  originY: number,
  originZ: number,
  width: number,
  depth: number,
  height: number,
  frontColor: string,
  options?: {
    topColor?: string;
    sideColor?: string;
    stroke?: string;
    skipFront?: boolean;
    skipTop?: boolean;
    skipSide?: boolean;
  },
): void {
  const topColor = options?.topColor ?? lightenColor(frontColor, 0.2);
  const sideColor = options?.sideColor ?? darkenColor(frontColor, 0.3);
  const stroke = options?.stroke;

  // Calculate all 8 vertices of the box
  const frontBottomLeft = isoProject(originX, originY, originZ);
  const frontBottomRight = isoProject(originX + width, originY, originZ);
  const frontTopLeft = isoProject(originX, originY, originZ + height);
  const frontTopRight = isoProject(originX + width, originY, originZ + height);
  const backBottomRight = isoProject(originX + width, originY + depth, originZ);
  const backTopLeft = isoProject(originX, originY + depth, originZ + height);
  const backTopRight = isoProject(
    originX + width,
    originY + depth,
    originZ + height,
  );

  // Draw faces in back-to-front order for correct occlusion

  // Right side face (visible in this projection)
  if (!options?.skipSide) {
    group.appendChild(
      createPolygon(
        document,
        [frontBottomRight, backBottomRight, backTopRight, frontTopRight],
        sideColor,
        stroke,
      ),
    );
  }

  // Top face
  if (!options?.skipTop) {
    group.appendChild(
      createPolygon(
        document,
        [frontTopLeft, frontTopRight, backTopRight, backTopLeft],
        topColor,
        stroke,
      ),
    );
  }

  // Front face
  if (!options?.skipFront) {
    group.appendChild(
      createPolygon(
        document,
        [frontBottomLeft, frontBottomRight, frontTopRight, frontTopLeft],
        frontColor,
        stroke,
      ),
    );
  }
}

// ============================================================================
// Rack Cabinet Drawing
// ============================================================================

function drawRackCabinet(document: Document, group: SVGGElement): void {
  // The cabinet is drawn from front-bottom-left origin
  const baseX = 0;
  const baseY = 0;
  const baseZ = 0;

  // Draw cabinet frame (outer shell)
  // Bottom panel
  draw3DBox(
    document,
    group,
    baseX,
    baseY,
    baseZ,
    RACK_WIDTH,
    RACK_DEPTH,
    FRAME_THICKNESS,
    COLORS.cabinetFrame,
    { sideColor: COLORS.cabinetSide, topColor: COLORS.cabinetInner },
  );

  // Top panel
  draw3DBox(
    document,
    group,
    baseX,
    baseY,
    baseZ + RACK_HEIGHT + FRAME_THICKNESS,
    RACK_WIDTH,
    RACK_DEPTH,
    FRAME_THICKNESS,
    COLORS.cabinetTop,
    { sideColor: COLORS.cabinetSide },
  );

  // Left side panel (with vents)
  drawSidePanel(
    document,
    group,
    baseX,
    baseY,
    baseZ + FRAME_THICKNESS,
    RACK_HEIGHT,
    true,
  );

  // Right side panel (with vents)
  drawSidePanel(
    document,
    group,
    baseX + RACK_WIDTH - FRAME_THICKNESS,
    baseY,
    baseZ + FRAME_THICKNESS,
    RACK_HEIGHT,
    false,
  );

  // Back panel (solid dark)
  const backPanelPoints = [
    isoProject(
      baseX + FRAME_THICKNESS,
      baseY + RACK_DEPTH,
      baseZ + FRAME_THICKNESS,
    ),
    isoProject(
      baseX + RACK_WIDTH - FRAME_THICKNESS,
      baseY + RACK_DEPTH,
      baseZ + FRAME_THICKNESS,
    ),
    isoProject(
      baseX + RACK_WIDTH - FRAME_THICKNESS,
      baseY + RACK_DEPTH,
      baseZ + RACK_HEIGHT + FRAME_THICKNESS,
    ),
    isoProject(
      baseX + FRAME_THICKNESS,
      baseY + RACK_DEPTH,
      baseZ + RACK_HEIGHT + FRAME_THICKNESS,
    ),
  ];
  group.appendChild(
    createPolygon(document, backPanelPoints, COLORS.cabinetInner),
  );

  // Draw mounting rails
  drawMountingRails(document, group, baseX, baseY, baseZ + FRAME_THICKNESS);

  // Status LEDs on top-left
  drawStatusLeds(
    document,
    group,
    baseX + 15,
    baseY + 10,
    baseZ + RACK_HEIGHT + FRAME_THICKNESS * 2,
  );
}

function drawSidePanel(
  document: Document,
  group: SVGGElement,
  x: number,
  y: number,
  z: number,
  height: number,
  isLeft: boolean,
): void {
  // Side panel base
  if (isLeft) {
    // Left panel - we see the inner surface
    const leftPoints = [
      isoProject(x, y, z),
      isoProject(x, y + RACK_DEPTH, z),
      isoProject(x, y + RACK_DEPTH, z + height),
      isoProject(x, y, z + height),
    ];
    group.appendChild(createPolygon(document, leftPoints, COLORS.cabinetSide));
  } else {
    // Right panel - visible from outside
    draw3DBox(
      document,
      group,
      x,
      y,
      z,
      FRAME_THICKNESS,
      RACK_DEPTH,
      height,
      COLORS.cabinetFrame,
      {
        sideColor: COLORS.cabinetSide,
        topColor: COLORS.cabinetTop,
        skipFront: true,
      },
    );

    // Add vent slots on right side
    const ventCount = Math.floor(height / 20);
    const ventHeight = 3;
    const ventSpacing = height / ventCount;

    for (let i = 1; i < ventCount; i++) {
      const ventZ = z + i * ventSpacing;
      const ventPoints = [
        isoProject(x + FRAME_THICKNESS, y + 15, ventZ),
        isoProject(x + FRAME_THICKNESS, y + RACK_DEPTH - 15, ventZ),
        isoProject(
          x + FRAME_THICKNESS,
          y + RACK_DEPTH - 15,
          ventZ + ventHeight,
        ),
        isoProject(x + FRAME_THICKNESS, y + 15, ventZ + ventHeight),
      ];
      group.appendChild(createPolygon(document, ventPoints, COLORS.ventSlot));
    }
  }
}

function drawMountingRails(
  document: Document,
  group: SVGGElement,
  baseX: number,
  baseY: number,
  baseZ: number,
): void {
  // Left rail
  const leftRailX = baseX + RAIL_INSET;
  draw3DBox(
    document,
    group,
    leftRailX,
    baseY,
    baseZ,
    RAIL_WIDTH,
    4,
    RACK_HEIGHT,
    COLORS.rail,
    { stroke: darkenColor(COLORS.rail, 0.2) },
  );

  // Right rail
  const rightRailX = baseX + RACK_WIDTH - RAIL_INSET - RAIL_WIDTH;
  draw3DBox(
    document,
    group,
    rightRailX,
    baseY,
    baseZ,
    RAIL_WIDTH,
    4,
    RACK_HEIGHT,
    COLORS.rail,
    { stroke: darkenColor(COLORS.rail, 0.2) },
  );

  // Draw mounting holes on front of rails
  for (let u = 0; u < RACK_U; u++) {
    const holeZ = baseZ + u * U_HEIGHT + U_HEIGHT / 2;
    const holeSize = 3;

    // Left rail holes
    const leftHole = isoProject(leftRailX + RAIL_WIDTH / 2, baseY, holeZ);
    const leftCircle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    leftCircle.setAttribute("cx", String(leftHole.x));
    leftCircle.setAttribute("cy", String(leftHole.y));
    leftCircle.setAttribute("r", String(holeSize / 2));
    leftCircle.setAttribute("fill", COLORS.railHole);
    group.appendChild(leftCircle);

    // Right rail holes
    const rightHole = isoProject(rightRailX + RAIL_WIDTH / 2, baseY, holeZ);
    const rightCircle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    rightCircle.setAttribute("cx", String(rightHole.x));
    rightCircle.setAttribute("cy", String(rightHole.y));
    rightCircle.setAttribute("r", String(holeSize / 2));
    rightCircle.setAttribute("fill", COLORS.railHole);
    group.appendChild(rightCircle);
  }
}

function drawStatusLeds(
  document: Document,
  group: SVGGElement,
  x: number,
  y: number,
  z: number,
): void {
  const ledSpacing = 8;
  const ledRadius = 3;

  for (let i = 0; i < 3; i++) {
    const ledPos = isoProject(x + i * ledSpacing, y, z);
    const led = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    led.setAttribute("cx", String(ledPos.x));
    led.setAttribute("cy", String(ledPos.y));
    led.setAttribute("r", String(ledRadius));
    led.setAttribute("fill", i === 2 ? "#ff5555" : COLORS.led);
    // Add glow effect
    led.setAttribute("filter", "url(#ledGlow)");
    group.appendChild(led);
  }
}

// ============================================================================
// Device Drawing
// ============================================================================

function drawDevice(
  document: Document,
  group: SVGGElement,
  device: POCDevice,
  baseZ: number,
): void {
  const deviceHeight = device.uHeight * U_HEIGHT;
  const deviceZ = baseZ + FRAME_THICKNESS + (device.uPosition - 1) * U_HEIGHT;
  const deviceX = RAIL_INSET + RAIL_WIDTH + 2;
  const deviceWidth = RACK_WIDTH - 2 * (RAIL_INSET + RAIL_WIDTH + 2);
  const deviceDepth = device.isFullDepth ? RACK_DEPTH - 10 : RACK_DEPTH * 0.4;

  // Main device body
  draw3DBox(
    document,
    group,
    deviceX,
    2,
    deviceZ,
    deviceWidth,
    deviceDepth,
    deviceHeight - 1,
    device.color,
    {
      topColor: lightenColor(device.color, 0.15),
      sideColor: darkenColor(device.color, 0.25),
      stroke: darkenColor(device.color, 0.4),
    },
  );

  // Add front panel details
  drawDeviceFrontDetails(
    document,
    group,
    device,
    deviceX,
    deviceZ,
    deviceWidth,
    deviceHeight,
  );
}

function drawDeviceFrontDetails(
  document: Document,
  group: SVGGElement,
  device: POCDevice,
  x: number,
  z: number,
  width: number,
  height: number,
): void {
  // Horizontal lines on front panel (like bezel lines)
  const lineCount = Math.max(1, Math.floor(height / 8));
  const lineSpacing = height / (lineCount + 1);
  const lineColor = darkenColor(device.color, 0.15);

  for (let i = 1; i <= lineCount; i++) {
    const lineZ = z + i * lineSpacing;
    const lineStart = isoProject(x + 5, 0, lineZ);
    const lineEnd = isoProject(x + width - 5, 0, lineZ);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(lineStart.x));
    line.setAttribute("y1", String(lineStart.y));
    line.setAttribute("x2", String(lineEnd.x));
    line.setAttribute("y2", String(lineEnd.y));
    line.setAttribute("stroke", lineColor);
    line.setAttribute("stroke-width", "1");
    group.appendChild(line);
  }

  // Status LEDs on front
  if (device.hasLeds) {
    const ledZ = z + height - 6;
    for (let i = 0; i < 4; i++) {
      const ledX = x + 8 + i * 6;
      const ledPos = isoProject(ledX, 0, ledZ);
      const led = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      led.setAttribute("cx", String(ledPos.x));
      led.setAttribute("cy", String(ledPos.y));
      led.setAttribute("r", "2");
      led.setAttribute("fill", i < 2 ? COLORS.led : "#ffb86c");
      group.appendChild(led);
    }
  }

  // Drive bays
  if (device.hasDriveBays) {
    const bayCount = Math.min(4, device.uHeight);
    const bayHeight = (height - 10) / bayCount;
    const bayWidth = 25;

    for (let i = 0; i < bayCount; i++) {
      const bayZ = z + 5 + i * bayHeight;
      const bayX = x + width - bayWidth - 8;

      // Bay outline
      const bayTL = isoProject(bayX, 0, bayZ + bayHeight - 2);
      const bayTR = isoProject(bayX + bayWidth, 0, bayZ + bayHeight - 2);
      const bayBR = isoProject(bayX + bayWidth, 0, bayZ + 2);
      const bayBL = isoProject(bayX, 0, bayZ + 2);

      const bayRect = createPolygon(
        document,
        [bayTL, bayTR, bayBR, bayBL],
        darkenColor(device.color, 0.2),
        darkenColor(device.color, 0.4),
      );
      group.appendChild(bayRect);

      // LED on bay
      const bayLedPos = isoProject(bayX + 3, 0, bayZ + bayHeight / 2);
      const bayLed = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      bayLed.setAttribute("cx", String(bayLedPos.x));
      bayLed.setAttribute("cy", String(bayLedPos.y));
      bayLed.setAttribute("r", "1.5");
      bayLed.setAttribute("fill", COLORS.led);
      group.appendChild(bayLed);
    }
  }
}

// ============================================================================
// Legend
// ============================================================================

function drawLegend(
  document: Document,
  svg: SVGSVGElement,
  devices: POCDevice[],
  x: number,
  y: number,
): void {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

  // Title
  const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
  title.setAttribute("x", String(x));
  title.setAttribute("y", String(y));
  title.setAttribute("fill", COLORS.text);
  title.setAttribute("font-family", "Inter, system-ui, sans-serif");
  title.setAttribute("font-size", "12");
  title.setAttribute("font-weight", "bold");
  title.textContent = "DEVICES";
  group.appendChild(title);

  // Device entries
  devices.forEach((device, index) => {
    const entryY = y + 20 + index * 20;

    // Color swatch (small 3D box effect)
    const swatchSize = 12;
    const swatch = createRect(
      document,
      x,
      entryY - 10,
      swatchSize,
      swatchSize,
      device.color,
      darkenColor(device.color, 0.3),
    );
    group.appendChild(swatch);

    // Half-depth indicator
    if (!device.isFullDepth) {
      const halfBadge = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      halfBadge.setAttribute("x", String(x + swatchSize / 2));
      halfBadge.setAttribute("y", String(entryY - 1));
      halfBadge.setAttribute("fill", darkenColor(device.color, 0.5));
      halfBadge.setAttribute("font-family", "Inter, system-ui, sans-serif");
      halfBadge.setAttribute("font-size", "8");
      halfBadge.setAttribute("font-weight", "bold");
      halfBadge.setAttribute("text-anchor", "middle");
      halfBadge.textContent = "½";
      group.appendChild(halfBadge);
    }

    // Device name and U height
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(x + swatchSize + 8));
    text.setAttribute("y", String(entryY));
    text.setAttribute("fill", COLORS.text);
    text.setAttribute("font-family", "Inter, system-ui, sans-serif");
    text.setAttribute("font-size", "11");
    text.textContent = `${device.name} (${device.uHeight}U)`;
    group.appendChild(text);
  });

  svg.appendChild(group);
}

// ============================================================================
// SVG Filters (for LED glow)
// ============================================================================

function addFilters(document: Document, svg: SVGSVGElement): void {
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

  // LED glow filter
  const filter = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "filter",
  );
  filter.setAttribute("id", "ledGlow");
  filter.setAttribute("x", "-50%");
  filter.setAttribute("y", "-50%");
  filter.setAttribute("width", "200%");
  filter.setAttribute("height", "200%");

  const blur = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "feGaussianBlur",
  );
  blur.setAttribute("stdDeviation", "2");
  blur.setAttribute("result", "blur");
  filter.appendChild(blur);

  const merge = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "feMerge",
  );
  const mergeNode1 = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "feMergeNode",
  );
  mergeNode1.setAttribute("in", "blur");
  const mergeNode2 = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "feMergeNode",
  );
  mergeNode2.setAttribute("in", "SourceGraphic");
  merge.appendChild(mergeNode1);
  merge.appendChild(mergeNode2);
  filter.appendChild(merge);

  defs.appendChild(filter);
  svg.appendChild(defs);
}

// ============================================================================
// Main Generation Functions
// ============================================================================

function generateSingleView(): string {
  // Calculate canvas size
  // The isometric projection expands the width and height
  const projectedWidth = (RACK_WIDTH + RACK_DEPTH) * COS_30;
  const projectedHeight =
    (RACK_WIDTH + RACK_DEPTH) * SIN_30 + RACK_HEIGHT + FRAME_THICKNESS * 2;

  const canvasWidth = projectedWidth + CANVAS_PADDING * 2;
  const legendHeight = 20 + sampleDevices.length * 20 + 20;
  const canvasHeight =
    projectedHeight + CANVAS_PADDING * 2 + LEGEND_GAP + legendHeight;

  const { document, svg } = createSvgDocument(canvasWidth, canvasHeight);
  addFilters(document, svg);

  // Create main group and translate to position
  const mainGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");

  // Offset to center the rack (accounting for isometric projection)
  const offsetX = CANVAS_PADDING + RACK_DEPTH * COS_30;
  const offsetY =
    CANVAS_PADDING +
    RACK_HEIGHT +
    FRAME_THICKNESS * 2 +
    (RACK_WIDTH + RACK_DEPTH) * SIN_30;

  mainGroup.setAttribute("transform", `translate(${offsetX}, ${offsetY})`);

  // Draw cabinet
  drawRackCabinet(document, mainGroup);

  // Draw devices (sorted by U position for correct z-order - lower U first)
  const sortedDevices = [...sampleDevices].sort(
    (a, b) => a.uPosition - b.uPosition,
  );
  sortedDevices.forEach((device) => {
    drawDevice(document, mainGroup, device, 0);
  });

  svg.appendChild(mainGroup);

  // View label
  const viewLabel = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  viewLabel.setAttribute("x", String(canvasWidth / 2));
  viewLabel.setAttribute("y", String(offsetY + 20));
  viewLabel.setAttribute("fill", COLORS.textMuted);
  viewLabel.setAttribute("font-family", "Inter, system-ui, sans-serif");
  viewLabel.setAttribute("font-size", "11");
  viewLabel.setAttribute("text-anchor", "middle");
  viewLabel.textContent = "FRONT VIEW";
  svg.appendChild(viewLabel);

  // Legend
  const legendY = offsetY + LEGEND_GAP + 20;
  drawLegend(document, svg, sampleDevices, CANVAS_PADDING, legendY);

  return svg.outerHTML;
}

function generateDualView(): string {
  // Calculate canvas size for two racks
  const projectedWidth = (RACK_WIDTH + RACK_DEPTH) * COS_30;
  const projectedHeight =
    (RACK_WIDTH + RACK_DEPTH) * SIN_30 + RACK_HEIGHT + FRAME_THICKNESS * 2;

  const rackGap = 80;
  const canvasWidth = projectedWidth * 2 + rackGap + CANVAS_PADDING * 2;
  const legendHeight = 20 + sampleDevices.length * 20 + 20;
  const canvasHeight =
    projectedHeight + CANVAS_PADDING * 2 + LEGEND_GAP + legendHeight;

  const { document, svg } = createSvgDocument(canvasWidth, canvasHeight);
  addFilters(document, svg);

  const baseOffsetY =
    CANVAS_PADDING +
    RACK_HEIGHT +
    FRAME_THICKNESS * 2 +
    (RACK_WIDTH + RACK_DEPTH) * SIN_30;

  // Front view (left)
  const frontGroup = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "g",
  );
  const frontOffsetX = CANVAS_PADDING + RACK_DEPTH * COS_30;
  frontGroup.setAttribute(
    "transform",
    `translate(${frontOffsetX}, ${baseOffsetY})`,
  );
  drawRackCabinet(document, frontGroup);
  const sortedDevices = [...sampleDevices].sort(
    (a, b) => a.uPosition - b.uPosition,
  );
  sortedDevices.forEach((device) => {
    drawDevice(document, frontGroup, device, 0);
  });
  svg.appendChild(frontGroup);

  // Front label
  const frontLabel = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  frontLabel.setAttribute(
    "x",
    String(frontOffsetX + projectedWidth / 2 - (RACK_DEPTH * COS_30) / 2),
  );
  frontLabel.setAttribute("y", String(baseOffsetY + 20));
  frontLabel.setAttribute("fill", COLORS.textMuted);
  frontLabel.setAttribute("font-family", "Inter, system-ui, sans-serif");
  frontLabel.setAttribute("font-size", "11");
  frontLabel.setAttribute("text-anchor", "middle");
  frontLabel.textContent = "FRONT";
  svg.appendChild(frontLabel);

  // Rear view (right) - same cabinet, devices shown differently
  const rearGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const rearOffsetX = frontOffsetX + projectedWidth + rackGap;
  rearGroup.setAttribute(
    "transform",
    `translate(${rearOffsetX}, ${baseOffsetY})`,
  );
  drawRackCabinet(document, rearGroup);
  // In real implementation, rear view would show rear-mounted devices
  // For POC, we show same devices
  sortedDevices.forEach((device) => {
    drawDevice(document, rearGroup, device, 0);
  });
  svg.appendChild(rearGroup);

  // Rear label
  const rearLabel = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  rearLabel.setAttribute(
    "x",
    String(rearOffsetX + projectedWidth / 2 - (RACK_DEPTH * COS_30) / 2),
  );
  rearLabel.setAttribute("y", String(baseOffsetY + 20));
  rearLabel.setAttribute("fill", COLORS.textMuted);
  rearLabel.setAttribute("font-family", "Inter, system-ui, sans-serif");
  rearLabel.setAttribute("font-size", "11");
  rearLabel.setAttribute("text-anchor", "middle");
  rearLabel.textContent = "REAR";
  svg.appendChild(rearLabel);

  // Legend (centered below both racks)
  const legendY = baseOffsetY + LEGEND_GAP + 20;
  drawLegend(document, svg, sampleDevices, CANVAS_PADDING, legendY);

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

  console.log("\nPOC v2 complete! Open the SVG files in a browser to review.");
  console.log(
    "See docs/research/isometric-poc-notes.md for visual assessment.",
  );
}

main();
