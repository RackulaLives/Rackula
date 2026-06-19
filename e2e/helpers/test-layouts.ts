/**
 * Pre-encoded share links for E2E tests
 * Uses the same format as production share links (?l=...)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pako from "pako";
import type { MinimalLayout } from "../../src/lib/schemas/share";
import { locators } from "./locators";

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

const EMPTY_18U_RACK: MinimalLayout = {
  ...EMPTY_RACK_MINIMAL,
  n: "Medium Test Layout",
  r: {
    ...EMPTY_RACK_MINIMAL.r,
    n: "Medium Rack",
    h: 18,
  },
};

const EMPTY_24U_RACK: MinimalLayout = {
  ...EMPTY_RACK_MINIMAL,
  n: "Standard Test Layout",
  r: {
    ...EMPTY_RACK_MINIMAL.r,
    n: "Standard Rack",
    h: 24,
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

/** Empty 18U rack */
export const MEDIUM_RACK_SHARE = encodeMinimal(EMPTY_18U_RACK);

/** Empty 24U rack */
export const STANDARD_RACK_SHARE = encodeMinimal(EMPTY_24U_RACK);

/** Rack with one 1U server device pre-placed */
export const RACK_WITH_DEVICE_SHARE = encodeMinimal(RACK_WITH_DEVICE);

/**
 * Build a test layout with readable options and return an encoded share link string.
 *
 * All fields are optional — sensible defaults produce a 42U, 19" empty rack
 * named "Test Layout".
 *
 * @example
 *   // Empty 12U rack
 *   createTestLayout({ rackHeight: 12 });
 *
 *   // Rack with a pre-placed device
 *   createTestLayout({
 *     devices: [{ type: "my-server", position: 1, face: "front" }],
 *     customTypes: [{ slug: "my-server", height: 2, colour: "#AA0000", category: "s" }],
 *   });
 */
export function createTestLayout(overrides?: {
  name?: string;
  rackName?: string;
  rackHeight?: number;
  rackWidth?: 10 | 19;
  devices?: Array<{
    type: string;
    position: number;
    face: "front" | "rear" | "both";
    name?: string;
  }>;
  customTypes?: Array<{
    slug: string;
    height: number;
    colour: string;
    category: string;
    manufacturer?: string;
    model?: string;
  }>;
}): string {
  const {
    name = "Test Layout",
    rackName = "Test Rack",
    rackHeight = 42,
    rackWidth = 19,
    devices = [],
    customTypes = [],
  } = overrides ?? {};

  const layout: MinimalLayout = {
    v: APP_VERSION,
    n: name,
    r: {
      n: rackName,
      h: rackHeight,
      w: rackWidth,
      d: devices.map((d) => ({
        t: d.type,
        p: d.position,
        f: d.face,
        ...(d.name ? { n: d.name } : {}),
      })),
    },
    dt: customTypes.map((ct) => ({
      s: ct.slug,
      h: ct.height,
      c: ct.colour,
      x: ct.category,
      ...(ct.manufacturer ? { mf: ct.manufacturer } : {}),
      ...(ct.model ? { m: ct.model } : {}),
    })),
  };

  return encodeMinimal(layout);
}

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
  await page
    .locator(locators.rack.container)
    .first()
    .waitFor({ state: "visible" });
}
