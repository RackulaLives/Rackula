/**
 * Tests for the shared import/decode failure copy (#2989).
 */

import { describe, it, expect } from "vitest";
import LZString from "lz-string";
import {
  describeValidationIssues,
  unreadableImportMessage,
  INVALID_LAYOUT_FORMAT_MESSAGE,
  type ImportValidationIssue,
} from "$lib/utils/import-errors";
import { parseLayoutYaml } from "$lib/utils/yaml";
import { decodeLayout } from "$lib/utils/share";
import { PowerPortSchema, SlotSchema, DeviceLinkSchema } from "$lib/schemas";

describe("unreadableImportMessage", () => {
  it("names the file for a file-import parse failure", () => {
    expect(unreadableImportMessage("file")).toBe("Could not read layout file");
  });

  it("matches the share-link path's existing curated copy", () => {
    expect(unreadableImportMessage("share-link")).toBe(
      "Could not decode share link",
    );
  });
});

describe("describeValidationIssues", () => {
  it("falls back to the shared invalid-format message for multiple issues, with no comma-joined list", () => {
    const issues: ImportValidationIssue[] = [
      {
        path: ["name"],
        message: "Invalid input: expected string, received undefined",
        code: "invalid_type",
        expected: "string",
      },
      {
        path: ["settings"],
        message: "Invalid input: expected object, received undefined",
        code: "invalid_type",
        expected: "object",
      },
    ];

    const message = describeValidationIssues(issues);

    expect(message).toBe(INVALID_LAYOUT_FORMAT_MESSAGE);
    expect(message).not.toContain(",");
  });

  it("falls back to the shared invalid-format message for zero issues", () => {
    expect(describeValidationIssues([])).toBe(INVALID_LAYOUT_FORMAT_MESSAGE);
  });

  it("preserves an existing custom schema message without the dotted path prefix", () => {
    const message = describeValidationIssues([
      {
        path: ["racks", 0, "height"],
        message: "Height cannot exceed 100U",
        code: "too_big",
      },
    ]);

    expect(message).toBe("Height cannot exceed 100U");
    expect(message).not.toContain("racks.0");
  });

  it("names the field in plain language for a generic type-mismatch issue", () => {
    const message = describeValidationIssues([
      {
        path: ["racks", 0, "devices", 0, "position"],
        message: "Invalid input: expected number, received string",
        code: "invalid_type",
        expected: "number",
      },
    ]);

    expect(message).toBe("Device position must be a number");
    expect(message).not.toContain("racks.0.devices.0.position");
  });

  it("preserves a custom message on an invalid_type field instead of rewriting it from the expected type", () => {
    const message = describeValidationIssues([
      {
        path: ["racks", 0, "width"],
        message: "Width must be 10 or 19 inches",
        code: "invalid_type",
        expected: "number",
      },
    ]);

    expect(message).toBe("Width must be 10 or 19 inches");
    expect(message).not.toContain("must be a number");
  });

  it("preserves a custom message that starts with the same words as a Zod default without matching its full shape", () => {
    const message = describeValidationIssues([
      {
        path: ["racks", 0, "devices", 0, "device_type"],
        message: "Invalid device type: unknown slug",
        code: "invalid_format",
      },
    ]);

    expect(message).toBe("Invalid device type: unknown slug");
  });

  it("replaces Zod's default too-small wording for a bare .min() field with no custom message", () => {
    // PowerPortSchema.name is `z.string().min(1)` with no custom message
    // (src/lib/schemas/index.ts ~319), so Zod 4 ships its own internal
    // wording ("Too small: expected string to have >=1 characters") here.
    const result = PowerPortSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (result.success) return;

    const message = describeValidationIssues(result.error.issues);

    expect(message).not.toContain("Too small");
    expect(message).not.toContain(">=1");
    expect(message.toLowerCase()).toContain("name");
  });

  it("replaces Zod's default too-big wording for a bare .max() field with no custom message", () => {
    // SlotSchema.name is `z.string().max(100)` with no custom message
    // (src/lib/schemas/index.ts ~251).
    const result = SlotSchema.safeParse({
      id: "slot-1",
      name: "x".repeat(101),
      position: { row: 0, col: 0 },
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    const message = describeValidationIssues(result.error.issues);

    expect(message).not.toContain("Too big");
    expect(message).not.toContain("<=100");
    expect(message.toLowerCase()).toContain("name");
  });

  it("replaces Zod's default invalid-URL wording for a bare .url() field with no custom message", () => {
    // DeviceLinkSchema.url is `z.string().url()` with no custom message
    // (src/lib/schemas/index.ts ~367).
    const result = DeviceLinkSchema.safeParse({
      label: "docs",
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    const message = describeValidationIssues(result.error.issues);

    expect(message).not.toContain("Invalid URL");
    expect(message.toLowerCase()).toContain("url");
  });
});

describe("shared helper unifies file-import and share-link copy (#2989 AC4)", () => {
  it("resolves the equivalent underlying failure to the same message on both doors", async () => {
    // File-import: valid YAML, but not shaped like a layout at all.
    let fileMessage = "";
    try {
      await parseLayoutYaml("foo: bar\nbaz: 123\n");
    } catch (error) {
      fileMessage = error instanceof Error ? error.message : String(error);
    }

    // Share-link: valid JSON, but not a recognized share format.
    const encoded = LZString.compressToEncodedURIComponent(
      JSON.stringify({ rs: "not-an-array" }),
    );
    const { error: shareMessage } = decodeLayout(encoded);

    expect(fileMessage).toBe(INVALID_LAYOUT_FORMAT_MESSAGE);
    expect(shareMessage).toBe(INVALID_LAYOUT_FORMAT_MESSAGE);
  });

  it("resolves the equivalent single-field failure to the same message on both doors", async () => {
    // File-import: the parsed document is a list, not an object at all, so
    // schema validation reports exactly one issue (root type mismatch).
    let fileMessage = "";
    try {
      await parseLayoutYaml("- 1\n- 2\n");
    } catch (error) {
      fileMessage = error instanceof Error ? error.message : String(error);
    }

    // Share-link: same underlying failure shape - a JSON array at the root,
    // which is not an object either MinimalLayoutSchema or
    // MinimalLayoutV2Schema can validate.
    const encoded = LZString.compressToEncodedURIComponent(
      JSON.stringify([1, 2, 3]),
    );
    const { error: shareMessage } = decodeLayout(encoded);

    expect(fileMessage).not.toBe(INVALID_LAYOUT_FORMAT_MESSAGE);
    expect(shareMessage).not.toBe(INVALID_LAYOUT_FORMAT_MESSAGE);
    expect(fileMessage).toBe(shareMessage);
  });
});
