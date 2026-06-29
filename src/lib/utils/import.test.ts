/**
 * Tests for device library import ingress.
 *
 * The validation gate routes through DeviceTypeSchema, so these tests assert the
 * accept/reject behaviour at the ingress boundary rather than re-checking
 * individual fields the schema already covers.
 */

import { describe, it, expect } from "vitest";
import { validateImportDevice, parseDeviceLibraryImport } from "./import";

describe("validateImportDevice", () => {
  it("accepts a well-formed device", () => {
    expect(
      validateImportDevice({
        name: "Test Server",
        height: 2,
        category: "server",
      }),
    ).toBe(true);
  });

  it("accepts a device with an explicit valid hex colour and notes", () => {
    expect(
      validateImportDevice({
        name: "Test Switch",
        height: 1,
        category: "network",
        colour: "#336699",
        notes: "rack 4",
      }),
    ).toBe(true);
  });

  it("rejects a non-object payload", () => {
    expect(validateImportDevice(null)).toBe(false);
    expect(validateImportDevice("device")).toBe(false);
  });

  it("rejects a missing or blank name", () => {
    expect(validateImportDevice({ height: 1, category: "server" })).toBe(false);
    expect(
      validateImportDevice({ name: "   ", height: 1, category: "server" }),
    ).toBe(false);
  });

  it("rejects an out-of-enum category", () => {
    expect(
      validateImportDevice({
        name: "Mystery",
        height: 1,
        category: "spaceship",
      }),
    ).toBe(false);
  });

  // The hand-rolled check passed any string colour straight through; the schema
  // requires a 6-character hex code, so a malformed colour must now be refused.
  it("rejects a malformed colour the old hand-rolled check accepted", () => {
    expect(
      validateImportDevice({
        name: "Bad Colour",
        height: 1,
        category: "server",
        colour: "not-a-hex",
      }),
    ).toBe(false);
  });

  // The hand-rolled check accepted any height up to 100U and any fraction; the
  // schema caps at 50U and requires multiples of 0.5U.
  it.each([0, 0.25, 1.7, 60, 200])(
    "rejects out-of-range or non-half-U height %p",
    (height) => {
      expect(
        validateImportDevice({ name: "Tall", height, category: "server" }),
      ).toBe(false);
    },
  );

  it.each([0.5, 1, 1.5, 50])("accepts boundary height %p", (height) => {
    expect(
      validateImportDevice({ name: "Sized", height, category: "server" }),
    ).toBe(true);
  });
});

describe("parseDeviceLibraryImport", () => {
  it("imports valid devices and skips schema-invalid ones", () => {
    const json = JSON.stringify({
      devices: [
        { name: "Good Server", height: 2, category: "server" },
        { name: "Bad Colour", height: 1, category: "server", colour: "nope" },
        { name: "Too Tall", height: 60, category: "network" },
      ],
    });

    const result = parseDeviceLibraryImport(json);

    expect(result.error).toBeUndefined();
    expect(result.skipped).toBe(2);
    expect(result.devices.map((d) => d.model)).toContain("Good Server");
    expect(result.devices.map((d) => d.model)).not.toContain("Bad Colour");
  });

  it("reports an error when every device is rejected", () => {
    const json = JSON.stringify({
      devices: [{ name: "Bad", height: 999, category: "server" }],
    });

    const result = parseDeviceLibraryImport(json);

    expect(result.devices).toEqual([]);
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
