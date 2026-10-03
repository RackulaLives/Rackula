/**
 * Tests for the port geometry helper (#3089): a pure, DOM-free function that
 * locates a PlacedPort's SVG anchor coordinate. Covers the two invariants
 * the issue calls out explicitly: rear-face filtering and template_index
 * disambiguation of duplicate interface names, plus the grouped/high-density
 * "no per-port target" behaviour that #1932 needs documented.
 *
 * #3451 adds the device zones (icon, label, port zone) and the right-aligned
 * port grid. Assertions here are relationships (ordering, bounds, equality
 * between anchors) built from the exported constants, so tuning a starting
 * value in the browser does not need a test edit.
 */
import { describe, it, expect } from "vitest";
import {
  computeDeviceZones,
  computeVisiblePortLayout,
  getPortAnchor,
  getPortAnchors,
  getPortChipPosition,
  HIGH_DENSITY_THRESHOLD,
  LABEL_MIN_WIDTH,
  PORT_CHIP_HEIGHT,
  PORT_MARKER_SIZE,
  PORT_PITCH,
  PORT_ZONE_PADDING_RIGHT,
} from "$lib/utils/port-geometry";
import type { PortGeometryOptions } from "$lib/utils/port-geometry";
import {
  DEVICE_LABEL_ICON_SPACE_LEFT,
  DEVICE_LABEL_ICON_SPACE_RIGHT,
} from "$lib/utils/text-sizing";
import { createTestInterfaceTemplate, createTestPlacedPort } from "./factories";

/** 19-inch rack interior width (BASE_RACK_WIDTH - 2 * RAIL_WIDTH). */
const WIDE = 186;
/** 10-inch rack interior width, where the label wins and ports collapse. */
const NARROW = 82;
/** 1U device height (U_HEIGHT_PX). */
const ONE_U = 22;

/** Geometry options for a device with `count` front ports, each with a PlacedPort. */
function optionsWithPorts(
  count: number,
  overrides: Partial<PortGeometryOptions> = {},
): PortGeometryOptions {
  const interfaces = Array.from({ length: count }, (_, i) =>
    createTestInterfaceTemplate({ name: `eth${i}` }),
  );
  const ports = interfaces.map((_, i) =>
    createTestPlacedPort({ id: `port-${i}`, template_index: i }),
  );
  return {
    interfaces,
    ports,
    rackView: "front",
    deviceWidth: WIDE,
    deviceHeight: ONE_U,
    ...overrides,
  };
}

