/**
 * Regression guard for #2986: Chromium's showSaveFilePicker rejects
 * parameterised MIME types, so the save blob must use plain "text/yaml"
 * with no charset parameter.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { downloadYamlFile } from "$lib/utils/archive";
import { createTestLayout } from "./factories";

vi.mock("browser-fs-access", () => ({
  fileSave: vi.fn().mockResolvedValue(undefined),
}));

import { fileSave } from "browser-fs-access";

const mockedFileSave = vi.mocked(fileSave);

describe("downloadYamlFile blob MIME type (#2986)", () => {
  beforeEach(() => {
    mockedFileSave.mockClear();
  });

  it("saves the blob with plain text/yaml, no charset parameter", async () => {
    const layout = createTestLayout({ name: "MIME Test" });

    await downloadYamlFile(layout);

    expect(mockedFileSave).toHaveBeenCalledTimes(1);
    const blob = mockedFileSave.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("text/yaml");
  });
});
