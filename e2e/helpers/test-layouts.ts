/**
 * Pre-encoded share links for E2E tests
 * Uses the same format as production share links (?l=...)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as pako from "pako";
import type {
  MinimalLayout,
  MinimalLayoutV2,
} from "../../src/lib/schemas/share";
import { locators } from "./locators";

export const { version: APP_VERSION } = JSON.parse(
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
 * Encode a minimal layout object to URL-safe base64.
 *
 * Accepts either a v1 (single-rack `r`) or v2 (multi-rack `rs`) minimal layout.
 * decodeLayout() detects the version by field presence, so the same pako +
 * base64url pipeline round-trips both.
 */
function encodeMinimal(obj: MinimalLayout | MinimalLayoutV2): string {
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

// V2 multi-rack fixtures (share format v2: `rs` for racks, `rg` for groups).
// Both use the same pako + base64url pipeline as the v1 fixtures above;
// decodeLayout() detects v2 by the presence of `rs`.

/**
 * Two standalone 12U racks with distinct names, each carrying one named 1U
 * server. Useful for multi-rack behaviour (duplicate, delete-one-keep-other,
 * export composites) where a share-link setup is faster than building two racks
 * through the UI.
 */
const MULTI_RACK_MINIMAL: MinimalLayoutV2 = {
  v: APP_VERSION,
  n: "Multi Rack Layout",
  rs: [
    {
      i: "0",
      n: "Rack Uno",
      h: 12,
      w: 19,
      d: [{ t: "srv", p: 1, f: "front", n: "Widget Uno" }],
    },
    {
      i: "1",
      n: "Rack Dos",
      h: 12,
      w: 19,
      d: [{ t: "srv", p: 1, f: "front", n: "Widget Dos" }],
    },
  ],
  dt: [{ s: "srv", h: 1, c: "#4A90A4", x: "s" }],
};

/**
 * A two-bay bayed group (both 12U), each bay holding a distinctly named 1U
 * server. Bay 1 (short id "0") holds "Alpha", bay 2 ("1") holds "Beta", so a
 * test can assert each device renders in its intended bay.
 */
const BAYED_RACK_MINIMAL: MinimalLayoutV2 = {
  v: APP_VERSION,
  n: "Bayed Rack Layout",
  rs: [
    {
      i: "0",
      n: "Bay Alpha",
      h: 12,
      w: 19,
      d: [{ t: "srv", p: 1, f: "front", n: "Alpha" }],
    },
    {
      i: "1",
      n: "Bay Beta",
      h: 12,
      w: 19,
      d: [{ t: "srv", p: 1, f: "front", n: "Beta" }],
    },
  ],
  rg: [{ rs: ["0", "1"], n: "Twin Bay", p: "bayed" }],
  dt: [{ s: "srv", h: 1, c: "#4A90A4", x: "s" }],
};

/** Two standalone racks (12U each), each with one named 1U server. */
export const MULTI_RACK_SHARE = encodeMinimal(MULTI_RACK_MINIMAL);

/** A two-bay bayed group with one named device per bay. */
export const BAYED_RACK_SHARE = encodeMinimal(BAYED_RACK_MINIMAL);

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

/** A representative phone viewport for mobile-only test helpers. */
const MOBILE_VIEWPORT = { width: 412, height: 915 };

/**
 * Navigate to the app at a phone viewport with a rack preloaded, dismissing
 * the mobile warning before navigation so it never intercepts interactions.
 * Mirrors the same setup in accessibility.spec.ts and axe.spec.ts.
 */
export async function gotoMobileWithRack(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.addInitScript(() => {
    sessionStorage.setItem("rackula-mobile-warning-dismissed", "true");
  });
  await page.goto(`/?l=${EMPTY_RACK_SHARE}`);
  await page
    .locator(locators.rack.container)
    .first()
    .waitFor({ state: "visible" });
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
