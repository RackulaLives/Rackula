/**
 * Port Geometry Utilities
 *
 * Pure functions for where a device's icon, label and ports sit, and for
 * locating a PlacedPort's SVG anchor point. Shared by PortIndicators, which
 * owns the click/hover targets, RackDevice, which fits the label into the
 * zone left of the ports, and ConnectionLayer (#1931), which needs the same
 * coordinates to draw a cable between two PlacedPort endpoints identified by
 * Connection.a_port_id / b_port_id.
 *
 * No DOM access: callers supply device dimensions and an optional SVG-space
 * offset (the device's own <g transform="translate(x, y)"> within the Rack
 * SVG) so this module is unit-testable without mounting a component.
 *
 * Layout (#3450): a device with visible ports is three horizontal zones, left
 * to right: category icon, label, port zone. The port zone is right-aligned
 * and holds either a strip (a grid of up to PORT_MAX_ROWS rows, one marker
 * per port) or a single count chip. computeDeviceZones() decides which.
 *
 * Multi-row layout beyond HIGH_DENSITY_THRESHOLD (#356) belongs here: extend
 * the row rule in stripGrid() and the grid math in computeVisiblePortLayout()
 * without changing the public API (lookup by PlacedPort.id, same PortAnchor
 * shape).
 */

import type { InterfaceTemplate, PlacedPort, RackView } from "$lib/types";
import {
  DEVICE_LABEL_ICON_SPACE_LEFT,
  DEVICE_LABEL_ICON_SPACE_RIGHT,
} from "$lib/utils/text-sizing";

/** Width and height of one port marker's cell in the strip. */
export const PORT_MARKER_SIZE = 5;

/** Distance between adjacent port centres in the strip, on both axes. */
export const PORT_PITCH = 6;

/** Most ports one strip row holds; a fuller strip adds a row instead. */
export const PORT_MAX_COLUMNS = 8;

/** Most rows a strip has. 3 rows at PORT_PITCH are 17 tall, inside a 22 tall 1U device. */
export const PORT_MAX_ROWS = 3;

/**
 * Fixed count chip box width: one marker, a gap, and a 3-digit count in 6 to
 * 7px mono text (about 4 wide per digit), with 2 of padding either side.
 */
export const PORT_CHIP_WIDTH = 24;

/** Count chip box height. */
export const PORT_CHIP_HEIGHT = 10;

/** Narrowest label zone a strip may leave; below this the strip collapses to the chip. */
export const LABEL_MIN_WIDTH = 48;

/** Space between the port zone's right edge and the device's right edge. */
export const PORT_ZONE_PADDING_RIGHT = 6;

/** Space between the label zone and the port zone. */
export const PORT_ZONE_GAP = 6;

/** Left edge of the category icon, matching RackDevice's CategoryIconSVG. */
export const DEVICE_ICON_X = 8;

/**
 * Vertical distance of a grouped badge's centre from the bottom of the
 * device. Only PortIndicators' grouped badges use it; it goes away when the
 * count chip replaces them (#3453).
 */
export const PORT_Y_OFFSET = 8;

/**
 * Ports stop rendering individually beyond this count; PortIndicators falls
 * back to grouped badges. Grouped badges have no per-port anchor: click-to-
 * connect (#1932) cannot target an individual port on a high-density device
 * until multi-row layout (#356) replaces this threshold.
 */
export const HIGH_DENSITY_THRESHOLD = PORT_MAX_COLUMNS * PORT_MAX_ROWS;

/**
 * What a device's port zone holds:
 * - `none`: no visible ports, no port zone, label laid out as before.
 * - `strip`: one marker per port on a right-aligned grid.
 * - `chip`: a single count chip, because there are more than
 *   HIGH_DENSITY_THRESHOLD ports or because a strip would squeeze the label
 *   below LABEL_MIN_WIDTH (e.g. 10-inch racks).
 */
