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
 *   - rackula:persistence:api
 *   - rackula:persistence:health
 */
import Debug from "debug";

// Module-level loggers
export const layoutDebug = {
  state: Debug("rackula:layout:state"),
  device: Debug("rackula:layout:device"),
  group: Debug("rackula:layout:group"),
};

export const canvasDebug = {
  transform: Debug("rackula:canvas:transform"),
  panzoom: Debug("rackula:canvas:panzoom"),
  focus: Debug("rackula:canvas:focus"),
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

export const selectionDebug = {
  state: Debug("rackula:selection:state"),
};

export const persistenceDebug = {
  api: Debug("rackula:persistence:api"),
  health: Debug("rackula:persistence:health"),
};

export const sessionDebug = {
  storage: Debug("rackula:session:storage"),
};

// Create shared instances for reuse
const generalLog = Debug("rackula:general");
const infoLog = Debug("rackula:info");
const warnLog = Debug("rackula:warn");
const errorLog = Debug("rackula:error");

// Legacy compatibility - maps to new namespaces
// This maintains backward compatibility with existing code
export const debug = {
  log: generalLog,
  info: infoLog,
  warn: warnLog,
  error: errorLog,
  group: (label: string) => generalLog(`--- ${label} ---`),
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
  // Use Vite's built-in env types
  const isDev = import.meta.env.DEV;
  const isTest = import.meta.env.MODE === "test";

  // Auto-enable in dev mode (unless already configured)
  if (isDev && !isTest && !localStorage.getItem("debug")) {
    localStorage.setItem("debug", "rackula:*");
    // Enable immediately so logs work without page reload
    Debug.enable("rackula:*");
  }
}