describe("computeDeviceZones", () => {
  it.each([
    { count: 1, rows: 1, cols: 1 },
    { count: 8, rows: 1, cols: 8 },
    { count: 9, rows: 2, cols: 5 },
    { count: 16, rows: 2, cols: 8 },
    { count: 17, rows: 3, cols: 6 },
    { count: 24, rows: 3, cols: 8 },
  ])(
    "lays $count ports out as $rows row(s) of $cols column(s)",
    ({ count, rows, cols }) => {
      const zones = computeDeviceZones({
        deviceWidth: WIDE,
        deviceHeight: ONE_U,
        visiblePortCount: count,
      });

      expect(zones.mode).toBe("strip");
      expect(zones.rows).toBe(rows);
      expect(zones.cols).toBe(cols);
    },
  );

  it("sizes the strip's port zone to its grid and fits the tallest strip in 1U", () => {
    const zones = computeDeviceZones({
      deviceWidth: WIDE,
      deviceHeight: ONE_U,
      visiblePortCount: HIGH_DENSITY_THRESHOLD,
    });

    expect(zones.portZone.width).toBe(
      (zones.cols - 1) * PORT_PITCH + PORT_MARKER_SIZE,
    );
    expect(zones.portZone.height).toBe(
      (zones.rows - 1) * PORT_PITCH + PORT_MARKER_SIZE,
    );
    expect(zones.portZone.height).toBeLessThanOrEqual(ONE_U);
  });

  it.each([1, 8, 9, 24, HIGH_DENSITY_THRESHOLD + 1, 48])(
    "right-aligns and vertically centres the port zone for %i ports",
    (count) => {
      const zones = computeDeviceZones({
        deviceWidth: WIDE,
        deviceHeight: ONE_U,
        visiblePortCount: count,
      });
      const { x, y, width, height } = zones.portZone;

      expect(x + width).toBe(WIDE - PORT_ZONE_PADDING_RIGHT);
      expect(y + height / 2).toBe(ONE_U / 2);
    },
  );

  it.each([
    { deviceWidth: WIDE, count: 1 },
    { deviceWidth: WIDE, count: 24 },
    { deviceWidth: WIDE, count: 48 },
    { deviceWidth: NARROW, count: 4 },
    { deviceWidth: NARROW, count: 48 },
    { deviceWidth: 226, count: 24 }, // 23-inch rack interior
  ])(
    "keeps the label zone between the icon zone and the port zone ($count ports, width $deviceWidth)",
    ({ deviceWidth, count }) => {
      const zones = computeDeviceZones({
        deviceWidth,
        deviceHeight: ONE_U,
        visiblePortCount: count,
      });

      expect(zones.iconX).toBeLessThan(zones.labelX);
      expect(zones.labelX).toBe(DEVICE_LABEL_ICON_SPACE_LEFT);
      expect(zones.labelWidth).toBeGreaterThan(0);
      expect(zones.labelX + zones.labelWidth).toBeLessThan(zones.portZone.x);
    },
  );

  it("never reports a negative label width, even on a device too narrow for any label", () => {
    const zones = computeDeviceZones({
      deviceWidth: 40,
      deviceHeight: ONE_U,
      visiblePortCount: 4,
    });

    expect(zones.mode).toBe("chip");
    expect(zones.labelWidth).toBe(0);
  });

  it("keeps today's label width and reserves no port zone when there are no visible ports", () => {
    const zones = computeDeviceZones({
      deviceWidth: WIDE,
      deviceHeight: ONE_U,
      visiblePortCount: 0,
    });

    expect(zones.mode).toBe("none");
    expect(zones.labelWidth).toBe(
      WIDE - DEVICE_LABEL_ICON_SPACE_LEFT - DEVICE_LABEL_ICON_SPACE_RIGHT,
    );
    expect(zones.portZone.width).toBe(0);
    expect(zones.rows).toBe(0);
    expect(zones.cols).toBe(0);
  });

  it("collapses to the chip above the high-density threshold, however wide the device", () => {
    const zones = computeDeviceZones({
      deviceWidth: 1000,
      deviceHeight: ONE_U,
      visiblePortCount: HIGH_DENSITY_THRESHOLD + 1,
    });

    expect(zones.mode).toBe("chip");
    expect(zones.portZone.height).toBe(PORT_CHIP_HEIGHT);
  });

  it("collapses to the chip on a 10-inch rack, where a strip would squeeze the label", () => {
    const narrow = computeDeviceZones({
      deviceWidth: NARROW,
      deviceHeight: ONE_U,
      visiblePortCount: 4,
    });
    const wide = computeDeviceZones({
      deviceWidth: WIDE,
      deviceHeight: ONE_U,
      visiblePortCount: 4,
    });

    expect(narrow.mode).toBe("chip");
    expect(wide.mode).toBe("strip");
  });

  it("collapses exactly when the strip would leave the label less than LABEL_MIN_WIDTH", () => {
    const count = 8;
    const roomy = computeDeviceZones({
      deviceWidth: WIDE,
      deviceHeight: ONE_U,
      visiblePortCount: count,
    });
    // Narrowest device on which the 8-port strip still leaves LABEL_MIN_WIDTH.
    const thresholdWidth = WIDE - (roomy.labelWidth - LABEL_MIN_WIDTH);

    const atThreshold = computeDeviceZones({
      deviceWidth: thresholdWidth,
      deviceHeight: ONE_U,
      visiblePortCount: count,
    });
    const justBelow = computeDeviceZones({
      deviceWidth: thresholdWidth - 1,
      deviceHeight: ONE_U,
      visiblePortCount: count,
    });

    expect(atThreshold.mode).toBe("strip");
    expect(atThreshold.labelWidth).toBe(LABEL_MIN_WIDTH);
    expect(justBelow.mode).toBe("chip");
  });

  it("is a width-only collapse: device height does not change the mode", () => {
    const modes = [ONE_U, 2 * ONE_U, 4 * ONE_U].map(
      (deviceHeight) =>
        computeDeviceZones({
          deviceWidth: NARROW,
          deviceHeight,
          visiblePortCount: 4,
        }).mode,
    );

    expect(new Set(modes)).toEqual(new Set(["chip"]));
  });
});

