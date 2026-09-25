import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseLayoutYaml,
  parseLayoutYamlWithImages,
  serializeLayoutToYaml,
} from "$lib/utils/yaml";
import {
  unreadableImportMessage,
  INVALID_LAYOUT_FORMAT_MESSAGE,
} from "$lib/utils/import-errors";
import { yieldToMain } from "$lib/utils/yield";
import { createTestLayout } from "./factories";

vi.mock("$lib/utils/yield", () => ({ yieldToMain: vi.fn() }));

/**
 * The load pipeline yields between parse, schema validation and image decode
 * so a large layout does not block the main thread in one task (#3368).
 */
describe("YAML load pipeline yields between stages (#3368)", () => {
  const releases: Array<() => void> = [];

  beforeEach(() => {
    releases.length = 0;
    vi.mocked(yieldToMain).mockReset();
  });

  function holdYields(): void {
    vi.mocked(yieldToMain).mockImplementation(
      () => new Promise<void>((resolve) => releases.push(resolve)),
    );
  }

  it("does not run schema validation until the post-parse yield resumes", async () => {
    holdYields();
    let settled = false;
    const result = parseLayoutYaml("foo: bar\nbaz: 123\n").then(
      () => "resolved",
      (error: Error) => error.message,
    );
    void result.finally(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(yieldToMain).toHaveBeenCalledTimes(1));
    expect(settled).toBe(false);

    releases.forEach((release) => release());
    expect(await result).toBe(INVALID_LAYOUT_FORMAT_MESSAGE);
  });

  it("reports a parse failure the same way, before any yield", async () => {
    holdYields();

    await expect(
      parseLayoutYaml("name: Broken:\n  nested: value"),
    ).rejects.toThrow(unreadableImportMessage("file"));
    expect(yieldToMain).not.toHaveBeenCalled();
  });

  it("yields after parse, between the schema passes, and before image decode", async () => {
    vi.mocked(yieldToMain).mockResolvedValue(undefined);
    const yaml = await serializeLayoutToYaml(
      createTestLayout({ name: "Yielding" }),
    );

    const { layout } = await parseLayoutYamlWithImages(yaml);

    expect(layout.name).toBe("Yielding");
    expect(yieldToMain).toHaveBeenCalledTimes(3);
  });
});
