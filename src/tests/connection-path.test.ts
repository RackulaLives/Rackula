/**
 * Tests for the connection path geometry helpers (#1931): pure, DOM-free
 * functions covering the external-channel cubic bezier routing (spike #262),
 * channel-side assignment, direction-arrow placement/orientation and gating,
 * the device-offset formula that mirrors RackDevice.svelte, and the
 * grouped-mode fallback that skips a connection when either endpoint has no
 * per-port anchor (#3089).
 *
 * Rendered-DOM assertions (hover highlight, on-screen tooltip, frame-rate)
 * are out of unit scope per the issue's Testing Notes; they are verified
 * manually / via E2E, not here.
 *
 * Connection test objects use src/tests/factories.ts's createTestConnection
 * (added by #3090's PR #3115).
 */
import { describe, it, expect } from "vitest";
import type { PortDirection } from "$lib/types";
import { toInternalUnits } from "$lib/utils/position";
import {
  createTestConnection,
  createTestDevice,
  createTestDeviceType,
  createTestInterfaceTemplate,
  createTestPlacedPort,
} from "./factories";
import {
  DEFAULT_GUTTER_OFFSET,
  arrowPointsAttr,
  assignChannelSide,
  buildCubicBezierPath,
  buildPortAnchorMap,
  buildRenderedConnections,
  computeArrowTriangle,
  computeChannelControlPoints,
  computeConnectionGeometry,
  computeDeviceOffset,
  cubicBezierPointAt,
  cubicBezierTangentAt,
  resolveArrowDirection,
  resolveConnectionPortDirection,
  type ResolvedPortAnchor,
} from "$lib/utils/connection-path";
import { HIGH_DENSITY_THRESHOLD } from "$lib/utils/port-geometry";

function makeResolvedAnchor(
  portId: string,
  x: number,
  y: number,
  direction?: PortDirection,
): ResolvedPortAnchor {
  return { anchor: { portId, x, y }, direction };
}

describe("assignChannelSide", () => {
  it("alternates right/left starting with right at index 0", () => {
    expect(assignChannelSide(0)).toBe("right");
    expect(assignChannelSide(1)).toBe("left");
    expect(assignChannelSide(2)).toBe("right");
    expect(assignChannelSide(3)).toBe("left");
  });
});

describe("computeChannelControlPoints", () => {
  const rackBounds = { x: 0, y: 0, width: 200, height: 900 };
  const source = { x: 10, y: 50 };
  const target = { x: 190, y: 300 };

  it("routes the right-side gutter outside the rack's right edge", () => {
    const control = computeChannelControlPoints(
      source,
      target,
      rackBounds,
      "right",
      30,
    );
    expect(control).toEqual({ c1: { x: 230, y: 50 }, c2: { x: 230, y: 300 } });
  });

  it("routes the left-side gutter outside the rack's left edge", () => {
    const control = computeChannelControlPoints(
      source,
      target,
      rackBounds,
      "left",
      30,
    );
    expect(control).toEqual({ c1: { x: -30, y: 50 }, c2: { x: -30, y: 300 } });
  });

  it("defaults the gutter offset when none is supplied", () => {
    const control = computeChannelControlPoints(
      source,
      target,
      rackBounds,
      "right",
    );
    expect(control.c1.x).toBe(
      rackBounds.x + rackBounds.width + DEFAULT_GUTTER_OFFSET,
    );
  });
});

describe("buildCubicBezierPath", () => {
  it("formats an SVG cubic bezier path from source through both control points to target", () => {
    const path = buildCubicBezierPath(
      { x: 10, y: 50 },
      { c1: { x: 230, y: 50 }, c2: { x: 230, y: 300 } },
      { x: 190, y: 300 },
    );
    expect(path).toBe("M 10,50 C 230,50 230,300 190,300");
  });
});

