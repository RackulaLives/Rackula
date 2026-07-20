/**
 * Connection Path Geometry
 * Spike #262: Cable Path Rendering Algorithm (issue #1931)
 *
 * Pure, DOM-free functions that turn two port anchors into renderable SVG
 * connection geometry: a cubic bezier path routed through an external
 * "channel" (gutter) to the left or right of the rack, and an optional
 * direction arrow at the path midpoint.
 *
 * This is the production implementation of the algorithm explored in
 * docs/research/connection-routing.ts (spike #262's externalChannelPath,
 * scored 5/5: "never crosses devices, clean visual hierarchy, natural
 * bundling"). The reference file is NOT imported from; the shape of the
 * options and the routing math is reproduced here deliberately, adapted to
 * this project's anchor/offset conventions (see port-geometry.ts) and split
 * into independently testable steps rather than one calculateConnectionPath
 * dispatcher.
 *
 * Anchor coordinates must come from port-geometry.ts's getPortAnchor(s) -
 * this module never computes a port position itself, only what to draw once
 * two anchors are known (buildPortAnchorMap below is the one exception: it
 * is a thin per-device loop around getPortAnchors, not a re-implementation).
 */

import type {
  Connection,
  DeviceType,
  InterfaceTemplate,
  PlacedDevice,
  PlacedPort,
  PortDirection,
  RackView,
} from "$lib/types";
import { inferDirection } from "$lib/utils/port-utils";
import {
  getPortAnchors,
  type PortAnchor,
  type PortGeometryOffset,
} from "$lib/utils/port-geometry";
import { toHumanUnits } from "$lib/utils/position";
import type { RackDimensions } from "$lib/utils/rack-drop-coordinator";

/** A 2D point in Rack SVG space. */
export interface Point {
  x: number;
  y: number;
}

/** The rack's bounding box in Rack SVG space, used to place the external gutter. */
export interface RackBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Which side of the rack a connection's gutter/channel routes through. */
export type ChannelSide = "left" | "right";

/** Default horizontal distance the gutter sits outside the rack body, in px. */
export const DEFAULT_GUTTER_OFFSET = 30;

/** Total tip-to-base length of a direction arrow, in px. */
export const ARROW_LENGTH = 7;

/** Total base width of a direction arrow, in px. */
export const ARROW_WIDTH = 5;

export interface CubicControlPoints {
  c1: Point;
  c2: Point;
}

/**
 * Alternate connections between the right and left gutter so that, absent
 * any other signal, cabling load-balances visually across both sides of the
 * rack instead of stacking every curve on one edge. Index is the position of
 * a connection within the set actually being rendered (see
 * buildRenderedConnections), not its position in the raw connections array,
 * so a skipped (unanchored) connection does not "use up" a side.
 */
export function assignChannelSide(index: number): ChannelSide {
  return index % 2 === 0 ? "right" : "left";
}

/**
 * Control points for a cubic bezier that exits both endpoints horizontally
 * toward a shared gutter line, then curves into the target. This is the
 * "external channel" shape: the curve never crosses the rack body because
 * both control points sit outside it on the same side.
 */
export function computeChannelControlPoints(
  source: Point,
  target: Point,
  rackBounds: RackBounds,
  side: ChannelSide,
  gutterOffset: number = DEFAULT_GUTTER_OFFSET,
): CubicControlPoints {
  const gutterX =
    side === "right"
      ? rackBounds.x + rackBounds.width + gutterOffset
      : rackBounds.x - gutterOffset;

  return {
    c1: { x: gutterX, y: source.y },
    c2: { x: gutterX, y: target.y },
  };
}

/** SVG path `d` attribute for a cubic bezier from source to target. */
export function buildCubicBezierPath(
  source: Point,
  control: CubicControlPoints,
  target: Point,
): string {
  return `M ${source.x},${source.y} C ${control.c1.x},${control.c1.y} ${control.c2.x},${control.c2.y} ${target.x},${target.y}`;
}

function cubicComponentAt(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const mt = 1 - t;
  return (
    mt * mt * mt * p0 +
    3 * mt * mt * t * p1 +
    3 * mt * t * t * p2 +
    t * t * t * p3
  );
}

/** Point on the cubic bezier at parameter t (De Casteljau / Bernstein form). */
export function cubicBezierPointAt(
  source: Point,
  control: CubicControlPoints,
  target: Point,
  t: number,
): Point {
  return {
    x: cubicComponentAt(source.x, control.c1.x, control.c2.x, target.x, t),
    y: cubicComponentAt(source.y, control.c1.y, control.c2.y, target.y, t),
  };
}

function cubicDerivativeComponentAt(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const mt = 1 - t;
  return (
    3 * mt * mt * (p1 - p0) + 6 * mt * t * (p2 - p1) + 3 * t * t * (p3 - p2)
  );
}

/** Tangent (derivative) vector of the cubic bezier at parameter t, unnormalised. */
export function cubicBezierTangentAt(
  source: Point,
  control: CubicControlPoints,
  target: Point,
  t: number,
): Point {
  return {
    x: cubicDerivativeComponentAt(
      source.x,
      control.c1.x,
      control.c2.x,
      target.x,
      t,
    ),
    y: cubicDerivativeComponentAt(
      source.y,
      control.c1.y,
      control.c2.y,
      target.y,
      t,
    ),
  };
}

