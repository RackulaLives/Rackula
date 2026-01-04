/**
 * Connection Routing Algorithm - Reference Implementation
 * Spike #262: Cable Path Rendering Algorithm
 *
 * This module provides algorithms for calculating cable connection paths
 * between device ports in Rackula's SVG rack visualization.
 *
 * NOT FOR PRODUCTION - This is a reference implementation for the spike.
 * Production implementation should be in src/lib/utils/connection-routing.ts
 */

import {
  U_HEIGHT_PX,
  RAIL_WIDTH,
  BASE_RACK_WIDTH,
  BASE_RACK_PADDING,
} from "../../src/lib/constants/layout";

// Port rendering constants (from PortIndicators.svelte)
const PORT_RADIUS = 3;
const PORT_SPACING = 8;
const PORT_Y_OFFSET = 8;

// Routing constants
const DEFAULT_GUTTER_OFFSET = 30; // Pixels outside rack for external routing

// === TYPES ===

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PathOptions {
  gutterOffset?: number;
  side?: "left" | "right" | "auto";
  index?: number; // For load balancing left/right
}

interface PortReference {
  deviceId: string;
  portIndex: number;
}

interface DevicePosition {
  position: number; // U number (1-based, bottom-up)
  u_height: number;
  portCount: number;
  face: "front" | "rear";
}

// === PORT POSITION CALCULATION ===

/**
 * Calculate absolute SVG coordinates for a port on a device.
 *
 * Coordinate system:
 * - Origin (0,0) is top-left of rack SVG
 * - Y increases downward
 * - Ports are positioned at the bottom of devices
 *
 * @param device - Device position information
 * @param portIndex - Zero-based port index
 * @param rackHeight - Total rack height in U
 * @param rackWidth - Rack width in pixels (default BASE_RACK_WIDTH)
 * @returns Absolute SVG coordinates for the port center
 */
export function getPortPosition(
  device: DevicePosition,
  portIndex: number,
  rackHeight: number,
  rackWidth: number = BASE_RACK_WIDTH
): Point {
  // Device Y position (SVG origin at top-left, U numbers from bottom)
  const deviceY =
    (rackHeight - device.position - device.u_height + 1) * U_HEIGHT_PX;

  // Device X starts after left rail
  const deviceX = RAIL_WIDTH;

  // Device dimensions
  const deviceWidth = rackWidth - RAIL_WIDTH * 2;
  const deviceHeight = device.u_height * U_HEIGHT_PX;

  // Port positions (centered horizontally at device bottom)
  const portCount = device.portCount;
  const totalPortWidth = (portCount - 1) * PORT_SPACING;
  const portStartX = (deviceWidth - totalPortWidth) / 2;

  // Final absolute position (including rack padding and top rail)
  const rackOffset = BASE_RACK_PADDING + RAIL_WIDTH;

  return {
    x: deviceX + portStartX + portIndex * PORT_SPACING,
    y: deviceY + deviceHeight - PORT_Y_OFFSET + rackOffset,
  };
}

// === PATH GENERATION ALGORITHMS ===

/**
 * Algorithm 1: Straight Lines
 *
 * Direct point-to-point connection.
 *
 * Pros: Simple, fast
 * Cons: Crosses through device bodies, visually cluttered
 * Score: 2/5 - Useful for debugging only
 */
export function straightLinePath(source: Point, target: Point): string {
  return `M ${source.x},${source.y} L ${target.x},${target.y}`;
}

/**
 * Algorithm 2: Quadratic Bezier
 *
 * Single control point curve, offset to the side.
 *
 * Pros: Smooth curves, simple
 * Cons: Limited flexibility, can look unnatural for vertical connections
 * Score: 3/5 - Acceptable but limited
 */
export function quadraticBezierPath(
  source: Point,
  target: Point,
  rackBounds: Rect,
  options: PathOptions = {}
): string {
  const gutterOffset = options.gutterOffset ?? DEFAULT_GUTTER_OFFSET;

  // Control point at midpoint, offset horizontally
  const cx = rackBounds.x + rackBounds.width + gutterOffset;
  const cy = (source.y + target.y) / 2;

  return `M ${source.x},${source.y} Q ${cx},${cy} ${target.x},${target.y}`;
}

/**
 * Algorithm 3: Cubic Bezier
 *
 * Two control points for smooth S-curves.
 *
 * Pros: Professional appearance, smooth curves
 * Cons: More complex calculation
 * Score: 4/5 - Recommended base approach
 */
export function cubicBezierPath(
  source: Point,
  target: Point,
  rackBounds: Rect,
  options: PathOptions = {}
): string {
  const gutterOffset = options.gutterOffset ?? DEFAULT_GUTTER_OFFSET;

  // Control points exit horizontally, then curve to destination
  const gutterX = rackBounds.x + rackBounds.width + gutterOffset;

  const c1x = gutterX;
  const c1y = source.y;
  const c2x = gutterX;
  const c2y = target.y;

  return `M ${source.x},${source.y} C ${c1x},${c1y} ${c2x},${c2y} ${target.x},${target.y}`;
}

