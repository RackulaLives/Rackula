/**
 * Port Utilities
 * Functions for port instantiation when devices are placed
 */

import type {
  DeviceType,
  InterfaceType,
  PlacedPort,
  PortDirection,
  SignalType,
} from "$lib/types";
import { generateId } from "$lib/utils/device";

export type PortCategory = "network" | "power" | "console" | "av";

/**
 * Pro audio / AV interface types (spike #1927 taxonomy). Listed explicitly
 * rather than matched by substring: the set spans audio, video, control, and
 * data connectors (xlr, hdmi, rs-232, dante, ...) with no shared naming
 * pattern to key off, unlike the power/console heuristics below.
 */
const AV_INTERFACE_TYPES = new Set<string>([
  // Audio
  "xlr-3",
  "trs-1-4",
  "ts-1-4",
  "rca",
  "adat-optical",
  "midi-din",
  "bnc",
  "db25-audio",
  "phoenix",
  "speakon",
  "xlr-5",
  // Video
  "displayport",
  "hdmi",
  "sdi-bnc",
  "vga",
  // Control
  "dmx-xlr",
  "rs-232",
  "rs-422",
  // Other
  "aes3",
  "avb",
  "dante",
]);

/**
 * Interface types whose direction defaults to "input" (spike #1927 taxonomy):
 * console ports and the AV control-serial types. Checked before
 * AV_INTERFACE_TYPES in inferDirection() since rs-232/rs-422 are members of
 * both sets and the specific input default takes priority. Management-only
 * interfaces also default to "input", but via the separate mgmt_only check
 * in inferDirection(), not through this set: the "management" interface
 * type itself falls through to "bidirectional" unless mgmt_only is set.
 */
const INPUT_DEFAULT_TYPES = new Set<string>(["console", "rs-232", "rs-422"]);

/**
 * Categorize an interface type string into network, power, console, or av.
 * Uses string matching for network/power/console so it handles future types
 * (e.g. power-inlet-*) even before they are added to the InterfaceType enum.
 */
export function getPortCategory(type: string): PortCategory {
  if (AV_INTERFACE_TYPES.has(type)) {
    return "av";
  }
  if (
    type === "console" ||
    type.includes("usb") ||
    type.includes("serial") ||
    type.includes("de-9")
  ) {
    return "console";
  }
  if (type.includes("power") || type.includes("iec") || type.includes("nema")) {
    return "power";
  }
  return "network";
}

/**
 * Infer the default signal direction for an interface type (spike #1927).
 * Used when an InterfaceTemplate (or PlacedPort) does not set `direction`
 * explicitly:
 * - Management-only interfaces default to "input".
 * - Console and AV control-serial types (rs-232, rs-422) default to "input".
 * - All other AV types (XLR, HDMI, SDI, ...) have no default: direction must
 *   be set explicitly on the device type.
 * - Everything else (network, power, USB, etc.) defaults to "bidirectional".
 *
 * @param type - Interface type string
 * @param mgmtOnly - Whether the interface is management-only
 * @returns The inferred direction, or undefined if none should be assumed
 */
export function inferDirection(
  type: string,
  mgmtOnly?: boolean,
): PortDirection | undefined {
  if (mgmtOnly) {
    return "input";
  }
  if (INPUT_DEFAULT_TYPES.has(type)) {
    return "input";
  }
  if (AV_INTERFACE_TYPES.has(type)) {
    return undefined;
  }
  return "bidirectional";
}

/**
 * Human-readable signal names, one per SignalType value. Shared source for
 * every surface that labels signals, so a label change lands everywhere.
 */
export const SIGNAL_LABELS: Record<SignalType, string> = {
  "analog-audio-mic": "Mic level",
  "analog-audio-line": "Line level",
  "analog-audio-speaker": "Speaker level",
  "digital-audio-aes3": "AES3",
  "digital-audio-dante": "Dante",
  "digital-audio-avb": "AVB",
  "digital-video-hdmi": "HDMI",
  "digital-video-sdi": "SDI",
  "clock-word": "Word clock",
  "control-midi": "MIDI",
};

/**
 * Label for a signal type, falling back to the raw slug for forward
 * compatibility if a new value is not yet in SIGNAL_LABELS.
 */
export function getSignalLabel(signal: SignalType): string {
  return SIGNAL_LABELS[signal] ?? signal;
}

/**
 * Infer the signal a connector carries from its type (and, for XLR, its
 * direction: mic level into an input, line level out of anything else).
 * Returns undefined when the connector implies no distinct signal to label:
 * network types (ethernet is the connector, not a separate signal), connectors
 * whose signal has no SignalTypeSchema value yet (DMX, ADAT), and genuinely
 * ambiguous ones. Device authors set signal_type explicitly for those.
 */
export function inferSignalType(
  type: InterfaceType,
  direction?: PortDirection,
): SignalType | undefined {
  switch (type) {
    case "xlr-3":
      return direction === "input" ? "analog-audio-mic" : "analog-audio-line";
    case "trs-1-4":
    case "ts-1-4":
    case "rca":
    case "db25-audio":
    case "phoenix":
      return "analog-audio-line";
    case "speakon":
      return "analog-audio-speaker";
    case "aes3":
      return "digital-audio-aes3";
    case "dante":
      return "digital-audio-dante";
    case "avb":
      return "digital-audio-avb";
    case "hdmi":
      return "digital-video-hdmi";
    case "sdi-bnc":
      return "digital-video-sdi";
    case "bnc":
      return "clock-word";
    case "midi-din":
      return "control-midi";
    default:
      return undefined;
  }
}

/**
 * Instantiate ports from a DeviceType's interface templates
 * Creates PlacedPort instances with stable UUIDs for each interface
 *
 * @param deviceType - The device type containing interface templates
 * @returns Array of PlacedPort instances with unique IDs, indexes, and cached types
 */
export function instantiatePorts(deviceType: DeviceType): PlacedPort[] {
  if (!deviceType.interfaces || deviceType.interfaces.length === 0) {
    return [];
  }

  return deviceType.interfaces.map((iface, index) => ({
    id: generateId(),
    template_name: iface.name,
    template_index: index,
    type: iface.type,
  }));
}
