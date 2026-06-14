import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "$lib/utils/export/utils";

describe("downloadBlob", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL = vi.fn(() => "blob:mock-url");
    revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    // happy-dom anchors throw on click navigation; suppress the no-op click.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not revoke the object URL synchronously (would race the download)", () => {
    const blob = new Blob(["data"], { type: "text/plain" });

    downloadBlob(blob, "export.txt");

    // The download may begin asynchronously after click(); revoking now would
    // invalidate the URL before the browser fetches it.
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("revokes the object URL on a later tick to free memory", () => {
    const blob = new Blob(["data"], { type: "text/plain" });

    downloadBlob(blob, "export.txt");
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:mock-url");
  });
});
