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
});
