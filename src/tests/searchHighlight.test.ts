import { describe, it, expect } from "vitest";
import {
  highlightMatch,
  truncateWithEllipsis,
} from "$lib/utils/searchHighlight";

describe("highlightMatch", () => {
  it("returns single non-match segment when query is empty", () => {
    const result = highlightMatch("UniFi Switch 24", "");
    expect(result).toEqual([{ text: "UniFi Switch 24", isMatch: false }]);
  });

  it("returns single non-match segment when no match found", () => {
    const result = highlightMatch("UniFi Switch 24", "Mikrotik");
    expect(result).toEqual([{ text: "UniFi Switch 24", isMatch: false }]);
  });

  it("highlights single match at start of text", () => {
    const result = highlightMatch("UniFi Switch 24", "uni");
    expect(result).toEqual([
      { text: "Uni", isMatch: true },
      { text: "Fi Switch 24", isMatch: false },
    ]);
  });

  it("highlights single match in middle of text", () => {
    const result = highlightMatch("UniFi Switch 24", "switch");
    expect(result).toEqual([
      { text: "UniFi ", isMatch: false },
      { text: "Switch", isMatch: true },
      { text: " 24", isMatch: false },
    ]);
  });

  it("highlights single match at end of text", () => {
    const result = highlightMatch("UniFi Switch 24", "24");
    expect(result).toEqual([
      { text: "UniFi Switch ", isMatch: false },
      { text: "24", isMatch: true },
    ]);
  });

  it("is case-insensitive", () => {
    const result = highlightMatch("UniFi Switch 24", "SWITCH");
    expect(result).toEqual([
      { text: "UniFi ", isMatch: false },
      { text: "Switch", isMatch: true },
      { text: " 24", isMatch: false },
    ]);
  });

  it("preserves original text casing in results", () => {
    const result = highlightMatch("UniFi SWITCH 24", "switch");
    expect(result).toEqual([
      { text: "UniFi ", isMatch: false },
      { text: "SWITCH", isMatch: true },
      { text: " 24", isMatch: false },
    ]);
  });

  it("handles multiple occurrences of match", () => {
    const result = highlightMatch("Switch Switch", "switch");
    expect(result).toEqual([
      { text: "Switch", isMatch: true },
      { text: " ", isMatch: false },
      { text: "Switch", isMatch: true },
    ]);
  });

  it("handles query with whitespace", () => {
    const result = highlightMatch("UniFi Switch 24", "  switch  ");
    expect(result).toEqual([
      { text: "UniFi ", isMatch: false },
      { text: "Switch", isMatch: true },
      { text: " 24", isMatch: false },
    ]);
  });

  it("highlights entire text when full match", () => {
    const result = highlightMatch("Switch", "Switch");
    expect(result).toEqual([{ text: "Switch", isMatch: true }]);
  });
});

describe("truncateWithEllipsis", () => {
  it("returns original text when shorter than max length", () => {
    expect(truncateWithEllipsis("Short", 10)).toBe("Short");
  });

  it("returns original text when exactly max length", () => {
    expect(truncateWithEllipsis("Exactly 10", 10)).toBe("Exactly 10");
  });

  it("truncates text longer than max length", () => {
    expect(truncateWithEllipsis("This is a very long device name", 10)).toBe(
      "This is a ...",
    );
  });

  it("truncates at specified length", () => {
    expect(truncateWithEllipsis("UniFi Switch Pro 48 PoE Gen2", 15)).toBe(
      "UniFi Switch Pr...",
    );
  });

  it("handles empty string", () => {
    expect(truncateWithEllipsis("", 10)).toBe("");
  });

  it("truncates to 30 characters for preview use case", () => {
    const longName = "UniFi Switch Pro 48 Port PoE Generation 2";
    const result = truncateWithEllipsis(longName, 30);
    expect(result).toBe("UniFi Switch Pro 48 Port PoE G...");
    expect(result.length).toBe(33); // 30 + '...'
  });
});