describe("computeVisiblePortLayout", () => {
  it("pairs each position with its template and PlacedPort, in declaration order", () => {
    const options = optionsWithPorts(2);

    const layout = computeVisiblePortLayout(options);

    expect(layout.map((entry) => entry.iface)).toEqual(options.interfaces);
    expect(layout.map((entry) => entry.port)).toEqual(options.ports);
  });

  it.each([1, 8, 9, 16, 17, 24])(
    "places %i ports at distinct cell centres inside the port zone",
    (count) => {
      const options = optionsWithPorts(count);
      const { portZone } = computeDeviceZones({
        deviceWidth: options.deviceWidth,
        deviceHeight: options.deviceHeight,
        visiblePortCount: count,
      });
      const half = PORT_MARKER_SIZE / 2;

      const layout = computeVisiblePortLayout(options);

      expect(layout.length).toBe(count);
      for (const { x, y } of layout) {
        expect(x - half).toBeGreaterThanOrEqual(portZone.x);
        expect(x + half).toBeLessThanOrEqual(portZone.x + portZone.width);
        expect(y - half).toBeGreaterThanOrEqual(portZone.y);
        expect(y + half).toBeLessThanOrEqual(portZone.y + portZone.height);
      }
      expect(new Set(layout.map(({ x, y }) => `${x},${y}`)).size).toBe(count);
    },
  );

  it.each([1, 8, 9, 16, 17, 24])(
    "right-aligns the %i-port grid and centres it vertically in the device",
    (count) => {
      const options = optionsWithPorts(count);
      const half = PORT_MARKER_SIZE / 2;

      const layout = computeVisiblePortLayout(options);
      const xs = layout.map((entry) => entry.x);
      const ys = layout.map((entry) => entry.y);

      expect(Math.max(...xs) + half).toBe(
        options.deviceWidth - PORT_ZONE_PADDING_RIGHT,
      );
      expect((Math.min(...ys) + Math.max(...ys)) / 2).toBe(
        options.deviceHeight / 2,
      );
    },
  );

  it("fills the grid row-major: left to right, then top to bottom", () => {
    const count = 17;
    const { rows, cols } = computeDeviceZones({
      deviceWidth: WIDE,
      deviceHeight: ONE_U,
      visiblePortCount: count,
    });

    const layout = computeVisiblePortLayout(optionsWithPorts(count));

    layout.forEach((entry, i) => {
      if (i === 0) return;
      const previous = layout[i - 1];
      if (i % cols === 0) {
        // First cell of a new row: back to the left edge, one pitch lower.
        expect(entry.x).toBe(layout[0].x);
        expect(entry.y).toBe(previous.y + PORT_PITCH);
      } else {
        expect(entry.x).toBe(previous.x + PORT_PITCH);
        expect(entry.y).toBe(previous.y);
      }
    });
    expect(new Set(layout.map((entry) => entry.y)).size).toBe(rows);
  });

  it("keeps every port marker clear of the label zone", () => {
    const count = HIGH_DENSITY_THRESHOLD;
    const options = optionsWithPorts(count);
    const zones = computeDeviceZones({
      deviceWidth: options.deviceWidth,
      deviceHeight: options.deviceHeight,
      visiblePortCount: count,
    });

    const leftmost = Math.min(
      ...computeVisiblePortLayout(options).map((entry) => entry.x),
    );

    expect(leftmost - PORT_MARKER_SIZE / 2).toBeGreaterThan(
      zones.labelX + zones.labelWidth,
    );
  });

  it("applies the supplied SVG-space offset (Rack SVG space) on top of the device-local position", () => {
    const interfaces = [createTestInterfaceTemplate()];
    const ports = [createTestPlacedPort({ id: "port-a", template_index: 0 })];

    const local = computeVisiblePortLayout({
      interfaces,
      ports,
      rackView: "front",
      deviceWidth: 100,
      deviceHeight: 30,
    });
    const offsetted = computeVisiblePortLayout({
      interfaces,
      ports,
      rackView: "front",
      deviceWidth: 100,
      deviceHeight: 30,
      offset: { x: 17, y: 60 },
    });

    expect(offsetted[0].x).toBe(local[0].x + 17);
    expect(offsetted[0].y).toBe(local[0].y + 60);
  });

  it("keeps an interface with no matching PlacedPort in the layout (legacy data), with port undefined", () => {
    // Simulates a layout saved before PlacedPort/instantiatePorts existed:
    // PlacedDevice.ports defaults to [] (see PlacedDeviceSchema), so the
    // template renders positioned but with no port identity to click/connect.
    const interfaces = [
      createTestInterfaceTemplate({ name: "eth0" }),
      createTestInterfaceTemplate({ name: "eth1" }),
    ];

    const layout = computeVisiblePortLayout({
      interfaces,
      ports: [],
      rackView: "front",
      deviceWidth: 100,
      deviceHeight: 30,
    });

    expect(layout.length).toBe(interfaces.length);
    expect(layout.every((entry) => entry.port === undefined)).toBe(true);
  });

  it("returns no layout once the visible port count exceeds the high-density threshold", () => {
    const interfaces = Array.from(
      { length: HIGH_DENSITY_THRESHOLD + 1 },
      (_, i) => createTestInterfaceTemplate({ name: `eth${i}` }),
    );
    const ports = interfaces.map((_, i) =>
      createTestPlacedPort({ id: `port-${i}`, template_index: i }),
    );

    const layout = computeVisiblePortLayout({
      interfaces,
      ports,
      rackView: "front",
      deviceWidth: 400,
      deviceHeight: 30,
    });

    // Grouped/badge mode has no individual port position: #1932 (click-to-
    // connect) cannot target a single port on a high-density device until
    // multi-row layout (#356) replaces this threshold.
    expect(layout).toEqual([]);
  });
});

