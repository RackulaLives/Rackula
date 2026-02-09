/**
 * Pre-encoded share links for E2E tests
 * Uses the same format as production share links (?l=...)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pako from "pako";
import type { MinimalLayout } from "../../src/lib/schemas/share";

const { version: APP_VERSION } = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { version: MinimalLayout["v"] };

// Minimal layout in share format (abbreviated keys per MinimalLayoutSchema)
const EMPTY_RACK_MINIMAL = {
  v: APP_VERSION,
  n: "Test Layout",
  r: {
    n: "Test Rack",
    h: 42,
    w: 19,
    d: [], // no devices
  },
  dt: [], // no custom device types
} satisfies MinimalLayout;

const EMPTY_12U_RACK: MinimalLayout = {
  ...EMPTY_RACK_MINIMAL,
  n: "Small Test Layout",
  r: {
    ...EMPTY_RACK_MINIMAL.r,
    n: "Small Rack",
    h: 12,
  },
};

const RACK_WITH_DEVICE: MinimalLayout = {
  ...EMPTY_RACK_MINIMAL,
  n: "Test Layout with Device",
  r: {
    ...EMPTY_RACK_MINIMAL.r,
    d: [{ t: "test-server", p: 1, f: "front" }],
  },
  dt: [{ s: "test-server", h: 1, c: "#4A90A4", x: "s" }],
};

function toBinaryString(bytes: Uint8Array): string {
  // Keep chunks below JS argument-spread limits for String.fromCharCode(...chunk).
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return binary;
}

/**
 * Encode a minimal layout object to URL-safe base64
 */
function encodeMinimal(obj: MinimalLayout): string {
  const json = JSON.stringify(obj);
  const compressed = pako.deflate(json);
  const base64 = btoa(toBinaryString(compressed));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Empty 42U standard rack - use for most tests */
export const EMPTY_RACK_SHARE = encodeMinimal(EMPTY_RACK_MINIMAL);

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