/**
 * Algorithm 4: Orthogonal Routing
 *
 * Right-angle paths through gutter.
 *
 * Pros: Clear engineering-style routing, easy to trace
 * Cons: Needs path conflict resolution, less organic
 * Score: 3/5 - Good for technical users
 */
export function orthogonalPath(
  source: Point,
  target: Point,
  rackBounds: Rect,
  options: PathOptions = {}
): string {
  const gutterOffset = options.gutterOffset ?? DEFAULT_GUTTER_OFFSET;
  const gutterX = rackBounds.x + rackBounds.width + gutterOffset;

  return `M ${source.x},${source.y} H ${gutterX} V ${target.y} H ${target.x}`;
}

/**
 * Algorithm 5: External Channel Routing (RECOMMENDED)
 *
 * Connections route through gutters on left/right of rack,
 * using cubic bezier for smooth corners.
 *
 * Pros: Never crosses devices, clean visual hierarchy, natural bundling
 * Cons: Uses more horizontal space
 * Score: 5/5 - Recommended approach
 */
export function externalChannelPath(
  source: Point,
  target: Point,
  rackBounds: Rect,
  options: PathOptions = {}
): string {
  const gutterOffset = options.gutterOffset ?? DEFAULT_GUTTER_OFFSET;
  const index = options.index ?? 0;

  // Determine routing side (balance left/right or use explicit)
  let side = options.side;
  if (side === "auto" || side === undefined) {
    // Default: alternate based on index for visual balance
    // Alternative: route based on vertical direction (source.y > target.y)
    side = index % 2 === 0 ? "right" : "left";
  }

  const gutterX =
    side === "right"
      ? rackBounds.x + rackBounds.width + gutterOffset
      : rackBounds.x - gutterOffset;

  // Cubic bezier with control points at gutter
  return `M ${source.x},${source.y} C ${gutterX},${source.y} ${gutterX},${target.y} ${target.x},${target.y}`;
}

// === CROSS-FACE CONNECTIONS ===

/**
 * Calculate path for cross-face connection in single-view mode.
 *
 * Shows connection "entering" the device with a tunnel indicator.
 */
export function crossFaceTunnelPath(
  source: Point,
  deviceEdge: Point,
  _rackBounds: Rect
): string {
  // Path goes from port to device edge
  return `M ${source.x},${source.y} L ${deviceEdge.x},${deviceEdge.y}`;
}

/**
 * Calculate path for cross-face connection in dual-view mode.
 *
 * Creates a curved bridge between front and rear views.
 */
export function crossFaceBridgePath(
  frontPort: Point,
  rearPort: Point,
  gapWidth: number
): string {
  // Curved path that bridges the gap between views
  const c1x = frontPort.x + gapWidth / 3;
  const c2x = rearPort.x - gapWidth / 3;

  return `M ${frontPort.x},${frontPort.y} C ${c1x},${frontPort.y} ${c2x},${rearPort.y} ${rearPort.x},${rearPort.y}`;
}

// === MAIN ROUTING FUNCTION ===

export type PathAlgorithm =
  | "straight"
  | "quadratic"
  | "cubic"
  | "orthogonal"
  | "external";

/**
 * Calculate connection path using specified algorithm.
 *
 * @param source - Source port position
 * @param target - Target port position
 * @param rackBounds - Rack bounding rectangle
 * @param algorithm - Path algorithm to use
 * @param options - Algorithm-specific options
 */
export function calculateConnectionPath(
  source: Point,
  target: Point,
  rackBounds: Rect,
  algorithm: PathAlgorithm = "external",
  options: PathOptions = {}
): string {
  switch (algorithm) {
    case "straight":
      return straightLinePath(source, target);
    case "quadratic":
      return quadraticBezierPath(source, target, rackBounds, options);
    case "cubic":
      return cubicBezierPath(source, target, rackBounds, options);
    case "orthogonal":
      return orthogonalPath(source, target, rackBounds, options);
    case "external":
    default:
      return externalChannelPath(source, target, rackBounds, options);
  }
}

// === PERFORMANCE NOTES ===

/**
 * Performance Characteristics:
 *
 * | Algorithm   | Time Complexity | DOM Nodes | Best For           |
 * |-------------|-----------------|-----------|---------------------|
 * | straight    | O(1)            | 1 path    | Debugging           |
 * | quadratic   | O(1)            | 1 path    | Simple layouts      |
 * | cubic       | O(1)            | 1 path    | General use         |
 * | orthogonal  | O(n) conflict   | 1 path    | Technical diagrams  |
 * | external    | O(1)            | 1 path    | Production (rec.)   |
 *
 * Expected render times (100 connections):
 * - Initial render: <16ms (60fps capable)
 * - Hover update: <5ms
 *
 * Optimization strategies for >100 connections:
 * 1. Virtualization (only render visible)
 * 2. Path simplification at low zoom
 * 3. CSS containment on connection layer
 * 4. requestAnimationFrame batching
 */