export type PortZoneMode = "none" | "strip" | "chip";

/** A box in SVG units. */
export interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DeviceZoneOptions {
  /** Rendered device width, matching RackDevice's deviceWidth. */
  deviceWidth: number;
  /** Rendered device height, matching RackDevice's deviceHeight. */
  deviceHeight: number;
  /** Ports on the rack face in view (after the front/rear filter). */
  visiblePortCount: number;
}

/** Horizontal zones of a device body, in device-local SVG units. */
export interface DeviceZones {
  mode: PortZoneMode;
  /** Left edge of the category icon. */
  iconX: number;
  /**
   * Left edge of the label zone. In `none` mode the label stays centred in
   * the device and only labelWidth applies.
   */
  labelX: number;
  /** Width the label may use. Never negative. */
  labelWidth: number;
  /**
   * Right-aligned, vertically centred box holding the strip or the chip.
   * Zero-sized in `none` mode.
   */
  portZone: ZoneRect;
  /** Strip grid rows; 0 unless mode is `strip`. */
  rows: number;
  /** Strip grid columns; 0 unless mode is `strip`. */
  cols: number;
}

/** The count chip's box and centre, with the SVG-space offset applied. */
export interface PortChipPosition extends ZoneRect {
  /** Chip centre x. */
  cx: number;
  /** Chip centre y. */
  cy: number;
  /** Visible ports the chip stands for. */
  count: number;
  /**
   * True when the chip is a narrow-width collapse of HIGH_DENSITY_THRESHOLD
   * or fewer ports: every port is anchored at (cx, cy) and
   * computeVisiblePortLayout returns one entry per port there. False above
   * the threshold, where no port has an anchor (#356).
   */
  anchored: boolean;
}

/** A single visible port position, paired with the template it renders from. */
export interface PortLayoutEntry {
  /** The interface template this position was computed for. */
  iface: InterfaceTemplate;
  /**
   * The matching PlacedPort instance, when one exists. Undefined for a
   * layout placed before PlacedPort/instantiatePorts() existed, or for a
   * template added to the device type's interfaces after this device was
   * placed - both leave the port template-identified only, same as
   * PortIndicators' original rendering.
   */
  port: PlacedPort | undefined;
  x: number;
  y: number;
}

/** A PlacedPort's SVG anchor coordinate. */
export interface PortAnchor {
  portId: string;
  x: number;
  y: number;
}

/** SVG-space translation to add to device-local coordinates. */
export interface PortGeometryOffset {
  x: number;
  y: number;
}

export interface PortGeometryOptions {
  /** Interface templates from the owning DeviceType, in declaration order. */
  interfaces: InterfaceTemplate[];
  /** Placed port instances for this device (device-actions instantiatePorts()). */
  ports: PlacedPort[];
  /** Rack face currently in view; filters out ports mounted on the other face. */
  rackView: RackView;
  /** Rendered device width, matching RackDevice's deviceWidth. */
  deviceWidth: number;
  /** Rendered device height, matching RackDevice's deviceHeight. */
  deviceHeight: number;
  /**
   * SVG-space translation of the device's own <g> within the Rack SVG, e.g.
   * (RAIL_WIDTH + slotXOffset, RACK_PADDING + RAIL_WIDTH + yPosition) as
   * computed by RackDevice.svelte. Omit for device-local coordinates (what
   * PortIndicators itself renders in, since it is already nested inside that
   * transform).
   */
  offset?: PortGeometryOffset;
}

/**
 * Pair each PlacedPort with the InterfaceTemplate it was instantiated from.
 * Matches by template_index (the position in DeviceType.interfaces at
 * instantiation time), not template_name: duplicate interface names are
 * legal (e.g. two ports both named "SFP+") and only template_index
 * disambiguates them.
 */
function portByTemplateIndex(ports: PlacedPort[]): Map<number, PlacedPort> {
  const byIndex = new Map<number, PlacedPort>();
  for (const port of ports) {
    byIndex.set(port.template_index, port);
  }
  return byIndex;
}

