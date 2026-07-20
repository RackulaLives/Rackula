/**
 * Port Geometry Utilities
 *
 * Pure functions for locating a PlacedPort's SVG anchor point in the
 * individually-rendered (low-density) port layout. Shared by PortIndicators,
 * which owns the click/hover targets, and, later, ConnectionLayer (#1931),
 * which needs the same coordinates to draw a cable between two PlacedPort
 * endpoints identified by Connection.a_port_id / b_port_id.
 *
 * No DOM access: callers supply device dimensions and an optional SVG-space
 * offset (the device's own <g transform="translate(x, y)"> within the Rack
 * SVG) so this module is unit-testable without mounting a component.
 *
 * Multi-row layout (#356) belongs here: swap the single-row math in
 * computeVisiblePortLayout() below for a row-aware algorithm without
 * changing the public API (lookup by PlacedPort.id, same PortAnchor shape).
 */

import type { InterfaceTemplate, PlacedPort, RackView } from "$lib/types";

/** Horizontal spacing between port centres, in device-local SVG units. */
export const PORT_SPACING = 8;

/** Vertical distance of a port's centre from the bottom of the device. */
export const PORT_Y_OFFSET = 8;

/**
 * Ports stop rendering individually beyond this count; PortIndicators falls
 * back to grouped badges. Grouped badges have no per-port anchor: click-to-
 * connect (#1932) cannot target an individual port on a high-density device
 * until multi-row layout (#356) replaces this threshold.
 */
export const HIGH_DENSITY_THRESHOLD = 24;

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
 * Computes the centred, single-row layout PortIndicators renders for
 * individual (low-density) ports. Returns an empty array once the visible
 * port count exceeds HIGH_DENSITY_THRESHOLD: grouped-badge mode has no
 * per-port position, by design (see module docs and #1932).
 */
export function computeVisiblePortLayout(
  options: PortGeometryOptions,
): PortLayoutEntry[] {
  const { interfaces, ports, rackView, deviceWidth, deviceHeight, offset } =
    options;
  const visible = visiblePorts(interfaces, ports, rackView);

  if (visible.length === 0 || visible.length > HIGH_DENSITY_THRESHOLD) {
    return [];
  }

  const offsetX = offset?.x ?? 0;
  const offsetY = offset?.y ?? 0;
  const totalWidth = (visible.length - 1) * PORT_SPACING;
  const startX = (deviceWidth - totalWidth) / 2;
  const y = deviceHeight - PORT_Y_OFFSET;

  return visible.map(({ iface, port }, i) => ({
    iface,
    port,
    x: offsetX + startX + i * PORT_SPACING,
    y: offsetY + y,
  }));
}

/**
 * Anchor coordinates for every individually-rendered port that has a
 * PlacedPort.id, in Rack SVG space when `offset` is supplied. This is the
 * lookup ConnectionLayer (#1931) uses to locate a Connection's a_port_id /
 * b_port_id endpoints; entries with no matching PlacedPort (legacy layouts,
 * or grouped/high-density devices) are simply absent.
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