describe("cubicBezierPointAt", () => {
  // Evenly-spaced, collinear control points reduce the cubic bezier to a
  // straight line: P1 = P0 + d, P2 = P0 + 2d, P3 = P0 + 3d. Lets every
  // t produce an exactly-checkable point without a curve-fitting library.
  const source = { x: 0, y: 0 };
  const control = { c1: { x: 10, y: 20 }, c2: { x: 20, y: 40 } };
  const target = { x: 30, y: 60 };

  it("returns the source point at t=0", () => {
    expect(cubicBezierPointAt(source, control, target, 0)).toEqual(source);
  });

  it("returns the target point at t=1", () => {
    expect(cubicBezierPointAt(source, control, target, 1)).toEqual(target);
  });

  it("returns the straight-line midpoint at t=0.5 for evenly-spaced collinear controls", () => {
    expect(cubicBezierPointAt(source, control, target, 0.5)).toEqual({
      x: 15,
      y: 30,
    });
  });
});

describe("cubicBezierTangentAt", () => {
  it("is constant and equal to (target - source) for evenly-spaced collinear controls", () => {
    const source = { x: 0, y: 0 };
    const control = { c1: { x: 10, y: 20 }, c2: { x: 20, y: 40 } };
    const target = { x: 30, y: 60 };

    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(cubicBezierTangentAt(source, control, target, t)).toEqual({
        x: 30,
        y: 60,
      });
    }
  });
});

describe("resolveArrowDirection", () => {
  it("points a-to-b when a is output and b is input", () => {
    expect(resolveArrowDirection("output", "input")).toBe("a-to-b");
  });

  it("points b-to-a when a is input and b is output", () => {
    expect(resolveArrowDirection("input", "output")).toBe("b-to-a");
  });

  it("renders no arrow when either side is bidirectional", () => {
    expect(resolveArrowDirection("bidirectional", "input")).toBeNull();
    expect(resolveArrowDirection("output", "bidirectional")).toBeNull();
  });

  it("renders no arrow when either side is unspecified", () => {
    expect(resolveArrowDirection(undefined, "input")).toBeNull();
    expect(resolveArrowDirection("output", undefined)).toBeNull();
    expect(resolveArrowDirection(undefined, undefined)).toBeNull();
  });

  it("renders no arrow when both sides share the same role", () => {
    expect(resolveArrowDirection("output", "output")).toBeNull();
    expect(resolveArrowDirection("input", "input")).toBeNull();
  });
});