describe("rear-face filtering", () => {
  const interfaces = [
    createTestInterfaceTemplate({ name: "front-port" }), // position defaults to "front"
    createTestInterfaceTemplate({ name: "rear-port", position: "rear" }),
  ];
  const ports = [
    createTestPlacedPort({ id: "front-id", template_index: 0 }),
    createTestPlacedPort({ id: "rear-id", template_index: 1 }),
  ];

  it("shows only front-positioned ports when viewing the front", () => {
    const anchors = getPortAnchors({
      interfaces,
      ports,
      rackView: "front",
      deviceWidth: 100,
      deviceHeight: 30,
    });

    expect(anchors.map((a) => a.portId)).toEqual(["front-id"]);
  });

  it("shows only rear-positioned ports when viewing the rear", () => {
    const anchors = getPortAnchors({
      interfaces,
      ports,
      rackView: "rear",
      deviceWidth: 100,
      deviceHeight: 30,
    });

    expect(anchors.map((a) => a.portId)).toEqual(["rear-id"]);
  });
});

describe("template_index disambiguation", () => {
  it("matches duplicate-named interfaces to the correct PlacedPort via template_index, not name", () => {
    // Two SFP+ cages sharing a display name; only template_index tells them apart.
    const interfaces = [
      createTestInterfaceTemplate({ name: "SFP+", type: "10gbase-x-sfpp" }),
      createTestInterfaceTemplate({ name: "SFP+", type: "10gbase-x-sfpp" }),
    ];
    const ports = [
      createTestPlacedPort({ id: "second-cage", template_index: 1 }),
      createTestPlacedPort({ id: "first-cage", template_index: 0 }),
    ];

    const layout = computeVisiblePortLayout({
      interfaces,
      ports,
      rackView: "front",
      deviceWidth: 100,
      deviceHeight: 30,
    });

    expect(layout[0].port?.id).toBe("first-cage");
    expect(layout[1].port?.id).toBe("second-cage");
  });
});

describe("getPortAnchor", () => {
  const interfaces = [
    createTestInterfaceTemplate({ name: "eth0" }),
    createTestInterfaceTemplate({ name: "eth1" }),
  ];
  const ports = [
    createTestPlacedPort({ id: "port-a", template_index: 0 }),
    createTestPlacedPort({ id: "port-b", template_index: 1 }),
  ];
  const options = {
    interfaces,
    ports,
    rackView: "front" as const,
    deviceWidth: 100,
    deviceHeight: 30,
  };

  it("looks up a single PlacedPort's anchor by id, at the rendered marker centre", () => {
    const rendered = computeVisiblePortLayout(options)[1];

    expect(getPortAnchor("port-b", options)).toEqual({
      portId: "port-b",
      x: rendered.x,
      y: rendered.y,
    });
  });

  it("returns undefined for a port id that has no rendered anchor (wrong face, unknown id, or grouped mode)", () => {
    expect(getPortAnchor("does-not-exist", options)).toBeUndefined();
  });
});