/**
 * Interface templates visible on the current rack face, each paired with its
 * PlacedPort when one exists. Position defaults to "front" (matching
 * DEFAULT_RACK_VIEW), mirroring PortIndicators' visibleInterfaces filter.
 */
function visiblePorts(
  interfaces: InterfaceTemplate[],
  ports: PlacedPort[],
  rackView: RackView,
): Array<{ iface: InterfaceTemplate; port: PlacedPort | undefined }> {
  const byIndex = portByTemplateIndex(ports);
  return interfaces
    .map((iface, index) => ({ iface, port: byIndex.get(index) }))
    .filter(({ iface }) => (iface.position ?? "front") === rackView);
}

/**
 * Strip grid for a port count: 1 row up to PORT_MAX_COLUMNS ports, one more
 * row per further PORT_MAX_COLUMNS, with the ports spread evenly over the rows.
 */
function stripGrid(count: number): { rows: number; cols: number } {
  const rows = Math.min(PORT_MAX_ROWS, Math.ceil(count / PORT_MAX_COLUMNS));
  return { rows, cols: Math.ceil(count / rows) };
}

/** A box of the given size, right-aligned in the device and vertically centred. */
function portZoneRect(
  deviceWidth: number,
  deviceHeight: number,
  width: number,
  height: number,
): ZoneRect {
  return {
    x: deviceWidth - PORT_ZONE_PADDING_RIGHT - width,
    y: (deviceHeight - height) / 2,
    width,
    height,
  };
}

/** Label width left between the icon zone and a port zone. */
function labelWidthBefore(portZone: ZoneRect): number {
  return portZone.x - PORT_ZONE_GAP - DEVICE_LABEL_ICON_SPACE_LEFT;
}

/**
 * Where a device's icon, label and ports sit. The collapse to the chip is
 * width-only: device height never changes the mode.
 */
export function computeDeviceZones(options: DeviceZoneOptions): DeviceZones {
  const { deviceWidth, deviceHeight, visiblePortCount } = options;
  const iconX = DEVICE_ICON_X;
  const labelX = DEVICE_LABEL_ICON_SPACE_LEFT;

  if (visiblePortCount <= 0) {
    return {
      mode: "none",
      iconX,
      labelX,
      labelWidth: Math.max(
        0,
        deviceWidth -
          DEVICE_LABEL_ICON_SPACE_LEFT -
          DEVICE_LABEL_ICON_SPACE_RIGHT,
      ),
      portZone: portZoneRect(deviceWidth, deviceHeight, 0, 0),
      rows: 0,
      cols: 0,
    };
  }

  if (visiblePortCount <= HIGH_DENSITY_THRESHOLD) {
    const { rows, cols } = stripGrid(visiblePortCount);
    const strip = portZoneRect(
      deviceWidth,
      deviceHeight,
      (cols - 1) * PORT_PITCH + PORT_MARKER_SIZE,
      (rows - 1) * PORT_PITCH + PORT_MARKER_SIZE,
    );
    const labelWidth = labelWidthBefore(strip);
    if (labelWidth >= LABEL_MIN_WIDTH) {
      return {
        mode: "strip",
        iconX,
        labelX,
        labelWidth,
        portZone: strip,
        rows,
        cols,
      };
    }
  }

  const chip = portZoneRect(
    deviceWidth,
    deviceHeight,
    PORT_CHIP_WIDTH,
    PORT_CHIP_HEIGHT,
  );
  return {
    mode: "chip",
    iconX,
    labelX,
    labelWidth: Math.max(0, labelWidthBefore(chip)),
    portZone: chip,
    rows: 0,
    cols: 0,
  };
}

