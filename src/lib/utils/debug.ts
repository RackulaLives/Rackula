/**
 * Debug logging utilities using the debug npm package
 *
 * Enable logging in browser console:
 *   localStorage.debug = 'rackula:*'           // All logs
 *   localStorage.debug = 'rackula:layout:*'    // Layout module only
 *   localStorage.debug = 'rackula:*,-rackula:canvas:*'  // All except canvas
 *
 * Namespace convention: rackula:module:concern
 * Examples:
 *   - rackula:layout:state
 *   - rackula:layout:device
 *   - rackula:canvas:transform
 *   - rackula:dnd:render
 */
import Debug from "debug";

// Module-level loggers
export const layoutDebug = {
  state: Debug("rackula:layout:state"),
  device: Debug("rackula:layout:device"),
};

export const canvasDebug = {
  transform: Debug("rackula:canvas:transform"),
  panzoom: Debug("rackula:canvas:panzoom"),
};

export const dndDebug = {
  render: Debug("rackula:dnd:render"),
};

export const cableDebug = {
  validation: Debug("rackula:cable:validation"),
};

export const appDebug = {
  mobile: Debug("rackula:app:mobile"),
};

// Legacy compatibility - maps to new namespaces
// This maintains backward compatibility with existing code
export const debug = {
  log: Debug("rackula:general"),
  info: Debug("rackula:info"),
  warn: Debug("rackula:warn"),
  error: Debug("rackula:error"),
  group: (label: string) => Debug("rackula:general")(`--- ${label} ---`),
  groupEnd: () => {},
  isEnabled: () => Debug.enabled("rackula:*"),
  devicePlace: (data: {
    slug: string;
    position: number;
    passedFace?: string;
    effectiveFace: string;
    deviceName: string;
    isFullDepth: boolean;
    result: string;
  }) => layoutDebug.device("place %O", data),
  deviceMove: (data: {
    index: number;
    deviceName: string;
    face: string;
    fromPosition: number;
    toPosition: number;
    result: string;
  }) => layoutDebug.device("move %O", data),
};

// Auto-enable in development (browser only)
if (typeof window !== "undefined") {
  const isDev = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env
    ?.DEV;
  const isTest =
    (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE ===
    "test";

  // Auto-enable in dev mode (unless already configured)
  if (isDev && !isTest && !localStorage.getItem("debug")) {
    localStorage.setItem("debug", "rackula:*");
  }
}
