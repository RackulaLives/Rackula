/**
 * Brand Pack Identifier Tests
 *
 * Covers the export-name derivation used by scripts/import-netbox-devices.ts
 * when it creates a new brand pack file (issue #3286). Vendor names with
 * separators must still produce valid TypeScript identifiers, and vendors
 * that already worked must keep the identifier they had.
 */

import { describe, it, expect } from "vitest";
import { brandPackArrayName } from "$lib/utils/brand-pack-identifier";

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

describe("brandPackArrayName", () => {
  it("keeps the existing identifier for single-word vendors", () => {
    expect(brandPackArrayName("Ubiquiti")).toBe("ubiquitiDevices");
    expect(brandPackArrayName("MikroTik")).toBe("mikrotikDevices");
    expect(brandPackArrayName("HPE")).toBe("hpeDevices");
  });

  it("matches the existing export name for TP-Link", () => {
    expect(brandPackArrayName("TP-Link")).toBe("tplinkDevices");
  });

  it("produces valid identifiers for vendors with - or .", () => {
    for (const vendor of ["D-Link", "FS.COM", "A.B-C", "x--y..z"]) {
      expect(brandPackArrayName(vendor)).toMatch(IDENTIFIER);
    }
    expect(brandPackArrayName("D-Link")).toBe("dlinkDevices");
    expect(brandPackArrayName("FS.COM")).toBe("fscomDevices");
  });

  it("keeps underscores, matching the previous importer output", () => {
    expect(brandPackArrayName("Foo_Bar")).toBe("foo_barDevices");
    expect(brandPackArrayName("_Foo")).toMatch(IDENTIFIER);
  });

  it("strips spaces and other punctuation", () => {
    expect(brandPackArrayName("Palo Alto")).toBe("paloaltoDevices");
    expect(brandPackArrayName("Rohde & Schwarz")).toBe("rohdeschwarzDevices");
  });

  it("prefixes vendors that start with a digit", () => {
    expect(brandPackArrayName("3Com")).toBe("_3comDevices");
    expect(brandPackArrayName("3Com")).toMatch(IDENTIFIER);
  });

  it("rejects vendors with no alphanumeric characters", () => {
    expect(() => brandPackArrayName("-.-")).toThrow();
  });
});
