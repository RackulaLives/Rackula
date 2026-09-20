import { describe, it, expect } from "vitest";
import { storageWriteFailureMessage } from "$lib/utils/storage-errors";

/**
 * #3375: a refused browser write used to surface as "Saved". These lock the
 * three things the replacement copy owes the user -- that it was not saved,
 * why, and what to do -- without asserting the exact wording, which is free to
 * improve.
 */
describe("storageWriteFailureMessage", () => {
  it("says the layout was not saved and points at exporting", () => {
    const message = storageWriteFailureMessage("quota");
    expect(message.toLowerCase()).toContain("not saved");
    expect(message.toLowerCase()).toContain("export");
  });

  it("blames space only when the failure was a full origin", () => {
    expect(storageWriteFailureMessage("quota").toLowerCase()).toContain(
      "space",
    );
    expect(
      storageWriteFailureMessage("unavailable").toLowerCase(),
    ).not.toContain("out of storage space");
  });

  it("names the layout when one is given", () => {
    expect(storageWriteFailureMessage("quota", "Homelab")).toContain(
      '"Homelab"',
    );
  });
});
