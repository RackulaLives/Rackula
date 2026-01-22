/**
 * Pre-encoded share links for E2E tests
 * Uses the same format as production share links (?l=...)
 */
import pako from "pako";

const APP_VERSION = "0.7.0";

// Minimal layout in share format (abbreviated keys per MinimalLayoutSchema)
const EMPTY_42U_RACK = {
  v: APP_VERSION,
  n: "Test Layout",
  r: {
    n: "Test Rack",
    h: 42,
    w: 19,
    d: [], // no devices
  },
  dt: [], // no custom device types
};

const EMPTY_12U_RACK = {
  v: APP_VERSION,
  n: "Small Test Layout",
  r: {
    n: "Small Rack",
    h: 12,
    w: 19,
    d: [],
  },
  dt: [],
};

const RACK_WITH_DEVICE = {
  v: APP_VERSION,
  n: "Test Layout with Device",
  r: {
    n: "Test Rack",
    h: 42,
    w: 19,
    d: [{ t: "test-server", p: 1, f: "front" as const }],
  },
  dt: [{ s: "test-server", h: 1, c: "#4A90A4", x: "s" }],
};

/**
 * Encode a minimal layout object to URL-safe base64
 */
function encodeMinimal(obj: object): string {
  const json = JSON.stringify(obj);
  const compressed = pako.deflate(json);
  const base64 = btoa(String.fromCharCode(...compressed));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Empty 42U standard rack - use for most tests */
export const EMPTY_RACK_SHARE = encodeMinimal(EMPTY_42U_RACK);

/** Empty 12U rack - for compact layout tests */
export const SMALL_RACK_SHARE = encodeMinimal(EMPTY_12U_RACK);

/** Rack with one 1U server device pre-placed */
export const RACK_WITH_DEVICE_SHARE = encodeMinimal(RACK_WITH_DEVICE);

/**
 * Navigate to app with pre-loaded rack
 * @param page - Playwright page
 * @param shareParam - Encoded share param (default: EMPTY_RACK_SHARE)
 */
export async function gotoWithRack(
  page: import("@playwright/test").Page,
  shareParam: string = EMPTY_RACK_SHARE,
): Promise<void> {
  await page.goto(`/?l=${shareParam}`);
  await page.locator(".rack-container").first().waitFor({ state: "visible" });
}