describe("computeArrowTriangle", () => {
  const source = { x: 0, y: 0 };
  const control = { c1: { x: 10, y: 20 }, c2: { x: 20, y: 40 } };
  const target = { x: 30, y: 60 };

  it("returns null when direction is null (no arrow to draw)", () => {
    expect(computeArrowTriangle(source, control, target, null)).toBeNull();
  });

  it("returns null for a degenerate (zero-length) tangent", () => {
    const point = { x: 5, y: 5 };
    const flatControl = { c1: point, c2: point };
    expect(
      computeArrowTriangle(point, flatControl, point, "a-to-b"),
    ).toBeNull();
  });

  it("centres a triangle on the midpoint, tip pointing toward the target for a-to-b", () => {
    const triangle = computeArrowTriangle(source, control, target, "a-to-b");
    expect(triangle).not.toBeNull();
    // Hand-computed: midpoint (15,30), unit tangent (1/sqrt5, 2/sqrt5),
    // half-length 3.5 (ARROW_LENGTH/2), half-width 2.5 (ARROW_WIDTH/2).
    expect(triangle!.tip.x).toBeCloseTo(16.56525, 4);
    expect(triangle!.tip.y).toBeCloseTo(33.1305, 4);
    expect(triangle!.base1.x).toBeCloseTo(11.19868, 4);
    expect(triangle!.base1.y).toBeCloseTo(27.98754, 4);
    expect(triangle!.base2.x).toBeCloseTo(15.67082, 4);
    expect(triangle!.base2.y).toBeCloseTo(25.75147, 4);
  });

  it("flips the tip toward the source for b-to-a (opposite orientation of a-to-b)", () => {
    const aToB = computeArrowTriangle(source, control, target, "a-to-b")!;
    const bToA = computeArrowTriangle(source, control, target, "b-to-a")!;
    const midpoint = cubicBezierPointAt(source, control, target, 0.5);

    // a-to-b's tip sits past the midpoint toward the target (larger x/y);
    // b-to-a's tip sits past the midpoint toward the source (smaller x/y).
    expect(aToB.tip.x).toBeGreaterThan(midpoint.x);
    expect(bToA.tip.x).toBeLessThan(midpoint.x);
    expect(aToB.tip.y).toBeGreaterThan(midpoint.y);
    expect(bToA.tip.y).toBeLessThan(midpoint.y);
  });

  it("uses the supplied arrow size instead of the module defaults", () => {
    const small = computeArrowTriangle(source, control, target, "a-to-b", {
      length: 2,
      width: 2,
    });
    const dflt = computeArrowTriangle(source, control, target, "a-to-b");
    expect(small).not.toBeNull();
    expect(dflt).not.toBeNull();
    const midpoint = cubicBezierPointAt(source, control, target, 0.5);
    const smallDist = Math.hypot(
      small!.tip.x - midpoint.x,
      small!.tip.y - midpoint.y,
    );
    const dfltDist = Math.hypot(
      dflt!.tip.x - midpoint.x,
      dflt!.tip.y - midpoint.y,
    );
    expect(smallDist).toBeLessThan(dfltDist);
  });
});

describe("arrowPointsAttr", () => {
  it("formats a triangle as an SVG polygon points attribute", () => {
    const points = arrowPointsAttr({
      tip: { x: 1, y: 2 },
      base1: { x: 3, y: 4 },
      base2: { x: 5, y: 6 },
    });
    expect(points).toBe("1,2 3,4 5,6");
  });
});

describe("computeConnectionGeometry", () => {
  const rackBounds = { x: 0, y: 0, width: 200, height: 900 };
  const source = { x: 10, y: 50 };
  const target = { x: 190, y: 300 };

  it("routes through the right gutter at index 0 and produces no arrow with no direction", () => {
    const geometry = computeConnectionGeometry(
      source,
      target,
      rackBounds,
      0,
      null,
    );
    expect(geometry.side).toBe("right");
    expect(geometry.arrow).toBeNull();
    expect(geometry.path.startsWith("M 10,50 C 230,50 230,300")).toBe(true);
  });

  it("routes through the left gutter at index 1 and produces an arrow when direction is set", () => {
    const geometry = computeConnectionGeometry(
      source,
      target,
      rackBounds,
      1,
      "a-to-b",
    );
    expect(geometry.side).toBe("left");
    expect(geometry.arrow).not.toBeNull();
  });

  it("computes the midpoint from the same control points used in the path", () => {
    const geometry = computeConnectionGeometry(
      source,
      target,
      rackBounds,
      0,
      null,
    );
    const control = computeChannelControlPoints(
      source,
      target,
      rackBounds,
      "right",
    );
    expect(geometry.midpoint).toEqual(
      cubicBezierPointAt(source, control, target, 0.5),
    );
  });
});