/**
 * Which way a direction arrow should point, or null when no arrow should be
 * drawn. Gating rule (#1931 AC): an arrow renders only when the two ports
 * have unambiguous, opposite roles - one "output", the other "input". Any
 * other combination (both bidirectional, both unset, both the same role, or
 * either side "bidirectional"/unset) renders as a plain line.
 */
export type ArrowDirection = "a-to-b" | "b-to-a" | null;

export function resolveArrowDirection(
  aDirection: PortDirection | undefined,
  bDirection: PortDirection | undefined,
): ArrowDirection {
  if (aDirection === "output" && bDirection === "input") return "a-to-b";
  if (aDirection === "input" && bDirection === "output") return "b-to-a";
  return null;
}

export interface ArrowTriangle {
  tip: Point;
  base1: Point;
  base2: Point;
}

export interface ArrowSize {
  length: number;
  width: number;
}

const DEFAULT_ARROW_SIZE: ArrowSize = {
  length: ARROW_LENGTH,
  width: ARROW_WIDTH,
};

/**
 * A small triangle centred on the path midpoint, pointing along the curve's
 * tangent there (or against it, for "b-to-a"). Returns null when there is no
 * direction to show, or when the tangent is degenerate (zero-length, e.g. a
 * connection whose two anchors coincide) since no orientation can be drawn.
 */
export function computeArrowTriangle(
  source: Point,
  control: CubicControlPoints,
  target: Point,
  direction: ArrowDirection,
  size: ArrowSize = DEFAULT_ARROW_SIZE,
): ArrowTriangle | null {
  if (direction === null) return null;

  const midpoint = cubicBezierPointAt(source, control, target, 0.5);
  const rawTangent = cubicBezierTangentAt(source, control, target, 0.5);
  const tangent =
    direction === "b-to-a"
      ? { x: -rawTangent.x, y: -rawTangent.y }
      : rawTangent;

  const magnitude = Math.hypot(tangent.x, tangent.y);
  if (magnitude === 0) return null;

  const unit = { x: tangent.x / magnitude, y: tangent.y / magnitude };
  const perp = { x: -unit.y, y: unit.x };
  const halfLength = size.length / 2;
  const halfWidth = size.width / 2;

  const tip = {
    x: midpoint.x + unit.x * halfLength,
    y: midpoint.y + unit.y * halfLength,
  };
  const baseCentre = {
    x: midpoint.x - unit.x * halfLength,
    y: midpoint.y - unit.y * halfLength,
  };

  return {
    tip,
    base1: {
      x: baseCentre.x + perp.x * halfWidth,
      y: baseCentre.y + perp.y * halfWidth,
    },
    base2: {
      x: baseCentre.x - perp.x * halfWidth,
      y: baseCentre.y - perp.y * halfWidth,
    },
  };
}

/** SVG `points` attribute for an arrow triangle's `<polygon>`. */
export function arrowPointsAttr(triangle: ArrowTriangle): string {
  const { tip, base1, base2 } = triangle;
  return `${tip.x},${tip.y} ${base1.x},${base1.y} ${base2.x},${base2.y}`;
}

export interface ConnectionGeometry {
  path: string;
  side: ChannelSide;
  midpoint: Point;
  arrow: ArrowTriangle | null;
}

export interface ConnectionGeometryOptions {
  gutterOffset?: number;
  arrowSize?: ArrowSize;
}

/**
 * Full renderable geometry for one connection: the bezier path, which gutter
 * it routed through, its midpoint, and (when direction is unambiguous) the
 * direction arrow triangle.
 */
export function computeConnectionGeometry(
  source: Point,
  target: Point,
  rackBounds: RackBounds,
  index: number,
  direction: ArrowDirection,
  options: ConnectionGeometryOptions = {},
): ConnectionGeometry {
  const side = assignChannelSide(index);
  const control = computeChannelControlPoints(
    source,
    target,
    rackBounds,
    side,
    options.gutterOffset,
  );
  const path = buildCubicBezierPath(source, control, target);
  const midpoint = cubicBezierPointAt(source, control, target, 0.5);
  const arrow = computeArrowTriangle(
    source,
    control,
    target,
    direction,
    options.arrowSize,
  );

  return { path, side, midpoint, arrow };
}

/**
 * Effective signal direction for a connection endpoint: an explicit
 * PlacedPort.direction override wins, then the InterfaceTemplate default,
 * then the same inferDirection() fallback PortIndicators uses for the port's
 * own direction glyph - so a connection between two ports shows an arrow
 * under exactly the conditions those ports already display one individually.
 * Falls back to PlacedPort.type when no InterfaceTemplate is available
 * (matching PlacedPort.type's documented purpose: "avoids lookups for cable
 * routing").
 */
