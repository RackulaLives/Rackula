import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseYaml,
  parseLayoutYaml,
  serializeLayoutToYaml,
  serializeToYaml,
} from "$lib/utils/yaml";
import {
  unreadableImportMessage,
  INVALID_LAYOUT_FORMAT_MESSAGE,
} from "$lib/utils/import-errors";
import { importDebug } from "$lib/utils/debug";
import {
  createTestLayout,
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";

describe("parseYaml schema restriction (#2041)", () => {
  it("rejects dangerous non-JSON YAML function tags", async () => {
    await expect(
      parseYaml("danger: !!js/function 'function(){}'"),
    ).rejects.toThrow();
  });

  it("rejects non-JSON YAML type tags the server's JSON_SCHEMA forbids", async () => {
    // !!binary is in js-yaml's DEFAULT_SCHEMA but not JSON_SCHEMA; restricting
    // the client to JSON_SCHEMA (matching the server) must reject it.
    await expect(parseYaml("data: !!binary 'aGVsbG8='")).rejects.toThrow();
  });

  it("still parses a plain layout round-trip", async () => {
    const yaml = await serializeLayoutToYaml(createTestLayout(), "");
    const layout = await parseLayoutYaml(yaml);
    expect(layout.name).toBeTruthy();
  });
});

/** Resolves to the rejection message of a promise expected to reject. */
async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected promise to reject");
}

describe("plain-language import errors (#2989)", () => {
  // Guarantees the debug spy below is restored even if an assertion in the
  // test body throws first, so a failure here cannot leak a mock into
  // later, unrelated tests (mirrors the console.warn -> debug logger move
  // in yaml.ts/share.ts, #2989 fix round 3).
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a file that is not valid YAML at all with a plain message, no code frame, no raw bytes", async () => {
    // Mirrors "binary junk renamed .yaml": malformed syntax breaks js-yaml's
    // parser the same way corrupt file bytes do, producing a code-frame
    // exception (line/column marker plus the raw offending text).
    const notYaml = "name: Broken:\n  nested: value";

    const message = await rejectionMessage(parseLayoutYaml(notYaml));

    expect(message).toBe(unreadableImportMessage("file"));
    expect(message).not.toContain("\n");
    expect(message).not.toContain("^");
    expect(message).not.toContain("nested");
  });

  it("logs the raw parse failure via the debug logger instead of showing it to the user", async () => {
    const debugSpy = vi
      .spyOn(importDebug, "validation")
      .mockImplementation(() => {});
    const notYaml = "name: Broken:\n  nested: value";

    await expect(parseLayoutYaml(notYaml)).rejects.toThrow();

    expect(debugSpy).toHaveBeenCalledWith(
      "Layout file parse failed: %O",
      expect.anything(),
    );
  });

  it("rejects YAML that parses but is not a layout with the shared invalid-format message, no raw Zod issue list", async () => {
    const notALayout = "foo: bar\nbaz: 123\n";

    const message = await rejectionMessage(parseLayoutYaml(notALayout));

    expect(message).toBe(INVALID_LAYOUT_FORMAT_MESSAGE);
    expect(message).not.toContain(",");
    expect(message).not.toContain(":");
  });

  it("logs the raw validation failure via the debug logger instead of showing it to the user", async () => {
    const debugSpy = vi
      .spyOn(importDebug, "validation")
      .mockImplementation(() => {});
    const notALayout = "foo: bar\nbaz: 123\n";

    await expect(parseLayoutYaml(notALayout)).rejects.toThrow();

    expect(debugSpy).toHaveBeenCalledWith(
      "Layout validation failed: %O",
      expect.anything(),
    );
  });

  it("names the field in plain language for a single invalid field", async () => {
    const deviceType = createTestDeviceType({ slug: "test-device" });
    const device = createTestDevice({
      device_type: "test-device",
      position: 10,
    });
    const layout = createTestLayout({
      racks: [createTestRack({ devices: [device] })],
      device_types: [deviceType],
    });

    // Break only the device's position type; everything else stays valid so
    // this hits the single-issue path, not the generic fallback.
    const broken = {
      ...layout,
      racks: [
        {
          ...layout.racks[0],
          devices: [{ ...device, position: "not-a-number" }],
        },
      ],
    };
    const yamlText = await serializeToYaml(broken);

    const message = await rejectionMessage(parseLayoutYaml(yamlText));

    expect(message).toBe("Device position must be a number");
    expect(message).not.toContain("racks.0.devices.0.position");
  });

  it("preserves an existing custom schema message without the dotted path prefix", async () => {
    const layout = createTestLayout({
      racks: [createTestRack({ height: 42 })],
    });

    // Break only the rack height; everything else stays valid.
    const broken = {
      ...layout,
      racks: [{ ...layout.racks[0], height: 150 }],
    };
    const yamlText = await serializeToYaml(broken);

    const message = await rejectionMessage(parseLayoutYaml(yamlText));

    expect(message).toBe("Height cannot exceed 100U");
    expect(message).not.toContain("racks.0.height");
  });
});