describe("resolveConnectionPortDirection", () => {
  it("prefers an explicit PlacedPort.direction override over everything else", () => {
    const port = createTestPlacedPort({ direction: "output" });
    const iface = createTestInterfaceTemplate({ direction: "input" });
    expect(resolveConnectionPortDirection(port, iface)).toBe("output");
  });

  it("falls back to the InterfaceTemplate default when the port has no override", () => {
    const port = createTestPlacedPort();
    const iface = createTestInterfaceTemplate({ direction: "input" });
    expect(resolveConnectionPortDirection(port, iface)).toBe("input");
  });

  it("falls back to inferDirection() using the interface type when neither is explicit", () => {
    const port = createTestPlacedPort({ type: "1000base-t" });
    const iface = createTestInterfaceTemplate({ type: "1000base-t" });
    expect(resolveConnectionPortDirection(port, iface)).toBe("bidirectional");
  });

  it("infers input for console/management interfaces with no explicit direction", () => {
    const port = createTestPlacedPort({ type: "console" });
    const iface = createTestInterfaceTemplate({ type: "console" });
    expect(resolveConnectionPortDirection(port, iface)).toBe("input");
  });

  it("has no inferred direction for an AV type with no explicit direction", () => {
    const port = createTestPlacedPort({ type: "hdmi" });
    const iface = createTestInterfaceTemplate({ type: "hdmi" });
    expect(resolveConnectionPortDirection(port, iface)).toBeUndefined();
  });

  it("falls back to the PlacedPort's cached type when no InterfaceTemplate is available", () => {
    const port = createTestPlacedPort({ type: "console" });
    expect(resolveConnectionPortDirection(port, undefined)).toBe("input");
  });

  it("returns undefined when neither a port nor an interface is available", () => {
    expect(
      resolveConnectionPortDirection(undefined, undefined),
    ).toBeUndefined();
  });
});

describe("computeDeviceOffset", () => {
  it("matches RackDevice.svelte's transform formula for a mid-rack device", () => {
    const offset = computeDeviceOffset({
      position: toInternalUnits(10),
      deviceUHeight: 2,
      rackHeight: 42,
      uHeight: 22,
      railWidth: 17,
      rackPadding: 18,
    });
    // yPosition = (42 - 10 - 2 + 1) * 22 = 682; y = rackPadding + railWidth + yPosition
    expect(offset).toEqual({ x: 17, y: 717 });
  });

  it("matches the formula for a device at the bottom of a short rack", () => {
    const offset = computeDeviceOffset({
      position: toInternalUnits(1),
      deviceUHeight: 1,
      rackHeight: 10,
      uHeight: 22,
      railWidth: 17,
      rackPadding: 18,
    });
    // yPosition = (10 - 1 - 1 + 1) * 22 = 198; y = 18 + 17 + 198
    expect(offset).toEqual({ x: 17, y: 233 });
  });
});

describe("buildPortAnchorMap", () => {
  const rackDims = {
    rackHeight: 42,
    rackWidth: 220,
    interiorWidth: 186,
    uHeight: 22,
    rackPadding: 18,
    railWidth: 17,
  };

  it("anchors every individually-rendered port, keyed by PlacedPort.id", () => {
    const deviceType = {
      ...createTestDeviceType({ slug: "switch-1", u_height: 1 }),
      interfaces: [
        createTestInterfaceTemplate({ name: "eth0", direction: "output" }),
        createTestInterfaceTemplate({ name: "eth1", direction: "input" }),
      ],
    };
    const device = createTestDevice({
      device_type: "switch-1",
      position: 10,
      ports: [
        createTestPlacedPort({ id: "port-eth0", template_index: 0 }),
        createTestPlacedPort({ id: "port-eth1", template_index: 1 }),
      ],
    });
    const bySlug = new Map([[deviceType.slug, deviceType]]);

    const anchors = buildPortAnchorMap([device], bySlug, "front", rackDims);

    expect(anchors.size).toBe(2);
    expect(anchors.get("port-eth0")?.direction).toBe("output");
    expect(anchors.get("port-eth1")?.direction).toBe("input");
  });

  it("anchors no ports for a device in grouped/high-density mode (#3089 fallback)", () => {
    const interfaces = Array.from(
      { length: HIGH_DENSITY_THRESHOLD + 1 },
      (_, i) => createTestInterfaceTemplate({ name: `eth${i}` }),
    );
    const ports = interfaces.map((_, i) =>
      createTestPlacedPort({ id: `port-${i}`, template_index: i }),
    );
    const deviceType = {
      ...createTestDeviceType({ slug: "patch-panel", u_height: 1 }),
      interfaces,
    };
    const device = createTestDevice({ device_type: "patch-panel", ports });
    const bySlug = new Map([[deviceType.slug, deviceType]]);

    const anchors = buildPortAnchorMap([device], bySlug, "front", rackDims);

    expect(anchors.size).toBe(0);
  });

  it("skips a device whose type is missing from the library without throwing", () => {
    const device = createTestDevice({ device_type: "unknown-slug" });
    expect(() =>
      buildPortAnchorMap([device], new Map(), "front", rackDims),
    ).not.toThrow();
    expect(
      buildPortAnchorMap([device], new Map(), "front", rackDims).size,
    ).toBe(0);
  });

  it("skips a device type with no interfaces", () => {
    const deviceType = createTestDeviceType({ slug: "blank-1u", u_height: 1 });
    const device = createTestDevice({ device_type: "blank-1u" });
    const bySlug = new Map([[deviceType.slug, deviceType]]);
    expect(buildPortAnchorMap([device], bySlug, "front", rackDims).size).toBe(
      0,
    );
  });
});

