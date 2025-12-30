/**
 * Analytics utilities for Umami integration
 * Privacy-focused event tracking with TypeScript support
 */

// Toolbar button identifiers for tracking
export type ToolbarButton =
  | "new-rack"
  | "undo"
  | "redo"
  | "delete"
  | "fit-all"
  | "theme"
  | "hamburger";

// Panel identifiers for tracking
export type PanelName = "help" | "export" | "share";

// Typed event definitions
export interface AnalyticsEvents {
  // File operations
  "file:save": { device_count: number };
  "file:load": { device_count: number };
  "file:share": { device_count: number };

  // Export operations
  "export:image": {
    format: "png" | "jpeg" | "svg";
    view: "front" | "rear" | "both";
  };
  "export:pdf": { view: "front" | "rear" | "both" };
  "export:csv": Record<string, never>;

  // Device operations
  "device:place": { category: string };
  "device:create_custom": { category: string };

  // Feature usage
  "feature:display_mode": { mode: "label" | "image" | "image-label" };
  "feature:rack_resize": { height: number };

  // Keyboard shortcuts
  "keyboard:shortcut": { shortcut: string };

  // Session tracking
  "session:heartbeat": { session_minutes: number };

  // Tier 1: Core feature adoption events
  // Rack operations
  "rack:create": Record<string, never>;

  // UI panel interactions
  "ui:panel:open": { panel: PanelName };
  "ui:panel:close": { panel: PanelName };

  // Toolbar interactions (untracked buttons)
  "ui:toolbar:click": { button: ToolbarButton };

  // Device palette
  "palette:import": Record<string, never>;

  // Mobile-specific
  "mobile:fab:click": Record<string, never>;
}

// Session properties (privacy-compliant)
export interface SessionProperties {
  app_version: string;
  screen_category: "mobile" | "tablet" | "desktop";
  color_scheme_preference: "dark" | "light" | "no-preference";
}

// Internal state
let isInitialized = false;
let isEnabled = false;

// Heartbeat tracking state
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes - consider idle after this
let sessionStartTime: number | null = null;
let lastActivityTime: number | null = null;
let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Check if analytics is available and enabled
 */
export function isAnalyticsEnabled(): boolean {
  return isEnabled && typeof window !== "undefined" && !!window.umami;
}

/**
 * Initialize analytics - call once on app startup
 * Dynamically loads the Umami script if enabled and configured
 */
export function initAnalytics(): void {
  if (isInitialized) return;
  isInitialized = true;

  // Check if enabled via build-time constant
  isEnabled = typeof __UMAMI_ENABLED__ !== "undefined" && __UMAMI_ENABLED__;
  if (!isEnabled) return;

  // Skip in development
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return;

  // Validate configuration
  const scriptUrl =
    typeof __UMAMI_SCRIPT_URL__ !== "undefined" ? __UMAMI_SCRIPT_URL__ : "";
  const websiteId =
    typeof __UMAMI_WEBSITE_ID__ !== "undefined" ? __UMAMI_WEBSITE_ID__ : "";
  if (!scriptUrl || !websiteId) return;

  // Dynamically load Umami script
  const script = document.createElement("script");
  script.defer = true;
  script.src = scriptUrl;
  script.dataset.websiteId = websiteId;
  script.onload = () => {
    identifySession();
    startHeartbeatTracking();
  };
  document.head.appendChild(script);
}

/**
 * Identify the session with privacy-compliant properties
 */
function identifySession(): void {
  if (!isAnalyticsEnabled()) return;

  const properties: SessionProperties = {
    app_version:
      typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
    screen_category: getScreenCategory(),
    color_scheme_preference: getColorSchemePreference(),
  };

  window.umami?.identify(properties);
}

/**
 * Start heartbeat tracking for session duration estimation
 * Sends periodic heartbeats while user is actively engaged
 */
