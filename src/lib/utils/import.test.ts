/**
 * Tests for device library import ingress.
 *
 * The validation gate routes through DeviceTypeSchema, so these tests assert the
 * accept/reject behaviour at the ingress boundary rather than re-checking
 * individual fields the schema already covers.
 */

import { describe, it, expect } from "vitest";
import { validateImportDevice, parseDeviceLibraryImport } from "./import";

// The import boundary consumes the raw external JSON shape ({ name, height,
// category, colour?, notes? }), which differs from the internal DeviceType /
// CreateDeviceTypeInput factories in src/tests/factories.ts (those use u_height,
// not height). This local builder supplies a valid baseline so each case
// overrides only the field under test.
function rawImportDevice(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { name: "Test Server", height: 2, category: "server", ...overrides };
}

describe("validateImportDevice", () => {
  it("accepts a well-formed device", () => {
    expect(validateImportDevice(rawImportDevice())).toBe(true);
  });

  it("accepts a device with an explicit valid hex colour and notes", () => {
    expect(
      validateImportDevice(
        rawImportDevice({
          name: "Test Switch",
          height: 1,
          category: "network",
          colour: "#336699",
          notes: "rack 4",
        }),
      ),
    ).toBe(true);
  });

  it("rejects a non-object payload", () => {
    expect(validateImportDevice(null)).toBe(false);
    expect(validateImportDevice("device")).toBe(false);
  });

  it("rejects a missing or blank name", () => {
    expect(validateImportDevice(rawImportDevice({ name: undefined }))).toBe(
      false,
    );
    expect(validateImportDevice(rawImportDevice({ name: "   " }))).toBe(false);
  });

  it("rejects an out-of-enum category", () => {
    expect(
      validateImportDevice(rawImportDevice({ category: "spaceship" })),
    ).toBe(false);
  });

  // The hand-rolled check passed any string colour straight through; the schema
  // requires a 6-character hex code, so a malformed colour must now be refused.
  it("rejects a malformed colour the old hand-rolled check accepted", () => {
    expect(validateImportDevice(rawImportDevice({ colour: "not-a-hex" }))).toBe(
      false,
    );
  });

  // The hand-rolled check accepted any height up to 100U and any fraction; the
  // schema caps at 50U and requires multiples of 0.5U.
  it.each([0, 0.25, 1.7, 60, 200])(
    "rejects out-of-range or non-half-U height %p",
    (height) => {
      expect(validateImportDevice(rawImportDevice({ height }))).toBe(false);
    },
  );

  it.each([0.5, 1, 1.5, 50])("accepts boundary height %p", (height) => {
    expect(validateImportDevice(rawImportDevice({ height }))).toBe(true);
  });
});

describe("parseDeviceLibraryImport", () => {
  it("imports valid devices and skips schema-invalid ones", () => {
    const json = JSON.stringify({
      devices: [
        rawImportDevice({ name: "Good Server", height: 2, category: "server" }),
        rawImportDevice({ name: "Bad Colour", height: 1, colour: "nope" }),
        rawImportDevice({ name: "Too Tall", height: 60, category: "network" }),
      ],
    });

    const result = parseDeviceLibraryImport(json);

    expect(result.error).toBeUndefined();
    expect(result.skipped).toBe(2);
    expect(result.devices.map((d) => d.model)).toContain("Good Server");
    expect(result.devices.map((d) => d.model)).not.toContain("Bad Colour");
  });

  // The per-row gate validates a placeholder slug, so a name that slugifies to an
  // empty slug (punctuation-only) must still be skipped: the final stored object
  // is re-validated with its real generated slug.
  it("skips a device whose name slugifies to an invalid slug", () => {
    const json = JSON.stringify({
      devices: [
        rawImportDevice({ name: "Good Server" }),
        rawImportDevice({ name: "!!!", height: 1 }),
      ],
    });

    const result = parseDeviceLibraryImport(json);

    expect(result.devices.map((d) => d.model)).toContain("Good Server");
    expect(result.devices.map((d) => d.model)).not.toContain("!!!");
    expect(result.skipped).toBe(1);
    expect(result.devices.every((d) => d.slug.length > 0)).toBe(true);
  });

  it("reports an error when every device is rejected", () => {
    const json = JSON.stringify({
      devices: [rawImportDevice({ name: "Bad", height: 999 })],
    });

    const result = parseDeviceLibraryImport(json);

    expect(result.devices.map((d) => d.model)).not.toContain("Bad");
    expect(result.error).toBeTruthy();
  });

  it("returns a format error for non-JSON input", () => {
    const result = parseDeviceLibraryImport("{not json");
    expect(result.error).toBeTruthy();
  });

  it("returns a format error when the devices array is missing", () => {
    const result = parseDeviceLibraryImport(JSON.stringify({ foo: "bar" }));
    expect(result.error).toBeTruthy();
  });
});