describe("buildRenderedConnections", () => {
  const rackBounds = { x: 0, y: 0, width: 220, height: 900 };

  it("resolves a connection whose both ports are anchored, with a gated arrow", () => {
    const portAnchors = new Map<string, ResolvedPortAnchor>([
      ["port-a", makeResolvedAnchor("port-a", 10, 50, "output")],
      ["port-b", makeResolvedAnchor("port-b", 190, 300, "input")],
    ]);
    const connection = createTestConnection();

    const rendered = buildRenderedConnections(
      [connection],
      portAnchors,
      rackBounds,
    );

    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: exactly one fully-anchored connection renders
    expect(rendered).toHaveLength(1);
    expect(rendered[0].connection).toBe(connection);
    expect(rendered[0].geometry.arrow).not.toBeNull();
  });

  it("skips a connection when either endpoint has no anchor (grouped-mode fallback)", () => {
    const portAnchors = new Map<string, ResolvedPortAnchor>([
      ["port-a", makeResolvedAnchor("port-a", 10, 50, "output")],
      // port-b intentionally missing: high-density device, wrong face, or
      // legacy data with no PlacedPort match.
    ]);
    const connection = createTestConnection();

    const rendered = buildRenderedConnections(
      [connection],
      portAnchors,
      rackBounds,
    );

    expect(rendered).toEqual([]);
  });

  it("only advances the channel-side index for connections that actually render", () => {
    const portAnchors = new Map<string, ResolvedPortAnchor>([
      ["port-a", makeResolvedAnchor("port-a", 10, 50)],
      ["port-b", makeResolvedAnchor("port-b", 190, 300)],
      ["port-c", makeResolvedAnchor("port-c", 10, 100)],
      ["port-d", makeResolvedAnchor("port-d", 190, 400)],
    ]);
    const connections = [
      createTestConnection({
        id: "conn-1",
        a_port_id: "port-a",
        b_port_id: "port-b",
      }),
      // conn-2 references a port with no anchor and is skipped; it must not
      // consume a channel-side slot.
      createTestConnection({
        id: "conn-2",
        a_port_id: "port-a",
        b_port_id: "missing",
      }),
      createTestConnection({
        id: "conn-3",
        a_port_id: "port-c",
        b_port_id: "port-d",
      }),
    ];

    const rendered = buildRenderedConnections(
      connections,
      portAnchors,
      rackBounds,
    );

    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: the skipped connection must not render or consume a channel-side slot
    expect(rendered).toHaveLength(2);
    expect(rendered[0].geometry.side).toBe("right");
    expect(rendered[1].geometry.side).toBe("left");
  });
});