/**
 * The count chip for a device, or undefined when its ports render as a strip
 * or it has no visible ports. PortIndicators draws the chip from this and
 * collapsed ports anchor to its centre, so the two cannot drift apart.
 * `anchored` tells a narrow-width collapse (every port anchored at the
 * centre) from a high-density chip (no per-port anchors).
 */
export function getPortChipPosition(
  options: PortGeometryOptions,
): PortChipPosition | undefined {
  const { interfaces, ports, rackView, deviceWidth, deviceHeight, offset } =
    options;
  const count = visiblePorts(interfaces, ports, rackView).length;
  const zones = computeDeviceZones({
    deviceWidth,
    deviceHeight,
    visiblePortCount: count,
  });
  if (zones.mode !== "chip") return undefined;

  const { width, height } = zones.portZone;
  const x = zones.portZone.x + (offset?.x ?? 0);
  const y = zones.portZone.y + (offset?.y ?? 0);
  return {
    x,
    y,
    width,
    height,
    cx: x + width / 2,
    cy: y + height / 2,
    count,
    anchored: count <= HIGH_DENSITY_THRESHOLD,
  };
}

/**
 * Computes the position of every individually-anchored port on the face in
 * view, in declaration order:
 * - strip: each port at its grid cell centre, row-major (left to right, then
 *   top to bottom), the grid right-aligned and vertically centred.
 * - chip from a narrow-width collapse: one entry per port, all at the chip
 *   centre, so every port keeps an anchor and its connections keep drawing.
 * - chip above HIGH_DENSITY_THRESHOLD: an empty array. That mode has no
 *   per-port position, by design (see module docs, #1932 and #356).
 */
export function computeVisiblePortLayout(
  options: PortGeometryOptions,
): PortLayoutEntry[] {
  const { interfaces, ports, rackView, deviceWidth, deviceHeight, offset } =
    options;
  const visible = visiblePorts(interfaces, ports, rackView);
  const zones = computeDeviceZones({
    deviceWidth,
    deviceHeight,
    visiblePortCount: visible.length,
  });

  if (zones.mode === "none" || visible.length > HIGH_DENSITY_THRESHOLD) {
    return [];
  }

  const { portZone, cols } = zones;
  const originX = portZone.x + (offset?.x ?? 0);
  const originY = portZone.y + (offset?.y ?? 0);

  if (zones.mode === "chip") {
    const x = originX + portZone.width / 2;
    const y = originY + portZone.height / 2;
    return visible.map(({ iface, port }) => ({ iface, port, x, y }));
  }

  const half = PORT_MARKER_SIZE / 2;
  return visible.map(({ iface, port }, i) => ({
    iface,
    port,
    x: originX + half + (i % cols) * PORT_PITCH,
    y: originY + half + Math.floor(i / cols) * PORT_PITCH,
  }));
}

/**
 * Anchor coordinates for every individually-anchored port that has a
 * PlacedPort.id, in Rack SVG space when `offset` is supplied. This is the
 * lookup ConnectionLayer (#1931) uses to locate a Connection's a_port_id /
 * b_port_id endpoints; entries with no matching PlacedPort (legacy layouts,
 * or grouped/high-density devices) are simply absent. Ports collapsed into
 * the chip on a narrow device all share the chip-centre anchor.
 */
export function getPortAnchors(options: PortGeometryOptions): PortAnchor[] {
  const anchors: PortAnchor[] = [];
  for (const entry of computeVisiblePortLayout(options)) {
    if (entry.port) {
      anchors.push({ portId: entry.port.id, x: entry.x, y: entry.y });
    }
  }
  return anchors;
}

/**
 * Anchor coordinates for a single PlacedPort, or undefined when it is not
 * individually rendered: it belongs to the other rack face, the device is in
 * grouped/high-density mode, or it has no matching PlacedPort.
 */
export function getPortAnchor(
  portId: string,
  options: PortGeometryOptions,
): PortAnchor | undefined {
  return getPortAnchors(options).find((anchor) => anchor.portId === portId);
}
