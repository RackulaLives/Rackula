/**
 * Tests for the port geometry helper (#3089): a pure, DOM-free function that
 * locates a PlacedPort's SVG anchor coordinate. Covers the two invariants
 * the issue calls out explicitly: rear-face filtering and template_index
 * disambiguation of duplicate interface names, plus the grouped/high-density
 * "no per-port target" behaviour that #1932 needs documented.
 */
import { describe, it, expect } from "vitest";
import {
  computeVisiblePortLayout,
  getPortAnchor,
  getPortAnchors,
  HIGH_DENSITY_THRESHOLD,
} from "$lib/utils/port-geometry";
import { createTestInterfaceTemplate, createTestPlacedPort } from "./factories";

describe("computeVisiblePortLayout", () => {
  it("centres ports horizontally along the bottom edge, keyed to their PlacedPort", () => {
    const interfaces = [
      createTestInterfaceTemplate({ name: "eth0" }),
      createTestInterfaceTemplate({ name: "eth1" }),
    ];
    const ports = [
      createTestPlacedPort({ id: "port-a", template_index: 0 }),
      createTestPlacedPort({ id: "port-b", template_index: 1 }),
    ];

    const layout = computeVisiblePortLayout({
      interfaces,
      ports,
      rackView: "front",
      deviceWidth: 100,
      deviceHeight: 30,
    });

    expect(layout).toEqual([
      { iface: interfaces[0], port: ports[0], x: 46, y: 22 },
      { iface: interfaces[1], port: ports[1], x: 54, y: 22 },
    ]);
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

  it("looks up a single PlacedPort's anchor by id", () => {
    expect(getPortAnchor("port-b", options)).toEqual({
      portId: "port-b",
      x: 54,
      y: 22,
    });
  });

  it("returns undefined for a port id that has no rendered anchor (wrong face, unknown id, or grouped mode)", () => {
    expect(getPortAnchor("does-not-exist", options)).toBeUndefined();
  });
});