export function resolveConnectionPortDirection(
  port: PlacedPort | undefined,
  iface: InterfaceTemplate | undefined,
): PortDirection | undefined {
  const explicit = port?.direction ?? iface?.direction;
  if (explicit) return explicit;

  const type = iface?.type ?? port?.type;
  if (!type) return undefined;

  return inferDirection(type, iface?.mgmt_only);
}

export interface DeviceOffsetParams {
  /** PlacedDevice.position, in internal units (1/6U). */
  position: number;
  deviceUHeight: number;
  rackHeight: number;
  uHeight: number;
  railWidth: number;
  rackPadding: number;
}

/**
 * The SVG-space offset of a device's own <g transform="translate(...)"> within
 * the Rack SVG, reproducing the formula RackDevice.svelte and Rack.svelte
 * apply together: RAIL_WIDTH (device g's own x translate, since a rail-mounted
 * device always spans the full interior width - slotXOffset is always 0 at
 * rack level) and RACK_PADDING + RAIL_WIDTH + yPosition (the devices layer's y
 * translate plus the device g's own y translate). This is the same offset
 * documented in port-geometry.ts's PortGeometryOptions.offset, computed here
 * from a PlacedDevice + rack dimensions instead of read off a mounted
 * component, so ConnectionLayer can locate every device's ports without
 * depending on RackDevice internals.
 */
export function computeDeviceOffset(
  params: DeviceOffsetParams,
): PortGeometryOffset {
  const positionHuman = toHumanUnits(params.position);
  const yPosition =
    (params.rackHeight - positionHuman - params.deviceUHeight + 1) *
    params.uHeight;

  return {
    x: params.railWidth,
    y: params.rackPadding + params.railWidth + yPosition,
  };
}

export interface ResolvedPortAnchor {
  anchor: PortAnchor;
  direction: PortDirection | undefined;
}

/**
 * Every individually-anchored port across a set of placed devices, keyed by
 * PlacedPort.id, paired with its effective direction. Devices in
 * grouped/high-density mode (see port-geometry.ts's HIGH_DENSITY_THRESHOLD)
 * contribute no entries for their ports - getPortAnchors returns [] for them
 * by design - which is what lets buildRenderedConnections below skip a
 * connection to such a port instead of guessing at a location for it.
 */
export function buildPortAnchorMap(
  devices: PlacedDevice[],
  deviceTypesBySlug: Map<string, DeviceType>,
  rackView: RackView,
  rackDims: RackDimensions,
): Map<string, ResolvedPortAnchor> {
  const map = new Map<string, ResolvedPortAnchor>();

  for (const placedDevice of devices) {
    const deviceType = deviceTypesBySlug.get(placedDevice.device_type);
    if (!deviceType?.interfaces?.length) continue;

    const ports = placedDevice.ports ?? [];
    const offset = computeDeviceOffset({
      position: placedDevice.position,
      deviceUHeight: deviceType.u_height,
      rackHeight: rackDims.rackHeight,
      uHeight: rackDims.uHeight,
      railWidth: rackDims.railWidth,
      rackPadding: rackDims.rackPadding,
    });

    const anchors = getPortAnchors({
      interfaces: deviceType.interfaces,
      ports,
      rackView,
      deviceWidth: rackDims.interiorWidth,
      deviceHeight: deviceType.u_height * rackDims.uHeight,
      offset,
    });

    for (const anchor of anchors) {
      const port = ports.find((p) => p.id === anchor.portId);
      const iface = port
        ? deviceType.interfaces[port.template_index]
        : undefined;
      map.set(anchor.portId, {
        anchor,
        direction: resolveConnectionPortDirection(port, iface),
      });
    }
  }

  return map;
}

export interface RenderedConnection {
  connection: Connection;
  geometry: ConnectionGeometry;
}

/**
 * Resolve every connection to its renderable geometry, skipping any
 * connection where either endpoint has no anchor.
 *
 * Grouped-mode fallback decision (#1931 AC, #3089): a port with no anchor -
 * because its device is over the high-density threshold, the port is on the
 * other rack face, or the layout predates PlacedPort identity - is skipped
 * entirely rather than approximated (e.g. anchored to the device's edge
 * centre). An edge-centre fallback would draw a specific, plausible-looking
 * line to a location that is not actually where the port is, misleading the
 * viewer about what is connected to what. Silently omitting the connection
 * is the honest failure mode; the connection still exists in the data and
 * reappears the moment its port becomes individually addressable (device
 * drops under the threshold, or the layout gains PlacedPort ids).
 */
export function buildRenderedConnections(
  connections: Connection[],
  portAnchors: Map<string, ResolvedPortAnchor>,
  rackBounds: RackBounds,
  options: ConnectionGeometryOptions = {},
): RenderedConnection[] {
  const results: RenderedConnection[] = [];
  let index = 0;

  for (const connection of connections) {
    const a = portAnchors.get(connection.a_port_id);
    const b = portAnchors.get(connection.b_port_id);
    if (!a || !b) continue;

    const direction = resolveArrowDirection(a.direction, b.direction);
    const geometry = computeConnectionGeometry(
      a.anchor,
      b.anchor,
      rackBounds,
      index,
      direction,
      options,
    );

    results.push({ connection, geometry });
    index++;
  }

  return results;
}
