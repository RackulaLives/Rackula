import { describe, it, expect } from "vitest";
import { isCommandPaletteShortcut } from "$lib/actions/dispatch";

describe("isCommandPaletteShortcut", () => {
  it("matches Ctrl+K", () => {
    expect(
      isCommandPaletteShortcut(
        new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
      ),
    ).toBe(true);
  });
  it("matches Cmd+K", () => {
    expect(
      isCommandPaletteShortcut(
        new KeyboardEvent("keydown", { key: "k", metaKey: true }),
      ),
    ).toBe(true);
  });
  it("does not match a bare k", () => {
    expect(
      isCommandPaletteShortcut(new KeyboardEvent("keydown", { key: "k" })),
    ).toBe(false);
  });
});