function startHeartbeatTracking(): void {
  if (typeof window === "undefined") return;

  sessionStartTime = Date.now();
  lastActivityTime = Date.now();

  // Track user activity with passive listeners for performance
  const updateActivity = () => {
    lastActivityTime = Date.now();
  };

  document.addEventListener("pointerdown", updateActivity, { passive: true });
  document.addEventListener("keydown", updateActivity, { passive: true });
  document.addEventListener("wheel", updateActivity, { passive: true });

  // Send heartbeat every 5 minutes if user was active in last 2 minutes
  heartbeatIntervalId = setInterval(() => {
    if (!isAnalyticsEnabled() || !sessionStartTime || !lastActivityTime) return;

    const now = Date.now();
    const timeSinceActivity = now - lastActivityTime;

    // Only send heartbeat if user was active recently
    if (timeSinceActivity < ACTIVITY_TIMEOUT_MS) {
      const sessionMinutes = Math.round((now - sessionStartTime) / 60000);
      trackEvent("session:heartbeat", { session_minutes: sessionMinutes });
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Cleanup on page unload
  window.addEventListener("beforeunload", stopHeartbeatTracking);
}

/**
 * Stop heartbeat tracking and cleanup
 */
function stopHeartbeatTracking(): void {
  if (heartbeatIntervalId !== null) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

/**
 * Track a typed analytics event
 */
export function trackEvent<E extends keyof AnalyticsEvents>(
  eventName: E,
  properties?: AnalyticsEvents[E],
): void {
  if (!isAnalyticsEnabled()) return;

  try {
    if (properties && Object.keys(properties).length > 0) {
      window.umami?.track(eventName, properties);
    } else {
      window.umami?.track(eventName);
    }
  } catch (e) {
    // Analytics errors should not break the app, but log for debugging
    console.warn("[Rackula] Analytics tracking failed:", e);
  }
}

/**
 * Convenience functions for common events
 */
export const analytics = {
  // File operations
  trackSave: (deviceCount: number) =>
    trackEvent("file:save", { device_count: deviceCount }),

  trackLoad: (deviceCount: number) =>
    trackEvent("file:load", { device_count: deviceCount }),

  trackShare: (deviceCount: number) =>
    trackEvent("file:share", { device_count: deviceCount }),

  // Export operations
  trackExportImage: (
    format: "png" | "jpeg" | "svg",
    view: "front" | "rear" | "both",
  ) => trackEvent("export:image", { format, view }),

  trackExportPDF: (view: "front" | "rear" | "both") =>
    trackEvent("export:pdf", { view }),

  trackExportCSV: () => trackEvent("export:csv", {}),

  // Device operations
  trackDevicePlace: (category: string) =>
    trackEvent("device:place", { category }),

  trackCustomDeviceCreate: (category: string) =>
    trackEvent("device:create_custom", { category }),

  // Feature usage
  trackDisplayModeToggle: (mode: "label" | "image" | "image-label") =>
    trackEvent("feature:display_mode", { mode }),

  trackRackResize: (height: number) =>
    trackEvent("feature:rack_resize", { height }),

  // Keyboard shortcuts
  trackKeyboardShortcut: (shortcut: string) =>
    trackEvent("keyboard:shortcut", { shortcut }),

  // Tier 1: Core feature adoption
  // Rack operations
  trackRackCreate: () => trackEvent("rack:create", {}),

  // Panel interactions
  trackPanelOpen: (panel: PanelName) => trackEvent("ui:panel:open", { panel }),
  trackPanelClose: (panel: PanelName) =>
    trackEvent("ui:panel:close", { panel }),

  // Toolbar interactions
  trackToolbarClick: (button: ToolbarButton) =>
    trackEvent("ui:toolbar:click", { button }),

  // Device palette
  trackPaletteImport: () => trackEvent("palette:import", {}),

  // Mobile
  trackMobileFabClick: () => trackEvent("mobile:fab:click", {}),
};

// Helper functions

function getScreenCategory(): "mobile" | "tablet" | "desktop" {
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function getColorSchemePreference(): "dark" | "light" | "no-preference" {
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  if (window.matchMedia("(prefers-color-scheme: light)").matches)
    return "light";
  return "no-preference";
}