describe("collapsed chip (narrow device, 24 or fewer ports)", () => {
  it("anchors every PlacedPort at the chip's marker centre", () => {
    const options = optionsWithPorts(12, { deviceWidth: NARROW });
    const chip = getPortChipPosition(options);

    const anchors = getPortAnchors(options);

    expect(chip?.anchored).toBe(true);
    expect(anchors.map((a) => a.portId)).toEqual(
      options.ports.map((port) => port.id),
    );
    for (const anchor of anchors) {
      expect({ x: anchor.x, y: anchor.y }).toEqual({
        x: chip?.markerCx,
        y: chip?.markerCy,
      });
    }
  });

  it("keeps the marker inside the chip box, left of the chip's centre, clear of the count", () => {
    const chip = getPortChipPosition(
      optionsWithPorts(12, { deviceWidth: NARROW }),
    );
    if (!chip) throw new Error("expected a chip on a narrow device");
    const half = PORT_MARKER_SIZE / 2;

    expect(chip.markerCx - half).toBeGreaterThanOrEqual(chip.x);
    expect(chip.markerCx + half).toBeLessThan(chip.cx);
    expect(chip.markerCy - half).toBeGreaterThanOrEqual(chip.y);
    expect(chip.markerCy + half).toBeLessThanOrEqual(chip.y + chip.height);
    expect(chip.markerCy).toBe(chip.cy);
  });

  it("puts the chip centre in the middle of the port zone", () => {
    const options = optionsWithPorts(4, { deviceWidth: NARROW });
    const { portZone } = computeDeviceZones({
      deviceWidth: NARROW,
      deviceHeight: ONE_U,
      visiblePortCount: 4,
    });

    const chip = getPortChipPosition(options);

    expect(chip).toMatchObject({
      x: portZone.x,
      y: portZone.y,
      width: portZone.width,
      height: portZone.height,
      cx: portZone.x + portZone.width / 2,
      cy: ONE_U / 2,
      count: 4,
    });
  });

  it("moves the chip and its anchors together under an SVG-space offset", () => {
    const local = optionsWithPorts(4, { deviceWidth: NARROW });
    const offset = { x: 17, y: 60 };
    const moved = { ...local, offset };

    const localChip = getPortChipPosition(local);
    const movedChip = getPortChipPosition(moved);

    expect(movedChip?.cx).toBe((localChip?.cx ?? NaN) + offset.x);
    expect(movedChip?.cy).toBe((localChip?.cy ?? NaN) + offset.y);
    expect(movedChip?.markerCx).toBe((localChip?.markerCx ?? NaN) + offset.x);
    expect(movedChip?.markerCy).toBe((localChip?.markerCy ?? NaN) + offset.y);
    expect(getPortAnchor("port-0", moved)).toEqual({
      portId: "port-0",
      x: movedChip?.markerCx,
      y: movedChip?.markerCy,
    });
  });
});

describe("getPortChipPosition", () => {
  it("has no chip for a strip or for a device with no visible ports", () => {
    expect(getPortChipPosition(optionsWithPorts(8))).toBeUndefined();
    expect(getPortChipPosition(optionsWithPorts(0))).toBeUndefined();
  });

  it("reports an unanchored chip above the high-density threshold (#356)", () => {
    const count = HIGH_DENSITY_THRESHOLD + 1;
    const options = optionsWithPorts(count);

    const chip = getPortChipPosition(options);

    expect(chip?.anchored).toBe(false);
    expect(chip?.count).toBe(count);
    expect(getPortAnchors(options)).toEqual([]);
  });

  it("counts only the ports on the face in view", () => {
    const options = optionsWithPorts(4, { deviceWidth: NARROW });
    options.interfaces[0] = { ...options.interfaces[0], position: "rear" };

    expect(getPortChipPosition(options)?.count).toBe(3);
  });
});
